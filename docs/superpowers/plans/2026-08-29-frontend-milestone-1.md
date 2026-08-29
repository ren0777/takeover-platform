# Frontend Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public TakeOver product experience inside `apps/web` — design system, Value Mosaic territory board, territory and company pages, leaderboard, activity rail, and an honest capture flow — consuming only quarantined fixtures through a data-access seam until Codex ships product APIs.

**Architecture:** Server components by default. All data reaches pages through `src/lib/data/*`, which selects a fixture or live source per resource. Presentation types live in `src/lib/view-models/` and are explicitly provisional until `@takeover/shared` publishes domain contracts. Client components are used only for the takeover modal, timers, filters, and the management-link form.

**Tech Stack:** Next.js 15.5.24 (App Router), React 19.2.8, TypeScript 5.9.3, Tailwind CSS 4.3.3, Vitest 3.2.7.

**Spec:** `docs/superpowers/specs/2026-08-29-takeover-frontend-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Work only inside `apps/web`.** Do not modify `apps/api`, `packages/shared`, `packages/database`, `packages/config`, root tooling, or any canonical doc except as a task explicitly directs.
- **Never import `@takeover/database`.**
- **Reuse `@takeover/shared`.** Import `Money`, `createMoney`, `isMoney`, `moneySchema`, `DEFAULT_CURRENCY`, `ApiSuccess`, `ApiError`, `ERROR_CODES` rather than restating them.
- **Provisional view models are marked.** Every file in `src/lib/view-models/` opens with the header comment defined in Task 3 and uses the `View` type suffix.
- **Fixtures are development-only**, live only in `src/lib/fixtures/`, are never imported by a component, and never depict payment, verification, ownership, authentication, or any irreversible state as successful.
- **Never fabricate** authentication, verification, payment success, ownership change, rank movement, or live events.
- **No login, signup, forgot-password, or reset-password screens.** Cancelled by product decision 2026-08-29.
- **Money is integer minor units.** Money-bearing fields end in `Minor`. No floating-point money arithmetic. Timestamps are ISO 8601 UTC strings.
- **Semantic tokens only.** No hardcoded color values in components.
- **Strictness:** `strict`, `noUncheckedIndexedAccess` (indexed access yields `T | undefined`), `exactOptionalPropertyTypes` (omit optional properties, never assign `undefined`), `verbatimModuleSyntax` (inline `type` specifiers).
- **Existing tokens are canonical:** `--color-background #09090b`, `--color-surface #111113`, `--color-border #27272a`, `--color-foreground #fafafa`, `--color-muted #a1a1aa`. Extend; never redefine.
- **Keep** the existing `.skip-link` / `#main-content` contract and `src/lib/site.ts`.
- **Verification command for every task:** `pnpm --filter @takeover/web test && pnpm --filter @takeover/web typecheck && pnpm --filter @takeover/web lint`

## Execution Status — updated 2026-08-30

Phase 1 (Company + Claim Identity) is **design approved, implementation not started**. `@takeover/shared` still publishes no product-domain contract, so most of this plan is gated.

| Tasks    | Status                 | Reason                                                                                   |
| -------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| 1, 2     | **Executable now**     | Domain-independent. Task 2 depends only on `Money`, which is published and authoritative |
| 3–10, 12 | **Blocked**            | Depend on product-domain shapes that `@takeover/shared` does not yet define              |
| 11       | **Blocked, rewritten** | Realigned to the Phase 1 claim model; needs the Phase 1 shared schemas                   |

Do not create provisional `Territory`, `Company`, `Season`, `Battle`, `LeaderboardEntry`, or `ActivityEvent` types in `apps/web` to unblock work. The source-of-truth question is being resolved deliberately; introducing duplication to move faster is explicitly rejected.

When Codex publishes the Phase 1 contracts: re-read the six canonical docs, re-inspect `@takeover/shared`, update Task 3 and everything downstream of it to the real types, then resume.

## File Structure

| Path                           | Responsibility                             |
| ------------------------------ | ------------------------------------------ |
| `src/app/globals.css`          | Tailwind entry, `@theme` tokens (extended) |
| `src/app/layout.tsx`           | Root layout, fonts, metadata, skip link    |
| `src/lib/format/money.ts`      | Money formatting from integer minor units  |
| `src/lib/format/duration.ts`   | Reign duration formatting                  |
| `src/lib/format/color.ts`      | Owner accent hex validation                |
| `src/lib/view-models/*.ts`     | Provisional presentation types             |
| `src/lib/fixtures/*.ts`        | Development-only sample data               |
| `src/lib/data/source.ts`       | Per-resource fixture/live switch           |
| `src/lib/data/*.ts`            | Data-access functions consumed by pages    |
| `src/lib/board/tiers.ts`       | Tier assignment for the mosaic             |
| `src/lib/realtime/contract.ts` | Real-time integration boundary only        |
| `src/components/**`            | Presentation components                    |
| `src/app/**/page.tsx`          | Routes                                     |

---

### Task 1: Design tokens and typography

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**

- Consumes: existing five tokens and the `.skip-link` contract
- Produces: semantic color tokens, radius tokens, and three font CSS variables (`--font-display`, `--font-body`, `--font-mono`) available to every component

- [ ] **Step 1: Extend the theme block**

In `globals.css`, keep the existing five `@theme` entries untouched and add to the same block:

```css
--color-surface-raised: #18181b;
--color-premium: #e9b949;
--color-contested: #ff5a1f;
--color-challenger: #ff8a4c;
--color-unclaimed: #7c5cff;
--color-owner: #3ddc97;
--color-success: #2fbf71;
--color-warning: #f5a524;
--color-destructive: #e5484d;

--radius-tile: 4px;
--radius-control: 6px;
--radius-pill: 9999px;
```

- [ ] **Step 2: Point the body font at the loaded family**

Replace the `font-family` declaration in the existing `body` rule with:

```css
font-family: var(--font-body), Inter, ui-sans-serif, system-ui, sans-serif;
```

- [ ] **Step 3: Load the three fonts in the root layout**

In `layout.tsx`, above the existing metadata export:

```tsx
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';

const display = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

const body = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});
```

Then add the variables to the `<html>` element, preserving `lang="en"` and the existing body content:

```tsx
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @takeover/web build`
Expected: build succeeds and fonts resolve.

Run: `pnpm --filter @takeover/web typecheck && pnpm --filter @takeover/web lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx
git commit -m "feat(web): add semantic design tokens and typography system"
```

---

### Task 2: Pure formatting utilities (TDD)

**Files:**

- Create: `apps/web/src/lib/format/{money,duration,color}.ts`
- Test: `apps/web/test/format/{money,duration,color}.test.ts`

**Interfaces:**

- Consumes: `Money` from `@takeover/shared`
- Produces:
  - `formatMoney(money: Money, locale?: string): string` — exact, always shows the currency's fraction digits
  - `formatMoneyCompact(money: Money, locale?: string): string` — omits a zero fraction, for board display
  - `formatReign(startedAtIso: string, nowMs: number): string`
  - `sanitizeAccentColor(value: string | null | undefined): string | null` — normalized lowercase `#rrggbb`, else `null`

- [ ] **Step 1: Write the failing money tests**

`apps/web/test/format/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMoney } from '@takeover/shared';
import { formatMoney, formatMoneyCompact } from '../../src/lib/format/money.js';

describe('formatMoney', () => {
  it('renders integer minor units as major currency', () => {
    expect(formatMoney(createMoney(42000, 'USD'))).toBe('$420.00');
  });

  it('renders zero', () => {
    expect(formatMoney(createMoney(0, 'USD'))).toBe('$0.00');
  });

  it('keeps a non-zero fraction', () => {
    expect(formatMoney(createMoney(42050, 'USD'))).toBe('$420.50');
  });

  it('respects currencies with no minor unit', () => {
    expect(formatMoney(createMoney(420, 'JPY'))).toBe('¥420');
  });
});

describe('formatMoneyCompact', () => {
  it('drops a zero fraction', () => {
    expect(formatMoneyCompact(createMoney(42000, 'USD'))).toBe('$420');
  });

  it('keeps a meaningful fraction', () => {
    expect(formatMoneyCompact(createMoney(42050, 'USD'))).toBe('$420.50');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @takeover/web test`
Expected: FAIL — cannot resolve `../../src/lib/format/money.js`.

