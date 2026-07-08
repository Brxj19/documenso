import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run as sealDocument } from '@documenso/lib/jobs/definitions/internal/seal-document.handler';
import { completeDocumentWithToken } from '@documenso/lib/server-only/document/complete-document-with-token';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import { sha256 } from '@documenso/lib/universal/crypto';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { prisma } from '@documenso/prisma';
import { seedUser } from '@documenso/prisma/seed/users';
import { DocumentDistributionMethod, EnvelopeType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({
  msg: (input: TemplateStringsArray | string, ...values: unknown[]) =>
    Array.isArray(input)
      ? input.reduce((result, part, index) => `${result}${part}${values[index] ?? ''}`, '')
      : String(input),
}));

import {
  getIntegrationApiV1SigningRequestArtifactDownload,
  getIntegrationApiV1SigningRequestArtifacts,
  getIntegrationApiV1SigningRequestEvidence,
  processIntegrationApiV1CallbackDelivery,
  reconcileIntegrationApiV1SigningRequest,
  verifyIntegrationApiV1CallbackSignature,
} from './evidence';
import { createIntegrationApiV1SigningRequest, sendIntegrationApiV1SigningRequest } from './signing-requests';

const examplePdfBuffer = fs.readFileSync(new URL('../../../../assets/example.pdf', import.meta.url));
const remixAppRoot = fileURLToPath(new URL('../../../../apps/remix', import.meta.url));

const requestMetadata: ApiRequestMetadata = {
  requestMetadata: {
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  },
  source: 'apiV1',
  auth: 'api',
  auditUser: {
    id: 1,
    email: 'vitest@example.com',
    name: 'Vitest',
  },
};

const createdUserIds: number[] = [];

const toArrayBuffer = (data: Uint8Array): ArrayBuffer =>
  data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

const createSourceEnvelope = async ({ userId, teamId }: { userId: number; teamId: number }) => {
  const { documentData } = await putPdfFileServerSide({
    name: 'phase-5-source.pdf',
    type: 'application/pdf',
    arrayBuffer: async () => toArrayBuffer(examplePdfBuffer),
  });

  return await createEnvelope({
    userId,
    teamId,
    internalVersion: 1,
    bypassDefaultRecipients: true,
    data: {
      type: EnvelopeType.DOCUMENT,
      title: 'Phase 5 Source Document',
      envelopeItems: [
        {
          title: 'phase-5-source',
          documentDataId: documentData.id,
          order: 1,
        },
      ],
    },
    meta: {
      distributionMethod: DocumentDistributionMethod.NONE,
    },
    requestMetadata,
  });
};

const getSourceHash = async (sourceEnvelope: Awaited<ReturnType<typeof createSourceEnvelope>>) => {
  const sourceBytes = await getFileServerSide(sourceEnvelope.envelopeItems[0].documentData);

  return Buffer.from(sha256(sourceBytes)).toString('hex');
};

const createParticipant = (participantId: string) => ({
  participantId,
  email: `${participantId}@example.com`,
  displayName: participantId.replace(/-/g, ' '),
  role: 'APPROVER' as const,
});

const createRequestPayload = ({
  sourceReference,
  hash,
  idempotencyKey,
  callbackUrl,
}: {
  sourceReference: string;
  hash: string;
  idempotencyKey: string;
  callbackUrl?: string;
}) => ({
  externalReference: `${idempotencyKey}-request`,
  title: 'Generic Evidence Request',
  document: {
    sourceReference,
    filename: 'phase-5-source.pdf',
    mimeType: 'application/pdf' as const,
    contentHash: {
      algorithm: 'SHA-256',
      value: hash,
    },
  },
  participants: [createParticipant('approver-1')],
  stages: [
    {
      order: 1,
      completionPolicy: 'ALL_REQUIRED' as const,
      participantIds: ['approver-1'],
    },
  ],
  idempotencyKey,
  callback: callbackUrl
    ? {
        url: callbackUrl,
      }
    : undefined,
});

const requireFinalArtifact = (evidence: Awaited<ReturnType<typeof getIntegrationApiV1SigningRequestEvidence>>) => {
  const artifact = evidence.finalArtifact;

  expect(artifact).toBeDefined();

  if (!artifact) {
    throw new Error('Expected a final artifact for the completed signing request.');
  }

  return artifact;
};

