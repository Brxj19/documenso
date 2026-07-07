# ADR-002: Generic Integration Facade

## Status

Accepted

## Context

Future consumers need a stable, generic signing contract, while the fork already
has working document, recipient, signing, and audit logic.

## Decision

Add a thin generic integration facade over the existing Documenso signing engine
instead of building a second signing implementation.

## Consequences

- The fork keeps one source of truth for signing state.
- Future API normalization work can stay additive.
- Internal Documenso IDs and raw statuses should remain behind the facade.

## Alternatives Considered

- A second in-repo signing engine
- A separate microservice in Phase 0
- Direct exposure of raw Documenso internals to consumers
