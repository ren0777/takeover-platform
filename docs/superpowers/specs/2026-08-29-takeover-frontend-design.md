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

### 4.1 Phase 1 company-claim routes

These replace the cancelled auth routes. All are `noindex` — they are capability landings, not public content.

| Route                          | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `/manage`                      | Request a management link for a company/contact pair             |
| `/manage/exchange`             | Token landing: exchange a single-use link, then scrub the secret |
| `/manage/access-requests/[id]` | Manager confirmation screen for an explicit approve/reject       |
| `/manage/company`              | Company-scoped management context for the current session        |

There is deliberately no `/login`, `/signup`, `/forgot-password`, or `/reset-password`.

`/manage/exchange` and `/manage/access-requests/[id]` must perform no state change on `GET`. See §5.4.

---

## 5. Company Claim and Management (aligned to Phase 1)

**Aligned 2026-08-30** to `docs/superpowers/specs/2026-08-29-phase-1-company-claim-identity-design.md`.

V1 has no `User` model, no passwords, no global end-user session, and no generic authenticated dashboard. **Login, signup, forgot-password, and reset-password screens are cancelled and will not be built.** No screen in this milestone may imply an account exists.

Authority in V1 is a **company-scoped, revocable capability**, not an identity:

```
opaque email link → exchange → short-lived HttpOnly company-scoped management session
```

Company identity, verified contact, management authority, payment, and ownership are **five separate facts**. The UI must never let one imply another. In particular: payment never grants management access, and a browser return URL never establishes ownership.

### 5.1 The five surfaces this milestone must express

Replacing the cancelled auth screens:

1. **Company/contact capture** — collected inside the takeover flow, not as prior onboarding.
2. **Email verification** — request, sent, exchanging, verified, expired, invalid, already-consumed.
3. **Management-link exchange** — the landing that trades a single-use token for a scoped session.
4. **Company-scoped management session** — a management context bound to exactly one company.
5. **Pending existing-company access request** — the requester's blocked state, and the manager's explicit approve/reject decision.

### 5.2 New company preparation

Territory selected → company and contact details entered → intent prepared → verification link emailed → link exchanged → scoped session over a **draft** company.

The draft is private, expiring, and non-participating. Verifying an email does **not** create ownership, does not publish the company, and does not activate it. Only a later confirmed capture can do that. UI copy must say so plainly rather than congratulating the user.

### 5.3 Existing managed company access

If the chosen company is already managed, the requester does not gain access. A pending `CompanyAccessRequest` is created and **checkout and mutations stay blocked** until an existing manager explicitly approves.

The requester sees a truthful pending state — not an error, and not a success. It explains that a manager was notified, that nothing has been charged, and that a manual recovery path exists if no manager is reachable.

### 5.4 Manager approval — a hard UI constraint

**Approval links must not approve on `GET`.** Opening a review link establishes or refreshes the manager's scoped session and lands on a **confirmation screen**. Approval or rejection is an explicit mutation from that screen, with CSRF and Origin protection.

Any design where following a link performs the approval is a correctness bug, not a convenience. Prefetching, link scanners, and email security crawlers all issue `GET`.

### 5.5 Token handling in the browser

Token landing URLs must not leave secrets in browser history. After exchange, the frontend replaces the URL so the secret is scrubbed. Tokens are never logged, never placed in analytics, and never rendered on screen.

### 5.6 Enumeration resistance

Link-request and verification responses must not reveal whether an email or company exists. The UI shows the same neutral confirmation regardless, and copy must never be tightened into a disclosure such as "no company found for that email".

### 5.7 States the flow must never fabricate

Verification, management access, payment success, company activation, ownership change, rank movement, and live events. No optimistic UI touches any of them. Pending is never rendered as success.

### 5.8 Stale quote review

A prepared takeover intent is **explanatory only and never locks a price**. Before checkout, the server revalidates territory version, owner, current winning amount, legal minimum, and currency. A mismatch moves the intent to `review_required` and returns both the previous snapshot and the current values.

The UI shows both, explains what changed, and requires explicit acceptance of the new quote. **A revised amount is never auto-charged, and approving company access never accepts a changed price.**

### 5.9 Milestone 1 boundary

The endpoints in the Phase 1 spec are proposed, not implemented, and their shared schemas are not yet published. Until they exist, these surfaces render structure and states only. The UI states plainly that the service is not connected and **never claims a link was delivered, a contact verified, or a session established.**

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

Recorded as handoffs in `MEMORY.md`.

**Blocking — no frontend work may proceed on these surfaces until they land.** As of 2026-08-30, `@takeover/shared` still exports only envelopes, error codes, money primitives, and health constants. It publishes no product-domain contract.

1. Phase 1 shared Zod schemas and inferred types for the company-claim contracts, which the Phase 1 spec states will live in `@takeover/shared`: company claim, email verification and exchange, management link and exchange, management context, access request create/approve/reject/cancel, recovery request, and takeover intent.
2. Domain contracts: `Territory`, `Company`, `LeaderboardEntry`, `ActivityEvent`.
3. `displayWeight: number` on territory.
4. Territory list/detail and history endpoints, including `previousOwner.logoUrl`.
5. Checkout and stale-quote response shapes carrying both the prior snapshot and the current authoritative values.
6. SSE event stream.

**Unresolved questions the frontend must not answer on its own.** The Phase 1 spec lists these as open, and each one changes UI copy or state:

- Token, session, and access-request TTLs — these determine what expiry the UI states.
- Company collision rules — these determine when capture becomes an access request instead.
- Whether an unactivated draft company may proceed to checkout.
- Manual-reviewer authorization and the recovery path a blocked requester is offered.

Non-blocking, and buildable now: the design system and the pure formatting utilities, which depend only on `Money` from `@takeover/shared`.

---

## 15. Self-Review

**Against `RULES.md`:** no `@takeover/database` import; no duplicated canonical contracts (provisional models are marked, quarantined, and scheduled for deletion); money stays integer minor units with `Minor`-suffixed fields; kebab-case routes and files; no fabricated payment, verification, ownership, or ranking; untrusted color input validated; async states specified; strict TypeScript honored.

**Against `ARCHITECTURE.md`:** matches the stated boundary that `@takeover/shared` is the sole contract source with frontend view models allowed as clearly presentation-specific; matches the documented stale-price behavior; matches the rule that the frontend may use ambient visuals but cannot claim SSE connectivity.

**Against `DESIGN.md`:** Value Mosaic direction, tile tiers, in-tile hierarchy, ambient liveness with 400–700ms bursts, semantic tokens, decorative-only owner accents, adjacency carries no meaning, mobile ranked feed — all consistent.

**Against `PHASES.md` / `PRD.md`:** one conflict, deliberate and recorded. Both still describe password-based Phase 1 identity; the approved product direction is passwordless. Codex owns those sections and Claude has not rewritten them. Flagged in `MEMORY.md` as needing revision before Phase 1.

**Against the implementation:** versions, tokens, path alias, strictness, test environment, and the existing `skip-link` / `site.ts` contracts are all taken from the audited repository rather than assumed.

**Ambiguity check:** "importance" for tier ordering is defined as `displayWeight` when present, else current price, and is explicitly non-authoritative.
