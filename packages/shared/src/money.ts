import { z } from 'zod';

export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export const moneySchema = z.object({
  amountMinor: z
    .number()
    .int('amountMinor must be an integer')
    .nonnegative('amountMinor must not be negative')
    .refine(Number.isSafeInteger, 'amountMinor must be a safe integer'),
  currency: z
    .string()
    .regex(CURRENCY_CODE_PATTERN, 'currency must be a three-letter uppercase code'),
});

export type Money = z.infer<typeof moneySchema>;

export function createMoney(amountMinor: number, currency: string): Money {
  return moneySchema.parse({ amountMinor, currency });
}

export function isMoney(value: unknown): value is Money {
  return moneySchema.safeParse(value).success;
}
