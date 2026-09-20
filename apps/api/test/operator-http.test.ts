import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerOperatorRoutes, type OperatorRepository } from '../src/modules/operator/index.js';

const operatorId = '11111111-1111-4111-8111-111111111111';
const credential = 'f'.repeat(64);

function repository(): OperatorRepository {
  return {
    listCompanies: vi.fn().mockResolvedValue([]),
    listTerritories: vi.fn().mockResolvedValue([]),
    listManagementGrants: vi.fn().mockResolvedValue([]),
    inspectTarget: vi.fn().mockResolvedValue(null),
    listAuditLogs: vi.fn().mockResolvedValue([]),
    listPayments: vi.fn().mockResolvedValue([]),
    listReconciliationActions: vi.fn().mockResolvedValue([]),
    listRecoveryRequests: vi.fn().mockResolvedValue([]),
    setCompanySuspended: vi.fn().mockResolvedValue({ id: operatorId, status: 'SUSPENDED' }),
    setTerritoryDisabled: vi.fn().mockResolvedValue({ id: operatorId, availabilityStatus: 'DISABLED' }),
    revokeManagementGrant: vi.fn().mockResolvedValue({ id: operatorId, status: 'REVOKED' }),
    decideRecoveryRequest: vi.fn().mockResolvedValue({ id: operatorId, decision: 'reject' }),
  };
}

async function appFor(permissions: Array<'read' | 'moderate'> = ['read', 'moderate']) {
  const app = Fastify();
  const repo = repository();
  await registerOperatorRoutes(app, { repository: repo, config: { operatorId, credential, permissions } });
  return { app, repo };
}

describe('operator HTTP authority', () => {
  it('serializes exact integer money without exposing unbounded database values', async () => {
    const { app, repo } = await appFor(['read']);
    vi.mocked(repo.listPayments).mockResolvedValue([{ id: operatorId, amountMinor: 9007199254740993n }]);
    const response = await app.inject({ method: 'GET', url: '/api/operator/payments', headers: { authorization: `Bearer ${credential}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].amountMinor).toBe('9007199254740993');
    await app.close();
  }, 20_000); // First Fastify injection in this file absorbs the measured cold-start under parallel load.
  it('fails closed when operator credentials are absent or weak', async () => {
    const app = Fastify();
    await expect(registerOperatorRoutes(app, {
      repository: repository(), config: { operatorId, credential: 'short', permissions: ['read'] },
    })).rejects.toThrow(/credential/i);
  });

  it('rejects missing, incorrect, and company-cookie-only authority', async () => {
    const { app, repo } = await appFor();
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { cookie: 'takeover_management=session' }]) {
      const response = await app.inject({ method: 'GET', url: '/api/operator/audit-logs', headers });
      expect(response.statusCode).toBe(401);
    }
    expect(repo.listAuditLogs).not.toHaveBeenCalled();
  });

  it('allows read permission to inspect bounded operational state', async () => {
    const { app, repo } = await appFor(['read']);
    const response = await app.inject({
      method: 'GET', url: '/api/operator/recovery-requests?limit=10',
      headers: { authorization: `Bearer ${credential}` },
    });
    expect(response.statusCode).toBe(200);
    expect(repo.listRecoveryRequests).toHaveBeenCalledWith(10);
  });

  it('denies mutation to a read-only operator', async () => {
    const { app, repo } = await appFor(['read']);
    const response = await app.inject({
      method: 'POST', url: `/api/operator/companies/${operatorId}/suspend`,
      headers: { authorization: `Bearer ${credential}` },
      payload: { reason: 'Confirmed policy violation', expectedUpdatedAt: '2026-09-20T00:00:00.000Z' },
    });
    expect(response.statusCode).toBe(403);
    expect(repo.setCompanySuspended).not.toHaveBeenCalled();
  });

  it('requires a reason and an explicit reviewed version for moderation', async () => {
    const { app, repo } = await appFor();
    const response = await app.inject({
      method: 'POST', url: `/api/operator/companies/${operatorId}/suspend`,
      headers: { authorization: `Bearer ${credential}` }, payload: { reason: 'no' },
    });
    expect(response.statusCode).toBe(400);
    expect(repo.setCompanySuspended).not.toHaveBeenCalled();
  });

  it('passes independent operator identity and review version to a mutation', async () => {
    const { app, repo } = await appFor();
    const expectedUpdatedAt = '2026-09-20T00:00:00.000Z';
    const response = await app.inject({
      method: 'POST', url: `/api/operator/management-grants/${operatorId}/revoke`,
      headers: { authorization: `Bearer ${credential}` },
      payload: { reason: 'Contact reported compromised access', expectedUpdatedAt },
    });
    expect(response.statusCode).toBe(200);
    expect(repo.revokeManagementGrant).toHaveBeenCalledWith(expect.objectContaining({
      id: operatorId, operatorId, reason: 'Contact reported compromised access',
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    }));
  });
});
