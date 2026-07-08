# MJN-DMS Signing Requirements Extract

> **Purpose:** This is a focused requirements extract for the reusable eSignature tool. It is derived from the MJN-DMS PRD and includes only the requirements that affect signing, approval evidence, final PDF generation, submission readiness, and auditability.
>
> **Use:** Provide this document to Codex as contextual input when working on reusable signing-tool phases. It is not a replacement for the full MJN-DMS PRD.
>
> **Confidentiality note:** Keep this document in the MJN-DMS project context or provide it directly in prompts. Do not place it in a public reusable-tool repository unless that repository is approved for internal MJN requirements.

---

## 1. Product Context

MJN-DMS is a Regulatory Document Lifecycle Management system for creating, managing, reviewing, approving, signing, submitting, retaining, and archiving regulatory documents and dossiers.

The reusable signing tool is **not** intended to own the whole document-management lifecycle. It is a specialized signing capability that an application such as MJN-DMS can call after the parent application has determined that a file or dossier is ready for signing.

### Parent system responsibilities

The parent application remains responsible for:

- Dossier and folder lifecycle.
- Document creation, templates, metadata, classification, and related-document links.
- User accounts, roles, permissions, and authorization.
- Business approval workflow eligibility.
- File versioning and revision management.
- Retention, archive, deletion, and legal-hold policies.
- Watermark policy and PDF conversion policy.
- Regulatory submission decision and downstream correspondence.

### Signing tool responsibilities

The reusable signing tool should be responsible for:

- Creating and tracking signing requests.
- Supporting multiple participants and signing stages.
- Providing signer-facing signing sessions or embedded signing experiences.
- Capturing signing progress, final status, rejections, expirations, cancellations, and failures.
- Returning final signed artifacts and signing evidence to the parent application.
- Preserving provider-neutral status and event data.
- Producing or retaining tamper-evident signing evidence where the selected signing engine supports it.

---

## 2. Core Business Requirement

A dossier can be submitted only after all required documents in the dossier have been successfully approved.

The final submission process may require an electronic signature to be applied to submitted files. The PRD explicitly states that the Author can enable or disable eSignature during dossier submission and, when enabled, the Author's electronic signature is applied to submitted files.

However, the wider approval model supports multiple approvers and the reusable signing tool must be designed to support a future policy in which one or more required participants sign the final PDF artifact.

### Key distinction

- **Workflow approval:** A user reviews a file and approves, rejects, or requests revision inside the parent DMS workflow.
- **Signing:** A user performs an explicit signing action against a frozen PDF rendition, producing a signing event and evidence.

Not every workflow approver must necessarily be a final PDF signer. The parent system decides which workflow roles require only approval and which require a signer action.

---

## 3. Signing Eligibility Rules

Before a parent application creates a signing request, it must validate that the document or dossier is eligible.

For MJN-DMS, eligibility should include at least:

- The file is the latest approved version.
- All mandatory metadata is complete.
- All required review and approval steps are complete.
- The file is not in Draft, Revision in Progress, Rejected, Cancelled, Archived, Deleted, or otherwise ineligible state.
- The file is not currently under a conflicting edit lock.
- The final source artifact has been converted into the PDF rendition intended for signing.
- The parent system has frozen the version used for signing.
- The signing participants, their roles, and required order are known.
- A signing intent/meaning is supplied, such as `Approved for submission`.

The signing tool should not infer business eligibility on its own. It should accept a parent-system request only after eligibility is evaluated by that system.

---

## 4. Signing Request Model

The reusable tool must support a signing request that represents one frozen document/PDF artifact in the MVP.

Each request should support:

- A parent-system external reference.
- A human-readable title.
- A document reference and filename.
- MIME type.
- Source and/or signing-input content hash.
- File version reference.
- Signing intent or meaning.
- Parent-system correlation ID.
- Optional callback metadata.
- Expiration date/time.
- Participant list.
- Stage/order configuration.
- Provider-specific reference stored internally by the signing tool, not required from the parent caller.

### MVP document scope

For the first reusable-tool MVP:

