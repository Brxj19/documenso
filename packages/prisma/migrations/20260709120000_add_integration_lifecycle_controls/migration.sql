-- Phase 6 lifecycle controls: add lifecycle event types

ALTER TYPE "IntegrationSigningEventType" ADD VALUE IF NOT EXISTS 'REQUEST_CANCELLED';
ALTER TYPE "IntegrationSigningEventType" ADD VALUE IF NOT EXISTS 'REQUEST_EXPIRED';
ALTER TYPE "IntegrationSigningEventType" ADD VALUE IF NOT EXISTS 'REMINDER_SENT';
ALTER TYPE "IntegrationSigningEventType" ADD VALUE IF NOT EXISTS 'REMINDER_ATTEMPTED';
