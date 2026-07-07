# Reusable eSignature Tool — Development Plan

> **Working name:** `TBD`  
> **Base project:** Fork of Documenso Community Edition  
> **Initial usage:** Local-first reusable signing tool for MJN-DMS and future applications  
> **Naming rule:** Do not introduce a permanent product name in code, package names, UI copy, domains, or database identifiers until the name is finalized.

---

## 1. Purpose

Build a reusable electronic-signature tool from a fork of Documenso that can be used by MJN-DMS first and by future products later.

The tool must provide a generic signing capability rather than a dossier-management system. It should accept a finalized PDF, assign one or more recipients, run sequential/parallel signing, expose embedded or link-based signer journeys, return signed artifacts and evidence, and publish a stable integration contract to any calling application.

MJN-DMS remains responsible for:

- Dossiers, folders, regulatory metadata, retention, and submission packages.
- Its own author/reviewer/approver business workflow.
- Determining when a specific frozen document version is eligible for signing.
- Watermark selection, DOCX/XLSX-to-PDF conversion, regulatory correspondence, and submission eligibility.

The reusable signing tool remains responsible for:

- Signing requests/envelopes.
- Recipient and signing-stage orchestration.
- Signature fields and signer experience.
- Signed PDF production and integrity evidence.
- Signing-related event history, evidence export, expiry, cancellation, reminders, and signing status.
- A generic API and webhook/event contract.

---

## 2. Critical clarification: GitHub source is not a runtime

The objective is **not to use a paid cloud eSignature provider** and **not to host a public SaaS service**. The initial tool can run locally from the forked source on the developer machine with Docker and local dependencies.

However, source code stored in GitHub cannot itself execute signing requests. Any application that uses the tool needs a running instance somewhere:

- **Development / POC:** run locally on `localhost` using the forked repository and Docker Compose.
- **Internal demo later:** run on an approved private VM, container platform, or internal environment.
- **Production later:** run in an organization-controlled deployment with backups, secrets, networking, storage, and monitoring.

Therefore, this plan is **source-controlled and self-hosted**, not “GitHub-hosted at runtime.” No DocuSign/Adobe/third-party signing SaaS is required for the initial build.

---

## 3. Why fork Documenso

Documenso is the selected foundation because its current project already provides a document-signing application, digital signature support, API/integration concepts, webhooks, embedding support, recipient roles, and a modern TypeScript/React stack. It is a monorepo with `apps/` and `packages/`, which gives us room to isolate reusable integration additions rather than scattering MJN-specific changes throughout the product.

### Non-negotiable licensing gate

Documenso Community Edition is AGPL-3.0. Keep the upstream copyright notices and license files intact. A modified version made available to users over a network must provide corresponding source under AGPL-3.0 according to Documenso’s published license guidance.

For this project:

1. Fork the repository under the GitHub account that will own the tool.
2. Keep the fork public unless legal guidance explicitly approves a different compliant setup.
3. Keep `LICENSE`, copyright notices, and upstream attribution unchanged.
4. Add a `NOTICE` file describing the fork’s additional work and retained upstream attribution.
5. Do not remove, hide, or overwrite Documenso branding/licensing notices until licensing is reviewed.
6. Do not depend on Enterprise-only features in the first build.
7. Treat a self-signed certificate as **development/internal test only**. It is not a production trust model.

This is an implementation planning requirement, not legal advice. Confirm the final intended distribution, organization policy, and license obligations with a legal/compliance owner before making the tool available to other users.

---

## 4. Product principles

