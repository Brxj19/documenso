const DEFAULT_BASE_URL = 'http://localhost:3000';

type FetchOptions = {
  method: string;
  path: string;
  body?: unknown;
};

export type IntegrationApiCapabilities = {
  enabled: boolean;
  releasePhase: string;
};

export type SigningRequestResponse = {
  requestId: string;
  status: string;
  idempotentReplay?: boolean;
};

export type SigningSessionResponse = {
  sessionId: string;
  launchUrl: string;
  participantStatus: string;
  requestStatus: string;
};

export type EvidenceResponse = {
  events: Array<{
    id: string;
    type: string;
    timestamp: string;
    actorName?: string;
    actorEmail?: string;
    data?: Record<string, unknown>;
  }>;
  artifacts: Array<{ id: string; type: string; filename: string; mimeType: string; size?: number }>;
  finalArtifact?: { id: string; type: string; filename: string; mimeType: string; size?: number } | null;
};

export class DmsSigningClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor(apiToken: string, baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
    this.apiToken = apiToken;
  }

  async checkCapabilities(): Promise<IntegrationApiCapabilities> {
    const res = await this.fetchRaw({ method: 'GET', path: '/api/v1/integration/capabilities' });
    const body = await res.json();
    return { enabled: body.capabilities.enabled, releasePhase: body.capabilities.releasePhase };
  }

  async createSigningRequest(payload: Record<string, unknown>): Promise<SigningRequestResponse> {
    return this.apiFetch<SigningRequestResponse>({
      method: 'POST',
      path: '/api/v1/integration/signing-requests',
      body: payload,
    });
  }

  async sendSigningRequest(requestId: string): Promise<Record<string, unknown>> {
    return this.apiFetch<Record<string, unknown>>({
      method: 'POST',
      path: `/api/v1/integration/signing-requests/${requestId}/send`,
    });
  }

  async getSigningRequest(requestId: string): Promise<Record<string, unknown>> {
    return this.apiFetch<Record<string, unknown>>({
      method: 'GET',
      path: `/api/v1/integration/signing-requests/${requestId}`,
    });
  }

  async createSigningSession(
    requestId: string,
    participantId: string,
    returnUrl?: string,
  ): Promise<SigningSessionResponse> {
    return this.apiFetch<SigningSessionResponse>({
      method: 'POST',
      path: `/api/v1/integration/signing-requests/${requestId}/participants/${participantId}/signing-session`,
      body: { mode: 'REDIRECT', returnUrl: returnUrl ?? `${this.baseUrl}/dms-prototype` },
    });
  }

  async getEvidence(requestId: string): Promise<EvidenceResponse> {
    return this.apiFetch<EvidenceResponse>({
      method: 'GET',
      path: `/api/v1/integration/signing-requests/${requestId}/evidence`,
    });
  }

  async getArtifacts(requestId: string): Promise<Array<{ id: string; type: string; filename: string }>> {
    const res = await this.fetchRaw({
      method: 'GET',
      path: `/api/v1/integration/signing-requests/${requestId}/artifacts`,
    });
    const body = await res.json();
    return body.artifacts ?? [];
  }

  getArtifactDownloadUrl(requestId: string, artifactId: string): string {
    return `${this.baseUrl}/api/v1/integration/signing-requests/${requestId}/artifacts/${artifactId}/download`;
  }

  private async apiFetch<T>(options: FetchOptions): Promise<T> {
    const res = await this.fetchRaw(options);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Integration API error ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  private fetchRaw(options: FetchOptions): Promise<Response> {
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiToken}` };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(`${this.baseUrl}${options.path}`, { method: options.method, headers, body });
  }
}
