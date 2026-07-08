import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getLaunchRedirectUrlMock, getCompletionRedirectUrlMock } = vi.hoisted(() => ({
  getLaunchRedirectUrlMock: vi.fn(),
  getCompletionRedirectUrlMock: vi.fn(),
}));

vi.mock('@documenso/api/v1/integration/signing-sessions', () => ({
  getIntegrationSigningSessionLaunchRedirectUrl: getLaunchRedirectUrlMock,
  getIntegrationSigningSessionCompletionRedirectUrl: getCompletionRedirectUrlMock,
}));

import { loader as launchLoader } from '../routes/_recipient+/sign.integration.$sessionId';
import { loader as completionLoader } from '../routes/_recipient+/sign.integration.$sessionId.complete';
import { loadIntegrationSigningSessionCompletionRedirect } from '../routes/_recipient+/sign.integration.$sessionId.complete.server';
import { loadIntegrationSigningSessionLaunchRedirect } from '../routes/_recipient+/sign.integration.$sessionId.server';

describe('integration signing session public routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('redirects the launch wrapper into the native signing route', async () => {
    getLaunchRedirectUrlMock.mockResolvedValue(
      'http://localhost:3000/sign/token-123?integrationSessionId=integration_session_123',
    );

    const response = await loadIntegrationSigningSessionLaunchRedirect({
      sessionId: 'integration_session_123',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'http://localhost:3000/sign/token-123?integrationSessionId=integration_session_123',
    );
  });

  it('redirects the completion wrapper to the safe return url', async () => {
    getCompletionRedirectUrlMock.mockResolvedValue(
      'http://localhost:3000/return?requestId=integration_request_123&participantId=participant-1&status=COMPLETED',
    );

    const response = await loadIntegrationSigningSessionCompletionRedirect({
      sessionId: 'integration_session_123',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'http://localhost:3000/return?requestId=integration_request_123&participantId=participant-1&status=COMPLETED',
    );
  });

  it('maps invalid launch and completion sessions to 404 responses', async () => {
    getLaunchRedirectUrlMock.mockRejectedValue(
      new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Signing session has expired.',
      }),
    );
    getCompletionRedirectUrlMock.mockRejectedValue(
      new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Signing session not found',
      }),
    );

    await expect(
      launchLoader({
        params: {
          sessionId: 'integration_session_expired',
        },
      } as never),
    ).rejects.toMatchObject({
      status: 404,
    });

    await expect(
      completionLoader({
        params: {
          sessionId: 'integration_session_missing',
        },
      } as never),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
