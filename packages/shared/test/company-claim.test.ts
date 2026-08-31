import { describe, expect, it } from 'vitest';
import {
  ACCESS_REQUEST_STATUSES,
  ERROR_CODES,
  QUOTE_AUTHORITY,
  TAKEOVER_INTENT_STATUSES,
  companyClaimRequestSchema,
  companyClaimResultSchema,
  companyAccessReviewItemSchema,
  companyAccessReviewListQuerySchema,
  companyAccessReviewPageSchema,
  emailTokenExchangeRequestSchema,
  managementContextSchema,
  recoveryRequestResultSchema,
  takeoverIntentSchema,
  takeoverPreparationRequestSchema,
} from '../src/index.js';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const INTENT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_EXPIRY = '2026-08-30T08:00:00.000Z';

describe('company claim contracts', () => {
  it('publishes a bounded access-review query and privacy-safe pending-request page', () => {
    expect(companyAccessReviewListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      companyAccessReviewListQuerySchema.parse({ limit: '100', cursor: 'opaque_cursor' }),
    ).toEqual({
      cursor: 'opaque_cursor',
      limit: 100,
    });
    expect(() => companyAccessReviewListQuerySchema.parse({ limit: 101 })).toThrow();

    const item = companyAccessReviewItemSchema.parse({
      companyId: COMPANY_ID,
      expiresAt: '2026-09-06T00:00:00.000Z',
      id: '33333333-3333-4333-8333-333333333333',
      intent: { id: INTENT_ID, territoryExternalRef: 'ai-coding' },
      requestedAt: '2026-08-30T00:00:00.000Z',
      requesterEmail: 'requester@example.com',
      status: 'pending',
      contactId: 'not-exposed',
    });
    expect(item).toEqual({
      companyId: COMPANY_ID,
      expiresAt: '2026-09-06T00:00:00.000Z',
      id: '33333333-3333-4333-8333-333333333333',
      intent: { id: INTENT_ID, territoryExternalRef: 'ai-coding' },
      requestedAt: '2026-08-30T00:00:00.000Z',
      requesterEmail: 'requester@example.com',
      status: 'pending',
    });
    expect(
      companyAccessReviewPageSchema.parse({ items: [item], nextCursor: 'next_page_cursor' }),
    ).toMatchObject({ items: [item], nextCursor: 'next_page_cursor' });
  });

  it('accepts a personal contact email for a different company domain', () => {
    expect(
      companyClaimRequestSchema.parse({
        company: {
          name: 'My Cool Startup',
          websiteUrl: 'https://mycoolstartup.com',
        },
        contactEmail: 'founder@gmail.com',
        intent: { territoryExternalRef: 'ai-coding' },
      }),
    ).toMatchObject({ contactEmail: 'founder@gmail.com' });
  });

  it('rejects malformed email, website, and territory references', () => {
    expect(() =>
      companyClaimRequestSchema.parse({
        company: { name: 'X', websiteUrl: 'http://localhost:3000' },
        contactEmail: 'not-an-email',
        intent: { territoryExternalRef: '../territory' },
      }),
    ).toThrow();
  });

  it('keeps Phase 1 takeover preparation explicitly non-authoritative', () => {
    const intent = takeoverIntentSchema.parse({
      id: INTENT_ID,
      companyId: COMPANY_ID,
      territoryExternalRef: 'ai-coding',
      quoteAuthority: 'reference_only',
      checkoutAvailable: false,
      status: 'identity_ready',
      expiresAt: '2026-08-31T00:00:00.000Z',
    });

    expect(intent.quoteAuthority).toBe(QUOTE_AUTHORITY);
    expect(intent.checkoutAvailable).toBe(false);
    expect(() => takeoverIntentSchema.parse({ ...intent, checkoutAvailable: true })).toThrow();
  });

  it('validates reference-only quote snapshots without declaring price truth', () => {
    const request = takeoverPreparationRequestSchema.parse({
      territoryExternalRef: 'ai-coding',
      intendedBid: { amountMinor: 26000, currency: 'USD' },
      quoteSnapshot: {
        territoryVersion: 'version-7',
        currentWinningAmount: { amountMinor: 25000, currency: 'USD' },
        minimumTakeoverAmount: { amountMinor: 26000, currency: 'USD' },
        observedAt: '2026-08-30T00:00:00.000Z',
      },
    });

    expect(request.quoteSnapshot?.minimumTakeoverAmount.amountMinor).toBe(26000);
  });

  it('rejects mixed currencies across an intended bid and reference quote', () => {
    expect(() =>
      takeoverPreparationRequestSchema.parse({
        territoryExternalRef: 'ai-coding',
        intendedBid: { amountMinor: 26000, currency: 'USD' },
        quoteSnapshot: {
          territoryVersion: 'version-7',
          minimumTakeoverAmount: { amountMinor: 26000, currency: 'EUR' },
          observedAt: '2026-08-30T00:00:00.000Z',
        },
      }),
    ).toThrow();
  });

  it('exposes one-company management context with a non-authority CSRF token', () => {
    expect(
      managementContextSchema.parse({
        company: {
          id: COMPANY_ID,
          name: 'Acme',
          websiteUrl: 'https://acme.test',
          status: 'draft',
        },
        verificationLevels: ['contact_verified'],
        sessionExpiresAt: SESSION_EXPIRY,
        csrfToken: 'csrf-public-value-with-enough-length',
      }),
    ).toMatchObject({ company: { id: COMPANY_ID }, verificationLevels: ['contact_verified'] });
  });

  it('requires opaque exchange token material', () => {
    expect(emailTokenExchangeRequestSchema.parse({ token: 'selector.secret-material' })).toEqual({
      token: 'selector.secret-material',
    });
    expect(() => emailTokenExchangeRequestSchema.parse({ token: 'short' })).toThrow();
  });

  it('publishes approved access and intent states only', () => {
    expect(ACCESS_REQUEST_STATUSES).toEqual([
      'pending',
      'approved',
      'rejected',
      'expired',
      'cancelled',
    ]);
    expect(TAKEOVER_INTENT_STATUSES).toEqual([
      'awaiting_email_verification',
      'awaiting_company_access',
      'identity_ready',
      'expired',
      'cancelled',
    ]);
  });

  it('makes recovery execution unavailability explicit', () => {
    expect(
      recoveryRequestResultSchema.parse({
        id: '33333333-3333-4333-8333-333333333333',
        status: 'pending',
        expiresAt: '2026-09-06T00:00:00.000Z',
        executionAvailable: false,
      }),
    ).toMatchObject({ status: 'pending', executionAvailable: false });
  });

  it('never allows a Phase 1 claim response to imply checkout', () => {
    const result = {
      company: {
        id: COMPANY_ID,
        name: 'Acme',
        websiteUrl: 'https://acme.test',
        status: 'draft',
      },
      intent: {
        id: INTENT_ID,
        companyId: COMPANY_ID,
        territoryExternalRef: 'ai-coding',
        quoteAuthority: 'reference_only',
        checkoutAvailable: false,
        status: 'awaiting_email_verification',
        expiresAt: '2026-08-31T00:00:00.000Z',
      },
      contactVerification: { status: 'verification_required', deliveryAccepted: true },
      nextAction: 'verify_email',
      checkoutAvailable: false,
    } as const;

    expect(companyClaimResultSchema.parse(result)).toMatchObject({ checkoutAvailable: false });
    expect(() => companyClaimResultSchema.parse({ ...result, checkoutAvailable: true })).toThrow();
  });

  it('publishes stable Phase 1 error codes', () => {
    expect(ERROR_CODES).toMatchObject({
      AUTHORIZATION_REQUIRED: 'AUTHORIZATION_REQUIRED',
      CONTACT_VERIFICATION_REQUIRED: 'CONTACT_VERIFICATION_REQUIRED',
      INVALID_OR_EXPIRED_TOKEN: 'INVALID_OR_EXPIRED_TOKEN',
      COMPANY_ACCESS_PENDING: 'COMPANY_ACCESS_PENDING',
      COMPANY_ACCESS_DENIED: 'COMPANY_ACCESS_DENIED',
      COMPANY_WEBSITE_CLAIMED: 'COMPANY_WEBSITE_CLAIMED',
      RATE_LIMITED: 'RATE_LIMITED',
      CONFLICT: 'CONFLICT',
      MANUAL_RECOVERY_UNAVAILABLE: 'MANUAL_RECOVERY_UNAVAILABLE',
    });
  });
});
