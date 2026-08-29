import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  COMPANY_STATUSES,
  VERIFICATION_LEVELS,
  companySchema,
  companyStatusSchema,
  verificationLevelSchema,
} from '../src/index.js';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

describe('company contracts', () => {
  it('accepts a private company draft without implying ownership', () => {
    expect(
      companySchema.parse({
        id: COMPANY_ID,
        name: 'My Cool Startup',
        websiteUrl: 'https://mycoolstartup.com',
        status: 'draft',
        expiresAt: '2026-08-31T00:00:00.000Z',
      }),
    ).toEqual({
      id: COMPANY_ID,
      name: 'My Cool Startup',
      websiteUrl: 'https://mycoolstartup.com',
      status: 'draft',
      expiresAt: '2026-08-31T00:00:00.000Z',
    });
  });

  it('publishes only the approved V1 lifecycle vocabulary', () => {
    expect(COMPANY_STATUSES).toEqual(['draft', 'active', 'suspended', 'archived']);
    expect(VERIFICATION_LEVELS).toEqual([
      'contact_verified',
      'domain_verified',
      'manually_verified',
    ]);
    expect(companyStatusSchema.parse('draft')).toBe('draft');
    expect(verificationLevelSchema.parse('contact_verified')).toBe('contact_verified');
  });

  it('rejects client-invented company states and non-HTTPS websites', () => {
    expect(() => companyStatusSchema.parse('owned')).toThrow();
    expect(() =>
      companySchema.parse({
        id: COMPANY_ID,
        name: 'Unsafe',
        websiteUrl: 'http://localhost:3000',
        status: 'draft',
      }),
    ).toThrow();
  });

  it('reports malformed URLs as validation errors instead of throwing URL parser errors', () => {
    expect(() =>
      companySchema.parse({
        id: COMPANY_ID,
        name: 'Malformed',
        status: 'draft',
        websiteUrl: 'not-a-url',
      }),
    ).toThrow(ZodError);
  });
});
