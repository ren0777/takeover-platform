# Phase 3 Frontend Takeover UX Design

> **Status: IMPLEMENTED AND FROZEN** as of `658b961`, against the contracts in `c67212a`. See section 14 for what shipped and where it differs from this design. Sections 1-12 were written before implementation and are kept as the record of intent.
>
> Every type, field, endpoint, and status value in this document is **PROPOSED** unless explicitly attributed to a shipped Phase 1/2 contract. Dodo-specific behaviour is marked **UNVALIDATED — requires backend/Dodo docs**.
>
> Written against `5bb642a` (Phase 2 public reads verified live). Phase 2 behaviour is unchanged by this document.

## 1. Non-negotiable rules this design encodes

These are restatements of `docs/RULES.md` and `docs/DESIGN.md`, listed here because every surface below depends on them.

1. **The browser return URL is never success authority.** The return route reads its state from the server and ignores every query parameter the provider appends. A returning user with `?status=succeeded` sees exactly what a user who typed the URL cold sees.
2. **Only committed server state may say "captured".** Provider-side payment success is not ownership. Payment confirmed + capture processing is not ownership.
3. **No fake success, no optimistic ownership.** The territory page never shows the visitor's company as owner because an attempt is in flight.
4. **No inferred pricing.** The frontend never computes, defaults, rounds, or remembers an amount. Every figure rendered comes from a server field in the current response.
5. **No invented provider statuses.** The UI switches on server-published enums only.
6. **A second charge must be impossible from the UI.** Checkout cannot be re-initiated while a payment is pending or confirmed, and a restart always begins from a new quote.
7. **Money keeps Phase 1 semantics** — `Money { amountMinor, currency }`, formatted through the existing `formatMoney`. Never floats, never client arithmetic.
8. **Territory `version` stays an opaque decimal string** (Phase 2 invariant, already tested past `Number.MAX_SAFE_INTEGER`). It is echoed, never parsed or compared numerically.

## 2. Proposed routes and surfaces — the minimum

Two additions. Nothing else is justified.

| Surface                                  | Type                                    | Why it exists                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/territory/[slug]` — **existing**       | server component + new client island    | Hosts the quote panel. Keeps owner, reign, status, and version visible while an amount is reviewed. No redesign: the panel replaces the existing unclaimed-only CTA block.                                                                                                                                                                  |
| `/takeover/[takeoverId]` — **new route** | server component + client status island | The authoritative status surface and the provider return target. Justified because the user leaves the browser and returns cold: state must survive a new tab, a new device, a shared link to support, and repeated visits, and must be pollable without client memory. Keyed by attempt id, so duplicate returns are naturally idempotent. |

**Explicitly rejected surfaces**, to keep the route count honest:

- No `/checkout` route. The redirect is a transient state inside the panel; a route that only forwards adds a history entry the back button lands on.
- No separate `/refund` or `/reconciliation` route. A refund is a continuation of one attempt; splitting it fragments the record and needs its own lookup.
- No dialog/modal for the quote. It is a payment review on mobile-first hardware; an inline panel avoids focus traps, scroll locking, and losing the amount behind a sheet.
- No new claim/verify routes. Contact verification and company access reuse `/claim`, `/verify`, `/manage` exactly as they exist.

### Component boundaries (proposed)

```
src/app/territory/[slug]/page.tsx        (existing, server)
  └─ TakeoverPanel                       (new, client island)
       ├─ QuoteSummary                   (amount, minimum, currency, expiry — presentational)
       ├─ QuoteExpiryCountdown           (client clock, presentational)
       └─ TakeoverActions                (primary/secondary buttons, disabled reasons)

src/app/takeover/[takeoverId]/page.tsx   (new, server: fetch once, render server-known state)
  └─ TakeoverStatusIsland                (new, client: polling + live region)
       └─ TakeoverStateView              (presentational, switches on one server state)

