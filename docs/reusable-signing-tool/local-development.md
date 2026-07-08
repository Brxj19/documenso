# Local Development

All values and commands in this document are for local or test use only.

## Repository Discovery Snapshot

- Monorepo layout: `apps/` contains the main Remix app, docs site, and
  `openpage-api`; `packages/` contains signing, API, tRPC, Prisma, jobs, email,
  auth, and shared UI modules.
- Package manager: `npm@11.11.0` or newer via the committed `package-lock.json`.
- Node requirement: `node >=22.0.0`.
- Main commands: `npm run dev`, `npm run dx`, `npm run dx:up`,
  `npm run prisma:migrate-dev`, `npm run prisma:seed`, `npm run lint`,
  `npm run format`, `npm run build`, `npm run test:e2e`.
- Existing signing support: local `.p12` signing via `packages/signing` with a
  non-production fallback to `./example/cert.p12`. Phase 0 overrides that
  fallback with a Git-ignored development certificate path.
- Later-phase areas to reuse: `packages/signing`, `packages/trpc/server`,
  `packages/lib/jobs`, `packages/lib/server-only/webhooks`, and document
  certificate/audit download routes in `apps/remix/server/api/download`.

## Prerequisites

- Node.js 22 or newer
- npm 11.11.0 or newer
- Docker Desktop or Docker Engine with Compose support
- OpenSSL available on the host
- Free local ports: `3000`, `3005`, `54320`, `63790`, `9000`, `9001`, `9002`

## Environment Preparation

```bash
cp .env.example .env
npm ci
```

The default `.env.example` is sufficient for the baseline stack. Do not commit
the generated `.env`.

## Start Local Dependencies

```bash
npm run dx:up
npm run prisma:migrate-dev
npm run prisma:seed
```

The development Docker Compose file starts:

- PostgreSQL on `localhost:54320`
- Inbucket web UI on `localhost:9000`
- SMTP on `localhost:2500`
- MinIO console on `localhost:9001`
- MinIO S3 API on `localhost:9002`
- Redis on `localhost:63790`
- Gotenberg on `localhost:3005`

## Generate a Development Signing Certificate

The upstream repo documents OpenSSL commands but does not provide a local helper
script. Phase 0 adds one that writes only to ignored paths.

```bash
node scripts/generate-dev-signing-cert.mjs
```

The helper writes certificate material under:

```text
.local/reusable-signing-tool/certs/
```

Then add the suggested values to `.env`:

```text
NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH="/absolute/path/to/documenso/.local/reusable-signing-tool/certs/dev-signing-certificate.p12"
NEXT_PRIVATE_SIGNING_PASSPHRASE=""
```

This keeps local work off the tracked `./example/cert.p12` fallback.
Use an absolute path so the certificate resolves correctly whether the app is
started from the repo root or a workspace directory.

## Start the Application

```bash
npm run dev
```

Expected local endpoints:

- App: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- Certificate status: `http://localhost:3000/api/certificate-status`
- Integration API V1 capabilities when enabled: `http://localhost:3000/api/v1/integration/capabilities`
- Inbucket: `http://localhost:9000`
- MinIO console: `http://localhost:9001`

## Enable the Phase 1 Integration Facade

Phase 1 adds a read-only, feature-gated integration discovery endpoint. It does
not create documents, recipients, fields, signing sessions, artifacts, audit
logs, or webhooks, and it does not change existing Documenso signing behavior.

To enable it locally, add this to `.env`:

```text
INTEGRATION_API_V1_ENABLED="true"
```

The endpoint lives on the existing authenticated V1 API surface and therefore
uses the same API token auth pattern as other `/api/v1/*` routes:

```text
GET /api/v1/integration/capabilities
```

When the flag is absent or set to anything other than `"true"`, the endpoint
returns a not-found style response and exposes no capabilities.

## Enable Phase 5 Evidence And Callbacks Locally

Phase 5 keeps the facade behind the same feature flag and adds:

- redirect return URL allowlisting
- callback URL allowlisting
- callback signing
- reconciliation and callback-processing commands

Add this to `.env` for local verification:

```text
INTEGRATION_API_V1_ENABLED="true"
INTEGRATION_API_V1_RETURN_URL_ALLOWLIST="http://localhost:3000,http://127.0.0.1:3000"
INTEGRATION_API_V1_CALLBACK_URL_ALLOWLIST="http://localhost:3000,http://127.0.0.1:3000"
INTEGRATION_API_V1_CALLBACK_SIGNING_SECRET="local-only-integration-secret"
INTEGRATION_API_V1_CALLBACK_TIMEOUT_MS="10000"
INTEGRATION_API_V1_CALLBACK_MAX_ATTEMPTS="5"
INTEGRATION_API_V1_CALLBACK_RETRY_DELAY_MS="1000"
```

