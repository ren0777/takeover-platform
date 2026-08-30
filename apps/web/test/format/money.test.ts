import { describe, expect, it } from 'vitest';
import { createMoney } from '@takeover/shared';
import {
  formatMoney,
  formatMoneyCompact,
  parseMajorAmountToMinor,
} from '../../src/lib/format/money.js';

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

describe('parseMajorAmountToMinor', () => {
  it('parses a whole amount', () => {
    expect(parseMajorAmountToMinor('420', 'USD')).toBe(42000);
  });

  it('parses a fractional amount without floating point error', () => {
    expect(parseMajorAmountToMinor('19.99', 'USD')).toBe(1999);
    expect(parseMajorAmountToMinor('0.07', 'USD')).toBe(7);
  });

  it('pads a short fraction', () => {
    expect(parseMajorAmountToMinor('5.1', 'USD')).toBe(510);
  });

  it('respects zero-decimal currencies', () => {
    expect(parseMajorAmountToMinor('420', 'JPY')).toBe(420);
    expect(parseMajorAmountToMinor('420.5', 'JPY')).toBeNull();
  });

  it('rejects excess precision rather than rounding money', () => {
    expect(parseMajorAmountToMinor('1.234', 'USD')).toBeNull();
  });

  it('rejects non-numeric, negative, and empty input', () => {
    expect(parseMajorAmountToMinor('abc', 'USD')).toBeNull();
    expect(parseMajorAmountToMinor('-5', 'USD')).toBeNull();
    expect(parseMajorAmountToMinor('   ', 'USD')).toBeNull();
  });
});
