import { sendDocument } from '@documenso/lib/server-only/document/send-document';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@documenso/lib/server-only/document/send-document', () => ({
  sendDocument: vi.fn(),
}));

vi.mock('@documenso/lib/server-only/envelope/create-envelope', () => ({
  createEnvelope: vi.fn(),
}));

import { getIntegrationApiV1CapabilitiesRoute, INTEGRATION_API_V1_CAPABILITIES_ROUTE } from './route';

describe('integration api v1 route', () => {
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
      supportedDocumentCount: {
        minimum: 1,
        maximum: 1,
        multipleDocuments: false,
      },
      releasePhase: 'PHASE_2_SIGNING_REQUESTS',
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