1. **Generic, not MJN-bound** — no dossier, market, regulatory agency, or MJN-specific schema in the core tool.
2. **Frozen-document signing only** — signing happens against a named immutable source artifact/hash; never silently modify a completed signed artifact.
3. **One source of truth for signature events** — all signing actions must have a durable event record and a stable correlation ID.
4. **Provider-neutral public contract, Documenso-native engine initially** — consumers use our generic request/status/event model; first implementation is powered directly by the forked Documenso engine.
5. **Security first** — no keys, certificates, API secrets, raw webhook secrets, or sensitive PDFs in Git.
6. **Minimal fork divergence** — use additive modules, configuration, adapters, and documented extension points. Avoid rewriting the signing engine.
7. **Local-first and reproducible** — a new developer can run the entire POC locally using documented commands and seeded demo data.
8. **Audit evidence over visual appearance** — visible signature blocks are supplementary; signed artifact integrity, event history, signer attribution, timestamps, and hashes are the main evidence.

---

## 5. Initial scope

### Must be built in the first reusable version

- Create a signing request for **one PDF**.
- Associate an external system reference, document reference, version, and source SHA-256 hash.
- Support recipient roles: `SIGNER`, `APPROVER`, `VIEWER`, and `CC` where supported by the underlying engine.
- Support **sequential**, **parallel**, and **hybrid** signing-stage configuration.
- Provide a generic stable request status model.
- Create secure embedded-signing sessions or controlled signing links.
- Show a simple tool-hosted request detail/status page.
- Receive and persist signing events.
- Reconcile current state from the Documenso engine after an event or retry.
- Download/retrieve a completed signed PDF.
- Record final artifact hash and evidence references.
- Support rejection, cancellation, expiry, and resend/reminder handling.
- Provide API documentation and a local demo client/example.
- Provide automated unit/integration/e2e coverage for the critical flow.

### Explicitly out of scope for version 1

- Dossier creation, submission, retention, regulatory correspondence, and approval policy enforcement.
- DOCX/XLSX authoring or conversion.
- Watermark rendering policy.
- Multi-document package merge/signing.
- Bulk signing.
- Multiple external eSignature providers.
- Qualified signatures, advanced trust-service integration, KMS/HSM production key custody, or country-specific legal claims.
- Custom SSO changes or paid Enterprise-only features.
- Fully white-labeled UI.
- New payment/billing work.
- Replacing Documenso’s existing signing or PDF cryptography implementation.

---

## 6. Target architecture

```text
Calling application (MJN-DMS now, another product later)
       |
       | Generic REST API + callback registration
       v
Reusable Signing Tool (forked Documenso application)
       |
       | Tool integration facade / request mapper
       v
Documenso-native document, recipient, signing, and audit capabilities
       |
       +--> PostgreSQL
       +--> Object storage (local/S3-compatible)
       +--> Email/inbox service for local development
       +--> Signing certificate/key material (development only initially)
```

### Architecture choice for v1

Do **not** create a separate FastAPI microservice before the first tool works. The fork itself is the tool. Add a thin, additive integration facade that exposes a stable consumer contract while delegating signing work to Documenso’s existing domain logic.

This avoids two sources of truth and avoids duplicating signature lifecycle logic outside the signing engine.

### Consumer-facing boundary

A calling application must not need to know:

- Documenso’s internal database IDs.
- Its raw recipient status names.
- Its internal route structure.
- How a signing certificate is configured.
- Which storage implementation is used.

A calling application should only know:

- `signingRequestId`.
- Its own `externalReference` and `documentReference`.
- Current normalized status.
- Recipient progress.
- A secure signing-session URL/token for the active recipient.
- Final signed artifact metadata and evidence references.
- Signed webhook/event payloads.

---

## 7. Normalized domain model

Use Documenso’s existing models wherever possible. Add only an integration layer that maps generic requests to Documenso domain entities.

### Core conceptual entities

