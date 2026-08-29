# TakeOver.com Product Requirements

> **Document status:** Product requirements are **PLANNED** unless a section explicitly says **IMPLEMENTED NOW**. Phase 0 foundation acceptance is verified; live PostgreSQL migration application remains **UNVALIDATED / NEEDS REVIEW**.

## Product Vision

TakeOver.com is a competitive marketplace game where verified companies capture and defend named internet territories. The product must always reinforce:

> **See territory → beat current price → capture territory → defend it → build an empire.**

It is not a generic company directory or an advertising inventory grid.

## Problem Statement

Companies compete for attention across recognizable internet categories, but existing sponsorship and directory products provide little durable identity, rivalry, or public proof of dominance. TakeOver.com turns category placement into transparent, time-bound ownership with visible history and competition.

## Target Users

- Startup founders and growth teams seeking conspicuous category ownership.
- Established internet companies defending brand positioning.
- Community members following captures, rivalries, rankings, and seasons.
- Moderators and operators protecting marketplace integrity.

## Value Proposition

- Companies gain a scarce, public, shareable territory position.
- Visitors get a legible live map of which companies dominate internet categories.
- Competition creates ongoing stories rather than static listings.
- Transparent pricing, capture history, and rules make outcomes auditable.

## Core User Journeys

All journeys below are **PLANNED**.

### Company onboarding and verification

1. A person creates and verifies a user identity.
2. They create or join a company through membership-based authorization.
3. A company owner starts domain verification using a server-issued token.
4. The backend independently checks the configured proof and records the result.
5. Only a verified, eligible company may initiate a paid takeover.

### Discover and inspect territory

1. A visitor explores territories by category, status, activity, or ranking.
2. Territory detail shows the authoritative owner, current winning amount, legal minimum takeover amount, reign start, and capture history.
3. Disabled or unavailable states explain why capture is unavailable.

### Capture territory

1. An authorized company member chooses an eligible company.
2. The server calculates the legal minimum from current committed state.
3. The user reviews the exact amount, currency, and provider checkout boundary.
4. Payment is initiated through a provider abstraction.
5. Only a verified provider confirmation can trigger an atomic ownership transfer.
6. The resulting capture is stored, audited, and published as activity.

### Defend and build an empire

1. Owners see current reigns and newly increased takeover requirements.
2. Dethroned companies can return with a new legal bid.
3. Multiple active territories contribute to one configurable empire score.
4. Rankings and season archives show results without client-submitted statistics.

## Functional Requirements

### Identity, companies, and permissions — PLANNED

- Signup, login, logout, email verification, password reset, secure sessions, and protected routes.
- Global roles: user, company owner, moderator, and admin.
- Users may belong to multiple companies; company authority derives from stored membership.
- Company profiles contain identity, website, descriptions, logo, social links, categories, verification state, timestamps, and server-derived statistics.

### Company verification — PLANNED

- Provider-style verification with DNS TXT as the preferred V1 candidate.
- Stored token, method, status, attempted time, verified time, and failure reason.
- No client assertion or UI action can make a company verified.

### Territories and ownership — PLANNED

- Territories have stable IDs/slugs, category, descriptive media references, lifecycle status, pricing policy, summary state, season relevance, and admin controls.
- Statuses include unclaimed, claimed, contested, and temporarily disabled.
- Exactly one authoritative active ownership may exist for a territory.
- Historical ownership records retain prior owners, amounts, and reign boundaries.

### Bidding and payments — PLANNED

- The backend calculates the legal amount and validates authorization, verification, territory state, currency, and idempotency.
- Client totals are advisory display values only.
- Provider-specific operations sit behind a payment interface.
- Webhooks require signature verification, replay protection, reference/amount/currency checks, and explicit processing state.
- Failed or incomplete payments never transfer ownership.

### Live activity — PLANNED

- Events may include captures, dethroning, valid high bids, empire milestones, ranking changes, battle changes, and season completion.
- Server-Sent Events are the preferred V1 direction, subject to deployment validation.
- The product must not synthesize fake production activity.

### Empire and rankings — PLANNED

