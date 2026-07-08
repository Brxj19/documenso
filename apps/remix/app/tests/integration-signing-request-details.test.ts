import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getIntegrationApiV1SigningRequestMock,
  getIntegrationApiV1SigningRequestEvidenceMock,
  getSessionMock,
  getTeamByUrlMock,
  isIntegrationApiEnabledMock,
} = vi.hoisted(() => ({
  getIntegrationApiV1SigningRequestMock: vi.fn(),
  getIntegrationApiV1SigningRequestEvidenceMock: vi.fn(),
  getSessionMock: vi.fn(),
  getTeamByUrlMock: vi.fn(),
  isIntegrationApiEnabledMock: vi.fn(),
}));

vi.mock('@documenso/api/v1/integration/signing-requests', () => ({
  getIntegrationApiV1SigningRequest: getIntegrationApiV1SigningRequestMock,
}));

vi.mock('@documenso/api/v1/integration/evidence', () => ({
  getIntegrationApiV1SigningRequestEvidence: getIntegrationApiV1SigningRequestEvidenceMock,
}));

vi.mock('@documenso/auth/server/lib/utils/get-session', () => ({
  getSession: getSessionMock,
}));

vi.mock('@documenso/lib/server-only/team/get-team', () => ({
  getTeamByUrl: getTeamByUrlMock,
}));

vi.mock('@documenso/lib/constants/app', () => ({
  IS_INTEGRATION_API_V1_ENABLED: isIntegrationApiEnabledMock,
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((result, part, index) => `${result}${part}${values[index] ?? ''}`, ''),
}));

vi.mock('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  useLingui: () => ({
    t: (value: unknown) => String(value),
  }),
}));

