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
  'CAPTURE_FAILED',
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
    // Determine if the state should be considered terminal based on the design.
    // Fully settled states are terminal true.
    // PAYMENT_FAILED is terminal only when no money has been charged.
    // All other states must be terminal false.
    const isTerminal = (() => {
      switch (data.state) {
        case 'CAPTURED':
        case 'REFUNDED':
        case 'QUOTE_EXPIRED':
          return true;
        case 'PAYMENT_FAILED':
          // If amountCharged is undefined (no money captured), it's terminal.
          return data.amountCharged === undefined;
        default:
          return false;
      }
    })();
    return data.terminal === isTerminal;
  }, {
    message: 'terminal flag must match the terminality of the state',
    path: ['terminal'],
  })
  .strict();
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;
