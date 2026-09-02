// Attempt state enum and status response schema
import { z } from 'zod'; import { uuidSchema } from './uuid-schema.js';
import { moneySchema } from './money.js';

export const attemptStateEnum = z.enum([
  'QUOTE_ACTIVE',
  'CHECKOUT_CREATED',
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'CAPTURE_IN_PROGRESS',
  'CAPTURED',
  'QUOTE_EXPIRED',
  'PAYMENT_FAILED',
  'LOST_TERRITORY_RACE',
  'RECONCILIATION_REQUIRED',
  'REFUND_PENDING',
  'REFUNDED',
]);
export type AttemptState = z.infer<typeof attemptStateEnum>;

// ISO‑8601 datetime with timezone offset, used throughout the repo.
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const attemptStatusSchema = z.object({
  checkoutId: uuidSchema,
  state: attemptStateEnum,
  terminal: z.boolean(),
  amountCharged: moneySchema.optional(),
  capturedAt: isoDateTimeSchema.optional(),
  newOwnerCompanyId: uuidSchema.optional(),
  failureReason: z.string().optional(),
  updatedAt: isoDateTimeSchema,
  pollAfterMs: z.number().int().nonnegative().optional(),
})
  .refine((data) => {
    // Define which states are terminal according to the authoritative design.
    const terminalStates = new Set([
      'CAPTURED',
      'QUOTE_EXPIRED',
      'PAYMENT_FAILED',
      'LOST_TERRITORY_RACE',
      'RECONCILIATION_REQUIRED', // automated capture path
      'REFUNDED',
    ]);
    // If state is terminal, terminal flag must be true; otherwise false.
    return terminalStates.has(data.state) ? data.terminal === true : data.terminal === false;
  }, {
    message: 'terminal flag must match the terminality of the state',
    path: ['terminal'],
  })
  .strict();
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;
