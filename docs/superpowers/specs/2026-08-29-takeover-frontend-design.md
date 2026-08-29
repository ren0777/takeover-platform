# TakeOver.com Frontend Design Specification

**Status:** Approved for planning on 2026-08-29. Supersedes earlier frontend assumptions made before Phase 0 existed.

**Scope:** Frontend milestone 1 inside `apps/web`. No backend work. No changes to `apps/api`, `packages/shared`, `packages/database`, `packages/config`, or root tooling.

**Depends on:** Phase 0 (`IMPLEMENTED NOW / ACCEPTANCE VERIFIED`).

---

## 1. Audited Foundation

This specification is written against the repository as it actually exists, not against the pre-Phase-0 assumptions.

**Verified by inspection on 2026-08-29** (`pnpm test` exits 0):

| Fact           | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| Framework      | Next.js `15.5.24`, App Router, React `19.2.8`                       |
| Language       | TypeScript `5.9.3`                                                  |
| Styling        | Tailwind CSS `4.3.3` via `@tailwindcss/postcss`, CSS-first `@theme` |
| Tests          | Vitest `3.2.7`, node environment, no DOM environment installed      |
| Path alias     | `@/*` → `./src/*`                                                   |
| Shared package | `transpilePackages: ['@takeover/shared']` already configured        |
| API surface    | `GET /health`, `GET /ready` only                                    |

**Strictness that constrains all code in this milestone:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`. ESLint enforces `consistent-type-imports` with inline type imports and `no-unused-vars` with an `^_` ignore pattern.

Practical consequences, each of which changed a decision below:

- `noUncheckedIndexedAccess` means array and record access yields `T | undefined`. Mosaic and leaderboard code must handle that rather than assert.
- `exactOptionalPropertyTypes` means an optional property is omitted, never assigned `undefined`.
- `verbatimModuleSyntax` requires explicit `import type` / inline `type` specifiers.

### 1.1 What `@takeover/shared` actually exports

```
apiErrorSchema, apiSuccessSchema, ERROR_CODES, ApiError, ApiSuccess, ErrorCode
DEFAULT_CURRENCY, HEALTH_STATUS
createMoney, CURRENCY_CODE_PATTERN, isMoney, moneySchema, Money
```

`Money` is `{ amountMinor: number; currency: string }` — non-negative safe integer minor units, three-letter uppercase currency.

**There are no `Territory`, `Company`, `Season`, `Battle`, `LeaderboardEntry`, or `ActivityEvent` contracts.** This is the single most consequential audit finding and Section 6 addresses it.

### 1.2 Existing web shell to extend, not replace

`apps/web/src/app/globals.css` already defines five tokens, and they are the canonical values this milestone builds on:

```
--color-background #09090b   --color-surface #111113   --color-border #27272a
--color-foreground #fafafa   --color-muted #a1a1aa
```

A `.skip-link` and `#main-content` contract already exist in `layout.tsx`. `src/lib/site.ts` exports `SITE` and `buildPageTitle`. All are kept.

`globals.css` declares `font-family: Inter` but **no font is actually loaded**. Wiring real fonts is milestone work.

---

## 2. Reconciliation of Prior Assumptions

| Prior assumption                          | Reality                           | Resolution                                                            |
| ----------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| Next.js 16.3.3                            | Next.js 15.5.24                   | Adopt 15.5.24. No feature in this milestone requires 16.              |
| Vitest 4                                  | Vitest 3.2.7                      | Adopt 3.2.7.                                                          |
| I define the token palette                | Codex shipped 5 tokens            | Extend those exact values; never redefine them.                       |
| `@takeover/shared` holds domain contracts | It holds envelopes/money only     | Provisional view models, quarantined; contracts requested from Codex. |
| Auth screens in milestone 1               | Product change 2026-08-29         | **Removed.** Replaced by the passwordless flow in Section 5.          |
| Component tests                           | No DOM test environment installed | Test pure functions only; do not add DOM tooling in this milestone.   |

Unchanged and still correct: Value Mosaic board direction, ambient-plus-bursts liveness, mobile ranked variable-size feed, fixture/live data-access seam, takeover-flow honesty, near-black visual system, three-typeface system.

