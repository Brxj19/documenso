import fs from 'node:fs';
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

import { getIntegrationApiV1SigningRequestEvidence } from './evidence';
import { processIntegrationExpiry } from './expiry';

import {
  cancelIntegrationApiV1SigningRequest,
  createIntegrationApiV1SigningRequest,
  getIntegrationApiV1SigningRequest,
  rejectIntegrationApiV1SigningRequestParticipant,
  remindIntegrationApiV1SigningRequestParticipant,
  sendIntegrationApiV1SigningRequest,
} from './signing-requests';
import { createIntegrationApiV1SigningSession } from './signing-sessions';
import { isIntegrationRequestTerminal } from './terminal-state';

vi.mock('@documenso/lib/server-only/document/resend-document', () => ({
  resendDocument: vi.fn().mockResolvedValue({ id: 'mock-envelope' }),
}));

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
    name: 'phase-6-source.pdf',
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
      title: 'Phase 6 Source Document',
      envelopeItems: [
        {
          title: 'phase-6-source',
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
  idempotencyKey,
  title = 'Phase 6 Lifecycle Request',
}: {
  sourceReference: string;
  hash: string;
  participants: Array<ReturnType<typeof createParticipant>>;
  stages: Array<{ order: number; participantIds: string[]; completionPolicy?: 'ALL_REQUIRED' }>;
  idempotencyKey: string;
  title?: string;
}) => ({
  externalReference: `${idempotencyKey}-request`,
  title,
  document: {
    sourceReference,
    filename: 'phase-6-source.pdf',
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

const createAndActivateSigningRequest = async ({ idempotencyKey }: { idempotencyKey: string }) => {
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
      participants: [createParticipant('approver-1'), createParticipant('approver-2')],
      stages: [
        { order: 1, participantIds: ['approver-1'] },
        { order: 2, participantIds: ['approver-2'] },
      ],
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

beforeEach(() => {
  process.env.INTEGRATION_API_V1_ENABLED = 'true';
  process.env.INTEGRATION_API_V1_RETURN_URL_ALLOWLIST = 'http://localhost:3000,http://127.0.0.1:3000';
  process.env.INTEGRATION_API_V1_REMINDER_ENABLED = 'true';
  process.env.INTEGRATION_API_V1_REMINDER_MIN_INTERVAL_SECONDS = '1';
  process.env.INTEGRATION_API_V1_REMINDER_MAX_PER_DAY = '10';
  process.env.INTEGRATION_API_V1_REMINDER_MAX_PER_REQUEST = '20';
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env.INTEGRATION_API_V1_ENABLED;
  delete process.env.INTEGRATION_API_V1_RETURN_URL_ALLOWLIST;
  delete process.env.INTEGRATION_API_V1_REMINDER_ENABLED;
  delete process.env.INTEGRATION_API_V1_REMINDER_MIN_INTERVAL_SECONDS;
  delete process.env.INTEGRATION_API_V1_REMINDER_MAX_PER_DAY;
  delete process.env.INTEGRATION_API_V1_REMINDER_MAX_PER_REQUEST;

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

describe('Integration API V1 Lifecycle Controls', () => {
  describe('terminal-state policy', () => {
    it('detects terminal statuses', () => {
      expect(isIntegrationRequestTerminal('COMPLETED')).toBe(true);
      expect(isIntegrationRequestTerminal('REJECTED')).toBe(true);
      expect(isIntegrationRequestTerminal('CANCELLED')).toBe(true);
      expect(isIntegrationRequestTerminal('EXPIRED')).toBe(true);
      expect(isIntegrationRequestTerminal('FAILED')).toBe(true);
      expect(isIntegrationRequestTerminal('DRAFT')).toBe(false);
      expect(isIntegrationRequestTerminal('READY')).toBe(false);
      expect(isIntegrationRequestTerminal('IN_PROGRESS')).toBe(false);
      expect(isIntegrationRequestTerminal('PARTIALLY_COMPLETED')).toBe(false);
    });
  });

  describe('rejection', () => {
    it('rejects an eligible active participant with reason', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-reject-eligible',
      });

      const result = await rejectIntegrationApiV1SigningRequestParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
        teamId: team.id,
        userId: user.id,
        reason: 'Document has errors',
        requestMetadata,
      });

      expect(result.status).toBe('REJECTED');
      expect(result.participants.find((p) => p.participantId === 'approver-1')?.status).toBe('REJECTED');
    });

    it('requires a reason for cancellation', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-cancel-reason-required',
      });

      await expect(
        cancelIntegrationApiV1SigningRequest({
          requestId: created.requestId,
          teamId: team.id,
          userId: user.id,
          reason: '',
          requestMetadata,
        }),
      ).rejects.toThrow();
    });

    it('makes the request REJECTED and blocks later stages', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-reject-blocks-stages',
      });

      await rejectIntegrationApiV1SigningRequestParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
        teamId: team.id,
        userId: user.id,
        reason: 'Needs revision',
        requestMetadata,
      });

      const snapshot = await getIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(snapshot.status).toBe('REJECTED');
      expect(snapshot.stages.find((s) => s.order === 1)?.status).toBe('REJECTED');
      expect(snapshot.stages.find((s) => s.order === 2)?.status).toBe('BLOCKED');
      expect(snapshot.stages.find((s) => s.order === 2)?.blockedReason).toBe('REQUEST_TERMINATED');
    });

    it('records rejection in evidence', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-reject-evidence',
      });

      await rejectIntegrationApiV1SigningRequestParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
        teamId: team.id,
        userId: user.id,
        reason: 'Rejected in test',
        requestMetadata,
      });

      const evidence = await getIntegrationApiV1SigningRequestEvidence({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(evidence.status).toBe('REJECTED');
      expect(evidence.events.some((e) => e.eventType === 'PARTICIPANT_REJECTED')).toBe(true);
      expect(evidence.events.some((e) => e.eventType === 'REQUEST_REJECTED')).toBe(true);
    });

    it('blocks signing sessions after rejection', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-reject-blocks-session',
      });

      await rejectIntegrationApiV1SigningRequestParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
        teamId: team.id,
        userId: user.id,
        reason: 'Rejected',
        requestMetadata,
      });

      await expect(
        createIntegrationApiV1SigningSession({
          requestId: created.requestId,
          participantId: 'approver-2',
          teamId: team.id,
          request: { mode: 'REDIRECT' },
        }),
      ).rejects.toThrow();
    });
  });

  describe('cancellation', () => {
    it('cancels a non-terminal request with reason', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-cancel-eligible',
      });

      const result = await cancelIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
        userId: user.id,
        reason: 'No longer needed',
        requestMetadata,
      });

      expect(result.status).toBe('CANCELLED');
    });

    it('records cancellation in evidence', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-cancel-evidence',
      });

      await cancelIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
        userId: user.id,
        reason: 'Cancelled for testing',
        requestMetadata,
      });

      const evidence = await getIntegrationApiV1SigningRequestEvidence({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(evidence.status).toBe('CANCELLED');
      expect(evidence.events.some((e) => e.eventType === 'REQUEST_CANCELLED')).toBe(true);
    });

    it('blocks sessions and reminders after cancellation', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-cancel-blocks',
      });

      await cancelIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
        userId: user.id,
        reason: 'Cancelled',
        requestMetadata,
      });

      await expect(
        createIntegrationApiV1SigningSession({
          requestId: created.requestId,
          participantId: 'approver-1',
          teamId: team.id,
          request: { mode: 'REDIRECT' },
        }),
      ).rejects.toThrow();
    });

    it('rejects cancellation of completed request', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-cancel-completed',
      });

      await completeParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
      });

      await completeParticipant({
        requestId: created.requestId,
        participantId: 'approver-2',
      });

      await expect(
        cancelIntegrationApiV1SigningRequest({
          requestId: created.requestId,
          teamId: team.id,
          userId: user.id,
          reason: 'Should fail',
          requestMetadata,
        }),
      ).rejects.toThrow();
    });
  });

  describe('expiry', () => {
    it('expires past-due non-terminal requests', async () => {
      const { user, team } = await seedUser();
      createdUserIds.push(user.id);

      const sourceEnvelope = await createSourceEnvelope({ userId: user.id, teamId: team.id });
      const sourceHash = await getSourceHash(sourceEnvelope);

      const created = await createIntegrationApiV1SigningRequest({
        request: createRequestPayload({
          sourceReference: sourceEnvelope.id,
          hash: sourceHash,
          participants: [createParticipant('approver-1')],
          stages: [{ order: 1, participantIds: ['approver-1'] }],
          idempotencyKey: 'lifecycle-expiry-test',
        }),
        userId: user.id,
        teamId: team.id,
        requestMetadata,
      });

      await prisma.integrationSigningRequest.update({
        where: { id: created.requestId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const report = await processIntegrationExpiry();

      expect(report.expired).toBeGreaterThanOrEqual(1);

      const snapshot = await getIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(snapshot.status).toBe('EXPIRED');
    });

    it('skips completed requests during expiry processing', async () => {
      const { team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-expiry-skip-completed',
      });

      await completeParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
      });

      await completeParticipant({
        requestId: created.requestId,
        participantId: 'approver-2',
      });

      await prisma.integrationSigningRequest.update({
        where: { id: created.requestId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      await getIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
      });

      const report = await processIntegrationExpiry();

      expect(report.expired).toBe(0);

      const snapshot = await getIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(snapshot.status).toBe('COMPLETED');
    });

    it('supports dry-run mode', async () => {
      const { user, team } = await seedUser();
      createdUserIds.push(user.id);

      const sourceEnvelope = await createSourceEnvelope({ userId: user.id, teamId: team.id });
      const sourceHash = await getSourceHash(sourceEnvelope);

      const created = await createIntegrationApiV1SigningRequest({
        request: createRequestPayload({
          sourceReference: sourceEnvelope.id,
          hash: sourceHash,
          participants: [createParticipant('approver-1')],
          stages: [{ order: 1, participantIds: ['approver-1'] }],
          idempotencyKey: 'lifecycle-expiry-dry-run',
        }),
        userId: user.id,
        teamId: team.id,
        requestMetadata,
      });

      await prisma.integrationSigningRequest.update({
        where: { id: created.requestId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const report = await processIntegrationExpiry({ dryRun: true });

      expect(report.dryRun).toBe(true);
      expect(report.expired).toBeGreaterThanOrEqual(1);

      const raw = await prisma.integrationSigningRequest.findUniqueOrThrow({
        where: { id: created.requestId },
      });

      expect(raw.status).not.toBe('EXPIRED');
    });

    it('records expiry in evidence', async () => {
      const { user, team } = await seedUser();
      createdUserIds.push(user.id);

      const sourceEnvelope = await createSourceEnvelope({ userId: user.id, teamId: team.id });
      const sourceHash = await getSourceHash(sourceEnvelope);

      const created = await createIntegrationApiV1SigningRequest({
        request: createRequestPayload({
          sourceReference: sourceEnvelope.id,
          hash: sourceHash,
          participants: [createParticipant('approver-1')],
          stages: [{ order: 1, participantIds: ['approver-1'] }],
          idempotencyKey: 'lifecycle-expiry-evidence',
        }),
        userId: user.id,
        teamId: team.id,
        requestMetadata,
      });

      await prisma.integrationSigningRequest.update({
        where: { id: created.requestId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      await processIntegrationExpiry();

      const evidence = await getIntegrationApiV1SigningRequestEvidence({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(evidence.status).toBe('EXPIRED');
      expect(evidence.events.some((e) => e.eventType === 'REQUEST_EXPIRED')).toBe(true);
    });
  });

  describe('reminders', () => {
    it('records a reminder attempt for an active actionable participant', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-remind-active',
      });

      await remindIntegrationApiV1SigningRequestParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
        teamId: team.id,
        userId: user.id,
        requestMetadata,
      });

      const evidence = await getIntegrationApiV1SigningRequestEvidence({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(evidence.events.some((e) => e.eventType === 'REMINDER_SENT')).toBe(true);
    });

    it('rejects reminder for blocked participant', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-remind-blocked',
      });

      await expect(
        remindIntegrationApiV1SigningRequestParticipant({
          requestId: created.requestId,
          participantId: 'approver-2',
          teamId: team.id,
          userId: user.id,
          requestMetadata,
        }),
      ).rejects.toThrow();
    });

    it('rejects reminder for completed request', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-remind-completed',
      });

      await completeParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
      });

      await completeParticipant({
        requestId: created.requestId,
        participantId: 'approver-2',
      });

      await expect(
        remindIntegrationApiV1SigningRequestParticipant({
          requestId: created.requestId,
          participantId: 'approver-1',
          teamId: team.id,
          userId: user.id,
          requestMetadata,
        }),
      ).rejects.toThrow();
    });

    it('records rate-limited reminder attempt as REMINDER_ATTEMPTED', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-remind-rate-limited',
      });

      process.env.INTEGRATION_API_V1_REMINDER_MAX_PER_REQUEST = '1';

      await remindIntegrationApiV1SigningRequestParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
        teamId: team.id,
        userId: user.id,
        requestMetadata,
      });

      await expect(
        remindIntegrationApiV1SigningRequestParticipant({
          requestId: created.requestId,
          participantId: 'approver-1',
          teamId: team.id,
          userId: user.id,
          requestMetadata,
        }),
      ).rejects.toThrow();

      const evidence = await getIntegrationApiV1SigningRequestEvidence({
        requestId: created.requestId,
        teamId: team.id,
      });

      const reminderAttempts = evidence.events.filter((e) => e.eventType === 'REMINDER_ATTEMPTED');
      expect(reminderAttempts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('terminal-state immutability', () => {
    const assertMutableActionsRejected = async (requestId: string, teamId: number, userId: number) => {
      await expect(
        sendIntegrationApiV1SigningRequest({
          requestId,
          teamId,
          requestMetadata,
        }),
      ).rejects.toThrow();

      await expect(
        createIntegrationApiV1SigningSession({
          requestId,
          participantId: 'approver-1',
          teamId,
          request: { mode: 'REDIRECT' },
        }),
      ).rejects.toThrow();

      await expect(
        cancelIntegrationApiV1SigningRequest({
          requestId,
          teamId,
          userId,
          reason: 'Should fail',
          requestMetadata,
        }),
      ).rejects.toThrow();
      await expect(
        remindIntegrationApiV1SigningRequestParticipant({
          requestId,
          participantId: 'approver-1',
          teamId,
          userId,
          requestMetadata,
        }),
      ).rejects.toThrow();
    };

    it('rejects mutations on completed request', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-terminal-completed',
      });

      await completeParticipant({ requestId: created.requestId, participantId: 'approver-1' });
      await completeParticipant({ requestId: created.requestId, participantId: 'approver-2' });

      const snapshot = await getIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(snapshot.status).toBe('COMPLETED');

      await assertMutableActionsRejected(created.requestId, team.id, user.id);
    });

    it('rejects mutations on rejected request', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-terminal-rejected',
      });

      await rejectIntegrationApiV1SigningRequestParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
        teamId: team.id,
        userId: user.id,
        reason: 'Rejected for testing',
        requestMetadata,
      });

      await assertMutableActionsRejected(created.requestId, team.id, user.id);
    });

    it('rejects mutations on cancelled request', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-terminal-cancelled',
      });

      await cancelIntegrationApiV1SigningRequest({
        requestId: created.requestId,
        teamId: team.id,
        userId: user.id,
        reason: 'Cancelled for testing',
        requestMetadata,
      });

      await assertMutableActionsRejected(created.requestId, team.id, user.id);
    });

    it('rejects mutations on expired request', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-terminal-expired',
      });

      await prisma.integrationSigningRequest.update({
        where: { id: created.requestId },
        data: {
          expiresAt: new Date(Date.now() - 60_000),
          status: 'EXPIRED',
        },
      });

      await assertMutableActionsRejected(created.requestId, team.id, user.id);
    });
  });

  describe('evidence visibility', () => {
    it('shows lifecycle events in evidence response', async () => {
      const { user, team, created } = await createAndActivateSigningRequest({
        idempotencyKey: 'lifecycle-evidence-visibility',
      });

      await rejectIntegrationApiV1SigningRequestParticipant({
        requestId: created.requestId,
        participantId: 'approver-1',
        teamId: team.id,
        userId: user.id,
        reason: 'Testing evidence',
        requestMetadata,
      });

      const evidence = await getIntegrationApiV1SigningRequestEvidence({
        requestId: created.requestId,
        teamId: team.id,
      });

      expect(evidence.status).toBe('REJECTED');
      expect(evidence.rejectedAt).toBeDefined();
    });
  });
});
