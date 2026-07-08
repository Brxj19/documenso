# Integration API V1 Signing Requests

Phase 2 adds the first mutable workflow to the reusable signing-tool facade under the existing `INTEGRATION_API_V1_ENABLED` feature flag.

## Endpoints

- `POST /api/v1/integration/signing-requests`
- `GET /api/v1/integration/signing-requests/:requestId`
- `GET /t/:teamUrl/integration/signing-requests/:requestId`

## Contract Shape

The create route accepts a single PDF source document, a normalized participant list, and contiguous staged ordering:

- `externalReference`
- `title`
- `document`
  - `sourceReference`
  - `filename`
  - `mimeType`
  - required SHA-256 content hash
- `participants`
- `stages`
- optional `expiresAt`
- optional `idempotencyKey`
- optional correlation and safe metadata

The status route returns a normalized read model with:

- request status
- verified source-document hash
- native envelope/document references when safe
- staged participant mapping
- participant status summaries
- timestamps

## Source Document Rules

The facade only accepts a Documenso-managed source reference:

- `envelope_*`
- `document_*`
- `template_*`

Arbitrary URLs, raw storage keys, or direct filesystem paths are rejected.

The source must resolve to exactly one PDF-backed envelope item. The service reads the actual stored bytes, recomputes SHA-256 server-side, and rejects the request if the supplied hash does not match.

## Native Mapping

Phase 2 creates a new native draft document from the verified source bytes:

- the caller source document is never mutated in place
- actionable participants map to native recipients
- participants in the same stage share the same native signing order
- later stages map to higher native signing orders
- read-only participants are preserved outside staged signing order

## Safety Boundaries

Phase 2 intentionally does not:

- send the document
- send email
- create signing sessions
- create fields
- change existing Documenso signing behavior

The created native document remains a draft until an existing Documenso workflow acts on it later.

## Idempotency

When `idempotencyKey` is supplied, uniqueness is scoped to the authenticated team boundary.

- same key + same normalized payload returns the original request with `idempotentReplay: true`
- same key + different payload is rejected with a conflict response

The stored request fingerprint excludes the idempotency key itself so retries remain stable.
