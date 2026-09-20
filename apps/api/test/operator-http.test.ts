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
    listRecoveryRequests: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    setCompanySuspended: vi.fn().mockResolvedValue({ id: operatorId, status: 'SUSPENDED' }),
    setTerritoryDisabled: vi
      .fn()
      .mockResolvedValue({ id: operatorId, availabilityStatus: 'DISABLED' }),
    revokeManagementGrant: vi.fn().mockResolvedValue({ id: operatorId, status: 'REVOKED' }),
    decideRecoveryRequest: vi.fn().mockResolvedValue({ id: operatorId, decision: 'reject' }),
  };
}

async function appFor(permissions: Array<'read' | 'moderate'> = ['read', 'moderate']) {
  const app = Fastify();
  const repo = repository();
  await registerOperatorRoutes(app, {
    repository: repo,
    config: { operatorId, credential, permissions },
  });
  return { app, repo };
}

describe('operator HTTP authority', () => {
  it('serializes exact integer money without exposing unbounded database values', async () => {
    const { app, repo } = await appFor(['read']);
    vi.mocked(repo.listPayments).mockResolvedValue([
      { id: operatorId, amountMinor: 9007199254740993n },
    ]);
    const response = await app.inject({
      method: 'GET',
      url: '/api/operator/payments',
      headers: { authorization: `Bearer ${credential}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].amountMinor).toBe('9007199254740993');
    await app.close();
  });
  it('fails closed when operator credentials are absent or weak', async () => {
    const app = Fastify();
    await expect(
      registerOperatorRoutes(app, {
        repository: repository(),
        config: { operatorId, credential: 'short', permissions: ['read'] },
      }),
    ).rejects.toThrow(/credential/i);
  });

  it('rejects missing, incorrect, and company-cookie-only authority', async () => {
    const { app, repo } = await appFor();
    for (const headers of [
      {},
      { authorization: 'Bearer wrong' },
      { cookie: 'takeover_management=session' },
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/operator/audit-logs',
        headers,
      });
      expect(response.statusCode).toBe(401);
    }
    expect(repo.listAuditLogs).not.toHaveBeenCalled();
  });

  it('allows read permission to inspect bounded operational state', async () => {
    const { app, repo } = await appFor(['read']);
    const response = await app.inject({
      method: 'GET',
      url: '/api/operator/recovery-requests?limit=10',
      headers: { authorization: `Bearer ${credential}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [], meta: { limit: 10, nextCursor: null } });
    expect(repo.listRecoveryRequests).toHaveBeenCalledWith(10, {
      scope: 'actionable',
      now: expect.any(Date),
    });
  });

  it('validates recovery pagination and supports historical detail with read authority', async () => {
    const { app, repo } = await appFor(['read']);
    const headers = { authorization: `Bearer ${credential}` };
    for (const query of ['limit=101', 'cursor=invalid', 'scope=unknown']) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/operator/recovery-requests?${query}`,
            headers,
          })
        ).statusCode,
      ).toBe(400);
    }
    const cursor = `2026-09-20T00:00:00.000Z|${operatorId}`;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/operator/recovery-requests?scope=all&cursor=${encodeURIComponent(cursor)}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(repo.listRecoveryRequests).toHaveBeenCalledWith(50, {
      scope: 'all',
      cursor,
      now: expect.any(Date),
    });
    vi.mocked(repo.inspectTarget).mockResolvedValue({ id: operatorId, recoveryStatus: 'RESOLVED' });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/operator/recovery-requests/${operatorId}`,
      headers,
    });
    expect(detail.json().data).toMatchObject({ id: operatorId, recoveryStatus: 'RESOLVED' });
    vi.mocked(repo.inspectTarget).mockResolvedValue(null);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/operator/recovery-requests/${operatorId}`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('denies recovery reads without read authority and decisions without moderate authority', async () => {
    const { app, repo } = await appFor(['moderate']);
    for (const path of [
      '/api/operator/recovery-requests',
      `/api/operator/recovery-requests/${operatorId}`,
    ]) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: path,
            headers: { cookie: 'takeover_management=session' },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: path,
            headers: { authorization: `Bearer ${credential}` },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(repo.inspectTarget).not.toHaveBeenCalled();
    expect(repo.listRecoveryRequests).not.toHaveBeenCalled();
    const reader = await appFor(['read']);
    expect(
      (
        await reader.app.inject({
          method: 'POST',
          url: `/api/operator/recovery-requests/${operatorId}/decision`,
          headers: { authorization: `Bearer ${credential}` },
          payload: {
            decision: 'approve',
            expectedUpdatedAt: '2026-09-20T00:00:00.000Z',
            reason: 'Reviewed identity evidence',
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(reader.repo.decideRecoveryRequest).not.toHaveBeenCalled();
    await app.close();
    await reader.app.close();
  });

  it('denies mutation to a read-only operator', async () => {
    const { app, repo } = await appFor(['read']);
    const response = await app.inject({
      method: 'POST',
      url: `/api/operator/companies/${operatorId}/suspend`,
      headers: { authorization: `Bearer ${credential}` },
      payload: {
        reason: 'Confirmed policy violation',
        expectedUpdatedAt: '2026-09-20T00:00:00.000Z',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(repo.setCompanySuspended).not.toHaveBeenCalled();
  });

  it('requires a reason and an explicit reviewed version for moderation', async () => {
    const { app, repo } = await appFor();
    const response = await app.inject({
      method: 'POST',
      url: `/api/operator/companies/${operatorId}/suspend`,
      headers: { authorization: `Bearer ${credential}` },
      payload: { reason: 'no' },
    });
    expect(response.statusCode).toBe(400);
    expect(repo.setCompanySuspended).not.toHaveBeenCalled();
  });

  it('passes independent operator identity and review version to a mutation', async () => {
    const { app, repo } = await appFor();
    const expectedUpdatedAt = '2026-09-20T00:00:00.000Z';
    const response = await app.inject({
      method: 'POST',
      url: `/api/operator/management-grants/${operatorId}/revoke`,
      headers: { authorization: `Bearer ${credential}` },
      payload: { reason: 'Contact reported compromised access', expectedUpdatedAt },
    });
    expect(response.statusCode).toBe(200);
    expect(repo.revokeManagementGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        id: operatorId,
        operatorId,
        reason: 'Contact reported compromised access',
        expectedUpdatedAt: new Date(expectedUpdatedAt),
      }),
    );
  });
});
