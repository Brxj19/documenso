import type { DmsDocumentStatus, DmsFile, DmsWorkflow, SigningParticipant, WorkflowStage } from './_types';

const REGULATORY_HYBRID_STAGES: WorkflowStage[] = [
  {
    order: 1,
    label: 'Regulatory Author',
    participantIds: ['dms-user-reg-author-001'],
    completionPolicy: 'ALL_REQUIRED',
  },
  {
    order: 2,
    label: 'Medical & Quality Review',
    participantIds: ['dms-user-medical-001', 'dms-user-quality-001', 'dms-user-ext-consult-001'],
    completionPolicy: 'ALL_REQUIRED',
  },
  {
    order: 3,
    label: 'Regional Regulatory Lead',
    participantIds: ['dms-user-reg-lead-001'],
    completionPolicy: 'ALL_REQUIRED',
  },
];

const SIGNING_PARTICIPANTS: SigningParticipant[] = [
  {
    participantId: 'dms-user-reg-author-001',
    name: 'Regulatory Author',
    email: 'regulatory.author@example.test',
    role: 'SIGNER',
    stageOrder: 1,
    metadata: { identitySource: 'DMS_USER_DIRECTORY', dmsUserId: 'user-reg-author-001' },
  },
  {
    participantId: 'dms-user-medical-001',
    name: 'Medical Reviewer',
    email: 'medical@example.test',
    role: 'SIGNER',
    stageOrder: 2,
    metadata: { identitySource: 'DMS_USER_DIRECTORY', dmsUserId: 'user-medical-001' },
  },
  {
    participantId: 'dms-user-quality-001',
    name: 'Quality Reviewer',
    email: 'quality@example.test',
    role: 'SIGNER',
    stageOrder: 2,
    metadata: { identitySource: 'DMS_USER_DIRECTORY', dmsUserId: 'user-quality-001' },
  },
  {
    participantId: 'dms-user-ext-consult-001',
    name: 'External Consultant',
    email: 'external.consultant@example.test',
    role: 'SIGNER',
    stageOrder: 2,
    metadata: {
      identitySource: 'EXTERNAL_RECIPIENT',
      externalSignerId: 'user-ext-consult-001',
      verificationMethod: 'EMAIL_OTP',
      verificationStatus: 'PENDING',
    },
  },
  {
    participantId: 'dms-user-reg-lead-001',
    name: 'Regional Regulatory Lead',
    email: 'regional.regulatory.lead@example.test',
    role: 'SIGNER',
    stageOrder: 3,
    metadata: { identitySource: 'DMS_USER_DIRECTORY', dmsUserId: 'user-reg-lead-001' },
  },
];

const workflowStore = new Map<string, DmsWorkflow>();

export function getWorkflowForFile(fileId: string): DmsWorkflow | undefined {
  return workflowStore.get(fileId);
}

export function createWorkflowForFile(file: DmsFile): DmsWorkflow {
  const existing = workflowStore.get(file.id);
  if (existing) {
    return existing;
  }

  const workflow: DmsWorkflow = {
    id: `wfl-${file.id}`,
    dossierId: file.dossierId,
    fileId: file.id,
    stages: REGULATORY_HYBRID_STAGES,
    participants: SIGNING_PARTICIPANTS,
    status: file.status,
  };

  workflowStore.set(file.id, workflow);
  return workflow;
}

export function updateWorkflowStatus(fileId: string, newStatus: DmsDocumentStatus): DmsWorkflow {
  const workflow = workflowStore.get(fileId);
  if (!workflow) {
    throw new Error(`No workflow for file ${fileId}`);
  }

  workflow.status = newStatus;
  workflowStore.set(fileId, workflow);
  return workflow;
}

export function updateSigningRequestId(fileId: string, signingRequestId: string): DmsWorkflow {
  const workflow = workflowStore.get(fileId);
  if (!workflow) {
    throw new Error(`No workflow for file ${fileId}`);
  }

  workflow.signingRequestId = signingRequestId;
  workflow.signingRequestStatus = 'READY';
  workflowStore.set(fileId, workflow);
  return workflow;
}

