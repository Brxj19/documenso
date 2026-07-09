import type { SigningParticipant } from './_types';
import { DMS_USERS } from './_users';

export type IdentitySource = 'DMS_USER_DIRECTORY' | 'EXTERNAL_RECIPIENT';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED';
export type VerificationMethod = 'EMAIL_OTP' | 'PASSCODE' | 'MAGIC_LINK' | 'NONE';

export type ParticipantIdentity = {
  participantId: string;
  identitySource: IdentitySource;
  dmsUserId?: string;
  externalSignerId?: string;
  verificationMethod: VerificationMethod;
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  email?: string;
  name?: string;
};

const identityStore = new Map<string, ParticipantIdentity>();

export function createParticipantIdentity(userId: string): ParticipantIdentity {
  const user = DMS_USERS.find((u) => u.userId === userId);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const identity: ParticipantIdentity = {
    participantId: `dms-${user.userId}`,
    identitySource: user.source as IdentitySource,
    dmsUserId: user.source === 'DMS_USER_DIRECTORY' ? user.userId : undefined,
    externalSignerId: user.source === 'EXTERNAL_RECIPIENT' ? user.userId : undefined,
    verificationMethod: user.source === 'EXTERNAL_RECIPIENT' ? (user.verificationMethod as VerificationMethod) : 'NONE',
    verificationStatus: user.source === 'EXTERNAL_RECIPIENT' ? 'PENDING' : 'VERIFIED',
    email: user.email,
    name: user.name,
  };

  identityStore.set(identity.participantId, identity);
  return identity;
}

export function getParticipantIdentity(participantId: string): ParticipantIdentity | undefined {
  return identityStore.get(participantId);
}

export function verifyExternalParticipant(participantId: string, verifiedBy?: string): ParticipantIdentity | undefined {
  const identity = identityStore.get(participantId);
  if (!identity || identity.identitySource !== 'EXTERNAL_RECIPIENT') {
    return undefined;
  }

  identity.verificationStatus = 'VERIFIED';
  identity.verifiedAt = new Date().toISOString();
  identity.verifiedBy = verifiedBy;
  identityStore.set(participantId, identity);
  return identity;
}

export function failExternalParticipant(participantId: string): ParticipantIdentity | undefined {
  const identity = identityStore.get(participantId);
  if (!identity || identity.identitySource !== 'EXTERNAL_RECIPIENT') {
    return undefined;
  }

  identity.verificationStatus = 'FAILED';
  identityStore.set(participantId, identity);
  return identity;
}

export function expireExternalParticipant(participantId: string): ParticipantIdentity | undefined {
  const identity = identityStore.get(participantId);
  if (!identity || identity.identitySource !== 'EXTERNAL_RECIPIENT') {
    return undefined;
  }

  identity.verificationStatus = 'EXPIRED';
  identityStore.set(participantId, identity);
  return identity;
}

export function resetExternalParticipantVerification(participantId: string): ParticipantIdentity | undefined {
  const identity = identityStore.get(participantId);
  if (!identity || identity.identitySource !== 'EXTERNAL_RECIPIENT') {
    return undefined;
  }

  identity.verificationStatus = 'PENDING';
  identity.verifiedAt = undefined;
  identity.verifiedBy = undefined;
  identityStore.set(participantId, identity);
  return identity;
}

export function buildSigningParticipantFromDmsUser(userId: string): SigningParticipant {
  const user = DMS_USERS.find((u) => u.userId === userId);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const _identity = identityStore.get(`dms-${user.userId}`) ?? createParticipantIdentity(userId);

  return {
    participantId: `dms-${user.userId}`,
    name: user.name,
    email: user.email,
    role: 'SIGNER',
    stageOrder: 0,
    metadata: {
      identitySource: user.source as IdentitySource,
      dmsUserId: user.source === 'DMS_USER_DIRECTORY' ? user.userId : undefined,
      externalSignerId: user.source === 'EXTERNAL_RECIPIENT' ? user.userId : undefined,
      verificationMethod: user.source === 'EXTERNAL_RECIPIENT' ? user.verificationMethod : undefined,
      verificationStatus: _identity.verificationStatus,
      verifiedAt: _identity.verifiedAt,
      verifiedBy: _identity.verifiedBy,
    },
  };
}

export const IDENTITY_OTP = '123456';
