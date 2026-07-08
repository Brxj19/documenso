import fs from 'node:fs';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import { sha256 } from '@documenso/lib/universal/crypto';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { prisma } from '@documenso/prisma';
import { seedUser } from '@documenso/prisma/seed/users';
import { DocumentDistributionMethod, DocumentStatus, EnvelopeType, SendStatus } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

import { createIntegrationApiV1SigningRequest, getIntegrationApiV1SigningRequest } from './signing-requests';

const examplePdfBuffer = fs.readFileSync(new URL('../../../../assets/example.pdf', import.meta.url));

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
    name: 'phase-2-source.pdf',
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
      title: 'Phase 2 Source Document',
      envelopeItems: [
        {
          title: 'phase-2-source',
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

const createRequestPayload = ({
  sourceReference,
  hash,
  idempotencyKey = 'phase-2-idempotency-key',
  title = 'Provider Neutral Request',
}: {
  sourceReference: string;
  hash: string;
  idempotencyKey?: string;
  title?: string;
}) => ({
  externalReference: 'phase-2-request-001',
  title,
  document: {
    sourceReference,
    filename: 'phase-2-source.pdf',
    mimeType: 'application/pdf' as const,
    contentHash: {
      algorithm: 'SHA-256',
      value: hash,
    },
  },
  participants: [
    {
      participantId: 'signer-1',
      email: 'signer.one@example.com',
      displayName: 'Signer One',
      role: 'SIGNER' as const,
    },
    {
      participantId: 'approver-1',
      email: 'approver.one@example.com',
      displayName: 'Approver One',
      role: 'APPROVER' as const,
    },
    {
      participantId: 'viewer-1',
      email: 'viewer.one@example.com',
      displayName: 'Viewer One',
      role: 'VIEWER' as const,
    },
  ],
  stages: [
    {
      order: 1,
      participantIds: ['signer-1'],
    },
    {
      order: 2,
      participantIds: ['approver-1'],
    },
  ],
  idempotencyKey,
});

afterEach(async () => {
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

describe('integration signing requests', () => {
  it('creates a ready signing request without sending the native document', async () => {
    const { user, team } = await seedUser();
    createdUserIds.push(user.id);

    const sourceEnvelope = await createSourceEnvelope({
      userId: user.id,
      teamId: team.id,
    });
    const sourceBytes = await getFileServerSide(sourceEnvelope.envelopeItems[0].documentData);
    const sourceHash = Buffer.from(sha256(sourceBytes)).toString('hex');

    const response = await createIntegrationApiV1SigningRequest({
      request: createRequestPayload({
        sourceReference: sourceEnvelope.id,
        hash: sourceHash,
      }),
      userId: user.id,
      teamId: team.id,
      requestMetadata,
    });

    expect(response.idempotentReplay).toBe(false);
    expect(response.status).toBe('READY');
    expect(response.nativeDocument?.status).toBe('DRAFT');
    expect(response.stages).toEqual([
      {
        order: 1,
        nativeSigningOrder: 1,
        participantIds: ['signer-1'],
      },
      {
        order: 2,
        nativeSigningOrder: 2,
        participantIds: ['approver-1'],
      },
    ]);

    const createdEnvelope = await prisma.envelope.findFirstOrThrow({
      where: {
        id: response.nativeDocument?.envelopeId,
      },
      include: {
        recipients: true,
      },
    });

    expect(createdEnvelope.status).toBe(DocumentStatus.DRAFT);
    expect(createdEnvelope.recipients).toHaveLength(3);
    expect(createdEnvelope.recipients.every((recipient) => recipient.sendStatus === SendStatus.NOT_SENT)).toBe(true);
    expect(createdEnvelope.recipients.every((recipient) => recipient.signedAt === null)).toBe(true);
  });

  it('replays the same idempotency key and rejects a conflicting payload', async () => {
    const { user, team } = await seedUser();
    createdUserIds.push(user.id);

    const sourceEnvelope = await createSourceEnvelope({
      userId: user.id,
      teamId: team.id,
    });
    const sourceBytes = await getFileServerSide(sourceEnvelope.envelopeItems[0].documentData);
    const sourceHash = Buffer.from(sha256(sourceBytes)).toString('hex');

    const firstResponse = await createIntegrationApiV1SigningRequest({
      request: createRequestPayload({
        sourceReference: sourceEnvelope.id,
        hash: sourceHash,
      }),
      userId: user.id,
      teamId: team.id,
      requestMetadata,
    });

    const replayResponse = await createIntegrationApiV1SigningRequest({
      request: createRequestPayload({
        sourceReference: sourceEnvelope.id,
        hash: sourceHash,
      }),
      userId: user.id,
      teamId: team.id,
      requestMetadata,
    });

    await expect(
      createIntegrationApiV1SigningRequest({
        request: createRequestPayload({
          sourceReference: sourceEnvelope.id,
          hash: sourceHash,
          title: 'Changed Payload Title',
        }),
        userId: user.id,
        teamId: team.id,
        requestMetadata,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(replayResponse.idempotentReplay).toBe(true);
    expect(replayResponse.requestId).toBe(firstResponse.requestId);
  });

  it('rejects a mismatched source hash before creating any integration request record', async () => {
    const { user, team } = await seedUser();
    createdUserIds.push(user.id);

    const sourceEnvelope = await createSourceEnvelope({
      userId: user.id,
      teamId: team.id,
    });

    await expect(
      createIntegrationApiV1SigningRequest({
        request: createRequestPayload({
          sourceReference: sourceEnvelope.id,
          hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        }),
        userId: user.id,
        teamId: team.id,
        requestMetadata,
      }),
    ).rejects.toMatchObject({
      message: 'The supplied SHA-256 hash does not match the source document bytes.',
    });

    const createdRequests = await prisma.integrationSigningRequest.count({
      where: {
        teamId: team.id,
      },
    });

    expect(createdRequests).toBe(0);
  });

  it('returns the normalized request status view model', async () => {
    const { user, team } = await seedUser();
    createdUserIds.push(user.id);

    const sourceEnvelope = await createSourceEnvelope({
      userId: user.id,
      teamId: team.id,
    });
    const sourceBytes = await getFileServerSide(sourceEnvelope.envelopeItems[0].documentData);
    const sourceHash = Buffer.from(sha256(sourceBytes)).toString('hex');

    const created = await createIntegrationApiV1SigningRequest({
      request: createRequestPayload({
        sourceReference: sourceEnvelope.id,
        hash: sourceHash,
      }),
      userId: user.id,
      teamId: team.id,
      requestMetadata,
    });

    const response = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(response.status).toBe('READY');
    expect(response.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participantId: 'signer-1',
          status: 'NOT_STARTED',
          stageOrder: 1,
        }),
        expect.objectContaining({
          participantId: 'approver-1',
          status: 'NOT_STARTED',
          stageOrder: 2,
        }),
        expect.objectContaining({
          participantId: 'viewer-1',
          status: 'NOT_REQUIRED',
        }),
      ]),
    );
  });
});
