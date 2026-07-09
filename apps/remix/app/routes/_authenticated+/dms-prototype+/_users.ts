import type { DmsUser } from './_types';

export const DMS_USERS: DmsUser[] = [
  {
    userId: 'user-reg-author-001',
    name: 'Regulatory Author',
    email: 'regulatory.author@example.test',
    role: 'SIGNER',
    source: 'DMS_USER_DIRECTORY',
  },
  {
    userId: 'user-medical-001',
    name: 'Medical Reviewer',
    email: 'medical@example.test',
    role: 'SIGNER',
    source: 'DMS_USER_DIRECTORY',
  },
  {
    userId: 'user-quality-001',
    name: 'Quality Reviewer',
    email: 'quality@example.test',
    role: 'SIGNER',
    source: 'DMS_USER_DIRECTORY',
  },
  {
    userId: 'user-reg-lead-001',
    name: 'Regional Regulatory Lead',
    email: 'regional.regulatory.lead@example.test',
    role: 'SIGNER',
    source: 'DMS_USER_DIRECTORY',
  },
  {
    userId: 'user-ext-consult-001',
    name: 'External Consultant',
    email: 'external.consultant@example.test',
    role: 'SIGNER',
    source: 'EXTERNAL_RECIPIENT',
    verificationMethod: 'EMAIL_OTP',
  },
];

export function getDmsUserById(userId: string): DmsUser | undefined {
  return DMS_USERS.find((u) => u.userId === userId);
}

export function getDmsUserByEmail(email: string): DmsUser | undefined {
  return DMS_USERS.find((u) => u.email === email);
}

export function getInternalUsers(): DmsUser[] {
  return DMS_USERS.filter((u) => u.source === 'DMS_USER_DIRECTORY');
}

export function getExternalUsers(): DmsUser[] {
  return DMS_USERS.filter((u) => u.source === 'EXTERNAL_RECIPIENT');
}

export function isDmsUser(userId: string): boolean {
  return DMS_USERS.some((u) => u.userId === userId && u.source === 'DMS_USER_DIRECTORY');
}

export function isExternalRecipient(userId: string): boolean {
  return DMS_USERS.some((u) => u.userId === userId && u.source === 'EXTERNAL_RECIPIENT');
}