- Server-derived statistics include active territory count, category diversity, captures, spend, reigns, and verified battle outcomes.
- One configurable scoring service owns the empire algorithm.
- Leaderboards support current season and archived snapshots.

### Seasons and Hall of Fame — PLANNED

- Configurable start, end, status, rankings, and reset policy.
- Retry-safe rollover freezes results, archives a leaderboard, records winners, applies the configured territory policy, and opens the next season.
- Hall of Fame entries use frozen authoritative results.

### Battles — PLANNED

- Modular state machine for challenger, defender, territories, timing, state, winner, reason, and timeline.
- Only independently verifiable scoring dimensions may affect outcomes.

### Sharing and growth — PLANNED

- Stable public URLs, backend-supported Open Graph metadata, public statistics, attribution, referral measurement, and share events.
- Sharing must not expose private financial or identity details.

### Admin, moderation, and abuse prevention — PLANNED

- Territory controls, company/verification review, bid/payment/webhook investigation, account restrictions, suspicious-activity review, and controlled state repair.
- Every admin mutation is authorized and audited.
- Rate limits and risk controls protect identity, verification, bidding, payment, and administrative endpoints.

### Analytics — PLANNED

- Measure discovery-to-detail, detail-to-checkout, successful capture, repeat competition, defense behavior, sharing, and retention.
- Financial and ownership metrics derive from authoritative server records.
- Analytics failures cannot affect transactional correctness.

## V1 Scope

- Identity, membership-based companies, and one real company-verification method.
- Public territory list/detail and administrative territory management.
- Server-calculated takeover price, provider-abstracted Stripe implementation when configured, verified webhooks, and atomic ownership history.
- Live capture activity through validated SSE infrastructure.
- Company statistics, empire scoring, current leaderboard, configurable seasons, archives, Hall of Fame, essential moderation, and audit logs.

V1 battle scope is **UNVALIDATED / NEEDS REVIEW** because trustworthy scoring inputs have not been selected.

## Future Scope

- Razorpay implementation, additional verification methods, verified battle scoring, territory adjacency defined by product data, referrals, richer moderation automation, and new territory visualization modes.

## Non-goals

- Selling conventional display advertisements.
- User-generated territory creation without moderation.
- Cryptocurrency settlement or speculative tokens.
- Client-authoritative ownership, pricing, verification, scores, or payment state.
- Invented engagement/conversion metrics.
- Production checkout simulation.

## Important Edge Cases

- Two companies attempt the same current takeover amount concurrently.
- A valid checkout becomes stale before confirmation.
- Duplicate bid requests or provider webhooks arrive.
- A provider reports the wrong amount, currency, or internal reference.
- A former owner and a new owner observe different cached versions.
- A company loses verification, is suspended, or loses its last authorized owner.
- A territory is disabled while payment is pending.
- Season rollover retries after a partial external failure.
- Refunds, disputes, and controlled reversals occur after capture.

## Success Metrics

Targets are **UNVALIDATED / NEEDS REVIEW** until product analytics and launch scale are agreed. Candidate measures are verified-company activation, territory-detail-to-valid-checkout conversion, successful capture rate, repeat capture attempts, median reign duration, active empires, season participation, capture sharing, payment failure rate, webhook processing latency, and transactional inconsistency count.

## Launch Criteria

Launch is **PLANNED** and requires:

- First backend milestone acceptance criteria pass with production-like integration tests.
- No unresolved critical/high security or money-flow defects.
- Real payment sandbox tests cover success, failure, mismatch, replay, and concurrency.
- Verification cannot be faked and authorization has negative-path coverage.
- Monitoring, alerting, backups, restoration exercise, migration checks, rate limiting, runbooks, and kill controls are operational.
- Legal, refund, moderation, privacy, and provider requirements are reviewed.
- Frontend never reports capture until the backend confirms committed ownership.

## Current Delivery Status

- **IMPLEMENTED NOW:** Phase 0 monorepo foundation passed its approved local/offline acceptance suite.
- **UNVALIDATED / NEEDS REVIEW:** Applying the initial migration and querying a live PostgreSQL instance.
- **PLANNED:** All user-facing gameplay, identity, payment, ownership, ranking, season, battle, activity, and admin capabilities.
