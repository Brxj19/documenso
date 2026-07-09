import type { DmsUser } from './_types';
import { DMS_USERS } from './_users';

export type AuthDecision = {
  allowed: boolean;
  reason?: string;
};

export function canAccessDmsDashboard(user: DmsUser): AuthDecision {
  return { allowed: user.source === 'DMS_USER_DIRECTORY', reason: 'External recipients cannot access DMS dashboard' };
}

export function canAccessDossier(user: DmsUser, _dossierId: string): AuthDecision {
  return { allowed: user.source === 'DMS_USER_DIRECTORY', reason: 'External recipients cannot access dossiers' };
}

export function canAccessFileWorkspace(user: DmsUser, _fileId: string): AuthDecision {
  return { allowed: user.source === 'DMS_USER_DIRECTORY', reason: 'External recipients cannot access file workspace' };
}

export function canInitiateSigning(user: DmsUser): AuthDecision {
  return { allowed: user.source === 'DMS_USER_DIRECTORY', reason: 'Only DMS users can initiate signing' };
}

export function canSign(user: DmsUser, participantId: string): AuthDecision {
  if (user.source === 'DMS_USER_DIRECTORY') {
    return { allowed: true };
  }

  return {
    allowed: user.userId === participantId.replace('dms-', ''),
    reason:
      user.userId !== participantId.replace('dms-', '')
        ? 'External signer cannot act for another participant'
        : undefined,
  };
}

export function canAccessAdminSettings(_user: DmsUser): AuthDecision {
  return { allowed: false, reason: 'Admin settings are read-only in prototype' };
}

export function getUserByIdentity(userId: string): DmsUser | undefined {
  return DMS_USERS.find((u) => u.userId === userId);
}

export function getCurrentDmsUser(): DmsUser {
  return DMS_USERS[0];
}
