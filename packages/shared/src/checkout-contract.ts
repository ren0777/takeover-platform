// Checkout creation request and response contracts for Phase 3
import { z } from 'zod'; import { uuidSchema } from './uuid-schema.js';

export const checkoutRequestSchema = z.object({
  quoteId: uuidSchema,
  // optional metadata, if needed by future extensions
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkoutResponseSchema = z.object({
  checkoutId: uuidSchema,
  statusToken: z.string().min(1).max(64), // opaque token for status polling
  providerCheckoutUrl: z.string().url(),
}).strict();
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
