import { describe, expect, it } from 'vitest';

import {
  ZIntegrationApiV1CapabilitySchema,
  ZIntegrationApiV1CreateSigningRequestResponseSchema,
  ZIntegrationApiV1EventSchema,
  ZIntegrationApiV1SigningRequestResponseSchema,
  ZIntegrationApiV1SigningRequestSchema,
  ZIntegrationApiV1StageCompletionPolicySchema,
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
          email: 'approver.one@example.com',
          displayName: 'Approver One',
          role: 'APPROVER',
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
          completionPolicy: 'ALL_REQUIRED',
          participantIds: ['participant-1', 'participant-2'],
        },
      ],
      correlationId: 'correlation-123',
      metadata: {
        caseId: 'case-42',
      },
    });

    const statusResult = ZIntegrationApiV1StatusSchema.safeParse('COMPLETED');
    const policyResult = ZIntegrationApiV1StageCompletionPolicySchema.safeParse('ALL_REQUIRED');

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
      releasePhase: 'PHASE_3_STAGE_ORCHESTRATION',
    });

    const responseResult = ZIntegrationApiV1SigningRequestResponseSchema.safeParse({
      requestId: 'integration_request_123',
      externalReference: 'request-123',
      title: 'Employment Agreement',
      status: 'IN_PROGRESS',
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
        status: 'PENDING',
      },
      stages: [
        {
          order: 1,
          nativeSigningOrder: 1,
          completionPolicy: 'ALL_REQUIRED',
          status: 'ACTIVE',
          isActive: true,
          isBlocked: false,
          participantIds: ['participant-1'],
        },
      ],
      participants: [
        {
          participantId: 'participant-1',
          email: 'approver.one@example.com',
          role: 'APPROVER',
          status: 'AVAILABLE',
          stageOrder: 1,
          nativeSigningOrder: 1,
          isActionable: true,
          isBlocked: false,
        },
      ],
      timeline: [
        {
          stageOrder: 1,
          stageStatus: 'ACTIVE',
          stageCompletionPolicy: 'ALL_REQUIRED',
          participantId: 'participant-1',
          email: 'approver.one@example.com',
          role: 'APPROVER',
          nativeSigningOrder: 1,
          status: 'AVAILABLE',
          isActionable: true,
          isBlocked: false,
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
      timeline: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotentReplay: false,
    });

    expect(requestResult.success).toBe(true);
    expect(statusResult.success).toBe(true);
    expect(policyResult.success).toBe(true);
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
          email: 'approver.one@example.com',
          role: 'APPROVER',
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
          email: 'Approver@One.Example.com',
          role: 'APPROVER',
        },
        {
          participantId: 'participant-2',
          email: 'approver@one.example.com',
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

  it('rejects non-contiguous stages, unsupported policies, and read-only participants inside stages', () => {
    const gapsResult = ZIntegrationApiV1SigningRequestSchema.safeParse({
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
          email: 'approver.one@example.com',
          role: 'APPROVER',
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

    const invalidPolicyResult = ZIntegrationApiV1StageCompletionPolicySchema.safeParse('ANY_ONE');

    expect(gapsResult.success).toBe(false);
    expect(invalidPolicyResult.success).toBe(false);
  });

  it('rejects duplicate participants across stages', () => {
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
          email: 'approver.one@example.com',
          role: 'APPROVER',
        },
      ],
      stages: [
        {
          order: 1,
          participantIds: ['participant-1'],
        },
        {
          order: 2,
          participantIds: ['participant-1'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