| Entity | Purpose | Key fields |
|---|---|---|
| `SigningRequest` | Generic request created by a calling product | id, externalReference, title, sourceSystem, status, expiryAt, correlationId |
| `SigningDocument` | Immutable document snapshot in a request | id, signingRequestId, documentReference, version, sourceHash, sourceArtifactRef, finalHash |
| `SigningStage` | One workflow stage | id, requestId, sequence, mode, requiredPolicy |
| `SigningParticipant` | A signer, approver, viewer, or CC recipient | id, stageId, externalUserReference, email, displayName, role, status |
| `SigningEvent` | Durable, append-oriented event history | id, requestId, participantId, type, occurredAt, correlationId, providerEventRef |
| `ArtifactEvidence` | Signed-PDF and verification/evidence references | id, requestId, artifactRef, sha256, certificateFingerprint, completionRecordRef |
| `CallbackSubscription` | Consumer’s outgoing event registration | id, sourceSystem, endpoint, secretRef, enabled, eventTypes |

### Required invariants

- One completed request cannot be edited, reused, or overwritten.
- A changed source PDF/version requires a new `SigningRequest`.
- Every request must have a unique correlation ID.
- Every source document must have a SHA-256 hash captured before request creation.
- Every completed artifact must have a final SHA-256 hash captured after signing.
- Each event is append-only and idempotent.
- A callback retry cannot create duplicate business events.
- Later sequential stages cannot be made actionable before prior required stages complete.
- In a parallel stage, all required participants must complete unless its explicit policy says otherwise.

---

## 8. Normalized status and event contract

### Request statuses

```text
DRAFT
READY_TO_SEND
IN_PROGRESS
PARTIALLY_COMPLETED
COMPLETED
REJECTED
EXPIRED
CANCELLED
FAILED
```

### Participant statuses

```text
PENDING
WAITING_FOR_STAGE
DELIVERED
VIEWED
ACTION_REQUIRED
COMPLETED
REJECTED
EXPIRED
CANCELLED
FAILED
```

### Minimum event types

```text
request.created
request.sent
recipient.delivered
recipient.viewed
recipient.completed
recipient.rejected
request.partially_completed
request.completed
request.expired
request.cancelled
request.failed
artifact.ready
callback.delivery_failed
```

All event payloads must include:

```json
{
  "eventId": "evt_...",
  "eventType": "request.completed",
  "occurredAt": "2026-07-07T00:00:00Z",
  "signingRequestId": "sr_...",
  "externalReference": "caller-owned-reference",
  "correlationId": "corr_...",
  "status": "COMPLETED",
  "schemaVersion": "1.0"
}
```

---

## 9. Consumer API contract for v1

The exact implementation should follow the repository’s current API conventions. The following is the public logical contract and must not be coupled to raw Documenso IDs.

### Create a request

`POST /api/v1/signing-requests`

```json
{
  "externalReference": "DOS-2026-00042",
  "sourceSystem": "mjn-dms",
  "title": "Regulatory submission approval",
  "document": {
    "documentReference": "REG-COA-00045",
    "version": "3.0",
    "file": "upload-or-secure-artifact-reference",
    "sha256": "required-source-hash"
  },
  "workflow": {
    "stages": [
      {
        "sequence": 1,
        "mode": "SEQUENTIAL",
        "participants": [
          {
            "externalUserReference": "user-author-1",
            "email": "author@example.test",
            "name": "Regulatory Author",
            "role": "SIGNER"
          }
        ]
      },
      {
        "sequence": 2,
        "mode": "PARALLEL",
        "participants": [
          {
            "externalUserReference": "user-medical-1",
            "email": "medical@example.test",
            "name": "Medical Reviewer",
            "role": "SIGNER"
          },
          {
            "externalUserReference": "user-quality-1",
            "email": "quality@example.test",
            "name": "Quality Reviewer",
            "role": "SIGNER"
          }
        ]
      }
    ]
  },
  "expiresAt": "2026-08-01T18:30:00Z",
  "metadata": {
    "correlationId": "caller-generated-uuid"
  }
}
```

### Core endpoints

