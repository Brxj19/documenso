# Product Scope

## In Scope for v1

- one finalized PDF per signing request
- multiple recipients
- sequential, parallel, and hybrid signing stages
- normalized request and participant status reporting
- signing evidence and append-only event history
- callbacks for downstream consumers
- completed artifact retrieval

Source documents must be frozen and hash-bound before a signing request is
created.

## Explicit Non-Goals

- dossiers or dossier-specific workflow
- DOCX or XLSX authoring and conversion policy
- watermark policy
- multi-document merge flows
- bulk signing
- multiple signing providers
- legal or regulatory claims beyond what the fork actually implements
- HSM or KMS production custody decisions
- Enterprise-only functionality
- complete white-labeling
