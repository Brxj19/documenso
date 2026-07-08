# Integration API V1 Signing Requests

Phase 3 extends the reusable signing-tool facade under `INTEGRATION_API_V1_ENABLED` with normalized stage orchestration for sequential, parallel, and hybrid signing requests.

## Endpoints

- `POST /api/v1/integration/signing-requests`
- `POST /api/v1/integration/signing-requests/:requestId/send`
- `GET /api/v1/integration/signing-requests/:requestId`
- `GET /t/:teamUrl/integration/signing-requests/:requestId`

## Routing Policy

Phase 3 supports one public stage-completion policy:

- `ALL_REQUIRED`

For V1 this means:

- every required participant in a stage must complete before the stage is complete
- later stages stay blocked until all required participants in earlier stages complete
- participants in the same active stage can act independently
- a hybrid request completes only after every required participant in every stage completes

Unsupported policies are rejected at schema validation time.

## Contract Shape

The create route accepts:

- `externalReference`
- `title`
- `document`
  - `sourceReference`
  - `filename`
  - `mimeType`
  - required SHA-256 content hash
- `participants`
- `stages`
  - `order`
  - `participantIds`
  - optional `completionPolicy`, currently limited to `ALL_REQUIRED`
- optional `expiresAt`
- optional `idempotencyKey`
- optional correlation and safe metadata

The status route returns a normalized read model with:

- request status
- verified source-document hash
- safe native envelope/document references
- stage order, stage status, and stage-completion policy
- participant status, blocked/available state, and blocked reason when present
- flattened participant timeline
- timestamps where the native model exposes them safely

## Native Mapping

The facade still creates a new native draft document from verified source bytes:

- the caller source document is never mutated in place
- actionable participants map to native recipients
- participants in the same integration stage share the same native `signingOrder`
- later stages map to higher native `signingOrder` values
- read-only participants stay outside staged routing order

Phase 3 reuses the existing Documenso signing engine and extends its sequential-group interpretation so that equal native `signingOrder` values behave as one active stage.

## Activation

`POST /api/v1/integration/signing-requests/:requestId/send` is the minimal activation endpoint added in Phase 3.

It is:

- authenticated through the existing API token middleware
- feature-gated by `INTEGRATION_API_V1_ENABLED`
- team-scoped
- limited to integration-created requests
- safe to retry

Behavior:

- a `READY` request transitions into the native Documenso send/sign lifecycle
- retries against an already active or terminal request return the current normalized view instead of creating duplicate sends
- the route uses `sendEmail: false`, so activation does not create duplicate email sends on retry
- later stage notifications continue to follow native Documenso behavior and respect the document’s derived email settings

## Status Normalization

Public request status remains:

- `DRAFT`
- `READY`
- `IN_PROGRESS`
- `PARTIALLY_COMPLETED`
- `COMPLETED`
- `REJECTED`
- `EXPIRED`
- `CANCELLED`
- `FAILED`

Stage status now includes:

- `WAITING`
- `ACTIVE`
- `PARTIALLY_COMPLETED`
- `COMPLETED`
- `BLOCKED`
- `REJECTED`
- `EXPIRED`
- `CANCELLED`
- `FAILED`

Participant status now includes:

- `WAITING`
- `AVAILABLE`
- `VIEWED`
- `COMPLETED`
- `REJECTED`
- `EXPIRED`
- `CANCELLED`
- `FAILED`

Blocked participants and stages can also expose these reason codes:

- `REQUEST_NOT_ACTIVE`
- `PREVIOUS_STAGE_INCOMPLETE`
- `REQUEST_TERMINATED`

## Routing Behavior

Sequential:

- Stage 1 becomes active after activation
- Stage 2 and later stay blocked until all earlier stages complete

Parallel:

- all participants in the active stage share the same native order
- one completion yields `PARTIALLY_COMPLETED`
- the stage completes only when every required participant in that stage completes

Hybrid:

- sequential stage
- then parallel stage
- then sequential stage

The next stage does not unlock until the entire previous stage finishes under `ALL_REQUIRED`.

## Participant Timeline

The normalized timeline is flattened per participant and includes:

- stage order
- stage status
- stage-completion policy
- participant identifier and safe display information
- role
- native signing order
- normalized participant status
- status timestamp where available
- completion timestamp where available
- actionable flag
- blocked flag
- blocked reason when present

## Safety Boundaries

Phase 3 still does not:

- add provider-specific workflow rules
- expose organization-specific terminology or fields
- create embedded signing SDK behavior
- add cancellation/reminder workflow endpoints
- implement non-`ALL_REQUIRED` completion policies
- change certificate sealing behavior

It also does not add broad workflow controls to the UI. The team details page remains read-only and is intended for inspection of normalized routing state only.