const createAndActivateSigningRequest = async ({
  idempotencyKey,
  callbackUrl,
}: {
  idempotencyKey: string;
  callbackUrl?: string;
}) => {
  const { user, team } = await seedUser();
  createdUserIds.push(user.id);

  const sourceEnvelope = await createSourceEnvelope({
    userId: user.id,
    teamId: team.id,
  });
  const sourceHash = await getSourceHash(sourceEnvelope);

  const created = await createIntegrationApiV1SigningRequest({
    request: createRequestPayload({
      sourceReference: sourceEnvelope.id,
      hash: sourceHash,
      idempotencyKey,
      callbackUrl,
    }),
    userId: user.id,
    teamId: team.id,
    requestMetadata,
  });

  const activated = await sendIntegrationApiV1SigningRequest({
    requestId: created.requestId,
    teamId: team.id,
    requestMetadata,
  });

  return {
    user,
    team,
    created,
    activated,
  };
};

const completeAndSealSigningRequest = async ({ requestId }: { requestId: string }) => {
  const participant = await prisma.integrationSigningRequestParticipant.findFirstOrThrow({
    where: {
      signingRequestId: requestId,
      participantId: 'approver-1',
    },
    include: {
      nativeRecipient: true,
      signingRequest: true,
    },
  });

  if (!participant.nativeRecipient || !participant.signingRequest.envelopeId) {
    throw new Error('Missing native recipient');
  }

  await completeDocumentWithToken({
    token: participant.nativeRecipient.token,
    id: {
      type: 'envelopeId',
      id: participant.signingRequest.envelopeId,
    },
    requestMetadata: requestMetadata.requestMetadata,
  });

  const signingRequest = await prisma.integrationSigningRequest.findUniqueOrThrow({
    where: {
      id: requestId,
    },
    include: {
      envelope: true,
    },
  });

  if (!signingRequest.envelope) {
    throw new Error('Missing envelope');
  }

  const previousCwd = process.cwd();

  process.chdir(remixAppRoot);

  try {
    await sealDocument({
      payload: {
        documentId: Number(signingRequest.envelope.secondaryId.replace('document_', '')),
        requestMetadata: requestMetadata.requestMetadata,
      },
      io: {
        runTask: async (_cacheKey, callback) => await callback(),
        triggerJob: async () => undefined,
        logger: console,
        wait: async () => undefined,
      },
    });
  } finally {
    process.chdir(previousCwd);
  }
};

beforeEach(() => {
  process.env.INTEGRATION_API_V1_ENABLED = 'true';
  process.env.INTEGRATION_API_V1_RETURN_URL_ALLOWLIST = 'http://localhost:3000,http://127.0.0.1:3000';
  process.env.INTEGRATION_API_V1_CALLBACK_SIGNING_SECRET = 'phase-5-local-secret';
  process.env.INTEGRATION_API_V1_CALLBACK_URL_ALLOWLIST = 'http://127.0.0.1:3999';
  process.env.INTEGRATION_API_V1_CALLBACK_RETRY_DELAY_MS = '1';
});

afterEach(async () => {
  delete process.env.INTEGRATION_API_V1_ENABLED;
  delete process.env.INTEGRATION_API_V1_RETURN_URL_ALLOWLIST;
  delete process.env.INTEGRATION_API_V1_CALLBACK_SIGNING_SECRET;
  delete process.env.INTEGRATION_API_V1_CALLBACK_URL_ALLOWLIST;
  delete process.env.INTEGRATION_API_V1_CALLBACK_RETRY_DELAY_MS;

  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({
      where: {
        id: {
          in: createdUserIds.splice(0),
        },
      },
    });
  }
});

