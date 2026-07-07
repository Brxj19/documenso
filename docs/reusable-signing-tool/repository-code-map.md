# Repository Code Map

This map documents the existing Documenso boundaries relevant to a future reusable signing-tool API and records the additive Phase 1 insertion point selected from the checked-out repository.

## Selected Phase 1 Boundary

- Package boundary: `packages/api/v1/integration/`
- Exact endpoint path: `/api/v1/integration/capabilities`
- Mount path source: `apps/remix/server/router.ts`
- Contract/runtime entrypoints:
  - `packages/api/v1/contract.ts`
  - `packages/api/v1/implementation.ts`
  - `packages/api/hono.ts`

Why this boundary:

- It is already the versioned REST surface for externally-oriented API access.
- It inherits the existing ts-rest contract, request/response validation, and API token auth patterns.
- It stays outside document mutation, recipient mutation, field mutation, signing, storage, audit-log persistence, and webhook execution modules.

## 1. Document creation and document persistence

- Relevant files:
  - `packages/lib/server-only/envelope/create-envelope.ts`
  - `packages/lib/server-only/document-data/create-document-data.ts`
  - `packages/lib/universal/upload/put-file.server.ts`
  - `packages/lib/universal/upload/get-file.server.ts`
  - `packages/api/v1/implementation.ts`
- Main exports:
  - `createEnvelope`
  - `createDocumentData`
  - `putPdfFileServerSide`
  - `putNormalizedPdfFileServerSide`
- Responsibility:
  - `createEnvelope` is the core server-side creation path for documents/templates and persists the envelope, recipients, items, fields, meta, and audit/webhook side effects.
  - `createDocumentData` persists document bytes/paths metadata in Prisma.
  - upload helpers normalize and store PDF payloads via the configured storage provider.
- Data flow:
  - API or UI entrypoints gather request data, create document data records, then call `createEnvelope`, which writes the envelope graph and optionally triggers document-created/template-created webhooks.
- Important types/schemas:
  - `CreateEnvelopeOptions`
  - Prisma `Envelope`, `DocumentData`, `DocumentMeta`
  - `DocumentDataType`, `EnvelopeType`
- Phase 1 insertion boundary:
  - Do not insert here. Phase 1 must stay above this layer and must not call `createEnvelope`.
- Must not couple/change:
  - Existing PDF normalization, ID generation, audit-log creation, webhook triggers, or organisation limit checks.

## 2. Recipient creation, recipient roles, and recipient signing order

- Relevant files:
  - `packages/lib/server-only/recipient/set-document-recipients.ts`
  - `packages/lib/server-only/recipient/create-envelope-recipients.ts`
  - `packages/lib/server-only/recipient/update-envelope-recipients.ts`
  - `packages/lib/server-only/recipient/get-recipients-for-document.ts`
  - `packages/prisma/schema.prisma`
- Main exports:
  - `setDocumentRecipients`
  - `createEnvelopeRecipients`
  - `updateEnvelopeRecipients`
- Responsibility:
  - These modules persist recipient state, role assignments, auth options, send/signing state, and audit-log diffs while enforcing mutability rules.
- Data flow:
  - Entrypoints resolve envelope access, validate roles/auth, upsert recipients, and write audit-log events inside Prisma transactions.
- Important types/schemas:
  - Prisma `Recipient`
  - `RecipientRole`
  - `SigningStatus`
  - `SendStatus`
  - `ZRecipientAuthOptionsSchema`
- Phase 1 insertion boundary:
  - Mirror role/order semantics in neutral schemas only; do not call these modules from the facade.
- Must not couple/change:
  - Recipient auth semantics, mutability rules, or audit-log diff behavior.

## 3. Signature-field placement and field persistence

- Relevant files:
  - `packages/lib/server-only/field/create-envelope-fields.ts`
  - `packages/lib/server-only/field/update-envelope-fields.ts`
  - `packages/lib/server-only/field/set-fields-for-document.ts`
  - `packages/lib/server-only/field/delete-document-field.ts`
  - `packages/lib/types/field-meta.ts`
- Main exports:
  - `createEnvelopeFields`
  - `updateEnvelopeFields`
  - `setFieldsForDocument`
  - `deleteDocumentField`
- Responsibility:
  - Persist recipient fields, field metadata, placement geometry, and field audit logs while blocking edits once recipients have interacted with a document.