src/lib/data/takeover.ts                 (new, data seam — mirrors lib/data/territories.ts)
src/lib/api/takeover.ts                  (new, fetch layer on TAKEOVER_API_PATHS)
src/lib/takeover/describe-state.ts       (new, PURE: state -> copy/actions/permissions)
src/lib/takeover/use-takeover-status.ts  (new, polling hook)
```

`describe-state.ts` is pure and table-driven, mirroring the existing `describeIdentityError` and `describeReadFailure`. Every row of §3 is one entry in that table, and the whole matrix becomes unit-testable without rendering anything.

## 3. Frontend state / UX matrix

Legend — **Poll**: does the surface refetch on a timer. **Retry**: can the user re-attempt the _same_ action. **Restart**: can a _new_ checkout be initiated from here.

### Quote phase — surface: `/territory/[slug]` panel

| #   | State                          | Primary message                                                                                          | Primary action                  | Secondary action                | Poll                    | Retry | Restart | Must NOT show                                                                                                 |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------- | ----------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **Quote ready**                | The exact amount due, its currency, and the territory it buys. Owner and reign stay visible above it.    | `TAKE OVER {amount}`            | Cancel / back to territory      | No                      | —     | n/a     | Any amount not in this response; savings/discount framing; "guaranteed"; countdown urgency styling            |
| 2   | **Minimum takeover amount**    | Shown inside state 1 as a labelled line: minimum to take over, plus current winning amount when claimed. | (same as 1)                     | —                               | No                      | —     | n/a     | A minimum the client derived; a minimum shown when the server omitted it; a suggested bid                     |
| 3   | **Quote expiring / expired**   | Expiring: absolute expiry time + countdown. Expired: "This quote has expired. Nothing was charged."      | `Get a new quote`               | Back to territory               | No — countdown is local | Yes   | No      | The expired amount as if still payable; auto-refresh that silently swaps the number under the cursor          |
| 4   | **Price changed / superseded** | "The price changed before you paid." New owner, new current amount, new minimum, all from the response.  | `Review the new amount`         | Back to territory               | No                      | Yes   | No      | The old amount as payable; auto-charging the difference; any implication the user was outbid by us            |
| 5   | **Territory version stale**    | "This territory changed while you were reviewing." Requires a fresh quote against the current version.   | `Reload this territory`         | Back to territory               | No                      | Yes   | No      | The stale version's amount; a numeric comparison of versions; a silent retry                                  |
| 6   | **Checkout initiating**        | "Preparing secure checkout…" Button enters busy state; the amount stays on screen.                       | (disabled, busy)                | Cancel                          | No                      | —     | No      | A success tick; a second enabled TAKE OVER button; navigation before the server responds                      |
| 7   | **Redirecting to Dodo**        | "Opening secure checkout with our payment provider. Do not close this tab."                              | (none — navigation in progress) | `Open checkout again` after ~5s | No                      | Once  | No      | "Payment started"; "Do not refresh — you have been charged"; the checkout URL as a copyable/bookmarkable link |

**Disabled-but-visible action.** When the visitor cannot start checkout, the button is disabled with the reason as text beside it — never a silently missing button. Reasons come from the server (`eligibility`, §5), never inferred: contact verification required → link to `/verify` flow; company access pending → link to the existing pending copy; territory disabled → the existing Phase 2 "unavailable" notice wins and no quote is requested at all.

### Post-handoff phase — surface: `/takeover/[takeoverId]`

| #   | State                                                        | Primary message                                                                                                                                            | Primary action                    | Secondary action                     | Poll                                            | Retry | Restart                                                 | Must NOT show                                                                                                                                           |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------ | ----------------------------------------------- | ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | **Returned from checkout, status unknown**                   | "Checking with our payment provider. Your browser returning here does not confirm anything."                                                               | (none — waiting)                  | `Refresh now`                        | **Yes** (§6 schedule)                           | Yes   | No                                                      | Any word implying payment or capture succeeded; the provider's query parameters; confetti; owner change                                                 |
| 9   | **Payment pending**                                          | "Payment is still being confirmed by the provider. The territory has not changed hands."                                                                   | (none)                            | `Refresh now` · `View territory`     | **Yes**                                         | Yes   | **No** (charge in air)                                  | "Purchased"; "You own"; a new-owner name; an option to pay again; an estimated completion time we cannot know                                           |
| 10  | **Payment confirmed, capture processing**                    | "Payment confirmed. Transferring the territory now — this is not complete yet."                                                                            | (none)                            | `Refresh now`                        | **Yes**                                         | Yes   | No                                                      | Ownership as transferred; a capture celebration; the reign clock started; a share card                                                                  |
| 11  | **Capture succeeded**                                        | "You captured {territory}." Amount charged, new reign start, previous owner when the server supplies it.                                                   | `View territory`                  | `View your empire` (company page)    | **No — terminal**                               | —     | No                                                      | Any pending/processing language; a second TAKE OVER for the same territory; an amount not returned by the server                                        |
| 12  | **Capture failed after payment**                             | "Your payment succeeded but the territory could not be transferred. You have not lost the money — this is being resolved."                                 | (none)                            | `Contact support` with reference     | **Yes** until reconciliation status is terminal | No    | **No**                                                  | "Refunded" before `refundStatus` says so; blame on the user; a retry button that could charge again; a bare "something went wrong" with no money status |
| 13  | **Reconciliation required**                                  | "This attempt needs manual review. It is recorded and is being worked on." Attempt id + request id shown in mono.                                          | `Contact support` with reference  | `View territory`                     | Low-frequency (§6)                              | No    | No                                                      | An ETA; an automatic refund promise; any implied ownership; a re-purchase button                                                                        |
| 14  | **Refund pending**                                           | "A refund has been started. The provider has not confirmed it yet."                                                                                        | (none)                            | `Refresh now` · `Contact support`    | **Yes**                                         | Yes   | No                                                      | "Refunded"; a refund amount not supplied by the server; a settlement date we cannot know                                                                |
| 15  | **Refunded**                                                 | "This attempt was refunded." Refunded amount and currency from the server.                                                                                 | `Back to territory`               | `Contact support`                    | **No — terminal**                               | —     | **Yes**, from a new quote                               | Ownership; the original amount as still owed; automatic re-entry into checkout                                                                          |
| 16  | **Management/session expired mid-flow**                      | "Your management session ended. This does not cancel or duplicate anything you have already paid."                                                         | `Get a new management link`       | `View status` (public-safe subset)   | Paused while unauthorised                       | Yes   | No                                                      | A login/password form (none exists in V1); the attempt silently disappearing; a fresh checkout as the recovery path                                     |
| 17  | **Territory captured by someone else while payment pending** | "Another company captured this territory while your payment was being confirmed. You did not capture it." Then the money status, verbatim from the server. | (none until money state is known) | `View territory` · `Contact support` | **Yes** until money state is terminal           | No    | **No** — new quote only, after the money state resolves | The user as owner; "try again" before the refund/reconciliation state is known; a re-charge; the losing amount as payable                               |

**State 17 is the hard one and the design is deliberate:** the frontend never composes "you lost" from separate ownership and payment reads. It renders one server-computed outcome, then the money status underneath it, and offers no action that could spend money until the money status is terminal.

## 4. Error and edge cases

Mapped to the matrix rather than invented as new screens. All copy is honest about money.

| Case                                  | Where it surfaces          | Behaviour                                                                                                                                                                                                                   |
| ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quote expired                         | Panel (state 3)            | Blocked action, explicit "nothing was charged", new-quote path.                                                                                                                                                             |
| Price changed                         | Panel (state 4)            | Explicit review required; never auto-charged. Matches the Phase 3 acceptance criterion already in `docs/PHASES.md`.                                                                                                         |
| Territory version stale               | Panel (state 5)            | Reload; version echoed as an opaque string, never compared client-side.                                                                                                                                                     |
| Territory disabled                    | Panel suppressed           | Existing Phase 2 "This territory is unavailable" notice stands; no quote is requested. Disabled always suppresses action.                                                                                                   |
| Management session expired            | Either surface (state 16)  | Re-auth through the existing management-link flow, returning to the same `takeoverId`.                                                                                                                                      |
| Access lost (grant revoked)           | Either surface             | Same as 16 but says access, not session; never offers a new checkout as the fix.                                                                                                                                            |
| Checkout creation failed              | Panel (state 6 → error)    | Retryable. Copy states no charge was made — safe only because creation failed before handoff.                                                                                                                               |
| Payment still pending                 | Status route (state 9)     | Poll with backoff; no restart.                                                                                                                                                                                              |
| Webhook delayed                       | Status route (states 8–10) | Same states; after the poll budget expires, switch to "still processing" with manual refresh and a support reference. Never escalate to failure on a timeout.                                                               |
| Duplicate return visit                | Status route               | Idempotent by construction: the route is keyed by attempt id and reads server state. Repeated visits render the same state.                                                                                                 |
| Payment succeeded, capture impossible | Status route (12/13)       | Money-first copy, support reference, no retry.                                                                                                                                                                              |
| Refund pending / refunded             | Status route (14/15)       | Only from `refundStatus`. Never anticipated.                                                                                                                                                                                |
| API unavailable                       | Both                       | Reuse the shipped `describeReadFailure` states: "The service is unavailable … this is an outage, not an empty result." Never fixtures, never an assumed status. On the status route this is critical: **unknown ≠ failed**. |

## 5. Minimum data the frontend needs — ALL NAMES PROPOSED

The frontend must not define these types; it will import them from `@takeover/shared` once published. This is a requirements list, not a contract.

### Quote (PROPOSED)

| Field                                                 | Why the UI needs it                                                                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quoteId`                                             | Opaque handle to submit for checkout.                                                                                                                 |
| `territorySlug` / `territoryId`                       | Correlate to the page; build links.                                                                                                                   |
| `territoryVersion`                                    | Echo back; detect staleness server-side. Opaque decimal string.                                                                                       |
| `amountDue: Money`                                    | The single figure rendered on the button and in review.                                                                                               |
| `minimumTakeoverAmount: Money`                        | The stated minimum (state 2).                                                                                                                         |
| `currentWinningAmount?: Money`                        | Present only when claimed; absent for unclaimed.                                                                                                      |
| `expiresAt` (ISO 8601 UTC)                            | Countdown and expiry state.                                                                                                                           |
| `status` (PROPOSED `active \| expired \| superseded`) | Discriminates states 1/3/4 without client date maths.                                                                                                 |
| `checkoutAvailable: boolean`                          | Replaces the Phase 1 `literal(false)`. Gate for the primary action.                                                                                   |
| `eligibility` (PROPOSED reason enum)                  | Why the action is disabled: `contact_verification_required \| company_access_pending \| territory_disabled \| not_authorized`. Enum, never free text. |

