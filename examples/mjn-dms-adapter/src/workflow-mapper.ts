import type { MJNWorkflowConfig } from './types';

export const REGULATORY_HYBRID_ROUTE: MJNWorkflowConfig = {
  dossierId: 'DOS-2026-0042',
  fileId: 'FILE-REG-001',
  fileVersionId: 'VER-003',
  title: 'Regulatory Submission — Clinical Study Report v3',
  idempotencyKey: '',
  stages: [
    {
      order: 1,
      participants: [
        {
          participantId: 'regulatory-author',
          role: 'SIGNER',
          name: 'Regulatory Author',
          email: 'regulatory.author@example.test',
        },
      ],
    },
    {
      order: 2,
      participants: [
        {
          participantId: 'medical',
          role: 'SIGNER',
          name: 'Medical Reviewer',
          email: 'medical@example.test',
        },
        {
          participantId: 'quality',
          role: 'SIGNER',
          name: 'Quality Reviewer',
          email: 'quality@example.test',
        },
      ],
    },
    {
      order: 3,
      participants: [
        {
          participantId: 'regional-regulatory-lead',
          role: 'SIGNER',
          name: 'Regional Regulatory Lead',
          email: 'regional.regulatory.lead@example.test',
        },
      ],
    },
  ],
};

export const mapMjnWorkflowToSigningRequest = (
  workflow: MJNWorkflowConfig,
  sourceReference: string,
  sourceHash: string,
  idempotencyKey: string,
): Record<string, unknown> => {
  const allParticipants = workflow.stages.flatMap((stage) => stage.participants);

  return {
    externalReference: `MJN-FILE-VERSION-${workflow.fileVersionId}`,
    title: workflow.title,
    document: {
      sourceReference,
      filename: 'submission.pdf',
      mimeType: 'application/pdf',
      contentHash: {
        algorithm: 'SHA-256',
        value: sourceHash,
      },
      metadata: {
        sourceSystem: 'MJN-DMS',
        dossierId: workflow.dossierId,
        fileId: workflow.fileId,
        fileVersionId: workflow.fileVersionId,
        documentType: 'REGULATORY_SUBMISSION',
      },
    },
    participants: allParticipants.map((p) => ({
      participantId: p.participantId,
      displayName: p.name,
      email: p.email,
      role: p.role,
      metadata: {
        mjnRole: p.name,
      },
    })),
    stages: workflow.stages.map((stage) => ({
      order: stage.order,
      completionPolicy: 'ALL_REQUIRED',
      participantIds: stage.participants.map((p) => p.participantId),
    })),
    metadata: {
      sourceSystem: 'MJN-DMS',
      dossierId: workflow.dossierId,
      fileId: workflow.fileId,
      fileVersionId: workflow.fileVersionId,
      documentType: 'REGULATORY_SUBMISSION',
      workflowInstanceId: `wfi-${workflow.dossierId}-${workflow.fileVersionId}`,
    },
    idempotencyKey,
  };
};

export const buildIdempotencyKey = (workflow: MJNWorkflowConfig): string => {
  return `mjn-${workflow.dossierId}-${workflow.fileVersionId}-${Date.now()}`;
};
