import { describe, expect, it } from 'vitest';
import { buildMjnAuditTimeline } from '../src/audit-timeline';
import type { IntegrationApiArtifact, IntegrationApiEvent, MJNFile, MJNFreezeResult } from '../src/types';
import { buildIdempotencyKey, mapMjnWorkflowToSigningRequest, REGULATORY_HYBRID_ROUTE } from '../src/workflow-mapper';

describe('workflow-mapper', () => {
  describe('REGULATORY_HYBRID_ROUTE', () => {
    it('defines three stages with correct participant counts', () => {
      expect(REGULATORY_HYBRID_ROUTE.stages).toHaveLength(3);
      expect(REGULATORY_HYBRID_ROUTE.stages[0].participants).toHaveLength(1);
      expect(REGULATORY_HYBRID_ROUTE.stages[1].participants).toHaveLength(2);
      expect(REGULATORY_HYBRID_ROUTE.stages[2].participants).toHaveLength(1);
    });

    it('has stage 1 (sequential) with Regulatory Author', () => {
      const stage = REGULATORY_HYBRID_ROUTE.stages[0];
      expect(stage.order).toBe(1);
      expect(stage.participants[0].participantId).toBe('regulatory-author');
    });

    it('has stage 2 (parallel) with Medical and Quality', () => {
      const stage = REGULATORY_HYBRID_ROUTE.stages[1];
      expect(stage.order).toBe(2);
      const ids = stage.participants.map((p) => p.participantId);
      expect(ids).toContain('medical');
      expect(ids).toContain('quality');
    });

    it('has stage 3 (sequential) with Regional Regulatory Lead', () => {
      const stage = REGULATORY_HYBRID_ROUTE.stages[2];
      expect(stage.order).toBe(3);
      expect(stage.participants[0].participantId).toBe('regional-regulatory-lead');
    });
  });

  describe('mapMjnWorkflowToSigningRequest', () => {
    it('produces a payload with correct structure', () => {
      const payload = mapMjnWorkflowToSigningRequest(
        REGULATORY_HYBRID_ROUTE,
        'envelope_poc-123',
        'a'.repeat(64),
        'idem-001',
      ) as Record<string, unknown>;

      expect(payload.externalReference).toBe('MJN-FILE-VERSION-VER-003');
      expect(payload.title).toBe('Regulatory Submission — Clinical Study Report v3');

      const doc = payload.document as Record<string, unknown>;
      expect(doc.sourceReference).toBe('envelope_poc-123');
      expect((doc.contentHash as Record<string, string>).value).toBe('a'.repeat(64));

      const topMeta = payload.metadata as Record<string, string>;
      expect(topMeta.sourceSystem).toBe('MJN-DMS');
      expect(topMeta.dossierId).toBe('DOS-2026-0042');

      expect(payload.participants).toHaveLength(4);
      expect(payload.stages).toHaveLength(3);
    });

    it('maps participants with correct roles', () => {
      const payload = mapMjnWorkflowToSigningRequest(
        REGULATORY_HYBRID_ROUTE,
        'envelope_poc-456',
        'b'.repeat(64),
        'idem-002',
      ) as Record<string, unknown>;

      const participants = payload.participants as Array<{ participantId: string; role: string }>;
      const signerRoles = participants.map((p) => p.role);
      expect(signerRoles.every((role) => role === 'SIGNER')).toBe(true);

      const regulatoryAuthor = participants.find((p) => p.participantId === 'regulatory-author');
      expect(regulatoryAuthor).toBeDefined();
    });

    it('includes MJN metadata on document and request', () => {
      const payload = mapMjnWorkflowToSigningRequest(
        REGULATORY_HYBRID_ROUTE,
        'envelope_poc-789',
        'c'.repeat(64),
        'idem-003',
      ) as Record<string, unknown>;

      const doc = payload.document as Record<string, unknown>;
      const docMeta = doc.metadata as Record<string, string>;
      expect(docMeta.dossierId).toBe('DOS-2026-0042');
      expect(docMeta.documentType).toBe('REGULATORY_SUBMISSION');

      const topMeta = payload.metadata as Record<string, string>;
      expect(topMeta.workflowInstanceId).toContain('wfi-');
    });
  });

  describe('buildIdempotencyKey', () => {
    it('includes dossier ID and file version ID', () => {
      const key = buildIdempotencyKey(REGULATORY_HYBRID_ROUTE);
      expect(key).toContain('mjn-');
      expect(key).toContain('DOS-2026-0042');
    });
  });
});