```text
POST   /api/v1/signing-requests
GET    /api/v1/signing-requests/{requestId}
POST   /api/v1/signing-requests/{requestId}/send
POST   /api/v1/signing-requests/{requestId}/cancel
POST   /api/v1/signing-requests/{requestId}/remind
POST   /api/v1/signing-requests/{requestId}/recipients/{recipientId}/session
GET    /api/v1/signing-requests/{requestId}/events
GET    /api/v1/signing-requests/{requestId}/artifacts
GET    /api/v1/signing-requests/{requestId}/evidence
POST   /api/v1/callback-subscriptions
```

### API rules

- Require server-to-server authentication for management endpoints.
- Never expose a master API key, signing certificate, private key, object-storage credentials, or callback secret to the browser.
- Return idempotency support for request creation and send/remind operations.
- Validate SHA-256 formatting and recompute/verify the content hash on the server.
- Return stable errors with application error codes, not only raw provider/internal errors.
- Version the API under `/api/v1` from day one.
- Generate OpenAPI documentation or the project-equivalent API docs as part of the build.

---

## 10. UI and embedded-signing plan

### Tool-hosted UI

Add a focused request dashboard rather than redesigning all of Documenso:

- Request title and normalized status.
- External reference, document reference, version, and source hash.
- Stage-by-stage participant timeline.
- Current actionable recipient.
- Completed/rejected/expired states.
- Download signed artifact button only after completion.
- Evidence/audit timeline.

### Embedded signing

The consumer application should request a recipient-specific signing session from the backend and render the returned tool-controlled signing surface/link.

Rules:

- The requester cannot choose another participant’s signing session.
- Session URLs/tokens are short-lived and never stored in browser local storage or caller databases.
- The consumer app receives completion through callback/webhook plus a status refresh.
- Phase 1 may use a controlled redirect/open-in-new-tab flow if true iframe embedding is not available in the Community Edition or requires paid features. Do not bypass product license boundaries.

---

## 11. Security, integrity, and audit requirements

### Secrets and certificates

- `.env`, `.env.local`, private certificates, `.p12`, `.key`, secrets, database dumps, object-storage data, and generated signed PDFs must be ignored by Git.
- Use a **development-only self-signed certificate** for local work.
- Never commit any certificate private key or certificate password.
- Create a documented certificate-generation script that writes only to ignored local paths.
- Add a checked-in `.env.example` without real secrets.
- Establish a future `SIGNING_KEY_PROVIDER` configuration boundary; do not implement production HSM/KMS in v1.

### Integrity

- Capture source SHA-256 before signing.
- Capture final signed-PDF SHA-256 after completion.
- Store hash, source version, request ID, stage history, and completion evidence together.
- Verify that changing a completed signed PDF causes expected signature/integrity validation failure in the POC test.

### Callback/webhook safety

- Sign outgoing callbacks with HMAC using a per-subscription secret.
- Include timestamp and event ID in callback headers/payload.
- Require consumer-side replay protection guidance.
- Implement delivery retries with bounded exponential backoff.
- Mark delivery results in the audit timeline.
- Make events idempotent by `eventId`.
- Do not trust a callback alone; reconcile signing state through the underlying Documenso service after significant state changes.

### Local network safety

- Keep the local POC bound to localhost where possible.
- Avoid arbitrary user-provided callback URLs in phase 1.
- Implement a callback URL allowlist/configuration option before enabling outbound callbacks broadly.
- Do not expose local services publicly via tunnels as part of the standard workflow.

---

## 12. Repository and Git strategy

### Repository setup

1. Create a GitHub **fork** of `documenso/documenso`; do not create a detached copy without upstream history.
2. Clone the fork locally.
3. Configure remotes:

```bash
git remote rename origin fork
git remote add upstream https://github.com/documenso/documenso.git
git remote -v
```

4. Set your fork as the push remote or add a separate `origin` alias if preferred.
5. Create a `NOTICE` file retaining Documenso attribution and describing fork-specific additions.
6. Add documentation under `docs/reusable-signing-tool/`.
7. Maintain an `UPSTREAM_SYNC.md` file with the last synced upstream commit/tag and conflict-resolution notes.

