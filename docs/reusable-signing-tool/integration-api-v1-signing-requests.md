# Integration API V1 Signing Requests

Phase 5 keeps the reusable signing-tool facade behind
`INTEGRATION_API_V1_ENABLED` and makes completed requests defensible after
signing by adding normalized evidence, final-artifact capture, protected
artifact retrieval, signed callbacks, and reconciliation commands.

## Endpoints

- `GET /api/v1/integration/capabilities`
- `POST /api/v1/integration/signing-requests`
- `GET /api/v1/integration/signing-requests/:requestId`
- `POST /api/v1/integration/signing-requests/:requestId/send`
- `POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/signing-session`
- `GET /api/v1/integration/signing-requests/:requestId/evidence`
- `GET /api/v1/integration/signing-requests/:requestId/artifacts`
- `GET /api/v1/integration/signing-requests/:requestId/artifacts/:artifactId/download`
- `GET /sign/integration/:sessionId`
- `GET /sign/integration/:sessionId/complete`
- `GET /t/:teamUrl/integration/signing-requests/:requestId`

## Normalized Evidence

Phase 5 adds append-only integration events keyed to the signing request and
deduped by a server-generated normalization key. Current event types include:

- `REQUEST_CREATED`
- `REQUEST_SENT`
- `SIGNING_SESSION_CREATED`
- `SIGNING_SESSION_LAUNCHED`
- `PARTICIPANT_COMPLETED`
- `PARTICIPANT_REJECTED`
- `REQUEST_PARTIALLY_COMPLETED`
- `REQUEST_COMPLETED`
- `REQUEST_REJECTED`
- `REQUEST_FAILED`
- `FINAL_ARTIFACT_CAPTURED`
- `CALLBACK_QUEUED`
- `CALLBACK_DELIVERED`
- `CALLBACK_FAILED`
- `RECONCILIATION_REFRESHED`

Each event stores only safe references:

- request ID and request correlation ID
- event correlation ID
- optional participant/session references
- optional native envelope and recipient references
- optional native audit-log reference when one is available
- status before and after
- event timestamp and observed timestamp
- safe metadata only

No event row stores document bytes, private keys, signing tokens, or raw
callback secrets.

## Correlation IDs

Phase 5 generates correlation IDs server-side for:

- the integration signing request
- each normalized event
- each callback delivery attempt

The request also accepts an optional caller-provided `clientCorrelationId`. The
server-generated request correlation ID is the value returned in API responses,
used in reconciliation, and included in callback payloads and signature input.

## Final Artifact Capture

When a request reaches `COMPLETED`, Phase 5 captures one durable final artifact
record for the completed native PDF:

- artifact type `SIGNED_PDF`
- filename
- MIME type
- size in bytes
- native envelope and envelope-item references
- storage-backed `DocumentData` reference
- server-computed SHA-256 hash of the actual signed PDF bytes
- capture timestamp
- safe certificate/evidence metadata

Artifact capture is idempotent. Re-running reconciliation or seeing duplicate
completion signals will not create a second artifact row.

## Certificate And Evidence Metadata

Phase 5 reuses existing Documenso certificate and audit-log behavior without
trying to rebuild the signing engine.

The evidence response exposes only safe metadata:

- whether certificate PDF download is available
- whether audit-log PDF download is available
- signing timestamp when available
- verification status derived from the captured artifact hash

The current Community Edition flow does not expose certificate subject, issuer,
serial number, or private cryptographic material through the integration layer,
so those fields remain absent rather than fabricated.

## Evidence Endpoint

`GET /api/v1/integration/signing-requests/:requestId/evidence`

Returns:

- request ID
- server-generated correlation ID
- optional client correlation ID
- normalized request status
- participant timeline
- normalized event timeline
- final artifact metadata when available
- final SHA-256 when available
- safe certificate/evidence metadata when available
- callback delivery state
- reconciliation timestamps
- created, updated, completed, and rejected timestamps

## Artifact Metadata Endpoint

`GET /api/v1/integration/signing-requests/:requestId/artifacts`

Returns safe metadata only for captured final artifacts. The endpoint rejects
requests that are not yet completed.

