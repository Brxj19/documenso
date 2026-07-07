# ADR-001: Fork and License

## Status

Accepted

## Context

The reusable signing tool starts from the Documenso Community Edition codebase,
which is AGPL-3.0 licensed and already contains the signing engine we intend to
reuse.

## Decision

Keep the project as a public fork, retain upstream license and attribution
notices, and add only additive fork notices and reusable-tool documentation in
Phase 0.

## Consequences

- Upstream notices remain intact.
- Future networked distribution must continue to respect AGPL obligations.
- Phase 0 avoids branding or relicensing changes.

## Alternatives Considered

- Starting from a new codebase
- Removing or replacing upstream attribution
- Treating Enterprise-only features as part of the baseline