### Takeover attempt status (PROPOSED)

| Field                                            | Why the UI needs it                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **`state`** (single discriminated enum)          | **The most important ask.** One server-computed field the UI switches on, covering states 8–17. |
| `takeoverId`                                     | Route key, support reference.                                                                   |
| `quoteId`, `territorySlug`, `territoryVersion`   | Correlation and links.                                                                          |
| `amountCharged?: Money`                          | Only what was actually charged; absent until the server knows.                                  |
| `paymentStatus` (PROPOSED)                       | Secondary detail line; never composed into `state` by the client.                               |
| `captureStatus` (PROPOSED)                       | Secondary detail line.                                                                          |
| `reconciliationStatus` (PROPOSED)                | States 12–13.                                                                                   |
| `refundStatus`, `refundedAmount?: Money`         | States 14–15. The only source for the word "refunded".                                          |
| `capturedAt?`, `newOwner?: CompanyPublicSummary` | State 11 success detail. Reuses the shipped Phase 2 projection.                                 |
| `failureReason?` (safe enum)                     | Distinguish honest causes without leaking provider internals.                                   |
| `updatedAt`                                      | "As of" timestamp beside a polled value.                                                        |
| `pollAfterMs?`                                   | Server-controlled cadence; overrides the client schedule when present.                          |
| `supportReference?` / `requestId`                | Already conventional in this codebase's error envelope.                                         |