## Protected Artifact Download

`GET /api/v1/integration/signing-requests/:requestId/artifacts/:artifactId/download`

This route is authenticated with the existing V1 API token pattern and streams
the completed signed PDF through the server. It does not expose raw storage
keys, public object-store URLs, or download access for non-completed requests.

## Callback Configuration

Phase 5 keeps callback configuration neutral and per request:

- request body `callback.url`
- optional request body `callback.correlationId`
- optional request body `callback.metadata`

New environment variables:

- `INTEGRATION_API_V1_CALLBACK_URL_ALLOWLIST`
- `INTEGRATION_API_V1_CALLBACK_SIGNING_SECRET`
- `INTEGRATION_API_V1_CALLBACK_TIMEOUT_MS`
- `INTEGRATION_API_V1_CALLBACK_MAX_ATTEMPTS`
- `INTEGRATION_API_V1_CALLBACK_RETRY_DELAY_MS`

Callback URLs must be absolute `http` or `https` URLs and must match the
allowlist. Non-HTTP schemes, malformed URLs, and non-allowlisted targets are
rejected.

## Callback Payload And Headers

Callbacks are sent with a generic JSON payload that includes:

- `eventId`
- `eventType`
- `requestId`
- `requestCorrelationId`
- `eventTimestamp`
- `requestStatus` when available
- `participantId` when applicable
- artifact metadata when applicable
- final SHA-256 when applicable
- optional client correlation state when available
- `deliveryAttempt`

Headers:

- `X-Integration-Event-Id`
- `X-Integration-Timestamp`
- `X-Integration-Signature`
- `X-Integration-Delivery-Id`

The signature is HMAC SHA-256 over:

```text
<timestamp>.<raw-json-body>
```

using `INTEGRATION_API_V1_CALLBACK_SIGNING_SECRET`.

## Callback Retry And Outbox Behavior

Phase 5 persists one callback-delivery row per normalized event and request.

Each delivery row tracks:

- target URL
- payload template
- payload hash
- attempt count
- max attempts
- next attempt time
- last attempt time
- last HTTP status
- last safe error summary
- delivery state
- last delivery-attempt correlation ID

Delivery states:

- `PENDING`
- `DELIVERING`
- `DELIVERED`
- `FAILED_RETRYABLE`
- `FAILED_FINAL`

Rules:

- duplicate normalized events do not enqueue duplicate callbacks
- callback delivery failures do not block signing completion
- retry history is visible through the evidence endpoint
- callback status changes append new normalized events instead of mutating the
  original business event body

## Reconciliation Command

Phase 5 adds:

```bash
npm run integration:reconcile
```

Optional dry-run:

```bash
npm run integration:reconcile -- --dry-run
```

The command scans active or recently touched integration requests, derives the
normalized state from native Documenso data, captures missing final artifacts,
appends missing normalized events idempotently, and queues missing callbacks
idempotently.

Due callback deliveries can be processed with:

```bash
npm run integration:callbacks
```

## Integrity Verification

The integration layer does not implement a separate PDF cryptography engine.
Instead it captures the final signed bytes from native Documenso storage and
stores the final SHA-256 hash for evidence and tamper detection.

Phase 5 verification uses that captured hash as the integrity baseline:

- the downloaded completed PDF must match the stored SHA-256
- a tampered copy must fail the same hash comparison

## Capabilities

`GET /api/v1/integration/capabilities` now reports:

- `releasePhase: PHASE_5_AUDIT_EVIDENCE_CALLBACKS`
- `callbackEventsSupported: true`
- `evidenceEndpointSupported: true`
- `finalArtifactMetadataSupported: true`
- `finalArtifactDownloadSupported: true`
- `callbackSigningSupported: true`
- `callbackRetryOutboxSupported: true`
- `reconciliationSupported: true`
- `integrityVerificationTested: true`
- `supportedCallbackModes: ['PER_REQUEST_URL']`

## Out Of Scope

Phase 5 still does not add:

- a custom signing engine
- embedded signing
- public artifact URLs
- private key exposure
- manual audit editing
- multi-document package support
- external SaaS signing providers
- domain-specific or customer-specific vocabulary