---

## 3. Product Loop

Every screen serves: **see territory → want it → beat the price → capture it → defend it → build an empire.**

The homepage shows the product within one viewport. No stacked marketing sections ahead of the board.

---

## 4. Route Structure

Routes are lowercase kebab-case with stable slugs, per `RULES.md`.

| Route                                                                    | Rendering            | Milestone 1                                        |
| ------------------------------------------------------------------------ | -------------------- | -------------------------------------------------- |
| `/`                                                                      | Server               | Yes — intro line, Value Mosaic, activity rail      |
| `/territories`                                                           | Server               | Yes — full board, category filter, sort            |
| `/territory/[slug]`                                                      | Server               | Yes — detail, history, sticky mobile CTA           |
| `/company/[slug]`                                                        | Server               | Yes — profile, held territories, stats             |
| `/leaderboard`                                                           | Server               | Yes — ranked presentation                          |
| `/manage`                                                                | Server + client form | Yes — request a company management link            |
| `/seasons`, `/seasons/[id]`, `/hall-of-fame`, `/battles`, `/battle/[id]` | Server               | No — later phases                                  |
| `/dashboard/*`                                                           | Server               | No — requires a real session; `noindex` when built |

Every dynamic route gets `loading.tsx`, `error.tsx`, and — where a record may be absent — `not-found.tsx`.

---

## 5. Passwordless Capture and Company Management

**Product change, 2026-08-29:** V1 requires no traditional accounts. Login, signup, forgot-password, and reset-password screens are **cancelled and will not be built.**

The capture flow establishes company identity inline:

```
TAKE OVER → company details → bid → payment → backend-confirmed ownership → secure email management link
```

This strengthens the loop: a visitor who wants a territory never hits an account wall before wanting it.

### 5.1 Capture steps

1. **Territory context.** Territory, current owner, current winning amount, and the server-computed minimum takeover amount.
2. **Company details.** Name, website, logo, short description, contact email. The email is what a management link is later sent to.
3. **Bid.** Amount at or above the minimum. The frontend validates the floor for feedback only; the server remains authoritative.
4. **Review.** Territory, current owner, current amount, required minimum, chosen bid, fees if any, total, and the consequences of capture.
5. **Payment boundary.** Milestone 1 terminates here in a clearly labeled **payment-not-connected** state naming exactly what is missing.

### 5.2 States the flow must never fabricate

Authentication, verification, payment success, ownership change, rank movement, and live events. No optimistic UI touches any of them. A pending state is never rendered as success.

### 5.3 Stale price

Designed now, wired when the endpoint exists. On a stale response the modal explains the territory changed, shows the new owner and new current price, shows the new minimum, and requires explicit re-review. **A revised amount is never auto-charged.**

### 5.4 Management link

`/manage` collects an email and requests a single-use, expiring link. States: idle, submitting, sent, throttled, expired, invalid, consumed.

Milestone 1 renders these against fixtures and **never claims a link was delivered or a session established.** The submit action is disabled during the request and the UI states plainly that delivery is not connected.

---

## 6. Domain Types and the Data-Access Seam

### 6.1 Provisional view models

`@takeover/shared` has no domain contracts, and `RULES.md` forbids `apps/web` from owning canonical ones. The resolution, recorded as a handoff in `MEMORY.md`:

- `apps/web/src/lib/view-models/` holds **provisional presentation types** — `TerritoryView`, `CompanyView`, `LeaderboardEntryView`, `ActivityEventView`.
- The `View` suffix is load-bearing: it marks them as presentation shapes, not domain truth.
- Each file carries a header comment stating it is provisional and must be deleted when `@takeover/shared` publishes the real contracts.
- They compose `Money` from `@takeover/shared` rather than restating it. Money fields end in `Minor`; timestamps are ISO 8601 UTC strings.

### 6.2 The seam

```
src/lib/
  view-models/     provisional presentation types (temporary)
  data/
    source.ts      per-resource fixture|live switch
    territories.ts getTerritories(), getTerritoryBySlug()
    companies.ts   leaderboard.ts   activity.ts
  fixtures/        DEVELOPMENT ONLY, banner-commented
  api/client.ts    typed fetch wrapper (unused until endpoints exist)
```

