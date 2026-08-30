import { type Money } from '@takeover/shared';

/**
 * Minor-unit exponent for a currency, resolved from Intl rather than hardcoded,
 * so zero-decimal currencies such as JPY format correctly.
 */
function fractionDigits(formatter: Intl.NumberFormat): number {
  return formatter.resolvedOptions().maximumFractionDigits ?? 2;
}

function toMajorUnits(amountMinor: number, digits: number): number {
  return amountMinor / 10 ** digits;
}

/** Exact presentation of a money value. Use wherever an amount is reviewed or paid. */
export function formatMoney(money: Money, locale = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  });

  return formatter.format(toMajorUnits(money.amountMinor, fractionDigits(formatter)));
}

/**
 * Board presentation: omits the fraction when the amount is a whole major unit,
 * so tiles read as "$420" rather than "$420.00".
 */
export function formatMoneyCompact(money: Money, locale = 'en-US'): string {
  const probe = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
  const digits = fractionDigits(probe);
  const isWholeMajorUnit = money.amountMinor % 10 ** digits === 0;

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: isWholeMajorUnit ? 0 : digits,
    maximumFractionDigits: digits,
  });

  return formatter.format(toMajorUnits(money.amountMinor, digits));
}

/**
 * Parses a user-entered major-unit amount into integer minor units.
 *
 * Works on the decimal string rather than multiplying a float, because
 * `19.99 * 100` is `1998.9999...` and money must never be derived from floating
 * point. Returns null for anything not exactly representable in the currency's
 * minor unit.
 */
export function parseMajorAmountToMinor(input: string, currency: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const digits = fractionDigits(new Intl.NumberFormat('en-US', { style: 'currency', currency }));

  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (match === null) return null;

  const whole = match[1];
  const fraction = match[2] ?? '';
  if (whole === undefined) return null;
  if (fraction.length > digits) return null;

  const combined = `${whole}${fraction.padEnd(digits, '0')}`;
  const amountMinor = Number(combined);

  return Number.isSafeInteger(amountMinor) ? amountMinor : null;
}
