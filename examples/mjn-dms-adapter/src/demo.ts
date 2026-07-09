import { buildMjnAuditTimeline } from './audit-timeline';
import { IntegrationApiClient } from './client';
import { PdfFreezeService } from './pdf-freeze';
import type { MJNFile } from './types';
import { buildIdempotencyKey, mapMjnWorkflowToSigningRequest, REGULATORY_HYBRID_ROUTE } from './workflow-mapper';

const simulateMjnApprovedFile = (): MJNFile => ({
  dossierId: 'DOS-2026-0042',
  fileId: 'FILE-REG-001',
  fileVersionId: 'VER-003',
  fileName: 'clinical-study-report.pdf',
  fileType: 'application/pdf',
  approvalStatus: 'APPROVED',
  storageReference: 'mjn-storage://dos-2026-0042/ver-003/clinical-study-report.pdf',
  currentVersionNumber: 3,
  approvedAt: new Date(Date.now() - 3600_000).toISOString(),
  approvedBy: 'regulatory-manager@mjn-dms.test',
});

const dumpSection = (title: string): void => {
  console.log('');
  console.log('='.repeat(72));
  console.log(`  ${title}`);
  console.log('='.repeat(72));
};

const main = async (): Promise<void> => {
  // biome-ignore lint/nursery/noUndeclaredEnvVars: demo-only env vars, not part of turbo pipeline
  const apiToken = process.env.MJN_API_TOKEN ?? '';
  // biome-ignore lint/nursery/noUndeclaredEnvVars: demo-only env vars, not part of turbo pipeline
  const baseUrl = process.env.MJN_BASE_URL ?? 'http://localhost:3000';
  // biome-ignore lint/nursery/noUndeclaredEnvVars: demo-only env vars, not part of turbo pipeline
  const sourceReference = process.env.MJN_SOURCE_REFERENCE ?? '';

  if (!apiToken) {
    console.warn(
      '[MJN-DEMO] MJN_API_TOKEN not set. Using placeholder — actual Integration API calls will fail without a valid token.',
    );
  }

  const client = new IntegrationApiClient({ baseUrl, apiToken });
  const pdfFreeze = new PdfFreezeService();

  dumpSection('Phase 8 — MJN-DMS Integration POC');
  console.log('Demonstrating the regulatory hybrid signing route via public Integration API V1.');

  dumpSection('1. Check Capabilities');
  const capabilities = await client.checkCapabilities();
  console.log(`  Integration API enabled: ${capabilities.enabled}`);
  console.log(`  Release phase: ${capabilities.releasePhase}`);

  dumpSection('2. Freeze Approved File to PDF');
  const mjnFile = simulateMjnApprovedFile();
  console.log(`  File: ${mjnFile.fileName}`);
  console.log(`  Dossier: ${mjnFile.dossierId}`);
  console.log(`  Version: ${mjnFile.fileVersionId}`);

  const freezeResult = await pdfFreeze.freezeApprovedFile(mjnFile);
  console.log(`  SHA-256: ${freezeResult.sha256Hex}`);
  console.log(`  Frozen at: ${freezeResult.frozenAt}`);

  dumpSection('3. Build Regulatory Hybrid Route');
  const idempotencyKey = buildIdempotencyKey(REGULATORY_HYBRID_ROUTE);
  console.log(`  Idempotency key: ${idempotencyKey}`);

  REGULATORY_HYBRID_ROUTE.stages.forEach((stage) => {
    const roles = stage.participants.map((p) => p.name).join(', ');
    console.log(`  Stage ${stage.order}: ${roles}`);
  });

  dumpSection('4. Map MJN Workflow to Signing Request');
  const resolvedSourceRef = sourceReference || `envelope_${freezeResult.sourceFileVersionId}`;
  const signingPayload = mapMjnWorkflowToSigningRequest(
    REGULATORY_HYBRID_ROUTE,
    resolvedSourceRef,
    freezeResult.sha256Hex,
    idempotencyKey,
  );
  console.log(`  Title: ${signingPayload.title}`);
  console.log(`  Participants: ${(signingPayload.participants as Array<{ participantId: string }>).length}`);
  console.log(`  Stages: ${(signingPayload.stages as Array<{ order: number }>).length}`);
  console.log(`  Metadata: ${JSON.stringify(signingPayload.metadata)}`);

  dumpSection('5. Create Signing Request via Integration API');
  let createResult: Awaited<ReturnType<typeof client.createSigningRequest>>;
  try {
    createResult = await client.createSigningRequest(signingPayload);
    console.log(`  Request ID: ${createResult.requestId}`);
    console.log(`  Status: ${createResult.status}`);
    console.log(`  Idempotent replay: ${createResult.idempotentReplay}`);
  } catch (err) {
    console.error(`  [SIMULATED] Create failed as expected without a running server: ${(err as Error).message}`);
    console.log('  [SIMULATED] In production, the request would be created here.');
    console.log('  [SIMULATED] MJN state would be updated with signingRequestId.');

    dumpSection('POC Complete (Simulated)');
    console.log('The adapter code is structured and ready.');
    console.log('To run against a live Documenso server:');
    console.log('  1. Start the server with INTEGRATION_API_V1_ENABLED=true');
    console.log('  2. Set MJN_API_TOKEN and MJN_BASE_URL');
    console.log('  3. Provide a PDF fixture at assets/example.pdf');
    console.log('  4. Run `npx tsx examples/mjn-dms-adapter/src/demo.ts`');
    return;
  }

  dumpSection('6. Send Signing Request');
  const sent = await client.sendSigningRequest(createResult.requestId);
  console.log(`  Status after send: ${sent.status}`);
  console.log(`  Active stage: ${sent.stages.find((s) => s.isActive)?.order}`);

  dumpSection('7. Create Signing Sessions');
  for (const stage of sent.stages) {
    if (stage.isBlocked) {
      continue;
    }

    const stageParticipants = sent.participants.filter((p) => p.stageOrder === stage.order);
    for (const participant of stageParticipants) {
      if (!participant.isActionable) {
        console.log(`  ${participant.participantId}: not actionable (blocked: ${participant.isBlocked})`);
        continue;
      }

      const session = await client.createSigningSession(createResult.requestId, participant.participantId, {
        returnUrl: 'http://localhost:3000',
      });
      console.log(`  ${participant.participantId}: session=${session.sessionId}`);
      console.log(`    Launch URL: ${session.launchUrl}`);
    }
  }

  dumpSection('8. Retrieve Evidence');
  const evidence = await client.getEvidence(createResult.requestId);
  console.log(`  Events: ${evidence.events.length}`);
  console.log(`  Artifacts: ${evidence.artifacts.length}`);
  console.log(`  Final artifact: ${evidence.finalArtifact ? 'present' : 'pending'}`);

  dumpSection('9. Build MJN-DMS Audit Timeline');
  const auditEntries = buildMjnAuditTimeline(
    createResult.requestId,
    REGULATORY_HYBRID_ROUTE.dossierId,
    REGULATORY_HYBRID_ROUTE.fileId,
    REGULATORY_HYBRID_ROUTE.fileVersionId,
    evidence.events,
    evidence.artifacts,
    evidence.finalArtifact,
  );
  console.log(`  Audit entries: ${auditEntries.length}`);
  auditEntries.forEach((entry) => {
    console.log(`  [${entry.timestamp}] ${entry.eventType}: ${entry.message}`);
  });

  dumpSection('10. Download Final Artifact');
  if (evidence.finalArtifact) {
    const response = await client.downloadArtifact(createResult.requestId, evidence.finalArtifact.artifactId);
    console.log(`  Download status: ${response.status}`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}`);
  }

  dumpSection('POC Complete');
  console.log('Full regulatory hybrid route demonstrated via public Integration API V1.');
  console.log('No MJN-specific code touched the generic tool core.');
};

main().catch((err) => {
  console.error('[MJN-DEMO] Unhandled error:', err);
  process.exit(1);
});
