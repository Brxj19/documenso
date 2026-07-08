import { Badge } from '@documenso/ui/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { DateTime } from 'luxon';
import { isRouteErrorResponse, Link } from 'react-router';

import { DetailsCard, DetailsValue } from '~/components/general/admin-details';
import { GenericErrorLayout } from '~/components/general/generic-error-layout';
import type { Route } from './+types/integration.signing-requests.$requestId';
import { loadIntegrationSigningRequestPageData } from './integration.signing-requests.$requestId.server';

const formatDateTime = (value?: string) => {
  if (!value) {
    return 'Not available';
  }

  return DateTime.fromISO(value).toLocaleString(DateTime.DATETIME_MED);
};

const truncateHash = (value: string) => `${value.slice(0, 12)}...${value.slice(-12)}`;

const STATUS_LABELS = {
  DRAFT: msg`Draft`,
  READY: msg`Ready`,
  IN_PROGRESS: msg`In Progress`,
  PARTIALLY_COMPLETED: msg`Partially Completed`,
  COMPLETED: msg`Completed`,
  REJECTED: msg`Rejected`,
  EXPIRED: msg`Expired`,
  CANCELLED: msg`Cancelled`,
  FAILED: msg`Failed`,
} as const;

const PARTICIPANT_STATUS_LABELS = {
  NOT_STARTED: msg`Not Started`,
  IN_PROGRESS: msg`In Progress`,
  WAITING_FOR_TURN: msg`Waiting For Turn`,
  COMPLETED: msg`Completed`,
  REJECTED: msg`Rejected`,
  NOT_REQUIRED: msg`Read Only`,
} as const;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadIntegrationSigningRequestPageData({
    request,
    requestId: params.requestId,
    teamUrl: params.teamUrl,
  });
}

export default function IntegrationSigningRequestPage({ loaderData }: Route.ComponentProps) {
  const { t } = useLingui();
  const { signingRequest, teamUrl } = loaderData;
  const stagedParticipants = signingRequest.participants.filter((participant) => participant.stageOrder !== undefined);
  const observerParticipants = signingRequest.participants.filter(
    (participant) => participant.stageOrder === undefined,
  );

  return (
    <div className="mx-auto w-full max-w-screen-xl px-4 md:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">
            <Trans>Reusable signing request</Trans>
          </p>
          <h1 className="mt-1 font-semibold text-3xl text-foreground">{signingRequest.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{t(STATUS_LABELS[signingRequest.status])}</Badge>
            <span className="text-muted-foreground text-sm">
              <Trans>External reference:</Trans> {signingRequest.externalReference}
            </span>
          </div>
        </div>

        {signingRequest.nativeDocument?.envelopeId ? (
          <Link
            to={`/t/${teamUrl}/documents/${signingRequest.nativeDocument.envelopeId}`}
            className="text-documenso-700 text-sm hover:opacity-80"
          >
            <Trans>Open native document</Trans>
          </Link>
        ) : null}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              <Trans>Request Summary</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <DetailsCard label={<Trans>Source reference</Trans>}>
              <DetailsValue isSelectable>{signingRequest.document.sourceReference}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Source filename</Trans>}>
              <DetailsValue>{signingRequest.document.filename}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Verified SHA-256</Trans>}>
              <DetailsValue isSelectable>
                {truncateHash(signingRequest.document.verifiedContentHash.value)}
              </DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Expires at</Trans>}>
              <DetailsValue isMono={false}>{formatDateTime(signingRequest.expiresAt)}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Created at</Trans>}>
              <DetailsValue isMono={false}>{formatDateTime(signingRequest.createdAt)}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Updated at</Trans>}>
              <DetailsValue isMono={false}>{formatDateTime(signingRequest.updatedAt)}</DetailsValue>
            </DetailsCard>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              <Trans>Native Mapping</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <DetailsCard label={<Trans>Envelope ID</Trans>}>
              <DetailsValue isSelectable>{signingRequest.nativeDocument?.envelopeId ?? 'Not available'}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Document ID</Trans>}>
              <DetailsValue>{signingRequest.nativeDocument?.documentId?.toString() ?? 'Not available'}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Native status</Trans>}>
              <DetailsValue>{signingRequest.nativeDocument?.status ?? 'Not available'}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Correlation ID</Trans>}>
              <DetailsValue>{signingRequest.correlationId ?? 'Not available'}</DetailsValue>
            </DetailsCard>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              <Trans>Signing Stages</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {signingRequest.stages.map((stage) => {
              const participants = stagedParticipants.filter((participant) => participant.stageOrder === stage.order);

              return (
                <div key={stage.order} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-foreground">
                        <Trans>Stage {stage.order}</Trans>
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        <Trans>Native signing order:</Trans> {stage.nativeSigningOrder}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {participants.map((participant) => (
                      <div
                        key={participant.participantId}
                        className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {participant.displayName ?? participant.email}
                            </p>
                            <p className="text-muted-foreground text-sm">{participant.email}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="neutral">{participant.role}</Badge>
                            <Badge variant="secondary">{t(PARTICIPANT_STATUS_LABELS[participant.status])}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {observerParticipants.length > 0 ? (
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle>
                <Trans>Read-Only Participants</Trans>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {observerParticipants.map((participant) => (
                <div
                  key={participant.participantId}
                  className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{participant.displayName ?? participant.email}</p>
                      <p className="text-muted-foreground text-sm">{participant.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{participant.role}</Badge>
                      <Badge variant="secondary">{t(PARTICIPANT_STATUS_LABELS[participant.status])}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const errorCode = isRouteErrorResponse(error) ? error.status : 500;

  return (
    <GenericErrorLayout
      errorCode={errorCode}
      errorCodeMap={{
        404: {
          heading: msg`Signing request not found`,
          subHeading: msg`404 Signing request not found`,
          message: msg`The signing request you are looking for could not be found or is not available for this team.`,
        },
      }}
      primaryButton={null}
      secondaryButton={null}
    />
  );
}
