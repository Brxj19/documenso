import { isIntegrationRequestTerminal } from '@documenso/api/v1/integration/terminal-state';
import { prefixedId } from '@documenso/lib/universal/id';
import { prisma } from '@documenso/prisma';
import {
  IntegrationSigningEventSource,
  IntegrationSigningEventType,
  IntegrationSigningRequestStatus,
} from '@prisma/client';
import { recordIntegrationSigningEvent } from './evidence';

export const processIntegrationExpiry = async ({ dryRun = false }: { dryRun?: boolean } = {}) => {
  const now = new Date();

  const requests = await prisma.integrationSigningRequest.findMany({
    where: {
      expiresAt: {
        lte: now,
      },
      NOT: {
        status: {
          in: [
            IntegrationSigningRequestStatus.COMPLETED,
            IntegrationSigningRequestStatus.REJECTED,
            IntegrationSigningRequestStatus.CANCELLED,
            IntegrationSigningRequestStatus.EXPIRED,
            IntegrationSigningRequestStatus.FAILED,
          ],
        },
      },
    },
  });

  const report = {
    scanned: requests.length,
    expired: 0,
    alreadyTerminal: 0,
    callbacksQueued: 0,
    errors: 0,
    dryRun,
  };

  for (const request of requests) {
    if (isIntegrationRequestTerminal(request.status)) {
      report.alreadyTerminal++;
      continue;
    }

    if (dryRun) {
      report.expired++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const enqueueDeliveries: string[] = [];

        await recordIntegrationSigningEvent({
          tx,
          request: {
            id: request.id,
            callbackUrl: request.callbackUrl,
            callbackCorrelationId: request.callbackCorrelationId,
            clientCorrelationId: request.clientCorrelationId,
            correlationId: request.correlationId ?? prefixedId('integration_correlation'),
          },
          eventType: IntegrationSigningEventType.REQUEST_EXPIRED,
          source: IntegrationSigningEventSource.SYSTEM,
          deduplicationKey: `request-expired:${request.id}`,
          eventTimestamp: now,
          statusAfter: IntegrationSigningRequestStatus.EXPIRED,
          nativeEnvelopeId: request.envelopeId,
          actorReference: 'system',
          enqueueDeliveries,
        });

        await tx.integrationSigningRequest.update({
          where: { id: request.id },
          data: {
            status: IntegrationSigningRequestStatus.EXPIRED,
            lastReconciledAt: now,
          },
        });

        report.callbacksQueued += enqueueDeliveries.length;
      });

      report.expired++;
    } catch (error) {
      console.error(`Failed to expire request ${request.id}:`, error);
      report.errors++;
    }
  }

  return report;
};
