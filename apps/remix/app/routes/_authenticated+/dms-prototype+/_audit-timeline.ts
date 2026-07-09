import { getParticipantIdentity } from './_identity';
import type { AuditEntry, EvidenceEvent } from './_types';

export function buildDmsAuditTimeline(dmsEvents: AuditEntry[], evidenceEvents: EvidenceEvent[]): AuditEntry[] {
  const signingEntries: AuditEntry[] = evidenceEvents.map((evt) => ({
    id: `sig-${evt.id}`,
    timestamp: evt.timestamp,
    type: evt.type,
    description: formatSigningEventDescription(evt),
    actor: evt.actorName ?? evt.actorEmail,
    category: 'SIGNING' as const,
  }));

  return mergeTimelines(dmsEvents, signingEntries);
}

function formatIdentitySource(source: string | undefined): string {
  if (source === 'DMS_USER_DIRECTORY') {
    return 'DMS User Directory';
  }
  if (source === 'EXTERNAL_RECIPIENT') {
    return 'External Recipient';
  }
  return source ?? 'Unknown';
}

function formatVerificationStatus(status: string | undefined): string {
  if (status === 'VERIFIED') {
    return 'Verified';
  }
  if (status === 'PENDING') {
    return 'Pending Verification';
  }
  if (status === 'FAILED') {
    return 'Failed';
  }
  if (status === 'EXPIRED') {
    return 'Expired';
  }
  return status ?? 'Unknown';
}

function formatVerificationMethod(method: string | undefined): string {
  if (method === 'DMS_SESSION') {
    return 'DMS Session';
  }
  if (method === 'EMAIL_OTP') {
    return 'Email OTP';
  }
  if (method === 'PASSCODE') {
    return 'Passcode';
  }
  if (method === 'MAGIC_LINK') {
    return 'Magic Link';
  }
  return method ?? 'None';
}

export function appendIdentityAuditEntry(entries: AuditEntry[], participantId: string): AuditEntry[] {
  const identity = getParticipantIdentity(participantId);
  if (!identity) {
    return entries;
  }

  const identityEntry: AuditEntry = {
    id: `identity-${participantId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: 'IDENTITY_SOURCE',
    description: `Identity source: ${formatIdentitySource(identity.identitySource)} · Verification: ${formatVerificationStatus(identity.verificationStatus)} · Method: ${formatVerificationMethod(identity.verificationMethod)}`,
    actor: identity.name ?? identity.email,
    category: 'SIGNING',
  };

  return mergeTimelines([...entries, identityEntry], []);
}

export function buildIdentityVerificationEntry(
  participantId: string,
  verified: boolean,
  method: string,
  verifiedBy?: string,
): AuditEntry {
  const identity = getParticipantIdentity(participantId);
  return {
    id: `verify-${participantId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: verified ? 'SIGNER_VERIFIED' : 'SIGNER_VERIFICATION_FAILED',
    description: verified
      ? `Signer verified via ${formatVerificationMethod(method)}${verifiedBy ? ` by ${verifiedBy}` : ''}`
      : `Signer verification failed via ${formatVerificationMethod(method)}`,
    actor: identity?.name ?? identity?.email ?? participantId,
    category: 'SIGNING',
  };
}

export function buildSigningSessionEntry(participantId: string, sessionCreated: boolean): AuditEntry {
  const identity = getParticipantIdentity(participantId);
  return {
    id: `session-${participantId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: sessionCreated ? 'SIGNING_SESSION_CREATED' : 'SIGNING_SESSION_FAILED',
    description: sessionCreated
      ? `Signing session created for ${identity?.name ?? participantId}`
      : `Signing session creation failed for ${identity?.name ?? participantId}`,
    actor: identity?.name ?? identity?.email,
    category: 'SIGNING',
  };
}

function formatSigningEventDescription(evt: EvidenceEvent): string {
  switch (evt.type) {
    case 'REQUEST_CREATED':
    case 'SIGNING_REQUEST_CREATED':
      return 'Signing request created';
    case 'REQUEST_SENT':
    case 'DOCUMENT_SENT':
      return 'Signing request sent to participants';
    case 'PARTICIPANT_COMPLETED':
    case 'SIGNER_SIGNED':
      return `${evt.actorName ?? 'A participant'} signed the document`;
    case 'PARTICIPANT_REJECTED':
    case 'SIGNER_REJECTED':
      return `${evt.actorName ?? 'A participant'} rejected the document`;
    case 'REQUEST_COMPLETED':
    case 'DOCUMENT_COMPLETED':
      return 'All participants signed — document completed';
    case 'REQUEST_PARTIALLY_COMPLETED':
      return 'Some participants have completed — request partially completed';
    case 'FINAL_ARTIFACT_CAPTURED':
    case 'DOCUMENT_SEALED':
      return 'Final artifact sealed and captured';
    case 'SIGNING_SESSION_CREATED':
      return `Signing session created for ${evt.actorName ?? 'a participant'}`;
    case 'SIGNING_SESSION_LAUNCHED':
      return `Signing session launched for ${evt.actorName ?? 'a participant'}`;
    case 'SIGNER_VERIFIED':
      return `Signer verified: ${evt.actorName ?? 'a participant'}`;
    case 'SIGNER_VERIFICATION_FAILED':
      return `Signer verification failed for ${evt.actorName ?? 'a participant'}`;
    case 'REQUEST_CANCELLED':
      return 'Signing request cancelled';
    case 'REQUEST_EXPIRED':
      return 'Signing request expired';
    case 'REQUEST_FAILED':
      return 'Signing request failed';
    case 'CALLBACK_QUEUED':
      return 'Callback queued for delivery';
    case 'CALLBACK_DELIVERED':
      return 'Callback delivered successfully';
    case 'CALLBACK_FAILED':
      return 'Callback delivery failed';
    case 'RECONCILIATION_REFRESHED':
      return 'State reconciliation refreshed';
    case 'REMINDER_SENT':
      return 'Reminder sent to participant';
    case 'REMINDER_ATTEMPTED':
      return 'Reminder delivery attempted';
    case 'IDENTITY_SOURCE':
      return evt.description ?? 'Identity source recorded';
    case 'INTEGRATION_ERROR':
      return `Integration error: ${JSON.stringify(evt.data ?? {})}`;
    default:
      return `Event: ${evt.type}`;
  }
}

function mergeTimelines(dms: AuditEntry[], signing: AuditEntry[]): AuditEntry[] {
  const combined = [...dms, ...signing];
  combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return combined;
}

export function sanitizeAuditEntries(entries: AuditEntry[]): AuditEntry[] {
  return entries.map((entry) => {
    if (entry.actor?.includes('@')) {
      const [name] = entry.actor.split('@');
      return { ...entry, actor: `${name}@***` };
    }
    return entry;
  });
}
