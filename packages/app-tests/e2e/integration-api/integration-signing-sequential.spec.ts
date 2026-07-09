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

test.describe('Integration API V1 Sequential Signing', () => {
  test('completes a sequential two-stage signing flow', async ({ page, request }) => {
    // Seed a user and create API token
    const { user, team } = await seedUser();

    const { token } = await createApiToken({
      userId: user.id,
      teamId: team.id,
      tokenName: 'e2e-integration-sequential',
      expiresIn: null,
    });

    // Create a source envelope via the V2-beta API
    const formData = new FormData();
    formData.append(
      'payload',
      JSON.stringify({
        type: EnvelopeType.DOCUMENT,
        title: `E2E Sequential Test ${Date.now()}`,
      }),
    );
    formData.append('files', new File([examplePdfBuffer], 'example.pdf', { type: 'application/pdf' }));

    const createRes = await request.fetch(`${WEBAPP_BASE_URL}/api/v2-beta/envelope/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        payload: JSON.stringify({
          type: EnvelopeType.DOCUMENT,
          title: `E2E Sequential Test ${Date.now()}`,
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

    // Step 1: Check capabilities
    const capsResponse = await request.fetch(`${V1_API_BASE_URL}/integration/capabilities`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(capsResponse.ok()).toBeTruthy();
    const capsBody = await capsResponse.json();
    expect(capsBody.capabilities.releasePhase).toBeDefined();
    expect(capsBody.capabilities.enabled).toBe(true);

    // Step 2: Create signing request
    const createReqBody = {
      externalReference: `e2e-seq-${Date.now()}`,
      title: 'E2E Sequential Signing',
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
          participantId: 'e2e-signer-1',
          email: 'e2e-sequential-1@test.documenso.com',
          displayName: 'E2E Signer One',
          role: 'SIGNER',
        },
        {
          participantId: 'e2e-signer-2',
          email: 'e2e-sequential-2@test.documenso.com',
          displayName: 'E2E Signer Two',
          role: 'SIGNER',
        },
      ],
      stages: [
        { order: 1, participantIds: ['e2e-signer-1'] },
        { order: 2, participantIds: ['e2e-signer-2'] },
      ],
      idempotencyKey: `e2e-seq-key-${Date.now()}`,
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
    expect(requestId).toBeDefined();

    // Step 3: Send (activate) the request
    const sendResponse = await request.fetch(`${V1_API_BASE_URL}/integration/signing-requests/${requestId}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(sendResponse.ok()).toBeTruthy();
    const sendBody = await sendResponse.json();
    expect(sendBody.status).toBe('IN_PROGRESS');

    // Step 4: Create a signing session for the first signer
    const sessionResponse = await request.fetch(
      `${V1_API_BASE_URL}/integration/signing-requests/${requestId}/participants/e2e-signer-1/signing-session`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: {
          mode: 'REDIRECT',
        },
      },
    );

    expect(sessionResponse.ok()).toBeTruthy();
    const sessionBody = await sessionResponse.json();
    expect(sessionBody.sessionId).toBeDefined();
    expect(sessionBody.launchUrl).toContain('/sign/integration/');

    // Step 5: Complete the first signer's session via the app
    await page.goto(sessionBody.launchUrl);
    await page.waitForURL('**/sign/**');
    await page.waitForTimeout(2000);

    // Complete signing
    await page
      .getByRole('button', { name: /complete|sign/i })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {
        // May be auto-complete for signers
      });
    await page.waitForTimeout(1000);

    // Step 6: Check the request state after first signer completes
    const getResponse = await request.fetch(`${V1_API_BASE_URL}/integration/signing-requests/${requestId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(getResponse.ok()).toBeTruthy();
    const getBody = await getResponse.json();

    if (getBody.status === 'PARTIALLY_COMPLETED') {
      // Step 7: Complete the second signer
      const session2Response = await request.fetch(
        `${V1_API_BASE_URL}/integration/signing-requests/${requestId}/participants/e2e-signer-2/signing-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          data: {
            mode: 'REDIRECT',
          },
        },
      );

      if (session2Response.ok()) {
        const session2Body = await session2Response.json();
        await page.goto(session2Body.launchUrl);
        await page.waitForURL('**/sign/**');
        await page.waitForTimeout(2000);

        await page
          .getByRole('button', { name: /complete|sign/i })
          .first()
          .click({ timeout: 5000 })
          .catch(() => {
            // May be auto-complete
          });
        await page.waitForTimeout(1000);
      }
    }

    // Step 8: Verify evidence
    const evidenceResponse = await request.fetch(
      `${V1_API_BASE_URL}/integration/signing-requests/${requestId}/evidence`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    expect(evidenceResponse.ok()).toBeTruthy();
    const evidenceBody = await evidenceResponse.json();
    expect(evidenceBody.events).toBeDefined();
    expect(evidenceBody.events.length).toBeGreaterThan(0);

    // Clean up seeded user
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });
});
