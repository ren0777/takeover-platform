# TakeOver.com Product Design Rules

> **Status:** Product and UX direction is **PLANNED**. Phase 0 provides only a minimal web shell and does not implement these product states.

## Product Personality

Competitive, premium, internet-native, game-like, energetic, slightly chaotic, startup-focused, screenshot-friendly, and shareable. The interface should make ownership and rivalry feel consequential without obscuring money or state.

Avoid generic corporate SaaS, excessive glassmorphism, huge empty heroes, generic blue dashboards, and marketing clutter that weakens the territory loop.

## Design Principles

- Ownership first: current owner, territory, reign, and takeover requirement are immediately legible.
- Competition with clarity: energy never overrides price, eligibility, or state accuracy.
- Honest state: pending is not success; client optimism never depicts ownership transfer.
- One dominant action per context: `TAKE OVER`, `DEFEND`, `CHALLENGE`, `VIEW EMPIRE`, or `VIEW BATTLE`.
- Shareable moments: capture and milestone layouts should work in screenshots and social previews.
- Accessible motion: bursts support events, respect reduced-motion settings, and never carry required information alone.

## Core Interaction Model

The territory board is the primary discovery surface. A visitor sees ownership, price pressure, and recent change; opens detail; enters or selects a company; verifies a contact email when needed; reviews a server-calculated amount; crosses a clearly labeled payment boundary; and waits for authoritative confirmation. Existing-company access may pause in manager approval before checkout. Empire and ranking views lead back to territories and rivalry, not generic company browsing.

V1 has no signup/login page, password recovery, persistent global account surface, or generic authenticated dashboard. Passwordless management is presented as a company-specific continuation: request link, check email, exchange link, then manage only the named company.

## State Vocabulary

### Ownership states — PLANNED

- **Unclaimed:** no active ownership exists. Phase 2 shows no fabricated opening price.
- **Claimed:** show the authoritative owner and reign start. Price and minimum takeover remain absent until Phase 3.
- **Disabled:** explain that the territory is unavailable while preserving its real owner and history.

`contested` is not a Phase 2 authoritative state and must not appear in Phase 2 contracts, fixtures presented as live, or UI state. It may return only after Phase 3 defines it from real bidding data.

### Takeover states — PLANNED

- Eligible and ready for review.
- Company selection required.
- Contact email verification required/sent/expired/invalid/verified; verification proves the contact channel, not website-domain control.
- Existing-company access pending, approved, rejected, expired, or cancelled.
- Pending access blocks checkout and company editing while preserving non-binding takeover preparation.
- Manual recovery requested/reviewing when no existing manager is reachable; it never promises automatic access.
- Company unauthorized or contact unverified.
- Price stale: show the new owner/current price and new minimum; require review again and never auto-charge.
- Payment not connected/unavailable.
- Payment pending provider confirmation.
- Capture confirmed by committed backend state.
- Capture rejected or rolled back with a safe recovery action.

### Loading, empty, and failure states — PLANNED

- Preserve enough layout to avoid disorienting shifts.
- Identify the resource being loaded; do not use indefinite spinners without context.
- Empty states explain whether content does not exist, is filtered out, or is unavailable.
- Failures use safe language, a request ID when useful, and retry only for retry-safe actions.

### Payment states — PLANNED

- Present exact amount, currency, fees, company, and territory before provider handoff.
- Distinguish checkout created, user action required, processing, succeeded-provider-side, capture committed, failed, cancelled, expired, disputed, and refunded.
- Provider success is not territory success until the backend commits ownership.

### Success states — PLANNED

Only authoritative API results may trigger capture celebrations, owner changes, ranking movement, or share cards. Success includes the captured territory, previous owner when allowed, amount, reign start, and a stable link.

Email verification success and access-request approval are not capture success. Payment-provider success is also distinct from committed ownership.

## Responsive Requirements

- Core actions work from 320 CSS pixels upward without horizontal page scrolling.
- Mobile prioritizes a ranked variable-size feed rather than preserving desktop board geometry.
- Tap targets are at least 44 by 44 CSS pixels and critical controls remain reachable with zoom/text scaling.
- Payment review content remains readable above action buttons and safe areas.

## Accessibility Requirements

- Meet WCAG 2.2 AA for production UI.
- Use semantic landmarks, headings, labels, error relationships, and keyboard order.
- Do not encode ownership, contention, payment, or success by color/motion alone.
- Maintain visible focus, sufficient contrast, reduced-motion behavior, and screen-reader announcements for authoritative live updates.
- Modal focus is trapped appropriately, returns to its trigger, and does not lose entered context on recoverable errors.

## Visual Direction — UNVALIDATED / NEEDS REVIEW

