import { AppError } from '@documenso/lib/errors/app-error';
import type { Route } from './+types/sign.integration.$sessionId';
import { loadIntegrationSigningSessionLaunchRedirect } from './sign.integration.$sessionId.server';

export async function loader({ params }: Route.LoaderArgs) {
  try {
    return await loadIntegrationSigningSessionLaunchRedirect({
      sessionId: params.sessionId,
    });
  } catch (error) {
    const appError = AppError.parseError(error);

    if (appError.code === 'NOT_FOUND' || appError.code === 'INVALID_REQUEST') {
      throw new Response('Not Found', { status: 404 });
    }

    throw error;
  }
}

export default function IntegrationSigningSessionLaunchRoute() {
  return null;
}
