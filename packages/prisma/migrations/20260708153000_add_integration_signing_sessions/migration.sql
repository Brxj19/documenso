CREATE TYPE "IntegrationSigningSessionMode" AS ENUM (
  'REDIRECT',
  'EMBED'
);

CREATE TABLE "IntegrationSigningSession" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signingRequestId" TEXT NOT NULL,
  "signingRequestParticipantId" TEXT NOT NULL,
  "nativeRecipientId" INTEGER NOT NULL,
  "mode" "IntegrationSigningSessionMode" NOT NULL DEFAULT 'REDIRECT',
  "returnUrl" TEXT,
  "clientState" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "launchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "IntegrationSigningSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationSigningSession_signingRequestId_idx"
ON "IntegrationSigningSession"("signingRequestId");

CREATE INDEX "IntegrationSigningSession_participantId_idx"
ON "IntegrationSigningSession"("signingRequestParticipantId");

CREATE INDEX "IntegrationSigningSession_nativeRecipientId_idx"
ON "IntegrationSigningSession"("nativeRecipientId");

CREATE INDEX "IntegrationSigningSession_expiresAt_idx"
ON "IntegrationSigningSession"("expiresAt");

ALTER TABLE "IntegrationSigningSession"
ADD CONSTRAINT "IntegrationSigningSession_signingRequestId_fkey"
FOREIGN KEY ("signingRequestId") REFERENCES "IntegrationSigningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningSession"
ADD CONSTRAINT "IntegrationSigningSession_signingRequestParticipantId_fkey"
FOREIGN KEY ("signingRequestParticipantId") REFERENCES "IntegrationSigningRequestParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSigningSession"
ADD CONSTRAINT "IntegrationSigningSession_nativeRecipientId_fkey"
FOREIGN KEY ("nativeRecipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
