import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@documenso/ui/primitives/tabs';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  FileSignatureIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import { buildDmsAuditTimeline, sanitizeAuditEntries } from './_audit-timeline';
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
    },
    canFreeze: canFreezeFile(file),
    canSign: canStartSigning(file),
  };
}

type ActionStatus = {
  type: 'success' | 'error' | 'info';
  message: string;
};

export default function FileWorkspace({ loaderData }: Route.ComponentProps) {
  const { file, workflow, canFreeze, canSign } = loaderData;
  const revalidator = useRevalidator();
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [signingRequestId, setSigningRequestId] = useState<string | undefined>(workflow.signingRequestId);
  const [signingStatus, setSigningStatus] = useState<string | undefined>(workflow.signingRequestStatus);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [launchUrl, setLaunchUrl] = useState<string | undefined>();
  const [evidenceEvents, setEvidenceEvents] = useState<
    Array<{ id: string; type: string; timestamp: string; actorName?: string }>
  >([]);
  const [hasFinalArtifact, setHasFinalArtifact] = useState(false);
  const [artifactUrl, setArtifactUrl] = useState<string | undefined>();

  const handleFreeze = async () => {
    setActionStatus(null);
    const result = freezeApprovedFileForSigning(file);
    freezeWorkflowDocument(file.id, result.sha256);
    setActionStatus({ type: 'success', message: `File frozen. SHA-256: ${result.sha256.substring(0, 16)}...` });
    await revalidator.revalidate();
  };

  const handleCreateSigningRequest = async () => {
    setActionStatus(null);
    const apiToken = typeof process !== 'undefined' && process.env.INTEGRATION_API_V1_TOKEN;
    if (!apiToken) {
      setActionStatus({ type: 'error', message: 'INTEGRATION_API_V1_TOKEN not set' });
      return;
    }

    try {
      const client = new DmsSigningClient(apiToken);

      const sourceEnvelopeId = process.env.MJN_SOURCE_REFERENCE ?? '';

      const payload = {
        sourceReference: sourceEnvelopeId,
        title: `Regulatory Submission — ${file.name} ${file.version}`,
        stages: workflow.stages.map((s) => ({
          order: s.order,
          label: s.label,
          participantIds: s.participantIds,
          completionPolicy: s.completionPolicy,
        })),
        participants: workflow.participants.map((p) => ({
          participantId: p.participantId,
          name: p.name,
          email: p.email,
          role: p.role,
          stageOrder: p.stageOrder,
          metadata: p.metadata,
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
      setActionStatus({ type: 'success', message: `Signing request created: ${result.requestId}` });
      revalidator.revalidate();
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    }
  };

  const handleSendSigningRequest = async () => {
    setActionStatus(null);
    if (!signingRequestId) {
      return;
    }

    const apiToken = typeof process !== 'undefined' && process.env.INTEGRATION_API_V1_TOKEN;
    if (!apiToken) {
      setActionStatus({ type: 'error', message: 'INTEGRATION_API_V1_TOKEN not set' });
      return;
    }

    try {
      const client = new DmsSigningClient(apiToken);
      await client.sendSigningRequest(signingRequestId);
      updateSigningRequestStatus(file.id, 'IN_PROGRESS');
      setSigningStatus('IN_PROGRESS');
      updateWorkflowStatus(file.id, 'SIGNING_IN_PROGRESS');
      setActionStatus({ type: 'success', message: 'Signing request sent' });
      revalidator.revalidate();
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    }
  };

  const handleLaunchSigning = async () => {
    setActionStatus(null);
    if (!signingRequestId) {
      return;
    }

    const apiToken = typeof process !== 'undefined' && process.env.INTEGRATION_API_V1_TOKEN;
    if (!apiToken) {
      return;
    }

    try {
      const client = new DmsSigningClient(apiToken);
      const firstParticipant = workflow.participants[0];
      if (!firstParticipant) {
        setActionStatus({ type: 'error', message: 'No participants found' });
        return;
      }
      const session = await client.createSigningSession(signingRequestId, firstParticipant.participantId);
      setLaunchUrl(session.launchUrl);
      setActionStatus({ type: 'success', message: `Session created for ${firstParticipant.name}` });
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    }
  };

  const handleRefreshStatus = async () => {
    setActionStatus(null);
    if (!signingRequestId) {
      return;
    }

    const apiToken = typeof process !== 'undefined' && process.env.INTEGRATION_API_V1_TOKEN;
    if (!apiToken) {
      return;
    }

    try {
      const client = new DmsSigningClient(apiToken);
      const sr = await client.getSigningRequest(signingRequestId);
      const newStatus = sr.status as string;
      setSigningStatus(newStatus);
      updateSigningRequestStatus(file.id, newStatus);
      const dmsStatus = mapIntegrationStatusToDms(newStatus);
      updateWorkflowStatus(file.id, dmsStatus);

      const evidence = await client.getEvidence(signingRequestId);
      setEvidenceEvents(evidence.events);

      if (evidence.finalArtifact) {
        setHasFinalArtifact(true);
        setArtifactUrl(client.getArtifactDownloadUrl(signingRequestId, evidence.finalArtifact.id));
      }

      const dmsAudit: AuditEntry[] = [];
      const signingAudit = buildDmsAuditTimeline(
        dmsAudit,
        evidence.events.map((e) => ({
          id: e.id,
          type: e.type,
          timestamp: e.timestamp,
          actorName: e.actorName,
          actorEmail: e.actorEmail,
          data: e.data,
        })),
      );
      setAuditEntries(sanitizeAuditEntries(signingAudit));

      setActionStatus({ type: 'info', message: `Status: ${newStatus}` });
      revalidator.revalidate();
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
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
    <div>
      <Link to="/dms-prototype/dossiers" className="mb-4 flex items-center gap-1 text-muted-foreground text-sm">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Dossiers
      </Link>

      <div className="mb-4 flex items-start justify-between">
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
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
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

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="esignature">eSignature</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">File Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
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
            </CardContent>
          </Card>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled title="Prototype placeholder">
              <EyeIcon className="mr-1 h-4 w-4" />
              View
            </Button>
            <Button variant="outline" size="sm" disabled title="Prototype placeholder — not integrated">
              <FileIcon className="mr-1 h-4 w-4" />
              Edit in Word
            </Button>
            <Button variant="outline" size="sm" disabled title="Prototype placeholder — not integrated">
              <FileIcon className="mr-1 h-4 w-4" />
              Edit in Excel
            </Button>
            <Button variant="outline" size="sm" disabled title="Prototype placeholder">
              <EyeIcon className="mr-1 h-4 w-4" />
              Preview PDF
            </Button>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">Document Lifecycle</CardTitle>
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
                  className={
                    file.status === 'SIGNING_IN_PROGRESS' ? 'font-medium text-blue-600' : 'text-muted-foreground'
                  }
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
        </TabsContent>

        <TabsContent value="esignature" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">eSignature Integration</CardTitle>
              <CardDescription>Use the public Integration API V1 for signing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {workflow.sha256 && (
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="font-medium text-xs">Frozen PDF</div>
                  <div className="text-muted-foreground text-xs">SHA-256: {workflow.sha256}</div>
                  {workflow.frozenAt && (
                    <div className="text-muted-foreground text-xs">
                      Frozen at: {new Date(workflow.frozenAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {!canFreeze && file.status !== 'APPROVED' && (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-muted-foreground text-sm">
                    Only approved files can be frozen for eSignature. Current status: {file.status.replace(/_/g, ' ')}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleFreeze} disabled={!canFreeze}>
                  <FileSignatureIcon className="mr-1 h-4 w-4" />
                  Freeze to PDF
                </Button>
                <Button size="sm" variant="secondary" onClick={handleCreateSigningRequest} disabled={!canSign}>
                  Create Signing Request
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleSendSigningRequest}
                  disabled={!signingRequestId || signingStatus !== 'READY'}
                >
                  Send Request
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleLaunchSigning}
                  disabled={!signingRequestId || signingStatus === 'READY'}
                >
                  Launch Signing
                </Button>
                <Button size="sm" variant="outline" onClick={handleRefreshStatus} disabled={!signingRequestId}>
                  <RefreshCwIcon className="mr-1 h-4 w-4" />
                  Refresh Status
                </Button>
              </div>

              {signingRequestId && (
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <CheckCircleIcon className="h-4 w-4 text-green-600" />
                    Signing Request
                  </div>
                  <div className="text-muted-foreground text-xs">ID: {signingRequestId}</div>
                  <div className="text-muted-foreground text-xs">Status: {signingStatus ?? 'unknown'}</div>
                </div>
              )}

              {launchUrl && (
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="font-medium text-xs">Signing Session Launched</div>
                  <div className="truncate text-muted-foreground text-xs">{launchUrl}</div>
                </div>
              )}

              {hasFinalArtifact && artifactUrl && (
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <CheckCircleIcon className="h-4 w-4 text-green-600" />
                    Final Artifact Available
                  </div>
                  <a
                    href={artifactUrl}
                    download
                    className="mt-1 inline-flex items-center gap-1 text-blue-600 text-xs hover:underline"
                  >
                    <DownloadIcon className="h-3 w-3" />
                    Download Signed PDF
                  </a>
                </div>
              )}

              {evidenceEvents.length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium text-sm">Signing Events</h4>
                  <div className="space-y-1">
                    {evidenceEvents.map((evt) => (
                      <div key={evt.id} className="flex items-center gap-2 border-border border-b py-1 text-xs">
                        <ClockIcon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">{new Date(evt.timestamp).toLocaleString()}</span>
                        <span>{evt.type}</span>
                        {evt.actorName && <span className="text-muted-foreground">— {evt.actorName}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-2 font-medium text-sm">Participants & Signing Route</h4>
                {workflow.stages.map((stage) => {
                  const stageParticipants = stage.participantIds
                    .map((pid) => {
                      const p = workflow.participants.find((wp) => wp.participantId === pid);
                      const ident = getParticipantIdentity(pid);
                      return { participant: p, identity: ident };
                    })
                    .filter(
                      (item): item is { participant: SigningParticipant; identity: ParticipantIdentity | undefined } =>
                        Boolean(item.participant),
                    );

                  return (
                    <div key={stage.order} className="mb-3 rounded-md border border-border p-3">
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <ShieldCheckIcon className="h-4 w-4" />
                        Stage {stage.order}: {stage.label}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {stage.completionPolicy === 'ALL_REQUIRED' ? 'All required' : 'Any'}
                      </div>

                      <div className="mt-2 space-y-2">
                        {stageParticipants.map(({ participant, identity }) => {
                          const isExternal = participant.metadata.identitySource === 'EXTERNAL_RECIPIENT';
                          const verStatus = identity?.verificationStatus ?? participant.metadata.verificationStatus;
                          const blockedReason = getParticipantBlockedReason(signingStatus, undefined);

                          const handleParticipantLaunch = async () => {
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
                                  {verStatus === 'VERIFIED' && (
                                    <Badge variant="default" size="small">
                                      Verified
                                    </Badge>
                                  )}
                                  {verStatus === 'PENDING' && (
                                    <Badge variant="neutral" size="small">
                                      Pending
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
                                  {!verStatus && (
                                    <Badge variant="secondary" size="small">
                                      N/A
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
                                {!blockedReason &&
                                  signingRequestId &&
                                  signingStatus !== 'READY' &&
                                  (isExternal && (!verStatus || verStatus !== 'VERIFIED') ? (
                                    <Button size="sm" variant="secondary" onClick={handleVerifyExternal}>
                                      Verify External Signer
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={handleParticipantLaunch}
                                      disabled={!signingRequestId}
                                    >
                                      Launch Signing
                                    </Button>
                                  ))}
                              </div>

                              {blockedReason && (
                                <div className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                                  <ClockIcon className="h-3 w-3" />
                                  {blockedReason}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Audit Timeline</CardTitle>
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
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
