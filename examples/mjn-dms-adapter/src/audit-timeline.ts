import type { IntegrationApiArtifact, IntegrationApiEvent, MJNAuditEntry, MJNAuditEventType } from './types';

export const buildMjnAuditTimeline = (
  requestId: string,
  dossierId: string,
  fileId: string,
  fileVersionId: string,
  events: IntegrationApiEvent[],
  artifacts: IntegrationApiArtifact[],
  finalArtifact?: IntegrationApiArtifact,
): MJNAuditEntry[] => {
  const entries: MJNAuditEntry[] = [];

  for (const event of events) {
    const mjnEventType = mapEventType(event.eventType);
    if (!mjnEventType) {
      continue;
    }

    const artifactId = resolveArtifactIdForEvent(event, artifacts, finalArtifact);

    entries.push({
      auditEntryId: `audit-${event.eventId}`,
      dossierId,
      fileId,
      fileVersionId,
      eventType: mjnEventType,
      actorRole: event.actorReference ?? event.participantId ?? null,
      actorName: event.participantId ?? null,
      message: formatMjnMessage(mjnEventType, event.participantId),
      signingRequestId: requestId,
      evidenceReference: null,
      artifactReference: artifactId,
      timestamp: event.eventTimestamp,
    });
  }

  return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
};

const RESOLVE_EVENT_MAP: Record<string, MJNAuditEventType> = {
  REQUEST_CREATED: 'SIGNING_REQUEST_CREATED',
  REQUEST_SENT: 'SIGNING_REQUEST_SENT',
  PARTICIPANT_COMPLETED: 'PARTICIPANT_SIGNED',
  PARTICIPANT_REJECTED: 'SIGNING_REJECTED',
  REQUEST_COMPLETED: 'SIGNING_COMPLETED',
  REQUEST_REJECTED: 'SIGNING_REJECTED',
  REQUEST_CANCELLED: 'SIGNING_CANCELLED',
  REQUEST_EXPIRED: 'SIGNING_EXPIRED',
  REQUEST_FAILED: 'SIGNING_FAILED',
  FINAL_ARTIFACT_CAPTURED: 'FINAL_ARTIFACT_CAPTURED',
};

const mapEventType = (integrationEventType: string): MJNAuditEventType | null => {
  return RESOLVE_EVENT_MAP[integrationEventType] ?? null;
};

const formatMjnMessage = (eventType: MJNAuditEventType, participantId?: string): string => {
  const participantLabel = participantId ? ` ${participantId}` : '';

  switch (eventType) {
    case 'SIGNING_REQUEST_CREATED':
      return 'Signing request created';
    case 'SIGNING_REQUEST_SENT':
      return 'Signing request sent to participants';
    case 'PARTICIPANT_SIGNED':
      return `Participant${participantLabel} completed signing`;
    case 'PARTICIPANT_REJECTED':
      return `Participant${participantLabel} rejected signing`;
    case 'SIGNING_COMPLETED':
      return 'All participants completed signing';
    case 'SIGNING_REJECTED':
      return `Signing rejected by${participantLabel}`;
    case 'SIGNING_CANCELLED':
      return 'Signing request cancelled';
    case 'SIGNING_EXPIRED':
      return 'Signing request expired';
    case 'SIGNING_FAILED':
      return 'Signing request failed';
    case 'FINAL_ARTIFACT_CAPTURED':
      return 'Final signed artifact captured';
  }
};

const resolveArtifactIdForEvent = (
  event: IntegrationApiEvent,
  artifacts: IntegrationApiArtifact[],
  finalArtifact?: IntegrationApiArtifact,
): string | null => {
  if (event.eventType === 'FINAL_ARTIFACT_CAPTURED' && finalArtifact) {
    return finalArtifact.artifactId;
  }

  const matchingArtifact = artifacts.find((a) => {
    const artifactTime = new Date(a.capturedAt).getTime();
    const eventTime = new Date(event.eventTimestamp).getTime();
    return Math.abs(artifactTime - eventTime) < 5_000;
  });

  return matchingArtifact?.artifactId ?? null;
};
