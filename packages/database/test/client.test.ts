import { describe, expect, it, vi } from 'vitest';
import { createDatabaseLifecycle } from '../src/client.js';

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