That allows local consumers to request redirect sessions and return safely to a
same-machine callback page after signing completes while also allowing local
callback targets for Phase 5 outbox delivery.

## Reconciliation And Callback Processing

Rebuild normalized Phase 5 evidence from native Documenso state:

```bash
npm run integration:reconcile
```

Dry-run the same reconciliation without mutating state:

```bash
npm run integration:reconcile -- --dry-run
```

Process due callback deliveries from the Phase 5 outbox:

```bash
npm run integration:callbacks
```

The local app still uses the existing background-job system. When the app is
running with the local job provider, that remains the supported runtime for
native Documenso jobs. The new callback command is the safest way to
demonstrate retry behavior on demand.

## Baseline Signing Verification

Create a harmless local PDF outside tracked source folders before any manual
signing test:

```text
.local/reusable-signing-tool/test-pdfs/
```

Prefer an existing automated signing check when available:

```bash
E2E_TEST_PATH=packages/app-tests/e2e/features/include-document-certificate.spec.ts \
npm run test:e2e -w @documenso/app-tests
```

Phase 0 baseline verification in this environment used the already-running app
plus the direct Playwright command below and completed successfully:

```bash
npm run with:env -- \
  npm run test:dev -w @documenso/app-tests -- \
  packages/app-tests/e2e/features/include-document-certificate.spec.ts \
  -g "individual document should always include signing certificate"
```

For a manual baseline, upload the local test PDF, send it through the untouched
signing flow, complete signing, and save any downloaded signed artifacts under:

```text
.local/reusable-signing-tool/signed-artifacts/
```

## Integrity Verification

Phase 5 adds a focused integrity test around captured signed-PDF SHA-256
evidence. Run it alongside the integration evidence tests:

```bash
npm run with:env -- \
  npx vitest run packages/api/v1/integration/evidence.test.ts
```

## Cleanup

```bash
npm run dx:down
```

Stop the Remix dev server separately when finished.

## Troubleshooting

- If Docker services do not start, confirm Docker Desktop is running before
  `npm run dx:up`.
- `docker compose ps` may show the Postgres container as `unhealthy` because the
  development compose health check references `${POSTGRES_USER}` even though the
  service environment sets `POSTGRES_USER=documenso`. In Phase 0 verification,
  `pg_isready` and direct SQL probes still succeeded.
- If signing fails, check `http://localhost:3000/api/certificate-status`.
- If the app starts without the local cert env vars, it may fall back to
  `./example/cert.p12` in non-production; keep the explicit local path in `.env`
  to avoid that.
- If `npm run dev` fails on a managed macOS host with a Turbo TLS/keychain error
  or `react-router dev` fails with `EMFILE`, verify the untouched runtime via
  `npm run build -w @documenso/remix` followed by
  `npm run start -w @documenso/remix`.

## Phase 0 Verification Snapshot

Verified commands and outcomes:

- `npm ci` completed successfully.
- `npm run dx:up` completed successfully after Docker Desktop was started.
- `npm run prisma:generate` completed successfully.
- `npm run prisma:migrate-dev` applied the full migration set and synchronized
  the schema. A post-migration generator cleanup error appeared under Node
  `v26.0.0`, but the database reached the expected migrated state.
- `npm run prisma:seed` completed successfully.
- `node scripts/generate-dev-signing-cert.mjs --force` generated a local
  development certificate in the ignored `.local/reusable-signing-tool/certs/`
  directory.
- `npm run build -w @documenso/remix` completed successfully.
- `npm run start -w @documenso/remix` started successfully once the process was
  allowed to bind `localhost:3000`.
- `curl http://127.0.0.1:3000/api/health` returned `status: ok`.
- `curl http://127.0.0.1:3000/api/certificate-status` returned
  `isAvailable: true`.
- Local endpoints confirmed reachable:
  `3000` app, `3005` Gotenberg, `9000` Inbucket, `9001` MinIO console,
  `9002` MinIO API, `54320` Postgres, `63790` Redis.
- The existing signing baseline test
  `packages/app-tests/e2e/features/include-document-certificate.spec.ts`
  passed for `individual document should always include signing certificate`.
