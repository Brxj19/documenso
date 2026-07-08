import { Buffer } from 'node:buffer';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import { getEnvelopeById } from '@documenso/lib/server-only/envelope/get-envelope-by-id';
import { sha256 } from '@documenso/lib/universal/crypto';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { prefixedId } from '@documenso/lib/universal/id';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { mapSecondaryIdToDocumentId } from '@documenso/lib/utils/envelope';
import { prisma } from '@documenso/prisma';
import {
  DocumentDistributionMethod,
  DocumentSigningOrder,
  DocumentStatus,
  EnvelopeType,
  IntegrationSigningRequestStatus,
  Prisma,
  RecipientRole,
  SigningStatus,
} from '@prisma/client';

import type {
  TIntegrationApiV1CreateSigningRequestResponseSchema,
  TIntegrationApiV1ParticipantStatusSchema,
  TIntegrationApiV1SigningRequestResponseSchema,
  TIntegrationApiV1SigningRequestSchema,
  TIntegrationApiV1StatusSchema,
} from './schema';

type GetIntegrationSigningRequestOptions = {
  requestId: string;
  teamId: number;
};

type CreateIntegrationSigningRequestOptions = {
  request: TIntegrationApiV1SigningRequestSchema;
  userId: number;
  teamId: number;
  requestMetadata: ApiRequestMetadata;
};

type ManagedSourceReference =
  | {
      type: 'envelopeId';
      id: string;
    }
  | {
      type: 'documentId';
      id: number;
    }
  | {
      type: 'templateId';
      id: number;
    };

const SOURCE_ENVELOPE_ID_REGEX = /^envelope_.{2,}$/;
const SOURCE_DOCUMENT_ID_REGEX = /^document_(\d+)$/;
const SOURCE_TEMPLATE_ID_REGEX = /^template_(\d+)$/;

const resolveManagedSourceReference = (sourceReference: string): ManagedSourceReference => {
  if (SOURCE_ENVELOPE_ID_REGEX.test(sourceReference)) {
    return {
      type: 'envelopeId',
      id: sourceReference,
    };
  }

  const documentIdMatch = sourceReference.match(SOURCE_DOCUMENT_ID_REGEX);

  if (documentIdMatch) {
    return {
      type: 'documentId',
      id: Number(documentIdMatch[1]),
    };
  }

  const templateIdMatch = sourceReference.match(SOURCE_TEMPLATE_ID_REGEX);

  if (templateIdMatch) {
    return {
      type: 'templateId',
      id: Number(templateIdMatch[1]),
    };
  }

  throw new AppError(AppErrorCode.INVALID_BODY, {
    message:
      'document.sourceReference must reference an existing Documenso-managed source envelope using an envelope_, document_, or template_ identifier.',
  });
};

const toArrayBuffer = (data: Uint8Array): ArrayBuffer =>
  data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

const canonicalizeFingerprintValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeFingerprintValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalizeFingerprintValue(nestedValue)]),
    );
  }

  return value;
};

const createRequestFingerprint = (request: TIntegrationApiV1SigningRequestSchema) => {
  const payload = canonicalizeFingerprintValue({
    ...request,
    idempotencyKey: undefined,
  });

  return Buffer.from(sha256(JSON.stringify(payload))).toString('hex');
};

const getSourceHashValue = (documentBytes: Uint8Array) => Buffer.from(sha256(documentBytes)).toString('hex');

const getParticipantStageOrderMap = (request: TIntegrationApiV1SigningRequestSchema) =>
  new Map(
    request.stages.flatMap((stage) =>
      stage.participantIds.map((participantId) => [participantId, stage.order] as const),
    ),
  );

const buildCreateEnvelopeRecipients = (request: TIntegrationApiV1SigningRequestSchema) => {
  const participantStageOrder = getParticipantStageOrderMap(request);

  return request.participants.map((participant) => ({
    email: participant.email.trim().toLowerCase(),
    name: participant.displayName ?? participant.email,
    role: participant.role as RecipientRole,
    signingOrder: participantStageOrder.get(participant.participantId),
  }));
};

