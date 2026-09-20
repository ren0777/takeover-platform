import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  operatorListQuerySchema,
  operatorMutationSchema,
  operatorRecoveryDecisionSchema,
  type OperatorPermission,
} from '@takeover/shared';

const idParams = z.object({ id: z.string().uuid() }).strict();

export type OperatorConfig = {
  operatorId: string;
  credential: string;
  permissions: OperatorPermission[];
};

type MutationInput = {
  expectedUpdatedAt: Date;
  id: string;
  operatorId: string;
  reason: string;
  requestId?: string;
};

export interface OperatorRepository {
  listCompanies(limit: number): Promise<unknown[]>;
  listTerritories(limit: number): Promise<unknown[]>;
  listManagementGrants(limit: number): Promise<unknown[]>;
  inspectTarget(kind: 'companies' | 'territories' | 'management-grants', id: string): Promise<unknown>;
  listAuditLogs(limit: number): Promise<unknown[]>;
  listPayments(limit: number): Promise<unknown[]>;
  listReconciliationActions(limit: number): Promise<unknown[]>;
  listRecoveryRequests(limit: number): Promise<unknown[]>;
  setCompanySuspended(input: MutationInput & { suspended: boolean }): Promise<unknown>;
  setTerritoryDisabled(input: MutationInput & { disabled: boolean }): Promise<unknown>;
  revokeManagementGrant(input: MutationInput): Promise<unknown>;
  decideRecoveryRequest(input: MutationInput & { decision: 'approve' | 'reject'; now: Date }): Promise<unknown>;
}

export class OperatorAuthorizationError extends Error {
  readonly statusCode: number;
  constructor(statusCode: 401 | 403, message: string) {
    super(message);
    this.name = 'OperatorAuthorizationError';
    this.statusCode = statusCode;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function validateOperatorConfig(config: OperatorConfig): void {
  z.string().uuid().parse(config.operatorId);
  if (Buffer.byteLength(config.credential, 'utf8') < 32 || config.credential.length < 43)
    throw new Error('Operator credential must contain at least 256 bits of high-entropy material');
  if (config.permissions.length === 0 || new Set(config.permissions).size !== config.permissions.length)
    throw new Error('Operator permissions must be non-empty and unique');
}

function authorize(request: FastifyRequest, config: OperatorConfig, permission: OperatorPermission): void {
  const value = request.headers.authorization;
  if (value === undefined || !value.startsWith('Bearer '))
    throw new OperatorAuthorizationError(401, 'Valid operator bearer credential required');
  const supplied = digest(value.slice(7));
  const expected = digest(config.credential);
  if (!timingSafeEqual(supplied, expected))
    throw new OperatorAuthorizationError(401, 'Valid operator bearer credential required');
  if (!config.permissions.includes(permission))
    throw new OperatorAuthorizationError(403, 'Operator permission denied');
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw Object.assign(result.error, { statusCode: 400 });
}

function wire(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item)) as unknown;
}

export type RegisterOperatorRoutesOptions = {
  config: OperatorConfig;
  repository: OperatorRepository;
  now?: () => Date;
};

export async function registerOperatorRoutes(
  app: FastifyInstance,
  options: RegisterOperatorRoutesOptions,
): Promise<void> {
  validateOperatorConfig(options.config);
  const now = options.now ?? (() => new Date());
  for (const kind of ['companies', 'territories', 'management-grants'] as const) {
    app.get(`/api/operator/${kind}/:id`, async (request, reply) => {
      authorize(request, options.config, 'read');
      const { id } = parse(idParams, request.params);
      const data = await options.repository.inspectTarget(kind, id);
      if (data === null) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Operator target not found', requestId: request.id } });
      return { data: wire(data), meta: { requestId: request.id } };
    });
  }
  for (const [path, load] of [
    ['/api/operator/companies', options.repository.listCompanies.bind(options.repository)],
    ['/api/operator/territories', options.repository.listTerritories.bind(options.repository)],
    ['/api/operator/management-grants', options.repository.listManagementGrants.bind(options.repository)],
    ['/api/operator/audit-logs', options.repository.listAuditLogs.bind(options.repository)],
    ['/api/operator/payments', options.repository.listPayments.bind(options.repository)],
    ['/api/operator/reconciliation-actions', options.repository.listReconciliationActions.bind(options.repository)],
    ['/api/operator/recovery-requests', options.repository.listRecoveryRequests.bind(options.repository)],
  ] as const) {
    app.get(path, async (request) => {
      authorize(request, options.config, 'read');
      const { limit } = parse(operatorListQuerySchema, request.query);
      return { data: wire(await load(limit)), meta: { requestId: request.id, limit } };
    });
  }

  const moderation = (
    path: string,
    execute: (input: MutationInput) => Promise<unknown>,
  ) => app.post(path, async (request) => {
    authorize(request, options.config, 'moderate');
    const { id } = parse(idParams, request.params);
    const body = parse(operatorMutationSchema, request.body);
    return { data: wire(await execute({
      id, operatorId: options.config.operatorId, reason: body.reason,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt), requestId: request.id,
    })), meta: { requestId: request.id } };
  });

  moderation('/api/operator/companies/:id/suspend', (input) =>
    options.repository.setCompanySuspended({ ...input, suspended: true }));
  moderation('/api/operator/companies/:id/restore', (input) =>
    options.repository.setCompanySuspended({ ...input, suspended: false }));
  moderation('/api/operator/territories/:id/disable', (input) =>
    options.repository.setTerritoryDisabled({ ...input, disabled: true }));
  moderation('/api/operator/territories/:id/enable', (input) =>
    options.repository.setTerritoryDisabled({ ...input, disabled: false }));
  moderation('/api/operator/management-grants/:id/revoke', (input) =>
    options.repository.revokeManagementGrant(input));

  app.post('/api/operator/recovery-requests/:id/decision', async (request) => {
    authorize(request, options.config, 'moderate');
    const { id } = parse(idParams, request.params);
    const body = parse(operatorRecoveryDecisionSchema, request.body);
    return { data: wire(await options.repository.decideRecoveryRequest({
      id, operatorId: options.config.operatorId, decision: body.decision, reason: body.reason,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt), now: now(), requestId: request.id,
    })), meta: { requestId: request.id } };
  });
}
