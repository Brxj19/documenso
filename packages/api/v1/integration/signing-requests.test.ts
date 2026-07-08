import fs from 'node:fs';
import { completeDocumentWithToken } from '@documenso/lib/server-only/document/complete-document-with-token';
import { rejectDocumentWithToken } from '@documenso/lib/server-only/document/reject-document-with-token';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import { sha256 } from '@documenso/lib/universal/crypto';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { prisma } from '@documenso/prisma';
import { seedUser } from '@documenso/prisma/seed/users';
import { DocumentDistributionMethod, DocumentStatus, EnvelopeType, SendStatus } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createIntegrationApiV1SigningRequest,
  getIntegrationApiV1SigningRequest,
  sendIntegrationApiV1SigningRequest,
} from './signing-requests';

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
    name: 'phase-3-source.pdf',
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
      title: 'Phase 3 Source Document',
      envelopeItems: [
        {
          title: 'phase-3-source',
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

const createParticipant = (participantId: string, role: 'APPROVER' | 'VIEWER' = 'APPROVER') => ({
  participantId,
  email: `${participantId}@example.com`,
  displayName: participantId.replace(/-/g, ' '),
  role,
});

const createRequestPayload = ({
  sourceReference,
  hash,
  participants,
  stages,
  idempotencyKey = 'phase-3-idempotency-key',
  title = 'Provider Neutral Request',
}: {
  sourceReference: string;
  hash: string;
  participants: Array<ReturnType<typeof createParticipant>>;
  stages: Array<{ order: number; participantIds: string[]; completionPolicy?: 'ALL_REQUIRED' }>;
  idempotencyKey?: string;
  title?: string;
}) => ({
  externalReference: `${idempotencyKey}-request`,
  title,
  document: {
    sourceReference,
    filename: 'phase-3-source.pdf',
    mimeType: 'application/pdf' as const,
    contentHash: {
      algorithm: 'SHA-256',
      value: hash,
    },
  },
  participants,
  stages: stages.map((stage) => ({
    ...stage,
    completionPolicy: 'ALL_REQUIRED' as const,
  })),
  idempotencyKey,
});

const getSourceHash = async (sourceEnvelope: Awaited<ReturnType<typeof createSourceEnvelope>>) => {
  const sourceBytes = await getFileServerSide(sourceEnvelope.envelopeItems[0].documentData);

  return Buffer.from(sha256(sourceBytes)).toString('hex');
};

const createAndActivateSigningRequest = async ({
  participants,
  stages,
  idempotencyKey,
}: {
  participants: Array<ReturnType<typeof createParticipant>>;
  stages: Array<{ order: number; participantIds: string[]; completionPolicy?: 'ALL_REQUIRED' }>;
  idempotencyKey: string;
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
      participants,
      stages,
      idempotencyKey,
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

const completeParticipant = async ({ requestId, participantId }: { requestId: string; participantId: string }) => {
  const participant = await prisma.integrationSigningRequestParticipant.findFirstOrThrow({
    where: {
      signingRequestId: requestId,
      participantId,
    },
    include: {
      nativeRecipient: true,
      signingRequest: true,
    },
  });

  if (!participant.nativeRecipient || !participant.signingRequest.envelopeId) {
    throw new Error(`Missing native recipient for ${participantId}`);
  }

  await completeDocumentWithToken({
    token: participant.nativeRecipient.token,
    id: {
      type: 'envelopeId',
      id: participant.signingRequest.envelopeId,
    },
    requestMetadata: requestMetadata.requestMetadata,
  });
};

const rejectParticipant = async ({ requestId, participantId }: { requestId: string; participantId: string }) => {
  const participant = await prisma.integrationSigningRequestParticipant.findFirstOrThrow({
    where: {
      signingRequestId: requestId,
      participantId,
    },
    include: {
      nativeRecipient: true,
      signingRequest: true,
    },
  });

  if (!participant.nativeRecipient || !participant.signingRequest.envelopeId) {
    throw new Error(`Missing native recipient for ${participantId}`);
  }

  await rejectDocumentWithToken({
    token: participant.nativeRecipient.token,
    id: {
      type: 'envelopeId',
      id: participant.signingRequest.envelopeId,
    },
    reason: 'Rejected in Phase 3 test',
    requestMetadata: requestMetadata.requestMetadata,
  });
};

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
    const sourceHash = await getSourceHash(sourceEnvelope);

    const response = await createIntegrationApiV1SigningRequest({
      request: createRequestPayload({
        sourceReference: sourceEnvelope.id,
        hash: sourceHash,
        participants: [
          createParticipant('approver-1'),
          createParticipant('approver-2'),
          createParticipant('viewer-1', 'VIEWER'),
        ],
        stages: [
          {
            order: 1,
            participantIds: ['approver-1'],
          },
          {
            order: 2,
            participantIds: ['approver-2'],
          },
        ],
      }),
      userId: user.id,
      teamId: team.id,
      requestMetadata,
    });

    expect(response.idempotentReplay).toBe(false);
    expect(response.status).toBe('READY');
    expect(response.nativeDocument?.status).toBe('DRAFT');
    expect(response.stages).toEqual([
      expect.objectContaining({
        order: 1,
        nativeSigningOrder: 1,
        completionPolicy: 'ALL_REQUIRED',
        status: 'WAITING',
        blockedReason: 'REQUEST_NOT_ACTIVE',
        participantIds: ['approver-1'],
      }),
      expect.objectContaining({
        order: 2,
        nativeSigningOrder: 2,
        completionPolicy: 'ALL_REQUIRED',
        status: 'WAITING',
        blockedReason: 'REQUEST_NOT_ACTIVE',
        participantIds: ['approver-2'],
      }),
    ]);
    expect(response.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participantId: 'approver-1',
          stageOrder: 1,
          stageStatus: 'WAITING',
          stageCompletionPolicy: 'ALL_REQUIRED',
          status: 'WAITING',
        }),
      ]),
    );

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
    const sourceHash = await getSourceHash(sourceEnvelope);

    const request = {
      sourceReference: sourceEnvelope.id,
      hash: sourceHash,
      participants: [createParticipant('approver-1')],
      stages: [{ order: 1, participantIds: ['approver-1'] }],
    };

    const firstResponse = await createIntegrationApiV1SigningRequest({
      request: createRequestPayload(request),
      userId: user.id,
      teamId: team.id,
      requestMetadata,
    });

    const replayResponse = await createIntegrationApiV1SigningRequest({
      request: createRequestPayload(request),
      userId: user.id,
      teamId: team.id,
      requestMetadata,
    });

    await expect(
      createIntegrationApiV1SigningRequest({
        request: createRequestPayload({
          ...request,
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
          participants: [createParticipant('approver-1')],
          stages: [{ order: 1, participantIds: ['approver-1'] }],
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

  it('activates sequential requests and unlocks later stages only after prior stages complete', async () => {
    const { team, activated, created } = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-1'), createParticipant('approver-2')],
      stages: [
        { order: 1, participantIds: ['approver-1'] },
        { order: 2, participantIds: ['approver-2'] },
      ],
      idempotencyKey: 'phase-3-sequential',
    });

    expect(activated.status).toBe('IN_PROGRESS');
    expect(activated.stages).toEqual([
      expect.objectContaining({ order: 1, status: 'ACTIVE', isActive: true }),
      expect.objectContaining({ order: 2, status: 'BLOCKED', blockedReason: 'PREVIOUS_STAGE_INCOMPLETE' }),
    ]);
    expect(activated.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: 'approver-1', status: 'AVAILABLE', isBlocked: false }),
        expect.objectContaining({
          participantId: 'approver-2',
          status: 'WAITING',
          isBlocked: true,
          blockedReason: 'PREVIOUS_STAGE_INCOMPLETE',
        }),
      ]),
    );

    const replayedActivation = await sendIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
      requestMetadata,
    });

    expect(replayedActivation.status).toBe('IN_PROGRESS');

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-1',
    });

    const afterFirstCompletion = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(afterFirstCompletion.status).toBe('PARTIALLY_COMPLETED');
    expect(afterFirstCompletion.stages).toEqual([
      expect.objectContaining({ order: 1, status: 'COMPLETED' }),
      expect.objectContaining({ order: 2, status: 'ACTIVE', isActive: true }),
    ]);
    expect(afterFirstCompletion.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: 'approver-1', status: 'COMPLETED' }),
        expect.objectContaining({ participantId: 'approver-2', status: 'AVAILABLE', isBlocked: false }),
      ]),
    );

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-2',
    });

    const completed = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(completed.status).toBe('COMPLETED');
    expect(completed.stages.every((stage) => stage.status === 'COMPLETED')).toBe(true);
  });

  it('keeps parallel stage participants available together and reports partial completion', async () => {
    const { team, created, activated } = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-1'), createParticipant('approver-2')],
      stages: [{ order: 1, participantIds: ['approver-1', 'approver-2'] }],
      idempotencyKey: 'phase-3-parallel',
    });

    expect(activated.status).toBe('IN_PROGRESS');
    expect(activated.stages).toEqual([expect.objectContaining({ order: 1, status: 'ACTIVE', isActive: true })]);
    expect(activated.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participantId: 'approver-1',
          status: 'AVAILABLE',
          nativeSigningOrder: 1,
        }),
        expect.objectContaining({
          participantId: 'approver-2',
          status: 'AVAILABLE',
          nativeSigningOrder: 1,
        }),
      ]),
    );

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-1',
    });

    const partiallyCompleted = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(partiallyCompleted.status).toBe('PARTIALLY_COMPLETED');
    expect(partiallyCompleted.stages).toEqual([expect.objectContaining({ order: 1, status: 'PARTIALLY_COMPLETED' })]);

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-2',
    });

    const completed = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(completed.status).toBe('COMPLETED');
  });

  it('handles hybrid sequential to parallel to sequential routing', async () => {
    const { team, created, activated } = await createAndActivateSigningRequest({
      participants: [
        createParticipant('approver-1'),
        createParticipant('approver-2'),
        createParticipant('approver-3'),
        createParticipant('approver-4'),
      ],
      stages: [
        { order: 1, participantIds: ['approver-1'] },
        { order: 2, participantIds: ['approver-2', 'approver-3'] },
        { order: 3, participantIds: ['approver-4'] },
      ],
      idempotencyKey: 'phase-3-hybrid',
    });

    expect(activated.stages).toEqual([
      expect.objectContaining({ order: 1, status: 'ACTIVE' }),
      expect.objectContaining({ order: 2, status: 'BLOCKED', blockedReason: 'PREVIOUS_STAGE_INCOMPLETE' }),
      expect.objectContaining({ order: 3, status: 'BLOCKED', blockedReason: 'PREVIOUS_STAGE_INCOMPLETE' }),
    ]);

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-1',
    });

    const afterStageOne = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(afterStageOne.stages).toEqual([
      expect.objectContaining({ order: 1, status: 'COMPLETED' }),
      expect.objectContaining({ order: 2, status: 'ACTIVE' }),
      expect.objectContaining({ order: 3, status: 'BLOCKED', blockedReason: 'PREVIOUS_STAGE_INCOMPLETE' }),
    ]);

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-2',
    });

    const afterFirstParallelCompletion = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(afterFirstParallelCompletion.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ order: 2, status: 'PARTIALLY_COMPLETED' }),
        expect.objectContaining({ order: 3, status: 'BLOCKED', blockedReason: 'PREVIOUS_STAGE_INCOMPLETE' }),
      ]),
    );

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-3',
    });

    const afterParallelStage = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(afterParallelStage.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ order: 2, status: 'COMPLETED' }),
        expect.objectContaining({ order: 3, status: 'ACTIVE' }),
      ]),
    );

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-4',
    });

    const completed = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(completed.status).toBe('COMPLETED');
  });

  it('maps participant rejection to the normalized rejected status', async () => {
    const { team, created } = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-1'), createParticipant('approver-2')],
      stages: [
        { order: 1, participantIds: ['approver-1'] },
        { order: 2, participantIds: ['approver-2'] },
      ],
      idempotencyKey: 'phase-3-rejection',
    });

    await rejectParticipant({
      requestId: created.requestId,
      participantId: 'approver-1',
    });

    const rejected = await getIntegrationApiV1SigningRequest({
      requestId: created.requestId,
      teamId: team.id,
    });

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.stages).toEqual([
      expect.objectContaining({ order: 1, status: 'REJECTED' }),
      expect.objectContaining({ order: 2, status: 'BLOCKED', blockedReason: 'REQUEST_TERMINATED' }),
    ]);
    expect(rejected.participants).toEqual(
      expect.arrayContaining([expect.objectContaining({ participantId: 'approver-1', status: 'REJECTED' })]),
    );
  });
});
