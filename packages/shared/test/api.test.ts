import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema, apiSuccessSchema, ERROR_CODES } from '../src/api.js';

describe('apiSuccessSchema', () => {
  it('accepts a payload nested under data', () => {
    const schema = apiSuccessSchema(z.object({ status: z.literal('ok') }));

    expect(schema.parse({ data: { status: 'ok' } })).toEqual({ data: { status: 'ok' } });
  });

  it('rejects a response without data', () => {
    const schema = apiSuccessSchema(z.string());

    expect(() => schema.parse({ meta: {} })).toThrow();
  });
});

describe('apiErrorSchema', () => {
  it('accepts a stable error envelope', () => {
    const result = apiErrorSchema.parse({
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Route not found' },
    });

    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects missing or empty codes and messages', () => {
    expect(() => apiErrorSchema.parse({ error: { message: 'Missing code' } })).toThrow();
    expect(() => apiErrorSchema.parse({ error: { code: '', message: '' } })).toThrow();
  });
});