- [ ] **Step 3: Implement money formatting**

`apps/web/src/lib/format/money.ts`:

```ts
import { type Money } from '@takeover/shared';

/** Minor-unit exponent for a currency, resolved from Intl rather than hardcoded. */
function fractionDigits(formatter: Intl.NumberFormat): number {
  return formatter.resolvedOptions().maximumFractionDigits ?? 2;
}

function toMajorUnits(amountMinor: number, digits: number): number {
  return amountMinor / 10 ** digits;
}

/** Exact presentation of a money value. Use wherever an amount is reviewed or paid. */
export function formatMoney(money: Money, locale = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  });
  return formatter.format(toMajorUnits(money.amountMinor, fractionDigits(formatter)));
}

/** Board presentation: omits the fraction when the amount is a whole major unit. */
export function formatMoneyCompact(money: Money, locale = 'en-US'): string {
  const probe = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
  const digits = fractionDigits(probe);
  const isWhole = money.amountMinor % 10 ** digits === 0;

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: isWhole ? 0 : digits,
    maximumFractionDigits: digits,
  });

  return formatter.format(toMajorUnits(money.amountMinor, digits));
}
```

- [ ] **Step 4: Run to verify money tests pass**

Run: `pnpm --filter @takeover/web test`
Expected: PASS.

- [ ] **Step 5: Write the failing duration tests**

`apps/web/test/format/duration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatReign } from '../../src/lib/format/duration.js';

const start = '2026-08-29T00:00:00.000Z';
const startMs = Date.parse(start);

describe('formatReign', () => {
  it('renders minutes under an hour', () => {
    expect(formatReign(start, startMs + 42 * 60_000)).toBe('42m');
  });

  it('renders hours and minutes under a day', () => {
    expect(formatReign(start, startMs + 8 * 3_600_000 + 42 * 60_000)).toBe('08h 42m');
  });

  it('renders days and hours beyond a day', () => {
    expect(formatReign(start, startMs + 3 * 86_400_000 + 8 * 3_600_000)).toBe('3d 8h');
  });

  it('clamps a future start to zero rather than rendering negative time', () => {
    expect(formatReign(start, startMs - 60_000)).toBe('0m');
  });

  it('returns a neutral placeholder for an unparseable timestamp', () => {
    expect(formatReign('not-a-date', startMs)).toBe('—');
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm --filter @takeover/web test`
Expected: FAIL — cannot resolve `../../src/lib/format/duration.js`.

- [ ] **Step 7: Implement duration formatting**

`apps/web/src/lib/format/duration.ts`:

```ts
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Formats how long a reign has lasted. `nowMs` is injected so the function stays
 * deterministic and testable; callers pass `Date.now()`.
 */
export function formatReign(startedAtIso: string, nowMs: number): string {
  const startedMs = Date.parse(startedAtIso);
  if (Number.isNaN(startedMs)) return '—';

  const elapsed = Math.max(0, nowMs - startedMs);

  if (elapsed >= DAY_MS) {
    const days = Math.floor(elapsed / DAY_MS);
    const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
    return `${days}d ${hours}h`;
  }

  if (elapsed >= HOUR_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }

  return `${Math.floor(elapsed / MINUTE_MS)}m`;
}
```

- [ ] **Step 8: Run to verify duration tests pass**

Run: `pnpm --filter @takeover/web test`
Expected: PASS.

- [ ] **Step 9: Write the failing color tests**

`apps/web/test/format/color.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeAccentColor } from '../../src/lib/format/color.js';

describe('sanitizeAccentColor', () => {
  it('accepts and normalizes a six-digit hex', () => {
    expect(sanitizeAccentColor('#AABBCC')).toBe('#aabbcc');
  });

  it('expands a three-digit hex', () => {
    expect(sanitizeAccentColor('#ABC')).toBe('#aabbcc');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeAccentColor('  #abcdef  ')).toBe('#abcdef');
  });

  it('rejects named colors', () => {
    expect(sanitizeAccentColor('red')).toBeNull();
  });

  it('rejects functional notation', () => {
    expect(sanitizeAccentColor('rgb(255,0,0)')).toBeNull();
  });

  it('rejects a css injection attempt', () => {
    expect(sanitizeAccentColor('#fff;background:url(https://evil.test)')).toBeNull();
  });

  it('rejects a javascript url', () => {
    expect(sanitizeAccentColor('javascript:alert(1)')).toBeNull();
  });

  it('rejects absent values', () => {
    expect(sanitizeAccentColor(null)).toBeNull();
    expect(sanitizeAccentColor(undefined)).toBeNull();
    expect(sanitizeAccentColor('')).toBeNull();
  });
});
```

- [ ] **Step 10: Run to verify failure**

Run: `pnpm --filter @takeover/web test`
Expected: FAIL — cannot resolve `../../src/lib/format/color.js`.

- [ ] **Step 11: Implement color sanitization**

`apps/web/src/lib/format/color.ts`:

```ts
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#[0-9a-f]{6}$/i;

/**
 * Validates an externally supplied brand color before it reaches the DOM.
 * Owner accents are decorative only, so anything unrecognized degrades to null
 * and the caller falls back to a neutral token.
 */
export function sanitizeAccentColor(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const candidate = value.trim().toLowerCase();
  if (candidate.length === 0) return null;

  if (LONG_HEX.test(candidate)) return candidate;

  const short = SHORT_HEX.exec(candidate);
  if (short !== null) {
    const [, r, g, b] = short;
    if (r === undefined || g === undefined || b === undefined) return null;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return null;
}
```

- [ ] **Step 12: Run the full suite**

Run: `pnpm --filter @takeover/web test && pnpm --filter @takeover/web typecheck && pnpm --filter @takeover/web lint`
Expected: all PASS, clean typecheck and lint.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/lib/format apps/web/test/format
git commit -m "feat(web): add money, duration, and accent color formatting utilities"
```

---

### Task 3: Provisional view models, fixtures, and the data-access seam

**Files:**

- Create: `apps/web/src/lib/view-models/{territory,company,leaderboard,activity}.ts`
- Create: `apps/web/src/lib/fixtures/{territories,companies,leaderboard,activity}.ts`
- Create: `apps/web/src/lib/data/{source,territories,companies,leaderboard,activity}.ts`
- Test: `apps/web/test/data/source.test.ts`

**Interfaces:**

- Consumes: `Money` from `@takeover/shared`
- Produces:
  - `TerritoryView`, `CompanyView`, `LeaderboardEntryView`, `ActivityEventView`
  - `resolveSource(resource: DataResource): DataSourceMode` where `DataResource = 'territories' | 'companies' | 'leaderboard' | 'activity'` and `DataSourceMode = 'fixture' | 'live'`
  - `getTerritories(): Promise<TerritoryView[]>`, `getTerritoryBySlug(slug: string): Promise<TerritoryView | null>`
  - `getCompanyBySlug(slug: string): Promise<CompanyView | null>`
  - `getLeaderboard(): Promise<LeaderboardEntryView[]>`
  - `getActivity(): Promise<ActivityEventView[]>`

- [ ] **Step 1: Create the provisional view models**

Every file in this directory opens with this exact header:

```ts
/**
 * PROVISIONAL PRESENTATION TYPE — NOT A DOMAIN CONTRACT.
 *
 * `@takeover/shared` does not yet publish domain contracts. This type exists so
 * the frontend can render while that gap is open, and is requested from Codex in
 * docs/MEMORY.md. Delete this file and import from `@takeover/shared` once the
 * canonical contract lands. Do not treat this shape as authoritative.
 */
```

`apps/web/src/lib/view-models/territory.ts`:

```ts
/**
 * PROVISIONAL PRESENTATION TYPE — NOT A DOMAIN CONTRACT.
 *
 * `@takeover/shared` does not yet publish domain contracts. This type exists so
 * the frontend can render while that gap is open, and is requested from Codex in
 * docs/MEMORY.md. Delete this file and import from `@takeover/shared` once the
 * canonical contract lands. Do not treat this shape as authoritative.
 */
import { type Money } from '@takeover/shared';
import { type CompanyRefView } from './company.js';

export type TerritoryStatus = 'unclaimed' | 'owned' | 'contested';