Server components call `lib/data/*` and never import fixtures or call `fetch` directly. `source.ts` carries a per-resource capability map so resources go live one at a time as Codex lands endpoints, with no parallel logic retained.

Fixtures are development-only, clearly labeled, and must never depict payment, verification, ownership, or any irreversible state as successful.

---

## 7. Design System

### 7.1 Tokens

Extends Codex's five existing tokens in `globals.css` under `@theme`. Existing values are not modified.

Added surfaces and semantics:

```
--color-surface-raised  #18181b
--color-premium         #e9b949   crown / high-value
--color-contested       #ff5a1f   active contention
--color-challenger      #ff8a4c   challenger pressure
--color-unclaimed       #7c5cff   open territory
--color-owner           #3ddc97   viewer holds this territory
--color-success         #2fbf71
--color-warning         #f5a524
--color-destructive     #e5484d

--radius-tile     4px
--radius-control  6px
--radius-pill     9999px
```

Components consume semantic tokens. Hardcoded colors are a review failure.

### 7.2 Typography

Three faces, each with one job, loaded via `next/font/google` with `display: 'swap'` and exposed as CSS variables:

- **Space Grotesk** — display: territory names, headings, rank numerals.
- **Inter** — body and UI. Already the declared family; this makes it real.
- **JetBrains Mono** — every price, timer, and rank position, so digits align in a grid.

### 7.3 Structure

Hairline 1px borders carry structure. 2px is reserved for `contested` and viewer-owned emphasis. Shadows are used sparingly. Radii stay tight; pills are for badges only.

### 7.4 Owner accent

A company brand color may tint a tile border or corner bleed. It is **decorative only** — never behind text, never the sole carrier of state. Every externally sourced color passes a strict hex validator before reaching the DOM; anything else falls back to a neutral token. This is a pure function and is unit tested.

---

## 8. The Value Mosaic

### 8.1 Layout

CSS Grid with `grid-auto-flow: dense`. No JavaScript layout, no measurement, no cumulative layout shift, fully server-rendered.

| Tier       | Span  |
| ---------- | ----- |
| `flagship` | 2 × 2 |
| `major`    | 2 × 1 |
| `standard` | 1 × 1 |

Columns: 2 base → 3 `sm` → 4 `md` → 6 `lg`. Territories sort by importance descending so prominent tiles land first and `dense` backfills gaps.

At the 2-column base this collapses naturally into the approved **ranked variable-size feed**: flagship and major become full-width, standard is half-width. Desktop geometry is not preserved on mobile, and the core board never scrolls horizontally.

**Mosaic position and physical adjacency carry no gameplay meaning.** No neighbor rules may be derived from CSS layout.

### 8.2 Tier derivation

`tierOf()` is a **temporary presentation heuristic**. It prefers an authoritative `displayWeight` when present and falls back to current price only while that field does not exist. It is pure, unit tested, and documented as non-authoritative. Requested from Codex in `MEMORY.md`.

### 8.3 Tile content

In priority order: territory name → owner and logo → current value → minimum takeover price → `TAKE OVER` → reign and competition metadata. Tiles stay readable in seconds; extra detail belongs on hover and the detail page.

States: unclaimed, owned, contested, recently captured, premium, viewer-owned (`DEFEND`). Every state is conveyed by text or badge in addition to color.

### 8.4 Scale

Must hold at 10, 50, and 100+ territories. 100+ tiles remain ordinary DOM nodes with category filtering and sort. Virtualization is deliberately deferred; revisit past roughly 300 tiles.

---

## 9. Liveness

Ambient by default: reign timers tick from server `capturedAt` timestamps, a subtle live indicator, quiet activity-rail updates. No constant flicker, no perpetual ticker, no motion added merely to imply liveness.

On an authoritative event: border pulse on the affected tile, owner transition out/in, value update, activity insert, optional restrained toast — settling in roughly 400–700ms.

**`lib/realtime/` defines only the integration boundary in this milestone.** It declares the event contract and a consumer interface. It opens no SSE or WebSocket connection and synthesizes no events. Real-time is not described as implemented anywhere in the UI.

