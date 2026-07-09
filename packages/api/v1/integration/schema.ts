import { extendZodWithOpenApi } from '@anatine/zod-openapi';
import { ZUrlSchema } from '@documenso/lib/schemas/common';
import { zEmail } from '@documenso/lib/utils/zod';
import { z } from 'zod';

extendZodWithOpenApi(z);

const ZSha256HexSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, 'SHA-256 hashes must be 64 hexadecimal characters.')
  .transform((value) => value.toLowerCase());

const ZSha256AlgorithmInputSchema = z
  .string()
  .trim()
  .refine((value) => /^(sha256|sha-256)$/i.test(value), {
    message: 'Only SHA-256 content hashes are supported.',
  });

export const ZIntegrationApiV1StatusSchema = z.enum([
  'DRAFT',
  'READY',
  'IN_PROGRESS',
  'PARTIALLY_COMPLETED',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
]);

export type TIntegrationApiV1StatusSchema = z.infer<typeof ZIntegrationApiV1StatusSchema>;

export const ZIntegrationApiV1ParticipantRoleSchema = z.enum(['SIGNER', 'APPROVER', 'VIEWER', 'CC']);

export type TIntegrationApiV1ParticipantRoleSchema = z.infer<typeof ZIntegrationApiV1ParticipantRoleSchema>;

export const ZIntegrationApiV1StageCompletionPolicySchema = z.enum(['ALL_REQUIRED']);

export type TIntegrationApiV1StageCompletionPolicySchema = z.infer<typeof ZIntegrationApiV1StageCompletionPolicySchema>;

export const ZIntegrationApiV1SigningSessionModeSchema = z.enum(['REDIRECT', 'EMBED']);

export type TIntegrationApiV1SigningSessionModeSchema = z.infer<typeof ZIntegrationApiV1SigningSessionModeSchema>;

export const ZIntegrationApiV1StageStatusSchema = z.enum([
  'WAITING',
  'ACTIVE',
  'PARTIALLY_COMPLETED',
  'COMPLETED',
  'BLOCKED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
]);

export type TIntegrationApiV1StageStatusSchema = z.infer<typeof ZIntegrationApiV1StageStatusSchema>;

export const ZIntegrationApiV1ParticipantStatusSchema = z.enum([
  'WAITING',
  'AVAILABLE',
  'VIEWED',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
]);

export type TIntegrationApiV1ParticipantStatusSchema = z.infer<typeof ZIntegrationApiV1ParticipantStatusSchema>;

export const ZIntegrationApiV1BlockedReasonSchema = z.enum([
  'REQUEST_NOT_ACTIVE',
  'PREVIOUS_STAGE_INCOMPLETE',
  'REQUEST_TERMINATED',
]);

export type TIntegrationApiV1BlockedReasonSchema = z.infer<typeof ZIntegrationApiV1BlockedReasonSchema>;

export const ZIntegrationApiV1MetadataValueSchema: z.ZodType<
  string | number | boolean | null | Array<unknown> | Record<string, unknown>
> = z.lazy(() =>
  z.union([
    z.string().max(2_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(ZIntegrationApiV1MetadataValueSchema).max(50),
    z.record(z.string().min(1).max(64), ZIntegrationApiV1MetadataValueSchema),
  ]),
);

export const ZIntegrationApiV1MetadataSchema = z.record(
  z.string().min(1).max(64),
  ZIntegrationApiV1MetadataValueSchema,
);

export const ZIntegrationApiV1DocumentHashInputSchema = z.object({
  algorithm: ZSha256AlgorithmInputSchema,
  value: ZSha256HexSchema,
});

export const ZIntegrationApiV1DocumentHashSchema = z.object({
  algorithm: z.literal('SHA-256'),
  value: z.string().regex(/^[a-f0-9]{64}$/),
});

export const ZIntegrationApiV1SourceDocumentSchema = z.object({
  sourceReference: z.string().min(1).max(255),
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/\.pdf$/i, 'The source filename must end with .pdf.'),
  mimeType: z.literal('application/pdf'),
  contentHash: ZIntegrationApiV1DocumentHashInputSchema,
  metadata: ZIntegrationApiV1MetadataSchema.optional(),
});

