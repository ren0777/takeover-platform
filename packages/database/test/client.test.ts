import { describe, expect, it, vi } from 'vitest';
import { createDatabaseLifecycle, createTransactionRunner } from '../src/client.js';

describe('database client lifecycle', () => {
  it('constructs a client lazily and reuses it', () => {
    const client = { $disconnect: vi.fn(async () => undefined) };
    const factory = vi.fn(() => client);
    const lifecycle = createDatabaseLifecycle(factory);

    expect(factory).not.toHaveBeenCalled();
    expect(lifecycle.getDatabaseClient()).toBe(client);
    expect(lifecycle.getDatabaseClient()).toBe(client);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('disconnects only an initialized client and clears it', async () => {
    const firstClient = { $disconnect: vi.fn(async () => undefined) };
    const secondClient = { $disconnect: vi.fn(async () => undefined) };
    const factory = vi.fn().mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);
    const lifecycle = createDatabaseLifecycle(factory);

    await lifecycle.disconnectDatabase();
    expect(firstClient.$disconnect).not.toHaveBeenCalled();

    expect(lifecycle.getDatabaseClient()).toBe(firstClient);
    await lifecycle.disconnectDatabase();
    expect(firstClient.$disconnect).toHaveBeenCalledOnce();

    expect(lifecycle.getDatabaseClient()).toBe(secondClient);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('database transaction runner', () => {
  it('passes the transaction client supplied by the lifecycle-owned client', async () => {
    const transactionClient = { marker: 'transaction-client' };
    const client = {
      $transaction: vi.fn(async (operation: (value: typeof transactionClient) => Promise<string>) =>
        operation(transactionClient),
      ),
    };
    const getClient = vi.fn(() => client);
    const runTransaction = createTransactionRunner(getClient);
    const operation = vi.fn(async (value: typeof transactionClient) => value.marker);

    await expect(runTransaction(operation)).resolves.toBe('transaction-client');
    expect(getClient).toHaveBeenCalledOnce();
    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledWith(transactionClient);
  });
});
