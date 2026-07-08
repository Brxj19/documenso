import {
  INTEGRATION_API_V1_RETURN_URL_ALLOWLIST,
  IS_INTEGRATION_API_V1_ENABLED,
  NEXT_PUBLIC_WEBAPP_URL,
} from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prefixedId } from '@documenso/lib/universal/id';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, type IntegrationSigningSessionMode } from '@prisma/client';
import { reconcileIntegrationApiV1SigningRequest } from './evidence';
import type {
  TIntegrationApiV1CreateSigningSessionResponseSchema,
  TIntegrationApiV1CreateSigningSessionSchema,
} from './schema';
import { ZIntegrationApiV1CreateSigningSessionResponseSchema } from './schema';
import { getIntegrationApiV1SigningRequest } from './signing-requests';
import { validateAbsoluteAllowlistedUrl } from './url-allowlist';

const DEFAULT_SIGNING_SESSION_TTL_SECONDS = 15 * 60;
const MAX_SIGNING_SESSION_TTL_SECONDS = 60 * 60;

type CreateIntegrationSigningSessionOptions = {
  requestId: string;
  participantId: string;
  teamId: number;
  request: TIntegrationApiV1CreateSigningSessionSchema;
};

type IntegrationSigningSessionAccessOptions = {
  sessionId: string;
  token?: string;
  allowCompletedParticipant?: boolean;
};

const buildAbsoluteUrl = (pathname: string) => new URL(pathname, NEXT_PUBLIC_WEBAPP_URL()).toString();

export const buildIntegrationSigningSessionLaunchPath = (sessionId: string) => `/sign/integration/${sessionId}`;

export const buildIntegrationSigningSessionCompletePath = (sessionId: string) =>
  `/sign/integration/${sessionId}/complete`;

const assertIntegrationApiV1Enabled = () => {
  if (!IS_INTEGRATION_API_V1_ENABLED()) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signing session not found',
    });
  }
};

const assertSupportedSigningSessionMode = (mode: TIntegrationApiV1CreateSigningSessionSchema['mode']) => {
  if (mode === 'EMBED') {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Integration signing sessions currently support REDIRECT mode only.',
    });
  }

  return mode ?? 'REDIRECT';
};

export const validateIntegrationApiV1ReturnUrl = (value?: string) => {
  return validateAbsoluteAllowlistedUrl({
    value,
    allowlistValues: INTEGRATION_API_V1_RETURN_URL_ALLOWLIST(),
    label: 'returnUrl',
    allowlistErrorMessage: 'returnUrl is not allowlisted for integration signing sessions.',
  });
};

const buildSafeCompletionReturnUrl = ({
  returnUrl,
  requestId,
  participantId,
  status,
  clientState,
}: {
  returnUrl: string;
  requestId: string;
  participantId: string;
  status: string;
  clientState?: string | null;
}) => {
  const url = new URL(returnUrl);

  url.searchParams.set('requestId', requestId);
  url.searchParams.set('participantId', participantId);
  url.searchParams.set('status', status);

  if (clientState) {
    url.searchParams.set('clientState', clientState);
  }

  return url.toString();
};

const loadIntegrationSigningSessionState = async ({
  sessionId,
  token,
  allowCompletedParticipant = false,
}: IntegrationSigningSessionAccessOptions) => {
  assertIntegrationApiV1Enabled();

  const session = await prisma.integrationSigningSession.findFirst({
    where: {
      id: sessionId,
    },
    include: {
      nativeRecipient: true,
      participant: true,
      signingRequest: true,
    },
  });

  if (!session?.nativeRecipient) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signing session not found',
    });
  }

  if (token && session.nativeRecipient.token !== token) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signing session not found',
    });
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Signing session has expired.',
    });
  }

  const signingRequest = await getIntegrationApiV1SigningRequest({
    requestId: session.signingRequestId,
    teamId: session.signingRequest.teamId,
  });

  const participant = signingRequest.participants.find(
    (candidate) => candidate.participantId === session.participant.participantId,
  );

  if (!participant) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signing session not found',
    });
  }

  if (participant.status === 'COMPLETED' && allowCompletedParticipant) {
    return {
      session,
      participant,
      signingRequest,
    };
  }

  if (participant.status === 'COMPLETED') {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Participant has already completed this signing request.',
    });
  }

  if (
    participant.status === 'REJECTED' ||
    participant.status === 'EXPIRED' ||
    participant.status === 'CANCELLED' ||
    participant.status === 'FAILED'
  ) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Participant is no longer eligible for signing.',
    });
  }

  if (participant.isBlocked || !participant.isActionable || !['AVAILABLE', 'VIEWED'].includes(participant.status)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Participant is not currently actionable for signing.',
    });
  }

  return {
    session,
    participant,
    signingRequest,
  };
};

