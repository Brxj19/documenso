import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  INTEGRATION_API_V1_CALLBACK_MAX_ATTEMPTS,
  INTEGRATION_API_V1_CALLBACK_RETRY_DELAY_MS,
  INTEGRATION_API_V1_CALLBACK_SIGNING_SECRET,
  INTEGRATION_API_V1_CALLBACK_TIMEOUT_MS,
  INTEGRATION_API_V1_CALLBACK_URL_ALLOWLIST,
} from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { sha256 } from '@documenso/lib/universal/crypto';
import { prefixedId } from '@documenso/lib/universal/id';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { parseDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { fetchWithTimeout } from '@documenso/lib/utils/timeout';
import { prisma } from '@documenso/prisma';
import {
  DocumentStatus,
  IntegrationArtifactIntegrityStatus,
  IntegrationCallbackDeliveryState,
  IntegrationSigningArtifactType,
  IntegrationSigningEventSource,
  IntegrationSigningEventType,
  IntegrationSigningRequestStatus,
  type Prisma,
  ReadStatus,
} from '@prisma/client';

import type {
  TIntegrationApiV1ArtifactListResponseSchema,
  TIntegrationApiV1EventSchema,
  TIntegrationApiV1EvidenceResponseSchema,
  TIntegrationApiV1SigningRequestResponseSchema,
} from './schema';
import {
  type TIntegrationApiV1ArtifactSchema,
  type TIntegrationApiV1CallbackDeliverySchema,
  ZIntegrationApiV1MetadataSchema,
} from './schema';
import { getIntegrationApiV1SigningRequest } from './signing-requests';
import { validateAbsoluteAllowlistedUrl } from './url-allowlist';

const MAX_EVENT_METADATA_BYTES = 4_000;
const MAX_CALLBACK_ERROR_SUMMARY_LENGTH = 500;

const CALLBACK_ELIGIBLE_EVENT_TYPES = new Set<IntegrationSigningEventType>([
  IntegrationSigningEventType.REQUEST_CREATED,
  IntegrationSigningEventType.REQUEST_SENT,
  IntegrationSigningEventType.SIGNING_SESSION_CREATED,
  IntegrationSigningEventType.SIGNING_SESSION_LAUNCHED,
  IntegrationSigningEventType.PARTICIPANT_COMPLETED,
  IntegrationSigningEventType.PARTICIPANT_REJECTED,
  IntegrationSigningEventType.REQUEST_PARTIALLY_COMPLETED,
  IntegrationSigningEventType.REQUEST_COMPLETED,
  IntegrationSigningEventType.REQUEST_REJECTED,
  IntegrationSigningEventType.REQUEST_FAILED,
  IntegrationSigningEventType.FINAL_ARTIFACT_CAPTURED,
  IntegrationSigningEventType.RECONCILIATION_REFRESHED,
]);

const clampPositiveInteger = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

const toIsoString = (value?: Date | null) => (value ? value.toISOString() : undefined);

const hashBytesToHex = (value: Uint8Array | string) => Buffer.from(sha256(value)).toString('hex');

const hashJsonPayload = (value: unknown) => hashBytesToHex(JSON.stringify(value));

const ensureSafeMetadata = (value?: Record<string, unknown>) => {
  if (!value) {
    return undefined;
  }

  let normalizedValue: Record<string, unknown>;

  try {
    normalizedValue = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Integration event metadata is invalid.',
    });
  }

  const parsed = ZIntegrationApiV1MetadataSchema.safeParse(normalizedValue);

  if (!parsed.success) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Integration event metadata is invalid.',
    });
  }

  if (Buffer.byteLength(JSON.stringify(parsed.data), 'utf8') > MAX_EVENT_METADATA_BYTES) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Integration event metadata is too large.',
    });
  }

  return parsed.data as Prisma.InputJsonValue;
};

const getCallbackMaxAttempts = () => clampPositiveInteger(INTEGRATION_API_V1_CALLBACK_MAX_ATTEMPTS(), 5);

const getCallbackRetryDelayMs = () => clampPositiveInteger(INTEGRATION_API_V1_CALLBACK_RETRY_DELAY_MS(), 60_000);

const getCallbackTimeoutMs = () => clampPositiveInteger(INTEGRATION_API_V1_CALLBACK_TIMEOUT_MS(), 10_000);

export const validateIntegrationApiV1CallbackUrl = (value?: string | null) =>
  validateAbsoluteAllowlistedUrl({
    value,
    allowlistValues: INTEGRATION_API_V1_CALLBACK_URL_ALLOWLIST(),
    label: 'callback.url',
    allowlistErrorMessage: 'callback.url is not allowlisted for integration callbacks.',
  });

const getRequestCorrelationId = async ({
  tx,
  request,
}: {
  tx: Prisma.TransactionClient;
  request: {
    id: string;
    correlationId: string | null;
  };
}) => {
  if (request.correlationId) {
    return request.correlationId;
  }

  const correlationId = prefixedId('integration_correlation');

  await tx.integrationSigningRequest.update({
    where: {
      id: request.id,
    },
    data: {
      correlationId,
    },
  });

  return correlationId;
};

const buildCertificateMetadata = ({
  envelopeId,
  qrToken,
  completedAt,
  integrityStatus,
}: {
  envelopeId: string;
  qrToken?: string | null;
  completedAt?: Date | null;
  integrityStatus: 'HASH_VERIFIED' | 'HASH_MISMATCH' | 'SIGNATURE_VALIDATION_NOT_AVAILABLE';
}) => ({
  nativeCertificateReference: qrToken ? envelopeId : undefined,
  certificatePdfAvailable: true,
  auditLogPdfAvailable: true,
  signingTimestamp: toIsoString(completedAt),
  verificationStatus: integrityStatus,
});

