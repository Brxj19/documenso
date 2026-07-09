export interface MJNFile {
  dossierId: string;
  fileId: string;
  fileVersionId: string;
  fileName: string;
  fileType: string;
  approvalStatus: MJNApprovalStatus;
  storageReference: string;
  currentVersionNumber: number;
  approvedAt: string | null;
  approvedBy: string | null;
}

export type MJNApprovalStatus = 'DRAFT' | 'REVISION_IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ARCHIVED';

export interface MJNSigningState {
  mjnFileId: string;
  mjnFileVersionId: string;
  signingRequestId: string | null;
  signingStatus: MJNSigningStatus;
  evidenceReference: string | null;
  artifactReference: string | null;
  finalSignedFileReference: string | null;
  lastSyncedAt: string | null;
  rejectionReason: string | null;
}

export type MJNSigningStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'FAILED';

export interface MJNAuditEntry {
  auditEntryId: string;
  dossierId: string;
  fileId: string;
  fileVersionId: string;
  eventType: MJNAuditEventType;
  actorRole: string | null;
  actorName: string | null;
  message: string;
  signingRequestId: string | null;
  evidenceReference: string | null;
  artifactReference: string | null;
  timestamp: string;
}

export type MJNAuditEventType =
  | 'SIGNING_REQUEST_CREATED'
  | 'SIGNING_REQUEST_SENT'
  | 'PARTICIPANT_SIGNED'
  | 'PARTICIPANT_REJECTED'
  | 'SIGNING_COMPLETED'
  | 'SIGNING_REJECTED'
  | 'SIGNING_CANCELLED'
  | 'SIGNING_EXPIRED'
  | 'SIGNING_FAILED'
  | 'FINAL_ARTIFACT_CAPTURED';

export interface MJNWorkflowConfig {
  dossierId: string;
  fileId: string;
  fileVersionId: string;
  title: string;
  stages: MJNStageConfig[];
  idempotencyKey: string;
}

export interface MJNStageConfig {
  order: number;
  participants: MJNParticipantConfig[];
}

export interface MJNParticipantConfig {
  participantId: string;
  role: 'SIGNER' | 'APPROVER';
  name: string;
  email: string;
}

export interface MJNFreezeResult {
  frozenPdfBytes: Uint8Array;
  sha256Hex: string;
  frozenAt: string;
  sourceFileVersionId: string;
}

export interface IntegrationApiSigningRequest {
  requestId: string;
  externalReference: string;
  title: string;
  status: string;
  stages: IntegrationApiStage[];
  participants: IntegrationApiParticipant[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationApiStage {
  order: number;
  status: string;
  isActive: boolean;
  isBlocked: boolean;
  blockedReason?: string;
  participantIds: string[];
}

export interface IntegrationApiParticipant {
  participantId: string;
  displayName?: string;
  email: string;
  role: string;
  status: string;
  stageOrder?: number;
  isActionable: boolean;
  isBlocked: boolean;
  blockedReason?: string;
}

export interface IntegrationApiEvidence {
  requestId: string;
  status: string;
  events: IntegrationApiEvent[];
  artifacts: IntegrationApiArtifact[];
  finalArtifact?: IntegrationApiArtifact;
}

export interface IntegrationApiEvent {
  eventId: string;
  eventType: string;
  participantId?: string;
  actorReference?: string;
  eventTimestamp: string;
}

export interface IntegrationApiArtifact {
  artifactId: string;
  artifactType: string;
  filename: string;
  sha256: { algorithm: string; value: string };
  capturedAt: string;
}