### Checkout creation response (PROPOSED)

`takeoverId`, `checkoutUrl` (consumed immediately for navigation, never rendered as a bookmarkable link), and an echo of `amountDue`. Requires server-side idempotency so a double submit returns the **existing** attempt rather than creating a second checkout.

### Error codes

Existing and reusable: `STALE_TERRITORY_VERSION`, `TERRITORY_DISABLED`, `OWNERSHIP_CONFLICT`, `AUTHORIZATION_REQUIRED`, `COMPANY_ACCESS_PENDING`, `CONTACT_VERIFICATION_REQUIRED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`.
Proposed additions: `QUOTE_EXPIRED`, `QUOTE_SUPERSEDED`, `BELOW_MINIMUM_AMOUNT`, `CHECKOUT_UNAVAILABLE`, `CHECKOUT_CREATION_FAILED`.

### UNVALIDATED — requires backend/Dodo docs

- Return URL shape, and which query parameters Dodo appends (the frontend will ignore all of them regardless).
- Whether a distinct cancel/abandon return URL exists, and what a user-cancelled checkout looks like server-side.
- Checkout session lifetime, and whether it can be resumed after expiry.
- Typical and worst-case webhook latency — needed to size the poll budget honestly rather than guess.
- Whether the provider return is guaranteed at all on mobile in-app browsers, 3DS interstitials, or a killed tab. The design assumes it is **not** guaranteed: the status route must be reachable without ever returning.
- Refund initiation surface and whether partial refunds are possible.