const toArtifactResponse = (artifact: {
  id: string;
  signingRequestId: string;
  artifactType: IntegrationSigningArtifactType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string;
  integrityStatus: IntegrationArtifactIntegrityStatus;
  capturedAt: Date;
  certificateMetadata: unknown;
}) =>
  ({
    artifactId: artifact.id,
    requestId: artifact.signingRequestId,
    artifactType: artifact.artifactType,
    filename: artifact.filename,
    mimeType: artifact.mimeType as 'application/pdf',
    sizeBytes: artifact.sizeBytes,
    sha256: {
      algorithm: 'SHA-256' as const,
      value: artifact.sha256Hash,
    },
    integrityStatus: artifact.integrityStatus,
    capturedAt: artifact.capturedAt.toISOString(),
    certificateMetadata: artifact.certificateMetadata
      ? (artifact.certificateMetadata as TIntegrationApiV1ArtifactSchema['certificateMetadata'])
      : undefined,
  }) satisfies TIntegrationApiV1ArtifactSchema;

const toCallbackDeliveryResponse = (delivery: {
  id: string;
  eventId: string;
  state: IntegrationCallbackDeliveryState;
  targetUrl: string;
  payloadHash: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  lastHttpStatus: number | null;
  lastErrorSummary: string | null;
  deliveredAt: Date | null;
  lastAttemptCorrelationId: string | null;
}) =>
  ({
    deliveryId: delivery.id,
    eventId: delivery.eventId,
    deliveryState: delivery.state,
    targetUrl: delivery.targetUrl,
    payloadHash: delivery.payloadHash,
    attemptCount: delivery.attemptCount,
    maxAttempts: delivery.maxAttempts,
    nextAttemptAt: delivery.nextAttemptAt.toISOString(),
    lastAttemptAt: toIsoString(delivery.lastAttemptAt),
    lastHttpStatus: delivery.lastHttpStatus ?? undefined,
    lastErrorSummary: delivery.lastErrorSummary ?? undefined,
    deliveredAt: toIsoString(delivery.deliveredAt),
    lastAttemptCorrelationId: delivery.lastAttemptCorrelationId ?? undefined,
  }) satisfies TIntegrationApiV1CallbackDeliverySchema;

const toEventResponse = (event: {
  id: string;
  signingRequestId: string;
  eventType: IntegrationSigningEventType;
  source: IntegrationSigningEventSource;
  correlationId: string;
  requestCorrelationId: string;
  eventTimestamp: Date;
  observedAt: Date;
  signingRequestParticipantId: string | null;
  signingSessionId: string | null;
  actorReference: string | null;
  nativeEnvelopeId: string | null;
  nativeRecipientId: number | null;
  nativeEventReference: string | null;
  statusBefore: IntegrationSigningRequestStatus | null;
  statusAfter: IntegrationSigningRequestStatus | null;
  metadata: unknown;
  participant?: {
    participantId: string;
  } | null;
}) =>
  ({
    eventId: event.id,
    requestId: event.signingRequestId,
    eventType: event.eventType,
    source: event.source,
    correlationId: event.correlationId,
    requestCorrelationId: event.requestCorrelationId,
    eventTimestamp: event.eventTimestamp.toISOString(),
    observedAt: event.observedAt.toISOString(),
    participantId: event.participant?.participantId,
    sessionId: event.signingSessionId ?? undefined,
    actorReference: event.actorReference ?? undefined,
    nativeEnvelopeId: event.nativeEnvelopeId ?? undefined,
    nativeRecipientId: event.nativeRecipientId ?? undefined,
    nativeEventReference: event.nativeEventReference ?? undefined,
    statusBefore: event.statusBefore ?? undefined,
    statusAfter: event.statusAfter ?? undefined,
    metadata: event.metadata ? (event.metadata as TIntegrationApiV1EventSchema['metadata']) : undefined,
  }) satisfies TIntegrationApiV1EventSchema;

const mapRequestStatus = (
  value: TIntegrationApiV1SigningRequestResponseSchema['status'],
): IntegrationSigningRequestStatus => value as IntegrationSigningRequestStatus;

const compareOptionalIsoTimestamps = (left?: string, right?: string) => {
  if (left && right) {
    return left.localeCompare(right);
  }

  if (left) {
    return -1;
  }

  if (right) {
    return 1;
  }

  return 0;
};