Only the changed tile re-renders. Motion animates transform and opacity, respects `prefers-reduced-motion`, never blocks interaction, and never shifts layout.

---

## 10. Async States

Every async view implements idle, loading, success, recoverable error, and — where relevant — unrecoverable error, plus an empty state where data may legitimately be absent.

Loading preserves enough layout to avoid disorienting shifts. Empty states distinguish "does not exist" from "filtered out" from "unavailable". Errors use safe language, surface a request ID when available, and offer retry only for retry-safe actions. Mutating buttons are disabled while in flight.

---

## 11. Accessibility and Responsive

Targets WCAG 2.2 AA. Semantic landmarks and buttons, correct heading hierarchy, visible focus, keyboard-operable board and modal, focus trapped in dialogs and returned to the trigger, and no information carried by color or motion alone.

Core actions work from 320 CSS pixels upward with no horizontal page scrolling. Tap targets are at least 44 × 44 CSS pixels. The territory detail CTA is sticky on mobile. The leaderboard degrades to a readable stacked layout rather than an unusable table.

---

## 12. Testing

Vitest 3.2.7 in the node environment. **No DOM testing library is installed and this milestone does not add one**, so coverage targets pure deterministic logic — which is exactly where silent wrongness would hide:

- `tierOf` — tier boundaries and `displayWeight` preference
- money formatting from integer minor units
- reign duration formatting
- owner accent hex sanitization, including rejection of malicious values
- stale-price comparison
- `buildPageTitle` (already covered)

Playwright stays deferred. Component and E2E coverage is revisited when a real API and a DOM environment exist.

---

## 13. Milestone 1 Scope

In priority order: design system → data-access seam → navigation shell → homepage and mosaic → territory card and detail → company profile → leaderboard → activity rail → takeover modal with the honest payment boundary → management-link screen → loading/error/empty/responsive polish.

Screen count must not produce shallow placeholder implementations. A screen ships complete or is cut.

**Explicitly out of scope:** login/signup/forgot/reset (cancelled), seasons, Hall of Fame, battles, dashboard, admin, share cards and OG image generation, referrals, real payment, real realtime.

---

## 14. Contracts Required From Codex

Recorded as handoffs in `MEMORY.md`. None block starting this milestone; each blocks _completing_ the corresponding surface.

1. Domain contracts in `@takeover/shared`: `Territory`, `Company`, `LeaderboardEntry`, `ActivityEvent`.
2. `displayWeight: number` on territory.
3. Territory list/detail and history endpoints, including `previousOwner.logoUrl`.
4. Takeover/payment endpoints including the stale-price response shape.
5. SSE event stream.
6. Passwordless management-link issuance and session establishment, plus the capture-time email-to-company binding rules.

---

## 15. Self-Review

**Against `RULES.md`:** no `@takeover/database` import; no duplicated canonical contracts (provisional models are marked, quarantined, and scheduled for deletion); money stays integer minor units with `Minor`-suffixed fields; kebab-case routes and files; no fabricated payment, verification, ownership, or ranking; untrusted color input validated; async states specified; strict TypeScript honored.

**Against `ARCHITECTURE.md`:** matches the stated boundary that `@takeover/shared` is the sole contract source with frontend view models allowed as clearly presentation-specific; matches the documented stale-price behavior; matches the rule that the frontend may use ambient visuals but cannot claim SSE connectivity.

**Against `DESIGN.md`:** Value Mosaic direction, tile tiers, in-tile hierarchy, ambient liveness with 400–700ms bursts, semantic tokens, decorative-only owner accents, adjacency carries no meaning, mobile ranked feed — all consistent.

**Against `PHASES.md` / `PRD.md`:** one conflict, deliberate and recorded. Both still describe password-based Phase 1 identity; the approved product direction is passwordless. Codex owns those sections and Claude has not rewritten them. Flagged in `MEMORY.md` as needing revision before Phase 1.

**Against the implementation:** versions, tokens, path alias, strictness, test environment, and the existing `skip-link` / `site.ts` contracts are all taken from the audited repository rather than assumed.

**Ambiguity check:** "importance" for tier ordering is defined as `displayWeight` when present, else current price, and is explicitly non-authoritative.
