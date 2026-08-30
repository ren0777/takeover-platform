# TakeOver.com Product Requirements

> **Document status:** Product requirements are **PLANNED** unless a section explicitly says **IMPLEMENTED NOW**. Phases 0 and 1 are implemented and verified locally, including Phase 1 migrations and integration tests against PostgreSQL 17. Phase 2 territory/ownership architecture is approved but not implemented.

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

1. A visitor selects a territory and enters or selects a company name, public website, optional logo, and contact email.
2. The visitor proves control of the contact channel through a single-use email challenge; the email domain does not need to match the website.
3. For a new company, the server preserves a private, expiring company draft and takeover intent without establishing participation, ownership, or public company status.
4. For an existing managed company, a different verified contact creates a pending access request and remains blocked from checkout until an existing manager approves it or manual recovery succeeds.
5. A valid company-scoped management capability authorizes sensitive company actions. Payment alone never grants that capability.
6. Only a later backend-confirmed successful payment may activate the draft company and establish territory ownership through the capture transaction.

### Discover and inspect territory

1. A visitor explores territories by category, status, activity, or ranking.
2. Territory detail shows the authoritative owner, current winning amount, legal minimum takeover amount, reign start, and capture history.
3. Disabled or unavailable states explain why capture is unavailable.

### Capture territory

1. A visitor prepares a new-company claim or uses a valid management capability for an existing company.
2. The server calculates the legal minimum from current committed state.
3. The user reviews the exact amount, currency, and provider checkout boundary.
4. An existing-company access request must be approved before checkout can begin.
5. The server revalidates territory version, owner, winning amount, minimum takeover amount, and currency; stale quotes require explicit review and are never auto-charged.
6. Payment is initiated through the provider-neutral abstraction and V1 Dodo adapter.
7. Only a verified server-side provider confirmation can trigger an atomic ownership transfer.
8. The resulting capture is stored, audited, and published as activity.

### Defend and build an empire

1. Owners see current reigns and newly increased takeover requirements.
2. Dethroned companies can return with a new legal bid.
3. Multiple active territories contribute to one configurable empire score.
4. Rankings and season archives show results without client-submitted statistics.

## Functional Requirements

### Company and claim identity — IMPLEMENTED NOW / PROFILE EXPANSION PLANNED

- V1 has no `User` model, passwords, signup/login, password reset, global authenticated dashboard, or global end-user session.
- Company identity is separate from management authority. Authority derives from a verified contact, active company-specific grant, and short-lived company-scoped management session.
- Email links are opaque, single-use, expiring capabilities exchanged for Secure, HttpOnly sessions; raw tokens are not persisted or logged.
- A contact may manage multiple companies through separate grants and separately scoped sessions. Company A authority never authorizes Company B.
- A different verified contact requesting an existing managed company creates a pending `CompanyAccessRequest`, remains blocked from checkout and mutations, and requires existing-manager approval or manual recovery.
- Company profiles contain identity, website, descriptions, logo, social links, categories, verification state, timestamps, and server-derived statistics.
- `TakeoverIntent` preserves preparation and a quote snapshot but never locks price or grants management/ownership.

### Company verification — CONTACT VERIFIED IMPLEMENTED / STRONGER LEVELS PLANNED

- `contact_verified` is sufficient for V1 participation and proves only control of the verified email management channel.
- Personal email providers are valid; matching-domain email, DNS control, incorporation, and enterprise identity are not required.
- `domain_verified` and `manually_verified` are optional future levels.
- Stored verification evidence includes purpose/status, attempted time, verified time, revocation where relevant, and safe failure reason.
- No client assertion or UI action can make a company verified.

### Territories and ownership — PLANNED

- Territories have stable IDs/slugs, category, validated visual metadata, backend-authoritative `displayWeight` on a `1..100` scale, availability, concurrency version, and timestamps.
- Public Phase 2 states are derived as unclaimed, claimed, or disabled. `contested` is absent until a later phase can derive it from real authoritative bidding state.
- `TerritoryOwnership` is the sole ownership source of truth. PostgreSQL permits at most one active reign per territory and prevents overlapping ownership timelines.
- Historical ownership records retain real companies and reign boundaries. Suspension does not rewrite an owner or replace it with a fabricated placeholder.
- Physical mosaic position and CSS adjacency carry no gameplay meaning.
- Initial categories and territories enter through a small deterministic reviewed seed; Phase 2 does not introduce a general administrator mutation surface.

