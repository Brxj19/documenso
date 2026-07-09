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

const STAGE_STATUS_LABELS = {
  WAITING: msg`Waiting`,
  ACTIVE: msg`Active`,
  PARTIALLY_COMPLETED: msg`Partially Completed`,
  COMPLETED: msg`Completed`,
  BLOCKED: msg`Blocked`,
  REJECTED: msg`Rejected`,
  EXPIRED: msg`Expired`,
  CANCELLED: msg`Cancelled`,
  FAILED: msg`Failed`,
} as const;

const PARTICIPANT_STATUS_LABELS = {
  WAITING: msg`Waiting`,
  AVAILABLE: msg`Available`,
  VIEWED: msg`Viewed`,
  COMPLETED: msg`Completed`,
  REJECTED: msg`Rejected`,
  EXPIRED: msg`Expired`,
  CANCELLED: msg`Cancelled`,
  FAILED: msg`Failed`,
} as const;

const EVENT_SOURCE_LABELS = {
  API: msg`API`,
  SIGNING_SESSION: msg`Signing Session`,
  ENGINE_COMPLETION: msg`Engine Completion`,
  RECONCILIATION: msg`Reconciliation`,
  CALLBACK: msg`Callback`,
  SYSTEM: msg`System`,
} as const;

const CALLBACK_STATE_LABELS = {
  PENDING: msg`Pending`,
  DELIVERING: msg`Delivering`,
  DELIVERED: msg`Delivered`,
  FAILED_RETRYABLE: msg`Retry Scheduled`,
  FAILED_FINAL: msg`Failed`,
} as const;

const INTEGRITY_STATUS_LABELS = {
  HASH_VERIFIED: msg`Hash Verified`,
  HASH_MISMATCH: msg`Hash Mismatch`,
  SIGNATURE_VALIDATION_NOT_AVAILABLE: msg`Signature Validation Not Available`,
} as const;

