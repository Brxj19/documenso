import fs from 'node:fs';
import { completeDocumentWithToken } from '@documenso/lib/server-only/document/complete-document-with-token';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import { sha256 } from '@documenso/lib/universal/crypto';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { prisma } from '@documenso/prisma';
import { seedUser } from '@documenso/prisma/seed/users';
import { DocumentDistributionMethod, EnvelopeType, SigningStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntegrationApiV1SigningRequest, sendIntegrationApiV1SigningRequest } from './signing-requests';
import {
  assertIntegrationSigningSessionTokenAccess,
  createIntegrationApiV1SigningSession,
  getIntegrationSigningSessionCompletionRedirectUrl,
  getIntegrationSigningSessionLaunchRedirectUrl,
  validateIntegrationApiV1ReturnUrl,
} from './signing-sessions';

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
    name: 'phase-4-source.pdf',
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
      title: 'Phase 4 Source Document',
      envelopeItems: [
        {
          title: 'phase-4-source',
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

const createParticipant = (participantId: string) => ({
  participantId,
  email: `${participantId}@example.com`,
  displayName: participantId.replace(/-/g, ' '),
  role: 'APPROVER' as const,
});

const createRequestPayload = ({
  sourceReference,
  hash,
  participants,
  stages,
  idempotencyKey,
}: {
  sourceReference: string;
  hash: string;
  participants: Array<ReturnType<typeof createParticipant>>;
  stages: Array<{ order: number; participantIds: string[] }>;
  idempotencyKey: string;
}) => ({
  externalReference: `${idempotencyKey}-request`,
  title: 'Generic Signing Session Request',
  document: {
    sourceReference,
    filename: 'phase-4-source.pdf',
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
  stages: Array<{ order: number; participantIds: string[] }>;
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

beforeEach(() => {
  process.env.INTEGRATION_API_V1_ENABLED = 'true';
  process.env.INTEGRATION_API_V1_RETURN_URL_ALLOWLIST = 'http://localhost:3000,http://127.0.0.1:3000';
});

afterEach(async () => {
  delete process.env.INTEGRATION_API_V1_ENABLED;
  delete process.env.INTEGRATION_API_V1_RETURN_URL_ALLOWLIST;

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

describe('integration signing sessions', () => {
  it('accepts allowlisted return urls and rejects unsafe ones', () => {
    expect(validateIntegrationApiV1ReturnUrl('http://localhost:3000/return?step=1')).toBe(
      'http://localhost:3000/return?step=1',
    );

    expect(() => validateIntegrationApiV1ReturnUrl('javascript:alert(1)')).toThrowError(
      'returnUrl must use http or https.',
    );
    expect(() => validateIntegrationApiV1ReturnUrl('https://evil.example.com/return')).toThrowError(
      'returnUrl is not allowlisted for integration signing sessions.',
    );
  });

  it('creates a redirect signing session for an active actionable participant', async () => {
    const { team, created } = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-1'), createParticipant('approver-2')],
      stages: [
        { order: 1, participantIds: ['approver-1'] },
        { order: 2, participantIds: ['approver-2'] },
      ],
      idempotencyKey: 'phase-4-session-create',
    });

    const session = await createIntegrationApiV1SigningSession({
      requestId: created.requestId,
      participantId: 'approver-1',
      teamId: team.id,
      request: {
        mode: 'REDIRECT',
        returnUrl: 'http://localhost:3000/integration/return',
        clientState: 'client-state-1',
        ttlSeconds: 600,
      },
    });

    expect(session.mode).toBe('REDIRECT');
    expect(session.requestStatus).toBe('IN_PROGRESS');
    expect(session.participantStatus).toBe('AVAILABLE');
    expect(session.returnUrl).toBe('http://localhost:3000/integration/return');
    expect(session.launchUrl).toContain(`/sign/integration/${session.sessionId}`);

    const launchRedirectUrl = await getIntegrationSigningSessionLaunchRedirectUrl({
      sessionId: session.sessionId,
    });

    expect(launchRedirectUrl).toContain('/sign/');
    expect(launchRedirectUrl).toContain(`integrationSessionId=${session.sessionId}`);
  });

  it('rejects blocked, completed, cross-request, and unsupported session creation attempts', async () => {
    const sequential = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-1'), createParticipant('approver-2')],
      stages: [
        { order: 1, participantIds: ['approver-1'] },
        { order: 2, participantIds: ['approver-2'] },
      ],
      idempotencyKey: 'phase-4-session-rejects',
    });

    await expect(
      createIntegrationApiV1SigningSession({
        requestId: sequential.created.requestId,
        participantId: 'approver-2',
        teamId: sequential.team.id,
        request: {
          mode: 'REDIRECT',
        },
      }),
    ).rejects.toThrowError('Participant is not currently actionable for signing.');

    await completeParticipant({
      requestId: sequential.created.requestId,
      participantId: 'approver-1',
    });

    await expect(
      createIntegrationApiV1SigningSession({
        requestId: sequential.created.requestId,
        participantId: 'approver-1',
        teamId: sequential.team.id,
        request: {
          mode: 'REDIRECT',
        },
      }),
    ).rejects.toThrowError('Participant is not currently actionable for signing.');

    const secondRequest = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-3')],
      stages: [{ order: 1, participantIds: ['approver-3'] }],
      idempotencyKey: 'phase-4-session-second-request',
    });

    await expect(
      createIntegrationApiV1SigningSession({
        requestId: sequential.created.requestId,
        participantId: 'approver-3',
        teamId: sequential.team.id,
        request: {
          mode: 'REDIRECT',
        },
      }),
    ).rejects.toThrowError('Participant not found');

    await expect(
      createIntegrationApiV1SigningSession({
        requestId: secondRequest.created.requestId,
        participantId: 'approver-3',
        teamId: secondRequest.team.id,
        request: {
          mode: 'EMBED',
        },
      }),
    ).rejects.toThrowError('Integration signing sessions currently support REDIRECT mode only.');
  });

  it('scopes a session to the native recipient token and refuses expired launches', async () => {
    const { team, created } = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-1')],
      stages: [{ order: 1, participantIds: ['approver-1'] }],
      idempotencyKey: 'phase-4-session-scope',
    });

    const session = await createIntegrationApiV1SigningSession({
      requestId: created.requestId,
      participantId: 'approver-1',
      teamId: team.id,
      request: {
        mode: 'REDIRECT',
      },
    });

    const participant = await prisma.integrationSigningRequestParticipant.findFirstOrThrow({
      where: {
        signingRequestId: created.requestId,
        participantId: 'approver-1',
      },
      include: {
        nativeRecipient: true,
      },
    });

    await expect(
      assertIntegrationSigningSessionTokenAccess({
        sessionId: session.sessionId,
        token: `${participant.nativeRecipient?.token}-wrong`,
      }),
    ).rejects.toThrowError('Signing session not found');

    await prisma.integrationSigningSession.update({
      where: {
        id: session.sessionId,
      },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await expect(
      getIntegrationSigningSessionLaunchRedirectUrl({
        sessionId: session.sessionId,
      }),
    ).rejects.toThrowError('Signing session has expired.');
  });

  it('creates safe repeat sessions without mutating native recipient completion state', async () => {
    const { team, created } = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-1')],
      stages: [{ order: 1, participantIds: ['approver-1'] }],
      idempotencyKey: 'phase-4-session-repeat',
    });

    const beforeRecipient = await prisma.integrationSigningRequestParticipant.findFirstOrThrow({
      where: {
        signingRequestId: created.requestId,
        participantId: 'approver-1',
      },
      include: {
        nativeRecipient: true,
      },
    });

    const firstSession = await createIntegrationApiV1SigningSession({
      requestId: created.requestId,
      participantId: 'approver-1',
      teamId: team.id,
      request: {
        mode: 'REDIRECT',
      },
    });

    const secondSession = await createIntegrationApiV1SigningSession({
      requestId: created.requestId,
      participantId: 'approver-1',
      teamId: team.id,
      request: {
        mode: 'REDIRECT',
      },
    });

    const afterRecipient = await prisma.integrationSigningRequestParticipant.findFirstOrThrow({
      where: {
        signingRequestId: created.requestId,
        participantId: 'approver-1',
      },
      include: {
        nativeRecipient: true,
      },
    });

    expect(firstSession.sessionId).not.toBe(secondSession.sessionId);
    expect(beforeRecipient.nativeRecipient?.signingStatus).toBe(SigningStatus.NOT_SIGNED);
    expect(afterRecipient.nativeRecipient?.signingStatus).toBe(SigningStatus.NOT_SIGNED);
    expect(afterRecipient.nativeRecipient?.signedAt).toBeNull();
  });

  it('preserves a safe return url and redirects to it after completion', async () => {
    const { team, created } = await createAndActivateSigningRequest({
      participants: [createParticipant('approver-1')],
      stages: [{ order: 1, participantIds: ['approver-1'] }],
      idempotencyKey: 'phase-4-session-complete',
    });

    const session = await createIntegrationApiV1SigningSession({
      requestId: created.requestId,
      participantId: 'approver-1',
      teamId: team.id,
      request: {
        mode: 'REDIRECT',
        returnUrl: 'http://127.0.0.1:3000/return',
        clientState: 'state-42',
      },
    });

    await completeParticipant({
      requestId: created.requestId,
      participantId: 'approver-1',
    });

    const completionRedirectUrl = await getIntegrationSigningSessionCompletionRedirectUrl({
      sessionId: session.sessionId,
    });

    expect(completionRedirectUrl).toContain('http://127.0.0.1:3000/return');
    expect(completionRedirectUrl).toContain(`requestId=${created.requestId}`);
    expect(completionRedirectUrl).toContain('participantId=approver-1');
    expect(completionRedirectUrl).toContain('status=COMPLETED');
    expect(completionRedirectUrl).toContain('clientState=state-42');
  });

  it('hides the session flow behind the feature flag', async () => {
    process.env.INTEGRATION_API_V1_ENABLED = 'false';

    await expect(
      createIntegrationApiV1SigningSession({
        requestId: 'integration_request_missing',
        participantId: 'participant-missing',
        teamId: 1,
        request: {
          mode: 'REDIRECT',
        },
      }),
    ).rejects.toThrowError('Signing session not found');
  });
});