export const createIntegrationApiV1SigningSession = async ({
  requestId,
  participantId,
  teamId,
  request,
}: CreateIntegrationSigningSessionOptions): Promise<TIntegrationApiV1CreateSigningSessionResponseSchema> => {
  assertIntegrationApiV1Enabled();

  const mode = assertSupportedSigningSessionMode(request.mode);
  const returnUrl = validateIntegrationApiV1ReturnUrl(request.returnUrl);
  const ttlSeconds = Math.min(
    request.ttlSeconds ?? DEFAULT_SIGNING_SESSION_TTL_SECONDS,
    MAX_SIGNING_SESSION_TTL_SECONDS,
  );

  const [integrationRequest, signingRequest] = await Promise.all([
    prisma.integrationSigningRequest.findFirst({
      where: {
        id: requestId,
        teamId,
      },
      include: {
        envelope: true,
        participants: {
          include: {
            nativeRecipient: true,
          },
        },
      },
    }),
    getIntegrationApiV1SigningRequest({
      requestId,
      teamId,
    }).catch(() => null),
  ]);

  if (!integrationRequest || !signingRequest) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Signing request not found',
    });
  }

  const participantRecord = integrationRequest.participants.find(
    (candidate) => candidate.participantId === participantId,
  );
  const participantState = signingRequest.participants.find((candidate) => candidate.participantId === participantId);

  if (!participantRecord || !participantState) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Participant not found',
    });
  }

  if (!integrationRequest.envelope || integrationRequest.envelope.status !== DocumentStatus.PENDING) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Signing request must be active before creating signing sessions.',
    });
  }

  if (!['IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(signingRequest.status)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Signing request is not currently active.',
    });
  }

  if (!participantRecord.nativeRecipient || !participantRecord.nativeRecipientId) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Participant does not map to a native signing recipient.',
    });
  }

  if (
    participantState.isBlocked ||
    !participantState.isActionable ||
    !['AVAILABLE', 'VIEWED'].includes(participantState.status)
  ) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Participant is not currently actionable for signing.',
    });
  }

  const sessionId = prefixedId('integration_session');
  const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);

  await prisma.integrationSigningSession.create({
    data: {
      id: sessionId,
      signingRequestId: integrationRequest.id,
      signingRequestParticipantId: participantRecord.id,
      nativeRecipientId: participantRecord.nativeRecipientId,
      mode: mode as IntegrationSigningSessionMode,
      returnUrl,
      clientState: request.clientState,
      expiresAt,
    },
  });

  return ZIntegrationApiV1CreateSigningSessionResponseSchema.parse({
    sessionId,
    requestId: integrationRequest.id,
    participantId: participantState.participantId,
    mode,
    expiresAt: expiresAt.toISOString(),
    launchUrl: buildAbsoluteUrl(buildIntegrationSigningSessionLaunchPath(sessionId)),
    returnUrl,
    clientState: request.clientState,
    participantStatus: participantState.status,
    requestStatus: signingRequest.status,
    embeddedSupported: false,
  });
};

export const getIntegrationSigningSessionLaunchRedirectUrl = async ({ sessionId }: { sessionId: string }) => {
  const { session, participant } = await loadIntegrationSigningSessionState({
    sessionId,
    allowCompletedParticipant: true,
  });

  if (participant.status === 'COMPLETED') {
    return buildAbsoluteUrl(buildIntegrationSigningSessionCompletePath(session.id));
  }

  await prisma.integrationSigningSession.update({
    where: {
      id: session.id,
    },
    data: {
      launchedAt: new Date(),
    },
  });

  const url = new URL(`/sign/${session.nativeRecipient.token}`, NEXT_PUBLIC_WEBAPP_URL());
  url.searchParams.set('integrationSessionId', session.id);

  return url.toString();
};

export const assertIntegrationSigningSessionTokenAccess = async ({
  sessionId,
  token,
  allowCompletedParticipant = false,
}: {
  sessionId: string;
  token: string;
  allowCompletedParticipant?: boolean;
}) => {
  return await loadIntegrationSigningSessionState({
    sessionId,
    token,
    allowCompletedParticipant,
  });
};

export const getIntegrationSigningSessionCompletionRedirectUrl = async ({ sessionId }: { sessionId: string }) => {
  const { session, participant } = await loadIntegrationSigningSessionState({
    sessionId,
    allowCompletedParticipant: true,
  });

  if (participant.status !== 'COMPLETED') {
    return buildAbsoluteUrl(buildIntegrationSigningSessionLaunchPath(session.id));
  }

  await prisma.integrationSigningSession.update({
    where: {
      id: session.id,
    },
    data: {
      completedAt: session.completedAt ?? new Date(),
    },
  });

  await reconcileIntegrationApiV1SigningRequest({
    requestId: session.signingRequestId,
    teamId: session.signingRequest.teamId,
    source: 'SIGNING_SESSION',
  });

  if (session.returnUrl) {
    return buildSafeCompletionReturnUrl({
      returnUrl: session.returnUrl,
      requestId: session.signingRequestId,
      participantId: session.participant.participantId,
      status: participant.status,
      clientState: session.clientState,
    });
  }

  return buildAbsoluteUrl(`/sign/${session.nativeRecipient.token}/complete`);
};