export const ZIntegrationApiV1ParticipantSchema = z.object({
  participantId: z.string().min(1).max(120),
  externalParticipantId: z.string().min(1).max(255).optional(),
  displayName: z.string().min(1).max(255).optional(),
  email: zEmail(),
  role: ZIntegrationApiV1ParticipantRoleSchema,
  metadata: ZIntegrationApiV1MetadataSchema.optional(),
});

export const ZIntegrationApiV1StageSchema = z.object({
  order: z.number().int().min(1),
  completionPolicy: ZIntegrationApiV1StageCompletionPolicySchema.optional().default('ALL_REQUIRED'),
  participantIds: z.array(z.string().min(1).max(120)).min(1).max(50),
});

export const ZIntegrationApiV1SigningRequestSchema = z
  .object({
    externalReference: z.string().min(1).max(255),
    title: z.string().min(1).max(255),
    document: ZIntegrationApiV1SourceDocumentSchema,
    participants: z.array(ZIntegrationApiV1ParticipantSchema).min(1).max(50),
    stages: z.array(ZIntegrationApiV1StageSchema).min(1).max(50),
    expiresAt: z.coerce.date().optional(),
    idempotencyKey: z.string().min(1).max(255).optional(),
    correlationId: z.string().min(1).max(255).optional(),
    clientCorrelationId: z.string().min(1).max(255).optional(),
    callback: z
      .object({
        url: ZUrlSchema,
        correlationId: z.string().min(1).max(255).optional(),
        metadata: ZIntegrationApiV1MetadataSchema.optional(),
      })
      .optional(),
    metadata: ZIntegrationApiV1MetadataSchema.optional(),
  })
  .superRefine((request, ctx) => {
    const participantIds = new Set<string>();
    const normalizedEmails = new Set<string>();

    for (const [index, participant] of request.participants.entries()) {
      if (participantIds.has(participant.participantId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate participantId "${participant.participantId}".`,
          path: ['participants', index, 'participantId'],
        });
      }

      const normalizedEmail = participant.email.trim().toLowerCase();

      if (normalizedEmails.has(normalizedEmail)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate participant email "${participant.email}" after normalization.`,
          path: ['participants', index, 'email'],
        });
      }

      participantIds.add(participant.participantId);
      normalizedEmails.add(normalizedEmail);
    }

    const stageOrders = request.stages.map((stage) => stage.order).sort((left, right) => left - right);

    stageOrders.forEach((order, index) => {
      const expectedOrder = index + 1;

      if (order !== expectedOrder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Stages must use contiguous ordering starting at 1 with no gaps.',
          path: ['stages'],
        });
      }
    });

    const actionableParticipants = new Set(
      request.participants
        .filter((participant) => participant.role === 'SIGNER' || participant.role === 'APPROVER')
        .map((participant) => participant.participantId),
    );

    const observerParticipants = new Set(
      request.participants
        .filter((participant) => participant.role === 'VIEWER' || participant.role === 'CC')
        .map((participant) => participant.participantId),
    );

    const stagedParticipants = new Set<string>();

    for (const [stageIndex, stage] of request.stages.entries()) {
      const stageParticipantIds = new Set<string>();

      for (const participantId of stage.participantIds) {
        if (!participantIds.has(participantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown participantId "${participantId}" referenced in stages.`,
            path: ['stages', stageIndex, 'participantIds'],
          });
        }

        if (stageParticipantIds.has(participantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate participantId "${participantId}" within a stage.`,
            path: ['stages', stageIndex, 'participantIds'],
          });
        }

        if (stagedParticipants.has(participantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Participant "${participantId}" can only appear in one stage.`,
            path: ['stages', stageIndex, 'participantIds'],
          });
        }

        if (observerParticipants.has(participantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Participant "${participantId}" has a read-only role and cannot appear in stages.`,
            path: ['stages', stageIndex, 'participantIds'],
          });
        }

        stageParticipantIds.add(participantId);
        stagedParticipants.add(participantId);
      }
    }

    for (const actionableParticipantId of actionableParticipants) {
      if (!stagedParticipants.has(actionableParticipantId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Actionable participant "${actionableParticipantId}" must appear in stages.`,
          path: ['stages'],
        });
      }
    }
  });

export type TIntegrationApiV1SigningRequestSchema = z.infer<typeof ZIntegrationApiV1SigningRequestSchema>;

export const ZIntegrationApiV1EventTypeSchema = z.enum([
  'REQUEST_CREATED',
  'REQUEST_SENT',
  'SIGNING_SESSION_CREATED',
  'SIGNING_SESSION_LAUNCHED',
  'PARTICIPANT_COMPLETED',
  'PARTICIPANT_REJECTED',
  'REQUEST_PARTIALLY_COMPLETED',
  'REQUEST_COMPLETED',
  'REQUEST_REJECTED',
  'REQUEST_CANCELLED',
  'REQUEST_EXPIRED',
  'REQUEST_FAILED',
  'FINAL_ARTIFACT_CAPTURED',
  'CALLBACK_QUEUED',
  'CALLBACK_DELIVERED',
  'CALLBACK_FAILED',
  'RECONCILIATION_REFRESHED',
  'REMINDER_SENT',
  'REMINDER_ATTEMPTED',
]);

export const ZIntegrationApiV1EventSourceSchema = z.enum([
  'API',
  'SIGNING_SESSION',
  'ENGINE_COMPLETION',
  'RECONCILIATION',
  'CALLBACK',
  'SYSTEM',
]);

export const ZIntegrationApiV1ArtifactTypeSchema = z.enum(['SIGNED_PDF']);

export const ZIntegrationApiV1ArtifactIntegrityStatusSchema = z.enum([
  'HASH_VERIFIED',
  'HASH_MISMATCH',
  'SIGNATURE_VALIDATION_NOT_AVAILABLE',
]);

export const ZIntegrationApiV1CallbackDeliveryStateSchema = z.enum([
  'PENDING',
  'DELIVERING',
  'DELIVERED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
]);

export const ZIntegrationApiV1EventSchema = z.object({
  eventId: z.string().min(1).max(120),
  requestId: z.string().min(1).max(120),
  eventType: ZIntegrationApiV1EventTypeSchema,
  source: ZIntegrationApiV1EventSourceSchema,
  correlationId: z.string().min(1).max(255),
  requestCorrelationId: z.string().min(1).max(255),
  eventTimestamp: z.string().datetime(),
  observedAt: z.string().datetime(),
  participantId: z.string().min(1).max(120).optional(),
  sessionId: z.string().min(1).max(120).optional(),
  actorReference: z.string().min(1).max(255).optional(),
  nativeEnvelopeId: z.string().min(1).max(120).optional(),
  nativeRecipientId: z.number().int().positive().optional(),
  nativeEventReference: z.string().min(1).max(255).optional(),
  statusBefore: ZIntegrationApiV1StatusSchema.optional(),
  statusAfter: ZIntegrationApiV1StatusSchema.optional(),
  metadata: ZIntegrationApiV1MetadataSchema.optional(),
});

export type TIntegrationApiV1EventSchema = z.infer<typeof ZIntegrationApiV1EventSchema>;

export const ZIntegrationApiV1SigningRequestDocumentSchema = z.object({
  sourceReference: z.string().min(1).max(255),
  filename: z.string().min(1).max(255),
  mimeType: z.literal('application/pdf'),
  verifiedContentHash: ZIntegrationApiV1DocumentHashSchema,
  metadata: ZIntegrationApiV1MetadataSchema.optional(),
});

export const ZIntegrationApiV1SigningRequestParticipantResponseSchema = z.object({
  participantId: z.string().min(1).max(120),
  externalParticipantId: z.string().min(1).max(255).optional(),
  displayName: z.string().min(1).max(255).optional(),
  email: zEmail(),
  role: ZIntegrationApiV1ParticipantRoleSchema,
  status: ZIntegrationApiV1ParticipantStatusSchema,
  stageOrder: z.number().int().min(1).optional(),
  nativeSigningOrder: z.number().int().min(1).optional(),
  statusUpdatedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  rejectedAt: z.string().datetime().optional(),
  isActionable: z.boolean(),
  isBlocked: z.boolean(),
  blockedReason: ZIntegrationApiV1BlockedReasonSchema.optional(),
  metadata: ZIntegrationApiV1MetadataSchema.optional(),
});

export const ZIntegrationApiV1SigningRequestStageResponseSchema = z.object({
  order: z.number().int().min(1),
  nativeSigningOrder: z.number().int().min(1),
  completionPolicy: ZIntegrationApiV1StageCompletionPolicySchema,
  status: ZIntegrationApiV1StageStatusSchema,
  completedAt: z.string().datetime().optional(),
  isActive: z.boolean(),
  isBlocked: z.boolean(),
  blockedReason: ZIntegrationApiV1BlockedReasonSchema.optional(),
  participantIds: z.array(z.string().min(1).max(120)).min(1).max(50),
});

export const ZIntegrationApiV1SigningRequestTimelineEntrySchema = z.object({
  stageOrder: z.number().int().min(1).optional(),
  stageStatus: ZIntegrationApiV1StageStatusSchema.optional(),
  stageCompletionPolicy: ZIntegrationApiV1StageCompletionPolicySchema.optional(),
  participantId: z.string().min(1).max(120),
  externalParticipantId: z.string().min(1).max(255).optional(),
  displayName: z.string().min(1).max(255).optional(),
  email: zEmail(),
  role: ZIntegrationApiV1ParticipantRoleSchema,
  nativeSigningOrder: z.number().int().min(1).optional(),
  status: ZIntegrationApiV1ParticipantStatusSchema,
  statusUpdatedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  rejectedAt: z.string().datetime().optional(),
  isActionable: z.boolean(),
  isBlocked: z.boolean(),
  blockedReason: ZIntegrationApiV1BlockedReasonSchema.optional(),
});

export const ZIntegrationApiV1NativeDocumentReferenceSchema = z.object({
  envelopeId: z.string().min(1).max(120),
  documentId: z.number().int().positive().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED']).optional(),
});

export const ZIntegrationApiV1SigningRequestResponseSchema = z.object({
  requestId: z.string().min(1).max(120),
  externalReference: z.string().min(1).max(255),
  title: z.string().min(1).max(255),
  status: ZIntegrationApiV1StatusSchema,
  document: ZIntegrationApiV1SigningRequestDocumentSchema,
  nativeDocument: ZIntegrationApiV1NativeDocumentReferenceSchema.optional(),
  expiresAt: z.string().datetime().optional(),
  correlationId: z.string().min(1).max(255).optional(),
  clientCorrelationId: z.string().min(1).max(255).optional(),
  metadata: ZIntegrationApiV1MetadataSchema.optional(),
  stages: z.array(ZIntegrationApiV1SigningRequestStageResponseSchema).max(50),
  participants: z.array(ZIntegrationApiV1SigningRequestParticipantResponseSchema).max(50),
  timeline: z.array(ZIntegrationApiV1SigningRequestTimelineEntrySchema).max(50),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  rejectedAt: z.string().datetime().optional(),
});

export type TIntegrationApiV1SigningRequestResponseSchema = z.infer<
  typeof ZIntegrationApiV1SigningRequestResponseSchema
>;

export const ZIntegrationApiV1CreateSigningRequestResponseSchema = ZIntegrationApiV1SigningRequestResponseSchema.extend(
  {
    idempotentReplay: z.boolean(),
  },
);

export type TIntegrationApiV1CreateSigningRequestResponseSchema = z.infer<
  typeof ZIntegrationApiV1CreateSigningRequestResponseSchema
>;

export const ZIntegrationApiV1DocumentCountCapabilitySchema = z.object({
  minimum: z.number().int().min(1),
  maximum: z.number().int().min(1).nullable(),
  multipleDocuments: z.boolean(),
});

export const ZIntegrationApiV1RejectRequestSchema = z.object({
  reason: z.string().trim().min(1).max(255),
  clientCorrelationId: z.string().trim().min(1).max(255).optional(),
});

export type TIntegrationApiV1RejectRequestSchema = z.infer<typeof ZIntegrationApiV1RejectRequestSchema>;

export const ZIntegrationApiV1CancelRequestSchema = z.object({
  reason: z.string().trim().min(1).max(255),
  clientCorrelationId: z.string().trim().min(1).max(255).optional(),
});

export type TIntegrationApiV1CancelRequestSchema = z.infer<typeof ZIntegrationApiV1CancelRequestSchema>;

export const ZIntegrationApiV1RemindRequestSchema = z.object({
  clientCorrelationId: z.string().trim().min(1).max(255).optional(),
});

export type TIntegrationApiV1RemindRequestSchema = z.infer<typeof ZIntegrationApiV1RemindRequestSchema>;

export const ZIntegrationApiV1CreateSigningSessionSchema = z.object({
  returnUrl: z.string().trim().min(1).max(2_000).optional(),
  mode: ZIntegrationApiV1SigningSessionModeSchema.optional().default('REDIRECT'),
  clientState: z.string().trim().min(1).max(255).optional(),
  ttlSeconds: z.number().int().min(60).max(3_600).optional(),
});

export type TIntegrationApiV1CreateSigningSessionSchema = z.infer<typeof ZIntegrationApiV1CreateSigningSessionSchema>;

export const ZIntegrationApiV1CreateSigningSessionResponseSchema = z.object({
  sessionId: z.string().min(1).max(120),
  requestId: z.string().min(1).max(120),
  participantId: z.string().min(1).max(120),
  mode: ZIntegrationApiV1SigningSessionModeSchema,
  expiresAt: z.string().datetime(),
  launchUrl: z.string().url(),
  returnUrl: z.string().url().optional(),
  clientState: z.string().min(1).max(255).optional(),
  participantStatus: ZIntegrationApiV1ParticipantStatusSchema,
  requestStatus: ZIntegrationApiV1StatusSchema,
  embeddedSupported: z.boolean(),
});

export type TIntegrationApiV1CreateSigningSessionResponseSchema = z.infer<
  typeof ZIntegrationApiV1CreateSigningSessionResponseSchema
>;

export const ZIntegrationApiV1CertificateMetadataSchema = z.object({
  nativeCertificateReference: z.string().min(1).max(255).optional(),
  certificatePdfAvailable: z.boolean(),
  auditLogPdfAvailable: z.boolean(),
  subject: z.string().min(1).max(255).optional(),
  issuer: z.string().min(1).max(255).optional(),
  serialNumber: z.string().min(1).max(255).optional(),
  fingerprint: z.string().min(1).max(255).optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  signingTimestamp: z.string().datetime().optional(),
  verificationStatus: ZIntegrationApiV1ArtifactIntegrityStatusSchema,
});

export const ZIntegrationApiV1ArtifactSchema = z.object({
  artifactId: z.string().min(1).max(120),
  requestId: z.string().min(1).max(120),
  artifactType: ZIntegrationApiV1ArtifactTypeSchema,
  filename: z.string().min(1).max(255),
  mimeType: z.literal('application/pdf'),
  sizeBytes: z.number().int().positive(),
  sha256: ZIntegrationApiV1DocumentHashSchema,
  integrityStatus: ZIntegrationApiV1ArtifactIntegrityStatusSchema,
  capturedAt: z.string().datetime(),
  certificateMetadata: ZIntegrationApiV1CertificateMetadataSchema.optional(),
});

export type TIntegrationApiV1ArtifactSchema = z.infer<typeof ZIntegrationApiV1ArtifactSchema>;

export const ZIntegrationApiV1CallbackDeliverySchema = z.object({
  deliveryId: z.string().min(1).max(120),
  eventId: z.string().min(1).max(120),
  deliveryState: ZIntegrationApiV1CallbackDeliveryStateSchema,
  targetUrl: z.string().url(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: z.string().datetime(),
  lastAttemptAt: z.string().datetime().optional(),
  lastHttpStatus: z.number().int().min(0).optional(),
  lastErrorSummary: z.string().min(1).max(500).optional(),
  deliveredAt: z.string().datetime().optional(),
  lastAttemptCorrelationId: z.string().min(1).max(255).optional(),
});

export type TIntegrationApiV1CallbackDeliverySchema = z.infer<typeof ZIntegrationApiV1CallbackDeliverySchema>;

export const ZIntegrationApiV1EvidenceResponseSchema = z.object({
  requestId: z.string().min(1).max(120),
  correlationId: z.string().min(1).max(255),
  clientCorrelationId: z.string().min(1).max(255).optional(),
  status: ZIntegrationApiV1StatusSchema,
  timeline: z.array(ZIntegrationApiV1SigningRequestTimelineEntrySchema).max(50),
  events: z.array(ZIntegrationApiV1EventSchema).max(500),
  artifacts: z.array(ZIntegrationApiV1ArtifactSchema).max(10),
  finalArtifact: ZIntegrationApiV1ArtifactSchema.optional(),
  finalSha256: ZIntegrationApiV1DocumentHashSchema.optional(),
  certificateMetadata: ZIntegrationApiV1CertificateMetadataSchema.optional(),
  callbacks: z.object({
    deliveries: z.array(ZIntegrationApiV1CallbackDeliverySchema).max(100),
  }),
  reconciliation: z.object({
    lastReconciledAt: z.string().datetime().optional(),
    lastEventObservedAt: z.string().datetime().optional(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  rejectedAt: z.string().datetime().optional(),
});

export type TIntegrationApiV1EvidenceResponseSchema = z.infer<typeof ZIntegrationApiV1EvidenceResponseSchema>;

export const ZIntegrationApiV1ArtifactListResponseSchema = z.object({
  requestId: z.string().min(1).max(120),
  status: ZIntegrationApiV1StatusSchema,
  artifacts: z.array(ZIntegrationApiV1ArtifactSchema).max(10),
});

export type TIntegrationApiV1ArtifactListResponseSchema = z.infer<typeof ZIntegrationApiV1ArtifactListResponseSchema>;

export const ZIntegrationApiV1CapabilitySchema = z.object({
  apiVersion: z.literal('V1'),
  enabled: z.boolean(),
  supportsMutation: z.literal(true),
  providerExecutionAvailable: z.literal(false),
  supportedWorkflowModes: z.array(z.enum(['STAGED'])).min(1),
  supportedSigningModes: z.array(ZIntegrationApiV1SigningSessionModeSchema).min(1),
  redirectSigningSupported: z.literal(true),
  embeddedSigningSupported: z.literal(false),
  sessionExpirySupported: z.literal(true),
  returnUrlAllowlistSupported: z.literal(true),
  callbackEventsSupported: z.literal(true),
  evidenceEndpointSupported: z.literal(true),
  finalArtifactMetadataSupported: z.literal(true),
  finalArtifactDownloadSupported: z.literal(true),
  callbackSigningSupported: z.literal(true),
  callbackRetryOutboxSupported: z.literal(true),
  reconciliationSupported: z.literal(true),
  integrityVerificationTested: z.literal(true),
  supportedCallbackModes: z.array(z.enum(['PER_REQUEST_URL'])).min(1),
  supportedDocumentCount: ZIntegrationApiV1DocumentCountCapabilitySchema,
  rejectionSupported: z.literal(true),
  cancellationSupported: z.literal(true),
  expiryProcessorSupported: z.literal(true),
  remindersSupported: z.literal(true),
  reminderRateLimitsSupported: z.literal(true),
  terminalStateEnforcementSupported: z.literal(true),
  immutableCompletedRequestsSupported: z.literal(true),
  releasePhase: z.literal('PHASE_6_LIFECYCLE_CONTROLS'),
});

export type TIntegrationApiV1CapabilitySchema = z.infer<typeof ZIntegrationApiV1CapabilitySchema>;

export const ZIntegrationApiV1HealthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
  capabilities: ZIntegrationApiV1CapabilitySchema,
});

export type TIntegrationApiV1HealthResponseSchema = z.infer<typeof ZIntegrationApiV1HealthResponseSchema>;
