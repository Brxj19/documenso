# Integration API V1 Signing Requests

Phase 6 keeps the reusable signing-tool facade behind
`INTEGRATION_API_V1_ENABLED` and adds request lifecycle controls including
participant rejection, cancellation, expiry processing, rate-limited reminders,
terminal-state enforcement, and immutable completed-request behavior.

## Endpoints

- `GET /api/v1/integration/capabilities`
- `POST /api/v1/integration/signing-requests`
- `GET /api/v1/integration/signing-requests/:requestId`
- `POST /api/v1/integration/signing-requests/:requestId/send`
- `POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/signing-session`
- `GET /api/v1/integration/signing-requests/:requestId/evidence`
- `GET /api/v1/integration/signing-requests/:requestId/artifacts`
- `GET /api/v1/integration/signing-requests/:requestId/artifacts/:artifactId/download`
- `POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/reject`
- `POST /api/v1/integration/signing-requests/:requestId/cancel`
- `POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/remind`
- `GET /sign/integration/:sessionId`
- `GET /sign/integration/:sessionId/complete`
- `GET /t/:teamUrl/integration/signing-requests/:requestId`

## Terminal-State Policy

Terminal request statuses are `COMPLETED`, `REJECTED`, `CANCELLED`, `EXPIRED`,
and `FAILED`.

Rules:

1. Terminal requests cannot be sent or activated again.
2. Terminal requests cannot create signing sessions.
3. Terminal requests cannot send reminders.
4. Terminal requests cannot add or change participants.
5. Terminal requests cannot return to `READY`, `IN_PROGRESS`, or
   `PARTIALLY_COMPLETED`.
6. Terminal requests can still expose evidence, artifact metadata, download if
   completed, event timeline, callback state, and reconciliation history.
7. A changed source document or new version must create a new integration
   signing request.

## Rejection

`POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/reject`

Request body:
- `reason` (required string, trimmed, bounded to 255 characters)

Response includes the normalized request and participant status. A rejected
request transitions to `REJECTED`. Later participant sessions become invalid.

Evidence records `PARTICIPANT_REJECTED` and `REQUEST_REJECTED` events. A
callback is queued when callback configuration exists.

## Cancellation

`POST /api/v1/integration/signing-requests/:requestId/cancel`

Request body:
- `reason` (required string, trimmed, bounded to 255 characters)

The caller must be authenticated and authorized under existing team ownership
conventions. The request must be non-terminal. A completed request cannot be
cancelled.

Evidence records a `REQUEST_CANCELLED` event. A callback is queued when
callback configuration exists.

## Expiry

Expiry is processor-driven. The command:

```bash
npm run integration:expire
```

Scans non-terminal integration requests with `expiresAt` in the past, marks
them `EXPIRED`, appends an `REQUEST_EXPIRED` event idempotently, and enqueues
callbacks when configured.

Optional dry-run:
```bash
npm run integration:expire -- --dry-run
```

## Reminders

`POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/remind`

Rate-limited by:
- `INTEGRATION_API_V1_REMINDER_MIN_INTERVAL_SECONDS` (default 3600)
- `INTEGRATION_API_V1_REMINDER_MAX_PER_DAY` (default 5)
- `INTEGRATION_API_V1_REMINDER_MAX_PER_REQUEST` (default 15)
- `INTEGRATION_API_V1_REMINDER_ENABLED` (required to enable)

Rate-limited attempts are recorded as `REMINDER_ATTEMPTED` events and visible
in evidence. Successful reminders record `REMINDER_SENT`.

## Immutable Completed Requests

Completed requests reject all mutation attempts:
- send/activate
- signing-session creation
- reminder/resend
- reject
- cancel
- expire

Completed artifact download and evidence remain available.

## Lifecycle Event Types

Phase 6 adds to the normalized event model:

- `REQUEST_CANCELLED`
- `REQUEST_EXPIRED`
- `REMINDER_SENT`
- `REMINDER_ATTEMPTED`

## Callback Behavior For Lifecycle Events

The following lifecycle events are callback-eligible and enqueue a signed
callback when callback URL configuration exists:

- `PARTICIPANT_REJECTED`
- `REQUEST_REJECTED`
- `REQUEST_CANCELLED`
- `REQUEST_EXPIRED`
- `REMINDER_SENT`

Duplicate lifecycle events do not enqueue duplicate callbacks. Callback
failure and retry are visible in evidence.

## Evidence Visibility

Rejected, cancelled, and expired requests remain fully auditable. The evidence
endpoint shows the terminal status, reason via event metadata, and the full
event timeline including all lifecycle events.

## Changed Document Or Version Rule

If the source file content changes, source file version changes, or a rejected
request requires document edits, create a new signing request. The previous
request remains auditable in its terminal state.

## Capabilities

`GET /api/v1/integration/capabilities` now reports:

- `releasePhase: PHASE_6_LIFECYCLE_CONTROLS`
- `rejectionSupported: true`
- `cancellationSupported: true`
- `expiryProcessorSupported: true`
- `remindersSupported: true`
- `reminderRateLimitsSupported: true`
- `terminalStateEnforcementSupported: true`
- `immutableCompletedRequestsSupported: true`

## Out Of Scope

Phase 6 still does not add:

- a custom signing engine
- embedded signing
- public artifact URLs
- private key exposure
- manual audit editing
- multi-document package support
- external SaaS signing providers
- domain-specific or customer-specific vocabulary

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
