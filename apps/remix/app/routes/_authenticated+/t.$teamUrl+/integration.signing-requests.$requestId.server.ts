import { getIntegrationApiV1SigningRequest } from '@documenso/api/v1/integration/signing-requests';
import { getSession } from '@documenso/auth/server/lib/utils/get-session';
import { IS_INTEGRATION_API_V1_ENABLED } from '@documenso/lib/constants/app';
import { AppError } from '@documenso/lib/errors/app-error';
import { getTeamByUrl } from '@documenso/lib/server-only/team/get-team';

export const loadIntegrationSigningRequestPageData = async ({
  request,
  requestId,
  teamUrl,
}: {
  request: Request;
  requestId: string;
  teamUrl: string;
}) => {
  if (!IS_INTEGRATION_API_V1_ENABLED()) {
    throw new Response('Not Found', { status: 404 });
  }

  const { user } = await getSession(request);
  const team = await getTeamByUrl({
    userId: user.id,
    teamUrl,
  });

  const signingRequest = await getIntegrationApiV1SigningRequest({
    requestId,
    teamId: team.id,
  }).catch((error) => {
    const appError = AppError.parseError(error);

    if (appError.code === 'NOT_FOUND') {
      return null;
    }

    throw error;
  });

  if (!signingRequest) {
    throw new Response('Not Found', { status: 404 });
  }

  return {
    signingRequest,
    teamUrl,
  };
};
