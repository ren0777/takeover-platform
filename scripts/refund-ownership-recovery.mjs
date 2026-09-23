#!/usr/bin/env node
/**
 * Finds and optionally repairs reigns still standing on refunded money.
 *
 * Since refund-driven reversal landed, a successful refund unwinds ownership in
 * the same transaction that records it, so nothing should appear here. The
 * script exists for rows written before that, and as a check an operator can
 * run without reading the database by hand.
 *
 *   node scripts/refund-ownership-recovery.mjs            # report only
 *   node scripts/refund-ownership-recovery.mjs --repair   # apply the reversal
 *
 * Repair is idempotent: once a reign is unwound the capture behind it no longer
 * backs an open reign, so running again reports and changes nothing. It never
 * deletes or rewrites history - it closes the reign and, where the previous
 * holder's own payment is still good, opens a restoration reign for them.
 *
 * DATABASE_URL must point at the database to inspect.
 */
import process from 'node:process';

const repair = process.argv.includes('--repair');

const { PrismaTakeoverRepository } =
  await import('../apps/api/dist/modules/takeover/prisma-repository.js').catch(() => {
    console.error(
      'Build the API first: pnpm --filter @takeover/api build\n' +
        '(this script runs against the compiled repository so it shares the exact reversal logic)',
    );
    process.exit(1);
  });

const repository = new PrismaTakeoverRepository();
const rows = await repository.listRefundOwnershipInconsistencies();

if (rows.length === 0) {
  console.log('No reigns are standing on refunded money.');
  process.exit(0);
}

console.log(`${rows.length} inconsistent reign(s):`);
for (const row of rows) {
  console.log(
    `  ${row.territorySlug}  capture=${row.captureId} (${row.captureStatus})  ` +
      `payment=${row.paymentId} (${row.paymentStatus})  owner=${row.companyId}`,
  );
}

if (!repair) {
  console.log('\nReport only. Re-run with --repair to apply the reversal.');
  process.exit(0);
}

let repaired = 0;
let failed = 0;
for (const row of rows) {
  // One bad row must not hide the outcome of the rest: each repair is its own
  // transaction, and re-running only touches what is still inconsistent.
  try {
    const result = await repository.repairRefundOwnershipInconsistency(row.captureId);
    console.log(`  ${row.territorySlug}: ${result.repaired ? 'repaired' : 'no change needed'}`);
    if (result.repaired) repaired += 1;
  } catch (error) {
    failed += 1;
    console.error(`  ${row.territorySlug}: FAILED - ${String(error)}`);
  }
}
console.log(`\nRepaired ${repaired} of ${rows.length}${failed > 0 ? `, ${failed} failed` : ''}.`);
process.exit(failed > 0 ? 1 : 0);
