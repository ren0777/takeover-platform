import { z } from 'zod';

export const operatorPermissionSchema = z.enum(['read', 'moderate']);
export const operatorReasonSchema = z.string().trim().min(10).max(500);
export const operatorVersionSchema = z.string().datetime({ offset: true });
export const operatorMutationSchema = z.object({
  expectedUpdatedAt: operatorVersionSchema,
  reason: operatorReasonSchema,
}).strict();
export const operatorRecoveryDecisionSchema = operatorMutationSchema.extend({
  decision: z.enum(['approve', 'reject']),
}).strict();
export const operatorListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export type OperatorPermission = z.infer<typeof operatorPermissionSchema>;
export type OperatorMutation = z.infer<typeof operatorMutationSchema>;
export type OperatorRecoveryDecision = z.infer<typeof operatorRecoveryDecisionSchema>;
