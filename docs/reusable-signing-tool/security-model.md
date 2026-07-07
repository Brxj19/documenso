# Security Model

## Certificate Material

- Development signing must use a development-only certificate.
- Private keys, `.p12` files, and certificate passwords must stay outside tracked
  source files.
- Local certificate material should live in a Git-ignored path with restrictive
  filesystem permissions.

## Git Secret Rules

Never commit:

- `.env` files or real credentials
- certificate private keys or passphrases
- database dumps
- local object-storage exports
- generated signed PDFs or mail data

## Integrity and Audit Expectations

- Later phases must record SHA-256 hashes for source PDFs before request
  creation.
- Later phases must record SHA-256 hashes for completed signed artifacts.
- Signing events and audit history should remain append-only.

## Callback and Webhook Expectations

- Future callback delivery must use authenticated endpoints and signed secrets.
- Retry handling must be idempotent.
- Internal identifiers should not leak through callback payloads unless they are
  intentionally normalized first.

## Development Network Posture

- Self-signed certificates are acceptable for local development only.
- Public tunnels are not part of the normal development setup.
- Local verification should prefer `localhost` endpoints plus the built-in health
  and certificate-status routes.
