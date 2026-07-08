import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getIntegrationApiV1SigningRequestMock, getSessionMock, getTeamByUrlMock, isIntegrationApiEnabledMock } =
  vi.hoisted(() => ({
    getIntegrationApiV1SigningRequestMock: vi.fn(),
    getSessionMock: vi.fn(),
    getTeamByUrlMock: vi.fn(),
    isIntegrationApiEnabledMock: vi.fn(),
  }));

vi.mock('@documenso/api/v1/integration/signing-requests', () => ({
  getIntegrationApiV1SigningRequest: getIntegrationApiV1SigningRequestMock,
}));

vi.mock('@documenso/auth/server/lib/utils/get-session', () => ({
  getSession: getSessionMock,
}));

vi.mock('@documenso/lib/server-only/team/get-team', () => ({
  getTeamByUrl: getTeamByUrlMock,
}));

vi.mock('@documenso/lib/constants/app', () => ({
  IS_INTEGRATION_API_V1_ENABLED: isIntegrationApiEnabledMock,
}));

import { loadIntegrationSigningRequestPageData } from '../routes/_authenticated+/t.$teamUrl+/integration.signing-requests.$requestId.server';

describe('integration signing request details route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 404 when the integration api v1 feature flag is disabled', async () => {
    isIntegrationApiEnabledMock.mockReturnValue(false);

    await expect(
      loadIntegrationSigningRequestPageData({
        request: new Request('http://localhost:3000/t/test-team/integration/signing-requests/request-1'),
        teamUrl: 'test-team',
        requestId: 'request-1',
      }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('loads the normalized signing-request view model for the team route', async () => {
    isIntegrationApiEnabledMock.mockReturnValue(true);
    getSessionMock.mockResolvedValue({
      user: {
        id: 42,
      },
    });
    getTeamByUrlMock.mockResolvedValue({
      id: 7,
    });
    getIntegrationApiV1SigningRequestMock.mockResolvedValue({
      requestId: 'request-1',
      externalReference: 'request-1',
      title: 'Provider Neutral Request',
      status: 'READY',
      document: {
        sourceReference: 'document_123',
        filename: 'phase-2-source.pdf',
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
    });

    const result = await loadIntegrationSigningRequestPageData({
      request: new Request('http://localhost:3000/t/test-team/integration/signing-requests/request-1'),
      teamUrl: 'test-team',
      requestId: 'request-1',
    });

    expect(getTeamByUrlMock).toHaveBeenCalledWith({
      userId: 42,
      teamUrl: 'test-team',
    });
    expect(getIntegrationApiV1SigningRequestMock).toHaveBeenCalledWith({
      requestId: 'request-1',
      teamId: 7,
    });
    expect(result).toMatchObject({
      teamUrl: 'test-team',
      signingRequest: {
        requestId: 'request-1',
        status: 'READY',
      },
    });
  });
});