export type TerritoryView = {
  slug: string;
  name: string;
  category: string;
  status: TerritoryStatus;
  /** Present only when the territory is owned. */
  owner?: CompanyRefView;
  /** Current winning amount. Absent when unclaimed. */
  currentPriceMinor?: Money;
  /** Server-computed minimum required to take over. */
  minimumTakeoverMinor: Money;
  /** ISO 8601 UTC. Absent when unclaimed. */
  reignStartedAt?: string;
  captureCount: number;
  totalVolumeMinor: Money;
  /**
   * Authoritative presentation weight. Absent until Codex publishes it, at which
   * point it takes precedence over price for mosaic tier assignment.
   */
  displayWeight?: number;
};
```

`apps/web/src/lib/view-models/company.ts`:

```ts
/**
 * PROVISIONAL PRESENTATION TYPE — NOT A DOMAIN CONTRACT.
 *
 * `@takeover/shared` does not yet publish domain contracts. This type exists so
 * the frontend can render while that gap is open, and is requested from Codex in
 * docs/MEMORY.md. Delete this file and import from `@takeover/shared` once the
 * canonical contract lands. Do not treat this shape as authoritative.
 */
import { type Money } from '@takeover/shared';

/** Minimal company reference embedded in other views. */
export type CompanyRefView = {
  slug: string;
  name: string;
  /** Validated before use; may be absent. */
  logoUrl?: string;
  /** Raw brand color; always passed through sanitizeAccentColor before rendering. */
  accentColor?: string;
  isVerified: boolean;
};

export type CompanyView = CompanyRefView & {
  websiteUrl: string;
  description: string;
  territoriesHeld: number;
  captureCount: number;
  totalSpendMinor: Money;
  /** ISO 8601 UTC. */
  longestReignStartedAt?: string;
  longestReignEndedAt?: string;
};
```

`apps/web/src/lib/view-models/leaderboard.ts`:

```ts
/**
 * PROVISIONAL PRESENTATION TYPE — NOT A DOMAIN CONTRACT.
 *
 * `@takeover/shared` does not yet publish domain contracts. This type exists so
 * the frontend can render while that gap is open, and is requested from Codex in
 * docs/MEMORY.md. Delete this file and import from `@takeover/shared` once the
 * canonical contract lands. Do not treat this shape as authoritative.
 */
import { type Money } from '@takeover/shared';
import { type CompanyRefView } from './company.js';

export type LeaderboardEntryView = {
  rank: number;
  company: CompanyRefView;
  territoriesHeld: number;
  totalSpendMinor: Money;
};
```

`apps/web/src/lib/view-models/activity.ts`:

```ts
/**
 * PROVISIONAL PRESENTATION TYPE — NOT A DOMAIN CONTRACT.
 *
 * `@takeover/shared` does not yet publish domain contracts. This type exists so
 * the frontend can render while that gap is open, and is requested from Codex in
 * docs/MEMORY.md. Delete this file and import from `@takeover/shared` once the
 * canonical contract lands. Do not treat this shape as authoritative.
 */
import { type Money } from '@takeover/shared';
import { type CompanyRefView } from './company.js';

export type ActivityEventKind = 'captured' | 'contested' | 'milestone';

export type ActivityEventView = {
  id: string;
  kind: ActivityEventKind;
  /** ISO 8601 UTC. */
  occurredAt: string;
  territorySlug: string;
  territoryName: string;
  actor: CompanyRefView;
  displacedOwner?: CompanyRefView;
  amountMinor?: Money;
};
```

- [ ] **Step 2: Write the failing source-switch test**

`apps/web/test/data/source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveSource } from '../../src/lib/data/source.js';

