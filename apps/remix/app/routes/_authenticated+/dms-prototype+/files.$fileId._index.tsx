import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  FileSignatureIcon,
  FileTextIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UsersIcon,
  XCircleIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import { buildDmsAuditTimeline } from './_audit-timeline';
import { getParticipantBlockedReason } from './_auth-policy';
import { getFileById } from './_data.server';
import type { ParticipantIdentity } from './_identity';
import { getParticipantIdentity } from './_identity';
import { freezeApprovedFileForSigning } from './_pdf-freeze.server';
import { DmsSigningClient } from './_signing-client.server';
import type { AuditEntry, SigningParticipant } from './_types';
import {
  canFreezeFile,
  canStartSigning,
  createWorkflowForFile,
  freezeWorkflowDocument,
  getWorkflowForFile,
  mapIntegrationStatusToDms,
  updateEvidenceState,
  updateParticipantStatus,
  updateSigningRequestId,
  updateSigningRequestStatus,
  updateWorkflowStatus,
} from './_workflow';
import type { Route } from './+types/files.$fileId._index';

export async function loader({ params }: Route.LoaderArgs) {
  const file = getFileById(params.fileId);
  if (!file) {
    throw new Response('Not Found', { status: 404 });
  }

  const workflow = getWorkflowForFile(file.id) ?? createWorkflowForFile(file);

  return {
    file,
    workflow: {
      status: workflow.status,
      signingRequestId: workflow.signingRequestId,
      signingRequestStatus: workflow.signingRequestStatus,
      frozenPdfReference: workflow.frozenPdfReference,
      sha256: workflow.sha256,
      frozenAt: workflow.frozenAt,
      stages: workflow.stages,
      participants: workflow.participants,
      participantStatuses: workflow.participantStatuses ?? {},
      evidenceReference: workflow.evidenceReference,
      artifactReference: workflow.artifactReference,
      finalSha256: workflow.finalSha256,
      finalSignedPdfReference: workflow.finalSignedPdfReference,
      lastSyncedAt: workflow.lastSyncedAt,
    },
    canFreeze: canFreezeFile(file),
    canSign: canStartSigning(file),
  };
}

type ActionStatus = {
  type: 'success' | 'error' | 'info';
  message: string;
};