## 6. Polling and refetch strategy

Client polling is a fallback for a webhook we cannot observe, not a transport. Rules:

- **Only non-terminal states poll**: 8, 9, 10, 12 (until reconciliation resolves), 13 (slow), 14, 17 (until money is terminal). States 11 and 15 are terminal and must stop.
- **Server first.** If `pollAfterMs` is present, obey it. Honour `Retry-After` on 429 (`ApiRequestError.retryAfterSeconds` already carries it).
- **Default schedule when the server gives no hint** (PROPOSED): 2s for the first 20s → 5s to 2 minutes → 15s to 10 minutes → stop. Then show "still processing", a manual `Refresh now`, and a support reference. **A timeout is never rendered as a failure.**
- **Visibility aware**: pause when `document.visibilityState === 'hidden'`; on return to visible, refetch once immediately, then resume the schedule.
- **Hard caps**: never faster than 2s; bounded total request count; a failed poll uses backoff and never tightens the interval.
- **The territory page never polls.** The board and detail pages stay static server components — that property is why they ship 164 B of client JS today and it must not regress.
- **Never poll while unauthorised** (state 16): pause, prompt re-auth, resume after.
- Refetch on window focus is allowed on the status route only; it must not silently swap a quote amount under the cursor on the panel.

## 7. Error-state behaviour

- Reuse the shipped seam: `ApiRequestError` + `describeReadFailure` distinguish _unreachable_, _malformed_, and _rate limited_, and the pages already render them honestly with no fixture fallback.
- **On the status route the distinction is safety-critical.** A failed _poll_ means "we do not know", never "it failed". The last known server state stays on screen with an "as of {updatedAt}" line and a non-alarming "couldn't refresh" notice.
- Malformed responses are refused, not partially rendered (existing behaviour: a contract mismatch throws rather than showing half a state).
- Money is never rendered from a response that failed schema validation.
- Every terminal money-relevant failure shows a copyable reference (`requestId`, already supported by `Notice` and `ErrorState`).

## 8. Accessibility requirements

Targets WCAG 2.2 AA, consistent with `docs/DESIGN.md`.

