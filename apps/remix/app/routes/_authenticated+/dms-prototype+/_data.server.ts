import type { DmsAdminSetting, DmsDossier, DmsFile } from './_types';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const DOSSIERS: DmsDossier[] = [
  {
    id: 'DOS-2026-001',
    name: 'Clinical Study Report — v3',
    productRegion: 'India / Oncology',
    status: 'APPROVED',
    owner: 'Regulatory Author',
    documentCount: 4,
    lastUpdated: daysAgo(0),
    createdAt: daysAgo(45),
  },
  {
    id: 'DOS-2026-002',
    name: 'Safety Update Report',
    productRegion: 'EU / Cardiology',
    status: 'UNDER_REVIEW',
    owner: 'Medical Reviewer',
    documentCount: 2,
    lastUpdated: daysAgo(1),
    createdAt: daysAgo(20),
  },
  {
    id: 'DOS-2026-003',
    name: 'Annual Quality Review',
    productRegion: 'Global / Quality',
    status: 'PENDING_REVIEW',
    owner: 'Quality Reviewer',
    documentCount: 3,
    lastUpdated: daysAgo(3),
    createdAt: daysAgo(60),
  },
  {
    id: 'DOS-2026-004',
    name: 'Regulatory Submission Summary',
    productRegion: 'APAC / Regulatory',
    status: 'SIGNED_COMPLETE',
    owner: 'Regional Regulatory Lead',
    documentCount: 5,
    lastUpdated: daysAgo(7),
    createdAt: daysAgo(90),
  },
  {
    id: 'DOS-2026-005',
    name: 'Post-Market Surveillance Report',
    productRegion: 'North America / Safety',
    status: 'ACTIVE',
    owner: 'Regulatory Author',
    documentCount: 1,
    lastUpdated: daysAgo(14),
    createdAt: daysAgo(10),
  },
];

export const FILES: DmsFile[] = [
  {
    id: 'FILE-REG-001',
    dossierId: 'DOS-2026-001',
    name: 'Clinical Overview',
    version: 'v1.0',
    status: 'APPROVED',
    owner: 'Regulatory Author',
    fileType: 'PDF',
    createdAt: daysAgo(40),
    updatedAt: daysAgo(0),
  },
  {
    id: 'FILE-REG-002',
    dossierId: 'DOS-2026-001',
    name: 'Study Protocol',
    version: 'v2.1',
    status: 'SIGNED_COMPLETE',
    owner: 'Regulatory Author',
    fileType: 'PDF',
    createdAt: daysAgo(35),
    updatedAt: daysAgo(30),
  },
  {
    id: 'FILE-REG-003',
    dossierId: 'DOS-2026-002',
    name: 'Safety Analysis',
    version: 'v1.0',
    status: 'UNDER_REVIEW',
    owner: 'Medical Reviewer',
    fileType: 'DOCX',
    createdAt: daysAgo(15),
    updatedAt: daysAgo(1),
  },
  {
    id: 'FILE-REG-004',
    dossierId: 'DOS-2026-003',
    name: 'Quality Metrics Report',
    version: 'v3.0',
    status: 'DRAFT',
    owner: 'Quality Reviewer',
    fileType: 'XLSX',
    createdAt: daysAgo(50),
    updatedAt: daysAgo(3),
  },
  {
    id: 'FILE-REG-005',
    dossierId: 'DOS-2026-004',
    name: 'Submission Package',
    version: 'v1.0',
    status: 'SIGNED_COMPLETE',
    owner: 'Regional Regulatory Lead',
    fileType: 'PDF',
    createdAt: daysAgo(80),
    updatedAt: daysAgo(7),
  },
];

export const ADMIN_SETTINGS: DmsAdminSetting[] = [
  { id: 'usr-1', category: 'Users & Roles', label: 'Max Users', value: '50', type: 'text' },
  {
    id: 'usr-2',
    category: 'Users & Roles',
    label: 'Default Role',
    value: 'Reviewer',
    type: 'select',
    options: ['Admin', 'Reviewer', 'Viewer'],
  },
  { id: 'doc-1', category: 'Document Types', label: 'Max File Size (MB)', value: '100', type: 'text' },
  { id: 'doc-2', category: 'Document Types', label: 'Allowed Extensions', value: 'PDF, DOCX, XLSX', type: 'text' },
  {
    id: 'wfl-1',
    category: 'Workflow Templates',
    label: 'Default Template',
    value: 'Regulatory Hybrid',
    type: 'select',
    options: ['Regulatory Hybrid', 'Simple Approval', 'Quality Review'],
  },
  { id: 'meta-1', category: 'Metadata Fields', label: 'Dossier ID Prefix', value: 'DOS', type: 'text' },
  { id: 'ret-1', category: 'Retention Rules', label: 'Archive After (days)', value: '365', type: 'text' },
  { id: 'not-1', category: 'Notification Settings', label: 'Email Notifications', value: 'true', type: 'toggle' },
  { id: 'esig-1', category: 'eSignature Settings', label: 'Session TTL (seconds)', value: '3600', type: 'text' },
  {
    id: 'esig-2',
    category: 'eSignature Settings',
    label: 'Verification Method',
    value: 'EMAIL_OTP',
    type: 'select',
    options: ['EMAIL_OTP', 'PASSCODE', 'MAGIC_LINK'],
  },
];

export function getDossierById(id: string): DmsDossier | undefined {
  return DOSSIERS.find((d) => d.id === id);
}

export function getFilesByDossierId(dossierId: string): DmsFile[] {
  return FILES.filter((f) => f.dossierId === dossierId);
}

export function getFileById(id: string): DmsFile | undefined {
  return FILES.find((f) => f.id === id);
}

export function getRecentActivity(): { timestamp: string; description: string; dossierId: string }[] {
  return [
    { timestamp: daysAgo(0), description: 'File Clinical Overview frozen for eSignature', dossierId: 'DOS-2026-001' },
    { timestamp: daysAgo(0), description: 'Signing request created for DOS-2026-001', dossierId: 'DOS-2026-001' },
    { timestamp: daysAgo(1), description: 'Safety Analysis uploaded to DOS-2026-002', dossierId: 'DOS-2026-002' },
    { timestamp: daysAgo(2), description: 'Review completed for Safety Update Report', dossierId: 'DOS-2026-002' },
    { timestamp: daysAgo(3), description: 'Quality Metrics Report updated to v3.0', dossierId: 'DOS-2026-003' },
  ];
}
