import { describe, expect, it } from 'vitest';

import {
  ZIntegrationApiV1CapabilitySchema,
  ZIntegrationApiV1EventSchema,
  ZIntegrationApiV1RequestSchema,
  ZIntegrationApiV1StatusSchema,
} from './schema';

describe('integration api v1 schemas', () => {
  it('parses valid normalized request, status, event, and capability payloads', () => {
    const requestResult = ZIntegrationApiV1RequestSchema.safeParse({
      externalReference: 'request-123',
      title: 'Employment Agreement',
      documentReferences: [
        {
          sourceReference: 'doc-001',
          filename: 'employment-agreement.pdf',
          mimeType: 'application/pdf',
          contentHash: {
            algorithm: 'sha256',
            value: 'abc123',
          },
        },
      ],
      participants: [
        {
          participantId: 'participant-1',
          email: 'signer.one@example.com',
          displayName: 'Signer One',
          role: 'SIGNER',
        },
        {
          participantId: 'participant-2',
          externalParticipantId: 'crm-participant-2',
          displayName: 'Approver Two',
          role: 'APPROVER',
        },
        {
          participantId: 'participant-3',
          email: 'observer@example.com',
          displayName: 'Observer',
          role: 'CC',
        },
      ],
      signingStages: [
        {
          order: 1,
          participantIds: ['participant-1'],
        },
        {
          order: 2,
          participantIds: ['participant-2'],
        },
      ],
      correlationId: 'correlation-123',
      metadata: {
        caseId: 'case-42',
        retries: 0,
      },
    });

    const statusResult = ZIntegrationApiV1StatusSchema.safeParse('COMPLETED');

    const eventResult = ZIntegrationApiV1EventSchema.safeParse({
      eventId: 'event-1',
      integrationRequestId: 'request-123',
      externalReference: 'request-123',
      eventType: 'STATUS_CHANGED',
      occurredAt: new Date().toISOString(),
      statusBefore: 'READY',
      statusAfter: 'IN_PROGRESS',
      correlationId: 'correlation-123',
      metadata: {
        origin: 'test-suite',
      },
    });

    const capabilityResult = ZIntegrationApiV1CapabilitySchema.safeParse({
      apiVersion: 'V1',
      enabled: true,
      supportsMutation: false,
      providerExecutionAvailable: false,
      supportedWorkflowModes: ['STAGED'],
      supportedDocumentCount: {
        minimum: 1,
        maximum: 1,
        multipleDocuments: false,
      },
      releasePhase: 'PHASE_1_SKELETON',
    });

    expect(requestResult.success).toBe(true);
    expect(statusResult.success).toBe(true);
    expect(eventResult.success).toBe(true);
    expect(capabilityResult.success).toBe(true);
  });

  it('rejects invalid request data', () => {
    const result = ZIntegrationApiV1RequestSchema.safeParse({
      externalReference: 'request-123',
      title: 'Employment Agreement',
      documentReferences: [],
      participants: [
        {
          participantId: 'participant-1',
          role: 'SIGNER',
        },
      ],
      signingStages: [
        {
          order: 1,
          participantIds: ['participant-1'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid status and event values', () => {
    const statusResult = ZIntegrationApiV1StatusSchema.safeParse('SEALED');
    const eventResult = ZIntegrationApiV1EventSchema.safeParse({
      eventId: 'event-1',
      integrationRequestId: 'request-123',
      eventType: 'SECRET_DUMP',
      occurredAt: new Date().toISOString(),
    });

    expect(statusResult.success).toBe(false);
    expect(eventResult.success).toBe(false);
  });

  it('rejects invalid signing stage ordering and participant placement', () => {
    const result = ZIntegrationApiV1RequestSchema.safeParse({
      externalReference: 'request-123',
      title: 'Employment Agreement',
      documentReferences: [
        {
          sourceReference: 'doc-001',
          filename: 'employment-agreement.pdf',
          mimeType: 'application/pdf',
        },
      ],
      participants: [
        {
          participantId: 'participant-1',
          email: 'signer.one@example.com',
          role: 'SIGNER',
        },
        {
          participantId: 'participant-2',
          email: 'observer@example.com',
          role: 'CC',
        },
      ],
      signingStages: [
        {
          order: 2,
          participantIds: ['participant-1', 'participant-2'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
