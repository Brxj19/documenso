import { describe, expect, it } from 'vitest';

import {
  ZIntegrationApiV1ArtifactListResponseSchema,
  ZIntegrationApiV1CallbackDeliverySchema,
  ZIntegrationApiV1CapabilitySchema,
  ZIntegrationApiV1CreateSigningRequestResponseSchema,
  ZIntegrationApiV1CreateSigningSessionResponseSchema,
  ZIntegrationApiV1CreateSigningSessionSchema,
  ZIntegrationApiV1EventSchema,
  ZIntegrationApiV1EvidenceResponseSchema,
  ZIntegrationApiV1SigningRequestResponseSchema,
  ZIntegrationApiV1SigningRequestSchema,
  ZIntegrationApiV1SigningSessionModeSchema,
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
    const modeResult = ZIntegrationApiV1SigningSessionModeSchema.safeParse('REDIRECT');

    const eventResult = ZIntegrationApiV1EventSchema.safeParse({
      eventId: 'event-1',
      requestId: 'request-123',
      eventType: 'REQUEST_SENT',
      source: 'API',
      correlationId: 'event-correlation-123',
      requestCorrelationId: 'correlation-123',
      eventTimestamp: new Date().toISOString(),
      observedAt: new Date().toISOString(),
      statusBefore: 'READY',
      statusAfter: 'IN_PROGRESS',
    });

    const capabilityResult = ZIntegrationApiV1CapabilitySchema.safeParse({
      apiVersion: 'V1',
      enabled: true,
      supportsMutation: true,
      providerExecutionAvailable: false,
      supportedWorkflowModes: ['STAGED'],
      supportedSigningModes: ['REDIRECT'],
      redirectSigningSupported: true,
      embeddedSigningSupported: false,
      sessionExpirySupported: true,
      returnUrlAllowlistSupported: true,
      callbackEventsSupported: true,
      evidenceEndpointSupported: true,
      finalArtifactMetadataSupported: true,
      finalArtifactDownloadSupported: true,
      callbackSigningSupported: true,
      callbackRetryOutboxSupported: true,
      reconciliationSupported: true,
      integrityVerificationTested: true,
      supportedCallbackModes: ['PER_REQUEST_URL'],
      supportedDocumentCount: {
        minimum: 1,
        maximum: 1,
        multipleDocuments: false,
      },
      releasePhase: 'PHASE_5_AUDIT_EVIDENCE_CALLBACKS',
    });

    const signingSessionRequestResult = ZIntegrationApiV1CreateSigningSessionSchema.safeParse({
      returnUrl: 'http://localhost:3000/return',
      mode: 'REDIRECT',
      clientState: 'state-123',
      ttlSeconds: 900,
    });

    const signingSessionResponseResult = ZIntegrationApiV1CreateSigningSessionResponseSchema.safeParse({
      sessionId: 'integration_session_123',
      requestId: 'integration_request_123',
      participantId: 'participant-1',
      mode: 'REDIRECT',
      expiresAt: new Date().toISOString(),
      launchUrl: 'http://localhost:3000/sign/integration/integration_session_123',
      returnUrl: 'http://localhost:3000/return',
      clientState: 'state-123',
      participantStatus: 'AVAILABLE',
      requestStatus: 'IN_PROGRESS',
      embeddedSupported: false,
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
      correlationId: 'integration-correlation-123',
      clientCorrelationId: 'client-correlation-123',
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

    const callbackDeliveryResult = ZIntegrationApiV1CallbackDeliverySchema.safeParse({
      deliveryId: 'integration_delivery_123',
      eventId: 'event-1',
      deliveryState: 'FAILED_RETRYABLE',
      targetUrl: 'http://localhost:3000/callback',
      payloadHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      attemptCount: 1,
      maxAttempts: 5,
      nextAttemptAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
      lastHttpStatus: 500,
      lastErrorSummary: 'Callback returned HTTP 500.',
      lastAttemptCorrelationId: 'integration_delivery_attempt_123',
    });

    const evidenceResponseResult = ZIntegrationApiV1EvidenceResponseSchema.safeParse({
      requestId: 'integration_request_123',
      correlationId: 'integration-correlation-123',
      clientCorrelationId: 'client-correlation-123',
      status: 'COMPLETED',
      timeline: [],
      events: [
        {
          eventId: 'event-1',
          requestId: 'integration_request_123',
          eventType: 'REQUEST_COMPLETED',
          source: 'ENGINE_COMPLETION',
          correlationId: 'event-correlation-123',
          requestCorrelationId: 'integration-correlation-123',
          eventTimestamp: new Date().toISOString(),
          observedAt: new Date().toISOString(),
          statusAfter: 'COMPLETED',
        },
      ],
      artifacts: [
        {
          artifactId: 'integration_artifact_123',
          requestId: 'integration_request_123',
          artifactType: 'SIGNED_PDF',
          filename: 'completed-signed.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256: {
            algorithm: 'SHA-256',
            value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
          integrityStatus: 'HASH_VERIFIED',
          capturedAt: new Date().toISOString(),
          certificateMetadata: {
            certificatePdfAvailable: true,
            auditLogPdfAvailable: true,
            verificationStatus: 'HASH_VERIFIED',
          },
        },
      ],
      finalArtifact: {
        artifactId: 'integration_artifact_123',
        requestId: 'integration_request_123',
        artifactType: 'SIGNED_PDF',
        filename: 'completed-signed.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: {
          algorithm: 'SHA-256',
          value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        integrityStatus: 'HASH_VERIFIED',
        capturedAt: new Date().toISOString(),
        certificateMetadata: {
          certificatePdfAvailable: true,
          auditLogPdfAvailable: true,
          verificationStatus: 'HASH_VERIFIED',
        },
      },
      finalSha256: {
        algorithm: 'SHA-256',
        value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      certificateMetadata: {
        certificatePdfAvailable: true,
        auditLogPdfAvailable: true,
        verificationStatus: 'HASH_VERIFIED',
      },
      callbacks: {
        deliveries: [
          {
            deliveryId: 'integration_delivery_123',
            eventId: 'event-1',
            deliveryState: 'FAILED_RETRYABLE',
            targetUrl: 'http://localhost:3000/callback',
            payloadHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            attemptCount: 1,
            maxAttempts: 5,
            nextAttemptAt: new Date().toISOString(),
          },
        ],
      },
      reconciliation: {
        lastReconciledAt: new Date().toISOString(),
        lastEventObservedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const artifactListResult = ZIntegrationApiV1ArtifactListResponseSchema.safeParse({
      requestId: 'integration_request_123',
      status: 'COMPLETED',
      artifacts: [
        {
          artifactId: 'integration_artifact_123',
          requestId: 'integration_request_123',
          artifactType: 'SIGNED_PDF',
          filename: 'completed-signed.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256: {
            algorithm: 'SHA-256',
            value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
          integrityStatus: 'HASH_VERIFIED',
          capturedAt: new Date().toISOString(),
        },
      ],
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
    expect(modeResult.success).toBe(true);
    expect(eventResult.success).toBe(true);
    expect(capabilityResult.success).toBe(true);
    expect(signingSessionRequestResult.success).toBe(true);
    expect(signingSessionResponseResult.success).toBe(true);
    expect(responseResult.success).toBe(true);
    expect(createResponseResult.success).toBe(true);
    expect(callbackDeliveryResult.success).toBe(true);
    expect(evidenceResponseResult.success).toBe(true);
    expect(artifactListResult.success).toBe(true);
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