const BLOCKED_REASON_LABELS = {
  REQUEST_NOT_ACTIVE: msg`Request not active yet`,
  PREVIOUS_STAGE_INCOMPLETE: msg`Previous stage incomplete`,
  REQUEST_TERMINATED: msg`Request terminated`,
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
  const { evidence, signingRequest, teamUrl } = loaderData;
  const stagedParticipants = signingRequest.participants.filter((participant) => participant.stageOrder !== undefined);
  const observerParticipants = signingRequest.participants.filter(
    (participant) => participant.stageOrder === undefined,
  );
  const finalArtifact = evidence.finalArtifact;

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
            <DetailsCard label={<Trans>Routing policy</Trans>}>
              <DetailsValue>ALL_REQUIRED</DetailsValue>
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              <Trans>Final Artifact</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <DetailsCard label={<Trans>Artifact status</Trans>}>
              <DetailsValue>{finalArtifact ? 'Available' : 'Not available'}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Filename</Trans>}>
              <DetailsValue>{finalArtifact?.filename ?? 'Not available'}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Final SHA-256</Trans>}>
              <DetailsValue isSelectable>
                {evidence.finalSha256?.value ? truncateHash(evidence.finalSha256.value) : 'Not available'}
              </DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Integrity</Trans>}>
              <DetailsValue>
                {finalArtifact ? t(INTEGRITY_STATUS_LABELS[finalArtifact.integrityStatus]) : 'Not available'}
              </DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Captured at</Trans>}>
              <DetailsValue isMono={false}>{formatDateTime(finalArtifact?.capturedAt)}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Callback deliveries</Trans>}>
              <DetailsValue>{String(evidence.callbacks.deliveries.length)}</DetailsValue>
            </DetailsCard>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              <Trans>Evidence Summary</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <DetailsCard label={<Trans>Request correlation</Trans>}>
              <DetailsValue isSelectable>{evidence.correlationId}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Client correlation</Trans>}>
              <DetailsValue isSelectable>{evidence.clientCorrelationId ?? 'Not available'}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Normalized events</Trans>}>
              <DetailsValue>{String(evidence.events.length)}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Last reconciled</Trans>}>
              <DetailsValue isMono={false}>{formatDateTime(evidence.reconciliation.lastReconciledAt)}</DetailsValue>
            </DetailsCard>
            <DetailsCard label={<Trans>Certificate evidence</Trans>}>
              <DetailsValue>
                {evidence.certificateMetadata?.certificatePdfAvailable ? 'Certificate available' : 'Not available'}
              </DetailsValue>
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
                      <p className="text-muted-foreground text-sm">
                        <Trans>Completion policy:</Trans> {stage.completionPolicy}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{t(STAGE_STATUS_LABELS[stage.status])}</Badge>
                    </div>
                  </div>

                  {stage.blockedReason ? (
                    <p className="mt-3 text-muted-foreground text-sm">
                      <Trans>Blocked reason:</Trans> {t(BLOCKED_REASON_LABELS[stage.blockedReason])}
                    </p>
                  ) : null}

                  {stage.completedAt ? (
                    <p className="mt-2 text-muted-foreground text-sm">
                      <Trans>Completed at:</Trans> {formatDateTime(stage.completedAt)}
                    </p>
                  ) : null}

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

                        <div className="mt-3 flex flex-wrap gap-4 text-muted-foreground text-sm">
                          <span>
                            <Trans>Actionable:</Trans> {participant.isActionable ? 'Yes' : 'No'}
                          </span>
                          <span>
                            <Trans>Native order:</Trans> {participant.nativeSigningOrder ?? 'Not available'}
                          </span>
                          <span>
                            <Trans>Status updated:</Trans> {formatDateTime(participant.statusUpdatedAt)}
                          </span>
                        </div>

                        {participant.blockedReason ? (
                          <p className="mt-2 text-muted-foreground text-sm">
                            <Trans>Blocked reason:</Trans> {t(BLOCKED_REASON_LABELS[participant.blockedReason])}
                          </p>
                        ) : null}

                        {participant.completedAt ? (
                          <p className="mt-2 text-muted-foreground text-sm">
                            <Trans>Completed at:</Trans> {formatDateTime(participant.completedAt)}
                          </p>
                        ) : null}

                        {participant.rejectedAt ? (
                          <p className="mt-2 text-red-500/80 text-sm">
                            <Trans>Rejected at:</Trans> {formatDateTime(participant.rejectedAt)}
                          </p>
                        ) : null}
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

                  <div className="mt-3 flex flex-wrap gap-4 text-muted-foreground text-sm">
                    <span>
                      <Trans>Status updated:</Trans> {formatDateTime(participant.statusUpdatedAt)}
                    </span>
                    <span>
                      <Trans>Actionable:</Trans> {participant.isActionable ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              <Trans>Participant Timeline</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {signingRequest.timeline.map((entry) => (
              <div key={entry.participantId} className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{entry.displayName ?? entry.email}</p>
                    <p className="text-muted-foreground text-sm">{entry.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{entry.role}</Badge>
                    <Badge variant="secondary">{t(PARTICIPANT_STATUS_LABELS[entry.status])}</Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-muted-foreground text-sm">
                  <span>
                    <Trans>Stage:</Trans> {entry.stageOrder ?? 'Read only'}
                  </span>
                  <span>
                    <Trans>Stage status:</Trans>{' '}
                    {entry.stageStatus ? t(STAGE_STATUS_LABELS[entry.stageStatus]) : 'Not available'}
                  </span>
                  <span>
                    <Trans>Native order:</Trans> {entry.nativeSigningOrder ?? 'Not available'}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-4 text-muted-foreground text-sm">
                  <span>
                    <Trans>Status updated:</Trans> {formatDateTime(entry.statusUpdatedAt)}
                  </span>
                  <span>
                    <Trans>Completed at:</Trans> {formatDateTime(entry.completedAt)}
                  </span>
                  {entry.rejectedAt ? (
                    <span className="text-red-500/80">
                      <Trans>Rejected at:</Trans> {formatDateTime(entry.rejectedAt)}
                    </span>
                  ) : null}
                </div>

                {entry.blockedReason ? (
                  <p className="mt-2 text-muted-foreground text-sm">
                    <Trans>Blocked reason:</Trans> {t(BLOCKED_REASON_LABELS[entry.blockedReason])}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              <Trans>Event Timeline</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {evidence.events.map((event) => (
              <div key={event.eventId} className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{event.eventType}</p>
                    <p className="text-muted-foreground text-sm">{t(EVENT_SOURCE_LABELS[event.source])}</p>
                  </div>
                  <Badge variant="secondary">
                    {event.statusAfter ? t(STATUS_LABELS[event.statusAfter]) : t(STATUS_LABELS[signingRequest.status])}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-muted-foreground text-sm">
                  <span>
                    <Trans>Occurred:</Trans> {formatDateTime(event.eventTimestamp)}
                  </span>
                  <span>
                    <Trans>Observed:</Trans> {formatDateTime(event.observedAt)}
                  </span>
                  <span>
                    <Trans>Participant:</Trans> {event.participantId ?? 'Not available'}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              <Trans>Callback Deliveries</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {evidence.callbacks.deliveries.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Trans>No callback deliveries are queued for this request.</Trans>
              </p>
            ) : (
              evidence.callbacks.deliveries.map((delivery) => (
                <div key={delivery.deliveryId} className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{delivery.deliveryId}</p>
                      <p className="text-muted-foreground text-sm">{delivery.targetUrl}</p>
                    </div>
                    <Badge variant="secondary">{t(CALLBACK_STATE_LABELS[delivery.deliveryState])}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-muted-foreground text-sm">
                    <span>
                      <Trans>Attempts:</Trans> {delivery.attemptCount}/{delivery.maxAttempts}
                    </span>
                    <span>
                      <Trans>Next attempt:</Trans> {formatDateTime(delivery.nextAttemptAt)}
                    </span>
                    <span>
                      <Trans>Last HTTP status:</Trans> {delivery.lastHttpStatus ?? 'Not available'}
                    </span>
                  </div>

                  {delivery.lastErrorSummary ? (
                    <p className="mt-2 text-muted-foreground text-sm">{delivery.lastErrorSummary}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
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
