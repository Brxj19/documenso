import { sendDocument } from '@documenso/lib/server-only/document/send-document';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@documenso/lib/server-only/document/send-document', () => ({
  sendDocument: vi.fn(),
}));

vi.mock('@documenso/lib/server-only/envelope/create-envelope', () => ({
  createEnvelope: vi.fn(),
}));

import {
  getIntegrationApiV1CapabilitiesRoute,
  INTEGRATION_API_V1_CAPABILITIES_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_ARTIFACT_DOWNLOAD_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_ARTIFACTS_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_CANCEL_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_EVIDENCE_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_REJECT_PARTICIPANT_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_REMIND_PARTICIPANT_ROUTE,
  INTEGRATION_API_V1_SIGNING_SESSION_ROUTE,
} from './route';

describe('integration api v1 route', () => {
  beforeEach(() => {
    delete process.env.INTEGRATION_API_V1_ENABLED;
  });

  afterEach(() => {
    delete process.env.INTEGRATION_API_V1_ENABLED;
    vi.restoreAllMocks();
  });

  it('defaults to disabled and returns a not found response', async () => {
    const response = await getIntegrationApiV1CapabilitiesRoute();

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      message: 'Not found',
    });
    expect(INTEGRATION_API_V1_CAPABILITIES_ROUTE).toBe('/api/v1/integration/capabilities');
    expect(INTEGRATION_API_V1_SIGNING_REQUEST_EVIDENCE_ROUTE).toBe(
      '/api/v1/integration/signing-requests/:requestId/evidence',
    );
    expect(INTEGRATION_API_V1_SIGNING_REQUEST_ARTIFACTS_ROUTE).toBe(
      '/api/v1/integration/signing-requests/:requestId/artifacts',
    );
    expect(INTEGRATION_API_V1_SIGNING_REQUEST_ARTIFACT_DOWNLOAD_ROUTE).toBe(
      '/api/v1/integration/signing-requests/:requestId/artifacts/:artifactId/download',
    );
    expect(INTEGRATION_API_V1_SIGNING_SESSION_ROUTE).toBe(
      '/api/v1/integration/signing-requests/:requestId/participants/:participantId/signing-session',
    );
    expect(INTEGRATION_API_V1_SIGNING_REQUEST_REJECT_PARTICIPANT_ROUTE).toBe(
      '/api/v1/integration/signing-requests/:requestId/participants/:participantId/reject',
    );
    expect(INTEGRATION_API_V1_SIGNING_REQUEST_CANCEL_ROUTE).toBe(
      '/api/v1/integration/signing-requests/:requestId/cancel',
    );
    expect(INTEGRATION_API_V1_SIGNING_REQUEST_REMIND_PARTICIPANT_ROUTE).toBe(
      '/api/v1/integration/signing-requests/:requestId/participants/:participantId/remind',
    );
  });

  it('returns the expected read-only V1 capabilities when enabled', async () => {
    process.env.INTEGRATION_API_V1_ENABLED = 'true';

    const response = await getIntegrationApiV1CapabilitiesRoute();

    expect(response.status).toBe(200);

    if (response.status !== 200) {
      throw new Error('Expected the integration capabilities route to be enabled.');
    }

    expect(response.body.status).toBe('ok');
    expect(response.body.capabilities).toMatchObject({
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
      rejectionSupported: true,
      cancellationSupported: true,
      expiryProcessorSupported: true,
      remindersSupported: true,
      reminderRateLimitsSupported: true,
      terminalStateEnforcementSupported: true,
      immutableCompletedRequestsSupported: true,
      releasePhase: 'PHASE_6_LIFECYCLE_CONTROLS',
    });
  });

  it('does not invoke existing signing flows', async () => {
    process.env.INTEGRATION_API_V1_ENABLED = 'true';

    const response = await getIntegrationApiV1CapabilitiesRoute();

    expect(response.status).toBe(200);
    expect(createEnvelope).not.toHaveBeenCalled();
    expect(sendDocument).not.toHaveBeenCalled();
  });
});