- **One signing request = one PDF artifact.**
- A dossier containing multiple files creates one signing request per file.
- Each request has independent signer status, evidence, rejection handling, and completed artifact retrieval.

A future phase may introduce a combined submission-package signing request, but only after the single-PDF flow is stable.

---

## 5. Participant and Role Requirements

The signing tool must support multiple participants.

At minimum, the normalized participant model should support:

| Generic participant role | Intended use |
|---|---|
| `SIGNER` | Must complete an explicit signing action. |
| `APPROVER` | May provide formal approval without necessarily becoming a final PDF signer, subject to parent policy. |
| `VIEWER` | Can access/review the artifact without signing. |
| `CC` | Receives notification/copy but takes no action. |

The parent application can map its own roles to these generic roles. Example parent roles may include Author, Medical Reviewer, Quality Reviewer, Regional Lead, or Final Approver, but those labels must not be hard-coded into the reusable tool.

For each participant, the parent integration should be able to provide:

- Stable external user/participant identifier where available.
- Display name.
- Email address where needed by the signing engine.
- Parent-system role label for audit display.
- Generic signing-tool role.
- Stage/order.
- Required/optional status where supported.

---

## 6. Sequential, Parallel, and Hybrid Signing

The tool must support staged signing flows.

### Sequential flow

A later participant receives signing access only after all required participants in earlier stages complete successfully.

Example:

```text
Stage 1: Author
Stage 2: Quality Reviewer
Stage 3: Final Lead
```

### Parallel flow

Multiple participants in the same stage may sign independently and concurrently.

Example:

```text
Stage 1: Medical Reviewer + Quality Reviewer
```

### Hybrid flow

The tool must support a mixture of sequential stages and parallel participants within stages.

Example:

```text
Stage 1: Author
Stage 2: Medical Reviewer + Quality Reviewer
Stage 3: Final Lead
```

### Completion rule

A signing request becomes complete only when all required signers in all required stages have completed the signing action.

The parent application may decide whether approval-only participants are part of signing completion or tracked separately in its own workflow.

---

## 7. Signer Identity and Intent

A signature must be connected to a signer identity and an explicit intent to sign.

For internal MJN users, the desired future model is:

```text
Parent application authenticates user through enterprise identity / SSO
    ↓
Parent system verifies user role and eligibility to sign
    ↓
Signing tool creates a recipient-specific signing session
    ↓
Signer reviews the frozen PDF and explicitly confirms signing
    ↓
Signing event and resulting evidence are returned to parent system
```

### Minimum evidence for every signing event

Capture at least:

- Signing request ID.
- Parent external reference.
- Document reference and version.
- Input/frozen PDF hash.
- Final signed PDF hash when completed.
- Signer identifier.
- Signer display name.
- Parent-system role label where supplied.
- Generic participant role.
- Sign intent/meaning.
- UTC timestamp.
- Signing stage/order.
- Event/result status.
- Provider/envelope/recipient correlation references where applicable.
- Audit/event correlation ID.

Where available from the signing engine, also preserve:

- IP address.
- Device/browser context.
- Authentication method.
- Certificate fingerprint.
- Trusted timestamp reference.
- Evidence package/completion certificate reference.

The signing tool must never treat a handwritten image alone as sufficient evidence of identity or intent.

---

## 8. Final PDF and Tamper Evidence

The desired production outcome is a final PDF artifact that is tamper-evident and preserves signing evidence.

### Required behavior

- The PDF submitted for signing must be frozen and immutable for the active signing cycle.
- The final signed PDF must be stored as a separate completed artifact.
- The final signed PDF must not overwrite the editable working document.
- The parent system must be able to retrieve the completed signed PDF and evidence later.
- The final output hash must be recorded.
- The signed artifact must be linked to the exact source file/version that was signed.
- Any material change requires creation of a new version and a new signing request.

### Signature appearance

A visible signature panel may be included for human readability. It should contain only information that is safe and relevant, such as:

```text
Electronically Signed
Signer: [Name]
Role: [Parent Role]
Document Version: [Version]
Signed At: [Timestamp]
Signing Reference: [Reference]
```

The visible panel is not sufficient by itself. The source of trust is the signing evidence, document binding/hash, audit trail, and, where supported, the cryptographic signature/certificate.

