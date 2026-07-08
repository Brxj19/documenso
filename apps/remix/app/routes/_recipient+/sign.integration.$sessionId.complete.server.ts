import { getIntegrationSigningSessionCompletionRedirectUrl } from '@documenso/api/v1/integration/signing-sessions';
import { redirect } from 'react-router';

export const loadIntegrationSigningSessionCompletionRedirect = async ({ sessionId }: { sessionId: string }) => {
  const redirectUrl = await getIntegrationSigningSessionCompletionRedirectUrl({
    sessionId,
  });

  return redirect(redirectUrl);
};