const reserveIntegrationSigningRequest = async ({
  request,
  requestFingerprint,
  sourceEnvelopeId,
  teamId,
  userId,
  verifiedContentHash,
}: {
  request: TIntegrationApiV1SigningRequestSchema;
  requestFingerprint: string;
  sourceEnvelopeId: string;
  teamId: number;
  userId: number;
  verifiedContentHash: string;
}) => {
  const requestId = prefixedId('integration_request');

  const createData = {
    id: requestId,
    userId,
    teamId,
    sourceEnvelopeId,
    sourceReference: request.document.sourceReference,
    sourceFilename: request.document.filename,
    sourceMimeType: request.document.mimeType,
    verifiedContentHash,
    sourceMetadata: request.document.metadata as Prisma.InputJsonValue | undefined,
    externalReference: request.externalReference,
    title: request.title,
    status: IntegrationSigningRequestStatus.DRAFT,
    requestFingerprint,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
    expiresAt: request.expiresAt,
    metadata: request.metadata as Prisma.InputJsonValue | undefined,
    callbackUrl: request.callback?.url,
    callbackCorrelationId: request.callback?.correlationId,
    callbackMetadata: request.callback?.metadata as Prisma.InputJsonValue | undefined,
  } satisfies Prisma.IntegrationSigningRequestUncheckedCreateInput;

  try {
    const created = await prisma.integrationSigningRequest.create({
      data: createData,
    });

    return {
      isReplay: false,
      requestId: created.id,
    };
  } catch (error) {
    if (request.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.integrationSigningRequest.findFirst({
        where: {
          teamId,
          idempotencyKey: request.idempotencyKey,
        },
      });

      if (!existing) {
        throw error;
      }

      if (existing.requestFingerprint !== requestFingerprint) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'The supplied idempotency key is already associated with a different signing-request payload.',
          statusCode: 409,
        });
      }

      return {
        isReplay: true,
        requestId: existing.id,
      };
    }

    throw error;
  }
};

const getActionableRecipients = (
  recipients: Array<{
    role: RecipientRole;
    signingStatus: SigningStatus;
    signingOrder: number | null;
  }>,
) =>
  recipients.filter(
    (recipient) => recipient.role === RecipientRole.SIGNER || recipient.role === RecipientRole.APPROVER,
  );

const getNormalizedStatus = ({
  currentStatus,
  envelopeStatus,
  expiresAt,
  recipients,
}: {
  currentStatus: IntegrationSigningRequestStatus;
  envelopeStatus?: DocumentStatus;
  expiresAt?: Date | null;
  recipients: Array<{
    role: RecipientRole;
    signingStatus: SigningStatus;
    signingOrder: number | null;
  }>;
}): TIntegrationApiV1StatusSchema => {
  if (currentStatus === IntegrationSigningRequestStatus.FAILED) {
    return 'FAILED';
  }

  if (envelopeStatus === DocumentStatus.CANCELLED) {
    return 'CANCELLED';
  }

  if (envelopeStatus === DocumentStatus.REJECTED) {
    return 'REJECTED';
  }

  if (envelopeStatus === DocumentStatus.COMPLETED) {
    return 'COMPLETED';
  }

  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return 'EXPIRED';
  }

  if (!envelopeStatus) {
    return currentStatus === IntegrationSigningRequestStatus.DRAFT ? 'DRAFT' : 'READY';
  }

  if (envelopeStatus === DocumentStatus.PENDING) {
    const actionableRecipients = getActionableRecipients(recipients);
    const signedActionableCount = actionableRecipients.filter(
      (recipient) => recipient.signingStatus === SigningStatus.SIGNED,
    ).length;

    if (signedActionableCount > 0) {
      return 'PARTIALLY_COMPLETED';
    }

    return 'IN_PROGRESS';
  }

  return 'READY';
};

const getCurrentActiveSigningOrder = (
  recipients: Array<{
    role: RecipientRole;
    signingStatus: SigningStatus;
    signingOrder: number | null;
  }>,
) => {
  const pendingActionableRecipients = getActionableRecipients(recipients)
    .filter((recipient) => recipient.signingStatus === SigningStatus.NOT_SIGNED)
    .map((recipient) => recipient.signingOrder)
    .filter((signingOrder): signingOrder is number => signingOrder !== null)
    .sort((left, right) => left - right);

  return pendingActionableRecipients[0] ?? null;
};

