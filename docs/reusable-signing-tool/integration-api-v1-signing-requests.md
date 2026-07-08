# Integration API V1 Signing Requests

Phase 4 extends the reusable signing-tool facade under
`INTEGRATION_API_V1_ENABLED` with recipient-scoped signing sessions that launch
the existing Documenso signer through a thin redirect wrapper.

## Endpoints

- `GET /api/v1/integration/capabilities`
- `POST /api/v1/integration/signing-requests`
- `POST /api/v1/integration/signing-requests/:requestId/send`
- `GET /api/v1/integration/signing-requests/:requestId`
- `POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/signing-session`
- `GET /sign/integration/:sessionId`
- `GET /sign/integration/:sessionId/complete`
- `GET /t/:teamUrl/integration/signing-requests/:requestId`

## Chosen Launch Model

Phase 4 does not build a new signer UI.

Instead it uses:

- an integration-owned signing session row
- a public launch wrapper URL
- the existing native recipient route at `/sign/:token`
- a public completion wrapper URL

The API never returns a raw native recipient token. The caller receives a
launch URL like `/sign/integration/:sessionId`, and the wrapper validates:

- feature-flag availability
- session expiry
- participant-to-recipient scope
- active request eligibility
- safe completion return behavior

After that validation, the wrapper redirects to the existing Documenso signer.

## Signing Session Endpoint

`POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/signing-session`

Request body:

- `mode`
  - `REDIRECT` is supported
  - `EMBED` is rejected in Phase 4
- optional `returnUrl`
- optional `clientState`
- optional `ttlSeconds`

Response fields:

- `sessionId`
- `requestId`
- `participantId`
- `mode`
- `expiresAt`
- `launchUrl`
- accepted `returnUrl`
- echoed `clientState`
- normalized `participantStatus`
- normalized `requestStatus`
- `embeddedSupported`

## Redirect Flow

The supported Phase 4 consumer flow is:

1. Create a signing request.
2. Activate it with `send`.
3. Create a participant-specific signing session.
4. Redirect the browser to the returned `launchUrl`.
5. The wrapper validates the session and redirects into the native signer.
6. The signer completes in the existing Documenso signing screen.
7. Completion returns through `/sign/integration/:sessionId/complete`.
8. The completion wrapper redirects to the accepted safe `returnUrl`, or falls
   back to the native completion page when no `returnUrl` was stored.

The completion redirect appends only minimal safe query params:

- `requestId`
- `participantId`
- `status`
- `clientState` when provided

## Eligibility Rules

Phase 4 session creation rejects requests when:

- the feature flag is disabled
- the request is unknown or outside the caller team scope
- the participant is unknown or outside the request
- the request has not been activated
- the request is already terminal
- the participant is blocked by an earlier stage
- the participant is already completed, rejected, cancelled, expired, or failed
- the participant lacks a native actionable recipient mapping
- the `returnUrl` is unsafe or not allowlisted
- the requested mode is unsupported

Unknown or inaccessible request and participant combinations are returned as
not-found style responses to avoid leaking scope.

## Session Expiry

Phase 4 adds persisted integration signing sessions with:

- `sessionId`
- request reference
- participant reference
- native recipient reference
- mode
- optional `returnUrl`
- optional `clientState`
- `expiresAt`
- `launchedAt`
- `completedAt`

Behavior:

- default TTL is 15 minutes
- maximum TTL is 60 minutes
- expired sessions cannot launch
- expired sessions are also blocked at completion-time mutation validation
- raw document bytes and recipient secrets are not stored in the session row

Because the native recipient token model remains the underlying signer transport,
Phase 4 enforces expiry at the integration wrapper layer instead of replacing
the existing token format.

## Return URL Allowlist

Phase 4 adds:

- `INTEGRATION_API_V1_RETURN_URL_ALLOWLIST`

This is a comma-separated allowlist of absolute `http` or `https` values.

Supported patterns:

- exact origins such as `http://localhost:3000`
- exact URLs such as `http://localhost:3000/integration/return`

Rejected values include:

- non-absolute URLs
- malformed URLs
- non-HTTP schemes
- `javascript:` or `data:` URLs
- protocol-relative URLs
- unknown origins or URLs

An empty allowlist means caller-supplied `returnUrl` values are rejected.

## Embedded Signing Status

Phase 4 does not expose embedded signing for the integration facade.

Capabilities report:

- redirect signing supported: `true`
- embedded signing supported: `false`
- supported signing modes: `['REDIRECT']`

This keeps the Phase 4 surface aligned with the safest Community Edition path:
redirect into the existing signer.

## Participant Identity and Scope

Each integration signing session maps:

- one integration request
- one integration participant
- one native Documenso recipient

The wrapper only launches the native signer for that recipient token, and the
completion mutation validates the optional `integrationSessionId` against the
recipient token before the document can be completed.

This preserves the native recipient-token model while preventing a session from
being used to complete a different participant.

## Native Signer Behavior

Phase 4 continues to reuse the existing signer for:

- PDF rendering
- required-field handling
- sign intent
- recipient access auth
- recipient status transitions
- document completion
- certificate-backed finalization

No Phase 4 field-placement system was added. Integration-created requests can
still complete without fields when the native signer permits it.

## Capabilities

`GET /api/v1/integration/capabilities` now reports:

- `releasePhase: PHASE_4_SIGNING_SESSIONS`
- `supportedSigningModes: ['REDIRECT']`
- `redirectSigningSupported: true`
- `embeddedSigningSupported: false`
- `sessionExpirySupported: true`
- `returnUrlAllowlistSupported: true`
- `callbackEventsSupported: false`

Phase 4 does not add a new callback delivery framework. Consumers should rely
on the normalized status endpoint and, when configured, the safe completion
return URL.

## Minimal Example

Example backend flow:

1. `POST /api/v1/integration/signing-requests`
2. `POST /api/v1/integration/signing-requests/:requestId/send`
3. `POST /api/v1/integration/signing-requests/:requestId/participants/:participantId/signing-session`
4. Redirect the browser to `launchUrl`
5. After return, call `GET /api/v1/integration/signing-requests/:requestId`

Example generic references:

- title: `Contract Review`
- participants: `Signer One`, `Signer Two`
- external reference: `EXT-EXAMPLE-001`

## Out of Scope

Phase 4 still does not add:

- provider abstraction beyond Documenso
- embedded signing SDK behavior
- arbitrary open redirects
- document-owner signing URLs
- reminder workflows
- bulk signing
- external provider integrations
- a new callback delivery framework
- domain-specific UI or vocabulary

The internal team request-details page remains read-only. The documentation is
the supported example surface for launching sessions in this phase.
