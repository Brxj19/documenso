export type DmsDossierStatus =
  | 'ACTIVE'
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'SIGNING_IN_PROGRESS'
  | 'SIGNED_COMPLETE'
  | 'SUBMITTED';

export type DmsDocumentStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'REVIEW_COMPLETED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'READY_FOR_ESIGNATURE'
  | 'SIGNING_IN_PROGRESS'
  | 'SIGNED_COMPLETE'
  | 'SUBMITTED';

export type DmsDossier = {
  id: string;
  name: string;
  productRegion: string;
  status: DmsDossierStatus;
  owner: string;
  documentCount: number;
  lastUpdated: string;
  createdAt: string;
};

export type DmsFile = {
  id: string;
  dossierId: string;
  name: string;
  version: string;
  status: DmsDocumentStatus;
  owner: string;
  fileType: 'PDF' | 'DOCX' | 'XLSX';
  createdAt: string;
  updatedAt: string;
  frozenPdfReference?: string;
  sha256?: string;
  frozenAt?: string;
  frozenBy?: string;
  sourceVersionId?: string;
};

export type DmsUserSource = 'DMS_USER_DIRECTORY' | 'EXTERNAL_RECIPIENT';

export type DmsUser = {
  userId: string;
  name: string;
  email: string;
  role: 'SIGNER' | 'APPROVER' | 'REVIEWER' | 'VIEWER';
  source: DmsUserSource;
  verificationMethod?: string;
};

export type SigningParticipant = {
  participantId: string;
  name: string;
  email: string;
  role: 'SIGNER';
  stageOrder: number;
  metadata: {
    identitySource: DmsUserSource;
    dmsUserId?: string;
    verificationMethod?: string;
  };
};

export type WorkflowStage = {
  order: number;
  label: string;
  participantIds: string[];
  completionPolicy: 'ALL_REQUIRED' | 'ANY';
};

export type DmsWorkflow = {
  id: string;
  dossierId: string;
  fileId: string;
  stages: WorkflowStage[];
  participants: SigningParticipant[];
  status: DmsDocumentStatus;
  signingRequestId?: string;
  signingRequestStatus?: string;
  frozenPdfReference?: string;
  sha256?: string;
  frozenAt?: string;
};

export type DmsAdminSetting = {
  id: string;
  category: string;
  label: string;
  value: string;
  type: 'text' | 'toggle' | 'select';
  options?: string[];
};

export type EvidenceEvent = {
  id: string;
  type: string;
  timestamp: string;
  actorName?: string;
  actorEmail?: string;
  data?: Record<string, unknown>;
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  actor?: string;
  category: 'DMS' | 'SIGNING';
};