- **Live updates**: the status island is a polite live region (`role="status"`, `aria-live="polite"`). Failure states use `role="alert"`. Announce state _changes_ only — never re-announce on every poll.
- **Focus**: on transition to a terminal state, move focus to the status heading so a screen-reader user is not stranded. If a dialog is ever used, trap focus and return it to the trigger; no context loss on recoverable errors.
- **Countdown**: the ticking value is `aria-hidden`; announce at thresholds only, and always render the absolute expiry time as text. No information conveyed by the countdown alone.
- **Never colour alone**: every state carries a text label. Reuse `StatusBadge` (tone is accent only) and `Notice` (title carries meaning) exactly as they are built.
- **Amounts**: render currency accessibly — `formatMoney` output plus a visually-hidden currency code where the symbol is ambiguous.
- **Motion**: state changes get the restrained 400–700ms treatment at most; `prefers-reduced-motion` removes it entirely. Nothing about payment or capture may depend on animation. No spinner is ever the sole indicator of state.
- **Keyboard**: full flow operable by keyboard; visible focus throughout; the disabled primary action stays focusable-adjacent to its stated reason so the reason is discoverable.
- **Targets**: 44×44 CSS px minimum — the existing `Button` primitive already fixes 44px height.

## 9. Mobile behaviour

- Works from **320 CSS px** with no horizontal page scroll (existing requirement, existing layout).
- The quote panel is inline and stacked: territory identity → amount → minimum → expiry → action. **The amount stays visible above the action**, per `docs/DESIGN.md`; the action is not a fixed overlay that hides the figure. Panel padding respects `env(safe-area-inset-bottom)`.
- Provider handoff happens in the same tab by default. The design assumes the return may never happen (in-app browsers, app switching, killed tabs), so `/takeover/[takeoverId]` must be reachable cold — from an email, from the management surface, or by link.
- The status route is a single column of text and one or two actions; no tables, no side-by-side comparisons.
- Long values (attempt ids, references) wrap with `break-all` in mono, as the existing surfaces already do.

## 10. Implementation tasks, once authoritative contracts land

Ordered, each frontend-only and independently verifiable.

1. **Pre-req (existing defect, see §12):** fix the `/claim` territory prefill so deep-linked takeover context survives into the claim flow.
2. Add the new resources to the existing per-resource seam: extend `DATA_RESOURCES` and add `TAKEOVER_API_PATHS` beside `TERRITORY_API_PATHS` (same dependency-free module pattern, so the smoke script can load it under plain Node).
3. Add `src/lib/api/takeover.ts` using the shipped client (`apiRequest`/`apiRequestEnvelope`, CSRF-aware POST already supported) and the published schemas. No local types.
4. Add `src/lib/data/takeover.ts` as the only entry point, with the same fixture/live switching, production no-fallback, and lazy-import rules the territory seam already enforces.
5. Write `src/lib/takeover/describe-state.ts` as a pure table covering every row of §3, including the `mustNotShow` assertions, and unit-test the table exhaustively (a missing state must fail the type check, not fall through to a default).
6. Write `use-takeover-status.ts` with the §6 schedule; test with fake timers for backoff, visibility pause, terminal stop, poll-failure-is-not-failure, and the hard caps.
7. Build `TakeoverPanel` on the existing `/territory/[slug]`, replacing only the current unclaimed CTA block. No other Phase 2 markup changes.
8. Build `/takeover/[takeoverId]`: server component fetch + client island, `noindex`, plus `not-found.tsx` and `error.tsx` matching the shipped pattern.
9. Add tests that encode the hard rules directly: return-URL query parameters are ignored; no state renders success without the server's terminal success; restart is impossible while payment is pending/confirmed; amounts render only from the response.
10. Extend `scripts/territory-contract-smoke.ts` with the new read endpoints (GET only — it must never create a checkout).
11. Update `docs/MEMORY.md` and this spec with verified implementation evidence.

## 11. Backend handoffs and open questions

