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
| `/dms-prototype/external-sign/:sessionId/verify` | External Signer Verification (OTP) |
| `/dms-prototype/signing/:requestId/participants/:participantId` | Signing Launch Wrapper |

## Demo Steps

1. Open `http://localhost:3000/dms-prototype`
2. See Authora DMS dashboard (no Documenso branding)
3. Click "Dossiers" in sidebar
4. Open "Clinical Study Report — v3"
5. Switch to Documents tab and open "Clinical Overview"
6. In File Workspace, switch to "eSignature" tab
7. Click "Create Signing Request" (requires Integration API)
8. Click "Send Request"
9. See participants with identity source badges:
   - **DMS User** (green) for internal signers
   - **External** (gray) for the External Consultant
10. Click "Launch Signing" for a DMS user to create a signing session
11. Click "Verify External Signer" to simulate OTP verification:
    - Enter `123456` (prototype OTP)
    - On success, mark verified
12. After verifying, launch the external signing session
13. Click "Refresh Status" to see evidence and audit
14. Switch to "Audit Trail" tab to see combined DMS + signing audit with identity source and verification status
15. Navigate to Admin to see prototype settings including signing configuration

## Architecture

- **DMS prototype routes** live at `apps/remix/app/routes/_authenticated+/dms-prototype+/`
- **Data** is dummy/local — no Prisma migrations
- **Signing** uses the **public Integration API V1 only** — no internal signing imports
- **Users** come from a DMS user directory, not the signing tool
- **External signers** are authenticated as recipient-scoped guests with email OTP

## DMS-Owned User Model

- **Identity Source**: DMS User Directory (`_users.ts`) for internal users; `EXTERNAL_RECIPIENT` for guests
- **Internal signers**: DMS-authenticated, pre-verified, can initiate signing
- **External signers**: Recipient-scoped guests, require OTP verification before signing, can only sign for their assigned participant

## Signing Flow

### Internal DMS User
1. DMS user is authenticated via prototype session
2. User clicks "Launch Signing" in the eSignature panel
3. DMS signing wrapper (`/dms-prototype/signing/:requestId/participants/:participantId`) checks participant identity
4. Integration API creates a REDIRECT-mode signing session
5. Auto-redirect or click-through to the signing page
6. No signing-tool signup/login required

### External Signer
1. DMS user or workflow assigns external participant (e.g. External Consultant)
2. External signer status starts as `PENDING`
3. DMS user clicks "Verify External Signer" in the eSignature panel
4. Opens OTP verification page at `/dms-prototype/external-sign/:sessionId/verify`
5. Signer enters prototype OTP `123456`
6. On success, `verificationStatus` becomes `VERIFIED`
7. DMS user can now click "Launch Signing" for this participant
8. Signing wrapper creates a session and redirects to signing page

## Audit Timeline Identity & Verification

Audit entries now include:
- **Identity source**: "DMS User Directory" or "External Recipient"
- **Verification method**: "Email OTP", "Passcode", "Magic Link", "DMS Session"
- **Verification status**: "Verified", "Pending Verification", "Failed", "Expired"
- **Events tracked**: `SIGNER_VERIFIED`, `SIGNER_VERIFICATION_FAILED`, `SIGNING_SESSION_CREATED`, `SIGNING_SESSION_FAILED`
- Email addresses are sanitized (domain replaced with `***`) in audit entries

## White-label Compliance

- No "Documenso" text in the DMS prototype UI
- No "Create Folder" action
- No signing-tool login/signup UI
- Uses Authora DMS branding throughout
- DMS vocabulary only in the DMS prototype area
- External verification page shows Authora DMS branding (no DMS sidebar)

## Admin Configuration (Prototype)

| Setting | Value |
|---|---|
| Identity Source | DMS User Directory |
| External Signer Verification | Email OTP |
| Signing Tool Login | Disabled for DMS Flow |
| Signup | Disabled for DMS Flow |
| Branding | Authora DMS |
| Folder Actions | Hidden in DMS Prototype |

## Limitations

- No real SharePoint/Office editor integration — buttons are placeholders
- No real DOCX/XLSX-to-PDF conversion — freeze is simulated with SHA-256
- Dummy data resets on server restart
- Admin settings are read-only prototype placeholders
- The native signing tool page may still show product branding during the signing session (requires enterprise white-label configuration to fully customize)
- OTP verification is simulated with deterministic code `123456`
- External signer flow is initiated from the DMS UI, not via email magic link
