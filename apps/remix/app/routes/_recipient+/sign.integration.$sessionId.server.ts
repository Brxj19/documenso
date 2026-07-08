import { getIntegrationSigningSessionLaunchRedirectUrl } from '@documenso/api/v1/integration/signing-sessions';
import { redirect } from 'react-router';

export const loadIntegrationSigningSessionLaunchRedirect = async ({ sessionId }: { sessionId: string }) => {
  const redirectUrl = await getIntegrationSigningSessionLaunchRedirectUrl({
    sessionId,
  });

  return redirect(redirectUrl);
};