const getParticipantStatus = ({
  participantRole,
  recipient,
  envelopeStatus,
  currentActiveSigningOrder,
}: {
  participantRole: RecipientRole;
  recipient?: {
    signingStatus: SigningStatus;
    signingOrder: number | null;
  };
  envelopeStatus?: DocumentStatus;
  currentActiveSigningOrder: number | null;
}): TIntegrationApiV1ParticipantStatusSchema => {
  if (participantRole === RecipientRole.CC || participantRole === RecipientRole.VIEWER) {
    return 'NOT_REQUIRED';
  }

  if (!recipient || envelopeStatus === DocumentStatus.DRAFT || !envelopeStatus) {
    return 'NOT_STARTED';
  }

  if (recipient.signingStatus === SigningStatus.REJECTED) {
    return 'REJECTED';
  }

  if (recipient.signingStatus === SigningStatus.SIGNED) {
    return 'COMPLETED';
  }

  if (
    envelopeStatus === DocumentStatus.PENDING &&
    recipient.signingOrder !== null &&
    currentActiveSigningOrder !== null &&
    recipient.signingOrder > currentActiveSigningOrder
  ) {
    return 'WAITING_FOR_TURN';
  }

  return 'IN_PROGRESS';
};

const toIsoString = (value?: Date | null) => (value ? value.toISOString() : undefined);

const buildSigningRequestResponse = async ({
  requestId,
  teamId,
}: GetIntegrationSigningRequestOptions): Promise<TIntegrationApiV1SigningRequestResponseSchema> => {
  const integrationRequest = await prisma.integrationSigningRequest.findFirst({
    where: {
      id: requestId,
      teamId,
    },
    include: {
      envelope: {
        include: {
          recipients: {
            orderBy: {
              id: 'asc',
            },
          },
        },
      },
      stages: {
        orderBy: {
          order: 'asc',
        },
      },
      participants: {
        include: {
          stage: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });

  if (!integrationRequest) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signing request not found',
    });
  }

  const envelopeRecipients = integrationRequest.envelope?.recipients ?? [];
  const currentActiveSigningOrder = getCurrentActiveSigningOrder(envelopeRecipients);
  const normalizedStatus = getNormalizedStatus({
    currentStatus: integrationRequest.status,
    envelopeStatus: integrationRequest.envelope?.status,
    expiresAt: integrationRequest.expiresAt,
    recipients: envelopeRecipients,
  });

  if (integrationRequest.status !== normalizedStatus) {
    await prisma.integrationSigningRequest.update({
      where: {
        id: integrationRequest.id,
      },
      data: {
        status: normalizedStatus as IntegrationSigningRequestStatus,
      },
    });
  }

  const nativeRecipientsById = new Map(envelopeRecipients.map((recipient) => [recipient.id, recipient] as const));

  const participants = integrationRequest.participants.map((participant) => {
    const nativeRecipient = participant.nativeRecipientId
      ? nativeRecipientsById.get(participant.nativeRecipientId)
      : undefined;

    const participantStatus = getParticipantStatus({
      participantRole: participant.role,
      recipient: nativeRecipient
        ? {
            signingStatus: nativeRecipient.signingStatus,
            signingOrder: nativeRecipient.signingOrder,
          }
        : undefined,
      envelopeStatus: integrationRequest.envelope?.status,
      currentActiveSigningOrder,
    });

    return {
      participantId: participant.participantId,
      externalParticipantId: participant.externalParticipantId ?? undefined,
      displayName: participant.displayName ?? undefined,
      email: participant.email,
      role: participant.role as TIntegrationApiV1SigningRequestResponseSchema['participants'][number]['role'],
      status: participantStatus,
      stageOrder: participant.stage?.order ?? undefined,
      nativeSigningOrder: participant.nativeSigningOrder ?? undefined,
      completedAt: toIsoString(nativeRecipient?.signedAt),
      rejectedAt: toIsoString(participant.rejectedAt),
      metadata: (participant.metadata ?? undefined) as
        | TIntegrationApiV1SigningRequestResponseSchema['participants'][number]['metadata']
        | undefined,
    };
  });

  return {
    requestId: integrationRequest.id,
    externalReference: integrationRequest.externalReference,
    title: integrationRequest.title,
    status: normalizedStatus,
    document: {
      sourceReference: integrationRequest.sourceReference,
      filename: integrationRequest.sourceFilename,
      mimeType: 'application/pdf',
      verifiedContentHash: {
        algorithm: 'SHA-256',
        value: integrationRequest.verifiedContentHash,
      },
      metadata: (integrationRequest.sourceMetadata ?? undefined) as
        | TIntegrationApiV1SigningRequestResponseSchema['document']['metadata']
        | undefined,
    },
    nativeDocument: integrationRequest.envelope
      ? {
          envelopeId: integrationRequest.envelope.id,
          documentId:
            integrationRequest.envelope.type === EnvelopeType.DOCUMENT
              ? mapSecondaryIdToDocumentId(integrationRequest.envelope.secondaryId)
              : undefined,
          status: integrationRequest.envelope.status,
        }
      : undefined,
    expiresAt: toIsoString(integrationRequest.expiresAt),
    correlationId: integrationRequest.correlationId ?? undefined,
    metadata: (integrationRequest.metadata ?? undefined) as
      | TIntegrationApiV1SigningRequestResponseSchema['metadata']
      | undefined,
    stages: integrationRequest.stages.map((stage) => ({
      order: stage.order,
      nativeSigningOrder: stage.nativeSigningOrder,
      participantIds: integrationRequest.participants
        .filter((participant) => participant.stageId === stage.id)
        .map((participant) => participant.participantId),
    })),
    participants,
    createdAt: integrationRequest.createdAt.toISOString(),
    updatedAt: integrationRequest.updatedAt.toISOString(),
    completedAt: toIsoString(integrationRequest.envelope?.completedAt),
    rejectedAt: toIsoString(integrationRequest.participants.find((participant) => participant.rejectedAt)?.rejectedAt),
  };
};