1. **Publish one discriminated `state` field on the attempt status.** If the frontend has to combine `paymentStatus` + `captureStatus` + `refundStatus` itself, it will eventually compose a combination you did not intend and show something untrue. One server-owned enum removes that whole class of bug.
2. **Which states are terminal?** The client must know when to stop polling. Please publish this as data (e.g. a `terminal: boolean`) rather than as tribal knowledge.
3. **Idempotency of checkout creation**: does a repeated create return the existing attempt? The UI blocks double submission, but a network retry must not create a second charge.
4. **Reachability without a return**: confirm `/takeover/{id}` can be resolved by a user who never comes back from the provider — ideally an emailed link. If not, some payers will have no path back to their own money.
5. **Quote lifetime and refresh semantics**: is refreshing a quote free and unlimited, or rate-limited? Is a superseded quote distinguishable from an expired one? (§5 assumes yes.)
6. **Authorisation model for the status route**: is it company-session-scoped, or does the opaque `takeoverId` authorise the read? This decides whether state 16 can still show status after a session ends.
7. **What the server considers "captured by someone else"** and whether that is delivered as its own `state` value or must be inferred from the territory read. The frontend must not infer it.
8. **Dodo specifics** listed under §5 UNVALIDATED — all require official documentation before any of it is designed further.

## 12. Phase 2 defects found while reviewing (reported, not fixed)

1. **`/claim` drops a deep-linked territory.** `apps/web/src/app/claim/claim-form.tsx:133` passes the incoming territory reference as `placeholder` rather than `defaultValue`. A visitor arriving from a territory's "Claim this territory" link sees the slug greyed out; unless they retype it, the form submits an empty `territoryExternalRef` and fails validation. Small, real, and squarely in the path Phase 3 will depend on — fix it before task 2 above.
2. **`docs/MEMORY.md` has three corrupt lines at the top** (`  5 | …`, ` 6 |`, `  7 | …`), committed in `23db0c7` — a paste that kept its line-number gutter. Its "Current Phase" section also still reads "Phase 2 … IN PROGRESS … public APIs remain PLANNED" while the same file's later handoff records the routes as shipped and verified. Left untouched because the file is actively owned by another agent.

Neither blocks this preparation work.

## 13. Reconciliation with `docs/PHASE3_DESIGN.md` (Inception, commit `b48137c`)

Inception published a backend/state-machine design in parallel with this document. The two are complementary — theirs owns storage, transactions, and provider handling; this one owns what a person sees. Where they overlap, **their design wins on naming** and this spec adapts. The mapping below is what the frontend will bind to, plus the gaps that must close before implementation.

### Name mapping (their field -> this spec)

| `PHASE3_DESIGN.md`                                  | This spec                      | Note                                                                                             |
| --------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `POST /api/checkout/quote`                          | quote read                     | Replaces the assumed path; absorbed by one line in the paths module.                             |
| `POST /api/checkout/create`                         | checkout initiation (state 6)  | Returns `providerCheckoutUrl`, consumed immediately for navigation.                              |
| `GET /api/payment/status/:checkoutId`               | status route data source       | **`takeoverId` in this spec is their `checkoutId`.** The route becomes `/takeover/[checkoutId]`. |
| `TakeoverQuote.status` `ACTIVE\|EXPIRED\|CANCELLED` | quote `status`                 | No `SUPERSEDED` value; see gap 4.                                                                |
| State-machine nodes (Quote Ready -> Refunded)       | states 1, 6, 9, 10, 11, 13, 15 | Their node names are the natural source for the single `state` field asked for in §5.            |

### Gaps that block frontend implementation