Near-black foundations, tight radii, hairline borders, restrained decorative owner accents, Space Grotesk headings, Inter body text, and JetBrains Mono for numeric/system details are an approved direction but not implemented in Phase 0. Externally sourced colors must be validated and cannot communicate state alone.

Territory mosaic positions and physical CSS adjacency have no gameplay meaning unless future authoritative product data explicitly defines relationships.

### Semantic color tokens — PLANNED

Components must consume semantic tokens rather than hardcoded values: `background`, `surface`, `raised surface`, `border`, `text`, `muted text`, `owner`, `challenger`, `premium`, `success`, `warning`, `destructive`, `unclaimed`. Radii stay tight (tiles tighter than controls; pills reserved for badges). Borders are hairline by default, with heavier emphasis reserved for future authoritative competition states and owner-is-viewer emphasis.

Owner brand accents are decorative only. They may tint a border or corner bleed; they may never sit behind text, encode state, or bypass validation of externally sourced color values.

## Board Direction — APPROVED, NOT IMPLEMENTED

**Primary board direction: Value Mosaic, with restrained competitive/Throne Room accents.**

The board is a tessellated mosaic in which tile size encodes territory importance, so high-value territories physically dominate the screen and hierarchy is legible within seconds.

- Tile tiers: `flagship` 2×2, `major` 2×1, `standard` 1×1.
- Throne Room energy is reserved for genuinely important authoritative moments — crowns for dominant companies, newly captured animation, future server-confirmed competition, #1 empire, and season winners. Every card must not become a battle poster.
- Exchange Terminal density is explicitly rejected as the default board experience.
- The mosaic must stay understandable at 10, 50, and 100+ territories, including when positioning is algorithmic rather than gameplay-derived.

### In-tile hierarchy — corrected 2026-08-30 against the Phase 2 contracts

The earlier hierarchy placed current value and a minimum takeover price above the primary action. **Phase 2 publishes no money field of any kind** — `territorySummarySchema` has no current amount, no minimum, and no currency — so that hierarchy was not buildable and has been replaced.

Phase 2 in-tile hierarchy, in priority order:

1. Territory name
2. Status — `unclaimed`, `claimed`, or `disabled`, always as text or a badge, never colour alone
3. Current owner and logo, from `currentOwnership.owner`
4. Reign, derived from `currentOwnership.capturedAt`
5. Category
6. Primary action

**The primary action must not imply a price it cannot show.** Until Phase 3 publishes pricing, an `unclaimed` tile invites a claim and a `claimed` tile leads to detail; neither renders an amount. Reintroduce price and a `TAKE OVER $X` call to action only when Phase 3 makes an authoritative amount available — and then the amount comes from the server, never from the client.

`initial_seed` and `paid_capture` are both valid `currentOwnership.source` values. A seeded owner is a real owner and must not be styled as provisional.

**Tier assignment is authoritative, not heuristic.** Phase 2 provides `displayWeight` as an integer `1..100`. It is the only input to tile size; any price-derived fallback is deleted rather than kept as a secondary path. Suggested frontend bands are `80..100` flagship, `50..79` major, `1..49` standard — presentation guidance, not backend enums. `displayWeight` is never derived from price, ownership, volume, company size, or adjacency.

## Liveness Direction — APPROVED, NOT IMPLEMENTED

**Liveness direction: Ambient by default with event-driven bursts.**

The intended feel is _quiet tension → something happened → burst of energy → calm again._

- Default state: reign timers tick, a subtle live indicator, quiet activity-rail updates, countdowns without flashy motion. No constant price flickering, no nonstop ticker, no decorative motion added merely to imply liveness.
- On an authoritative event: short border pulse on the affected tile, previous owner transitions out, new owner transitions in, value updates, activity feed inserts the event, optionally a restrained toast. Bursts settle in roughly 400–700ms.
- Qualifying events: territory captured, company dethroned, a future authoritative competition threshold, empire milestone, leaderboard #1 change, battle begins/ends, or season winner declaration.
- Motion communicates state change; it never decorates. Reduced-motion is respected, information never depends on animation alone, animations never block clicks or takeover actions, and layout must not shift.
- Performance: animate transform/opacity, animate only tiles that actually changed, and never re-render the whole mosaic on a real-time update.

Real-time transport is **not implemented**. The frontend defines only an integration boundary for it; it must not fabricate SSE or WebSocket connections, and must not synthesize activity events.

## Critical Copy

Use direct labels: `TAKE OVER`, `DEFEND`, `CHALLENGE`, `VIEW EMPIRE`, and `VIEW BATTLE`. Never use success-oriented copy before committed backend confirmation.
