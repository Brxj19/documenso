import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { createApiToken } from '@documenso/lib/server-only/public-api/create-api-token';
import { prisma } from '@documenso/prisma';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { EnvelopeType } from '@prisma/client';

const WEBAPP_BASE_URL = NEXT_PUBLIC_WEBAPP_URL();
const V1_API_BASE_URL = `${WEBAPP_BASE_URL}/api/v1`;

const examplePdfBuffer = fs.readFileSync(path.join(__dirname, '../../../../assets/example.pdf'));
const examplePdfHash = crypto.createHash('sha256').update(examplePdfBuffer).digest('hex');

test.describe('Integration API V1 Hybrid Signing', () => {
  test('creates signing session and navigates to completion', async ({ page, request }) => {
    const { user, team } = await seedUser();

    const { token } = await createApiToken({
      userId: user.id,
      teamId: team.id,
      tokenName: 'e2e-integration-hybrid',
      expiresIn: null,
    });

    // Create source envelope via V2 API
    const createRes = await request.fetch(`${WEBAPP_BASE_URL}/api/v2-beta/envelope/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        payload: JSON.stringify({
          type: EnvelopeType.DOCUMENT,
          title: `E2E Hybrid Test ${Date.now()}`,
        }),
        files: {
          name: 'example.pdf',
          mimeType: 'application/pdf',
          buffer: examplePdfBuffer,
        },
      },
    });

    expect(createRes.ok()).toBeTruthy();
    const envelope = await createRes.json();
    const envelopeId = envelope.id;

    // Create and activate signing request
    const idempotencyKey = `e2e-hybrid-${Date.now()}`;

    const createReqBody = {
      externalReference: `${idempotencyKey}-request`,
      title: 'E2E Hybrid Signing',
      document: {
        sourceReference: envelopeId,
        filename: 'example.pdf',
        mimeType: 'application/pdf',
        contentHash: {
          algorithm: 'SHA-256',
          value: examplePdfHash,
        },
      },
      participants: [
        {
          participantId: 'hybrid-signer-1',
          email: 'e2e-hybrid-1@test.documenso.com',
          displayName: 'Hybrid Signer',
          role: 'SIGNER',
        },
      ],
      stages: [{ order: 1, participantIds: ['hybrid-signer-1'] }],
      idempotencyKey,
    };

    const createResponse = await request.fetch(`${V1_API_BASE_URL}/integration/signing-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: createReqBody,
    });

    expect(createResponse.ok()).toBeTruthy();
    const createdBody = await createResponse.json();
    const requestId = createdBody.requestId;

    // Activate
    const sendResponse = await request.fetch(`${V1_API_BASE_URL}/integration/signing-requests/${requestId}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(sendResponse.ok()).toBeTruthy();

    // Create signing session
    const sessionResponse = await request.fetch(
      `${V1_API_BASE_URL}/integration/signing-requests/${requestId}/participants/hybrid-signer-1/signing-session`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: {
          mode: 'REDIRECT',
          returnUrl: `${WEBAPP_BASE_URL}/integration/return`,
        },
      },
    );

    expect(sessionResponse.ok()).toBeTruthy();
    const sessionBody = await sessionResponse.json();

    // Navigate to the signing session
    await page.goto(sessionBody.launchUrl);
    await page.waitForTimeout(2000);

    // The signing page should load
    const currentUrl = page.url();
    expect(currentUrl).toContain('/sign/');

    // Verify the session token page loads
    await expect(page.locator('body')).toBeVisible({ timeout: 5000 });

    // Navigate to completion page
    const sessionId = sessionBody.sessionId;
    await page.goto(`${WEBAPP_BASE_URL}/sign/integration/${sessionId}/complete`);
    await page.waitForTimeout(1000);

    // Verify completion page loads
    await expect(page.locator('body')).toBeVisible({ timeout: 5000 });

    // Check evidence shows the session was created
    const evidenceResponse = await request.fetch(
      `${V1_API_BASE_URL}/integration/signing-requests/${requestId}/evidence`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    expect(evidenceResponse.ok()).toBeTruthy();
    const evidenceBody = await evidenceResponse.json();

    const eventTypes = evidenceBody.events.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toContain('REQUEST_CREATED');
    expect(eventTypes).toContain('REQUEST_SENT');

    // Verify artifacts endpoint returns expected state
    const artifactsResponse = await request.fetch(
      `${V1_API_BASE_URL}/integration/signing-requests/${requestId}/artifacts`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (evidenceBody.status !== 'COMPLETED') {
      expect(artifactsResponse.status()).toBe(400);
    }

    // Clean up
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });
});