### Branch policy

- `main`: stable, merge-only branch.
- `feat/<phase>-<short-name>`: one scoped phase at a time.
- No direct commits to `main`.
- Each phase must be tested, committed, pushed, merged to `main`, and then the feature branch must be deleted locally and remotely.
- Use conventional commits where the upstream project conventions require them.

### Upstream synchronization policy

- Pull upstream changes only through a dedicated `chore/upstream-sync-YYYY-MM-DD` branch.
- Review changes to API routes, database schema, signing engine, dependencies, security files, and Docker setup carefully.
- Never blindly merge upstream into an active feature branch.
- Record sync conflicts/resolutions in `UPSTREAM_SYNC.md`.

---

## 13. Proposed documentation structure

```text
docs/reusable-signing-tool/
  README.md                         # What this reusable tool is and is not
  product-scope.md                  # Scope, personas, non-goals
  architecture.md                   # Target architecture and extension boundary
  api-contract-v1.md                # Logical REST/API contract and schemas
  event-contract-v1.md              # Statuses, events, callbacks, retry behavior
  data-model.md                     # Conceptual entities and invariants
  security-model.md                 # Secrets, certificates, audit, integrity, callbacks
  local-development.md              # Local setup, Docker, mail inbox, storage, test cert
  test-plan.md                      # Unit/integration/e2e/security test matrix
  upstream-sync.md                  # Upstream strategy and last sync template
  decisions/
    ADR-001-fork-and-license.md
    ADR-002-generic-integration-facade.md
    ADR-003-local-first-runtime.md
    ADR-004-single-pdf-request-mvp.md
```

Do not create generic documentation that conflicts with Documenso’s existing developer documentation. These documents describe only the reusable-tool layer and local decisions made by this fork.

---

## 14. Phased implementation plan

### Phase 0 — Fork baseline, legal guardrails, and local reproducibility

**Goal:** create a clean fork baseline before changing functionality.

Tasks:

- Fork and clone Documenso.
- Read root `AGENTS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`, and package scripts before editing.
- Confirm the actual current repository structure and toolchain; do not rely on old blog posts or assumptions.
- Start the untouched application locally using the repository-supported developer command.
- Confirm access to the app, database, local mailbox, and storage dashboard if supplied by the local setup.
- Generate a development-only signing certificate using a local ignored path.
- Verify baseline document-signing behavior with one manually created test PDF.
- Add the reusable-tool documentation structure and initial ADRs.
- Add Git ignore/security guardrails for development certificates, PDFs, object storage, and local dumps.
- Add `NOTICE` and `UPSTREAM_SYNC.md`.
- Do not change business logic in this phase.

Acceptance criteria:

- Baseline works locally before custom code exists.
- No secrets/certificates/generated PDFs appear in Git status.
- A fresh clone can be started from the documented setup steps.
- License attribution remains intact.
- Documentation explains the source-versus-runtime boundary.

---

### Phase 1 — Repository discovery and integration facade skeleton

**Goal:** add an isolated, additive extension boundary without changing signature behavior.

Tasks:

- Map the existing Documenso modules responsible for document creation, recipients, signing order, field placement, completion, audit, storage, API authentication, and webhooks.
- Write a concise code map in `docs/reusable-signing-tool/repository-code-map.md`.
- Choose the correct API pattern based on the codebase’s current conventions; do not add an unrelated framework.
- Add a feature-gated, empty integration facade/module under the most appropriate existing app/package boundary.
- Define normalized request/status/event TypeScript schemas and validation tests.
- Add API versioning/configuration under a neutral name, for example `INTEGRATION_API_V1_ENABLED`.
- Add a minimal health/capabilities endpoint for local consumers.

Acceptance criteria:

