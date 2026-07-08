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

export const getIntegrationApiV1Capabilities = (): TIntegrationApiV1CapabilitySchema =>
  ZIntegrationApiV1CapabilitySchema.parse({
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