- Data flow:
  - API/UI handlers resolve the envelope, validate recipient mutability and field metadata compatibility, then update Prisma `Field` rows and audit logs.
- Important types/schemas:
  - `TFieldMetaSchema`
  - `ZFieldMetaSchema`
  - Prisma `Field`, `FieldType`
- Phase 1 insertion boundary:
  - Reuse only as discovery context; Phase 1 must not create, update, or infer live fields.
- Must not couple/change:
  - Existing field geometry rules, recipient-interaction locks, or V1/V2 field rendering semantics.

## 4. Sending/signing lifecycle and completion handling

- Relevant files:
  - `packages/lib/server-only/document/send-document.ts`
  - `packages/lib/server-only/document/resend-document.ts`
  - `packages/lib/server-only/document/complete-document-with-token.ts`
  - `packages/lib/server-only/document/reject-document-with-token.ts`
  - `packages/lib/server-only/document/viewed-document.ts`
- Main exports:
  - `sendDocument`
  - `resendDocument`
  - `completeDocumentWithToken`
  - `rejectDocumentWithToken`
  - `viewedDocument`
- Responsibility:
  - Drive document state transitions from draft to pending/completed/rejected, validate recipient turn-taking and auth, and enqueue sealing/webhook work.
- Data flow:
  - Send paths validate recipients and fields, optionally inject form values, notify recipients, and enqueue `internal.seal-document` when appropriate.
  - Completion/rejection paths write recipient state, audit logs, webhooks, and sealing jobs.
- Important types/schemas:
  - `DocumentStatus`
  - `DocumentSigningOrder`
  - `SigningStatus`
  - `WebhookTriggerEvents`
- Phase 1 insertion boundary:
  - Stay above this lifecycle entirely. The Phase 1 endpoint must never call send/complete/reject/view modules.
- Must not couple/change:
  - Current recipient turn rules, auth checks, job triggers, or lifecycle state machine behavior.

## 5. Completion artifacts, final PDF generation, certificate application, and document state changes

- Relevant files:
  - `packages/lib/jobs/definitions/internal/seal-document.ts`
  - `packages/lib/jobs/definitions/internal/seal-document.handler.ts`
  - `packages/lib/server-only/pdf/generate-certificate-pdf.ts`
  - `packages/lib/server-only/pdf/generate-audit-log-pdf.ts`
  - `packages/signing/index.ts`
  - `packages/signing/transports/local.ts`
  - `packages/signing/transports/google-cloud.ts`
- Main exports:
  - `SEAL_DOCUMENT_JOB_DEFINITION`
  - `run` in `seal-document.handler.ts`
  - `generateCertificatePdf`
  - `generateAuditLogPdf`
  - `signPdf`
- Responsibility:
  - Seal completed documents, render certificate/audit attachments, apply rejection stamping when needed, and sign final PDFs using the configured transport.
- Data flow:
  - Completion enqueues `internal.seal-document`; the job reloads the envelope graph, generates derived PDFs, signs them, persists new document data, updates envelope status, and triggers completion/rejection webhooks.
- Important types/schemas:
  - `TSealDocumentJobDefinition`
  - `DocumentStatus`
  - `SigningStatus`
  - signing transport env/constants under `packages/lib/constants/app.ts`
- Phase 1 insertion boundary:
  - No direct dependency. Future provider adapters may eventually translate into this layer, but Phase 1 must remain read-only.
- Must not couple/change:
  - Sealing jobs, signing transports, certificate generation, or completed artifact lineage.

## 6. Audit trail and event recording

- Relevant files:
  - `packages/lib/utils/document-audit-logs.ts`
  - `packages/lib/server-only/document/find-document-audit-logs.ts`
  - `packages/lib/server-only/document/get-document-certificate-audit-logs.ts`
  - `apps/remix/app/routes/_internal+/[__htmltopdf]+/audit-log.tsx`
- Main exports:
  - `createDocumentAuditLogData`
  - `parseDocumentAuditLogData`
  - `findDocumentAuditLogs`
  - `getDocumentCertificateAuditLogs`
- Responsibility:
  - Build typed audit-log payloads, diff recipient/field/meta changes, and query filtered audit history for UI and certificate rendering.
