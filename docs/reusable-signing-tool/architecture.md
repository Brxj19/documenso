# Architecture

## Local-First Boundary

GitHub stores source history for the fork, but it is not the runtime. A local or
private deployment is required to execute signing requests, persist state, store
artifacts, and deliver callbacks.

This fork is the first signing tool implementation. It is not a wrapper around a
paid third-party provider.

Future phases should add a thin generic integration facade while continuing to
reuse the existing Documenso signing engine, recipient workflow, audit
generation, and artifact handling.

## Current Foundation

Relevant upstream modules already in place:

- `apps/remix` for the main UI, Hono server, internal routes, and health checks
- `packages/trpc/server/document-router`, `envelope-router`, `recipient-router`,
  and `webhook-router` for API surfaces
- `packages/signing` for local `.p12` and Google Cloud HSM signing transports
- `packages/lib/jobs/definitions/internal/seal-document.handler.ts` for final
  document sealing, certificate generation, and audit-log output
- `packages/lib/server-only/webhooks` for webhook execution
- `packages/lib/server-only/cert/cert-status.ts` for certificate diagnostics

## Future Integration Shape

```text
Generic consumer application
        |
        | normalized API + callbacks
        v
Reusable signing tool fork
        |
        | thin integration facade
        v
Documenso signing engine and domain logic
        |
        +-- PostgreSQL
        +-- object storage
        +-- local mail/inbox
        +-- signing certificate material
```

The future public contract must not expose raw internal Documenso IDs, route
shapes, or status names directly. Consumer-facing request IDs and normalized
statuses should remain stable even if internals evolve.
