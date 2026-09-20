// Tests for DodoPaymentProvider.lookupRefund selection policy
import { DodoPaymentProvider } from '../../src/modules/takeover/providers/dodo/DodoPaymentProvider.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const apiKey = 'test-api-key';
const baseUrl = 'https://test.dodopayments.com';
const productIds = { USD: 'prod_usd' };
const provider = new DodoPaymentProvider({ apiKey, baseUrl, productIds });

beforeEach(() => {
  vi.restoreAllMocks();
});

async function mockFetchResponse(refunds: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ payment_id: 'pay_123', refunds }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('DodoPaymentProvider.lookupRefund selection', () => {
  it('prefers pending over failed', async () => {
    await mockFetchResponse([
      { payment_id: 'pay_123', refund_id: 'ref_failed', status: 'failed' },
      { payment_id: 'pay_123', refund_id: 'ref_pending', status: 'pending' },
    ]);
    const result = await provider.lookupRefund({ paymentId: 'any', providerPaymentId: 'pay_123' });
    expect(result).toEqual({ providerRefundId: 'ref_pending', status: 'pending' });
  });

  it('prefers succeeded over failed', async () => {
    await mockFetchResponse([
      { payment_id: 'pay_123', refund_id: 'ref_failed', status: 'failed' },
      { payment_id: 'pay_123', refund_id: 'ref_success', status: 'succeeded' },
    ]);
    const result = await provider.lookupRefund({ paymentId: 'any', providerPaymentId: 'pay_123' });
    expect(result).toEqual({ providerRefundId: 'ref_success', status: 'succeeded' });
  });

  it('returns null when multiple non‑failed refunds cause ambiguity', async () => {
    await mockFetchResponse([
      { payment_id: 'pay_123', refund_id: 'ref_pending', status: 'pending' },
      { payment_id: 'pay_123', refund_id: 'ref_review', status: 'review' },
    ]);
    const result = await provider.lookupRefund({ paymentId: 'any', providerPaymentId: 'pay_123' });
    expect(result).toBeNull();
  });

  it('ignores refunds with amount/currency fields (cannot verify safely)', async () => {
    await mockFetchResponse([
      {
        payment_id: 'pay_123',
        refund_id: 'ref_extra',
        status: 'pending',
        amount: 1500,
        currency: 'USD',
      },
    ]);
    const result = await provider.lookupRefund({ paymentId: 'any', providerPaymentId: 'pay_123' });
    expect(result).toBeNull();
  });

  it('returns null when no refunds are present', async () => {
    await mockFetchResponse([]);
    const result = await provider.lookupRefund({ paymentId: 'any', providerPaymentId: 'pay_123' });
    expect(result).toBeNull();
  });

  it('skips malformed refund entries', async () => {
    await mockFetchResponse([
      { payment_id: 'pay_123', refund_id: 'ref_missing_status' }, // missing status
      { payment_id: 'pay_123', refund_id: 'ref_valid', status: 'pending' },
    ]);
    const result = await provider.lookupRefund({ paymentId: 'any', providerPaymentId: 'pay_123' });
    expect(result).toEqual({ providerRefundId: 'ref_valid', status: 'pending' });
  });
});