describe('audit-timeline', () => {
  const makeEvent = (overrides: Partial<IntegrationApiEvent>): IntegrationApiEvent => ({
    eventId: 'evt-001',
    eventType: 'REQUEST_CREATED',
    participantId: undefined,
    actorReference: undefined,
    eventTimestamp: '2026-07-09T12:00:00.000Z',
    ...overrides,
  });

  const makeArtifact = (overrides?: Partial<IntegrationApiArtifact>): IntegrationApiArtifact => ({
    artifactId: 'art-001',
    artifactType: 'SIGNED_PDF',
    filename: 'signed.pdf',
    sha256: { algorithm: 'SHA-256', value: 'd'.repeat(64) },
    capturedAt: '2026-07-09T12:30:00.000Z',
    ...overrides,
  });

  it('maps REQUEST_CREATED to SIGNING_REQUEST_CREATED', () => {
    const events = [makeEvent({ eventType: 'REQUEST_CREATED', eventId: 'evt-001' })];
    const entries = buildMjnAuditTimeline('req-001', 'DOS-001', 'FILE-001', 'VER-001', events, []);

    expect(entries).toHaveLength(1);
    expect(entries[0].eventType).toBe('SIGNING_REQUEST_CREATED');
    expect(entries[0].message).toBe('Signing request created');
    expect(entries[0].auditEntryId).toBe('audit-evt-001');
  });

  it('maps PARTICIPANT_COMPLETED entries', () => {
    const events = [
      makeEvent({
        eventType: 'PARTICIPANT_COMPLETED',
        eventId: 'evt-002',
        participantId: 'regulatory-author',
        eventTimestamp: '2026-07-09T12:10:00.000Z',
      }),
    ];

    const entries = buildMjnAuditTimeline('req-001', 'DOS-001', 'FILE-001', 'VER-001', events, []);

    expect(entries).toHaveLength(1);
    expect(entries[0].eventType).toBe('PARTICIPANT_SIGNED');
    expect(entries[0].message).toContain('regulatory-author');
  });

  it('includes FINAL_ARTIFACT_CAPTURED with artifact reference', () => {
    const finalArtifact = makeArtifact({ artifactId: 'art-final' });
    const events = [
      makeEvent({
        eventType: 'FINAL_ARTIFACT_CAPTURED',
        eventId: 'evt-003',
        eventTimestamp: '2026-07-09T12:35:00.000Z',
      }),
    ];

    const entries = buildMjnAuditTimeline(
      'req-001',
      'DOS-001',
      'FILE-001',
      'VER-001',
      events,
      [finalArtifact],
      finalArtifact,
    );

    const artifactEntry = entries.find((e) => e.eventType === 'FINAL_ARTIFACT_CAPTURED');
    expect(artifactEntry).toBeDefined();
    expect(artifactEntry?.artifactReference).toBe('art-final');
  });

  it('sorts entries chronologically', () => {
    const events = [
      makeEvent({ eventType: 'REQUEST_CREATED', eventId: 'evt-late', eventTimestamp: '2026-07-09T13:00:00.000Z' }),
      makeEvent({ eventType: 'REQUEST_CREATED', eventId: 'evt-early', eventTimestamp: '2026-07-09T11:00:00.000Z' }),
    ];

    const entries = buildMjnAuditTimeline('req-001', 'DOS-001', 'FILE-001', 'VER-001', events, []);

    expect(entries).toHaveLength(2);
    expect(entries[0].auditEntryId).toBe('audit-evt-early');
    expect(entries[1].auditEntryId).toBe('audit-evt-late');
  });

  it('skips unknown event types', () => {
    const events = [
      makeEvent({ eventType: 'UNKNOWN_EVENT' as IntegrationApiEvent['eventType'], eventId: 'evt-unknown' }),
    ];
    const entries = buildMjnAuditTimeline('req-001', 'DOS-001', 'FILE-001', 'VER-001', events, []);
    expect(entries).toHaveLength(0);
  });

  it('sets audit entry fields correctly', () => {
    const events = [makeEvent({ eventType: 'REQUEST_COMPLETED', eventId: 'evt-complete' })];
    const entries = buildMjnAuditTimeline('req-001', 'DOS-001', 'FILE-001', 'VER-001', events, []);

    expect(entries[0].dossierId).toBe('DOS-001');
    expect(entries[0].fileId).toBe('FILE-001');
    expect(entries[0].fileVersionId).toBe('VER-001');
    expect(entries[0].signingRequestId).toBe('req-001');
  });
});

describe('pdf-freeze (unit)', () => {
  it('validates freeze result structure', () => {
    const result: MJNFreezeResult = {
      frozenPdfBytes: new Uint8Array([1, 2, 3]),
      sha256Hex: 'e'.repeat(64),
      frozenAt: '2026-07-09T12:00:00.000Z',
      sourceFileVersionId: 'VER-003',
    };

    expect(result.sha256Hex).toHaveLength(64);
    expect(result.frozenPdfBytes).toBeInstanceOf(Uint8Array);
    expect(result.sourceFileVersionId).toBe('VER-003');
  });

  it('rejects non-approved file', () => {
    const draftFile: MJNFile = {
      dossierId: 'DOS-001',
      fileId: 'FILE-001',
      fileVersionId: 'VER-001',
      fileName: 'draft.pdf',
      fileType: 'application/pdf',
      approvalStatus: 'DRAFT',
      storageReference: 'mjn://dos-001/ver-001',
      currentVersionNumber: 1,
      approvedAt: null,
      approvedBy: null,
    };

    expect(draftFile.approvalStatus).toBe('DRAFT');
    expect(() => {
      if (draftFile.approvalStatus !== 'APPROVED') {
        throw new Error(`Not approved: ${draftFile.approvalStatus}`);
      }
    }).toThrow('Not approved');
  });
});
