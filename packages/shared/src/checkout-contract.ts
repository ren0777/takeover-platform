// Checkout creation request and response contracts for Phase 3
import { z } from 'zod'; import { uuidSchema } from './uuid-schema.js';

export const checkoutRequestSchema = z.object({
  quoteId: uuidSchema,
}).strict();
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkoutResponseSchema = z.object({
  checkoutId: uuidSchema,
  statusToken: z.string().regex(/^[A-Za-z0-9_-]{43,}$/), // opaque token for status polling (>=256 bits)
  providerCheckoutUrl: z.string().url().refine(url => url.startsWith('https://'), { message: 'must be HTTPS' }),
  /**
   * DEV ONLY. True when a local simulator, not a real provider, produced this
   * checkout: no money can move, and the browser must not be handed off to the
   * provider URL. Absent or false on every real checkout.
   */
  simulated: z.boolean().default(false),
}).strict();
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
