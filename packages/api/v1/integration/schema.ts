import { extendZodWithOpenApi } from '@anatine/zod-openapi';
import { ZUrlSchema } from '@documenso/lib/schemas/common';
import { zEmail } from '@documenso/lib/utils/zod';
import { z } from 'zod';

extendZodWithOpenApi(z);

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

export const ZIntegrationApiV1DocumentHashSchema = z.object({
  algorithm: z.string().min(1).max(32),
  value: z.string().min(1).max(512),
});

export const ZIntegrationApiV1DocumentReferenceSchema = z.object({
  sourceReference: z.string().min(1).max(255),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  contentHash: ZIntegrationApiV1DocumentHashSchema.optional(),
  metadata: ZIntegrationApiV1MetadataSchema.optional(),
});

export const ZIntegrationApiV1ParticipantSchema = z
  .object({
    participantId: z.string().min(1).max(120),
    externalParticipantId: z.string().min(1).max(255).optional(),
    displayName: z.string().min(1).max(255).optional(),
    email: zEmail().optional(),
    role: ZIntegrationApiV1ParticipantRoleSchema,
    metadata: ZIntegrationApiV1MetadataSchema.optional(),
  })
  .superRefine((participant, ctx) => {
    if (!participant.email && !participant.externalParticipantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A participant must include an email or an external participant identifier.',
        path: ['externalParticipantId'],
      });
    }
  });

export const ZIntegrationApiV1SigningStageSchema = z.object({
  order: z.number().int().min(1),
  participantIds: z.array(z.string().min(1).max(120)).min(1).max(50),
});

export const ZIntegrationApiV1RequestSchema = z
  .object({
    externalReference: z.string().min(1).max(255),
    title: z.string().min(1).max(255),
    documentReferences: z.array(ZIntegrationApiV1DocumentReferenceSchema).min(1).max(20),
    participants: z.array(ZIntegrationApiV1ParticipantSchema).min(1).max(50),
    signingStages: z.array(ZIntegrationApiV1SigningStageSchema).min(1).max(50),
    expiresAt: z.coerce.date().optional(),
    idempotencyKey: z.string().min(1).max(255).optional(),
    correlationId: z.string().min(1).max(255).optional(),
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

    for (const [index, participant] of request.participants.entries()) {
      if (participantIds.has(participant.participantId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate participantId "${participant.participantId}".`,
          path: ['participants', index, 'participantId'],
        });
      }

      participantIds.add(participant.participantId);
    }

    const stageOrders = request.signingStages.map((stage) => stage.order).sort((left, right) => left - right);

    stageOrders.forEach((order, index) => {
      const expectedOrder = index + 1;

      if (order !== expectedOrder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Signing stages must use contiguous ordering starting at 1.',
          path: ['signingStages'],
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

    for (const [stageIndex, stage] of request.signingStages.entries()) {
      const stageParticipantIds = new Set<string>();

      for (const participantId of stage.participantIds) {
        if (!participantIds.has(participantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown participantId "${participantId}" referenced in signingStages.`,
            path: ['signingStages', stageIndex, 'participantIds'],
          });
        }

        if (stageParticipantIds.has(participantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate participantId "${participantId}" within a signing stage.`,
            path: ['signingStages', stageIndex, 'participantIds'],
          });
        }

        if (stagedParticipants.has(participantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Participant "${participantId}" can only appear in one signing stage.`,
            path: ['signingStages', stageIndex, 'participantIds'],
          });
        }

        if (observerParticipants.has(participantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Participant "${participantId}" has a non-actionable role and cannot appear in signingStages.`,
            path: ['signingStages', stageIndex, 'participantIds'],
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
          message: `Actionable participant "${actionableParticipantId}" must appear in signingStages.`,
          path: ['signingStages'],
        });
      }
    }
  });

export type TIntegrationApiV1RequestSchema = z.infer<typeof ZIntegrationApiV1RequestSchema>;

export const ZIntegrationApiV1EventTypeSchema = z.enum([
  'REQUEST_CREATED',
  'STATUS_CHANGED',
  'PARTICIPANT_COMPLETED',
  'PARTICIPANT_REJECTED',
  'REQUEST_EXPIRED',
  'REQUEST_CANCELLED',
  'REQUEST_FAILED',
]);

export const ZIntegrationApiV1EventSchema = z.object({
  eventId: z.string().min(1).max(120),
  integrationRequestId: z.string().min(1).max(120),
  externalReference: z.string().min(1).max(255).optional(),
  providerReference: z.string().min(1).max(255).optional(),
  eventType: ZIntegrationApiV1EventTypeSchema,
  occurredAt: z.coerce.date(),
  actorParticipantId: z.string().min(1).max(120).optional(),
  statusBefore: ZIntegrationApiV1StatusSchema.optional(),
  statusAfter: ZIntegrationApiV1StatusSchema.optional(),
  correlationId: z.string().min(1).max(255).optional(),
  metadata: ZIntegrationApiV1MetadataSchema.optional(),
});

export type TIntegrationApiV1EventSchema = z.infer<typeof ZIntegrationApiV1EventSchema>;

export const ZIntegrationApiV1DocumentCountCapabilitySchema = z.object({
  minimum: z.number().int().min(1),
  maximum: z.number().int().min(1).nullable(),
  multipleDocuments: z.boolean(),
});

export const ZIntegrationApiV1CapabilitySchema = z.object({
  apiVersion: z.literal('V1'),
  enabled: z.boolean(),
  supportsMutation: z.literal(false),
  providerExecutionAvailable: z.literal(false),
  supportedWorkflowModes: z.array(z.enum(['STAGED'])).min(1),
  supportedDocumentCount: ZIntegrationApiV1DocumentCountCapabilitySchema,
  releasePhase: z.literal('PHASE_1_SKELETON'),
});

export type TIntegrationApiV1CapabilitySchema = z.infer<typeof ZIntegrationApiV1CapabilitySchema>;

export const ZIntegrationApiV1HealthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
  capabilities: ZIntegrationApiV1CapabilitySchema,
});

export type TIntegrationApiV1HealthResponseSchema = z.infer<typeof ZIntegrationApiV1HealthResponseSchema>;
