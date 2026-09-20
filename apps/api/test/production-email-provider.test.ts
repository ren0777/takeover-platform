import { describe, expect, it, vi } from 'vitest';
import {
  ProductionEmailDeliveryError,
  createProductionEmailProvider,
} from '../src/integrations/email/production-email-provider.js';

const FIXED_NOW = new Date('2026-09-20T12:00:00.000Z');

function createHarness(fetchImplementation?: typeof fetch) {
  const fetchFn = fetchImplementation ?? vi.fn(async () => Response.json({ id: 'email_123' }));
  const provider = createProductionEmailProvider({
    apiKey: 're_test_secret',
    fetch: fetchFn,
    fromEmail: 'TakeOver <security@takeover.example>',
    now: () => FIXED_NOW,
    timeoutMs: 2_000,
    webAppOrigin: 'https://takeover.example',
  });
  return { fetchFn, provider };
}

describe('production email provider', () => {
  it('sends every supported message as plain text with fragment capability links', async () => {
    const { fetchFn, provider } = createHarness();

    await provider.sendVerification({
      companyName: 'Acme',
      rawToken: 'verify secret',
      toEmail: 'owner@example.com',
    });
    await provider.sendManagementLink({
      companyName: 'Acme',
      rawToken: 'manage-secret',
      toEmail: 'owner@example.com',
    });
    await provider.sendAccessRequestNotification({
      companyName: 'Acme',
      rawReviewToken: 'review-secret',
      requesterEmail: 'requester@example.com',
      toEmail: 'owner@example.com',
    });
    await provider.sendAccessDecisionNotification({
      companyName: 'Acme',
      decision: 'approved',
      rawManagementToken: 'decision-secret',
      toEmail: 'requester@example.com',
    });

    expect(fetchFn).toHaveBeenCalledTimes(4);
    const requests = vi.mocked(fetchFn).mock.calls.map(([url, init]) => ({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      init,
      url,
    }));
    expect(requests.map(({ url }) => url)).toEqual(
      Array.from({ length: 4 }, () => 'https://api.resend.com/emails'),
    );
    expect(requests[0]?.init?.headers).toEqual({
      Authorization: 'Bearer re_test_secret',
      'Content-Type': 'application/json',
    });
    expect(requests[0]?.init?.redirect).toBe('error');
    expect(requests.map(({ body }) => body)).toEqual([
      {
        from: 'TakeOver <security@takeover.example>',
        subject: 'Verify your TakeOver contact',
        text: 'Verify contact for Acme: https://takeover.example/verify#token=verify%20secret',
        to: ['owner@example.com'],
      },
      {
        from: 'TakeOver <security@takeover.example>',
        subject: 'Manage Acme on TakeOver',
        text: 'Manage Acme: https://takeover.example/manage#token=manage-secret',
        to: ['owner@example.com'],
      },
      {
        from: 'TakeOver <security@takeover.example>',
        subject: 'Review a TakeOver access request',
        text: 'requester@example.com requested access to Acme: https://takeover.example/access-review#token=review-secret',
        to: ['owner@example.com'],
      },
      {
        from: 'TakeOver <security@takeover.example>',
        subject: 'TakeOver access request approved',
        text: 'Access to Acme was approved. https://takeover.example/manage#token=decision-secret',
        to: ['requester@example.com'],
      },
    ]);
    for (const { body } of requests) {
      expect(body).not.toHaveProperty('html');
      expect(String(body.text)).not.toContain('?token=');
    }
  });

  it('returns only provider acceptance evidence', async () => {
    const { provider } = createHarness();

    await expect(
      provider.sendVerification({
        companyName: 'Acme',
        rawToken: 'verification-secret',
        toEmail: 'owner@example.com',
      }),
    ).resolves.toEqual({ acceptedAt: FIXED_NOW, messageId: 'email_123' });
  });

  it('sanitizes untrusted display fields without changing delivery addresses or tokens', async () => {
    const { fetchFn, provider } = createHarness();

    await provider.sendAccessRequestNotification({
      companyName: 'Acme\r\nInjected heading\u0000',
      rawReviewToken: 'secret value',
      requesterEmail: 'requester@example.com\r\nInjected',
      toEmail: 'owner@example.com',
    });

    const body = JSON.parse(String(vi.mocked(fetchFn).mock.calls[0]?.[1]?.body)) as {
      text: string;
      to: string[];
    };
    expect(body.text).toBe(
      'requester@example.com Injected requested access to Acme Injected heading : https://takeover.example/access-review#token=secret%20value',
    );
    expect(body.to).toEqual(['owner@example.com']);
  });

  it('fails once with a safe error for provider rejection or malformed success', async () => {
    const secrets = ['raw-token-secret', 'owner@example.com', 'provider says raw-token-secret'];
    const cases: Array<[string, typeof fetch]> = [
      [
        'provider rejection',
        vi.fn(async () =>
          Response.json(
            { message: secrets[2], name: 'validation_error', statusCode: 422 },
            { status: 422 },
          ),
        ),
      ],
      ['malformed success', vi.fn(async () => Response.json({ id: '' }))],
      ['invalid JSON success', vi.fn(async () => new Response('not-json', { status: 200 }))],
    ];

    for (const [label, fetchFn] of cases) {
      const { provider } = createHarness(fetchFn);
      let failure: unknown;
      try {
        await provider.sendVerification({
          companyName: 'Acme',
          rawToken: secrets[0]!,
          toEmail: secrets[1]!,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure, label).toBeInstanceOf(ProductionEmailDeliveryError);
      const rendered = String(failure);
      for (const secret of secrets) expect(rendered).not.toContain(secret);
      expect(fetchFn, label).toHaveBeenCalledTimes(1);
    }
  });

  it('aborts a bounded request and does not retry network failures', async () => {
    const fetchFn = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    const provider = createProductionEmailProvider({
      apiKey: 're_test_secret',
      fetch: fetchFn,
      fromEmail: 'security@takeover.example',
      timeoutMs: 5,
      webAppOrigin: 'https://takeover.example',
    });

    await expect(
      provider.sendVerification({
        companyName: 'Acme',
        rawToken: 'raw-token-secret',
        toEmail: 'owner@example.com',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeout active while consuming the provider response body', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), {
            once: true,
          });
        },
      });
      return new Response(body, { status: 200 });
    });
    const provider = createProductionEmailProvider({
      apiKey: 're_test_secret',
      fetch: fetchFn,
      fromEmail: 'security@takeover.example',
      timeoutMs: 5,
      webAppOrigin: 'https://takeover.example',
    });

    await expect(
      provider.sendVerification({
        companyName: 'Acme',
        rawToken: 'raw-token-secret',
        toEmail: 'owner@example.com',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized success response without exposing it', async () => {
    const hugeId = 'sensitive-provider-content'.repeat(1_000);
    const { provider } = createHarness(
      vi.fn(async () => new Response(JSON.stringify({ id: hugeId }), { status: 200 })),
    );

    await expect(
      provider.sendVerification({
        companyName: 'Acme',
        rawToken: 'raw-token-secret',
        toEmail: 'owner@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED',
      message: 'Production email provider returned an invalid response',
    });
  });

  it('rejects incomplete production configuration before any request', () => {
    expect(() =>
      createProductionEmailProvider({
        apiKey: ' ',
        fromEmail: 'security@takeover.example',
        webAppOrigin: 'https://takeover.example',
      }),
    ).toThrow('Production email API key is required');
    expect(() =>
      createProductionEmailProvider({
        apiKey: 're_test_secret',
        fromEmail: ' ',
        webAppOrigin: 'https://takeover.example',
      }),
    ).toThrow('Production email from address is required');
  });
});
