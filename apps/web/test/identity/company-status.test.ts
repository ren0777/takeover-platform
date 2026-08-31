import { describe, expect, it } from 'vitest';
import { COMPANY_STATUSES } from '@takeover/shared';
import { describeCompanyStatus } from '../../src/lib/identity/company-status.js';

describe('describeCompanyStatus', () => {
  it('presents a draft as private rather than as an error', () => {
    const status = describeCompanyStatus('draft');
    expect(status.label).toBe('Private draft');
    expect(status.tone).toBe('warning');
  });

  it('presents an active company positively', () => {
    expect(describeCompanyStatus('active')).toEqual({ label: 'Active', tone: 'positive' });
  });

  it('keeps a suspended company named rather than hidden', () => {
    const status = describeCompanyStatus('suspended');
    expect(status.label).toBe('Suspended');
    expect(status.tone).toBe('danger');
  });

  it('treats archived as neutral history, not failure', () => {
    expect(describeCompanyStatus('archived')).toEqual({ label: 'Archived', tone: 'neutral' });
  });

  it('covers every published company status', () => {
    for (const status of COMPANY_STATUSES) {
      expect(describeCompanyStatus(status).label.length).toBeGreaterThan(0);
    }
  });

  it('never renders a raw enum value as a label', () => {
    for (const status of COMPANY_STATUSES) {
      expect(describeCompanyStatus(status).label).not.toBe(status);
    }
  });
});
