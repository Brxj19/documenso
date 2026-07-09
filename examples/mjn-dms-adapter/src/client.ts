import type { IntegrationApiArtifact, IntegrationApiEvidence, IntegrationApiSigningRequest } from './types';

export interface IntegrationApiClientConfig {
  baseUrl: string;
  apiToken: string;
}

interface FetchOptions {
  method: string;
  path: string;
  body?: unknown;
  contentType?: string;
}

export class IntegrationApiClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor(config: IntegrationApiClientConfig) {
    this.baseUrl = `${config.baseUrl}/api/v1`;
    this.apiToken = config.apiToken;
  }

  async checkCapabilities(): Promise<{ enabled: boolean; releasePhase: string }> {
    const res = await fetch(`${this.baseUrl}/integration/capabilities`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Capabilities check failed: ${res.status}`);
    }

    const body = await res.json();
    return { enabled: body.capabilities.enabled, releasePhase: body.capabilities.releasePhase };
  }

  createSigningRequest(payload: Record<string, unknown>): Promise<{
    requestId: string;
    status: string;
    idempotentReplay: boolean;
  }> {
    return this.apiFetch<{
      requestId: string;
      status: string;
      idempotentReplay: boolean;
    }>({
      method: 'POST',
      path: '/integration/signing-requests',
      body: payload,
    });
  }

  sendSigningRequest(requestId: string): Promise<IntegrationApiSigningRequest> {
    return this.apiFetch<IntegrationApiSigningRequest>({
      method: 'POST',
      path: `/integration/signing-requests/${requestId}/send`,
    });
  }

  getSigningRequest(requestId: string): Promise<IntegrationApiSigningRequest> {
    return this.apiFetch<IntegrationApiSigningRequest>({
      method: 'GET',
      path: `/integration/signing-requests/${requestId}`,
    });
  }

  createSigningSession(
    requestId: string,
    participantId: string,
    options?: { returnUrl?: string; clientState?: string },
  ): Promise<{
    sessionId: string;
    launchUrl: string;
    participantStatus: string;
    requestStatus: string;
  }> {
    return this.apiFetch<{
      sessionId: string;
      launchUrl: string;
      participantStatus: string;
      requestStatus: string;
    }>({
      method: 'POST',
      path: `/integration/signing-requests/${requestId}/participants/${participantId}/signing-session`,
      body: {
        mode: 'REDIRECT',
        ...options,
      },
    });
  }

  getEvidence(requestId: string): Promise<IntegrationApiEvidence> {
    return this.apiFetch<IntegrationApiEvidence>({
      method: 'GET',
      path: `/integration/signing-requests/${requestId}/evidence`,
    });
  }

  async getArtifacts(requestId: string): Promise<IntegrationApiArtifact[]> {
    const res = await this.fetchRaw({
      method: 'GET',
      path: `/integration/signing-requests/${requestId}/artifacts`,
    });

    if (!res.ok) {
      throw new Error(`Get artifacts failed: ${res.status}`);
    }

    const body = await res.json();
    return body.artifacts ?? [];
  }

  downloadArtifact(requestId: string, artifactId: string): Promise<Response> {
    return this.fetchRaw({
      method: 'GET',
      path: `/integration/signing-requests/${requestId}/artifacts/${artifactId}/download`,
    });
  }

  rejectSigningRequest(
    requestId: string,
    participantId: string,
    reason: string,
  ): Promise<IntegrationApiSigningRequest> {
    return this.apiFetch<IntegrationApiSigningRequest>({
      method: 'POST',
      path: `/integration/signing-requests/${requestId}/participants/${participantId}/reject`,
      body: { reason },
    });
  }

  cancelSigningRequest(requestId: string, reason: string): Promise<IntegrationApiSigningRequest> {
    return this.apiFetch<IntegrationApiSigningRequest>({
      method: 'POST',
      path: `/integration/signing-requests/${requestId}/cancel`,
      body: { reason },
    });
  }

  private async apiFetch<T>(options: FetchOptions): Promise<T> {
    const res = await this.fetchRaw(options);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Integration API error ${res.status}: ${body.substring(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }

  private fetchRaw(options: FetchOptions): Promise<Response> {
    const url = `${this.baseUrl}${options.path}`;

    const body = options.body ? JSON.stringify(options.body) : undefined;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(url, {
      method: options.method,
      headers,
      body,
    });
  }
}
