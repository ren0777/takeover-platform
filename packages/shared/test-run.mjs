import { checkoutResponseSchema } from './dist/checkout-contract.js';
import { checkoutRequestSchema } from './src/checkout-contract.js';
import { quoteResponseSchema } from './src/quote-contract.js';
import { attemptStatusSchema } from './src/attempt-state.js';

function test() {
  console.log('checkoutResponse:', checkoutResponseSchema.safeParse({ checkoutId: '44444444-4444-4444-4444-444444444444', statusToken: 'abcd1234efgh5678', requestId: '55555555-5555-5555-5555-555555555555' }));
  console.log('checkoutRequest:', checkoutRequestSchema.safeParse({ quoteId: '33333333-3333-3333-3333-333333333333' }));
  console.log('quoteResponse:', quoteResponseSchema.safeParse({ quoteId: '11111111-1111-1111-1111-111111111111', territoryId: '22222222-2222-2222-2222-222222222222', territorySlug: 'sample-slug', territoryVersion: '12345678901234567890', minimumAmount: { amountMinor: 1000, currency: 'USD' }, expiresAt: new Date().toISOString(), status: 'ACTIVE', checkoutAvailable: true }));
  console.log('attemptStatus:', attemptStatusSchema.safeParse({ checkoutId: '11111111-1111-1111-1111-111111111111', state: 'PENDING_PAYMENT', terminal: false, updatedAt: new Date().toISOString() }));
}

test();
