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

The territory board is the primary discovery surface. A visitor sees ownership, price pressure, and recent change; opens detail; chooses an authorized company; reviews a server-calculated amount; crosses a clearly labeled payment boundary; and waits for authoritative confirmation. Empire and ranking views lead back to territories and rivalry, not generic company browsing.

## State Vocabulary

### Ownership states — PLANNED

- **Unclaimed:** no active owner; show the authoritative opening capture amount.
- **Claimed:** show owner, current winning amount, minimum takeover, and reign start.
- **Contested:** show server-defined contention honestly; do not infer it from animation alone.
- **Temporarily disabled:** explain that takeover is unavailable and suppress payment actions.

### Takeover states — PLANNED

- Eligible and ready for review.
- Company selection required.
- Company unauthorized or unverified.
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

## Critical Copy

Use direct labels: `TAKE OVER`, `DEFEND`, `CHALLENGE`, `VIEW EMPIRE`, and `VIEW BATTLE`. Never use success-oriented copy before committed backend confirmation.