export const getIntegrationApiV1SigningRequest = async ({ requestId, teamId }: GetIntegrationSigningRequestOptions) => {
  return await buildSigningRequestResponse({
    requestId,
    teamId,
  });
};

export const createIntegrationApiV1SigningRequest = async ({
  request,
  userId,
  teamId,
  requestMetadata,
}: CreateIntegrationSigningRequestOptions): Promise<TIntegrationApiV1CreateSigningRequestResponseSchema> => {
  if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'expiresAt must be in the future.',
    });
  }

  const managedSourceReference = resolveManagedSourceReference(request.document.sourceReference);
  const sourceEnvelope = await getEnvelopeById({
    id: managedSourceReference,
    type: null,
    userId,
    teamId,
  });

  if (sourceEnvelope.envelopeItems.length !== 1) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'document.sourceReference must resolve to a single-PDF source document.',
    });
  }

  const sourceEnvelopeItem = sourceEnvelope.envelopeItems[0];

  if (!sourceEnvelopeItem?.documentData) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Source document bytes could not be found.',
    });
  }

  const sourceDocumentBytes = await getFileServerSide(sourceEnvelopeItem.documentData);
  const verifiedContentHash = getSourceHashValue(sourceDocumentBytes);

  if (verifiedContentHash !== request.document.contentHash.value) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'The supplied SHA-256 hash does not match the source document bytes.',
    });
  }

  const requestFingerprint = createRequestFingerprint(request);
  const reservedRequest = await reserveIntegrationSigningRequest({
    request,
    requestFingerprint,
    sourceEnvelopeId: sourceEnvelope.id,
    teamId,
    userId,
    verifiedContentHash,
  });

  if (reservedRequest.isReplay) {
    const existingRequest = await getIntegrationApiV1SigningRequest({
      requestId: reservedRequest.requestId,
      teamId,
    });

    return {
      ...existingRequest,
      idempotentReplay: true,
    };
  }

  let createdEnvelopeId: string | null = null;

  try {
    const { documentData } = await putPdfFileServerSide({
      name: request.document.filename,
      type: 'application/pdf',
      arrayBuffer: async () => toArrayBuffer(sourceDocumentBytes),
    });

    const createdEnvelope = await createEnvelope({
      userId,
      teamId,
      internalVersion: 1,
      bypassDefaultRecipients: true,
      data: {
        type: EnvelopeType.DOCUMENT,
        title: request.title,
        externalId: request.externalReference,
        visibility: sourceEnvelope.visibility,
        envelopeItems: [
          {
            title: request.document.filename.replace(/\.pdf$/i, ''),
            documentDataId: documentData.id,
            order: 1,
          },
        ],
        recipients: buildCreateEnvelopeRecipients(request),
      },
      meta: {
        timezone: sourceEnvelope.documentMeta?.timezone ?? undefined,
        dateFormat: sourceEnvelope.documentMeta?.dateFormat ?? undefined,
        language: sourceEnvelope.documentMeta?.language ?? undefined,
        typedSignatureEnabled: sourceEnvelope.documentMeta?.typedSignatureEnabled ?? true,
        uploadSignatureEnabled: sourceEnvelope.documentMeta?.uploadSignatureEnabled ?? true,
        drawSignatureEnabled: sourceEnvelope.documentMeta?.drawSignatureEnabled ?? true,
        distributionMethod: DocumentDistributionMethod.NONE,
        signingOrder: request.stages.length > 1 ? DocumentSigningOrder.SEQUENTIAL : DocumentSigningOrder.PARALLEL,
      },
      requestMetadata,
    });

    createdEnvelopeId = createdEnvelope.id;

    const stageIdByOrder = new Map<number, string>();
    const stageOrderByParticipantId = getParticipantStageOrderMap(request);
    const nativeRecipientsByEmail = new Map(
      createdEnvelope.recipients.map((recipient) => [recipient.email.trim().toLowerCase(), recipient] as const),
    );

    await prisma.$transaction(async (tx) => {
      await tx.integrationSigningRequest.update({
        where: {
          id: reservedRequest.requestId,
        },
        data: {
          envelopeId: createdEnvelope.id,
          status: IntegrationSigningRequestStatus.READY,
        },
      });

      for (const stage of request.stages) {
        const createdStage = await tx.integrationSigningRequestStage.create({
          data: {
            id: prefixedId('integration_stage'),
            signingRequestId: reservedRequest.requestId,
            order: stage.order,
            nativeSigningOrder: stage.order,
          },
        });

        stageIdByOrder.set(stage.order, createdStage.id);
      }

      for (const participant of request.participants) {
        const stageOrder = stageOrderByParticipantId.get(participant.participantId);
        const nativeRecipient = nativeRecipientsByEmail.get(participant.email.trim().toLowerCase());

        await tx.integrationSigningRequestParticipant.create({
          data: {
            id: prefixedId('integration_participant'),
            signingRequestId: reservedRequest.requestId,
            stageId: stageOrder ? stageIdByOrder.get(stageOrder) : undefined,
            participantId: participant.participantId,
            externalParticipantId: participant.externalParticipantId,
            displayName: participant.displayName,
            email: participant.email.trim().toLowerCase(),
            role: participant.role as RecipientRole,
            metadata: participant.metadata as Prisma.InputJsonValue | undefined,
            nativeRecipientId: nativeRecipient?.id,
            nativeSigningOrder: nativeRecipient?.signingOrder ?? stageOrder,
          },
        });
      }
    });
  } catch (error) {
    await prisma.integrationSigningRequest
      .update({
        where: {
          id: reservedRequest.requestId,
        },
        data: {
          status: IntegrationSigningRequestStatus.FAILED,
          envelopeId: createdEnvelopeId ?? undefined,
        },
      })
      .catch(() => null);

    throw error;
  }

  const createdRequest = await getIntegrationApiV1SigningRequest({
    requestId: reservedRequest.requestId,
    teamId,
  });

  return {
    ...createdRequest,
    idempotentReplay: false,
  };
};