1. **The status endpoint is company-session gated, but the payer may not have a session when they return.** Their §13 has the browser polling `/api/payment/status/:checkoutId` after return, yet management sessions expire (`MANAGEMENT_SESSION_TTL_SECONDS`, 8h default) and provider redirects routinely land in a different browser or in-app webview. A payer who cannot authenticate then has no way to see the state of money they have already spent — state 16 becomes a dead end. **Request:** allow a minimal, non-sensitive status read authorised by the unguessable `checkoutId` alone, or email a status link at checkout creation.
2. **No single field expresses capture, reconciliation, or refund.** `CheckoutSession.status` (`CREATED / PENDING / COMPLETED / FAILED / CANCELLED`) and `Payment.status` (`PENDING / CAPTURED / FAILED / REFUNDED / RECONCILED`) cannot distinguish states 10–15, and `Payment.status = CAPTURED` is dangerously ambiguous: it reads as "territory captured" but means "money taken". A frontend that composes these two enums will eventually render ownership that does not exist. **Request stands (§5): one `state` field using the §8 node names, plus `terminal: boolean`.**
3. **"Captured by someone else while payment pending" has no representation.** Their §6 answer says the first webhook wins and later ones are ignored, but the losing payer's outcome is not a distinct state — it collapses into failure or reconciliation. State 17 needs its own value because the copy, the money story, and the available actions all differ from a generic failure.
4. **Price changed and version stale are indistinguishable.** Both surface as `409` at checkout creation, but they need different copy: one says the price moved, the other says the territory moved. **Request:** distinct stable error codes.
5. **Amount model is undecided.** The quote returns `minimumAmountMinor`, while `POST /api/checkout/quote` accepts `intendedAmountMinor?`. Is the charge always the minimum, or a user-chosen amount at or above it? This is the difference between a one-button panel and an amount-entry form — a materially different surface. **Please decide before task 7.** Either way the frontend renders only the server's authoritative charge figure.
6. **Money shape diverges from the shipped convention.** `minimumAmountMinor` + `currency` as sibling fields bypasses the canonical `moneySchema` (`{ amountMinor, currency }`) that `formatMoney` and the existing currency-match refinements already rely on. **Request:** publish `Money`.
7. **`returnUrl` is client-supplied** on `/api/checkout/create`. That is an open-redirect and phishing surface. The frontend is happy to send nothing and let the server build the return URL from a server-side allowlist.
8. **`territory_version` is `BIGINT` in storage.** Over JSON it must remain a decimal string, matching the shipped Phase 2 invariant the frontend already tests beyond `Number.MAX_SAFE_INTEGER`.

Their §10 Dodo unknowns and this spec's §5 UNVALIDATED list agree and do not conflict.

## 14. As-built (2026-09-02)

Implemented in five frontend-only commits: `f9f248a` (claim prefill), `07788a4` (seam), `4d099af` (state table), `1e968b7` (panel), `658b961` (status route and polling). 213 web tests pass; typecheck, lint, build and format check are clean.

All eight pre-implementation contract checks passed against `c67212a`. The blocker reported against `217f7dc` — `RECONCILIATION_REQUIRED` forced to `terminal: true`, contradicting the approved design — was corrected upstream before any code was written.

Where the build differs from sections 1-13, and why:

| Design said                                                 | Shipped                                                 | Why                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route keyed by `takeoverId`, later mapped to `checkoutId`   | `/takeover/[statusToken]`                               | The contract publishes a separate opaque `statusToken` on the checkout response, which is what the server puts in the provider return URL. It authorises the read without a session, which is what gap 2 asked for. |
| Quote shown on page load                                    | Quote requested by a "Review takeover" action           | A quote is a company-scoped mutation, so fetching one for every visitor to a public page would be wrong. The amount still appears above the action, as required.                                                    |
| State 8, "returned but status unknown", as a rendered state | Not rendered                                            | The route is a server component that fetches before it renders, so a cold return lands directly on the authoritative state. The transient unknown never reaches a person.                                           |
| `LOST_TERRITORY_RACE` needs its own state (gap 3)           | Granted upstream, and non-terminal                      | The loser's money still has to resolve, so the surface keeps polling toward a settled outcome. This is now backend handoff 2.                                                                                       |
| State 15 shows a refunded amount                            | Shows `amountCharged` only                              | The contract exposes no refund amount, and the frontend will not invent one. Backend handoff 3.                                                                                                                     |
| `eligibility` as a reason enum                              | `eligibilityReason` free-form string, rendered verbatim | No recovery UX is built on an unstable string. Backend handoff 4.                                                                                                                                                   |

Frozen: scope does not expand until the backend quote, checkout, and status endpoints exist and their real responses have been inspected. The five open backend handoffs are recorded in `docs/MEMORY.md`.