- Data flow:
  - Mutating workflows call `createDocumentAuditLogData`; downstream readers parse and group persisted audit events for recent activity, printable audit logs, and certificate content.
- Important types/schemas:
  - `DOCUMENT_AUDIT_LOG_TYPE`
  - `ZDocumentAuditLogSchema`
  - `TDocumentAuditLog`
- Phase 1 insertion boundary:
  - Model future normalized integration events after this typing style, but do not write new audit events in Phase 1.
- Must not couple/change:
  - Existing audit-log persistence format, printable audit log behavior, or certificate audit filtering.

## 7. File storage and completed-document retrieval

- Relevant files:
  - `packages/lib/universal/upload/server-actions.ts`
  - `packages/lib/universal/upload/get-file.server.ts`
  - `packages/lib/universal/upload/put-file.server.ts`
  - `apps/remix/server/api/download/download.ts`
  - `apps/remix/server/api/files/files.ts`
- Main exports:
  - `getPresignPostUrl`
  - `getPresignGetUrl`
  - `getFileServerSide`
  - `putNormalizedPdfFileServerSide`
- Responsibility:
  - Abstract storage-provider reads/writes/presigned URLs and serve document or envelope-item downloads through authenticated Hono routes.
- Data flow:
  - Core workflows persist document bytes/keys through upload helpers; download routes resolve envelope/document access and return provider-backed file responses or presigned URLs.
- Important types/schemas:
  - `DocumentDataType`
  - `GetFileOptions`
  - Hono route schemas under `apps/remix/server/api/download/*.types.ts`
- Phase 1 insertion boundary:
  - Capability discovery only; no file upload/download behavior belongs in the Phase 1 facade.
- Must not couple/change:
  - Storage-provider selection, completed-download rules, or envelope-item file access behavior.

## 8. API authentication and authorization patterns

- Relevant files:
  - `packages/api/v1/middleware/authenticated.ts`
  - `packages/lib/server-only/public-api/get-api-token-by-token.ts`
  - `packages/lib/server-only/envelope/get-envelope-by-id.ts`
  - `packages/lib/server-only/team/get-team.ts`
- Main exports:
  - `authenticatedMiddleware`
  - `getApiTokenByToken`
  - `getEnvelopeWhereInput`
- Responsibility:
  - Authenticate V1 API token requests, derive audit metadata, enforce organisation API limits, and build access-safe Prisma queries for envelope reads.
- Data flow:
  - V1 contract handlers run through `authenticatedMiddleware`, which resolves the API token and passes a validated `user`, `team`, logger, and request metadata into the handler.
- Important types/schemas:
  - `ZAuthorizationHeadersSchema`
  - `ApiRequestMetadata`
  - `EnvelopeIdOptions`
- Phase 1 insertion boundary:
  - Use the same API token middleware and base headers. The Phase 1 endpoint follows this pattern rather than adding a parallel auth mechanism.
- Must not couple/change:
  - Token hashing/lookup logic, team access resolution, or envelope authorization query construction.

## 9. Existing API route conventions, request validation, response schemas, and error handling

- Relevant files:
  - `packages/api/v1/contract.ts`
  - `packages/api/v1/implementation.ts`
  - `packages/api/v1/schema.ts`
  - `packages/api/hono.ts`
  - `apps/remix/server/router.ts`
  - `packages/lib/errors/app-error.ts`
- Main exports:
  - `ApiContractV1`
  - `ApiContractV1Implementation`
  - `tsRestHonoApp`
  - `AppError`
- Responsibility:
  - Define the versioned V1 ts-rest contract, implement handlers, mount them under Remix/Hono, and convert errors into REST-safe status/body pairs.
- Data flow:
  - Requests enter Hono at `/api/v1`, pass through CORS/rate limits, hit ts-rest contract validation, then execute handlers or auth middleware responses.
- Important types/schemas:
  - `ZUnsuccessfulResponseSchema`
  - `ZAuthorizationHeadersSchema`
  - route-specific request/response Zod schemas in `packages/api/v1/schema.ts`
- Phase 1 insertion boundary:
  - This is the chosen insertion boundary. Additive integration discovery belongs here because it is versioned, validated, and already mounted.
- Must not couple/change:
  - Existing document/template V1 routes, global rate limits, or tRPC/V2 routing structure.

## 10. Existing webhook/event patterns

