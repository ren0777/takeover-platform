# V1 completion design

The user approved completing documented V1 and these defaults on 2026-09-20.

## Competition and seasons

One server scoring boundary awards 100 points per active territory and 25 per distinct category, with deterministic company-ID tie ordering. Publish the scoring version and configuration. Derive public company statistics, leaderboard and capture activity from committed ownership/payment facts, never client metrics. Provide cursor-based activity and resumable SSE with bounded replay, cleanup, and recovery. No fictitious production events.

Seasons default to 30 days with configurable duration and explicit persisted boundaries. Preserve paid ownership at rollover. Freeze standings at the end boundary from historical reigns; retries and concurrent rollovers must create exactly one next season and immutable archives. Expose current season, archives and Hall of Fame in the API and web UI. Do not count captures after the boundary in frozen results.

## Operators

Use an independent high-entropy server-configured bearer credential and stable operator identity, never company sessions. Separate read and moderation permissions. Essential operations: inspect audit/payment/reconciliation state, review recovery requests, suspend/restore companies, disable/enable territories and revoke management grants. Mutations require a reason and atomically record before/after audit evidence. Preserve money and ownership history; no generic database editor or financial repair bypass. Keep credentials out of browser persistence/logs and fail closed when unconfigured.

## Public experience and launch

Add real data pages for rankings, activity, seasons and Hall of Fame, plus canonical metadata and sharing for public territory/company pages. Keep private capability pages out of indexing and shared links. Supply production email transport behind the existing interface, deployment configuration, explicit payment enablement, secure headers, readiness, bounded request handling, database-safe test commands, CI, backup/restore and incident runbooks. External hosting credentials, sender verification, payment sandbox transactions, real restore drills and deployment load evidence remain explicit external acceptance gates until actually exercised.

## Boundaries

Use @takeover/shared for public contracts and packages/database as sole Prisma owner. No traditional user accounts. No battles or referrals in this V1. No live charges, outreach, or deployment without corresponding authorization/configuration. Existing payment/refund safeguards remain mandatory.
