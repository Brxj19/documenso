# ADR-004: Single PDF Request MVP

## Status

Accepted

## Context

The first reusable version needs a small, auditable boundary that callers can
adopt without mixing signing concerns with document authoring or package
assembly.

## Decision

Use one immutable finalized PDF per signing request for the MVP.

## Consequences

- Callers must freeze the PDF and bind it to a source hash before request
  creation.
- Multi-document merge and package orchestration stay out of scope for v1.
- Evidence and artifact retrieval remain simpler to reason about.

## Alternatives Considered

- Multi-document request support in the MVP
- Mutable source files after request creation
- Folding authoring and signing into one shared workflow
