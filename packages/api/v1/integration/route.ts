import { IS_INTEGRATION_API_V1_ENABLED } from '@documenso/lib/constants/app';

import {
  type TIntegrationApiV1CapabilitySchema,
  type TIntegrationApiV1HealthResponseSchema,
  ZIntegrationApiV1CapabilitySchema,
  ZIntegrationApiV1HealthResponseSchema,
} from './schema';

export const INTEGRATION_API_V1_CAPABILITIES_ROUTE = '/api/v1/integration/capabilities';
export const INTEGRATION_API_V1_SIGNING_REQUESTS_ROUTE = '/api/v1/integration/signing-requests';
export const INTEGRATION_API_V1_SIGNING_REQUEST_ROUTE = '/api/v1/integration/signing-requests/:requestId';
export const INTEGRATION_API_V1_SIGNING_REQUEST_SEND_ROUTE = '/api/v1/integration/signing-requests/:requestId/send';
export const INTEGRATION_API_V1_SIGNING_REQUEST_EVIDENCE_ROUTE =
  '/api/v1/integration/signing-requests/:requestId/evidence';
export const INTEGRATION_API_V1_SIGNING_REQUEST_ARTIFACTS_ROUTE =
  '/api/v1/integration/signing-requests/:requestId/artifacts';
export const INTEGRATION_API_V1_SIGNING_REQUEST_ARTIFACT_DOWNLOAD_ROUTE =
  '/api/v1/integration/signing-requests/:requestId/artifacts/:artifactId/download';
export const INTEGRATION_API_V1_SIGNING_SESSION_ROUTE =
  '/api/v1/integration/signing-requests/:requestId/participants/:participantId/signing-session';

export const getIntegrationApiV1Capabilities = (): TIntegrationApiV1CapabilitySchema =>
  ZIntegrationApiV1CapabilitySchema.parse({
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

export const getIntegrationApiV1HealthResponse = (): TIntegrationApiV1HealthResponseSchema =>
  ZIntegrationApiV1HealthResponseSchema.parse({
    status: 'ok',
    timestamp: new Date().toISOString(),
    capabilities: getIntegrationApiV1Capabilities(),
  });

export const getIntegrationApiV1CapabilitiesRoute = () => {
  if (!IS_INTEGRATION_API_V1_ENABLED()) {
    return {
      status: 404 as const,
      body: {
        message: 'Not found',
      },
    };
  }

  return {
    status: 200 as const,
    body: getIntegrationApiV1HealthResponse(),
  };
};
