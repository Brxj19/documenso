# Authora DMS — Local Demo

Authora DMS is a white-label Document Management System prototype built inside Documenso.

It demonstrates how a DMS can use the reusable Integration API V1 signing tool as an internal module without exposing Documenso branding, Create Folder actions, or signing-tool signup flows.

## Prerequisites

- Local Documenso stack running (`npm run dev`)
- Integration API V1 enabled:
  ```
  INTEGRATION_API_V1_ENABLED=true
  INTEGRATION_API_V1_RETURN_URL_ALLOWLIST=http://localhost:3000,http://127.0.0.1:3000
  INTEGRATION_API_V1_CALLBACK_SIGNING_SECRET=<local-only-secret>
  INTEGRATION_API_V1_CALLBACK_URL_ALLOWLIST=http://localhost:3000,http://127.0.0.1:3000
  ```
- A valid Integration API token:
  ```
  INTEGRATION_API_V1_TOKEN=api_<your-token>
  ```
- A source envelope created (Phase 8 setup):
  ```
  MJN_SOURCE_REFERENCE=envelope_<id>
  ```

## Routes

| Route | Page |
|---|---|
| `/dms-prototype` | Dashboard |
| `/dms-prototype/dossiers` | Dossier List |
| `/dms-prototype/dossiers/:dossierId` | Dossier Detail |
| `/dms-prototype/files` | File Workspace |
| `/dms-prototype/files/:fileId` | File Detail + eSignature + Audit |
| `/dms-prototype/review` | Review & Approval |
| `/dms-prototype/esignature` | eSignature Overview |
| `/dms-prototype/admin` | Admin Settings |

## Demo Steps

1. Open `http://localhost:3000/dms-prototype`
2. See Authora DMS dashboard (no Documenso branding)
3. Click "Dossiers" in sidebar
4. Open "Clinical Study Report — v3"
5. Switch to Documents tab and open "Clinical Overview"
6. In File Workspace, switch to "eSignature" tab
7. Click "Create Signing Request" (requires Integration API)
8. Click "Send Request"
9. Click "Launch Signing" to get signing session URL
10. Click "Refresh Status" to see evidence and audit
11. Switch to "Audit Trail" tab to see combined DMS + signing audit
12. Navigate to Admin to see prototype settings

## Architecture

- **DMS prototype routes** live at `apps/remix/app/routes/_authenticated+/dms-prototype+/`
- **Data** is dummy/local — no Prisma migrations
- **Signing** uses the **public Integration API V1 only** — no internal signing imports
- **Users** come from a DMS user directory, not the signing tool
- **External signers** are authenticated as recipient-scoped guests with email OTP

## White-label Compliance

- No "Documenso" text in the DMS prototype UI
- No "Create Folder" action
- No signing-tool login/signup UI
- Uses Authora DMS branding throughout
- DMS vocabulary only in the DMS prototype area

## Limitations

- No real SharePoint/Office editor integration — buttons are placeholders
- No real DOCX/XLSX-to-PDF conversion — freeze is simulated with SHA-256
- Dummy data resets on server restart
- Admin settings are read-only prototype placeholders
- The native Documenso signer experience may still show during signing session launch
