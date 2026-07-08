import { AppError } from '@documenso/lib/errors/app-error';
import { getApiTokenByToken } from '@documenso/lib/server-only/public-api/get-api-token-by-token';
import contentDisposition from 'content-disposition';

import { getIntegrationApiV1SigningRequestArtifactDownload } from './evidence';

const getTokenFromAuthorizationHeader = (authorizationHeader?: string | null) => {
  const [token] = (authorizationHeader || '').split('Bearer ').filter((value) => value.length > 0);

  return token ?? null;
};

export const getIntegrationApiV1ArtifactDownloadResponse = async ({
  authorizationHeader,
  requestId,
  artifactId,
}: {
  authorizationHeader?: string | null;
  requestId: string;
  artifactId: string;
}) => {
  const token = getTokenFromAuthorizationHeader(authorizationHeader);

  if (!token) {
    return new Response(JSON.stringify({ message: 'API token was not provided' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  try {
    const apiToken = await getApiTokenByToken({
      token,
    });

    const { artifact, bytes, etag } = await getIntegrationApiV1SigningRequestArtifactDownload({
      requestId,
      artifactId,
      teamId: apiToken.team.id,
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ETag: etag,
        'Content-Disposition': contentDisposition(artifact.filename),
      },
    });
  } catch (error) {
    const appError = AppError.parseError(error);

    const status = appError.code === 'NOT_FOUND' ? 404 : appError.code === 'UNAUTHORIZED' ? 401 : 400;

    return new Response(JSON.stringify({ message: appError.message }), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