const findNativeEventReference = async ({
  envelopeId,
  eventType,
  nativeRecipientId,
}: {
  envelopeId?: string | null;
  eventType: IntegrationSigningEventType;
  nativeRecipientId?: number | null;
}) => {
  if (!envelopeId) {
    return undefined;
  }

  const auditLogs = await prisma.documentAuditLog.findMany({
    where: {
      envelopeId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

  const parsed = auditLogs.map((auditLog) => ({
    id: auditLog.id,
    data: parseDocumentAuditLogData(auditLog),
  }));

  const match = parsed.find(({ data }) => {
    if (
      eventType === IntegrationSigningEventType.PARTICIPANT_COMPLETED &&
      data.type === 'DOCUMENT_RECIPIENT_COMPLETED'
    ) {
      return data.data.recipientId === nativeRecipientId;
    }

    if (eventType === IntegrationSigningEventType.PARTICIPANT_REJECTED && data.type === 'DOCUMENT_RECIPIENT_REJECTED') {
      return data.data.recipientId === nativeRecipientId;
    }

    if (eventType === IntegrationSigningEventType.REQUEST_SENT && data.type === 'DOCUMENT_SENT') {
      return true;
    }

    if (
      (eventType === IntegrationSigningEventType.REQUEST_COMPLETED ||
        eventType === IntegrationSigningEventType.FINAL_ARTIFACT_CAPTURED) &&
      data.type === 'DOCUMENT_COMPLETED'
    ) {
      return true;
    }

    return false;
  });

  return match?.id;
};

const captureFinalArtifact = async ({ tx, requestId }: { tx: Prisma.TransactionClient; requestId: string }) => {
  const existing = await tx.integrationSigningArtifact.findFirst({
    where: {
      signingRequestId: requestId,
      artifactType: IntegrationSigningArtifactType.SIGNED_PDF,
    },
  });

  if (existing) {
    return existing;
  }

  const request = await tx.integrationSigningRequest.findUniqueOrThrow({
    where: {
      id: requestId,
    },
    include: {
      envelope: {
        include: {
          envelopeItems: {
            include: {
              documentData: true,
            },
          },
        },
      },
    },
  });

  const envelope = request.envelope;
  const envelopeItem = envelope?.envelopeItems[0];

  if (!envelope || !envelopeItem?.documentData || envelope.status !== DocumentStatus.COMPLETED) {
    return null;
  }

  const pdfBytes = await getFileServerSide(envelopeItem.documentData);
  const sha256Hash = hashBytesToHex(pdfBytes);

  return await tx.integrationSigningArtifact.create({
    data: {
      id: prefixedId('integration_artifact'),
      signingRequestId: request.id,
      envelopeId: envelope.id,
      envelopeItemId: envelopeItem.id,
      documentDataId: envelopeItem.documentData.id,
      artifactType: IntegrationSigningArtifactType.SIGNED_PDF,
      filename: `${request.title.replace(/\.pdf$/i, '')}_signed.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: pdfBytes.byteLength,
      sha256Hash,
      integrityStatus: IntegrationArtifactIntegrityStatus.HASH_VERIFIED,
      capturedAt: envelope.completedAt ?? new Date(),
      certificateMetadata: buildCertificateMetadata({
        envelopeId: envelope.id,
        qrToken: envelope.qrToken,
        completedAt: envelope.completedAt,
        integrityStatus: 'HASH_VERIFIED',
      }) as Prisma.InputJsonValue,
    },
  });
};

const buildCallbackPayloadTemplate = ({
  request,
  event,
  participantId,
  artifact,
  session,
}: {
  request: {
    id: string;
    correlationId: string;
    clientCorrelationId: string | null;
    callbackCorrelationId: string | null;
  };
  event: {
    id: string;
    eventType: IntegrationSigningEventType;
    eventTimestamp: Date;
    statusAfter: IntegrationSigningRequestStatus | null;
  };
  participantId?: string;
  artifact?: {
    id: string;
    artifactType: IntegrationSigningArtifactType;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sha256Hash: string;
    capturedAt: Date;
  } | null;
  session?: {
    clientState: string | null;
  } | null;
}) => ({
  eventId: event.id,
  eventType: event.eventType,
  requestId: request.id,
  requestCorrelationId: request.correlationId,
  eventTimestamp: event.eventTimestamp.toISOString(),
  requestStatus: event.statusAfter ?? undefined,
  participantId,
  artifact: artifact
    ? {
        artifactId: artifact.id,
        artifactType: artifact.artifactType,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        capturedAt: artifact.capturedAt.toISOString(),
      }
    : undefined,
  finalSha256: artifact
    ? {
        algorithm: 'SHA-256',
        value: artifact.sha256Hash,
      }
    : undefined,
  clientCorrelationId: request.clientCorrelationId ?? undefined,
  callbackCorrelationId: request.callbackCorrelationId ?? undefined,
  clientState: session?.clientState ?? undefined,
});

const createCallbackSignature = ({ timestamp, body, secret }: { timestamp: string; body: string; secret: string }) =>
  createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

export const verifyIntegrationApiV1CallbackSignature = ({
  timestamp,
  body,
  signature,
  secret,
}: {
  timestamp: string;
  body: string;
  signature: string;
  secret: string;
}) => {
  const expected = createCallbackSignature({
    timestamp,
    body,
    secret,
  });

  try {
    return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
};

const queueCallbackDeliveryForEvent = async ({
  tx,
  request,
  event,
  participantId,
  artifact,
  session,
}: {
  tx: Prisma.TransactionClient;
  request: {
    id: string;
    callbackUrl: string | null;
    callbackCorrelationId: string | null;
    clientCorrelationId: string | null;
    correlationId: string;
  };
  event: {
    id: string;
    eventType: IntegrationSigningEventType;
    eventTimestamp: Date;
    statusAfter: IntegrationSigningRequestStatus | null;
  };
  participantId?: string;
  artifact?: {
    id: string;
    artifactType: IntegrationSigningArtifactType;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sha256Hash: string;
    capturedAt: Date;
  } | null;
  session?: {
    clientState: string | null;
  } | null;
}) => {
  const callbackUrl = validateIntegrationApiV1CallbackUrl(request.callbackUrl);

  if (!callbackUrl || !CALLBACK_ELIGIBLE_EVENT_TYPES.has(event.eventType)) {
    return null;
  }

  const existing = await tx.integrationCallbackDelivery.findUnique({
    where: {
      eventId: event.id,
    },
  });

  if (existing) {
    return existing.id;
  }

  const payload = buildCallbackPayloadTemplate({
    request,
    event,
    participantId,
    artifact,
    session,
  });

  const delivery = await tx.integrationCallbackDelivery.create({
    data: {
      id: prefixedId('integration_delivery'),
      signingRequestId: request.id,
      eventId: event.id,
      targetUrl: callbackUrl,
      payload: payload as Prisma.InputJsonValue,
      payloadHash: hashJsonPayload(payload),
      maxAttempts: getCallbackMaxAttempts(),
      nextAttemptAt: new Date(),
    },
  });

  await tx.integrationSigningEvent.create({
    data: {
      id: prefixedId('integration_event'),
      signingRequestId: request.id,
      eventType: IntegrationSigningEventType.CALLBACK_QUEUED,
      source: IntegrationSigningEventSource.CALLBACK,
      correlationId: prefixedId('integration_event_correlation'),
      deduplicationKey: `callback-queued:${event.id}`,
      requestCorrelationId: request.correlationId,
      nativeEnvelopeId: undefined,
      nativeRecipientId: undefined,
      nativeEventReference: event.id,
      actorReference: 'system',
      statusBefore: event.statusAfter ?? undefined,
      statusAfter: event.statusAfter ?? undefined,
      eventTimestamp: new Date(),
      metadata: ensureSafeMetadata({
        deliveryId: delivery.id,
        eventId: event.id,
      }),
    },
  });

  return delivery.id;
};

const recordIntegrationSigningEvent = async ({
  tx,
  request,
  eventType,
  source,
  deduplicationKey,
  eventTimestamp,
  statusBefore,
  statusAfter,
  nativeEnvelopeId,
  nativeRecipientId,
  signingRequestParticipantId,
  signingSessionId,
  actorReference,
  participantId,
  session,
  artifact,
  metadata,
  enqueueDeliveries,
}: {
  tx: Prisma.TransactionClient;
  request: {
    id: string;
    callbackUrl: string | null;
    callbackCorrelationId: string | null;
    clientCorrelationId: string | null;
    correlationId: string;
  };
  eventType: IntegrationSigningEventType;
  source: IntegrationSigningEventSource;
  deduplicationKey: string;
  eventTimestamp: Date;
  statusBefore?: IntegrationSigningRequestStatus;
  statusAfter?: IntegrationSigningRequestStatus;
  nativeEnvelopeId?: string | null;
  nativeRecipientId?: number | null;
  signingRequestParticipantId?: string | null;
  signingSessionId?: string | null;
  actorReference?: string;
  participantId?: string;
  session?: {
    clientState: string | null;
  } | null;
  artifact?: {
    id: string;
    artifactType: IntegrationSigningArtifactType;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sha256Hash: string;
    capturedAt: Date;
  } | null;
  metadata?: Record<string, unknown>;
  enqueueDeliveries: string[];
}) => {
  const existing = await tx.integrationSigningEvent.findFirst({
    where: {
      signingRequestId: request.id,
      deduplicationKey,
    },
  });

  if (existing) {
    return existing;
  }

  const nativeEventReference = await findNativeEventReference({
    envelopeId: nativeEnvelopeId,
    eventType,
    nativeRecipientId,
  });

  const event = await tx.integrationSigningEvent.create({
    data: {
      id: prefixedId('integration_event'),
      signingRequestId: request.id,
      signingRequestParticipantId: signingRequestParticipantId ?? undefined,
      signingSessionId: signingSessionId ?? undefined,
      eventType,
      source,
      correlationId: prefixedId('integration_event_correlation'),
      deduplicationKey,
      requestCorrelationId: request.correlationId,
      nativeEnvelopeId: nativeEnvelopeId ?? undefined,
      nativeRecipientId: nativeRecipientId ?? undefined,
      nativeEventReference,
      actorReference,
      statusBefore,
      statusAfter,
      eventTimestamp,
      metadata: ensureSafeMetadata(metadata),
    },
  });

  const deliveryId = await queueCallbackDeliveryForEvent({
    tx,
    request,
    event,
    participantId,
    artifact,
    session,
  });

  if (deliveryId) {
    enqueueDeliveries.push(deliveryId);
  }

  return event;
};

export const processIntegrationApiV1CallbackDelivery = async ({ deliveryId }: { deliveryId: string }) => {
  const delivery = await prisma.integrationCallbackDelivery.findUnique({
    where: {
      id: deliveryId,
    },
    include: {
      event: true,
      signingRequest: true,
    },
  });

  if (!delivery) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Callback delivery not found.',
    });
  }

  if (delivery.state === IntegrationCallbackDeliveryState.DELIVERED) {
    return delivery.state;
  }

  if (delivery.state === IntegrationCallbackDeliveryState.FAILED_FINAL) {
    return delivery.state;
  }

  const secret = INTEGRATION_API_V1_CALLBACK_SIGNING_SECRET();

  if (!secret) {
    await prisma.integrationCallbackDelivery.update({
      where: {
        id: delivery.id,
      },
      data: {
        state: IntegrationCallbackDeliveryState.FAILED_FINAL,
        lastErrorSummary: 'Callback signing secret is not configured.',
      },
    });

    return IntegrationCallbackDeliveryState.FAILED_FINAL;
  }

  validateIntegrationApiV1CallbackUrl(delivery.targetUrl);

  const attemptNumber = delivery.attemptCount + 1;
  const timestamp = new Date().toISOString();
  const attemptCorrelationId = prefixedId('integration_delivery_attempt');
  const payload = {
    ...(delivery.payload as Record<string, unknown>),
    deliveryAttempt: attemptNumber,
  };
  const body = JSON.stringify(payload);
  const payloadHash = hashBytesToHex(body);
  const signature = createCallbackSignature({
    timestamp,
    body,
    secret,
  });

  await prisma.integrationCallbackDelivery.update({
    where: {
      id: delivery.id,
    },
    data: {
      state: IntegrationCallbackDeliveryState.DELIVERING,
      lastAttemptAt: new Date(),
      lastSignatureTimestamp: timestamp,
      lastAttemptCorrelationId: attemptCorrelationId,
      payloadHash,
    },
  });

  let responseStatus = 0;
  let errorSummary: string | null = null;
  let delivered = false;

  try {
    const response = await fetchWithTimeout(delivery.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Integration-Event-Id': delivery.eventId,
        'X-Integration-Timestamp': timestamp,
        'X-Integration-Signature': signature,
        'X-Integration-Delivery-Id': attemptCorrelationId,
      },
      body,
      redirect: 'manual',
      timeoutMs: getCallbackTimeoutMs(),
    });

    responseStatus = response.status;
    delivered = response.ok;

    if (!response.ok) {
      errorSummary = `Callback returned HTTP ${response.status}.`;
    }
  } catch (error) {
    errorSummary = error instanceof Error ? error.message : 'Callback request failed.';
  }

  const state = delivered
    ? IntegrationCallbackDeliveryState.DELIVERED
    : attemptNumber >= delivery.maxAttempts
      ? IntegrationCallbackDeliveryState.FAILED_FINAL
      : IntegrationCallbackDeliveryState.FAILED_RETRYABLE;

  const nextAttemptAt = delivered ? new Date() : new Date(Date.now() + getCallbackRetryDelayMs());

  await prisma.$transaction(async (tx) => {
    await tx.integrationCallbackDelivery.update({
      where: {
        id: delivery.id,
      },
      data: {
        state,
        attemptCount: attemptNumber,
        nextAttemptAt,
        lastHttpStatus: responseStatus || undefined,
        lastErrorSummary: errorSummary?.slice(0, MAX_CALLBACK_ERROR_SUMMARY_LENGTH) ?? null,
        deliveredAt: delivered ? new Date() : undefined,
      },
    });

    const requestCorrelationId =
      delivery.signingRequest.correlationId ??
      (await getRequestCorrelationId({
        tx,
        request: delivery.signingRequest,
      }));

    await recordIntegrationSigningEvent({
      tx,
      request: {
        id: delivery.signingRequest.id,
        callbackUrl: null,
        callbackCorrelationId: delivery.signingRequest.callbackCorrelationId,
        clientCorrelationId: delivery.signingRequest.clientCorrelationId,
        correlationId: requestCorrelationId,
      },
      eventType: delivered
        ? IntegrationSigningEventType.CALLBACK_DELIVERED
        : IntegrationSigningEventType.CALLBACK_FAILED,
      source: IntegrationSigningEventSource.CALLBACK,
      deduplicationKey: `${delivered ? 'callback-delivered' : 'callback-failed'}:${delivery.id}:${attemptNumber}`,
      eventTimestamp: new Date(),
      statusBefore: delivery.event.statusAfter ?? undefined,
      statusAfter: delivery.event.statusAfter ?? undefined,
      nativeEnvelopeId: delivery.event.nativeEnvelopeId,
      nativeRecipientId: delivery.event.nativeRecipientId,
      actorReference: 'system',
      metadata: {
        deliveryId: delivery.id,
        attemptCount: attemptNumber,
        httpStatus: responseStatus || undefined,
        errorSummary: errorSummary?.slice(0, MAX_CALLBACK_ERROR_SUMMARY_LENGTH) ?? undefined,
      },
      enqueueDeliveries: [],
    });
  });

  return state;
};

export const processDueIntegrationApiV1CallbackDeliveries = async ({ limit = 25 }: { limit?: number } = {}) => {
  const deliveries = await prisma.integrationCallbackDelivery.findMany({
    where: {
      state: {
        in: [IntegrationCallbackDeliveryState.PENDING, IntegrationCallbackDeliveryState.FAILED_RETRYABLE],
      },
      nextAttemptAt: {
        lte: new Date(),
      },
    },
    orderBy: {
      nextAttemptAt: 'asc',
    },
    take: limit,
  });

  const results: Array<{ deliveryId: string; state: IntegrationCallbackDeliveryState }> = [];

  for (const delivery of deliveries) {
    const state = await processIntegrationApiV1CallbackDelivery({
      deliveryId: delivery.id,
    });

    results.push({
      deliveryId: delivery.id,
      state,
    });
  }

  return results;
};

export const reconcileIntegrationApiV1SigningRequest = async ({
  requestId,
  teamId,
  source,
  dryRun = false,
}: {
  requestId: string;
  teamId: number;
  source: IntegrationSigningEventSource;
  dryRun?: boolean;
}) => {
  const request = await prisma.integrationSigningRequest.findFirst({
    where: {
      id: requestId,
      teamId,
    },
    include: {
      envelope: {
        include: {
          recipients: true,
          envelopeItems: {
            include: {
              documentData: true,
            },
          },
        },
      },
      participants: {
        include: {
          nativeRecipient: true,
        },
      },
      sessions: true,
      artifacts: true,
    },
  });

  if (!request) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signing request not found',
    });
  }

  const snapshot = await getIntegrationApiV1SigningRequest({
    requestId,
    teamId,
    skipReconciliation: true,
  });

  const requestStatus = mapRequestStatus(snapshot.status);
  const artifactSource =
    request.artifacts.find((artifact) => artifact.artifactType === IntegrationSigningArtifactType.SIGNED_PDF) ?? null;
  const enqueueDeliveries: string[] = [];

  const result = {
    requestId,
    queuedDeliveryIds: enqueueDeliveries,
    changed: false,
  };

  if (dryRun) {
    return result;
  }

  await prisma.$transaction(async (tx) => {
    const requestCorrelationId = await getRequestCorrelationId({
      tx,
      request,
    });

    const baseRequest = {
      id: request.id,
      callbackUrl: request.callbackUrl,
      callbackCorrelationId: request.callbackCorrelationId,
      clientCorrelationId: request.clientCorrelationId,
      correlationId: requestCorrelationId,
    };

    if (
      request.status !== requestStatus ||
      request.lastReconciledAt === null ||
      request.correlationId !== requestCorrelationId
    ) {
      await tx.integrationSigningRequest.update({
        where: {
          id: request.id,
        },
        data: {
          status: requestStatus,
          correlationId: requestCorrelationId,
          lastReconciledAt: new Date(),
        },
      });

      result.changed = true;
    } else {
      await tx.integrationSigningRequest.update({
        where: {
          id: request.id,
        },
        data: {
          lastReconciledAt: new Date(),
        },
      });
    }

    for (const participantSnapshot of snapshot.participants) {
      const participantRecord = request.participants.find(
        (candidate) => candidate.participantId === participantSnapshot.participantId,
      );

      if (!participantRecord) {
        continue;
      }

      const completedAt = participantSnapshot.completedAt ? new Date(participantSnapshot.completedAt) : null;
      const rejectedAt = participantSnapshot.rejectedAt ? new Date(participantSnapshot.rejectedAt) : null;

      if (
        completedAt?.toISOString() !== participantRecord.completedAt?.toISOString() ||
        rejectedAt?.toISOString() !== participantRecord.rejectedAt?.toISOString()
      ) {
        await tx.integrationSigningRequestParticipant.update({
          where: {
            id: participantRecord.id,
          },
          data: {
            completedAt: completedAt ?? undefined,
            rejectedAt: rejectedAt ?? undefined,
          },
        });

        result.changed = true;
      }
    }

    let artifact = artifactSource;

    if (requestStatus === IntegrationSigningRequestStatus.COMPLETED && !artifact) {
      artifact = await captureFinalArtifact({
        tx,
        requestId: request.id,
      });

      if (artifact) {
        result.changed = true;
      }
    }

    await recordIntegrationSigningEvent({
      tx,
      request: baseRequest,
      eventType: IntegrationSigningEventType.REQUEST_CREATED,
      source: IntegrationSigningEventSource.API,
      deduplicationKey: 'request-created',
      eventTimestamp: request.createdAt,
      statusAfter: IntegrationSigningRequestStatus.READY,
      nativeEnvelopeId: request.envelopeId,
      actorReference: 'api',
      metadata: {
        externalReference: request.externalReference,
      },
      enqueueDeliveries,
    });

    const firstSentRecipient = request.envelope?.recipients
      ?.filter((recipient) => recipient.readStatus !== ReadStatus.NOT_OPENED || recipient.sendStatus !== 'NOT_SENT')
      .sort((left, right) => {
        const leftTime = left.sentAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightTime = right.sentAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

        return leftTime - rightTime;
      })[0];

    if (firstSentRecipient && request.envelope?.status !== DocumentStatus.DRAFT) {
      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.REQUEST_SENT,
        source: IntegrationSigningEventSource.API,
        deduplicationKey: 'request-sent',
        eventTimestamp: firstSentRecipient.sentAt ?? request.updatedAt,
        statusBefore: IntegrationSigningRequestStatus.READY,
        statusAfter:
          requestStatus === IntegrationSigningRequestStatus.PARTIALLY_COMPLETED ||
          requestStatus === IntegrationSigningRequestStatus.COMPLETED
            ? IntegrationSigningRequestStatus.IN_PROGRESS
            : requestStatus,
        nativeEnvelopeId: request.envelopeId,
        actorReference: 'api',
        enqueueDeliveries,
      });
    }

    for (const session of request.sessions) {
      const participant = request.participants.find(
        (candidate) => candidate.id === session.signingRequestParticipantId,
      );

      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.SIGNING_SESSION_CREATED,
        source: IntegrationSigningEventSource.API,
        deduplicationKey: `signing-session-created:${session.id}`,
        eventTimestamp: session.createdAt,
        statusAfter: requestStatus,
        nativeEnvelopeId: request.envelopeId,
        nativeRecipientId: session.nativeRecipientId,
        signingRequestParticipantId: session.signingRequestParticipantId,
        signingSessionId: session.id,
        actorReference: participant?.participantId,
        participantId: participant?.participantId,
        session,
        enqueueDeliveries,
      });

      if (session.launchedAt) {
        await recordIntegrationSigningEvent({
          tx,
          request: baseRequest,
          eventType: IntegrationSigningEventType.SIGNING_SESSION_LAUNCHED,
          source: IntegrationSigningEventSource.SIGNING_SESSION,
          deduplicationKey: `signing-session-launched:${session.id}`,
          eventTimestamp: session.launchedAt,
          statusAfter: requestStatus,
          nativeEnvelopeId: request.envelopeId,
          nativeRecipientId: session.nativeRecipientId,
          signingRequestParticipantId: session.signingRequestParticipantId,
          signingSessionId: session.id,
          actorReference: participant?.participantId,
          participantId: participant?.participantId,
          session,
          enqueueDeliveries,
        });
      }
    }

    const completedParticipants = snapshot.participants
      .filter((participant) => participant.status === 'COMPLETED' && participant.completedAt)
      .sort((left, right) => compareOptionalIsoTimestamps(left.completedAt, right.completedAt));

    for (const participantSnapshot of completedParticipants) {
      const participantRecord = request.participants.find(
        (candidate) => candidate.participantId === participantSnapshot.participantId,
      );

      if (!participantRecord?.nativeRecipientId || !participantSnapshot.completedAt) {
        continue;
      }

      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.PARTICIPANT_COMPLETED,
        source,
        deduplicationKey: `participant-completed:${participantRecord.id}:${participantSnapshot.completedAt}`,
        eventTimestamp: new Date(participantSnapshot.completedAt),
        statusAfter: requestStatus,
        nativeEnvelopeId: request.envelopeId,
        nativeRecipientId: participantRecord.nativeRecipientId,
        signingRequestParticipantId: participantRecord.id,
        actorReference: participantSnapshot.participantId,
        participantId: participantSnapshot.participantId,
        enqueueDeliveries,
      });
    }

    const rejectedParticipants = snapshot.participants
      .filter((participant) => participant.status === 'REJECTED' && participant.rejectedAt)
      .sort((left, right) => compareOptionalIsoTimestamps(left.rejectedAt, right.rejectedAt));

    for (const participantSnapshot of rejectedParticipants) {
      const participantRecord = request.participants.find(
        (candidate) => candidate.participantId === participantSnapshot.participantId,
      );

      if (!participantRecord?.nativeRecipientId || !participantSnapshot.rejectedAt) {
        continue;
      }

      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.PARTICIPANT_REJECTED,
        source,
        deduplicationKey: `participant-rejected:${participantRecord.id}:${participantSnapshot.rejectedAt}`,
        eventTimestamp: new Date(participantSnapshot.rejectedAt),
        statusAfter: IntegrationSigningRequestStatus.REJECTED,
        nativeEnvelopeId: request.envelopeId,
        nativeRecipientId: participantRecord.nativeRecipientId,
        signingRequestParticipantId: participantRecord.id,
        actorReference: participantSnapshot.participantId,
        participantId: participantSnapshot.participantId,
        enqueueDeliveries,
      });
    }

    const firstCompletedAt = completedParticipants[0]?.completedAt;

    if (requestStatus === IntegrationSigningRequestStatus.PARTIALLY_COMPLETED && firstCompletedAt) {
      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.REQUEST_PARTIALLY_COMPLETED,
        source,
        deduplicationKey: 'request-partially-completed',
        eventTimestamp: new Date(firstCompletedAt),
        statusBefore: IntegrationSigningRequestStatus.IN_PROGRESS,
        statusAfter: IntegrationSigningRequestStatus.PARTIALLY_COMPLETED,
        nativeEnvelopeId: request.envelopeId,
        enqueueDeliveries,
      });
    }

    if (requestStatus === IntegrationSigningRequestStatus.COMPLETED && request.envelope?.completedAt) {
      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.REQUEST_COMPLETED,
        source,
        deduplicationKey: `request-completed:${request.envelope.completedAt.toISOString()}`,
        eventTimestamp: request.envelope.completedAt,
        statusBefore:
          completedParticipants.length > 1
            ? IntegrationSigningRequestStatus.PARTIALLY_COMPLETED
            : IntegrationSigningRequestStatus.IN_PROGRESS,
        statusAfter: IntegrationSigningRequestStatus.COMPLETED,
        nativeEnvelopeId: request.envelopeId,
        artifact,
        enqueueDeliveries,
      });
    }

    if (requestStatus === IntegrationSigningRequestStatus.REJECTED && rejectedParticipants[0]?.rejectedAt) {
      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.REQUEST_REJECTED,
        source,
        deduplicationKey: `request-rejected:${rejectedParticipants[0].participantId}:${rejectedParticipants[0].rejectedAt}`,
        eventTimestamp: new Date(rejectedParticipants[0].rejectedAt),
        statusBefore: IntegrationSigningRequestStatus.IN_PROGRESS,
        statusAfter: IntegrationSigningRequestStatus.REJECTED,
        nativeEnvelopeId: request.envelopeId,
        participantId: rejectedParticipants[0].participantId,
        enqueueDeliveries,
      });
    }

    if (requestStatus === IntegrationSigningRequestStatus.FAILED) {
      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.REQUEST_FAILED,
        source: IntegrationSigningEventSource.SYSTEM,
        deduplicationKey: 'request-failed',
        eventTimestamp: request.updatedAt,
        statusAfter: IntegrationSigningRequestStatus.FAILED,
        nativeEnvelopeId: request.envelopeId,
        enqueueDeliveries,
      });
    }

    if (artifact) {
      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.FINAL_ARTIFACT_CAPTURED,
        source: IntegrationSigningEventSource.ENGINE_COMPLETION,
        deduplicationKey: `final-artifact-captured:${artifact.id}`,
        eventTimestamp: artifact.capturedAt,
        statusAfter: requestStatus,
        nativeEnvelopeId: request.envelopeId,
        artifact,
        metadata: {
          artifactId: artifact.id,
        },
        enqueueDeliveries,
      });
    }

    if (source === IntegrationSigningEventSource.RECONCILIATION && result.changed) {
      await recordIntegrationSigningEvent({
        tx,
        request: baseRequest,
        eventType: IntegrationSigningEventType.RECONCILIATION_REFRESHED,
        source,
        deduplicationKey: `reconciliation:${requestStatus}:${artifact?.id ?? 'none'}`,
        eventTimestamp: new Date(),
        statusAfter: requestStatus,
        nativeEnvelopeId: request.envelopeId,
        metadata: {
          repairedState: true,
          artifactCaptured: Boolean(artifact),
        },
        enqueueDeliveries,
      });
    }
  });

  return result;
};

export const getIntegrationApiV1SigningRequestEvidence = async ({
  requestId,
  teamId,
}: {
  requestId: string;
  teamId: number;
}): Promise<TIntegrationApiV1EvidenceResponseSchema> => {
  await reconcileIntegrationApiV1SigningRequest({
    requestId,
    teamId,
    source: IntegrationSigningEventSource.SYSTEM,
  });

  const [request, snapshot] = await Promise.all([
    prisma.integrationSigningRequest.findFirst({
      where: {
        id: requestId,
        teamId,
      },
      include: {
        events: {
          include: {
            participant: true,
          },
          orderBy: [{ eventTimestamp: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
        artifacts: {
          orderBy: {
            capturedAt: 'asc',
          },
        },
        callbackDeliveries: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    }),
    getIntegrationApiV1SigningRequest({
      requestId,
      teamId,
      skipReconciliation: true,
    }),
  ]);

  if (!request?.correlationId) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signing request not found',
    });
  }

  const artifacts = request.artifacts.map(toArtifactResponse);
  const finalArtifact = artifacts.at(-1);

  return {
    requestId: request.id,
    correlationId: request.correlationId,
    clientCorrelationId: request.clientCorrelationId ?? undefined,
    status: snapshot.status,
    timeline: snapshot.timeline,
    events: request.events.map(toEventResponse),
    artifacts,
    finalArtifact,
    finalSha256: finalArtifact?.sha256,
    certificateMetadata: finalArtifact?.certificateMetadata,
    callbacks: {
      deliveries: request.callbackDeliveries.map(toCallbackDeliveryResponse),
    },
    reconciliation: {
      lastReconciledAt: toIsoString(request.lastReconciledAt),
      lastEventObservedAt: toIsoString(request.events.at(-1)?.observedAt),
    },
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    completedAt: snapshot.completedAt,
    rejectedAt: snapshot.rejectedAt,
  };
};

export const getIntegrationApiV1SigningRequestArtifacts = async ({
  requestId,
  teamId,
}: {
  requestId: string;
  teamId: number;
}): Promise<TIntegrationApiV1ArtifactListResponseSchema> => {
  const evidence = await getIntegrationApiV1SigningRequestEvidence({
    requestId,
    teamId,
  });

  if (evidence.status !== 'COMPLETED') {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Completed artifact metadata is only available after the signing request is completed.',
    });
  }

  return {
    requestId: evidence.requestId,
    status: evidence.status,
    artifacts: evidence.artifacts,
  };
};

export const getIntegrationApiV1SigningRequestArtifactDownload = async ({
  requestId,
  artifactId,
  teamId,
}: {
  requestId: string;
  artifactId: string;
  teamId: number;
}) => {
  await reconcileIntegrationApiV1SigningRequest({
    requestId,
    teamId,
    source: IntegrationSigningEventSource.SYSTEM,
  });

  const artifact = await prisma.integrationSigningArtifact.findFirst({
    where: {
      id: artifactId,
      signingRequestId: requestId,
      signingRequest: {
        teamId,
      },
    },
    include: {
      documentData: true,
      signingRequest: true,
    },
  });

  if (!artifact || artifact.signingRequest.status !== IntegrationSigningRequestStatus.COMPLETED) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signed artifact not found.',
    });
  }

  const bytes = await getFileServerSide(artifact.documentData);

  return {
    artifact,
    bytes,
    etag: hashBytesToHex(bytes),
  };
};

export const reconcileIntegrationApiV1SigningRequests = async ({
  dryRun = false,
  limit = 100,
}: {
  dryRun?: boolean;
  limit?: number;
} = {}) => {
  const requests = await prisma.integrationSigningRequest.findMany({
    where: {
      OR: [
        {
          status: {
            in: [
              IntegrationSigningRequestStatus.READY,
              IntegrationSigningRequestStatus.IN_PROGRESS,
              IntegrationSigningRequestStatus.PARTIALLY_COMPLETED,
              IntegrationSigningRequestStatus.COMPLETED,
              IntegrationSigningRequestStatus.REJECTED,
            ],
          },
        },
        {
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000),
          },
        },
      ],
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: limit,
  });

  const results = [];

  for (const request of requests) {
    results.push(
      await reconcileIntegrationApiV1SigningRequest({
        requestId: request.id,
        teamId: request.teamId,
        source: IntegrationSigningEventSource.RECONCILIATION,
        dryRun,
      }),
    );
  }

  return results;
};
