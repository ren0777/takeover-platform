import { afterAll, describe, expect, it } from 'vitest';
import { disconnectDatabase, getDatabaseClient } from '../src/index.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Proof that the committed Phase 3 migrations produced the schema the
 * invariants depend on.
 *
 * These assertions read the live catalog of the dedicated test database, which
 * `pnpm --filter @takeover/database db:test:prepare` builds by resetting and
 * replaying all committed migrations from scratch. The reset itself is the
 * "migrations apply from fresh" proof and is intentionally not duplicated
 * here; this file pins the resulting shape: enum values, the partial unique
 * index, NOT NULL payload, the processing-status column, and the named
 * foreign keys and checks the Phase 3 invariants rely on.
 */

const prisma = getDatabaseClient() as PrismaClient;

afterAll(async () => {
  await disconnectDatabase();
});

async function enumLabels(typeName: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ labels: string }>>(
    `SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)::text AS labels
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = '${typeName}' AND t.typnamespace = 'public'::regnamespace`,
  );
  const joined = rows[0]?.labels;
  return joined === undefined || joined.length === 0 ? [] : joined.split(',');
}

async function indexDefinition(indexName: string): Promise<string | undefined> {
  const rows = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = '${indexName}'`,
  );
  return rows[0]?.indexdef;
}

type Column = { is_nullable: string; data_type: string; column_default: string | null };

async function column(
  table: string,
  name: string,
): Promise<Column | undefined> {
  const rows = await prisma.$queryRawUnsafe<Array<Column>>(
    `SELECT is_nullable, data_type, column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${name}'`,
  );
  return rows[0];
}

async function constraintExists(constraintName: string, contype: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = '${constraintName}' AND contype = '${contype}'
         AND connamespace = 'public'::regnamespace
     ) AS found`,
  );
  return rows[0]?.found === true;
}

describe('Phase 3 migration shape', () => {
  it('defines the committed PaymentStatus enum with CONFIRMED and without CAPTURED', async () => {
    expect(await enumLabels('PaymentStatus')).toEqual([
      'PENDING',
      'CONFIRMED',
      'FAILED',
      'REFUNDED',
      'RECONCILED',
    ]);
  });

  it('defines the remaining Phase 3 status enums exactly', async () => {
    expect(await enumLabels('QuoteStatus')).toEqual(['ACTIVE', 'EXPIRED', 'CANCELLED']);
    expect(await enumLabels('CheckoutStatus')).toEqual([
      'CREATED',
      'PENDING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
    ]);
    expect(await enumLabels('OwnershipCaptureStatus')).toEqual([
      'PENDING',
      'COMPLETED',
      'FAILED',
      'REFUNDED',
    ]);
  });

  it('keeps uq_takeover_quote_active a unique partial index on ACTIVE quotes', async () => {
    const definition = await indexDefinition('uq_takeover_quote_active');
    expect(definition, 'the partial unique index exists').toBeDefined();
    expect(definition).toContain('UNIQUE INDEX');
    expect(definition).toContain('(territory_id, company_id, territory_version)');
    expect(definition).toContain('WHERE');
    expect(definition).toContain("'ACTIVE'::\"QuoteStatus\"");
  });

  it('stores webhook payloads as NOT NULL jsonb', async () => {
    const payload = await column('payment_webhook_events', 'payload');
    expect(payload?.data_type).toBe('jsonb');
    expect(payload?.is_nullable).toBe('NO');
  });

  it('keeps the processing_status column with its PENDING default', async () => {
    const processingStatus = await column('payment_webhook_events', 'processing_status');
    expect(processingStatus, 'processing_status exists').toBeDefined();
    expect(processingStatus?.is_nullable).toBe('NO');
    expect(processingStatus?.column_default).toContain('PENDING');
  });

  it('backs every Phase 3 status column with its PostgreSQL enum type', async () => {
    const expectations: Array<[string, string, string]> = [
      ['takeover_quotes', 'status', 'QuoteStatus'],
      ['checkout_sessions', 'status', 'CheckoutStatus'],
      ['payments', 'status', 'PaymentStatus'],
      ['ownership_captures', 'status', 'OwnershipCaptureStatus'],
    ];
    for (const [table, name, typeName] of expectations) {
      const status = await column(table, name);
      expect(status?.data_type, `${table}.${name}`).toBe('USER-DEFINED');
      const rows = await prisma.$queryRawUnsafe<Array<{ typname: string }>>(
        `SELECT t.typname FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_type t ON t.oid = a.atttypid
         WHERE c.relname = '${table}' AND a.attname = '${name}'`,
      );
      expect(rows[0]?.typname, `${table}.${name}`).toBe(typeName);
    }
  });

  it('declares every committed Phase 3 foreign key', async () => {
    const foreignKeys = [
      'TakeoverQuote_territory_id_fkey',
      'TakeoverQuote_company_id_fkey',
      'CheckoutSession_quote_id_fkey',
      'CheckoutSession_company_id_fkey',
      'CheckoutStatusToken_checkout_id_fkey',
      'Payment_checkout_id_fkey',
      'PaymentWebhookEvent_payment_id_fkey',
      'OwnershipCapture_payment_id_fkey',
      'OwnershipCapture_territory_id_fkey',
      'OwnershipCapture_new_owner_company_id_fkey',
      'PaymentReconciliationAction_payment_id_fkey',
    ];
    for (const constraintName of foreignKeys) {
      expect(
        await constraintExists(constraintName, 'f'),
        `${constraintName} exists as a foreign key`,
      ).toBe(true);
    }
  });

  it('declares the money CHECK constraints', async () => {
    expect(
      await constraintExists('chk_territory_minimum_amount_nonnegative', 'c'),
    ).toBe(true);
    expect(await constraintExists('TakeoverQuote_minimum_amount_minor_check', 'c')).toBe(true);
    expect(await constraintExists('Payment_amount_minor_check', 'c')).toBe(true);
  });

  it('declares the composite and digest uniqueness indexes', async () => {
    for (const indexName of [
      'uq_checkout_provider',
      'uq_payment_provider',
      'uq_webhook_event',
      'uq_ownership_capture_payment',
      'uq_reconciliation_action',
    ]) {
      expect(await indexDefinition(indexName), `${indexName} exists`).toBeDefined();
    }
    const tokenDigest = await column('checkout_status_tokens', 'token_digest');
    expect(await constraintExists('CheckoutStatusToken_token_digest_key', 'u')).toBe(true);
    expect(tokenDigest?.is_nullable).toBe('NO');
  });
});
