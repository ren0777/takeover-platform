import { describe, expect, it, vi } from 'vitest';
import { TakeoverReconciliationDriver } from '../src/modules/takeover/reconciliation-driver.js';
import type { ReconciliationDriverRepository } from '../src/modules/takeover/service.js';

const paymentA = '55555555-5555-4555-8555-555555555555';
const paymentB = '66666666-6666-4666-8666-666666666666';
const now = new Date('2026-09-05T12:00:00.000Z');

function createLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

describe('TakeoverReconciliationDriver', () => {
  it('discovers unresolved obligations and calls refund reconciliation', async () => {
    const repository = {
      findRefundReconciliationCandidates: vi.fn(async () => [paymentA, paymentB]),
    } satisfies ReconciliationDriverRepository;
    const service = {
      requestRefundForReconciliation: vi.fn(async () => undefined),
    };
    const logger = createLogger();
    const driver = new TakeoverReconciliationDriver({
      batchSize: 10,
      clock: { now: () => now },
      logger,
      repository,
      service,
    });

    const result = await driver.runOnce();

    expect(repository.findRefundReconciliationCandidates).toHaveBeenCalledWith({
      limit: 10,
      now,
    });
    expect(service.requestRefundForReconciliation).toHaveBeenNthCalledWith(1, paymentA);
    expect(service.requestRefundForReconciliation).toHaveBeenNthCalledWith(2, paymentB);
    expect(result).toEqual({ discovered: 2, failed: 0, processed: 2 });
    expect(logger.info).toHaveBeenCalledWith(
      { event: 'takeover.reconciliation.discovered', paymentId: paymentA },
      'Takeover reconciliation obligation discovered',
    );
  });

  it('does not overlap runs inside one process', async () => {
    let releaseFirstRun: (() => void) | undefined;
    const repository = {
      findRefundReconciliationCandidates: vi.fn(
        () =>
          new Promise<string[]>((resolve) => {
            releaseFirstRun = () => resolve([paymentA]);
          }),
      ),
    } satisfies ReconciliationDriverRepository;
    const service = {
      requestRefundForReconciliation: vi.fn(async () => undefined),
    };
    const driver = new TakeoverReconciliationDriver({
      batchSize: 10,
      clock: { now: () => now },
      logger: createLogger(),
      repository,
      service,
    });

    const firstRun = driver.runOnce();
    const secondRun = await driver.runOnce();
    releaseFirstRun?.();
    const firstResult = await firstRun;

    expect(secondRun).toEqual({ discovered: 0, failed: 0, processed: 0 });
    expect(firstResult).toEqual({ discovered: 1, failed: 0, processed: 1 });
    expect(repository.findRefundReconciliationCandidates).toHaveBeenCalledTimes(1);
  });

  it('survives one obligation failure while processing the rest of the batch', async () => {
    const repository = {
      findRefundReconciliationCandidates: vi.fn(async () => [paymentA, paymentB]),
    } satisfies ReconciliationDriverRepository;
    const service = {
      requestRefundForReconciliation: vi
        .fn()
        .mockRejectedValueOnce(new Error('provider unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const logger = createLogger();
    const driver = new TakeoverReconciliationDriver({
      batchSize: 10,
      clock: { now: () => now },
      logger,
      repository,
      service,
    });

    const result = await driver.runOnce();

    expect(result).toEqual({ discovered: 2, failed: 1, processed: 1 });
    expect(service.requestRefundForReconciliation).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), event: 'takeover.reconciliation.retryable_failure', paymentId: paymentA },
      'Takeover reconciliation obligation failed and will be retried',
    );
  });
});