---

## 9. Rejection, Revision, Cancellation, and Expiry

### Rejection

When a signer rejects a signing request:

- The tool must record the rejection action, actor, timestamp, reason/comment where provided, and related request/document references.
- The request must transition to a terminal rejected state.
- The parent application must be able to detect the rejection through status retrieval and/or callback event.
- The parent application owns the decision to return the file to `Revision in Progress` and restart its approval workflow.
- A revised file must create a new file version and a new signing request. A rejected signing request must not be reused for materially changed content.

### Cancellation / voiding

The parent application must be able to cancel an in-progress signing request when allowed by business policy. The tool should preserve a cancellation audit event and terminal status.

### Expiry

A request may expire if required signers do not act before the configured deadline. The tool must record expiry and expose it to the parent application.

### Failure

Provider, storage, conversion, certificate, or integration failures must result in a clear failed status with a correlation ID. The parent application must not mark the document/dossier as signed or submitted when signing completion has failed.

---

## 10. Normalized Status Model

The reusable tool should expose provider-neutral statuses. The expected minimum model is:

| Status | Meaning |
|---|---|
| `DRAFT` | Request exists but has not been released to participants. |
| `READY` | Request is valid and ready to start/send. |
| `IN_PROGRESS` | At least one active signing step is underway. |
| `PARTIALLY_COMPLETED` | One or more required signers completed, but the request is not finished. |
| `COMPLETED` | All required signing actions completed and final output/evidence is available. |
| `REJECTED` | A required participant rejected the request. |
| `EXPIRED` | The request expired before successful completion. |
| `CANCELLED` | The request was intentionally cancelled/voided. |
| `FAILED` | A technical or provider failure prevented successful processing. |

The integration must not expose raw provider statuses as the parent system's primary contract. Provider details can be retained as metadata for debugging and audit.

---

## 11. Normalized Event Model

The tool should emit or make available provider-neutral events that the parent system can use to update its own audit timeline.

Expected event categories include:

- `REQUEST_CREATED`
- `REQUEST_READY`
- `REQUEST_STARTED`
- `PARTICIPANT_NOTIFIED`
- `PARTICIPANT_VIEWED`
- `PARTICIPANT_SIGNED`
- `PARTICIPANT_APPROVED`
- `PARTICIPANT_REJECTED`
- `REQUEST_COMPLETED`
- `REQUEST_EXPIRED`
- `REQUEST_CANCELLED`
- `REQUEST_FAILED`
- `ARTIFACT_AVAILABLE`

Every event should include:

- Event ID.
- Signing request ID.
- Event type.
- UTC timestamp.
- Parent external reference.
- Provider correlation reference where applicable.
- Actor/participant reference where applicable.
- Prior and new normalized status where applicable.
- Correlation ID.
- Safe structured metadata.

Do not include private keys, secrets, raw document bytes, unrestricted provider payloads, or sensitive values that are not required for audit or troubleshooting.

---

## 12. Parent-System Callbacks and Synchronization

The signing tool should provide a reliable way for a parent system to learn that signing state changed.

Possible mechanisms:

- Polling/status retrieval API.
- Outbound signed callback/webhook.
- Event retrieval API.
- Parent-controlled reconciliation job.

### Reliability rules

- Callbacks/webhooks must be authenticated and verified.
- Event handling must be idempotent.
- A webhook alone must not be the sole source of truth.
- The parent application should reconcile request state through a status API when an event is received or when delivery is uncertain.
- Correlation IDs must connect parent workflow records, signing-tool request records, and provider records.

---

## 13. Security and Compliance Expectations

The reusable signing tool must support the following design expectations:

- No API secrets, private keys, signing certificate passwords, or provider tokens in browser code.
- No source document or final artifact overwrite during a signed cycle.
- Role/authorization checks occur in the parent application before a user is allowed to create or access a signing session.
- Signing sessions/tokens should be scoped to the intended recipient and short-lived where supported.
- Final signed artifacts and evidence should be retained in controlled storage.
- Audit records should be append-only or otherwise tamper-evident according to the hosting organization’s policy.
- Certificate/key custody must be handled separately from ordinary application configuration. Production private keys should use protected key custody such as KMS/HSM when required.
- The solution must preserve enough evidence to show who acted, what artifact/version was signed, when it happened, what it meant, and whether the final artifact was modified.

