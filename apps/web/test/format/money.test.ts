import { describe, expect, it } from 'vitest';
import { createMoney } from '@takeover/shared';
import { formatMoney, formatMoneyCompact } from '../../src/lib/format/money.js';

describe('formatMoney', () => {
  it('renders integer minor units as major currency', () => {
    expect(formatMoney(createMoney(42000, 'USD'))).toBe('$420.00');
  });

  it('renders zero', () => {
    expect(formatMoney(createMoney(0, 'USD'))).toBe('$0.00');
  });

  it('keeps a non-zero fraction', () => {
    expect(formatMoney(createMoney(42050, 'USD'))).toBe('$420.50');
  });

  it('respects currencies that have no minor unit', () => {
    expect(formatMoney(createMoney(420, 'JPY'))).toBe('¥420');
  });
});

describe('formatMoneyCompact', () => {
  it('drops a zero fraction so board tiles stay scannable', () => {
    expect(formatMoneyCompact(createMoney(42000, 'USD'))).toBe('$420');
  });

  it('keeps a meaningful fraction', () => {
    expect(formatMoneyCompact(createMoney(42050, 'USD'))).toBe('$420.50');
  });

  it('renders zero without a fraction', () => {
    expect(formatMoneyCompact(createMoney(0, 'USD'))).toBe('$0');
  });
});
