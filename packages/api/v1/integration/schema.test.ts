import { describe, expect, it } from 'vitest';

import {
  ZIntegrationApiV1CapabilitySchema,
  ZIntegrationApiV1CreateSigningRequestResponseSchema,
  ZIntegrationApiV1EventSchema,
  ZIntegrationApiV1SigningRequestResponseSchema,
  ZIntegrationApiV1SigningRequestSchema,
  ZIntegrationApiV1StatusSchema,
} from './schema';

describe('integration api v1 schemas', () => {
  it('parses valid signing-request, status, event, capability, and response payloads', () => {
    const requestResult = ZIntegrationApiV1SigningRequestSchema.safeParse({
      externalReference: 'request-123',
      title: 'Employment Agreement',
      document: {
        sourceReference: 'document_123',
        filename: 'employment-agreement.pdf',
        mimeType: 'application/pdf',
        contentHash: {
          algorithm: 'sha256',
          value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      participants: [
        {
          participantId: 'participant-1',
          email: 'signer.one@example.com',
          displayName: 'Signer One',
          role: 'SIGNER',
        },
        {
          participantId: 'participant-2',
          email: 'approver.two@example.com',
          externalParticipantId: 'crm-approver-2',
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
      stages: [
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
    });

    const capabilityResult = ZIntegrationApiV1CapabilitySchema.safeParse({
      apiVersion: 'V1',
      enabled: true,
      supportsMutation: true,
      providerExecutionAvailable: false,
      supportedWorkflowModes: ['STAGED'],
      supportedDocumentCount: {
        minimum: 1,
        maximum: 1,
        multipleDocuments: false,
      },
      releasePhase: 'PHASE_2_SIGNING_REQUESTS',
    });

    const responseResult = ZIntegrationApiV1SigningRequestResponseSchema.safeParse({
      requestId: 'integration_request_123',
      externalReference: 'request-123',
      title: 'Employment Agreement',
      status: 'READY',
      document: {
        sourceReference: 'document_123',
        filename: 'employment-agreement.pdf',
        mimeType: 'application/pdf',
        verifiedContentHash: {
          algorithm: 'SHA-256',
          value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      nativeDocument: {
        envelopeId: 'envelope_123',
        documentId: 123,
        status: 'DRAFT',
      },
      stages: [
        {
          order: 1,
          nativeSigningOrder: 1,
          participantIds: ['participant-1'],
        },
      ],
      participants: [
        {
          participantId: 'participant-1',
          email: 'signer.one@example.com',
          role: 'SIGNER',
          status: 'NOT_STARTED',
          stageOrder: 1,
          nativeSigningOrder: 1,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const createResponseResult = ZIntegrationApiV1CreateSigningRequestResponseSchema.safeParse({
      requestId: 'integration_request_123',
      externalReference: 'request-123',
      title: 'Employment Agreement',
      status: 'READY',
      document: {
        sourceReference: 'document_123',
        filename: 'employment-agreement.pdf',
        mimeType: 'application/pdf',
        verifiedContentHash: {
          algorithm: 'SHA-256',
          value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      stages: [],
      participants: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotentReplay: false,
    });

    expect(requestResult.success).toBe(true);
    expect(statusResult.success).toBe(true);
    expect(eventResult.success).toBe(true);
    expect(capabilityResult.success).toBe(true);
    expect(responseResult.success).toBe(true);
    expect(createResponseResult.success).toBe(true);
  });

  it('rejects invalid source hashes and unsupported mime types', () => {
    const result = ZIntegrationApiV1SigningRequestSchema.safeParse({
      externalReference: 'request-123',
      title: 'Employment Agreement',
      document: {
        sourceReference: 'document_123',
        filename: 'employment-agreement.txt',
        mimeType: 'text/plain',
        contentHash: {
          algorithm: 'md5',
          value: 'abc123',
        },
      },
      participants: [
        {
          participantId: 'participant-1',
          email: 'signer.one@example.com',
          role: 'SIGNER',
        },
      ],
      stages: [
        {
          order: 1,
          participantIds: ['participant-1'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate normalized participant emails', () => {
    const result = ZIntegrationApiV1SigningRequestSchema.safeParse({
      externalReference: 'request-123',
      title: 'Employment Agreement',
      document: {
        sourceReference: 'document_123',
        filename: 'employment-agreement.pdf',
        mimeType: 'application/pdf',
        contentHash: {
          algorithm: 'SHA-256',
          value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      participants: [
        {
          participantId: 'participant-1',
          email: 'Signer@One.Example.com',
          role: 'SIGNER',
        },
        {
          participantId: 'participant-2',
          email: 'signer@one.example.com',
          role: 'APPROVER',
        },
      ],
      stages: [
        {
          order: 1,
          participantIds: ['participant-1', 'participant-2'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-contiguous stages and read-only participants inside stages', () => {
    const result = ZIntegrationApiV1SigningRequestSchema.safeParse({
      externalReference: 'request-123',
      title: 'Employment Agreement',
      document: {
        sourceReference: 'document_123',
        filename: 'employment-agreement.pdf',
        mimeType: 'application/pdf',
        contentHash: {
          algorithm: 'SHA-256',
          value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      participants: [
        {
          participantId: 'participant-1',
          email: 'signer.one@example.com',
          role: 'SIGNER',
        },
        {
          participantId: 'participant-2',
          email: 'observer@example.com',
          role: 'VIEWER',
        },
      ],
      stages: [
        {
          order: 2,
          participantIds: ['participant-1', 'participant-2'],
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
});