The tool must not claim automatic legal validity in every jurisdiction. Legal and compliance suitability depends on the final signing method, identity controls, operating process, jurisdiction, and regulatory context.

---

## 14. Initial Provider Direction

The first target signing engine is a self-hosted Documenso deployment used as a specialized signing engine behind the parent DMS.

The reusable tool should treat the engine as an adapter implementation detail.

### Design rule

```text
Parent application
    → reusable signing-tool API
        → provider adapter
            → signing engine
```

The parent application must not become tightly coupled to provider-specific status names, envelope IDs, APIs, or UI assumptions.

Future adapters may include other self-hosted engines, enterprise signing providers, remote signing services, or certificate-backed signing services. Those are future options and should not be implemented in the initial skeleton.

---

## 15. Explicit Non-Goals for the Initial Tool

The initial reusable-tool work must not attempt to:

- Become a full document-management system.
- Manage dossiers, folders, metadata, retention, legal holds, or archive policy.
- Replace Word/Excel native authoring.
- Build a full document editor.
- Decide regulatory approval eligibility.
- Hard-code parent-product-specific roles, document types, markets, departments, or terminology.
- Support bulk signing, advanced qualified signatures, or multi-document package merging in the MVP.
- Embed raw private-key signing logic into browser clients.
- Replace the parent application's audit trail.
- Assume every approval must become a visible or cryptographic PDF signature.

---

## 16. MVP Acceptance Criteria

The first functional reusable signing-tool MVP is successful when a parent application can:

1. Create a provider-neutral signing request for one frozen PDF artifact.
2. Specify multiple required participants in sequential, parallel, or hybrid stages.
3. Retrieve a signer-specific signing session/link without exposing provider secrets to the browser.
4. Track normalized request status and participant progress.
5. Receive or retrieve normalized event/audit data.
6. Detect completion, rejection, cancellation, expiry, and failure.
7. Retrieve the final signed PDF and associated evidence after completion.
8. Link all evidence to the source document reference, file version, and content hash.
9. Keep existing parent-application document and workflow behavior independent of the signing provider.
10. Replace or add a provider adapter later without changing the parent-system integration contract.

---

## 17. Open Decisions to Confirm with Product, Security, and Compliance Stakeholders

1. Which participants require a workflow approval only, and which must perform a final signing action?
2. Must the final PDF show every required signer visually, or is a separate audit certificate/evidence package sufficient for some roles?
3. Is one signing request per PDF acceptable for regulatory submission, or is a merged package required?
4. Does production need independently trusted external PDF verification, a CA-issued certificate, a trusted timestamp, or an HSM-backed signing key?
5. Which signer authentication level is required: existing SSO session, re-authentication, MFA, OTP, or identity verification?
6. Which jurisdictions and regulatory standards determine the legal/compliance threshold?
7. What data residency, retention, backup, and audit-export rules apply to signing evidence?
8. Should internal users sign through an embedded experience, a new browser tab, or a provider-hosted redirect flow?
9. What is the maximum allowed signing-request lifetime and reminder/escalation policy?
10. What exact behavior is required when one file in a multi-file dossier fails signing after other files have completed?

---

## 18. Short Reference Flow

```text
Parent DMS validates document/dossier eligibility
    ↓
Parent DMS freezes approved version and generates final PDF rendition
    ↓
Parent DMS creates signing request through reusable signing-tool API
    ↓
Signing tool creates provider request and tracks normalized state
    ↓
Required participants sign in sequential/parallel/hybrid stages
    ↓
Signing tool receives/reconciles events and exposes status
    ↓
On success: final signed PDF + evidence are returned/stored
    ↓
Parent DMS records completion and permits final submission

On rejection/failure/expiry:
    ↓
Parent DMS receives status/event
    ↓
Parent DMS returns document to appropriate business state
    ↓
A materially revised file creates a new version and new signing request
```
