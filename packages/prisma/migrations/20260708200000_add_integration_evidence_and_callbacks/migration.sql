CREATE TYPE "IntegrationSigningEventType" AS ENUM (
  'REQUEST_CREATED',
  'REQUEST_SENT',
  'SIGNING_SESSION_CREATED',
  'SIGNING_SESSION_LAUNCHED',
  'PARTICIPANT_COMPLETED',
  'PARTICIPANT_REJECTED',
  'REQUEST_PARTIALLY_COMPLETED',
  'REQUEST_COMPLETED',
  'REQUEST_REJECTED',
  'REQUEST_FAILED',
  'FINAL_ARTIFACT_CAPTURED',
  'CALLBACK_QUEUED',
  'CALLBACK_DELIVERED',
  'CALLBACK_FAILED',
  'RECONCILIATION_REFRESHED'
);

CREATE TYPE "IntegrationSigningEventSource" AS ENUM (
  'API',
  'SIGNING_SESSION',
  'ENGINE_COMPLETION',
  'RECONCILIATION',
  'CALLBACK',
  'SYSTEM'
);

CREATE TYPE "IntegrationSigningArtifactType" AS ENUM (
  'SIGNED_PDF'
);

CREATE TYPE "IntegrationArtifactIntegrityStatus" AS ENUM (
  'HASH_VERIFIED',
  'HASH_MISMATCH',
  'SIGNATURE_VALIDATION_NOT_AVAILABLE'
);

CREATE TYPE "IntegrationCallbackDeliveryState" AS ENUM (
  'PENDING',
  'DELIVERING',
  'DELIVERED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL'
);

ALTER TABLE "IntegrationSigningRequest"
ADD COLUMN "clientCorrelationId" TEXT,
ADD COLUMN "lastReconciledAt" TIMESTAMP(3);

CREATE TABLE "IntegrationSigningEvent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signingRequestId" TEXT NOT NULL,
  "signingRequestParticipantId" TEXT,
  "signingSessionId" TEXT,
  "eventType" "IntegrationSigningEventType" NOT NULL,
  "source" "IntegrationSigningEventSource" NOT NULL,
  "correlationId" TEXT NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "requestCorrelationId" TEXT NOT NULL,
  "nativeEnvelopeId" TEXT,
  "nativeRecipientId" INTEGER,
  "nativeEventReference" TEXT,
  "actorReference" TEXT,
  "statusBefore" "IntegrationSigningRequestStatus",
  "statusAfter" "IntegrationSigningRequestStatus",
  "eventTimestamp" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,

  CONSTRAINT "IntegrationSigningEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationSigningArtifact" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signingRequestId" TEXT NOT NULL,
  "envelopeId" TEXT NOT NULL,
  "envelopeItemId" TEXT NOT NULL,
  "documentDataId" TEXT NOT NULL,
  "artifactType" "IntegrationSigningArtifactType" NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256Hash" TEXT NOT NULL,
  "integrityStatus" "IntegrationArtifactIntegrityStatus" NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "certificateMetadata" JSONB,

  CONSTRAINT "IntegrationSigningArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationCallbackDelivery" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signingRequestId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "state" "IntegrationCallbackDeliveryState" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "lastAttemptAt" TIMESTAMP(3),
  "lastHttpStatus" INTEGER,
  "lastErrorSummary" TEXT,
  "lastSignatureTimestamp" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "lastAttemptCorrelationId" TEXT,

  CONSTRAINT "IntegrationCallbackDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationSigningEvent_requestId_dedupe_key"
ON "IntegrationSigningEvent"("signingRequestId", "deduplicationKey");

CREATE INDEX "IntegrationSigningEvent_requestId_eventTime_idx"
ON "IntegrationSigningEvent"("signingRequestId", "eventTimestamp");

CREATE INDEX "IntegrationSigningEvent_participantId_idx"
ON "IntegrationSigningEvent"("signingRequestParticipantId");

CREATE INDEX "IntegrationSigningEvent_sessionId_idx"
ON "IntegrationSigningEvent"("signingSessionId");

CREATE INDEX "IntegrationSigningEvent_nativeRecipientId_idx"
ON "IntegrationSigningEvent"("nativeRecipientId");

CREATE UNIQUE INDEX "IntegrationSigningArtifact_requestId_type_key"
ON "IntegrationSigningArtifact"("signingRequestId", "artifactType");

CREATE INDEX "IntegrationSigningArtifact_requestId_capturedAt_idx"
ON "IntegrationSigningArtifact"("signingRequestId", "capturedAt");

CREATE INDEX "IntegrationSigningArtifact_documentDataId_idx"
ON "IntegrationSigningArtifact"("documentDataId");

CREATE UNIQUE INDEX "IntegrationCallbackDelivery_eventId_key"
ON "IntegrationCallbackDelivery"("eventId");

CREATE INDEX "IntegrationCallbackDelivery_requestId_state_idx"
ON "IntegrationCallbackDelivery"("signingRequestId", "state");

CREATE INDEX "IntegrationCallbackDelivery_state_nextAttemptAt_idx"
ON "IntegrationCallbackDelivery"("state", "nextAttemptAt");

ALTER TABLE "IntegrationSigningEvent"
ADD CONSTRAINT "IntegrationSigningEvent_signingRequestId_fkey"
FOREIGN KEY ("signingRequestId") REFERENCES "IntegrationSigningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningEvent"
ADD CONSTRAINT "IntegrationSigningEvent_signingRequestParticipantId_fkey"
FOREIGN KEY ("signingRequestParticipantId") REFERENCES "IntegrationSigningRequestParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningEvent"
ADD CONSTRAINT "IntegrationSigningEvent_signingSessionId_fkey"
FOREIGN KEY ("signingSessionId") REFERENCES "IntegrationSigningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningEvent"
ADD CONSTRAINT "IntegrationSigningEvent_nativeRecipientId_fkey"
FOREIGN KEY ("nativeRecipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningArtifact"
ADD CONSTRAINT "IntegrationSigningArtifact_signingRequestId_fkey"
FOREIGN KEY ("signingRequestId") REFERENCES "IntegrationSigningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningArtifact"
ADD CONSTRAINT "IntegrationSigningArtifact_documentDataId_fkey"
FOREIGN KEY ("documentDataId") REFERENCES "DocumentData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationCallbackDelivery"
ADD CONSTRAINT "IntegrationCallbackDelivery_signingRequestId_fkey"
FOREIGN KEY ("signingRequestId") REFERENCES "IntegrationSigningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationCallbackDelivery"
ADD CONSTRAINT "IntegrationCallbackDelivery_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "IntegrationSigningEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
