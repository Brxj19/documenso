# ADR-003: Local-First Runtime

## Status

Accepted

## Context

GitHub hosts source code, not a runnable signing service. The fork must be
developed and verified in a real runtime with local dependencies.

## Decision

Treat the fork as a local-first and self-hosted runtime from the beginning,
using the repository-supported Docker and Remix workflows for development.

## Consequences

- Phase 0 documents real startup, dependency, and verification steps.
- Signing verification happens against a local runtime rather than a hypothetical
  hosted source repository.
- Secrets, artifacts, and certificate material stay operator-controlled.

## Alternatives Considered

- Treating GitHub as if it were the runtime
- Adding a hosted third-party signing dependency
- Deferring runtime verification until after feature work
