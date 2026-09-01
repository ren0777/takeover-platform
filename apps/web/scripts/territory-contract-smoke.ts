/**
 * TEMPORARY backend contract smoke check — not part of the production runtime.
 *
 * Run it once the public territory routes exist to prove the six responses
 * match `@takeover/shared` before any resource is flipped live:
 *
 *   TAKEOVER_API_ORIGIN=http://127.0.0.1:4000 \
 *     pnpm --dir apps/web territory:contract-smoke
 *
 * It issues GET requests only and never mutates anything. Slugs are discovered
 * from the list responses so no data is invented; override them with
 * TAKEOVER_SMOKE_TERRITORY_SLUG / TAKEOVER_SMOKE_COMPANY_SLUG if needed.
 *
 * Requires the shared contracts to be built (`pnpm --filter @takeover/shared
 * build`), because it validates against the published package, not a copy.
 *
 * Delete this script once the live integration is proven in CI.
 */
import process from 'node:process';
import {
  companyPublicSummarySchema,
  companyTerritoriesSchema,
  territoryCategorySchema,
  territoryDetailSchema,
  territoryHistoryPageSchema,
  territoryPageSchema,
} from '@takeover/shared';
import { TERRITORY_API_PATHS } from '../src/lib/api/territory-paths.ts';

type Issue = { path: PropertyKey[]; message: string; code?: string };
type ParseResult<T> = { success: true; data: T } | { success: false; error: { issues: Issue[] } };
type Schema<T> = { safeParse(value: unknown): ParseResult<T> };

type Outcome =
  | { status: 'pass'; label: string; note?: string }
  | { status: 'fail'; label: string; reason: string; hint?: string }
  | { status: 'skip'; label: string; reason: string };

