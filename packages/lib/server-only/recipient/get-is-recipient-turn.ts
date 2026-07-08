import { prisma } from '@documenso/prisma';
import { DocumentSigningOrder, EnvelopeType } from '@prisma/client';

import { isRecipientBlockedBySequentialSigningOrder } from './sequential-signing-order';

export type GetIsRecipientTurnOptions = {
  token: string;
};

export async function getIsRecipientsTurnToSign({ token }: GetIsRecipientTurnOptions) {
  const envelope = await prisma.envelope.findFirstOrThrow({
    where: {
      type: EnvelopeType.DOCUMENT,
      recipients: {
        some: {
          token,
        },
      },
    },
    include: {
      documentMeta: true,
      recipients: {
        orderBy: {
          signingOrder: 'asc',
        },
      },
    },
  });

  if (envelope.documentMeta?.signingOrder !== DocumentSigningOrder.SEQUENTIAL) {
    return true;
  }

  const currentRecipient = envelope.recipients.find((recipient) => recipient.token === token);

  if (!currentRecipient) {
    return false;
  }

  return !isRecipientBlockedBySequentialSigningOrder({
    recipients: envelope.recipients,
    recipientId: currentRecipient.id,
  });
}
