CREATE TYPE "IntegrationSigningRequestStatus" AS ENUM (
  'DRAFT',
  'READY',
  'IN_PROGRESS',
  'PARTIALLY_COMPLETED',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'FAILED'
);

CREATE TABLE "IntegrationSigningRequest" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" INTEGER NOT NULL,
  "teamId" INTEGER NOT NULL,
  "sourceEnvelopeId" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "sourceFilename" TEXT NOT NULL,
  "sourceMimeType" TEXT NOT NULL,
  "verifiedContentHash" TEXT NOT NULL,
  "sourceMetadata" JSONB,
  "externalReference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "envelopeId" TEXT,
  "status" "IntegrationSigningRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "requestFingerprint" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "correlationId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "callbackUrl" TEXT,
  "callbackCorrelationId" TEXT,
  "callbackMetadata" JSONB,

  CONSTRAINT "IntegrationSigningRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationSigningRequestStage" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signingRequestId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "nativeSigningOrder" INTEGER NOT NULL,

  CONSTRAINT "IntegrationSigningRequestStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationSigningRequestParticipant" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signingRequestId" TEXT NOT NULL,
  "stageId" TEXT,
  "participantId" TEXT NOT NULL,
  "externalParticipantId" TEXT,
  "displayName" TEXT,
  "email" TEXT NOT NULL,
  "role" "RecipientRole" NOT NULL,
  "metadata" JSONB,
  "nativeRecipientId" INTEGER,
  "nativeSigningOrder" INTEGER,
  "completedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),

  CONSTRAINT "IntegrationSigningRequestParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationSigningRequest_envelopeId_key"
ON "IntegrationSigningRequest"("envelopeId");

CREATE UNIQUE INDEX "IntegrationSigningRequest_teamId_idempotencyKey_key"
ON "IntegrationSigningRequest"("teamId", "idempotencyKey");

CREATE INDEX "IntegrationSigningRequest_teamId_externalReference_idx"
ON "IntegrationSigningRequest"("teamId", "externalReference");

CREATE INDEX "IntegrationSigningRequest_teamId_status_idx"
ON "IntegrationSigningRequest"("teamId", "status");

CREATE INDEX "IntegrationSigningRequest_sourceEnvelopeId_idx"
ON "IntegrationSigningRequest"("sourceEnvelopeId");

CREATE UNIQUE INDEX "IntegrationReqStage_requestId_order_key"
ON "IntegrationSigningRequestStage"("signingRequestId", "order");

CREATE INDEX "IntegrationReqStage_requestId_nativeOrder_idx"
ON "IntegrationSigningRequestStage"("signingRequestId", "nativeSigningOrder");

CREATE UNIQUE INDEX "IntegrationSigningRequestParticipant_nativeRecipientId_key"
ON "IntegrationSigningRequestParticipant"("nativeRecipientId");

CREATE UNIQUE INDEX "IntegrationReqParticipant_requestId_participantId_key"
ON "IntegrationSigningRequestParticipant"("signingRequestId", "participantId");

CREATE INDEX "IntegrationReqParticipant_requestId_stageId_idx"
ON "IntegrationSigningRequestParticipant"("signingRequestId", "stageId");

CREATE INDEX "IntegrationReqParticipant_requestId_role_idx"
ON "IntegrationSigningRequestParticipant"("signingRequestId", "role");

ALTER TABLE "IntegrationSigningRequest"
ADD CONSTRAINT "IntegrationSigningRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningRequest"
ADD CONSTRAINT "IntegrationSigningRequest_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningRequest"
ADD CONSTRAINT "IntegrationSigningRequest_envelopeId_fkey"
FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningRequestStage"
ADD CONSTRAINT "IntegrationSigningRequestStage_signingRequestId_fkey"
FOREIGN KEY ("signingRequestId") REFERENCES "IntegrationSigningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningRequestParticipant"
ADD CONSTRAINT "IntegrationSigningRequestParticipant_signingRequestId_fkey"
FOREIGN KEY ("signingRequestId") REFERENCES "IntegrationSigningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningRequestParticipant"
ADD CONSTRAINT "IntegrationSigningRequestParticipant_stageId_fkey"
FOREIGN KEY ("stageId") REFERENCES "IntegrationSigningRequestStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningRequestParticipant"
ADD CONSTRAINT "IntegrationSigningRequestParticipant_nativeRecipientId_fkey"
FOREIGN KEY ("nativeRecipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