export function updateSigningRequestStatus(fileId: string, status: string): DmsWorkflow {
  const workflow = workflowStore.get(fileId);
  if (!workflow) {
    throw new Error(`No workflow for file ${fileId}`);
  }

  workflow.signingRequestStatus = status;
  workflowStore.set(fileId, workflow);
  return workflow;
}

export function freezeWorkflowDocument(fileId: string, sha256: string): DmsWorkflow {
  const workflow = workflowStore.get(fileId);
  if (!workflow) {
    throw new Error(`No workflow for file ${fileId}`);
  }

  workflow.sha256 = sha256;
  workflow.frozenPdfReference = `frozen-${fileId}`;
  workflow.frozenAt = new Date().toISOString();
  workflowStore.set(fileId, workflow);
  return workflow;
}

export function canFreezeFile(file: DmsFile): boolean {
  return file.status === 'APPROVED';
}

export function canStartSigning(file: DmsFile): boolean {
  return file.status === 'APPROVED' || file.status === 'READY_FOR_ESIGNATURE';
}

export function getParticipantById(participantId: string): SigningParticipant | undefined {
  return SIGNING_PARTICIPANTS.find((p) => p.participantId === participantId);
}

export function getWorkflowBySigningRequestId(signingRequestId: string): DmsWorkflow | undefined {
  for (const workflow of workflowStore.values()) {
    if (workflow.signingRequestId === signingRequestId) {
      return workflow;
    }
  }
  return undefined;
}

export function updateParticipantStatus(fileId: string, participantId: string, status: string): DmsWorkflow {
  const workflow = workflowStore.get(fileId);
  if (!workflow) {
    throw new Error(`No workflow for file ${fileId}`);
  }

  workflow.participantStatuses = {
    ...(workflow.participantStatuses ?? {}),
    [participantId]: status,
  };
  workflowStore.set(fileId, workflow);
  return workflow;
}

export function updateEvidenceState(
  fileId: string,
  state: {
    evidenceReference?: string;
    artifactReference?: string;
    finalSha256?: string;
    finalSignedPdfReference?: string;
    lastSyncedAt?: string;
  },
): DmsWorkflow {
  const workflow = workflowStore.get(fileId);
  if (!workflow) {
    throw new Error(`No workflow for file ${fileId}`);
  }

  if (state.evidenceReference !== undefined) {
    workflow.evidenceReference = state.evidenceReference;
  }
  if (state.artifactReference !== undefined) {
    workflow.artifactReference = state.artifactReference;
  }
  if (state.finalSha256 !== undefined) {
    workflow.finalSha256 = state.finalSha256;
  }
  if (state.finalSignedPdfReference !== undefined) {
    workflow.finalSignedPdfReference = state.finalSignedPdfReference;
  }
  if (state.lastSyncedAt !== undefined) {
    workflow.lastSyncedAt = state.lastSyncedAt;
  }
  workflowStore.set(fileId, workflow);
  return workflow;
}

export function getParticipantStatusByStage(
  fileId: string,
  stageOrder: number,
): Array<{ participantId: string; status: string }> {
  const workflow = workflowStore.get(fileId);
  if (!workflow || !workflow.participantStatuses) {
    return [];
  }

  const stageParticipants = workflow.participants.filter((p) => p.stageOrder === stageOrder);

  return stageParticipants.map((p) => ({
    participantId: p.participantId,
    status: workflow.participantStatuses?.[p.participantId] ?? 'WAITING',
  }));
}

export function mapIntegrationStatusToDms(status: string): DmsDocumentStatus {
  switch (status) {
    case 'READY':
      return 'PENDING_APPROVAL';
    case 'IN_PROGRESS':
    case 'PARTIALLY_COMPLETED':
      return 'SIGNING_IN_PROGRESS';
    case 'COMPLETED':
      return 'SIGNED_COMPLETE';
    case 'REJECTED':
      return 'DRAFT';
    case 'CANCELLED':
      return 'DRAFT';
    case 'EXPIRED':
      return 'DRAFT';
    default:
      return 'DRAFT';
  }
}
