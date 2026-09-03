import { DodoPaymentProvider } from '../../src/modules/takeover/providers/dodo/DodoPaymentProvider.js';
import { createMoney } from '@takeover/shared';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('DodoPaymentProvider', () => {
  const apiKey = 'test-api-key';
  const baseUrl = 'https://test.dodopayments.com';
  const productIds = { USD: 'prod_usd', INR: 'prod_inr' };
  const provider = new DodoPaymentProvider({ apiKey, baseUrl, productIds });
  const amountUsd = createMoney(1500, 'USD');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates checkout (USD)', async () => {
    const mockResponse = {
      session_id: 'sess_usd',
      checkout_url: 'https://checkout.example.com/sess_usd',
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse });
    global.fetch = fetchMock;

    const result = await provider.createCheckout({
      amount: amountUsd,
      checkoutId: 'chk-1',
      quoteId: 'qt-1',
      returnUrl: 'https://app.example/return',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, opts] = call as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/checkouts`);
    expect(opts?.method).toBe('POST');
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    const body = JSON.parse(opts.body as string);
    expect(body).toMatchObject({
      product_cart: [{ product_id: productIds.USD, quantity: 1, amount: amountUsd.amountMinor }],
      return_url: 'https://app.example/return',
      cancel_url: 'https://app.example/return',
      metadata: {
        checkout_id: 'chk-1',
        quote_id: 'qt-1',
        amount_minor: amountUsd.amountMinor,
        currency: amountUsd.currency,
      },
    });
    expect(result).toMatchObject({
      providerCheckoutId: mockResponse.session_id,
      providerCheckoutUrl: mockResponse.checkout_url,
    });
  });

  it('unsupported currency', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const amount = createMoney(1000, 'EUR');
    await expect(
      provider.createCheckout({
        amount,
        checkoutId: 'chk-eur',
        quoteId: 'qt-eur',
        returnUrl: 'https://app.example/return',
      }),
    ).rejects.toThrow('Unsupported currency for Dodo checkout: EUR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('missing session_id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ checkout_url: 'https://checkout.example.com/sess' }),
      });
    global.fetch = fetchMock;
    await expect(
      provider.createCheckout({
        amount: amountUsd,
        checkoutId: 'chk-1',
        quoteId: 'qt-1',
        returnUrl: 'https://app.example/return',
      }),
    ).rejects.toThrow('Dodo checkout response missing providerCheckoutId');
  });

  it('rejects undocumented checkout response identifier fallbacks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        checkout_id: 'chk_fallback',
        url: 'https://checkout.example.com/fallback',
      }),
    });
    global.fetch = fetchMock;
    await expect(
      provider.createCheckout({
        amount: amountUsd,
        checkoutId: 'chk-1',
        quoteId: 'qt-1',
        returnUrl: 'https://app.example/return',
      }),
    ).rejects.toThrow('Dodo checkout response missing providerCheckoutId');
  });

  it('null checkout_url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ session_id: 'sess', checkout_url: null }),
      });
    global.fetch = fetchMock;
    await expect(
      provider.createCheckout({
        amount: amountUsd,
        checkoutId: 'chk-1',
        quoteId: 'qt-1',
        returnUrl: 'https://app.example/return',
      }),
    ).rejects.toThrow('Dodo checkout response missing providerCheckoutUrl');
  });

  it('non‑HTTPS checkout URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ session_id: 'sess', checkout_url: 'http://insecure/sess' }),
      });
    global.fetch = fetchMock;
    await expect(
      provider.createCheckout({
        amount: amountUsd,
        checkoutId: 'chk-1',
        quoteId: 'qt-1',
        returnUrl: 'https://app.example/return',
      }),
    ).rejects.toThrow('Provider checkout URL is not HTTPS');
  });

  it('non‑200 response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal error' });
    global.fetch = fetchMock;
    await expect(
      provider.createCheckout({
        amount: amountUsd,
        checkoutId: 'chk-1',
        quoteId: 'qt-1',
        returnUrl: 'https://app.example/return',
      }),
    ).rejects.toThrow('Dodo checkout failed: 500 Internal error');
  });

  it('network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));
    global.fetch = fetchMock;
    await expect(
      provider.createCheckout({
        amount: amountUsd,
        checkoutId: 'chk-1',
        quoteId: 'qt-1',
        returnUrl: 'https://app.example/return',
      }),
    ).rejects.toThrow('Network failure');
  });

  it('timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    global.fetch = fetchMock;
    const promise = provider.createCheckout({
      amount: amountUsd,
      checkoutId: 'chk-1',
      quoteId: 'qt-1',
      returnUrl: 'https://app.example/return',
    });
    const expectation = expect(promise).rejects.toThrow('Dodo checkout request timed out');
    await vi.advanceTimersByTimeAsync(5_000);
    await expectation;
    vi.useRealTimers();
  });
});