### Bidding and payments — PLANNED

- The backend calculates the legal amount and validates company-scoped authority, verification, territory state/version, currency, and idempotency.
- Client totals are advisory display values only.
- Dodo Payments is the initial V1 provider behind a provider-neutral payment interface; Dodo-specific types cannot enter bidding or ownership services.
- Webhooks require signature verification, replay protection, reference/amount/currency checks, and explicit processing state.
- Failed or incomplete payments never transfer ownership.
- Browser success/return URLs never transfer ownership. A confirmed payment that cannot legally capture enters an explicit reconciliation/refund state instead of silently changing a charge or ownership.

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

- Territory controls, company/contact/grant review, bid/payment/webhook investigation, company or capability restrictions, suspicious-activity review, and controlled state repair.
- Every admin mutation is authorized and audited.
- Rate limits and risk controls protect identity, verification, bidding, payment, and administrative endpoints.

### Analytics — PLANNED

- Measure discovery-to-detail, detail-to-checkout, successful capture, repeat competition, defense behavior, sharing, and retention.
- Financial and ownership metrics derive from authoritative server records.
- Analytics failures cannot affect transactional correctness.

## V1 Scope

- Passwordless company/contact identity, contact-email verification, company-scoped management capabilities, access approval/rejection, and manual-recovery architecture.
- Public territory category/list/detail/history and company-territory reads, backed initially by deterministic reviewed territory seed data.
- Server-calculated takeover price, provider-neutral Dodo Payments implementation when configured and validated, verified webhooks, and atomic ownership history.
- Live capture activity through validated SSE infrastructure.
- Company statistics, empire scoring, current leaderboard, configurable seasons, archives, Hall of Fame, essential moderation, and audit logs.

V1 battle scope is **UNVALIDATED / NEEDS REVIEW** because trustworthy scoring inputs have not been selected.

## Future Scope

- Traditional human accounts only if later justified without replacing company identity; optional domain/manual verification; additional payment providers; verified battle scoring; territory adjacency defined by product data; referrals; richer moderation automation; and new territory visualization modes.

## Non-goals

- Selling conventional display advertisements.
- User-generated territory creation without moderation.
- Cryptocurrency settlement or speculative tokens.
- Client-authoritative ownership, pricing, verification, scores, or payment state.
- Invented engagement/conversion metrics.
- Production checkout simulation.
- V1 usernames, passwords, signup/login pages, password recovery, persistent global user accounts, or a generic authenticated dashboard.
- Treating a payment email, company website, company ID, or browser return URL as management authority.

## Important Edge Cases

- Two companies attempt the same current takeover amount concurrently.
- A valid checkout becomes stale before confirmation.
- Duplicate bid requests or provider webhooks arrive.
- A provider reports the wrong amount, currency, or internal reference.
- A former owner and a new owner observe different cached versions.
- A company loses verification, is suspended, or loses its last authorized owner.
- A different verified contact requests an existing managed company, managers do not respond, or notifications are abused for spam.
- A new-company draft collides with a company created before its payment confirms.
- An access request is approved after its takeover quote becomes stale.
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
- Verification cannot be faked; company-scoped capability isolation, token replay, expiry/revocation, and access-request denial have negative-path coverage.
- Monitoring, alerting, backups, restoration exercise, migration checks, rate limiting, runbooks, and kill controls are operational.
- Legal, refund, moderation, privacy, and provider requirements are reviewed.
- Frontend never reports capture until the backend confirms committed ownership.

## Current Delivery Status

- **IMPLEMENTED NOW:** Phase 0 foundation and Phase 1 company-claim identity passed their approved local and PostgreSQL acceptance suites.
- **PLANNED:** Phase 2 territory/authoritative ownership implementation; all pricing, payment, capture, ranking, season, battle, activity, and admin capabilities.
- **UNVALIDATED / NEEDS REVIEW:** Production PostgreSQL/provider configuration, production email delivery, hosting topology, and operational readiness.