vi.mock('~/components/general/admin-details', () => ({
  DetailsCard: ({ children }: { children: ReactNode }) => children,
  DetailsValue: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('~/components/general/generic-error-layout', () => ({
  GenericErrorLayout: () => null,
}));

vi.mock('@documenso/ui/primitives/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));

vi.mock('@documenso/ui/primitives/card', () => ({
  Card: ({ children }: { children: ReactNode }) => createElement('section', null, children),
  CardContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  CardHeader: ({ children }: { children: ReactNode }) => createElement('header', null, children),
  CardTitle: ({ children }: { children: ReactNode }) => createElement('h2', null, children),
}));

import IntegrationSigningRequestPage from '../routes/_authenticated+/t.$teamUrl+/integration.signing-requests.$requestId';
import { loadIntegrationSigningRequestPageData } from '../routes/_authenticated+/t.$teamUrl+/integration.signing-requests.$requestId.server';

describe('integration signing request details route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    i18n.load('en', {});
    i18n.activate('en');
  });

  it('returns 404 when the integration api v1 feature flag is disabled', async () => {
    isIntegrationApiEnabledMock.mockReturnValue(false);

    await expect(
      loadIntegrationSigningRequestPageData({
        request: new Request('http://localhost:3000/t/test-team/integration/signing-requests/request-1'),
        teamUrl: 'test-team',
        requestId: 'request-1',
      }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('loads the normalized signing-request view model for the team route', async () => {
    isIntegrationApiEnabledMock.mockReturnValue(true);
    getSessionMock.mockResolvedValue({
      user: {
        id: 42,
      },
    });
    getTeamByUrlMock.mockResolvedValue({
      id: 7,
    });
    getIntegrationApiV1SigningRequestMock.mockResolvedValue({
      requestId: 'request-1',
      externalReference: 'request-1',
      title: 'Provider Neutral Request',
      status: 'READY',
      document: {
        sourceReference: 'document_123',
        filename: 'phase-2-source.pdf',
        mimeType: 'application/pdf',
        verifiedContentHash: {
          algorithm: 'SHA-256',
          value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      stages: [
        {
          order: 1,
          nativeSigningOrder: 1,
          completionPolicy: 'ALL_REQUIRED',
          status: 'WAITING',
          isActive: false,
          isBlocked: true,
          blockedReason: 'REQUEST_NOT_ACTIVE',
          participantIds: ['participant-1'],
        },
      ],
      participants: [
        {
          participantId: 'participant-1',
          email: 'approver.one@example.com',
          displayName: 'Approver One',
          role: 'APPROVER',
          status: 'WAITING',
          stageOrder: 1,
          nativeSigningOrder: 1,
          isActionable: true,
          isBlocked: true,
          blockedReason: 'REQUEST_NOT_ACTIVE',
        },
      ],
      timeline: [
        {
          stageOrder: 1,
          stageStatus: 'WAITING',
          stageCompletionPolicy: 'ALL_REQUIRED',
          participantId: 'participant-1',
          email: 'approver.one@example.com',
          displayName: 'Approver One',
          role: 'APPROVER',
          nativeSigningOrder: 1,
          status: 'WAITING',
          isActionable: true,
          isBlocked: true,
          blockedReason: 'REQUEST_NOT_ACTIVE',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    getIntegrationApiV1SigningRequestEvidenceMock.mockResolvedValue({
      requestId: 'request-1',
      correlationId: 'integration-correlation-1',
      status: 'READY',
      timeline: [],
      events: [],
      artifacts: [],
      callbacks: {
        deliveries: [],
      },
      reconciliation: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await loadIntegrationSigningRequestPageData({
      request: new Request('http://localhost:3000/t/test-team/integration/signing-requests/request-1'),
      teamUrl: 'test-team',
      requestId: 'request-1',
    });

    expect(getTeamByUrlMock).toHaveBeenCalledWith({
      userId: 42,
      teamUrl: 'test-team',
    });
    expect(getIntegrationApiV1SigningRequestMock).toHaveBeenCalledWith({
      requestId: 'request-1',
      teamId: 7,
    });
    expect(getIntegrationApiV1SigningRequestEvidenceMock).toHaveBeenCalledWith({
      requestId: 'request-1',
      teamId: 7,
    });
    expect(result).toMatchObject({
      teamUrl: 'test-team',
      signingRequest: {
        requestId: 'request-1',
        status: 'READY',
      },
    });
  });

  it('renders stage policy, blocked reasons, and the participant timeline', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n },
        createElement(
          MemoryRouter,
          null,
          createElement(IntegrationSigningRequestPage, {
            loaderData: {
              teamUrl: 'test-team',
              signingRequest: {
                requestId: 'request-1',
                externalReference: 'request-1',
                title: 'Provider Neutral Request',
                status: 'PARTIALLY_COMPLETED',
                document: {
                  sourceReference: 'document_123',
                  filename: 'phase-3-source.pdf',
                  mimeType: 'application/pdf',
                  verifiedContentHash: {
                    algorithm: 'SHA-256',
                    value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  },
                },
                stages: [
                  {
                    order: 1,
                    nativeSigningOrder: 1,
                    completionPolicy: 'ALL_REQUIRED',
                    status: 'PARTIALLY_COMPLETED',
                    isActive: true,
                    isBlocked: false,
                    participantIds: ['participant-1', 'participant-2'],
                  },
                  {
                    order: 2,
                    nativeSigningOrder: 2,
                    completionPolicy: 'ALL_REQUIRED',
                    status: 'BLOCKED',
                    isActive: false,
                    isBlocked: true,
                    blockedReason: 'PREVIOUS_STAGE_INCOMPLETE',
                    participantIds: ['participant-3'],
                  },
                ],
                participants: [
                  {
                    participantId: 'participant-1',
                    email: 'approver.one@example.com',
                    displayName: 'Approver One',
                    role: 'APPROVER',
                    status: 'COMPLETED',
                    stageOrder: 1,
                    nativeSigningOrder: 1,
                    completedAt: new Date().toISOString(),
                    isActionable: true,
                    isBlocked: false,
                  },
                  {
                    participantId: 'participant-2',
                    email: 'approver.two@example.com',
                    displayName: 'Approver Two',
                    role: 'APPROVER',
                    status: 'AVAILABLE',
                    stageOrder: 1,
                    nativeSigningOrder: 1,
                    isActionable: true,
                    isBlocked: false,
                  },
                  {
                    participantId: 'participant-3',
                    email: 'approver.three@example.com',
                    displayName: 'Approver Three',
                    role: 'APPROVER',
                    status: 'WAITING',
                    stageOrder: 2,
                    nativeSigningOrder: 2,
                    isActionable: true,
                    isBlocked: true,
                    blockedReason: 'PREVIOUS_STAGE_INCOMPLETE',
                  },
                ],
                timeline: [
                  {
                    stageOrder: 1,
                    stageStatus: 'PARTIALLY_COMPLETED',
                    stageCompletionPolicy: 'ALL_REQUIRED',
                    participantId: 'participant-1',
                    email: 'approver.one@example.com',
                    displayName: 'Approver One',
                    role: 'APPROVER',
                    nativeSigningOrder: 1,
                    status: 'COMPLETED',
                    isActionable: true,
                    isBlocked: false,
                  },
                  {
                    stageOrder: 2,
                    stageStatus: 'BLOCKED',
                    stageCompletionPolicy: 'ALL_REQUIRED',
                    participantId: 'participant-3',
                    email: 'approver.three@example.com',
                    displayName: 'Approver Three',
                    role: 'APPROVER',
                    nativeSigningOrder: 2,
                    status: 'WAITING',
                    isActionable: true,
                    isBlocked: true,
                    blockedReason: 'PREVIOUS_STAGE_INCOMPLETE',
                  },
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              evidence: {
                requestId: 'request-1',
                correlationId: 'integration-correlation-1',
                status: 'PARTIALLY_COMPLETED',
                timeline: [],
                events: [
                  {
                    eventId: 'event-1',
                    requestId: 'request-1',
                    eventType: 'REQUEST_PARTIALLY_COMPLETED',
                    source: 'SYSTEM',
                    correlationId: 'event-correlation-1',
                    requestCorrelationId: 'integration-correlation-1',
                    eventTimestamp: new Date().toISOString(),
                    observedAt: new Date().toISOString(),
                    statusAfter: 'PARTIALLY_COMPLETED',
                  },
                ],
                artifacts: [
                  {
                    artifactId: 'artifact-1',
                    requestId: 'request-1',
                    artifactType: 'SIGNED_PDF',
                    filename: 'completed-signed.pdf',
                    mimeType: 'application/pdf',
                    sizeBytes: 2048,
                    sha256: {
                      algorithm: 'SHA-256',
                      value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    },
                    integrityStatus: 'HASH_VERIFIED',
                    capturedAt: new Date().toISOString(),
                    certificateMetadata: {
                      certificatePdfAvailable: true,
                      auditLogPdfAvailable: true,
                      verificationStatus: 'HASH_VERIFIED',
                    },
                  },
                ],
                finalArtifact: {
                  artifactId: 'artifact-1',
                  requestId: 'request-1',
                  artifactType: 'SIGNED_PDF',
                  filename: 'completed-signed.pdf',
                  mimeType: 'application/pdf',
                  sizeBytes: 2048,
                  sha256: {
                    algorithm: 'SHA-256',
                    value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  },
                  integrityStatus: 'HASH_VERIFIED',
                  capturedAt: new Date().toISOString(),
                  certificateMetadata: {
                    certificatePdfAvailable: true,
                    auditLogPdfAvailable: true,
                    verificationStatus: 'HASH_VERIFIED',
                  },
                },
                finalSha256: {
                  algorithm: 'SHA-256',
                  value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                },
                certificateMetadata: {
                  certificatePdfAvailable: true,
                  auditLogPdfAvailable: true,
                  verificationStatus: 'HASH_VERIFIED',
                },
                callbacks: {
                  deliveries: [
                    {
                      deliveryId: 'delivery-1',
                      eventId: 'event-1',
                      deliveryState: 'FAILED_RETRYABLE',
                      targetUrl: 'http://localhost:3000/callback',
                      payloadHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                      attemptCount: 1,
                      maxAttempts: 5,
                      nextAttemptAt: new Date().toISOString(),
                      lastHttpStatus: 500,
                      lastErrorSummary: 'Callback returned HTTP 500.',
                    },
                  ],
                },
                reconciliation: {
                  lastReconciledAt: new Date().toISOString(),
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
          } as never),
        ),
      ),
    );

    expect(markup).toContain('ALL_REQUIRED');
    expect(markup).toContain('Final Artifact');
    expect(markup).toContain('Event Timeline');
    expect(markup).toContain('Callback Deliveries');
    expect(markup).toContain('Participant Timeline');
    expect(markup).toContain('Previous stage incomplete');
    expect(markup).toContain('Partially Completed');
  });
});