- Existing Documenso flows are unchanged.
- The feature can be disabled completely.
- Type schemas compile and tests pass.
- No MJN-specific words, fields, or UI copy appear in the reusable-tool code.

---

### Phase 2 — Generic single-PDF signing-request creation

**Goal:** let a trusted calling application create a generic signing request.

Tasks:

- Add the normalized `SigningRequest`, `SigningDocument`, `SigningStage`, and `SigningParticipant` mapping/persistence layer using existing Documenso entities where possible.
- Add request creation endpoint with idempotency key support.
- Validate document input, external reference, expiry, participants, stage ordering, duplicate recipient rules, and SHA-256 format.
- Compute/verify source file hash server-side.
- Map generic roles/stages to Documenso recipient/order mechanisms.
- Add a request status endpoint and a basic request-details UI page.

Acceptance criteria:

- A local client can create a one-PDF sequential request and retrieve its normalized status.
- Duplicate create calls with the same idempotency key do not create duplicate requests.
- A request cannot be created with invalid stage ordering or invalid hash.

---

### Phase 3 — Sequential, parallel, and hybrid stage orchestration

**Goal:** support the reusable routing requirement.

Tasks:

- Implement sequential stage behavior.
- Implement parallel stage behavior.
- Implement hybrid composition: sequential stage → parallel stage → sequential stage.
- Define policy behavior for stage completion in v1: `ALL_REQUIRED` only, unless the current Documenso behavior safely supports more.
- Normalize raw engine status transitions into the public status model.
- Add participant status timeline and ordering validation.

Acceptance criteria:

- Later sequential recipients remain blocked until prior required stages complete.
- Parallel recipients can act independently.
- A hybrid flow completes only when all required stages complete in valid order.
- Integration and e2e tests cover each routing shape.

---

### Phase 4 — Signing sessions, signer experience, and consumer integration

**Goal:** let an external React or backend application launch the correct signer experience safely.

Tasks:

- Add recipient-specific signing-session generation endpoint.
- Enforce participant identity/session scope and expiry.
- Provide a redirect-based flow first.
- Add embedded-signing support only if compatible with the Community Edition and current repository-supported interfaces.
- Add minimal integration example app or sample React page, separate from MJN-DMS.
- Ensure signing UI loads document, required fields, sign intent, and completion state.

Acceptance criteria:

- A caller can obtain a session only for an eligible active recipient.
- The signer cannot act for a different recipient.
- Completion returns the user to a caller-specified safe allowlisted URL or emits a callback event.

---

### Phase 5 — Audit, evidence, completed artifact, and callbacks

**Goal:** make the tool defensible and reusable after signing completes.

Tasks:

- Persist normalized append-only signing events.
- Generate request correlation IDs and map engine event references.
- Capture final signed artifact reference and SHA-256 hash.
- Record available certificate/evidence metadata without exposing private material.
- Add evidence/artifact retrieval endpoints protected by server-side authorization.
- Implement signed callbacks, retry/outbox behavior, idempotency, and callback delivery audit.
- Add reconciliation job/command that refreshes request state from underlying Documenso data.

Acceptance criteria:

- A completed request exposes final PDF metadata, final hash, participant timeline, and evidence references.
- Duplicate engine/webhook events result in one normalized event.
- A failed callback is retried and visible in the request’s audit history.
- Modifying a completed PDF fails the expected integrity/signature verification test.

---

### Phase 6 — Failure handling and request lifecycle controls

**Goal:** handle real-world exceptions safely.

Tasks:

- Implement rejection flow with reason capture.
- Implement cancellation/voiding with authorization checks.
- Implement expiry rules and a scheduled expiry processor.
- Implement reminders/resend policy with rate limits.
- Ensure terminal requests cannot return to active state.
- Document caller behavior: changed document/version means create a new request.

Acceptance criteria:

- Rejected, cancelled, and expired requests remain fully auditable.
- No completed request can be edited or resent.
- Reminder attempts are rate-limited and recorded.

