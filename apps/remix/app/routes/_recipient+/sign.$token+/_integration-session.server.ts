import {
  assertIntegrationSigningSessionTokenAccess,
  buildIntegrationSigningSessionCompletePath,
} from '@documenso/api/v1/integration/signing-sessions';

export const validateIntegrationSigningSessionAccessOrThrowNotFound = async ({
  sessionId,
  token,
}: {
  sessionId?: string;
  token: string;
}) => {
  if (!sessionId) {
    return;
  }

  await assertIntegrationSigningSessionTokenAccess({
    sessionId,
    token,
    allowCompletedParticipant: true,
  }).catch(() => {
    throw new Response('Not Found', { status: 404 });
  });
};

export const getIntegrationSigningCompletionPath = ({
  token,
  integrationSessionId,
  redirectUrl,
}: {
  token: string;
  integrationSessionId?: string;
  redirectUrl?: string | null;
}) =>
  integrationSessionId
    ? buildIntegrationSigningSessionCompletePath(integrationSessionId)
    : redirectUrl || `/sign/${token}/complete`;
