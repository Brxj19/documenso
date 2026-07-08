import type { RecipientRole, SigningStatus } from '@prisma/client';

type SequentialRecipient = {
  id: number;
  role: RecipientRole;
  signingOrder: number | null;
  signingStatus: SigningStatus;
};

const compareBySigningOrder = (left: SequentialRecipient, right: SequentialRecipient) => {
  if (left.signingOrder === null && right.signingOrder === null) {
    return left.id - right.id;
  }

  if (left.signingOrder === null) {
    return 1;
  }

  if (right.signingOrder === null) {
    return -1;
  }

  if (left.signingOrder === right.signingOrder) {
    return left.id - right.id;
  }

  return left.signingOrder - right.signingOrder;
};

export const getOrderedSequentialRecipients = <T extends SequentialRecipient>(recipients: T[]) =>
  [...recipients].sort(compareBySigningOrder);

export const getActiveSequentialRecipientGroup = <T extends SequentialRecipient>(recipients: T[]) => {
  const pendingRecipients = getOrderedSequentialRecipients(
    recipients.filter((recipient) => recipient.signingStatus !== 'SIGNED' && recipient.role !== 'CC'),
  );

  const firstPendingRecipient = pendingRecipients[0];

  if (!firstPendingRecipient) {
    return [] as T[];
  }

  if (firstPendingRecipient.signingOrder === null) {
    return [firstPendingRecipient];
  }

  return pendingRecipients.filter((recipient) => recipient.signingOrder === firstPendingRecipient.signingOrder);
};

export const isRecipientBlockedBySequentialSigningOrder = <T extends SequentialRecipient>({
  recipients,
  recipientId,
}: {
  recipients: T[];
  recipientId: number;
}) => {
  const orderedRecipients = getOrderedSequentialRecipients(recipients);
  const currentRecipient = orderedRecipients.find((recipient) => recipient.id === recipientId);

  if (!currentRecipient || currentRecipient.signingOrder === null) {
    return false;
  }

  const currentRecipientSigningOrder = currentRecipient.signingOrder;

  return orderedRecipients.some(
    (recipient) =>
      recipient.id !== currentRecipient.id &&
      recipient.signingOrder !== null &&
      recipient.signingOrder < currentRecipientSigningOrder &&
      recipient.signingStatus !== 'SIGNED',
  );
};
