import {
  ZCreateTemplateV2RequestSchema,
  ZCreateTemplateV2ResponseSchema,
} from '@documenso/trpc/server/template-router/schema';
import { initContract } from '@ts-rest/core';

import {
  INTEGRATION_API_V1_CAPABILITIES_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_ARTIFACTS_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_CANCEL_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_EVIDENCE_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_REJECT_PARTICIPANT_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_REMIND_PARTICIPANT_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUEST_SEND_ROUTE,
  INTEGRATION_API_V1_SIGNING_REQUESTS_ROUTE,
  INTEGRATION_API_V1_SIGNING_SESSION_ROUTE,
} from './integration/route';
import {
  ZIntegrationApiV1ArtifactListResponseSchema,
  ZIntegrationApiV1CancelRequestSchema,
  ZIntegrationApiV1CreateSigningRequestResponseSchema,
  ZIntegrationApiV1CreateSigningSessionResponseSchema,
  ZIntegrationApiV1CreateSigningSessionSchema,
  ZIntegrationApiV1EvidenceResponseSchema,
  ZIntegrationApiV1HealthResponseSchema,
  ZIntegrationApiV1RejectRequestSchema,
  ZIntegrationApiV1RemindRequestSchema,
  ZIntegrationApiV1SigningRequestResponseSchema,
  ZIntegrationApiV1SigningRequestSchema,
} from './integration/schema';
import {
  ZAuthorizationHeadersSchema,
  ZCreateDocumentFromTemplateMutationResponseSchema,
  ZCreateDocumentFromTemplateMutationSchema,
  ZCreateDocumentMutationResponseSchema,
  ZCreateDocumentMutationSchema,
  ZCreateFieldMutationSchema,
  ZCreateRecipientMutationSchema,
  ZDeleteDocumentMutationSchema,
  ZDeleteFieldMutationSchema,
  ZDeleteRecipientMutationSchema,
  ZDownloadDocumentQuerySchema,
  ZDownloadDocumentSuccessfulSchema,
  ZGenerateDocumentFromTemplateMutationResponseSchema,
  ZGenerateDocumentFromTemplateMutationSchema,
  ZGetDocumentsQuerySchema,
  ZGetTemplatesQuerySchema,
  ZNoBodyMutationSchema,
  ZResendDocumentForSigningMutationSchema,
  ZSendDocumentForSigningMutationSchema,
  ZSuccessfulDeleteTemplateResponseSchema,
  ZSuccessfulDocumentResponseSchema,
  ZSuccessfulFieldCreationResponseSchema,
  ZSuccessfulFieldResponseSchema,
  ZSuccessfulGetDocumentResponseSchema,
  ZSuccessfulGetTemplateResponseSchema,
  ZSuccessfulGetTemplatesResponseSchema,
  ZSuccessfulRecipientResponseSchema,
  ZSuccessfulResendDocumentResponseSchema,
  ZSuccessfulResponseSchema,
  ZSuccessfulSigningResponseSchema,
  ZUnsuccessfulResponseSchema,
  ZUpdateFieldMutationSchema,
  ZUpdateRecipientMutationSchema,
} from './schema';

const c = initContract();

const deprecatedDescription =
  'This endpoint is deprecated, but will continue to be supported. For more details, see https://docs.documenso.com/developers/public-api.';

