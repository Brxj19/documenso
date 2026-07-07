# Reusable Signing Tool

## Purpose

This fork is being prepared as a reusable, self-hosted signing capability that
can serve multiple caller applications through a generic API and signing-event
contract.

The first consumer will be MJN-DMS, but MJN-specific workflow, schema, and UI
logic do not belong in the shared core.

## Ownership Boundary

The reusable signing tool owns:

- signing requests and signer routing
- the signing experience
- signed artifacts
- signing evidence and audit history

Caller applications own:

- business workflow and approval rules
- document eligibility
- domain-specific metadata
- post-signing actions

## Phase 0 Status

Phase 0 establishes the fork baseline before feature work:

- upstream sync and attribution guardrails
- local-first development and certificate guidance
- product, architecture, and security boundaries for future phases

## Decisions

- [ADR-001: Fork and license posture](./decisions/ADR-001-fork-and-license.md)
- [ADR-002: Generic integration facade](./decisions/ADR-002-generic-integration-facade.md)
- [ADR-003: Local-first runtime](./decisions/ADR-003-local-first-runtime.md)
- [ADR-004: Single PDF MVP](./decisions/ADR-004-single-pdf-request-mvp.md)