function makeDmsAuditEntry(type: string, description: string, actor?: string): AuditEntry {
  return {
    id: `dms-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    description,
    actor,
    category: 'DMS',
  };
}

export default function FileWorkspace({ loaderData }: Route.ComponentProps) {
  const { file, workflow, canFreeze, canSign } = loaderData;
  const revalidator = useRevalidator();
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [signingRequestId, setSigningRequestId] = useState<string | undefined>(workflow.signingRequestId);
  const [signingStatus, setSigningStatus] = useState<string | undefined>(workflow.signingRequestStatus);
  const [participantStatuses, setParticipantStatuses] = useState<Record<string, string>>(workflow.participantStatuses);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [launchUrl, _setLaunchUrl] = useState<string | undefined>();
  const [evidenceData, setEvidenceData] = useState<Record<string, unknown> | null>(null);
  const [hasFinalArtifact, setHasFinalArtifact] = useState(false);
  const [artifactUrl, setArtifactUrl] = useState<string | undefined>();
  const [_showArtifactMetadata, setShowArtifactMetadata] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const clientFactory = () => {
    const apiToken = typeof process !== 'undefined' && process.env.INTEGRATION_API_V1_TOKEN;
    return apiToken ? new DmsSigningClient(apiToken) : null;
  };

  const handleFreeze = async () => {
    setActionStatus(null);
    const result = freezeApprovedFileForSigning(file);
    freezeWorkflowDocument(file.id, result.sha256);
    setActionStatus({ type: 'success', message: `File frozen. SHA-256: ${result.sha256.substring(0, 16)}...` });
    setAuditEntries((prev) => [
      ...prev,
      makeDmsAuditEntry(
        'FILE_FROZEN',
        `PDF frozen for eSignature. SHA-256: ${result.sha256.substring(0, 16)}...`,
        file.owner,
      ),
    ]);
    await revalidator.revalidate();
  };

  const handleCreateSigningRequest = async () => {
    setActionStatus(null);
    const client = clientFactory();
    if (!client) {
      setActionStatus({ type: 'error', message: 'INTEGRATION_API_V1_TOKEN not set' });
      return;
    }

    try {
      const _sourceEnvelopeId = process.env.MJN_SOURCE_REFERENCE ?? '';

      const payload = {
        externalReference: `dms-${file.id}-${file.version}`,
        title: `Regulatory Submission — ${file.name} ${file.version}`,
        document: {
          sourceReference: file.id,
          filename: `${file.name.replace(/\s+/g, '_')}.pdf`,
          mimeType: 'application/pdf',
          contentHash: {
            algorithm: 'sha256',
            value: workflow.sha256 ?? '658baa2b54b318d0617fbba42a1ba7185b45e3b066538466a40f5502f6019f52',
          },
        },
        stages: workflow.stages.map((s) => ({
          order: s.order,
          participantIds: s.participantIds,
          completionPolicy: s.completionPolicy,
        })),
        participants: workflow.participants.map((p) => ({
          participantId: p.participantId,
          displayName: p.name,
          email: p.email,
          role: p.role,
          metadata: {
            ...p.metadata,
            stageOrder: p.stageOrder,
          },
        })),
        metadata: {
          sourceSystem: 'Authora-DMS',
          dossierId: file.dossierId,
          fileId: file.id,
          fileVersionId: file.version,
          documentType: 'REGULATORY_SUBMISSION',
        },
        idempotencyKey: `dms-${file.id}-${file.version}-${Date.now()}`,
      };

      const result = await client.createSigningRequest(payload);
      updateSigningRequestId(file.id, result.requestId);
      setSigningRequestId(result.requestId);
      setSigningStatus('READY');
      updateEvidenceState(file.id, { evidenceReference: result.requestId });
      setActionStatus({
        type: 'success',
        message: `Signing request created: ${result.requestId}${result.idempotentReplay ? ' (idempotent replay)' : ''}`,
      });
      setAuditEntries((prev) => [
        ...prev,
        makeDmsAuditEntry('SIGNING_REQUEST_CREATED', `Signing request ${result.requestId} created`, file.owner),
      ]);
      await revalidator.revalidate();
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    }
  };

  const handleSendSigningRequest = async () => {
    setActionStatus(null);
    if (!signingRequestId) {
      return;
    }

    const client = clientFactory();
    if (!client) {
      setActionStatus({ type: 'error', message: 'INTEGRATION_API_V1_TOKEN not set' });
      return;
    }

    try {
      await client.sendSigningRequest(signingRequestId);
      updateSigningRequestStatus(file.id, 'IN_PROGRESS');
      setSigningStatus('IN_PROGRESS');
      updateWorkflowStatus(file.id, 'SIGNING_IN_PROGRESS');
      setActionStatus({ type: 'success', message: 'Signing request sent' });
      setAuditEntries((prev) => [
        ...prev,
        makeDmsAuditEntry(
          'SIGNING_REQUEST_SENT',
          `Signing request ${signingRequestId} sent to participants`,
          file.owner,
        ),
      ]);
      await revalidator.revalidate();
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    }
  };

  const handleRefreshStatus = async () => {
    setActionStatus(null);
    if (!signingRequestId) {
      return;
    }

    const client = clientFactory();
    if (!client) {
      return;
    }

    setIsRefreshing(true);

    try {
      const sr = await client.getSigningRequest(signingRequestId);
      const newStatus = sr.status as string;
      setSigningStatus(newStatus);
      updateSigningRequestStatus(file.id, newStatus);
      const dmsStatus = mapIntegrationStatusToDms(newStatus);
      updateWorkflowStatus(file.id, dmsStatus);

      if (Array.isArray(sr.participants)) {
        for (const p of sr.participants as Array<{ participantId: string; status: string }>) {
          updateParticipantStatus(file.id, p.participantId, p.status);
        }
        const statusMap: Record<string, string> = {};
        for (const p of sr.participants as Array<{ participantId: string; status: string }>) {
          statusMap[p.participantId] = p.status;
        }
        setParticipantStatuses(statusMap);
      }

      const evidenceDataRaw = await client.getEvidence(signingRequestId);
      const evidenceWithSha = evidenceDataRaw as typeof evidenceDataRaw & {
        finalSha256?: { algorithm: string; value: string };
      };
      setEvidenceData(evidenceWithSha);
      setAuditEntries((prev) => [
        ...prev,
        makeDmsAuditEntry('STATUS_REFRESHED', `Status refreshed: ${newStatus}`, file.owner),
      ]);

      if (evidenceWithSha.finalArtifact) {
        setHasFinalArtifact(true);
        const url = client.getArtifactDownloadUrl(signingRequestId, evidenceWithSha.finalArtifact.id);
        setArtifactUrl(url);
        setShowArtifactMetadata(true);
        updateEvidenceState(file.id, {
          artifactReference: evidenceWithSha.finalArtifact.id,
          lastSyncedAt: new Date().toISOString(),
        });
        if (evidenceWithSha.finalSha256) {
          updateEvidenceState(file.id, { finalSha256: evidenceWithSha.finalSha256.value });
        }
        setAuditEntries((prev) => [
          ...prev,
          makeDmsAuditEntry(
            'ARTIFACT_DOWNLOADED',
            `Signed PDF artifact available: ${evidenceWithSha.finalArtifact?.filename}`,
            file.owner,
          ),
        ]);
      }

      const dmsAudit: AuditEntry[] = [];
      const signingAudit = buildDmsAuditTimeline(
        dmsAudit,
        (evidenceWithSha.events ?? []).map((e) => ({
          id: e.id,
          type: e.type,
          timestamp: e.timestamp,
          actorName: e.actorName,
          actorEmail: e.actorEmail,
          data: e.data as Record<string, unknown> | undefined,
        })),
      );
      setAuditEntries((prev) => {
        const merged = [...prev, ...signingAudit];
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const seen = new Set<string>();
        return merged.filter((e) => {
          if (seen.has(e.id)) {
            return false;
          }
          seen.add(e.id);
          return true;
        });
      });

      setActionStatus({ type: 'info', message: `Status: ${newStatus}` });
      await revalidator.revalidate();
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDownloadSignedPdf = () => {
    if (artifactUrl) {
      window.open(artifactUrl, '_blank');
    }
  };

  const statusBadgeVariant: 'default' | 'secondary' | 'warning' | 'neutral' | 'destructive' =
    file.status === 'APPROVED'
      ? 'default'
      : file.status === 'SIGNED_COMPLETE'
        ? 'neutral'
        : file.status === 'SIGNING_IN_PROGRESS'
          ? 'warning'
          : file.status === 'DRAFT'
            ? 'secondary'
            : 'neutral';

  return (
    <div className="space-y-6">
      <Link to="/dms-prototype/files" className="mb-4 flex items-center gap-1 text-muted-foreground text-sm">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to File Workspace
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-lg">{file.name}</h2>
          <p className="text-muted-foreground text-sm">
            {file.id} · {file.version}
          </p>
        </div>
        <Badge variant={statusBadgeVariant} size="small">
          {file.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {actionStatus && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            actionStatus.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
              : actionStatus.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
                : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200'
          }`}
        >
          {actionStatus.message}
        </div>
      )}

      {/* File Metadata Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">File Metadata</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">File Name</dt>
              <dd className="font-medium">{file.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Version</dt>
              <dd className="font-medium">{file.version}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="font-medium">{file.fileType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="font-medium">{file.owner}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{file.status.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dossier</dt>
              <dd className="font-medium">{file.dossierId}</dd>
            </div>
          </dl>
          {workflow.frozenAt && (
            <div className="mt-3 rounded-md bg-muted/40 p-2 text-muted-foreground text-xs">
              Frozen: {new Date(workflow.frozenAt).toLocaleString()} · SHA-256: {workflow.sha256?.substring(0, 16)}...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dummy Preview/Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <EyeIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Document Preview</CardTitle>
          </div>
          <CardDescription>Prototype — document viewer placeholder</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled title="Prototype placeholder">
              <EyeIcon className="mr-1 h-4 w-4" />
              View
            </Button>
            <Button variant="outline" size="sm" disabled title="Prototype placeholder">
              <FileTextIcon className="mr-1 h-4 w-4" />
              Edit in Word
            </Button>
            <Button variant="outline" size="sm" disabled title="Prototype placeholder">
              <FileTextIcon className="mr-1 h-4 w-4" />
              Edit in Excel
            </Button>
            <Button variant="outline" size="sm" disabled title="Prototype placeholder">
              <EyeIcon className="mr-1 h-4 w-4" />
              Preview PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Version & Approval Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSignatureIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Version and Approval Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={file.status === 'DRAFT' ? 'font-medium' : 'text-muted-foreground'}>Draft</span>
            <span className="text-muted-foreground">→</span>
            <span
              className={
                file.status === 'UNDER_REVIEW' || file.status === 'REVIEW_COMPLETED'
                  ? 'font-medium text-amber-600'
                  : 'text-muted-foreground'
              }
            >
              Review
            </span>
            <span className="text-muted-foreground">→</span>
            <span className={file.status === 'APPROVED' ? 'font-medium text-green-600' : 'text-muted-foreground'}>
              Approved
            </span>
            <span className="text-muted-foreground">→</span>
            <span
              className={file.status === 'SIGNING_IN_PROGRESS' ? 'font-medium text-blue-600' : 'text-muted-foreground'}
            >
              eSignature
            </span>
            <span className="text-muted-foreground">→</span>
            <span
              className={
                file.status === 'SIGNED_COMPLETE' || file.status === 'SUBMITTED'
                  ? 'font-medium text-green-600'
                  : 'text-muted-foreground'
              }
            >
              Completed
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Freeze PDF Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Freeze PDF for eSignature</CardTitle>
          </div>
          <CardDescription>Freeze the approved document to a PDF with a verifiable SHA-256 hash</CardDescription>
        </CardHeader>
        <CardContent>
          {!canFreeze && file.status !== 'APPROVED' && (
            <div className="mb-3 rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
              Only approved files can be frozen for eSignature. Current status: {file.status.replace(/_/g, ' ')}
            </div>
          )}

          {workflow.sha256 && (
            <div className="mb-3 rounded-md bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-green-600" />
                <span className="font-medium text-sm">PDF Frozen</span>
              </div>
              <div className="mt-1 text-muted-foreground text-xs">Reference: {workflow.frozenPdfReference}</div>
              <div className="text-muted-foreground text-xs">SHA-256: {workflow.sha256}</div>
              {workflow.frozenAt && (
                <div className="text-muted-foreground text-xs">
                  Frozen at: {new Date(workflow.frozenAt).toLocaleString()}
                </div>
              )}
            </div>
          )}

          <Button size="sm" onClick={handleFreeze} disabled={!canFreeze}>
            <FileSignatureIcon className="mr-1 h-4 w-4" />
            Freeze PDF
          </Button>
        </CardContent>
      </Card>

      {/* eSignature Workflow Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">eSignature Workflow</CardTitle>
          </div>
          <CardDescription>Use the public Integration API V1 for signing</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Signing Request Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleCreateSigningRequest} disabled={!canSign}>
              Create Signing Request
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSendSigningRequest}
              disabled={!signingRequestId || signingStatus !== 'READY'}
            >
              Send for Signing
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshStatus}
              disabled={!signingRequestId || isRefreshing}
            >
              <RefreshCwIcon className={`mr-1 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Status
            </Button>
          </div>

          {/* Signing Request Status */}
          {signingRequestId && (
            <div className="mt-3 rounded-md bg-muted/40 p-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <CheckCircleIcon className="h-4 w-4 text-green-600" />
                Signing Request
              </div>
              <div className="text-muted-foreground text-xs">ID: {signingRequestId}</div>
              <div className="text-muted-foreground text-xs">
                Status: <span className="font-medium">{signingStatus ?? 'unknown'}</span>
              </div>
              {workflow.lastSyncedAt && (
                <div className="text-muted-foreground text-xs">
                  Last synced: {new Date(workflow.lastSyncedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {/* Launch URL */}
          {launchUrl && (
            <div className="mt-3 rounded-md bg-muted/40 p-3">
              <div className="font-medium text-xs">Signing Session Launched</div>
              <div className="truncate text-muted-foreground text-xs">{launchUrl}</div>
            </div>
          )}

          {!canSign && file.status !== 'APPROVED' && (
            <div className="mt-3 rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
              Only approved files can initiate signing. Current status: {file.status.replace(/_/g, ' ')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participant Routing Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Signing Route</CardTitle>
          </div>
          <CardDescription>
            Stage 1: Regulatory Author → Stage 2: Medical & Quality Review → Stage 3: Regional Regulatory Lead
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workflow.stages.map((stage) => {
            const stageParticipants = stage.participantIds
              .map((pid) => {
                const p = workflow.participants.find((wp) => wp.participantId === pid);
                const ident = getParticipantIdentity(pid);
                return { participant: p, identity: ident };
              })
              .filter((item): item is { participant: SigningParticipant; identity: ParticipantIdentity | undefined } =>
                Boolean(item.participant),
              );

            const previousStageComplete =
              stage.order === 1
                ? true
                : stageParticipants.every((sp) => {
                    const _pid = sp.participant.participantId;
                    const prevParticipants = workflow.stages
                      .filter((s) => s.order < stage.order)
                      .flatMap((s) => s.participantIds);
                    return prevParticipants.every((ppid) => {
                      const ps = participantStatuses[ppid];
                      return ps === 'COMPLETED' || ps === undefined;
                    });
                  });

            return (
              <div key={stage.order} className="mb-3 rounded-md border border-border p-3">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <ShieldCheckIcon className="h-4 w-4" />
                  Stage {stage.order}: {stage.label}
                </div>
                <div className="text-muted-foreground text-xs">
                  {stage.completionPolicy === 'ALL_REQUIRED' ? 'All required' : 'Any'}
                  {!previousStageComplete && stage.order > 1 && (
                    <span className="ml-2 text-amber-600">· Waiting for previous stage</span>
                  )}
                </div>

                <div className="mt-2 space-y-2">
                  {stageParticipants.map(({ participant, identity }) => {
                    const isExternal = participant.metadata.identitySource === 'EXTERNAL_RECIPIENT';
                    const verStatus = identity?.verificationStatus ?? participant.metadata.verificationStatus;
                    const participantStatus = participantStatuses[participant.participantId];
                    const isCompleted = participantStatus === 'COMPLETED';
                    const _isAvailable = participantStatus === 'AVAILABLE' || participantStatus === 'VIEWED';
                    const isActionable =
                      participantStatus === 'AVAILABLE' || participantStatus === 'VIEWED' || !participantStatus;
                    const blockedReason = getParticipantBlockedReason(signingStatus, participantStatus);
                    const isBlocked = !previousStageComplete && stage.order > 1;

                    const handleParticipantLaunch = () => {
                      const wrapperUrl = `/dms-prototype/signing/${signingRequestId}/participants/${participant.participantId}`;
                      window.open(wrapperUrl, '_blank');
                    };

                    const handleVerifyExternal = () => {
                      window.open(`/dms-prototype/external-sign/${participant.participantId}/verify`, '_blank');
                    };

                    return (
                      <div key={participant.participantId} className="rounded-md bg-muted/30 p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs">{participant.name}</span>
                            {isExternal ? (
                              <Badge variant="neutral" size="small">
                                External
                              </Badge>
                            ) : (
                              <Badge variant="default" size="small">
                                DMS User
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {isCompleted ? (
                              <Badge variant="default" size="small">
                                <CheckCircleIcon className="mr-0.5 h-3 w-3" />
                                Completed
                              </Badge>
                            ) : participantStatus === 'REJECTED' ? (
                              <Badge variant="destructive" size="small">
                                <XCircleIcon className="mr-0.5 h-3 w-3" />
                                Rejected
                              </Badge>
                            ) : participantStatus === 'EXPIRED' ? (
                              <Badge variant="destructive" size="small">
                                Expired
                              </Badge>
                            ) : participantStatus === 'AVAILABLE' || participantStatus === 'VIEWED' ? (
                              <Badge variant="warning" size="small">
                                Pending
                              </Badge>
                            ) : isBlocked || blockedReason ? (
                              <Badge variant="neutral" size="small">
                                Blocked
                              </Badge>
                            ) : participantStatus ? (
                              <Badge variant="secondary" size="small">
                                {participantStatus}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" size="small">
                                N/A
                              </Badge>
                            )}

                            {verStatus === 'PENDING' && (
                              <Badge variant="neutral" size="small">
                                Pending Verification
                              </Badge>
                            )}
                            {verStatus === 'VERIFIED' && isExternal && (
                              <Badge variant="default" size="small">
                                Verified
                              </Badge>
                            )}
                            {verStatus === 'FAILED' && (
                              <Badge variant="destructive" size="small">
                                Failed
                              </Badge>
                            )}
                            {verStatus === 'EXPIRED' && (
                              <Badge variant="destructive" size="small">
                                Expired
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="mt-1 text-muted-foreground text-xs">
                          {participant.email}
                          {identity?.identitySource && (
                            <span>
                              {' '}
                              ·{' '}
                              {identity.identitySource === 'DMS_USER_DIRECTORY'
                                ? 'DMS User Directory'
                                : 'External Recipient'}
                            </span>
                          )}
                          {identity?.verificationMethod && identity.verificationMethod !== 'NONE' && (
                            <span> · {identity.verificationMethod}</span>
                          )}
                        </div>

                        <div className="mt-2 flex gap-2">
                          {isCompleted ? (
                            <span className="flex items-center gap-1 text-muted-foreground text-xs">
                              <CheckCircleIcon className="h-3 w-3 text-green-600" />
                              Completed
                            </span>
                          ) : isBlocked ? (
                            <span className="flex items-center gap-1 text-muted-foreground text-xs">
                              <ClockIcon className="h-3 w-3" />
                              Blocked — Previous stage incomplete
                            </span>
                          ) : blockedReason ? (
                            <span className="flex items-center gap-1 text-muted-foreground text-xs">
                              <ClockIcon className="h-3 w-3" />
                              {blockedReason}
                            </span>
                          ) : signingRequestId && signingStatus !== 'READY' && isActionable ? (
                            isExternal && (!verStatus || verStatus !== 'VERIFIED') ? (
                              <Button size="sm" variant="secondary" onClick={handleVerifyExternal}>
                                Verify & Launch
                              </Button>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={handleParticipantLaunch}>
                                Launch Signing
                              </Button>
                            )
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Evidence & Artifact Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScrollTextIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Evidence & Artifacts</CardTitle>
          </div>
          <CardDescription>Signing evidence, certificates, and final signed PDF</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRefreshStatus()}
              disabled={!signingRequestId || isRefreshing}
            >
              <EyeIcon className="mr-1 h-4 w-4" />
              View Evidence
            </Button>
            {evidenceData && (
              <Button size="sm" variant="outline" disabled title="Prototype — artifact list from evidence">
                <ScrollTextIcon className="mr-1 h-4 w-4" />
                View Artifacts ({(evidenceData.artifacts as Array<unknown>)?.length ?? 0})
              </Button>
            )}
          </div>

          {hasFinalArtifact && artifactUrl && (
            <div className="mt-3 rounded-md bg-muted/40 p-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <CheckCircleIcon className="h-4 w-4 text-green-600" />
                Final Signed PDF Available
              </div>
              {workflow.finalSha256 && (
                <div className="text-muted-foreground text-xs">SHA-256: {workflow.finalSha256.substring(0, 16)}...</div>
              )}
              <Button size="sm" variant="default" className="mt-2" onClick={handleDownloadSignedPdf}>
                <DownloadIcon className="mr-1 h-4 w-4" />
                Download Signed PDF
              </Button>
            </div>
          )}

          {!signingRequestId && (
            <div className="mt-3 rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
              Create and send a signing request to view evidence and artifacts.
            </div>
          )}

          {(evidenceData?.events as Array<Record<string, unknown>> | undefined) && (
            <div className="mt-3">
              <h4 className="mb-2 font-medium text-sm">Signing Events</h4>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {(evidenceData?.events as Array<Record<string, unknown>> | undefined)?.map((evt) => (
                  <div key={evt.id as string} className="flex items-center gap-2 border-border border-b py-1 text-xs">
                    <ClockIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(evt.timestamp as string).toLocaleString()}
                    </span>
                    <span className="truncate">{evt.type as string}</span>
                    {(evt.actorName as string | undefined) && (
                      <span className="truncate text-muted-foreground">— {evt.actorName as string}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Audit Timeline</CardTitle>
          </div>
          <CardDescription>Combined DMS and signing audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          {auditEntries.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No audit entries yet. Create and send a signing request, then refresh.
            </div>
          )}
          <div className="space-y-2">
            {auditEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 border-border border-b py-2 text-sm">
                <div
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    entry.category === 'SIGNING' ? 'bg-blue-500' : 'bg-gray-400'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    <Badge variant={entry.category === 'SIGNING' ? 'secondary' : 'neutral'} size="small">
                      {entry.category}
                    </Badge>
                  </div>
                  <div className="mt-0.5">{entry.description}</div>
                  {entry.actor && <div className="text-muted-foreground text-xs">{entry.actor}</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