export const ApiContractV1 = c.router(
  {
    getIntegrationCapabilities: {
      method: 'GET',
      path: INTEGRATION_API_V1_CAPABILITIES_ROUTE,
      responses: {
        200: ZIntegrationApiV1HealthResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Get integration API V1 health and capabilities',
      description:
        'Discovery endpoint for the reusable signing-tool integration facade. Phase 4 adds recipient-scoped signing sessions, redirect launch support, safe return URL allowlisting, and session-expiry enforcement while continuing to reuse Documenso’s native signing experience.',
    },

    createIntegrationSigningRequest: {
      method: 'POST',
      path: INTEGRATION_API_V1_SIGNING_REQUESTS_ROUTE,
      body: ZIntegrationApiV1SigningRequestSchema,
      responses: {
        200: ZIntegrationApiV1CreateSigningRequestResponseSchema,
        201: ZIntegrationApiV1CreateSigningRequestResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        409: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Create a normalized single-document signing request',
      description:
        'Creates a generic, provider-neutral signing request backed by a Documenso-managed single-PDF source document. The route verifies the caller-supplied SHA-256 hash server-side, maps staged participants to native recipients, enforces idempotency, and never sends the document or creates signing sessions.',
    },

    getIntegrationSigningRequest: {
      method: 'GET',
      path: INTEGRATION_API_V1_SIGNING_REQUEST_ROUTE,
      responses: {
        200: ZIntegrationApiV1SigningRequestResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Get the normalized status for a signing request',
      description:
        'Returns the normalized request status, source-document verification details, staged participant mapping, and safe native-document references for a previously created signing request.',
    },

    getIntegrationSigningRequestEvidence: {
      method: 'GET',
      path: INTEGRATION_API_V1_SIGNING_REQUEST_EVIDENCE_ROUTE,
      responses: {
        200: ZIntegrationApiV1EvidenceResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Get normalized evidence for a signing request',
      description:
        'Returns append-only normalized events, participant timeline, callback delivery state, and final artifact evidence for a reusable integration signing request.',
    },

    getIntegrationSigningRequestArtifacts: {
      method: 'GET',
      path: INTEGRATION_API_V1_SIGNING_REQUEST_ARTIFACTS_ROUTE,
      responses: {
        200: ZIntegrationApiV1ArtifactListResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Get completed artifact metadata for a signing request',
      description:
        'Returns safe metadata for completed signed artifacts captured from Documenso-native storage without exposing raw storage keys or public URLs.',
    },

    sendIntegrationSigningRequest: {
      method: 'POST',
      path: INTEGRATION_API_V1_SIGNING_REQUEST_SEND_ROUTE,
      body: ZNoBodyMutationSchema,
      responses: {
        200: ZIntegrationApiV1SigningRequestResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Activate an integration signing request',
      description:
        'Transitions a previously created integration signing request from READY into the native Documenso send/sign lifecycle without creating duplicate sends on retry. The route stays feature-gated, team-scoped, and returns the normalized request, stage, and participant timeline view.',
    },

    createIntegrationSigningSession: {
      method: 'POST',
      path: INTEGRATION_API_V1_SIGNING_SESSION_ROUTE,
      body: ZIntegrationApiV1CreateSigningSessionSchema,
      responses: {
        200: ZIntegrationApiV1CreateSigningSessionResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Create a recipient-scoped signing session',
      description:
        'Creates a bounded redirect-mode signing session for one currently actionable participant on an active integration signing request. The response returns a launch URL that validates expiry, participant scope, and safe return URL handling before redirecting into the native Documenso signer.',
    },

    rejectIntegrationSigningRequestParticipant: {
      method: 'POST',
      path: INTEGRATION_API_V1_SIGNING_REQUEST_REJECT_PARTICIPANT_ROUTE,
      body: ZIntegrationApiV1RejectRequestSchema,
      responses: {
        200: ZIntegrationApiV1SigningRequestResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        409: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Reject a participant on a signing request',
      description:
        'Rejects an eligible participant on an active signing request. The participant must belong to the request and the request must be non-terminal. A rejection reason is required. The request becomes REJECTED and later participants become unavailable.',
    },

    cancelIntegrationSigningRequest: {
      method: 'POST',
      path: INTEGRATION_API_V1_SIGNING_REQUEST_CANCEL_ROUTE,
      body: ZIntegrationApiV1CancelRequestSchema,
      responses: {
        200: ZIntegrationApiV1SigningRequestResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Cancel/void a signing request',
      description:
        'Cancels or voids a non-terminal signing request. The caller must be authenticated and authorized under existing team ownership conventions. A cancellation reason is required. The request becomes CANCELLED and all signing sessions become invalid.',
    },

    remindIntegrationSigningRequestParticipant: {
      method: 'POST',
      path: INTEGRATION_API_V1_SIGNING_REQUEST_REMIND_PARTICIPANT_ROUTE,
      body: ZIntegrationApiV1RemindRequestSchema,
      responses: {
        200: ZIntegrationApiV1SigningRequestResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        429: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Send a reminder to a signing participant',
      description:
        'Sends a signing reminder to an eligible actionable participant. The request must be active and non-terminal. Reminder attempts are rate-limited per request and per day. Rate-limited and rejected attempts are recorded as evidence events.',
    },

    getDocuments: {
      method: 'GET',
      path: '/api/v1/documents',
      query: ZGetDocumentsQuerySchema,
      responses: {
        200: ZSuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Get all documents',
      deprecated: true,
      description: deprecatedDescription,
    },

    getDocument: {
      method: 'GET',
      path: '/api/v1/documents/:id',
      responses: {
        200: ZSuccessfulGetDocumentResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Get a single document',
      deprecated: true,
      description: deprecatedDescription,
    },

    downloadSignedDocument: {
      method: 'GET',
      path: '/api/v1/documents/:id/download',
      query: ZDownloadDocumentQuerySchema,
      responses: {
        200: ZDownloadDocumentSuccessfulSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Download a signed document when the storage transport is S3',
      deprecated: true,
      description: deprecatedDescription,
    },

    createDocument: {
      method: 'POST',
      path: '/api/v1/documents',
      body: ZCreateDocumentMutationSchema,
      responses: {
        200: ZCreateDocumentMutationResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Upload a new document and get a presigned URL',
      deprecated: true,
      description: deprecatedDescription,
    },

    createTemplate: {
      method: 'POST',
      path: '/api/v1/templates',
      body: ZCreateTemplateV2RequestSchema,
      responses: {
        200: ZCreateTemplateV2ResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Create a new template and get a presigned URL',
      deprecated: true,
      description: deprecatedDescription,
    },

    deleteTemplate: {
      method: 'DELETE',
      path: '/api/v1/templates/:id',
      body: ZNoBodyMutationSchema,
      responses: {
        200: ZSuccessfulDeleteTemplateResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Delete a template',
      deprecated: true,
      description: deprecatedDescription,
    },

    getTemplate: {
      method: 'GET',
      path: '/api/v1/templates/:id',
      responses: {
        200: ZSuccessfulGetTemplateResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Get a single template',
      deprecated: true,
      description: deprecatedDescription,
    },

    getTemplates: {
      method: 'GET',
      path: '/api/v1/templates',
      query: ZGetTemplatesQuerySchema,
      responses: {
        200: ZSuccessfulGetTemplatesResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Get all templates',
      deprecated: true,
      description: deprecatedDescription,
    },

    createDocumentFromTemplate: {
      method: 'POST',
      path: '/api/v1/templates/:templateId/create-document',
      body: ZCreateDocumentFromTemplateMutationSchema,
      responses: {
        200: ZCreateDocumentFromTemplateMutationResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Create a new document from an existing template',
      deprecated: true,
      description: `${deprecatedDescription} \n\nIf you must use the V1 API, use "/api/v1/templates/:templateId/generate-document" instead.`,
    },

    generateDocumentFromTemplate: {
      method: 'POST',
      path: '/api/v1/templates/:templateId/generate-document',
      body: ZGenerateDocumentFromTemplateMutationSchema,
      responses: {
        200: ZGenerateDocumentFromTemplateMutationResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Create a new document from an existing template',
      deprecated: true,
      description: `${deprecatedDescription} \n\nCreate a new document from an existing template. Passing in values for title and meta will override the original values defined in the template. If you do not pass in values for recipients, it will use the values defined in the template.`,
    },

    sendDocument: {
      method: 'POST',
      path: '/api/v1/documents/:id/send',
      body: ZSendDocumentForSigningMutationSchema,
      responses: {
        200: ZSuccessfulSigningResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Send a document for signing',
      deprecated: true,
      description: `${deprecatedDescription} \n\nNotes\n\nsendEmail - Whether to send an email to the recipients asking them to action the document. If you disable this, you will need to manually distribute the document to the recipients using the generated signing links. Defaults to true`,
    },

    resendDocument: {
      method: 'POST',
      path: '/api/v1/documents/:id/resend',
      body: ZResendDocumentForSigningMutationSchema,
      responses: {
        200: ZSuccessfulResendDocumentResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Re-send a document for signing',
      deprecated: true,
      description: deprecatedDescription,
    },

    deleteDocument: {
      method: 'DELETE',
      path: '/api/v1/documents/:id',
      body: ZDeleteDocumentMutationSchema,
      responses: {
        200: ZSuccessfulDocumentResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
      },
      summary: 'Delete a document',
      deprecated: true,
      description: deprecatedDescription,
    },

    createRecipient: {
      method: 'POST',
      path: '/api/v1/documents/:id/recipients',
      body: ZCreateRecipientMutationSchema,
      responses: {
        200: ZSuccessfulRecipientResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Create a recipient for a document',
      deprecated: true,
      description: deprecatedDescription,
    },

    updateRecipient: {
      method: 'PATCH',
      path: '/api/v1/documents/:id/recipients/:recipientId',
      body: ZUpdateRecipientMutationSchema,
      responses: {
        200: ZSuccessfulRecipientResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Update a recipient for a document',
      deprecated: true,
      description: deprecatedDescription,
    },

    deleteRecipient: {
      method: 'DELETE',
      path: '/api/v1/documents/:id/recipients/:recipientId',
      body: ZDeleteRecipientMutationSchema,
      responses: {
        200: ZSuccessfulRecipientResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Delete a recipient from a document',
      deprecated: true,
      description: deprecatedDescription,
    },

    createField: {
      method: 'POST',
      path: '/api/v1/documents/:id/fields',
      body: ZCreateFieldMutationSchema,
      responses: {
        200: ZSuccessfulFieldCreationResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Create a field for a document',
      deprecated: true,
      description: deprecatedDescription,
    },

    updateField: {
      method: 'PATCH',
      path: '/api/v1/documents/:id/fields/:fieldId',
      body: ZUpdateFieldMutationSchema,
      responses: {
        200: ZSuccessfulFieldResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Update a field for a document',
      deprecated: true,
      description: deprecatedDescription,
    },

    deleteField: {
      method: 'DELETE',
      path: '/api/v1/documents/:id/fields/:fieldId',
      body: ZDeleteFieldMutationSchema,
      responses: {
        200: ZSuccessfulFieldResponseSchema,
        400: ZUnsuccessfulResponseSchema,
        401: ZUnsuccessfulResponseSchema,
        404: ZUnsuccessfulResponseSchema,
        500: ZUnsuccessfulResponseSchema,
      },
      summary: 'Delete a field from a document',
      deprecated: true,
      description: deprecatedDescription,
    },
  },
  {
    baseHeaders: ZAuthorizationHeadersSchema,
  },
);