describe('resolveSource', () => {
  it('returns fixture for every resource while no product API exists', () => {
    expect(resolveSource('territories')).toBe('fixture');
    expect(resolveSource('companies')).toBe('fixture');
    expect(resolveSource('leaderboard')).toBe('fixture');
    expect(resolveSource('activity')).toBe('fixture');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @takeover/web test`
Expected: FAIL — cannot resolve `../../src/lib/data/source.js`.

- [ ] **Step 4: Implement the per-resource switch**

`apps/web/src/lib/data/source.ts`:

```ts
export type DataResource = 'territories' | 'companies' | 'leaderboard' | 'activity';
export type DataSourceMode = 'fixture' | 'live';

/**
 * Per-resource source switch.
 *
 * Each resource flips to 'live' independently as Codex lands its endpoint, so
 * the frontend never maintains two parallel implementations. Every entry is
 * 'fixture' today because `apps/api` exposes only /health and /ready.
 */
const SOURCE_BY_RESOURCE: Record<DataResource, DataSourceMode> = {
  territories: 'fixture',
  companies: 'fixture',
  leaderboard: 'fixture',
  activity: 'fixture',
};

export function resolveSource(resource: DataResource): DataSourceMode {
  return SOURCE_BY_RESOURCE[resource];
}
```

- [ ] **Step 5: Run to verify the test passes**

Run: `pnpm --filter @takeover/web test`
Expected: PASS.

- [ ] **Step 6: Create the fixtures**

Every fixture file opens with:

```ts
/**
 * DEVELOPMENT-ONLY FIXTURE DATA — NOT PRODUCTION DATA.
 *
 * Reached only through src/lib/data/*. Never import this from a component.
 * These records must never depict payment, verification, ownership, or
 * authentication as successful. Delete once real endpoints exist.
 */
```

`apps/web/src/lib/fixtures/companies.ts` defines a `COMPANY_FIXTURES: Record<string, CompanyView>` keyed by slug, with at least six companies. Each uses `createMoney(...)` for money fields, a valid `#rrggbb` `accentColor` for some and an intentionally invalid value for exactly one (so sanitization is exercised in real rendering), and `isVerified` mixed true/false.

`apps/web/src/lib/fixtures/territories.ts` defines `TERRITORY_FIXTURES: TerritoryView[]` with at least fourteen territories spanning the categories in the product brief (AI Coding, AI Image Generation, AI Video, Design, DevTools, Productivity, Hosting, Analytics, Marketing, Social Media, Finance, E-commerce, Automation, Search, Databases). Include at least one `unclaimed`, at least two `contested`, and a wide spread of `currentPriceMinor` so tier assignment is visibly meaningful. Do not set `displayWeight` — it must remain absent so the fallback path is the one exercised.

`apps/web/src/lib/fixtures/leaderboard.ts` and `activity.ts` define `LEADERBOARD_FIXTURES: LeaderboardEntryView[]` (ranks starting at 1, ordered) and `ACTIVITY_FIXTURES: ActivityEventView[]` (descending `occurredAt`, referencing only slugs that exist in the other fixtures).

- [ ] **Step 7: Implement the data-access functions**

`apps/web/src/lib/data/territories.ts`:

```ts
import { type TerritoryView } from '../view-models/territory.js';
import { TERRITORY_FIXTURES } from '../fixtures/territories.js';
import { resolveSource } from './source.js';

/**
 * Pages depend on these functions, never on fixtures or fetch directly.
 * When `resolveSource` returns 'live', the fixture branch is replaced here.
 */
export async function getTerritories(): Promise<TerritoryView[]> {
  if (resolveSource('territories') === 'fixture') {
    return TERRITORY_FIXTURES;
  }
  throw new Error('Live territories source is not implemented yet');
}

export async function getTerritoryBySlug(slug: string): Promise<TerritoryView | null> {
  const territories = await getTerritories();
  return territories.find((territory) => territory.slug === slug) ?? null;
}
```

Follow the identical shape in `companies.ts` (`getCompanyBySlug`), `leaderboard.ts` (`getLeaderboard`), and `activity.ts` (`getActivity`). Each throws an explicit "not implemented yet" error on the live branch rather than silently returning empty data.

- [ ] **Step 8: Verify**

Run: `pnpm --filter @takeover/web test && pnpm --filter @takeover/web typecheck && pnpm --filter @takeover/web lint`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib apps/web/test/data
git commit -m "feat(web): add provisional view models, fixtures, and data-access seam"
```

---

### Task 4: Mosaic tier assignment (TDD)

**Files:**

- Create: `apps/web/src/lib/board/tiers.ts`
- Test: `apps/web/test/board/tiers.test.ts`

**Interfaces:**

- Consumes: `TerritoryView`
- Produces:
  - `type TerritoryTier = 'flagship' | 'major' | 'standard'`
  - `weightOf(territory: TerritoryView): number`
  - `assignTiers(territories: TerritoryView[]): Array<{ territory: TerritoryView; tier: TerritoryTier }>`

- [ ] **Step 1: Write the failing tier tests**

`apps/web/test/board/tiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMoney } from '@takeover/shared';
import { type TerritoryView } from '../../src/lib/view-models/territory.js';
import { assignTiers, weightOf } from '../../src/lib/board/tiers.js';

function territory(slug: string, priceMinor: number, displayWeight?: number): TerritoryView {
  const base: TerritoryView = {
    slug,
    name: slug,
    category: 'test',
    status: 'owned',
    currentPriceMinor: createMoney(priceMinor, 'USD'),
    minimumTakeoverMinor: createMoney(priceMinor + 1000, 'USD'),
    captureCount: 0,
    totalVolumeMinor: createMoney(priceMinor, 'USD'),
  };
  return displayWeight === undefined ? base : { ...base, displayWeight };
}

describe('weightOf', () => {
  it('prefers an authoritative displayWeight when present', () => {
    expect(weightOf(territory('a', 1000, 999))).toBe(999);
  });

  it('falls back to the current price when displayWeight is absent', () => {
    expect(weightOf(territory('a', 1000))).toBe(1000);
  });

  it('treats an unclaimed territory with no price as zero weight', () => {
    const unclaimed: TerritoryView = {
      slug: 'open',
      name: 'open',
      category: 'test',
      status: 'unclaimed',
      minimumTakeoverMinor: createMoney(1000, 'USD'),
      captureCount: 0,
      totalVolumeMinor: createMoney(0, 'USD'),
    };
    expect(weightOf(unclaimed)).toBe(0);
  });
});

describe('assignTiers', () => {
  it('returns an empty array unchanged', () => {
    expect(assignTiers([])).toEqual([]);
  });

  it('marks everything standard below the minimum board size', () => {
    const result = assignTiers([territory('a', 300), territory('b', 200)]);
    expect(result.map((entry) => entry.tier)).toEqual(['standard', 'standard']);
  });

  it('orders by weight descending', () => {
    const result = assignTiers([territory('low', 100), territory('high', 900)]);
    expect(result.map((entry) => entry.territory.slug)).toEqual(['high', 'low']);
  });

  it('assigns one flagship and one major on a ten-territory board', () => {
    const territories = Array.from({ length: 10 }, (_, index) =>
      territory(`t${index}`, (10 - index) * 1000),
    );
    const tiers = assignTiers(territories).map((entry) => entry.tier);
    expect(tiers.filter((tier) => tier === 'flagship')).toHaveLength(1);
    expect(tiers.filter((tier) => tier === 'major')).toHaveLength(2);
    expect(tiers.filter((tier) => tier === 'standard')).toHaveLength(7);
  });

  it('keeps the board legible at one hundred territories', () => {
    const territories = Array.from({ length: 100 }, (_, index) =>
      territory(`t${index}`, (100 - index) * 100),
    );
    const tiers = assignTiers(territories).map((entry) => entry.tier);
    expect(tiers.filter((tier) => tier === 'flagship')).toHaveLength(5);
    expect(tiers.filter((tier) => tier === 'major')).toHaveLength(15);
  });

  it('breaks weight ties by slug so server and client agree', () => {
    const result = assignTiers([territory('zebra', 500), territory('alpha', 500)]);
    expect(result.map((entry) => entry.territory.slug)).toEqual(['alpha', 'zebra']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @takeover/web test`
Expected: FAIL — cannot resolve `../../src/lib/board/tiers.js`.

- [ ] **Step 3: Implement tier assignment**

`apps/web/src/lib/board/tiers.ts`:

```ts
import { type TerritoryView } from '../view-models/territory.js';

export type TerritoryTier = 'flagship' | 'major' | 'standard';

/** Boards smaller than this render uniformly; size contrast needs a population. */
const MIN_BOARD_SIZE_FOR_TIERS = 3;
const FLAGSHIP_SHARE = 0.05;
const MAJOR_SHARE = 0.15;

/**
 * Presentation weight for mosaic sizing.
 *
 * TEMPORARY HEURISTIC. Prefers the authoritative `displayWeight` when Codex
 * publishes it, and falls back to current price only until then. Tile
 * prominence is presentation, never product truth.
 */
export function weightOf(territory: TerritoryView): number {
  if (territory.displayWeight !== undefined) return territory.displayWeight;
  return territory.currentPriceMinor?.amountMinor ?? 0;
}

/**
 * Sorts territories by weight and assigns mosaic tiers.
 *
 * Ties break on slug so server and client render identical layouts. Position in
 * the resulting mosaic carries no gameplay meaning.
 */
export function assignTiers(
  territories: TerritoryView[],
): Array<{ territory: TerritoryView; tier: TerritoryTier }> {
  const ordered = [...territories].sort((left, right) => {
    const delta = weightOf(right) - weightOf(left);
    return delta !== 0 ? delta : left.slug.localeCompare(right.slug);
  });

  if (ordered.length < MIN_BOARD_SIZE_FOR_TIERS) {
    return ordered.map((territory) => ({ territory, tier: 'standard' as const }));
  }

  const flagshipCount = Math.max(1, Math.ceil(ordered.length * FLAGSHIP_SHARE));
  const majorCount = Math.max(1, Math.ceil(ordered.length * MAJOR_SHARE));

  return ordered.map((territory, index) => {
    if (index < flagshipCount) return { territory, tier: 'flagship' as const };
    if (index < flagshipCount + majorCount) return { territory, tier: 'major' as const };
    return { territory, tier: 'standard' as const };
  });
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `pnpm --filter @takeover/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/board apps/web/test/board
git commit -m "feat(web): add value mosaic tier assignment"
```

---

### Task 5: Navigation shell

**Files:**

- Create: `apps/web/src/components/layout/site-header.tsx`
- Create: `apps/web/src/components/layout/site-footer.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**

- Consumes: `SITE` from `@/lib/site`
- Produces: `<SiteHeader />`, `<SiteFooter />`, and a `<main id="main-content">` landmark satisfying the existing skip-link contract

Navigation omits sign-in and register entirely — V1 has no accounts. `Manage` is the passwordless entry point.

- [ ] **Step 1: Create the header**

`apps/web/src/components/layout/site-header.tsx`:

```tsx
import Link from 'next/link';
import { SITE } from '@/lib/site';

const NAV_LINKS = [
  { href: '/territories', label: 'Territories' },
  { href: '/leaderboard', label: 'Leaderboard' },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--color-border)]">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
      >
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight"
        >
          {SITE.name}
        </Link>

        <ul className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/manage"
              className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Manage
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Create the footer**

`apps/web/src/components/layout/site-footer.tsx`:

```tsx
import { SITE } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] px-4 py-6 sm:px-6">
      <p className="mx-auto max-w-7xl text-sm text-[var(--color-muted)]">
        {SITE.name} — {SITE.tagline}
      </p>
    </footer>
  );
}
```

- [ ] **Step 3: Wire the shell into the root layout**

In `layout.tsx`, keep the existing skip link and font variables, and wrap children:

```tsx
<body>
  <a className="skip-link" href="#main-content">
    Skip to content
  </a>
  <div className="flex min-h-screen flex-col">
    <SiteHeader />
    <main id="main-content" className="flex-1">
      {children}
    </main>
    <SiteFooter />
  </div>
</body>
```

Add the imports:

```tsx
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @takeover/web typecheck && pnpm --filter @takeover/web lint && pnpm --filter @takeover/web build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout apps/web/src/app/layout.tsx
git commit -m "feat(web): add navigation shell and main landmark"
```

---

### Task 6: Territory card and the Value Mosaic

**Files:**

- Create: `apps/web/src/components/territory/territory-card.tsx`
- Create: `apps/web/src/components/territory/territory-mosaic.tsx`
- Create: `apps/web/src/components/ui/price.tsx`

**Interfaces:**

- Consumes: `assignTiers`, `formatMoneyCompact`, `formatReign`, `sanitizeAccentColor`, `TerritoryView`
- Produces: `<TerritoryMosaic territories={...} />`, `<TerritoryCard territory={...} tier={...} />`, `<Price money={...} />`

**Design decision:** the card's `TAKE OVER` is a link to `/territory/[slug]?takeover=1` rather than a client-side modal trigger. This keeps the entire board server-rendered with zero client JavaScript per tile, which is what makes the board fast at 100+ territories.

- [ ] **Step 1: Create the price primitive**

`apps/web/src/components/ui/price.tsx`:

```tsx
import { type Money } from '@takeover/shared';
import { formatMoney, formatMoneyCompact } from '@/lib/format/money';

type PriceProps = {
  money: Money;
  compact?: boolean;
  className?: string;
};

/** Renders money in the mono face so digits align across tiles and rows. */
export function Price({ money, compact = false, className = '' }: PriceProps) {
  const text = compact ? formatMoneyCompact(money) : formatMoney(money);
  return (
    <span className={`font-[family-name:var(--font-mono)] tabular-nums ${className}`}>{text}</span>
  );
}
```

- [ ] **Step 2: Create the territory card**

`apps/web/src/components/territory/territory-card.tsx`:

```tsx
import Link from 'next/link';
import { type CSSProperties } from 'react';
import { Price } from '@/components/ui/price';
import { sanitizeAccentColor } from '@/lib/format/color';
import { formatReign } from '@/lib/format/duration';
import { type TerritoryTier } from '@/lib/board/tiers';
import { type TerritoryView } from '@/lib/view-models/territory';

type TerritoryCardProps = {
  territory: TerritoryView;
  tier: TerritoryTier;
  nowMs: number;
};

const STATUS_LABEL: Record<TerritoryView['status'], string> = {
  unclaimed: 'Unclaimed',
  owned: 'Owned',
  contested: 'Contested',
};

export function TerritoryCard({ territory, tier, nowMs }: TerritoryCardProps) {
  const accent = sanitizeAccentColor(territory.owner?.accentColor);
  const isContested = territory.status === 'contested';
  const isFlagship = tier === 'flagship';

  // Decorative only: the accent tints a corner bleed, never text or state.
  const style: CSSProperties | undefined =
    accent === null ? undefined : ({ ['--tile-accent']: accent } as CSSProperties);

  return (
    <article
      style={style}
      className={[
        'relative flex h-full flex-col justify-between overflow-hidden',
        'rounded-[var(--radius-tile)] bg-[var(--color-surface)] p-4',
        isContested
          ? 'border-2 border-[var(--color-contested)]'
          : 'border border-[var(--color-border)]',
      ].join(' ')}
    >
      {accent !== null && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
          style={{ background: 'var(--tile-accent)' }}
        />
      )}

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={[
              'font-[family-name:var(--font-display)] font-semibold tracking-tight',
              isFlagship ? 'text-2xl' : 'text-base',
            ].join(' ')}
          >
            <Link href={`/territory/${territory.slug}`} className="hover:underline">
              {territory.name}
            </Link>
          </h3>
          <span
            className={[
              'shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-xs',
              isContested
                ? 'bg-[var(--color-contested)] text-[#09090b]'
                : 'border border-[var(--color-border)] text-[var(--color-muted)]',
            ].join(' ')}
          >
            {STATUS_LABEL[territory.status]}
          </span>
        </div>

        <p className="mt-1 text-xs uppercase tracking-wide text-[var(--color-muted)]">
          {territory.category}
        </p>

        <p className="mt-3 text-sm">
          {territory.owner === undefined ? (
            <span className="text-[var(--color-unclaimed)]">No owner yet</span>
          ) : (
            <>
              <span aria-hidden="true">👑 </span>
              <Link href={`/company/${territory.owner.slug}`} className="hover:underline">
                {territory.owner.name}
              </Link>
              {territory.owner.isVerified && (
                <span className="ml-1 text-xs text-[var(--color-muted)]">Verified</span>
              )}
            </>
          )}
        </p>
      </div>

      <div className="relative mt-4">
        {territory.currentPriceMinor !== undefined && (
          <p className="text-sm text-[var(--color-muted)]">
            Current <Price money={territory.currentPriceMinor} compact />
          </p>
        )}
        <p className="text-sm">
          Takeover{' '}
          <Price
            money={territory.minimumTakeoverMinor}
            compact
            className="text-base font-semibold"
          />
        </p>
        {territory.reignStartedAt !== undefined && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Reign {formatReign(territory.reignStartedAt, nowMs)}
          </p>
        )}

        <Link
          href={`/territory/${territory.slug}?takeover=1`}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-foreground)] px-3 text-sm font-semibold text-[#09090b] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          TAKE OVER
        </Link>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Create the mosaic**

`apps/web/src/components/territory/territory-mosaic.tsx`:

```tsx
import { TerritoryCard } from './territory-card';
import { assignTiers, type TerritoryTier } from '@/lib/board/tiers';
import { type TerritoryView } from '@/lib/view-models/territory';

const TIER_SPAN: Record<TerritoryTier, string> = {
  flagship: 'col-span-2 row-span-2',
  major: 'col-span-2 row-span-1',
  standard: 'col-span-1 row-span-1',
};

type TerritoryMosaicProps = {
  territories: TerritoryView[];
};

/**
 * Value Mosaic: tile size encodes territory importance.
 *
 * Position and physical adjacency carry NO gameplay meaning. Layout is pure CSS
 * grid with dense packing, so the board is fully server-rendered with no layout
 * measurement and no cumulative layout shift.
 */
export function TerritoryMosaic({ territories }: TerritoryMosaicProps) {
  if (territories.length === 0) {
    return (
      <p className="rounded-[var(--radius-tile)] border border-[var(--color-border)] p-8 text-center text-[var(--color-muted)]">
        No territories are available yet.
      </p>
    );
  }

  const entries = assignTiers(territories);
  const nowMs = Date.now();

  return (
    <ul className="grid auto-rows-[minmax(11rem,auto)] grid-cols-2 gap-3 [grid-auto-flow:dense] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {entries.map(({ territory, tier }) => (
        <li key={territory.slug} className={TIER_SPAN[tier]}>
          <TerritoryCard territory={territory} tier={tier} nowMs={nowMs} />
        </li>
      ))}
    </ul>
  );
}
```

At the 2-column base this is the approved ranked variable-size feed: flagship and major become full width, standard half width, with no horizontal scrolling.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @takeover/web typecheck && pnpm --filter @takeover/web lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): add territory card and value mosaic board"
```

---

### Task 7: Homepage and activity rail

**Files:**

- Create: `apps/web/src/components/activity/activity-rail.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/loading.tsx`, `apps/web/src/app/error.tsx`

**Interfaces:**

- Consumes: `getTerritories`, `getActivity`
- Produces: the homepage — one compact intro line, then the live product

- [ ] **Step 1: Create the activity rail**

`apps/web/src/components/activity/activity-rail.tsx`:

```tsx
import Link from 'next/link';
import { Price } from '@/components/ui/price';
import { type ActivityEventView } from '@/lib/view-models/activity';

const KIND_ICON: Record<ActivityEventView['kind'], string> = {
  captured: '🔥',
  contested: '⚔️',
  milestone: '🏆',
};

export function ActivityRail({ events }: { events: ActivityEventView[] }) {
  return (
    <section aria-labelledby="activity-heading" className="lg:sticky lg:top-4">
      <h2
        id="activity-heading"
        className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]"
      >
        Live activity
      </h2>

      {events.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]">No activity recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {events.map((event) => (
            <li key={event.id} className="text-sm">
              <span aria-hidden="true">{KIND_ICON[event.kind]} </span>
              <Link href={`/company/${event.actor.slug}`} className="font-medium hover:underline">
                {event.actor.name}
              </Link>{' '}
              captured{' '}
              <Link href={`/territory/${event.territorySlug}`} className="hover:underline">
                {event.territoryName}
              </Link>
              {event.amountMinor !== undefined && (
                <>
                  {' for '}
                  <Price money={event.amountMinor} compact />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Rewrite the homepage**

`apps/web/src/app/page.tsx`:

```tsx
import { ActivityRail } from '@/components/activity/activity-rail';
import { TerritoryMosaic } from '@/components/territory/territory-mosaic';
import { getActivity } from '@/lib/data/activity';
import { getTerritories } from '@/lib/data/territories';
import { SITE } from '@/lib/site';

export default async function HomePage() {
  const [territories, events] = await Promise.all([getTerritories(), getActivity()]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
        {SITE.tagline}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        One company holds each territory. Beat the price to take it.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_18rem]">
        <TerritoryMosaic territories={territories} />
        <ActivityRail events={events} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add route boundaries**

`apps/web/src/app/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <p className="text-sm text-[var(--color-muted)]">Loading territories…</p>
      <div
        aria-hidden="true"
        className="mt-6 grid auto-rows-[minmax(11rem,auto)] grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        {Array.from({ length: 12 }, (_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-[var(--radius-tile)] border border-[var(--color-border)] bg-[var(--color-surface)]"
          />
        ))}
      </div>
    </div>
  );
}
```

`apps/web/src/app/error.tsx`:

```tsx
'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold">
        The board could not be loaded
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        This is a display problem. No territory, price, or ownership was affected.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-surface)]"
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @takeover/web build && pnpm --filter @takeover/web lint`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add homepage board, activity rail, and route boundaries"
```

---

### Task 8: Territories index and territory detail

**Files:**

- Create: `apps/web/src/app/territories/page.tsx`
- Create: `apps/web/src/app/territory/[slug]/page.tsx`
- Create: `apps/web/src/app/territory/[slug]/not-found.tsx`

**Interfaces:**

- Consumes: `getTerritories`, `getTerritoryBySlug`, `TerritoryMosaic`
- Produces: indexable territory pages with metadata

- [ ] **Step 1: Create the territories index**

`apps/web/src/app/territories/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { TerritoryMosaic } from '@/components/territory/territory-mosaic';
import { getTerritories } from '@/lib/data/territories';
import { buildPageTitle } from '@/lib/site';

export const metadata: Metadata = {
  title: buildPageTitle('Territories'),
  description: 'Every internet territory on TakeOver, who controls it, and what it costs to win.',
};

export default async function TerritoriesPage() {
  const territories = await getTerritories();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Territories
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        {territories.length} territories. Tile size reflects value, not adjacency.
      </p>
      <div className="mt-6">
        <TerritoryMosaic territories={territories} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the territory detail page**

Next.js 15 makes route `params` a promise; await it.

`apps/web/src/app/territory/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TakeoverPanel } from '@/components/takeover/takeover-panel';
import { Price } from '@/components/ui/price';
import { formatReign } from '@/lib/format/duration';
import { getTerritoryBySlug } from '@/lib/data/territories';
import { buildPageTitle } from '@/lib/site';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const territory = await getTerritoryBySlug(slug);
  if (territory === null) return { title: buildPageTitle('Territory not found') };

  return {
    title: buildPageTitle(territory.name),
    description: `${territory.name} on TakeOver. See who controls it and what it costs to take over.`,
  };
}

export default async function TerritoryPage({ params }: PageProps) {
  const { slug } = await params;
  const territory = await getTerritoryBySlug(slug);
  if (territory === null) notFound();

  const nowMs = Date.now();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-28 sm:px-6 lg:pb-6">
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
        {territory.category}
      </p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
        {territory.name}
      </h1>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-[var(--color-muted)]">Current owner</dt>
          <dd className="mt-1">
            {territory.owner === undefined ? (
              <span className="text-[var(--color-unclaimed)]">Unclaimed</span>
            ) : (
              <Link href={`/company/${territory.owner.slug}`} className="hover:underline">
                👑 {territory.owner.name}
              </Link>
            )}
          </dd>
        </div>

        {territory.currentPriceMinor !== undefined && (
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Current winning amount</dt>
            <dd className="mt-1">
              <Price money={territory.currentPriceMinor} />
            </dd>
          </div>
        )}

        <div>
          <dt className="text-sm text-[var(--color-muted)]">Minimum takeover</dt>
          <dd className="mt-1">
            <Price money={territory.minimumTakeoverMinor} className="text-lg font-semibold" />
          </dd>
        </div>

        {territory.reignStartedAt !== undefined && (
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Current reign</dt>
            <dd className="mt-1">{formatReign(territory.reignStartedAt, nowMs)}</dd>
          </div>
        )}

        <div>
          <dt className="text-sm text-[var(--color-muted)]">Captures</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)]">{territory.captureCount}</dd>
        </div>

        <div>
          <dt className="text-sm text-[var(--color-muted)]">Total volume</dt>
          <dd className="mt-1">
            <Price money={territory.totalVolumeMinor} />
          </dd>
        </div>
      </dl>

      <TakeoverPanel territory={territory} />
    </div>
  );
}
```

- [ ] **Step 3: Create the not-found boundary**

`apps/web/src/app/territory/[slug]/not-found.tsx`:

```tsx
import Link from 'next/link';

export default function TerritoryNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold">
        That territory does not exist
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">It may have been renamed or removed.</p>
      <Link
        href="/territories"
        className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-surface)]"
      >
        Browse all territories
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Verify after Task 9 supplies `TakeoverPanel`**

`TerritoryPage` imports `TakeoverPanel`, which Task 9 creates. Implement Task 9 before running the build, or temporarily omit the `<TakeoverPanel />` line and restore it in Task 9.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app
git commit -m "feat(web): add territories index and territory detail pages"
```

---

### Task 9: Takeover flow with an honest payment boundary (TDD)

**Files:**

- Create: `apps/web/src/lib/takeover/stale-price.ts`
- Create: `apps/web/src/components/takeover/takeover-panel.tsx`
- Modify: `apps/web/src/app/territory/[slug]/page.tsx`
- Test: `apps/web/test/takeover/stale-price.test.ts`

**Interfaces:**

- Consumes: `TerritoryView`, `Money`, `formatMoney`
- Produces:
  - `isStalePrice(reviewedMinimum: Money, currentMinimum: Money): boolean`
  - `<TakeoverPanel territory={...} defaultOpen={...} />`

This flow must never imply authentication, verification, payment success, ownership change, or rank movement. It terminates in a labeled payment-not-connected state.

- [ ] **Step 1: Write the failing stale-price tests**

`apps/web/test/takeover/stale-price.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMoney } from '@takeover/shared';
import { isStalePrice } from '../../src/lib/takeover/stale-price.js';

describe('isStalePrice', () => {
  it('is not stale when the minimum is unchanged', () => {
    expect(isStalePrice(createMoney(43000, 'USD'), createMoney(43000, 'USD'))).toBe(false);
  });

  it('is stale when the required minimum has risen', () => {
    expect(isStalePrice(createMoney(43000, 'USD'), createMoney(44000, 'USD'))).toBe(true);
  });

  it('is stale when the required minimum has fallen', () => {
    expect(isStalePrice(createMoney(43000, 'USD'), createMoney(42000, 'USD'))).toBe(true);
  });

  it('treats a currency change as stale rather than comparing amounts', () => {
    expect(isStalePrice(createMoney(43000, 'USD'), createMoney(43000, 'EUR'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @takeover/web test`
Expected: FAIL — cannot resolve `../../src/lib/takeover/stale-price.js`.

- [ ] **Step 3: Implement the comparison**

`apps/web/src/lib/takeover/stale-price.ts`:

```ts
import { type Money } from '@takeover/shared';

/**
 * True when the amount the user reviewed no longer matches the authoritative
 * minimum. Any difference — including a currency change or a decrease — requires
 * fresh review. A revised amount is never charged automatically.
 */
export function isStalePrice(reviewedMinimum: Money, currentMinimum: Money): boolean {
  if (reviewedMinimum.currency !== currentMinimum.currency) return true;
  return reviewedMinimum.amountMinor !== currentMinimum.amountMinor;
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `pnpm --filter @takeover/web test`
Expected: PASS.

- [ ] **Step 5: Build the takeover panel**

Uses the native `<dialog>` element so focus trapping, Escape handling, and focus restoration come from the platform rather than hand-rolled code.

`apps/web/src/components/takeover/takeover-panel.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Price } from '@/components/ui/price';
import { type TerritoryView } from '@/lib/view-models/territory';

type Step = 'review' | 'company' | 'blocked';

type TakeoverPanelProps = {
  territory: TerritoryView;
  defaultOpen?: boolean;
};

export function TakeoverPanel({ territory, defaultOpen = false }: TakeoverPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>('review');

  useEffect(() => {
    if (defaultOpen) dialogRef.current?.showModal();
  }, [defaultOpen]);

  function open() {
    setStep('review');
    dialogRef.current?.showModal();
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--color-border)] bg-[var(--color-background)] p-4 lg:static lg:mt-8 lg:border-0 lg:p-0">
        <button
          type="button"
          onClick={open}
          className="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-foreground)] px-4 font-semibold text-[#09090b] hover:opacity-90 lg:w-auto"
        >
          TAKE OVER FOR{' '}
          <Price money={territory.minimumTakeoverMinor} className="ml-2 text-[#09090b]" />
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="takeover-title"
        className="w-[min(32rem,92vw)] rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] backdrop:bg-black/70"
      >
        <h2
          id="takeover-title"
          className="font-[family-name:var(--font-display)] text-xl font-bold"
        >
          Take over {territory.name}
        </h2>

        {step === 'review' && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="flex justify-between">
              <span className="text-[var(--color-muted)]">Current owner</span>
              <span>{territory.owner?.name ?? 'Unclaimed'}</span>
            </p>
            {territory.currentPriceMinor !== undefined && (
              <p className="flex justify-between">
                <span className="text-[var(--color-muted)]">Current amount</span>
                <Price money={territory.currentPriceMinor} />
              </p>
            )}
            <p className="flex justify-between border-t border-[var(--color-border)] pt-2 font-semibold">
              <span>Minimum to take over</span>
              <Price money={territory.minimumTakeoverMinor} />
            </p>
            <p className="pt-2 text-xs text-[var(--color-muted)]">
              The final amount is calculated by the server when you submit. Capturing this territory
              removes its current owner.
            </p>
            <button
              type="button"
              onClick={() => setStep('company')}
              className="mt-4 min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--color-foreground)] font-semibold text-[#09090b]"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'company' && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-[var(--color-muted)]">
              No account needed. Tell us which company is capturing this territory.
            </p>
            {(
              [
                { id: 'company-name', label: 'Company name', type: 'text' },
                { id: 'company-website', label: 'Website', type: 'url' },
                { id: 'company-email', label: 'Contact email', type: 'email' },
              ] as const
            ).map((field) => (
              <div key={field.id}>
                <label htmlFor={field.id} className="block text-xs text-[var(--color-muted)]">
                  {field.label}
                </label>
                <input
                  id={field.id}
                  type={field.type}
                  disabled
                  className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 disabled:opacity-60"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setStep('blocked')}
              className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--color-foreground)] font-semibold text-[#09090b]"
            >
              Continue to payment
            </button>
          </div>
        )}

        {step === 'blocked' && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="rounded-[var(--radius-control)] border border-[var(--color-warning)] p-3">
              <strong className="block">Payment is not connected yet.</strong>
              Capture cannot be completed. No payment was taken, no company was created, and
              ownership of {territory.name} has not changed.
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              This flow is complete up to the payment boundary. The takeover and payment endpoints
              are still being built.
            </p>
          </div>
        )}

        <form method="dialog" className="mt-6">
          <button
            type="submit"
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] text-sm"
          >
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}
```

The company inputs are `disabled` on purpose: collecting details that cannot be submitted would imply a working flow. They demonstrate the step honestly without pretending to accept data.

- [ ] **Step 6: Pass `defaultOpen` from the route**

In `apps/web/src/app/territory/[slug]/page.tsx`, extend `PageProps` and pass the flag:

```tsx
type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
```

Inside the component, after resolving `params`:

```tsx
const query = await searchParams;
const defaultOpen = query.takeover === '1';
```

And render `<TakeoverPanel territory={territory} defaultOpen={defaultOpen} />`.

`generateMetadata` keeps its existing single-argument signature.

- [ ] **Step 7: Verify**

Run: `pnpm --filter @takeover/web test && pnpm --filter @takeover/web typecheck && pnpm --filter @takeover/web lint && pnpm --filter @takeover/web build`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src apps/web/test/takeover
git commit -m "feat(web): add takeover flow with honest payment boundary"
```

---

### Task 10: Company profile and leaderboard

**Files:**

- Create: `apps/web/src/app/company/[slug]/page.tsx`
- Create: `apps/web/src/app/company/[slug]/not-found.tsx`
- Create: `apps/web/src/app/leaderboard/page.tsx`

**Interfaces:**

- Consumes: `getCompanyBySlug`, `getLeaderboard`, `Price`
- Produces: indexable company and leaderboard pages

- [ ] **Step 1: Create the company profile**

`apps/web/src/app/company/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Price } from '@/components/ui/price';
import { getCompanyBySlug } from '@/lib/data/companies';
import { buildPageTitle } from '@/lib/site';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (company === null) return { title: buildPageTitle('Company not found') };

  return {
    title: buildPageTitle(company.name),
    description: `${company.name} on TakeOver — territories controlled, captures, and total spend.`,
  };
}

export default async function CompanyPage({ params }: PageProps) {
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (company === null) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
        {company.name}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        {company.isVerified ? 'Verified' : 'Not verified'} ·{' '}
        <a href={company.websiteUrl} rel="nofollow noopener noreferrer" className="hover:underline">
          {company.websiteUrl}
        </a>
      </p>
      <p className="mt-4 max-w-2xl text-sm">{company.description}</p>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-[var(--color-muted)]">Territories held</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)] text-2xl">
            {company.territoriesHeld}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--color-muted)]">Total captures</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)] text-2xl">
            {company.captureCount}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--color-muted)]">Total spend</dt>
          <dd className="mt-1 text-2xl">
            <Price money={company.totalSpendMinor} compact />
          </dd>
        </div>
      </dl>
    </div>
  );
}
```

External company websites use `rel="nofollow noopener noreferrer"`, per the rule that TakeOver's own loop stays primary and outbound links are untrusted.

- [ ] **Step 2: Create the company not-found boundary**

`apps/web/src/app/company/[slug]/not-found.tsx` mirrors the territory not-found page, with the heading "That company does not exist" and a link to `/leaderboard` labelled "View the leaderboard".

- [ ] **Step 3: Create the leaderboard**

`apps/web/src/app/leaderboard/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Price } from '@/components/ui/price';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { buildPageTitle } from '@/lib/site';

export const metadata: Metadata = {
  title: buildPageTitle('Leaderboard'),
  description: 'The companies controlling the most internet territory on TakeOver.',
};

const RANK_ACCENT: Record<number, string> = {
  1: 'text-[var(--color-premium)]',
  2: 'text-[var(--color-foreground)]',
  3: 'text-[var(--color-challenger)]',
};

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Leaderboard
      </h1>

      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--color-muted)]">
          No company has captured a territory yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.company.slug}
              className="flex items-center gap-4 rounded-[var(--radius-tile)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <span
                className={`w-10 shrink-0 font-[family-name:var(--font-mono)] text-2xl font-bold ${RANK_ACCENT[entry.rank] ?? 'text-[var(--color-muted)]'}`}
              >
                {entry.rank}
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  href={`/company/${entry.company.slug}`}
                  className="font-medium hover:underline"
                >
                  {entry.company.name}
                </Link>
                <span className="block text-xs text-[var(--color-muted)]">
                  {entry.territoriesHeld} territories
                </span>
              </span>
              <Price money={entry.totalSpendMinor} compact className="shrink-0 text-sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

A list of rows rather than a table, so it stays readable at 320px without horizontal scrolling.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @takeover/web build && pnpm --filter @takeover/web lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app
git commit -m "feat(web): add company profile and leaderboard pages"
```

---

### Task 11: Company claim and management surfaces (Phase 1 aligned)

> **BLOCKED as of 2026-08-30.** Realigned to `docs/superpowers/specs/2026-08-29-phase-1-company-claim-identity-design.md`. Do not implement until Codex publishes the Phase 1 shared schemas in `@takeover/shared` and resolves the open TTL, collision, draft-checkout, and recovery questions — each of those determines UI copy and state. The step code below is a starting point, not a finished design.

**Files:**

- Create: `apps/web/src/app/manage/page.tsx`
- Create: `apps/web/src/app/manage/exchange/page.tsx`
- Create: `apps/web/src/app/manage/access-requests/[id]/page.tsx`
- Create: `apps/web/src/components/manage/management-link-form.tsx`

**Interfaces:**

- Produces: the four company-claim surfaces that replace the cancelled auth screens

There is no login, signup, forgot-password, or reset-password screen anywhere in this milestone, and no screen may imply an account exists.

**Non-negotiable constraints carried from the Phase 1 spec:**

1. **No state change on `GET`.** `/manage/exchange` and the access-request page establish a session and render a confirmation screen. Approval and rejection are explicit mutations with CSRF and Origin protection. Prefetchers and email scanners issue `GET`, so a link that approves on load is a correctness bug.
2. **Scrub the secret.** After exchange, replace the URL so the token leaves browser history. Never log, render, or send it to analytics.
3. **Enumeration resistance.** Show the same neutral confirmation whether or not the email or company exists. Never narrow copy to "no company found for that email".
4. **Five separate facts.** Company identity, verified contact, management authority, payment, and ownership are distinct. Verifying an email creates a private, expiring, non-participating draft — it does not publish, activate, or grant ownership. Say so plainly rather than congratulating the user.
5. **Blocked is not failure.** A pending access request renders as a truthful pending state: a manager was notified, nothing was charged, and manual recovery exists if no manager is reachable.

- [ ] **Step 1: Create the form**

`apps/web/src/components/manage/management-link-form.tsx`:

```tsx
'use client';

import { useState } from 'react';

type RequestState = 'idle' | 'unavailable';

export function ManagementLinkForm() {
  const [state, setState] = useState<RequestState>('idle');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // No endpoint exists. Never claim a link was sent.
        setState('unavailable');
      }}
      className="mt-6 max-w-md"
    >
      <label htmlFor="manage-email" className="block text-sm text-[var(--color-muted)]">
        Company contact email
      </label>
      <input
        id="manage-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
      />

      <button
        type="submit"
        className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--color-foreground)] font-semibold text-[#09090b] hover:opacity-90"
      >
        Email me a management link
      </button>

      {state === 'unavailable' && (
        <p
          role="status"
          className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-warning)] p-3 text-sm"
        >
          <strong className="block">Management links are not available yet.</strong>
          No email was sent. This screen is ready for the link service once it exists.
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Create the page**

`apps/web/src/app/manage/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { ManagementLinkForm } from '@/components/manage/management-link-form';
import { buildPageTitle } from '@/lib/site';

export const metadata: Metadata = {
  title: buildPageTitle('Manage your company'),
  description: 'Request a secure link to manage your company on TakeOver. No password required.',
};

export default function ManagePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Manage your company
      </h1>
      <p className="mt-2 max-w-prose text-sm text-[var(--color-muted)]">
        TakeOver has no accounts and no passwords. Your company is created when you capture a
        territory, and you manage it through a secure link sent to your contact email.
      </p>
      <ManagementLinkForm />
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @takeover/web build && pnpm --filter @takeover/web lint`
Expected: clean.

```bash
git add apps/web/src
git commit -m "feat(web): add passwordless company management entry point"
```

---

### Task 12: Real-time boundary, polish, and milestone verification

**Files:**

- Create: `apps/web/src/lib/realtime/contract.ts`
- Create: `apps/web/src/app/not-found.tsx`
- Modify: `docs/MEMORY.md`, `docs/PHASES.md`

**Interfaces:**

- Produces: `TakeoverRealtimeEvent`, `RealtimeConsumer` — declarations only

- [ ] **Step 1: Declare the real-time boundary**

This file opens no connection and synthesizes no events. It exists so Codex's SSE implementation has a defined shape to satisfy.

`apps/web/src/lib/realtime/contract.ts`:

```ts
/**
 * REAL-TIME INTEGRATION BOUNDARY — NOT IMPLEMENTED.
 *
 * Declares the shape Codex's future SSE stream must satisfy. This module opens
 * no EventSource or WebSocket and synthesizes no events. Nothing in the UI may
 * describe real-time updates as working until a real stream exists.
 */

export type TakeoverRealtimeEvent =
  | { type: 'territory.captured'; territorySlug: string; occurredAt: string }
  | { type: 'territory.contested'; territorySlug: string; occurredAt: string }
  | { type: 'leaderboard.lead_changed'; companySlug: string; occurredAt: string };

export type RealtimeConsumer = {
  /** Subscribes to authoritative events. Returns an unsubscribe function. */
  subscribe(handler: (event: TakeoverRealtimeEvent) => void): () => void;
};

/** No transport is available yet. Callers must handle this explicitly. */
export const REALTIME_STATUS = 'not-connected' as const;
```

- [ ] **Step 2: Add a root not-found page**

`apps/web/src/app/not-found.tsx` renders "Page not found", a one-line explanation, and a link back to `/territories`, matching the styling of the territory not-found boundary.

- [ ] **Step 3: Confirm no cancelled auth surface exists**

Run:

```bash
grep -rEn "sign ?in|sign ?up|log ?in|forgot password|reset password" apps/web/src --include=*.tsx --include=*.ts -i
```

Expected: no matches. Any hit is a scope violation and must be removed.

- [ ] **Step 4: Confirm fixtures never reach components**

Run:

```bash
grep -rn "lib/fixtures" apps/web/src/components apps/web/src/app
```

Expected: no matches. Fixtures are reachable only through `src/lib/data/*`.

- [ ] **Step 5: Run full verification**

```bash
pnpm --filter @takeover/web test
pnpm --filter @takeover/web typecheck
pnpm --filter @takeover/web lint
pnpm --filter @takeover/web build
pnpm format:check
```

Expected: all pass. Record the actual output; do not claim success without it.

- [ ] **Step 6: Update the canonical docs**

In `docs/MEMORY.md`, under "What Works", record the frontend surfaces that now exist and state plainly that they render fixtures through the data-access seam with no product API. Do not alter any backend claim or Phase 0 status.

In `docs/PHASES.md`, record frontend milestone 1 progress without marking any phase requiring real integration complete.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src docs/MEMORY.md docs/PHASES.md
git commit -m "feat(web): add realtime boundary and complete frontend milestone 1"
```

---

## Self-Review

**1. Spec coverage.**

| Spec section                          | Task                          |
| ------------------------------------- | ----------------------------- |
| §7 Design system — tokens, typography | 1                             |
| §7.4 Owner accent validation          | 2                             |
| §6 View models, fixtures, seam        | 3                             |
| §8 Value Mosaic, tier derivation      | 4, 6                          |
| §4 Route structure                    | 5, 7, 8, 10, 11               |
| §8.3 Tile content and states          | 6                             |
| §9 Liveness boundary                  | 12                            |
| §5 Capture flow and payment boundary  | 9                             |
| §5.3 Stale price                      | 9                             |
| §5.4 Management link                  | 11                            |
| §10 Async states                      | 7, 8, 10, 12                  |
| §11 Accessibility and responsive      | 5, 6, 9, 10                   |
| §12 Testing                           | 2, 3, 4, 9                    |
| §13 Scope — no auth screens           | 11, and verified in 12 Step 3 |

**2. Placeholder scan.** No "TBD" or "add error handling". Three steps describe a file by explicit mirror of a fully-specified sibling (company not-found, root not-found, fixture record shapes) with their exact required content stated; every other step contains literal code.

**3. Type consistency.** Verified end to end: `Money` flows from `@takeover/shared` into `formatMoney`/`formatMoneyCompact` (Task 2), `Price` (Task 6), and `isStalePrice` (Task 9). `TerritoryView` is defined once in Task 3 and consumed unchanged by `weightOf`/`assignTiers` (Task 4), `TerritoryCard`/`TerritoryMosaic` (Task 6), the detail page (Task 8), and `TakeoverPanel` (Task 9). `TerritoryTier` is exported from `tiers.ts` (Task 4) and imported by both Task 6 components. `CompanyRefView` (Task 3) is embedded in `TerritoryView`, `LeaderboardEntryView`, and `ActivityEventView`. `resolveSource`/`DataResource` (Task 3) are used by every `lib/data/*` module.

**4. Strictness check.** `sanitizeAccentColor` destructures regex groups and guards each for `undefined` (`noUncheckedIndexedAccess`). `RANK_ACCENT[entry.rank]` uses `??` for the same reason. Optional properties are conditionally spread rather than assigned `undefined` (`exactOptionalPropertyTypes`) in the tier test helper and the card's `style`. All type imports use inline `type` specifiers (`verbatimModuleSyntax`, `consistent-type-imports`).

**5. Ordering dependency.** Task 8 imports `TakeoverPanel` from Task 9; the note in Task 8 Step 4 states the resolution explicitly.

**6. Scope check.** Frontend only. No file outside `apps/web` is touched except the two doc updates in Task 12.