describe('integration evidence and callbacks', () => {
  it('captures the final artifact, computes SHA-256 from signed bytes, and dedupes reconciliation events', async () => {
    const { team, created } = await createAndActivateSigningRequest({
      idempotencyKey: 'phase-5-evidence',
    });

    await completeAndSealSigningRequest({
      requestId: created.requestId,
    });

    await reconcileIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
      source: 'ENGINE_COMPLETION',
    });
    await reconcileIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
      source: 'ENGINE_COMPLETION',
    });

    const evidence = await getIntegrationApiV1SigningRequestEvidence({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(evidence.status).toBe('COMPLETED');
    expect(evidence.finalArtifact).toBeDefined();
    expect(evidence.finalSha256?.value).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.events.filter((event) => event.eventType === 'PARTICIPANT_COMPLETED')).toHaveLength(1);
    expect(evidence.events.filter((event) => event.eventType === 'REQUEST_COMPLETED')).toHaveLength(1);
    expect(evidence.events.filter((event) => event.eventType === 'FINAL_ARTIFACT_CAPTURED')).toHaveLength(1);

    const artifact = requireFinalArtifact(evidence);
    const download = await getIntegrationApiV1SigningRequestArtifactDownload({
      requestId: created.requestId,
      artifactId: artifact.artifactId,
      teamId: team.id,
    });

    const downloadedHash = Buffer.from(sha256(download.bytes)).toString('hex');
    const tamperedBytes = Uint8Array.from(download.bytes);
    tamperedBytes[0] = tamperedBytes[0] === 0 ? 1 : 0;
    const tamperedHash = Buffer.from(sha256(tamperedBytes)).toString('hex');

    expect(downloadedHash).toBe(artifact.sha256.value);
    expect(tamperedHash).not.toBe(artifact.sha256.value);
  });

  it('queues callbacks once, signs payloads, and records retry failures before success', async () => {
    const callbackRequests: Array<{
      headers: HeadersInit | undefined;
      body: string;
    }> = [];

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.startsWith('http://127.0.0.1:3999')) {
        callbackRequests.push({
          headers: init?.headers,
          body: String(init?.body ?? ''),
        });

        return Promise.resolve(
          new Response(callbackRequests.length === 1 ? 'retry me' : 'ok', {
            status: callbackRequests.length === 1 ? 500 : 200,
          }),
        );
      }

      return Promise.resolve(new Response('ok', { status: 200 }));
    });

    try {
      const { team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'phase-5-callbacks',
        callbackUrl: 'http://127.0.0.1:3999',
      });

      await completeAndSealSigningRequest({
        requestId: created.requestId,
      });

      await reconcileIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
        source: 'ENGINE_COMPLETION',
      });

      const deliveries = await prisma.integrationCallbackDelivery.findMany({
        where: {
          signingRequestId: created.requestId,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      expect(deliveries.length).toBeGreaterThan(0);
      expect(new Set(deliveries.map((delivery) => delivery.eventId)).size).toBe(deliveries.length);

      const trackedDelivery = deliveries[0];

      if (!trackedDelivery) {
        throw new Error('Expected at least one queued callback delivery.');
      }

      const firstPass = await processIntegrationApiV1CallbackDelivery({
        deliveryId: trackedDelivery.id,
      });

      expect(firstPass).toBe('FAILED_RETRYABLE');
      expect(callbackRequests).toHaveLength(1);

      const firstHeaders = callbackRequests[0]?.headers as Record<string, string> | undefined;
      const firstRequestBody = callbackRequests[0]?.body;

      expect(firstRequestBody).toBeDefined();

      expect(
        verifyIntegrationApiV1CallbackSignature({
          timestamp: String(firstHeaders?.['X-Integration-Timestamp']),
          body: firstRequestBody ?? '',
          signature: String(firstHeaders?.['X-Integration-Signature']),
          secret: 'phase-5-local-secret',
        }),
      ).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const secondPass = await processIntegrationApiV1CallbackDelivery({
        deliveryId: trackedDelivery.id,
      });

      expect(secondPass).toBe('DELIVERED');

      const thirdPass = await processIntegrationApiV1CallbackDelivery({
        deliveryId: trackedDelivery.id,
      });

      expect(thirdPass).toBe('DELIVERED');
      expect(callbackRequests).toHaveLength(2);

      const evidence = await getIntegrationApiV1SigningRequestEvidence({
        requestId: created.requestId,
        teamId: team.id,
      });

      const deliveryEvidence = evidence.callbacks.deliveries.find(
        (delivery) => delivery.deliveryId === trackedDelivery.id,
      );

      expect(deliveryEvidence?.attemptCount).toBe(2);
      expect(deliveryEvidence?.deliveryState).toBe('DELIVERED');
      expect(evidence.events.filter((event) => event.eventType === 'CALLBACK_FAILED')).toHaveLength(1);
      expect(evidence.events.filter((event) => event.eventType === 'CALLBACK_DELIVERED')).toHaveLength(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('rejects artifact metadata for non-completed requests and hides cross-team access', async () => {
    const active = await createAndActivateSigningRequest({
      idempotencyKey: 'phase-5-incomplete',
    });

    await expect(
      getIntegrationApiV1SigningRequestArtifacts({
        requestId: active.created.requestId,
        teamId: active.team.id,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });

    const other = await createAndActivateSigningRequest({
      idempotencyKey: 'phase-5-other-team',
    });

    await completeAndSealSigningRequest({
      requestId: other.created.requestId,
    });

    await reconcileIntegrationApiV1SigningRequest({
      requestId: other.created.requestId,
      teamId: other.team.id,
      source: 'ENGINE_COMPLETION',
    });

    const evidence = await getIntegrationApiV1SigningRequestEvidence({
      requestId: other.created.requestId,
      teamId: other.team.id,
    });
    const artifact = requireFinalArtifact(evidence);

    await expect(
      getIntegrationApiV1SigningRequestArtifactDownload({
        requestId: other.created.requestId,
        artifactId: artifact.artifactId,
        teamId: active.team.id,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
