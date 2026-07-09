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

function formatSigningEventDescription(evt: EvidenceEvent): string {
  switch (evt.type) {
    case 'DOCUMENT_SENT':
      return 'Signing request sent to participants';
    case 'SIGNER_SIGNED':
      return `${evt.actorName ?? 'A participant'} signed the document`;
    case 'SIGNER_REJECTED':
      return `${evt.actorName ?? 'A participant'} rejected the document`;
    case 'DOCUMENT_COMPLETED':
      return 'All participants signed — document completed';
    case 'DOCUMENT_SEALED':
      return 'Final artifact sealed and captured';
    case 'DOCUMENT_FROZEN':
      return 'Document frozen for eSignature';
    case 'SIGNING_REQUEST_CREATED':
      return 'Signing request created';
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