---

### Phase 7 — Test harness, security checks, and local demo

**Goal:** prove the tool is reusable without MJN-DMS.

Tasks:

- Unit tests for schemas, mappings, ordering, idempotency, normalized statuses, and event deduplication.
- Integration tests for local database/storage flows.
- E2E Playwright test for one sequential and one hybrid signing request.
- Test certificate generation and local sign/complete verification.
- Add a small `examples/consumer-react` or equivalent standalone consumer demo.
- Add a `scripts/demo-signing-request` helper or documented API collection.
- Add dependency/security scan commands that match the upstream project’s tooling.

Acceptance criteria:

- A new developer can reproduce the complete signing flow without MJN-DMS.
- Tests pass in CI and locally.
- A basic consumer sample creates a request, launches signing, receives completion, and retrieves the artifact.

---

### Phase 8 — MJN-DMS integration POC

**Goal:** integrate without contaminating the generic tool.

Tasks:

- Create a separate MJN-DMS adapter/client outside the reusable tool core.
- Convert an approved MJN file to a frozen PDF before request creation.
- Pass MJN dossier/file/version references as external metadata only.
- Store `signingRequestId`, request status, artifact reference, and evidence reference in MJN-DMS.
- Map completion/rejection back to MJN’s own workflow state.
- Test one regulatory-style hybrid route:
  - Regulatory Author signs.
  - Medical and Quality sign in parallel.
  - Regional Regulatory Lead signs.

Acceptance criteria:

- MJN-DMS can use the tool through its public API only.
- The reusable tool has no MJN-only migration, UI rule, or hard-coded field.
- Final signed file/evidence can be shown in the MJN-DMS audit timeline.

---

## 15. Test matrix

| Area | Minimum tests |
|---|---|
| API validation | invalid input, missing hash, duplicate external reference policy, malformed expiry, invalid recipient email |
| Idempotency | duplicate create/send/remind requests do not duplicate state |
| Routing | sequential, parallel, hybrid, blocked future stage, all-required completion |
| Authorization | caller cannot retrieve another request; recipient session isolation; terminal-action protection |
| Audit | event order, event deduplication, correlation IDs, rejection reason, actor/timestamp retention |
| Artifact integrity | source hash captured; final hash captured; signed PDF modification verification failure |
| Callback delivery | signed payload; retry; duplicate receipt; disabled subscription; failed endpoint |
| Lifecycle | draft, send, partial, completed, rejected, expired, cancelled, failed |
| Local setup | fresh clone startup; certificate generated outside Git; test document signs successfully |
| Regression | original Documenso send/sign flow still passes |

---

## 16. Definition of done for v1

The tool is ready for its first consumer when all statements below are true:

- It runs locally from the forked source with documented commands.
- It uses a development certificate that is not committed to Git.
- A separate generic consumer can create a one-PDF signing request through the public v1 API.
- Sequential, parallel, and hybrid signing stages work.
- Each signer gets only their own signing session.
- The tool returns a completed signed artifact plus normalized evidence metadata.
- Source and final hashes are stored.
- Events are append-only, idempotent, and available through API/callbacks.
- Reject, cancel, expiry, and reminder behaviors are supported and auditable.
- Existing Documenso capabilities are not broken.
- The API and local setup are documented.
- All tests and project lint/typecheck/build commands pass.
- The fork complies with the required license attribution/source availability approach.

---

## 17. First implementation sequence

Start only with **Phase 0**. Do not begin workflow/embedded-signing customizations before the untouched baseline can run, sign a test PDF, and be documented.

The first Codex task should:

1. Inspect and obey the repository’s own instructions.
2. Establish local baseline and test signing.
3. Add planning/ADR/security documentation only.
4. Add no business-logic feature yet.
5. Commit, push, merge, and delete the phase branch only after all baseline verification passes.

