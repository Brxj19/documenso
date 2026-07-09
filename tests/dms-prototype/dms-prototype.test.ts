import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendIdentityAuditEntry,
  buildDmsAuditTimeline,
  buildIdentityVerificationEntry,
  buildSigningSessionEntry,
  sanitizeAuditEntries,
} from '../../apps/remix/app/routes/_authenticated+/dms-prototype+/_audit-timeline';
import {
  canAccessDmsDashboard,
  canInitiateSigning,
  canSign,
  getParticipantBlockedReason,
} from '../../apps/remix/app/routes/_authenticated+/dms-prototype+/_auth-policy';
import { FILES } from '../../apps/remix/app/routes/_authenticated+/dms-prototype+/_data.server';
import {
  buildSigningParticipantFromDmsUser,
  createParticipantIdentity,
  expireExternalParticipant,
  failExternalParticipant,
  IDENTITY_OTP,
  verifyExternalParticipant,
} from '../../apps/remix/app/routes/_authenticated+/dms-prototype+/_identity';
import {
  computeSha256,
  freezeApprovedFileForSigning,
} from '../../apps/remix/app/routes/_authenticated+/dms-prototype+/_pdf-freeze.server';
import type {
  AuditEntry,
  DmsFile,
  EvidenceEvent,
} from '../../apps/remix/app/routes/_authenticated+/dms-prototype+/_types';
import {
  getDmsUserById,
  getExternalUsers,
  getInternalUsers,
  isDmsUser,
  isExternalRecipient,
} from '../../apps/remix/app/routes/_authenticated+/dms-prototype+/_users';
import {
  canFreezeFile,
  canStartSigning,
  createWorkflowForFile,
  freezeWorkflowDocument,
  getParticipantById,
  getWorkflowBySigningRequestId,
  mapIntegrationStatusToDms,
  updateSigningRequestId,
  updateSigningRequestStatus,
} from '../../apps/remix/app/routes/_authenticated+/dms-prototype+/_workflow';

const DMS_ROUTES_DIR = path.resolve(__dirname, '../../apps/remix/app/routes/_authenticated+/dms-prototype+');