const origin = (process.env.TAKEOVER_API_ORIGIN ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10_000;

const outcomes: Outcome[] = [];

function formatIssues(issues: Issue[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.map(String).join('.');
      return `${path.length > 0 ? path : '<root>'}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Calls out envelope-level mismatches specifically, so a failure reads as "the
 * page meta does not match the shared contract" rather than as a mystery.
 * `pageMetaSchema` is strict and requires `requestId`, so both a missing key
 * and an extra one land here. Anything else is reported verbatim.
 */
function hintFor(issues: Issue[]): string | undefined {
  const metaIssue = issues.find((issue) => issue.path.map(String)[0] === 'meta');
  if (metaIssue === undefined) return undefined;

  return 'The paginated envelope disagrees with the strict shared pageMetaSchema (requestId, limit, nextCursor?). Resolving this is a shared-contract or API change, not a frontend one.';
}

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${origin}${path}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`response body was not JSON (HTTP ${response.status})`);
  }

  return { status: response.status, body };
}

function unwrapEnvelope(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error('response is not a { data } success envelope');
  }
  return (body as { data: unknown }).data;
}

/** Validates `data` alone, for the unpaginated resources. */
async function checkData<T>(
  label: string,
  path: string,
  schema: Schema<T>,
): Promise<T | undefined> {
  try {
    const { status, body } = await getJson(path);
    if (status !== 200) {
      outcomes.push({ status: 'fail', label, reason: `HTTP ${status}` });
      return undefined;
    }

    const parsed = schema.safeParse(unwrapEnvelope(body));
    if (!parsed.success) {
      outcomes.push({ status: 'fail', label, reason: formatIssues(parsed.error.issues) });
      return undefined;
    }

    outcomes.push({ status: 'pass', label });
    return parsed.data;
  } catch (error: unknown) {
    outcomes.push({
      status: 'fail',
      label,
      reason: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Validates the WHOLE envelope, for the paginated resources: their page
 * schemas make `meta` required, and that cursor is the thing most easily lost.
 */
async function checkEnvelope<T extends { meta: { nextCursor?: string } }>(
  label: string,
  path: string,
  schema: Schema<T>,
): Promise<T | undefined> {
  try {
    const { status, body } = await getJson(path);
    if (status !== 200) {
      outcomes.push({ status: 'fail', label, reason: `HTTP ${status}` });
      return undefined;
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const hint = hintFor(parsed.error.issues);
      outcomes.push({
        status: 'fail',
        label,
        reason: formatIssues(parsed.error.issues),
        ...(hint === undefined ? {} : { hint }),
      });
      return undefined;
    }

    outcomes.push({
      status: 'pass',
      label,
      note: parsed.data.meta.nextCursor === undefined ? 'meta ok' : 'meta ok, cursor present',
    });
    return parsed.data;
  } catch (error: unknown) {
    outcomes.push({
      status: 'fail',
      label,
      reason: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function skip(label: string, reason: string) {
  outcomes.push({ status: 'skip', label, reason });
}

const categoriesLabel = `GET ${TERRITORY_API_PATHS.categories}`;
try {
  const { status, body } = await getJson(TERRITORY_API_PATHS.categories);
  if (status !== 200) {
    outcomes.push({ status: 'fail', label: categoriesLabel, reason: `HTTP ${status}` });
  } else {
    const data = unwrapEnvelope(body);
    if (!Array.isArray(data)) {
      outcomes.push({ status: 'fail', label: categoriesLabel, reason: 'data is not an array' });
    } else {
      let failed: string | undefined;
      for (const entry of data) {
        const parsed = (territoryCategorySchema as unknown as Schema<unknown>).safeParse(entry);
        if (!parsed.success) {
          failed = formatIssues(parsed.error.issues);
          break;
        }
      }
      if (failed === undefined) {
        outcomes.push({
          status: 'pass',
          label: categoriesLabel,
          note: `${data.length} categories`,
        });
      } else {
        outcomes.push({ status: 'fail', label: categoriesLabel, reason: failed });
      }
    }
  }
} catch (error: unknown) {
  outcomes.push({
    status: 'fail',
    label: categoriesLabel,
    reason: error instanceof Error ? error.message : String(error),
  });
}

const listPath = `${TERRITORY_API_PATHS.territories}?limit=5`;
const page = await checkEnvelope(
  `GET ${TERRITORY_API_PATHS.territories}`,
  listPath,
  territoryPageSchema as unknown as Schema<{
    data: Array<{ slug: string; currentOwnership?: { owner: { slug: string } } }>;
    meta: { nextCursor?: string };
  }>,
);

const territorySlug =
  process.env.TAKEOVER_SMOKE_TERRITORY_SLUG ??
  page?.data.find((territory) => territory.slug !== undefined)?.slug;

const companySlug =
  process.env.TAKEOVER_SMOKE_COMPANY_SLUG ??
  page?.data.find((territory) => territory.currentOwnership !== undefined)?.currentOwnership?.owner
    .slug;

if (territorySlug === undefined) {
  const reason = 'no territory slug available (list failed or returned nothing)';
  skip('GET /api/territories/:slug', reason);
  skip('GET /api/territories/:slug/history', reason);
} else {
  await checkData(
    `GET ${TERRITORY_API_PATHS.territoryDetail(territorySlug)}`,
    TERRITORY_API_PATHS.territoryDetail(territorySlug),
    territoryDetailSchema as unknown as Schema<unknown>,
  );
  await checkEnvelope(
    `GET ${TERRITORY_API_PATHS.territoryHistory(territorySlug)}`,
    `${TERRITORY_API_PATHS.territoryHistory(territorySlug)}?limit=5`,
    territoryHistoryPageSchema as unknown as Schema<{ meta: { nextCursor?: string } }>,
  );
}

if (companySlug === undefined) {
  const reason =
    'no company slug available (no owned territory in the sampled page; set TAKEOVER_SMOKE_COMPANY_SLUG)';
  skip('GET /api/companies/:slug', reason);
  skip('GET /api/companies/:slug/territories', reason);
} else {
  await checkData(
    `GET ${TERRITORY_API_PATHS.company(companySlug)}`,
    TERRITORY_API_PATHS.company(companySlug),
    companyPublicSummarySchema as unknown as Schema<unknown>,
  );
  await checkData(
    `GET ${TERRITORY_API_PATHS.companyTerritories(companySlug)}`,
    TERRITORY_API_PATHS.companyTerritories(companySlug),
    companyTerritoriesSchema as unknown as Schema<unknown>,
  );
}

console.log(`\nterritory contract smoke — ${origin}\n`);
for (const outcome of outcomes) {
  if (outcome.status === 'pass') {
    console.log(`PASS  ${outcome.label}${outcome.note === undefined ? '' : `  (${outcome.note})`}`);
  } else if (outcome.status === 'skip') {
    console.log(`SKIP  ${outcome.label}  — ${outcome.reason}`);
  } else {
    console.log(`FAIL  ${outcome.label}  — ${outcome.reason}`);
    if (outcome.hint !== undefined) console.log(`      hint: ${outcome.hint}`);
  }
}

const failures = outcomes.filter((outcome) => outcome.status === 'fail').length;
const skipped = outcomes.filter((outcome) => outcome.status === 'skip').length;
console.log(
  `\n${outcomes.length - failures - skipped} passed, ${failures} failed, ${skipped} skipped\n`,
);

// Set the code rather than calling process.exit(): a hard exit while the HTTP
// client still holds keep-alive sockets aborts the process on Windows.
process.exitCode = failures > 0 ? 1 : 0;
