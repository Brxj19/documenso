# MJN-DMS Integration Adapter

Proof-of-concept adapter demonstrating how MJN-DMS (a regulatory document management
system) can integrate with Documenso's public Integration API V1 for electronic signing.

## Design Constraint

**No MJN-specific code touches the generic tool core.** All MJN vocabulary, workflow
logic, and domain types live exclusively in this directory.

## Architecture

```
examples/mjn-dms-adapter/
├── src/
│   ├── types.ts            MJN-DMS domain types (file, signing, audit, workflow)
│   ├── client.ts           HTTP client wrapping the public Integration API V1
│   ├── workflow-mapper.ts  Maps MJN workflow configs to signing request payloads
│   ├── pdf-freeze.ts       Simulates freezing an approved MJN file to PDF (SHA-256)
│   ├── audit-timeline.ts   Builds MJN-DMS audit entries from Integration API evidence
│   └── demo.ts             Full POC entry point exercising the complete flow
└── tests/
    └── adapter.test.ts     Tests for the adapter
```

## Flow

1. **Freeze** — MJN-DMS approves a file → freezes to PDF with SHA-256 hash
2. **Map** — MJN workflow config is mapped to a signing request payload
3. **Create** — Signing request created via POST `/api/v1/integration/signing-requests`
4. **Send** — Request sent/activated via POST `/api/v1/integration/signing-requests/:id/send`
5. **Session** — Signing sessions created for participants
6. **Evidence** — Evidence retrieved from `/api/v1/integration/signing-requests/:id/evidence`
7. **Timeline** — MJN-DMS audit timeline built from evidence events/artifacts

## Regulatory Hybrid Route

Stage 1: Regulatory Author (sequential)
Stage 2: Medical + Quality Reviewers (parallel)
Stage 3: Regional Regulatory Lead (sequential)

## Running

```bash
# Set environment
export MJN_API_TOKEN=your-token
export MJN_BASE_URL=http://localhost:3000

# Run the demo
npx tsx examples/mjn-dms-adapter/src/demo.ts

# Run tests
npx vitest run examples/mjn-dms-adapter/tests/
```

## Production Considerations

- The POC simulates PDF-freezing from a fixture. Production should convert via
  LibreOffice or Gotenberg and store the frozen PDF in Documenso's upload storage.
- The POC uses `envelope_*` as the source reference. Production should create
  the source document via Documenso's document upload API before calling the
  Integration API V1.
- Idempotency keys should be deterministic in production to allow safe retries.