- Relevant files:
  - `packages/lib/server-only/webhooks/trigger/trigger-webhook.ts`
  - `packages/lib/server-only/webhooks/trigger/schema.ts`
  - `packages/lib/types/webhook-payload.ts`
  - `packages/lib/jobs/definitions/internal/execute-webhook.ts`
- Main exports:
  - `triggerWebhook`
  - `ZTriggerWebhookBodySchema`
  - `ZWebhookPayloadSchema`
  - `mapEnvelopeToWebhookDocumentPayload`
- Responsibility:
  - Resolve registered webhooks for an event, enqueue delivery jobs, and serialize envelope state into typed outbound payloads.
- Data flow:
  - Mutating document/template flows call `triggerWebhook`, which looks up matching subscriptions and enqueues `internal.execute-webhook` jobs with typed payload data.
- Important types/schemas:
  - `WebhookTriggerEvents`
  - `ZWebhookDocumentSchema`
  - `ZWebhookPayloadSchema`
- Phase 1 insertion boundary:
  - Mirror the typed-event approach for future integration normalization, but do not emit or translate webhooks in Phase 1.
- Must not couple/change:
  - Existing event names, webhook subscription lookup, or delivery job behavior.

## 11. Environment-variable parsing and feature-flag conventions

- Relevant files:
  - `packages/lib/utils/env.ts`
  - `packages/lib/constants/app.ts`
  - `packages/lib/constants/document-conversion.ts`
  - `packages/tsconfig/process-env.d.ts`
- Main exports:
  - `env`
  - `requireEnv`
  - flag helpers such as `IS_BILLING_ENABLED`, `IS_DOCUMENT_CONVERSION_ENABLED`
- Responsibility:
  - Centralize runtime env access and expose small boolean helpers or derived constants from `process.env`.
- Data flow:
  - server/client code reads env values through `env()` and wraps feature checks in helper functions under `packages/lib/constants/*`.
- Important types/schemas:
  - `ProcessEnv` declaration in `packages/tsconfig/process-env.d.ts`
- Phase 1 insertion boundary:
  - Follow this convention by adding `INTEGRATION_API_V1_ENABLED` to `ProcessEnv` and reading it via a helper in `packages/lib/constants/app.ts`.
- Must not couple/change:
  - Public env injection, unrelated feature flags, or private signing/storage env behavior.

## 12. Existing test conventions, runner, and route/config/schema patterns

- Relevant files:
  - `packages/lib/vitest.config.ts`
  - `packages/lib/**/*.test.ts`
  - `packages/app-tests/e2e/api/v1/document-sending.spec.ts`
  - `packages/app-tests/e2e/api/v1/test-unauthorized-api-access.spec.ts`
  - `packages/app-tests/e2e/api/v2/*.spec.ts`
- Main exports/tools:
  - Vitest for focused unit tests
  - Playwright for route/end-to-end API behavior
- Responsibility:
  - Vitest covers isolated utility/schema logic; Playwright covers public API behavior against a running app and seeded data.
- Data flow:
  - E2E tests seed users/documents/API tokens, hit live `/api/v1` or `/api/v2` endpoints, and assert behavior through HTTP responses and database state.
- Important types/schemas:
  - Playwright `request` fixtures
  - seed helpers under `@documenso/prisma/seed/*`
- Phase 1 insertion boundary:
  - Phase 1 can use focused Vitest tests for schema and feature-gate behavior, while leaving broader signing-flow verification to existing Playwright coverage.
- Must not couple/change:
  - Existing signing E2E coverage or seed helpers unless a later phase genuinely extends runtime behavior.

## Phase 1 Architecture Decision

- Correct extension point:
  - `packages/api/v1/integration/` is the best Phase 1 location because it is already the external REST boundary and can evolve into a provider-neutral facade without teaching document/signing core modules about external providers.
- API and validation fit:
  - The implementation follows the existing V1 ts-rest contract pattern in `packages/api/v1/contract.ts`, the existing auth pattern in `packages/api/v1/middleware/authenticated.ts`, and the repository-wide Zod validation approach.
- Additive safety:
  - The new endpoint is read-only, feature-gated by `INTEGRATION_API_V1_ENABLED`, and returns only health/capability data. It does not call `createEnvelope`, `sendDocument`, recipient/field mutation modules, storage writes, audit persistence, sealing jobs, or webhook execution.
