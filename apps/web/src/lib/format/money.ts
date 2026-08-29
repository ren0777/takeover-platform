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
