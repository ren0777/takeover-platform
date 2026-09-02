import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAKEOVER_API_PATHS } from '../../src/lib/api/takeover-paths.js';
import { ApiRequestError } from '../../src/lib/api/client.js';
import {
  getTakeoverQuote,
  getTakeoverStatus,
  isSafeCheckoutUrl,
  startTakeoverCheckout,
} from '../../src/lib/data/takeover.js';

/**
 * Takeover seam tests.
 *
 * The HTTP layer is mocked at `fetch`, so the real client, the real URL
 * resolution, and the authoritative `@takeover/shared` schemas all run.
 */

const STATUS_TOKEN = 'a'.repeat(43);

let fetchSpy: ReturnType<typeof vi.fn>;

function respondWith(body: unknown, status = 200) {
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function requestedUrl(): string {
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  return String(fetchSpy.mock.calls[0]?.[0]);
}

function requestInit(): RequestInit {
  return fetchSpy.mock.calls[0]?.[1] as RequestInit;
}

function quote(overrides: Record<string, unknown> = {}) {
  return {
    quoteId: crypto.randomUUID(),
    territoryId: crypto.randomUUID(),
    territorySlug: 'ai-coding',
    territoryVersion: '42',
    minimumAmount: { amountMinor: 25_000, currency: 'USD' },
    expiresAt: new Date().toISOString(),
    status: 'ACTIVE',
    checkoutAvailable: true,
    ...overrides,
  };
}

function checkout(overrides: Record<string, unknown> = {}) {
  return {
    checkoutId: crypto.randomUUID(),
    statusToken: STATUS_TOKEN,
    providerCheckoutUrl: 'https://checkout.example.com/session/abc',
    ...overrides,
  };
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    checkoutId: crypto.randomUUID(),
    state: 'PENDING_PAYMENT',
    terminal: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('document', { cookie: 'takeover_management_csrf=csrf-token-value' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getTakeoverQuote', () => {
  it('posts to the centralised quote path and parses the shared contract', async () => {
    respondWith({ data: quote() });

    const parsed = await getTakeoverQuote('ai-coding');

    expect(parsed.minimumAmount).toEqual({ amountMinor: 25_000, currency: 'USD' });
    expect(requestedUrl()).toContain(TAKEOVER_API_PATHS.quotes);
    expect(requestInit().method).toBe('POST');
  });

  it('sends the CSRF header, because a quote is a company-scoped mutation', async () => {
    respondWith({ data: quote() });

    await getTakeoverQuote('ai-coding');

    const headers = requestInit().headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('csrf-token-value');
  });

  it('keeps the territory version an opaque string past MAX_SAFE_INTEGER', async () => {
    respondWith({ data: quote({ territoryVersion: '9007199254740993' }) });

    expect((await getTakeoverQuote('ai-coding')).territoryVersion).toBe('9007199254740993');
  });

  it('rejects a malformed quote rather than rendering an invented price', async () => {
    respondWith({ data: quote({ minimumAmount: 25_000 }) });

    await expect(getTakeoverQuote('ai-coding')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('surfaces a price change as its own error code', async () => {
    respondWith({ error: { code: 'TAKEOVER_PRICE_CHANGED', message: 'The price changed' } }, 409);

    await expect(getTakeoverQuote('ai-coding')).rejects.toMatchObject({
      code: 'TAKEOVER_PRICE_CHANGED',
      status: 409,
    });
  });

  it('surfaces a stale territory version as its own error code', async () => {
    respondWith(
      { error: { code: 'STALE_TERRITORY_VERSION', message: 'The territory changed' } },
      409,
    );

    await expect(getTakeoverQuote('ai-coding')).rejects.toMatchObject({
      code: 'STALE_TERRITORY_VERSION',
    });
  });
});

describe('startTakeoverCheckout', () => {
  it('posts only the quote id and returns the provider handoff', async () => {
    const quoteId = crypto.randomUUID();
    respondWith({ data: checkout() });

    const created = await startTakeoverCheckout({ quoteId });

    expect(created.providerCheckoutUrl).toBe('https://checkout.example.com/session/abc');
    expect(created.statusToken).toBe(STATUS_TOKEN);
    expect(requestedUrl()).toContain(TAKEOVER_API_PATHS.checkouts);
    expect(JSON.parse(String(requestInit().body))).toEqual({ quoteId });
  });

  it('refuses a non-HTTPS provider URL instead of navigating to it', async () => {
    // The contract already rejects these; this is the second line of defence,
    // because the value is handed straight to browser navigation.
    respondWith({ data: checkout({ providerCheckoutUrl: 'javascript:alert(1)' }) });

    await expect(startTakeoverCheckout({ quoteId: crypto.randomUUID() })).rejects.toThrow();
  });
});

describe('isSafeCheckoutUrl', () => {
  it('accepts https and rejects every other scheme', () => {
    expect(isSafeCheckoutUrl('https://checkout.example.com/s/1')).toBe(true);
    expect(isSafeCheckoutUrl('http://checkout.example.com/s/1')).toBe(false);
    expect(isSafeCheckoutUrl('javascript:alert(document.cookie)')).toBe(false);
    expect(isSafeCheckoutUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isSafeCheckoutUrl('not a url')).toBe(false);
  });
});

describe('getTakeoverStatus', () => {
  it('reads the status path without a CSRF header', async () => {
    respondWith({ data: status() });

    const parsed = await getTakeoverStatus(STATUS_TOKEN);

    expect(parsed?.state).toBe('PENDING_PAYMENT');
    expect(requestedUrl()).toContain(TAKEOVER_API_PATHS.status(STATUS_TOKEN));
    expect((requestInit().headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
  });

  it('returns null for an unknown or expired token rather than implying failure', async () => {
    respondWith({ error: { code: 'NOT_FOUND', message: 'No such attempt' } }, 404);

    expect(await getTakeoverStatus(STATUS_TOKEN)).toBeNull();
  });

  it('propagates an outage instead of inventing an outcome', async () => {
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    await expect(getTakeoverStatus(STATUS_TOKEN)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('rejects a status whose terminal flag contradicts its state', async () => {
    // CAPTURED is settled, so terminal:false is not the contract. Accepting it
    // would let a captured attempt keep polling forever.
    respondWith({ data: status({ state: 'CAPTURED', terminal: false }) });

    await expect(getTakeoverStatus(STATUS_TOKEN)).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('accepts the non-terminal money-in-flight states', async () => {
    for (const state of [
      'CAPTURE_FAILED',
      'LOST_TERRITORY_RACE',
      'RECONCILIATION_REQUIRED',
      'REFUND_PENDING',
    ]) {
      fetchSpy.mockReset();
      respondWith({ data: status({ state, terminal: false }) });

      expect((await getTakeoverStatus(STATUS_TOKEN))?.state).toBe(state);
    }
  });
});