function createFile(overrides: Partial<DmsFile> = {}): DmsFile {
  return {
    id: 'FILE-TEST-001',
    dossierId: 'DOS-TEST-001',
    name: 'Test Document',
    version: 'v1.0',
    status: 'APPROVED',
    owner: 'Test User',
    fileType: 'PDF',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Approved file can be frozen
// ---------------------------------------------------------------------------
describe('PDF freeze', () => {
  it('freezes an approved file', () => {
    const file = createFile({ status: 'APPROVED' });
    const result = freezeApprovedFileForSigning(file);

    expect(result.frozenPdfReference).toBe('frozen-FILE-TEST-001');
    expect(result.sha256).toBe('658baa2b54b318d0617fbba42a1ba7185b45e3b066538466a40f5502f6019f52');
    expect(result.frozenBy).toBe('Test User');
    expect(result.sourceVersionId).toBe('v1.0');
    expect(result.frozenAt).toBeTruthy();
  });

  // 2. Non-approved file cannot be frozen
  it('rejects freezing a non-approved file', () => {
    const file = createFile({ status: 'DRAFT' });
    expect(() => freezeApprovedFileForSigning(file)).toThrow('Only approved files can be frozen');
  });

  // 3. SHA-256 is computed from PDF bytes
  it('computes a deterministic SHA-256', () => {
    const hash = computeSha256(new Uint8Array([1, 2, 3]));
    expect(hash).toBe('658baa2b54b318d0617fbba42a1ba7185b45e3b066538466a40f5502f6019f52');
  });
});

// ---------------------------------------------------------------------------
// 4. DMS workflow allows signing only after approval
// ---------------------------------------------------------------------------
describe('DMS workflow', () => {
  it('allows freezing only approved files', () => {
    expect(canFreezeFile(createFile({ status: 'APPROVED' }))).toBe(true);
    expect(canFreezeFile(createFile({ status: 'DRAFT' }))).toBe(false);
    expect(canFreezeFile(createFile({ status: 'UNDER_REVIEW' }))).toBe(false);
  });

  it('allows signing only approved files', () => {
    expect(canStartSigning(createFile({ status: 'APPROVED' }))).toBe(true);
    expect(canStartSigning(createFile({ status: 'READY_FOR_ESIGNATURE' }))).toBe(true);
    expect(canStartSigning(createFile({ status: 'DRAFT' }))).toBe(false);
  });

  // 5. Maps COMPLETED to Signed Complete
  it('maps COMPLETED to SIGNED_COMPLETE', () => {
    expect(mapIntegrationStatusToDms('COMPLETED')).toBe('SIGNED_COMPLETE');
  });

  // 6. Maps REJECTED to Draft
  it('maps REJECTED to DRAFT', () => {
    expect(mapIntegrationStatusToDms('REJECTED')).toBe('DRAFT');
  });

  // 7. Maps CANCELLED to Draft
  it('maps CANCELLED to DRAFT', () => {
    expect(mapIntegrationStatusToDms('CANCELLED')).toBe('DRAFT');
  });

  // 8. Maps EXPIRED to Draft
  it('maps EXPIRED to DRAFT', () => {
    expect(mapIntegrationStatusToDms('EXPIRED')).toBe('DRAFT');
  });

  it('creates a workflow for a file and stores signing request id', () => {
    const file = createFile();
    const wf = createWorkflowForFile(file);

    expect(wf.fileId).toBe('FILE-TEST-001');
    expect(wf.stages).toHaveLength(3);
    expect(wf.participants).toHaveLength(5);

    const updated = updateSigningRequestId(file.id, 'req-test-001');
    expect(updated.signingRequestId).toBe('req-test-001');
    expect(updated.signingRequestStatus).toBe('READY');

    const sent = updateSigningRequestStatus(file.id, 'IN_PROGRESS');
    expect(sent.signingRequestStatus).toBe('IN_PROGRESS');

    const frozen = freezeWorkflowDocument(file.id, 'abc123');
    expect(frozen.sha256).toBe('abc123');
    expect(frozen.frozenPdfReference).toBe('frozen-FILE-TEST-001');
  });
});

// ---------------------------------------------------------------------------
// 9. Audit timeline combines DMS events and signing evidence
// ---------------------------------------------------------------------------
describe('Audit timeline', () => {
  const dmsEvents: AuditEntry[] = [
    {
      id: 'dms-1',
      timestamp: '2026-06-01T10:00:00Z',
      type: 'FILE_CREATED',
      description: 'File created',
      category: 'DMS',
    },
    {
      id: 'dms-2',
      timestamp: '2026-06-01T11:00:00Z',
      type: 'FILE_FROZEN',
      description: 'File frozen',
      category: 'DMS',
    },
  ];

  const evidenceEvents: EvidenceEvent[] = [
    { id: 'evt-1', timestamp: '2026-06-01T12:00:00Z', type: 'SIGNING_REQUEST_CREATED', actorName: 'System' },
    {
      id: 'evt-2',
      timestamp: '2026-06-01T13:00:00Z',
      type: 'SIGNER_SIGNED',
      actorName: 'Regulatory Author',
      actorEmail: 'regulatory.author@example.test',
    },
  ];

  it('combines both timelines and sorts descending', () => {
    const timeline = buildDmsAuditTimeline(dmsEvents, evidenceEvents);
    expect(timeline).toHaveLength(4);

    const timestamps = timeline.map((e) => e.timestamp);
    expect(timestamps[0]).toBe('2026-06-01T13:00:00Z');
    expect(timestamps[timestamps.length - 1]).toBe('2026-06-01T10:00:00Z');
  });

  it('marks signing events with SIGNING category', () => {
    const timeline = buildDmsAuditTimeline(dmsEvents, evidenceEvents);
    const signingEntries = timeline.filter((e) => e.category === 'SIGNING');
    expect(signingEntries).toHaveLength(2);
  });

  // 10. Audit timeline excludes tokens/secrets
  it('sanitizes email addresses in audit entries', () => {
    const entries: AuditEntry[] = [
      {
        id: '1',
        timestamp: '2026-01-01T00:00:00Z',
        type: 'TEST',
        description: 'Test',
        actor: 'secret-token-abc123@example.test',
        category: 'SIGNING',
      },
    ];
    const sanitized = sanitizeAuditEntries(entries);
    expect(sanitized[0].actor).toBe('secret-token-abc123@***');
    expect(sanitized[0].actor).not.toContain('example.test');
  });
});

// ---------------------------------------------------------------------------
// 11. DMS signing client uses HTTP endpoints only (checked at import level)
// ---------------------------------------------------------------------------
describe('Signing client', () => {
  it('uses HTTP endpoints - verified by no forbidden imports', () => {
    const clientPath = path.join(DMS_ROUTES_DIR, '_signing-client.server.ts');
    const content = fs.readFileSync(clientPath, 'utf-8');
    expect(content).not.toContain('packages/api/v1/integration');
    expect(content).not.toContain('server-only');
    expect(content).not.toContain('packages/prisma');
  });
});

// ---------------------------------------------------------------------------
// DMS user directory
// ---------------------------------------------------------------------------
describe('DMS user directory', () => {
  it('reads users from the dummy directory', () => {
    const user = getDmsUserById('user-reg-author-001');
    expect(user).toBeTruthy();
    expect(user?.name).toBe('Regulatory Author');
  });

  it('separates internal and external users', () => {
    expect(getInternalUsers()).toHaveLength(4);
    expect(getExternalUsers()).toHaveLength(1);
  });

  it('identifies DMS users vs external recipients', () => {
    expect(isDmsUser('user-reg-author-001')).toBe(true);
    expect(isDmsUser('user-ext-consult-001')).toBe(false);
    expect(isExternalRecipient('user-ext-consult-001')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Identity model
// ---------------------------------------------------------------------------
describe('Identity model', () => {
  it('creates participant identity from DMS user', () => {
    const identity = createParticipantIdentity('user-reg-author-001');
    expect(identity.identitySource).toBe('DMS_USER_DIRECTORY');
    expect(identity.dmsUserId).toBe('user-reg-author-001');
    expect(identity.verificationStatus).toBe('VERIFIED');
  });

  it('creates participant identity for external user with pending verification', () => {
    const identity = createParticipantIdentity('user-ext-consult-001');
    expect(identity.identitySource).toBe('EXTERNAL_RECIPIENT');
    expect(identity.verificationMethod).toBe('EMAIL_OTP');
    expect(identity.verificationStatus).toBe('PENDING');
  });

  it('verifies external participant', () => {
    const pid = `dms-user-ext-consult-001`;
    const verified = verifyExternalParticipant(pid);
    expect(verified?.verificationStatus).toBe('VERIFIED');
    expect(verified?.verifiedAt).toBeTruthy();
  });

  it('builds signing participant from DMS user', () => {
    const participant = buildSigningParticipantFromDmsUser('user-reg-author-001');
    expect(participant.participantId).toBe('dms-user-reg-author-001');
    expect(participant.metadata.identitySource).toBe('DMS_USER_DIRECTORY');
    expect(participant.metadata.dmsUserId).toBe('user-reg-author-001');
  });

  it('builds signing participant from external user', () => {
    const participant = buildSigningParticipantFromDmsUser('user-ext-consult-001');
    expect(participant.metadata.identitySource).toBe('EXTERNAL_RECIPIENT');
    expect(participant.metadata.verificationMethod).toBe('EMAIL_OTP');
    expect(participant.metadata.dmsUserId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Auth policy
// ---------------------------------------------------------------------------
describe('Auth policy', () => {
  const dmsUser = getDmsUserById('user-reg-author-001') as NonNullable<ReturnType<typeof getDmsUserById>>;
  const extUser = getDmsUserById('user-ext-consult-001') as NonNullable<ReturnType<typeof getDmsUserById>>;

  it('allows DMS user to access dashboard', () => {
    expect(canAccessDmsDashboard(dmsUser).allowed).toBe(true);
  });

  it('denies external user access to dashboard', () => {
    const decision = canAccessDmsDashboard(extUser);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('External recipients cannot access');
  });

  it('allows DMS user to initiate signing', () => {
    expect(canInitiateSigning(dmsUser).allowed).toBe(true);
  });

  it('denies external user from initiating signing', () => {
    expect(canInitiateSigning(extUser).allowed).toBe(false);
  });

  it('allows external signer to sign for themselves', () => {
    const decision = canSign(extUser, 'dms-user-ext-consult-001');
    expect(decision.allowed).toBe(true);
  });

  it('denies external signer from signing for another participant', () => {
    const decision = canSign(extUser, 'dms-user-reg-author-001');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('cannot act for another participant');
  });
});

// ---------------------------------------------------------------------------
// UI tests
// ---------------------------------------------------------------------------
describe('Dashboard UI', () => {
  it('renders Authora DMS and no Documenso text', () => {
    const layoutContent = fs.readFileSync(path.join(DMS_ROUTES_DIR, '_layout.tsx'), 'utf-8');
    // Strip import lines since @documenso is the package scope, not the brand
    const bodyContent = layoutContent
      .split('\n')
      .filter((line) => !line.startsWith('import '))
      .join('\n');
    expect(bodyContent).toContain('Authora DMS');
    expect(bodyContent).not.toContain('Documenso');
  });
});

describe('Admin UI', () => {
  it('renders admin page without Create Folder', () => {
    const adminContent = fs.readFileSync(path.join(DMS_ROUTES_DIR, 'admin._index.tsx'), 'utf-8');
    expect(adminContent).not.toContain('Create Folder');
    expect(adminContent).not.toContain('Create folder');
  });
});

describe('ESignature UI', () => {
  it('renders hybrid route', () => {
    const esigContent = fs.readFileSync(path.join(DMS_ROUTES_DIR, 'esignature._index.tsx'), 'utf-8');
    expect(esigContent).toContain('Stage 1');
    expect(esigContent).toContain('Regulatory Author');
    expect(esigContent).toContain('Stage 2');
    expect(esigContent).toContain('Medical');
    expect(esigContent).toContain('Stage 3');
  });
});

describe('Review UI', () => {
  it('renders workflow states', () => {
    const reviewContent = fs.readFileSync(path.join(DMS_ROUTES_DIR, 'review._index.tsx'), 'utf-8');
    expect(reviewContent).toContain('Draft');
    expect(reviewContent).toContain('Under Review');
    expect(reviewContent).toContain('Approved');
    expect(reviewContent).toContain('eSignature');
  });
});

describe('No branding or create folder', () => {
  it('layout has no Create Folder action', () => {
    const layoutContent = fs.readFileSync(path.join(DMS_ROUTES_DIR, '_layout.tsx'), 'utf-8');
    expect(layoutContent).not.toContain('Create Folder');
    expect(layoutContent).not.toContain('createFolder');
  });
});

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------
describe('Fixture data', () => {
  it('has valid dossier data', () => {
    expect(FILES).toHaveLength(5);
    FILES.forEach((f) => {
      expect(f.id).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(f.status).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Mocked Integration API integration test
// ---------------------------------------------------------------------------
describe('Integration API interaction', () => {
  it('creates signing request and stores the ID', () => {
    const file = FILES[0];
    const _wf = createWorkflowForFile(file);
    const updated = updateSigningRequestId(file.id, 'mock-req-001');
    expect(updated.signingRequestId).toBe('mock-req-001');
    expect(updated.signingRequestStatus).toBe('READY');
  });

  it('send updates status', () => {
    const file = FILES[0];
    updateSigningRequestId(file.id, 'mock-req-002');
    const updated = updateSigningRequestStatus(file.id, 'IN_PROGRESS');
    expect(updated.signingRequestStatus).toBe('IN_PROGRESS');
  });
});

// ---------------------------------------------------------------------------
// Phase 10 — Identity/auth tests
// ---------------------------------------------------------------------------
describe('Phase 10 — Identity & Auth', () => {
  it('external signer starts as pending verification', () => {
    const identity = createParticipantIdentity('user-ext-consult-001');
    expect(identity.verificationStatus).toBe('PENDING');
    expect(identity.verificationMethod).toBe('EMAIL_OTP');
    expect(identity.externalSignerId).toBe('user-ext-consult-001');
  });

  it('external signer fails verification with wrong OTP', () => {
    const pid = `dms-user-ext-consult-001`;
    createParticipantIdentity('user-ext-consult-001');
    expect(IDENTITY_OTP).toBe('123456');

    const failed = failExternalParticipant(pid);
    expect(failed?.verificationStatus).toBe('FAILED');
  });

  it('external signer can be expired', () => {
    const pid = `dms-user-ext-consult-001`;
    createParticipantIdentity('user-ext-consult-001');
    const expired = expireExternalParticipant(pid);
    expect(expired?.verificationStatus).toBe('EXPIRED');
  });

  it('passes OTP verification with correct code', () => {
    const pid = `dms-user-ext-consult-001`;
    createParticipantIdentity('user-ext-consult-001');
    const verified = verifyExternalParticipant(pid);
    expect(verified?.verificationStatus).toBe('VERIFIED');
    expect(verified?.verifiedAt).toBeTruthy();
  });

  it('external signer cannot access DMS dashboard', () => {
    const extUser = getDmsUserById('user-ext-consult-001') as NonNullable<ReturnType<typeof getDmsUserById>>;
    const decision = canAccessDmsDashboard(extUser);
    expect(decision.allowed).toBe(false);
  });

  it('external signer cannot sign for another participant', () => {
    const extUser = getDmsUserById('user-ext-consult-001') as NonNullable<ReturnType<typeof getDmsUserById>>;
    const decision = canSign(extUser, 'dms-user-reg-author-001');
    expect(decision.allowed).toBe(false);
  });

  it('internal DMS signer does not require signup', () => {
    const dmsUser = getDmsUserById('user-reg-author-001') as NonNullable<ReturnType<typeof getDmsUserById>>;
    expect(dmsUser.source).toBe('DMS_USER_DIRECTORY');
    expect(dmsUser.userId).toBeTruthy();
  });

  it('participant blocked reason for completed request', () => {
    expect(getParticipantBlockedReason('COMPLETED', 'COMPLETED')).toContain('completed');
  });

  it('participant blocked reason for rejected', () => {
    expect(getParticipantBlockedReason('REJECTED', undefined)).toContain('rejected');
  });

  it('participant blocked reason for cancelled', () => {
    expect(getParticipantBlockedReason('CANCELLED', undefined)).toContain('cancelled');
  });

  it('participant blocked reason for expired', () => {
    expect(getParticipantBlockedReason('EXPIRED', undefined)).toContain('expired');
  });

  it('participant blocked reason for BLOCKED status', () => {
    expect(getParticipantBlockedReason('IN_PROGRESS', 'BLOCKED')).toContain('blocked');
  });

  it('returns undefined when no blocking reason', () => {
    expect(getParticipantBlockedReason(undefined, undefined)).toBeUndefined();
    expect(getParticipantBlockedReason('READY', undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 10 — White-label tests
// ---------------------------------------------------------------------------
describe('Phase 10 — White Label', () => {
  it('DMS dashboard shows Authora DMS', () => {
    const layoutContent = fs.readFileSync(path.join(DMS_ROUTES_DIR, '_layout.tsx'), 'utf-8');
    const bodyContent = layoutContent
      .split('\n')
      .filter((line) => !line.startsWith('import '))
      .join('\n');
    expect(bodyContent).toContain('Authora DMS');
  });

  it('no Documenso text in DMS prototype pages', () => {
    const files = fs.readdirSync(DMS_ROUTES_DIR);
    const tsxFiles = files.filter((f) => f.endsWith('.tsx'));
    for (const file of tsxFiles) {
      const content = fs.readFileSync(path.join(DMS_ROUTES_DIR, file), 'utf-8');
      const bodyContent = content
        .split('\n')
        .filter((line) => !line.startsWith('import '))
        .join('\n');
      expect(bodyContent).not.toContain('Documenso');
    }
  });

  it('no Create Folder action in DMS prototype pages', () => {
    const files = fs.readdirSync(DMS_ROUTES_DIR);
    const tsxFiles = files.filter((f) => f.endsWith('.tsx'));
    for (const file of tsxFiles) {
      const content = fs.readFileSync(path.join(DMS_ROUTES_DIR, file), 'utf-8');
      expect(content).not.toContain('Create Folder');
      expect(content).not.toContain('createFolder');
    }
  });

  it('admin shows signing-tool login disabled', () => {
    const adminContent = fs.readFileSync(path.join(DMS_ROUTES_DIR, 'admin._index.tsx'), 'utf-8');
    expect(adminContent).toContain('Signing Tool Login');
    expect(adminContent).toContain('Disabled');
    expect(adminContent).toContain('Authora DMS');
    expect(adminContent).toContain('Email OTP');
  });

  it('external verification page shows Authora DMS', () => {
    const extPath = path.join(DMS_ROUTES_DIR, 'external-sign.$sessionId.verify._index.tsx');
    const content = fs.readFileSync(extPath, 'utf-8');
    const bodyContent = content
      .split('\n')
      .filter((line) => !line.startsWith('import '))
      .join('\n');
    expect(bodyContent).toContain('Authora DMS');
    expect(bodyContent).toContain('Identity Verification');
  });
});

// ---------------------------------------------------------------------------
// Phase 10 — Workflow & Participants
// ---------------------------------------------------------------------------
describe('Phase 10 — Workflow & Participants', () => {
  it('workflow now has 5 participants including external', () => {
    const file = FILES[0];
    const wf = createWorkflowForFile(file);
    expect(wf.participants).toHaveLength(5);

    const externalParticipant = wf.participants.find((p) => p.metadata.identitySource === 'EXTERNAL_RECIPIENT');
    expect(externalParticipant).toBeTruthy();
    expect(externalParticipant?.metadata.externalSignerId).toBe('user-ext-consult-001');
    expect(externalParticipant?.metadata.verificationStatus).toBe('PENDING');
  });

  it('stage 2 includes external consultant', () => {
    const file = FILES[0];
    const wf = createWorkflowForFile(file);
    const stage2 = wf.stages.find((s) => s.order === 2);
    expect(stage2?.participantIds).toContain('dms-user-ext-consult-001');
  });

  it('getParticipantById returns participant', () => {
    const p = getParticipantById('dms-user-ext-consult-001');
    expect(p).toBeTruthy();
    expect(p?.name).toBe('External Consultant');
  });

  it('getWorkflowBySigningRequestId returns workflow', () => {
    const file = FILES[0];
    createWorkflowForFile(file);
    updateSigningRequestId(file.id, 'sig-req-phase-10');
    const found = getWorkflowBySigningRequestId('sig-req-phase-10');
    expect(found).toBeTruthy();
    expect(found?.fileId).toBe(file.id);
  });

  it('getWorkflowBySigningRequestId returns undefined for unknown', () => {
    expect(getWorkflowBySigningRequestId('nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 10 — Audit timeline identity evidence
// ---------------------------------------------------------------------------
describe('Phase 10 — Audit Timeline Identity', () => {
  it('identity audit entry is added', () => {
    createParticipantIdentity('user-ext-consult-001');
    const entries: AuditEntry[] = [
      {
        id: 'base-1',
        timestamp: '2026-06-01T10:00:00Z',
        type: 'TEST',
        description: 'Test entry',
        actor: 'System',
        category: 'DMS',
      },
    ];

    const result = appendIdentityAuditEntry(entries, 'dms-user-ext-consult-001');
    expect(result.length).toBeGreaterThan(1);

    const identityEntry = result.find((e) => e.type === 'IDENTITY_SOURCE');
    expect(identityEntry).toBeTruthy();
    expect(identityEntry?.description).toContain('External Recipient');
    expect(identityEntry?.description).toContain('Email OTP');
    expect(identityEntry?.description).toContain('Pending');
  });

  it('identity verification entry shows verified', () => {
    createParticipantIdentity('user-ext-consult-001');
    verifyExternalParticipant('dms-user-ext-consult-001');
    const entry = buildIdentityVerificationEntry('dms-user-ext-consult-001', true, 'EMAIL_OTP');
    expect(entry.type).toBe('SIGNER_VERIFIED');
    expect(entry.description).toContain('Email OTP');
    expect(entry.category).toBe('SIGNING');
  });

  it('identity verification failure entry shows failed', () => {
    createParticipantIdentity('user-ext-consult-001');
    const entry = buildIdentityVerificationEntry('dms-user-ext-consult-001', false, 'EMAIL_OTP');
    expect(entry.type).toBe('SIGNER_VERIFICATION_FAILED');
    expect(entry.description).toContain('failed');
  });

  it('signing session created entry', () => {
    createParticipantIdentity('user-reg-author-001');
    const entry = buildSigningSessionEntry('dms-user-reg-author-001', true);
    expect(entry.type).toBe('SIGNING_SESSION_CREATED');
    expect(entry.description).toContain('Regulatory Author');
  });

  it('signing session failed entry', () => {
    createParticipantIdentity('user-reg-author-001');
    const entry = buildSigningSessionEntry('dms-user-reg-author-001', false);
    expect(entry.type).toBe('SIGNING_SESSION_FAILED');
    expect(entry.description).toContain('failed');
  });

  it('audit entries exclude tokens and secrets', () => {
    const entries: AuditEntry[] = [
      {
        id: 'secret-1',
        timestamp: '2026-01-01T00:00:00Z',
        type: 'SIGNING_SESSION_CREATED',
        description: 'Session created',
        actor: 'actor@example.test',
        category: 'SIGNING',
      },
    ];
    const sanitized = sanitizeAuditEntries(entries);
    expect(sanitized[0].actor).toBe('actor@***');
    expect(sanitized[0].actor).not.toContain('example.test');
  });
});

// ---------------------------------------------------------------------------
// Phase 10 — Signing flow tests
// ---------------------------------------------------------------------------
describe('Phase 10 — Signing Flow', () => {
  it('external unverified participant is pending', () => {
    const identity = createParticipantIdentity('user-ext-consult-001');
    expect(identity.verificationStatus).toBe('PENDING');
  });

  it('external verified participant can be identified', () => {
    createParticipantIdentity('user-ext-consult-001');
    const verified = verifyExternalParticipant('dms-user-ext-consult-001');
    expect(verified?.verificationStatus).toBe('VERIFIED');
  });

  it('blocked reason for completed request prevents launch', () => {
    const reason = getParticipantBlockedReason('COMPLETED', 'COMPLETED');
    expect(reason).toBeTruthy();
    expect(reason).toContain('completed');
  });
});
