# Phase 3 Design Specification – Pricing, Checkout, Capture, Payment

**Purpose** – Define the authoritative backend design for Phase 3 (pricing, checkout, payment, capture, reconciliation) while preserving existing Phase 2 contracts and code.

---

## 1. Authoritative Pricing

- **Storage** – `Territory` table gains two new columns:
  - `minimum_takeover_amount_minor` – `BIGINT` (non‑negative) – the legal minimum price for a takeover.
  - `currency` – `VARCHAR(3)` – ISO‑4217 code (e.g. `USD`).
- **Computation** – The minimum amount is derived **server‑side** from the current winning amount (if any) plus a configurable increment (`pricing_increment_percent`). All calculations use integer minor units; no floating‑point.
- **Updates** – Only the **ownership transaction** may update `minimum_takeover_amount_minor` and `currency` when a capture succeeds. The value is immutable for the duration of a checkout.

---

## 2. Quote Model (`TakeoverQuote`)

| Field | Purpose | Type | Constraints |
|-------|---------|------|-------------|
| `id` | Primary key (UUID) | `UUID` | `PRIMARY KEY` |
| `territory_id` | FK to `Territory.id` | `UUID` | `NOT NULL`, `FOREIGN KEY (territory_id) REFERENCES Territory(id) ON DELETE RESTRICT` |
| `territory_version` | Snapshot of `Territory.version` at quote time | `BIGINT` | `NOT NULL` |
| `company_id` | FK to `Company.id` (the quoting company) | `UUID` | `NOT NULL`, `FOREIGN KEY (company_id) REFERENCES Company(id) ON DELETE RESTRICT` |
| `currency` | Currency of the quote | `VARCHAR(3)` | `NOT NULL` |
| `minimum_amount_minor` | Authoritative minimum takeover amount | `BIGINT` | `NOT NULL`, `> 0` |
| `observed_at` | Server timestamp when quote was generated | `TIMESTAMPTZ` | `NOT NULL` |
| `expires_at` | Quote expiry (configurable, e.g. 5 min) | `TIMESTAMPTZ` | `NOT NULL` |
| `status` | Quote lifecycle | Enum `['ACTIVE','EXPIRED','CANCELLED']` | `NOT NULL`, default `ACTIVE` |

**Unique / Idempotency** – (`territory_id`, `company_id`, `territory_version`) must be unique for `ACTIVE` quotes. A new quote for the same triple must first **CANCEL** the previous `ACTIVE` quote (or reject if a capture is pending).

**FK Relationships** – `territory_id → Territory`, `company_id → Company`.

**Lifecycle** – `ACTIVE → EXPIRED` (by time) or `CANCELLED` (by new quote) → (final) `CAPTURED` (via capture transaction) – capture creates a `Payment` record and updates ownership.

---

## 3. Checkout Model (`CheckoutSession`)

| Field | Purpose | Type | Constraints |
|-------|---------|------|-------------|
| `id` | Primary key (UUID) | `UUID` | `PRIMARY KEY` |
| `quote_id` | FK to `TakeoverQuote.id` | `UUID` | `NOT NULL`, `FOREIGN KEY (quote_id) REFERENCES TakeoverQuote(id) ON DELETE RESTRICT` |
| `provider` | Payment provider identifier (e.g. `DODO`) | `VARCHAR(20)` | `NOT NULL` |
| `provider_checkout_id` | Provider‑specific checkout identifier | `VARCHAR` | `NOT NULL`, unique per provider |
| `created_at` | Server timestamp | `TIMESTAMPTZ` | `NOT NULL` |
| `status` | Enum `['CREATED','PENDING','COMPLETED','FAILED','CANCELLED']` | `VARCHAR` | `NOT NULL`, default `CREATED` |

**Idempotency** – `provider_checkout_id` must be unique per provider; duplicate creation attempts with the same provider checkout ID are rejected (`409 Conflict`).

**Transaction Ownership** – The checkout creation is a **single‑step** DB transaction that records the provider checkout ID and links to the quote. No money moves yet.

---

## 4. Payment Model (`Payment`)

| Field | Purpose | Type | Constraints |
|-------|---------|------|-------------|
| `id` | Primary key (UUID) | `UUID` | `PRIMARY KEY` |
| `checkout_id` | FK to `CheckoutSession.id` | `UUID` | `NOT NULL`, `FOREIGN KEY (checkout_id) REFERENCES CheckoutSession(id) ON DELETE RESTRICT` |
| `provider_payment_id` | Provider‑specific payment reference | `VARCHAR` | `NOT NULL`, unique per provider |
| `amount_minor` | Amount captured (must match quote) | `BIGINT` | `NOT NULL` |
| `currency` | Currency (must match quote) | `VARCHAR(3)` | `NOT NULL` |
| `status` | Enum `['PENDING','CAPTURED','FAILED','REFUNDED','RECONCILED']` | `VARCHAR` | `NOT NULL`, default `PENDING` |
| `created_at` | Server timestamp | `TIMESTAMPTZ` | `NOT NULL` |
| `captured_at` | Timestamp when capture succeeded | `TIMESTAMPTZ` | `NULLABLE` |

**Idempotency** – (`provider`, `provider_payment_id`) is a unique constraint; replayed webhook events with the same IDs are ignored.

---

## 5. Capture / Reconciliation Model (`OwnershipCapture`)

| Field | Purpose | Type | Constraints |
|-------|---------|------|-------------|
| `id` | Primary key (UUID) | `UUID` | `PRIMARY KEY` |
| `payment_id` | FK to `Payment.id` | `UUID` | `NOT NULL`, `FOREIGN KEY (payment_id) REFERENCES Payment(id) ON DELETE RESTRICT` |
| `territory_id` | FK to `Territory.id` | `UUID` | `NOT NULL`, `FOREIGN KEY (territory_id) REFERENCES Territory(id) ON DELETE RESTRICT` |
| `new_owner_company_id` | FK to `Company.id` | `UUID` | `NOT NULL`, `FOREIGN KEY (new_owner_company_id) REFERENCES Company(id) ON DELETE RESTRICT` |
| `status` | Enum `['PENDING','COMPLETED','FAILED','REFUNDED']` | `VARCHAR` | `NOT NULL`, default `PENDING` |
| `attempted_at` | Server timestamp of capture attempt | `TIMESTAMPTZ` | `NOT NULL` |
| `completed_at` | Timestamp of successful capture | `TIMESTAMPTZ` | `NULLABLE` |

**Transaction** – Capture runs in a **serializable** transaction that: (1) verifies the quote is still current (`territory_version` matches), (2) updates `Territory.version`, (3) inserts a new `OwnershipRecord`, (4) marks `Payment.status = CAPTURED`, (5) sets `OwnershipCapture.status = COMPLETED`. If any step fails, the transaction rolls back and `Payment.status` moves to `FAILED` (or `REFUNDED` after manual reconciliation).

---

--- 

## 6. Payment Webhook Event (`PaymentWebhookEvent`)

| Field | Purpose | Type | Constraints |
|-------|---------|------|-------------|
| `id` | Primary key (UUID) | `UUID` | `PRIMARY KEY` |
| `provider` | Provider identifier | `VARCHAR(20)` | `NOT NULL` |
| `provider_event_id` | Provider‑specific event ID (guaranteed unique) | `VARCHAR` | `NOT NULL`, unique per provider |
| `payment_id` | FK to `Payment.id` (optional – may be null until resolved) | `UUID` | `NULLABLE` |
| `payload` | Raw webhook payload (JSON) | `JSONB` | `NOT NULL` |
| `received_at` | Server timestamp | `TIMESTAMPTZ` | `NOT NULL` |
| `processed` | Boolean flag for idempotent processing | `BOOLEAN` | `NOT NULL`, default `FALSE` |

**Idempotency** – `provider_event_id` + `provider` is unique; duplicate deliveries are ignored after `processed = TRUE`.

---


## 7. API Surface

| Method | Path | Session / Management Requirement | Request Schema | Response Schema | Transaction Boundary | Idempotency | Errors |
|--------|------|--------------------------------|----------------|----------------|----------------------|-------------|--------|
| `POST` | `/api/checkout/quote` | **Company‑scoped management session** (must have `CONTACT_VERIFIED` and `MANAGER` grant) | `{ territorySlug, intendedAmountMinor?, currency? }` | `{ quoteId, minimumAmountMinor, currency, expiresAt, requestId }` | **Read‑only** (no DB write) – validates current territory version and price, returns a `TakeoverQuote` record. | **Idempotent** – same request (same idempotency‑Key header) returns the same active quote or a new one after previous expiry. | `400` (validation), `403` (unauth), `404` (territory), `409` (quote conflict) |
| `POST` | `/api/checkout/create` | **Company‑scoped management session** | `{ quoteId, returnUrl }` | `{ checkoutId, providerCheckoutUrl, requestId }` | **Write** – inserts `CheckoutSession` and links to `TakeoverQuote`. | **Idempotent** – `checkoutId` is deterministic per `(quoteId, provider)`; duplicate calls return existing session. | `400`, `403`, `404`, `409` (duplicate provider checkout ID) |
| `GET` | `/api/payment/status/:checkoutId` | **Company‑scoped management session** | – | `{ status, paymentId?, amountMinor?, currency?, requestId }` | **Read‑only** – joins `CheckoutSession → Payment`. | **Idempotent** – pure read. | `404` (checkout not found) |
| `POST` | `/api/payment/webhook/dodo` | **Public endpoint** – no session | Raw Dodo webhook payload (signed) | `200 OK` (empty) | **Write** – verifies signature, stores `PaymentWebhookEvent`, processes idempotently, may trigger capture transaction. | **Idempotent** – dedup via `provider_event_id`. | `400` (invalid signature), `422` (unprocessable) |
| `POST` | `/api/payment/reconcile` | **Admin / Operator session** (future) | `{ paymentId, action: 'REFUND' | 'MARK_FAILED' }` | `{ reconciliationId, status, requestId }` | **Write** – creates a reconciliation record, updates `Payment.status`. | **Idempotent** – unique per `(paymentId, action)`. | `403`, `404`, `409` |

**All responses** follow the shared envelope `{ data: ..., meta: { requestId, ... } }` defined in `@takeover/shared`.

--- 

## 8. State Machine (Ownership Capture)

```
[Quote Ready] --(checkout)--> [Checkout Created] --(payment pending)--> [Payment Pending]
    |                                   |
    |                                   v
    |                              (webhook success) --> [Capture Pending]
    |                                   |
    |                                   v
    |                              (capture transaction) --> [Captured]
    |                                   |
    |                                   v
    |                              (capture fails) --> [Reconciliation Required]
    |                                   |
    |                                   v
    |                              (refund) --> [Refunded]
    |
    v
(quote expires) --> [Stale Quote]
```

**Transitions** are guarded by server‑side validation of `territory_version`, `minimum_amount_minor`, and `currency`. Any mismatch forces the client to request a fresh quote.


## 9. Architectural Questions (Answers)
1. **Authoritative pricing storage** – `Territory.minimum_takeover_amount_minor` and `Territory.currency` columns, computed on ownership change.
2. **Quote validity** – A quote is valid while `status = ACTIVE`, `expires_at` > now, and `territory_version` matches the current `Territory.version`. Any change to the territory (ownership, version, price) invalidates active quotes.
3. **Territory version bound to a quote** – Stored in `TakeoverQuote.territory_version` at creation time.
4. **Re‑validation points** – On checkout creation, on payment webhook processing (before capture), and on final capture transaction.
5. **Locks/transactions at capture** – `SERIALIZABLE` transaction that locks the `Territory` row (`SELECT … FOR UPDATE`) and the `TakeoverQuote` row to guarantee version consistency.
6. **Concurrent capture while payment pending** – The first successful webhook that reaches the capture transaction wins; later webhooks for the same `provider_payment_id` are ignored.
7. **Duplicate/out‑of‑order webhook** – Idempotent processing via unique (`provider`, `provider_event_id`) and `processed` flag; out‑of‑order events that arrive after capture are ignored.
8. **Provider payment ID uniqueness** – Enforced by a unique DB constraint on (`provider`, `provider_payment_id`).
9. **Prevent duplicate capture** – The `OwnershipCapture` row is created with a `PENDING` status; a unique constraint on `payment_id` ensures only one capture per payment.
10. **Refund/reconciliation restart safety** – All reconciliation actions are **append‑only** records (`ReconciliationLog`) with a monotonically increasing `id`. The process is idempotent via a unique `(payment_id, action)` key.
11. **Append‑only records** – `PaymentWebhookEvent`, `OwnershipCapture`, and `ReconciliationLog` are never updated after creation; only new rows are added.
12. **Audit facts** – Every state change writes an `AuditLog` entry: action, actor (company, system, operator), timestamp, and immutable payload.
13. **Browser view after return** – The browser receives only a *checkout‑completed* UI that polls `/api/payment/status`. It **never** trusts the return URL to finalize capture.
14. **Never trust browser** – All critical decisions (price, ownership, capture) are performed server‑side after re‑validation.

---

## 10. Dodo Provider – Unknowns (UNVALIDATED)
- Webhook signing algorithm and header name
- Retry policy and back‑off strategy
- Event ID format and uniqueness guarantees
- Exact status values (`PAID`, `CAPTURED`, `REFUNDED` etc.)
- Checkout session fields required for redirect URLs
- Refund API endpoint and semantics
- Refund status values
- Any rate‑limit headers
These items must be confirmed against official Dodo documentation before implementation.

## 11. Parallel Task Breakdown
| Agent | Scope | Files / Packages | Dependencies / Blockers | Verification | Handoff |
|-------|-------|------------------|--------------------------|--------------|----------|
| **Codex** | Security & concurrency critical work – implement `OwnershipCapture` transaction, idempotent webhook processing, CAS version checks, audit logging. | `apps/api/src/modules/territories/*`, `packages/database/src/*` | Requires `TakeoverQuote`, `Payment`, `OwnershipCapture` tables to exist. | Unit tests for transaction isolation, integration test simulating duplicate webhooks. | Hand off after DB schema migration and service layer stubs are in place. |
| **Claude** | Front‑end contracts – update `apps/web` to consume new endpoints (`/checkout/quote`, `/checkout/create`, `/payment/status`) and display pending/failed states. | `apps/web/src/*` | Needs the API contract (`@takeover/shared`) to include new schemas. | End‑to‑end test against a mock server. | Ready once API contract is merged. |
| **Inception** | Boilerplate & tests – generate Prisma migrations for new tables, write repository implementations, generate Zod schemas, add integration tests for quote/checkout flow. | `packages/database/prisma/migrations/*`, `apps/api/src/modules/territories/*` | Await design approval. | `npm test` passes with coverage > 90 % for payment flow. | Handoff after migrations are applied and tests pass. |
| **Copilot** | Small fixes – lint, formatting, add missing `export` statements, update README links. | Any affected files | None | `pnpm lint` clean. | Final polish before merge. |

## 12. Files Changed (this checkpoint)
- `docs/MEMORY.md` – appended Phase 3 handoff entry.
- `docs/PHASE3_DESIGN.md` – new design specification document.

## 13. Commit Hash
`a1b2c3d4e5f6g7h8i9j0` (placeholder – actual hash will be generated by the repo after committing these docs).

*All assumptions are documented; any UNVALIDATED items must be reviewed before code implementation.*

## 14. Consolidated Backend Design – Reconciliation

### 14.1 Single‑Attempt State Model

A **provider‑neutral, frontend‑safe state** is exposed on the checkout attempt (status endpoint). Internally we keep separate `Payment` and `OwnershipCapture` rows, but the API surface presents a single derived enum `AttemptState` and a boolean `terminal`.

| AttemptState | Description | Terminal |
|-------------|-------------|----------|
| `PENDING_PAYMENT` | Checkout created, payment not yet received from provider. | `false` |
| `PAYMENT_CONFIRMED` | Provider has reported a successful payment, but ownership capture has not yet started. | `false` |
| `CAPTURE_IN_PROGRESS` | Server‑side capture transaction is running (locking the territory, updating version). | `false` |
| `CAPTURED` | Ownership transfer succeeded; territory version updated and new owner recorded. | `true` |
| `CAPTURE_FAILED` | Capture transaction failed (e.g. DB conflict, insufficient funds after payment). | `false` |
| `RECONCILIATION_REQUIRED` | Capture failed and manual reconciliation (refund or retry) is needed. | `false` |
| `REFUND_PENDING` | Refund has been requested but not yet processed by the provider. | `false` |
| `REFUNDED` | Provider confirmed refund; ownership remains with previous owner. | `true` |
| `LOST_TERRITORY_RACE` | While payment was pending, another company successfully captured the territory; this attempt is now futile. | `true` |

The **`terminal`** flag is derived automatically (`true` for all states that are final). The frontend should treat any `terminal: true` as a final outcome and stop polling.

### 14.2 Secure Status Access Token

To allow the payer (or any user) to query the attempt status without a management session, we introduce an **opaque status token**.

* **Creation** – When `/api/checkout/create` succeeds, the server generates a high‑entropy UUID‑v4 token (`status_token`) and stores it in a new table `CheckoutStatusToken`:
  ```sql
  CREATE TABLE CheckoutStatusToken (
    id UUID PRIMARY KEY,
    checkout_id UUID NOT NULL REFERENCES CheckoutSession(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE
  );
  ```
* **Usage** – The provider return URL will be constructed by the server as:
  `https://<trusted‑origin>/takeover/<status_token>`
  The token is never supplied by the client; it is embedded in the return URL the server gives to the provider.
* **Verification** – `GET /api/payment/status/{statusToken}` validates the token, checks `expires_at` (default 24 h) and `revoked`. If valid, it returns the `AttemptState` payload. No authentication cookie is required.
* **Revocation / Expiry** – Tokens are automatically invalidated after `expires_at`. An admin endpoint can revoke a token early if needed.
* **Security** – Token is 128‑bit random (UUID‑v4) and stored hashed (e.g. SHA‑256) to mitigate leakage. The raw token is only ever sent to the provider and client via HTTPS.

### 14.3 Distinct Error Codes for Quote Validation

Two new error codes are added to the shared `ERROR_CODES` contract:

* `TAKEOVER_PRICE_CHANGED` – The minimum takeover amount for the territory changed after the quote was issued (price increment). The frontend should prompt the user to request a fresh quote.
* `STALE_TERRITORY_VERSION` – The `territoryVersion` supplied by the client does not match the current `Territory.version`. This indicates the territory was updated (e.g., another takeover) and the quote is stale.

Both are **non‑terminal** for the quote request; the client must request a new quote.


### 14.4 Charge Model Decision

**Decision:** The checkout **must charge exactly the authoritative minimum takeover amount**. No user‑provided amount is accepted.

* **Quote schema** – `minimum_amount_minor` is the only amount field. `intended_amount` is removed.
* **Checkout schema** – No amount field; the server derives the charge from the linked `TakeoverQuote`.
* **UI** – The frontend displays the minimum amount and a "Proceed to payment" button. No price input.
* **Revalidation** – On checkout creation the server re‑checks that the quote is still `ACTIVE` and that the territory version has not changed. If either check fails, the checkout creation returns `409` with the appropriate error code (`TAKEOVER_PRICE_CHANGED` or `STALE_TERRITORY_VERSION`).
* **Pricing rules** – The minimum amount is computed server‑side as `currentWinningAmount + increment`. No bidding or over‑pay is supported in Phase 3.

### 14.5 Return URL Construction

* **Server‑side construction** – The return URL is built from a **trusted origin whitelist** configured in `APP_TRUSTED_ORIGINS`. The server selects the first matching origin for the current request and appends `/takeover/<status_token>`.
* **Client restriction** – The frontend never sends a `returnUrl` parameter. The `/api/checkout/create` request only includes `quoteId` and optional metadata; the server ignores any client‑supplied URL.
* **Open‑redirect protection** – Because the server controls the URL, no open‑redirect is possible. If the whitelist is empty or the request originates from an untrusted origin, the server rejects the checkout creation with `403`.

### 14.6 Front‑end Data Contracts

#### Quote Response (`GET /api/checkout/quote`)
```json
{
  "quoteId": "uuid",
  "territorySlug": "string",
  "territoryId": "uuid",
  "territoryVersion": "decimal-string",
  "minimumAmount": { "amountMinor": "int", "currency": "USD" },
  "expiresAt": "ISO8601",
  "status": "ACTIVE|EXPIRED|CANCELLED",
  "checkoutAvailable": true|false,
  "eligibilityReason": "string|null"
}
```
#### Attempt / Status Response (`GET /api/payment/status/{statusToken}`)
```json
{
  "checkoutId": "uuid",
  "state": "PENDING_PAYMENT|PAYMENT_CONFIRMED|CAPTURE_IN_PROGRESS|CAPTURED|CAPTURE_FAILED|RECONCILIATION_REQUIRED|REFUND_PENDING|REFUNDED|LOST_TERRITORY_RACE",
  "terminal": true|false,
  "amountCharged": { "amountMinor": "int", "currency": "USD" }|null,
  "capturedAt": "ISO8601|null",
  "newOwnerCompanyId": "uuid|null",
  "failureReason": "string|null",
  "updatedAt": "ISO8601",
  "pollAfterMs": "int|null"
}
```
Only the fields above are required; additional internal statuses remain in the database but are not exposed.


### 14.7 Updated State Machine (External Attempt State)
```
[Quote Ready] --(checkout)--> [PENDING_PAYMENT]
    |
    v
[PAYMENT_CONFIRMED] --(capture start)--> [CAPTURE_IN_PROGRESS]
    |
    v
[CAPTURED] (terminal)
    |
    v
[CAPTURE_FAILED] --> [RECONCILIATION_REQUIRED]
    |
    v
[REFUND_PENDING] --> [REFUNDED] (terminal)
    |
    v
[LOST_TERRITORY_RACE] (terminal)
```
All non‑terminal states (`PENDING_PAYMENT`, `PAYMENT_CONFIRMED`, `CAPTURE_IN_PROGRESS`, `REFUND_PENDING`) may be polled. The server may include `pollAfterMs` to suggest a back‑off interval.

### 14.8 API Surface Adjustments

| Method | Path | Auth | Request | Response | Idempotency |
|--------|------|------|---------|----------|-------------|
| `POST` | `/api/checkout/create` | Company‑scoped management session | `{ quoteId }` | `{ checkoutId, statusToken, requestId }` | `checkoutId` is deterministic per `quoteId`; duplicate calls return existing `checkoutId` and `statusToken`.
| `GET` | `/api/payment/status/{statusToken}` | **No session** – token based | – | `{ state, terminal, amountCharged?, capturedAt?, newOwnerCompanyId?, failureReason?, updatedAt?, pollAfterMs? }` | Idempotent; token validates access.
| `POST` | `/api/checkout/quote` | Company‑scoped management session | `{ territorySlug }` | Quote response (see §14.6) | Idempotent via `idempotency-Key`.

All other existing endpoints remain unchanged.

### 14.9 Implementation Task Sequence

| Agent | Tasks |
|-------|-------|
| **Claude** | - Update frontend contracts to consume the new `AttemptState` enum and `terminal` flag.<br>- Use the server‑generated return URL (`/takeover/<statusToken>`).<br>- Adjust UI to display only the authoritative `minimumAmount` and hide any price input.<br>- Implement polling using `pollAfterMs`/`Retry-After` as per the spec.<br>- Show user‑friendly messages based on `TAKEOVER_PRICE_CHANGED` and `STALE_TERRITORY_VERSION` error codes. |
| **Inception** | - Add `CheckoutStatusToken` table and migration.<br>- Extend `CheckoutSession` model to reference the token (optional, for cleanup).<br>- Implement the `/api/payment/status/{statusToken}` endpoint with token validation, state derivation, and `pollAfterMs` logic.<br>- Add new error codes to `ERROR_CODES` contract.<br>- Adjust Quote creation to reject user‑provided amounts and enforce minimum‑only charge.<br>- Update `CheckoutSession` creation to emit `statusToken` and store it.
| **Codex** | - Implement the unified `AttemptState` derivation logic (joining `Payment`, `OwnershipCapture`, `Refund`, etc.).<br>- Ensure idempotent webhook processing updates `AttemptState` correctly.<br>- Add audit logging for state transitions.<br>- Implement revocation/expiry cleanup for `CheckoutStatusToken`.<br>- Update ownership capture transaction to respect the new state machine and to set `AttemptState` appropriately. |
| **Copilot** | - Lint, format, and add missing exports for new contracts (`AttemptState`, `AttemptResponse`, `QuoteResponse`).<br>- Update README links to new design docs. |

### 14.10 Files Changed

- `docs/PHASE3_DESIGN.md` – added sections 14.1‑14.11 (this document).
- No changes to `docs/MEMORY.md` (existing hand‑off entry remains safe).

### 14.11 Commit Hash

Review corrections are committed separately; do not use placeholder hashes as implementation evidence.

## 15. Design Review Corrections - Implementation Authority

Status: APPROVED WITH CHANGES. This section supersedes any conflicting earlier draft text in this document.

### 15.1 Required Corrections Before Coding

1. `TakeoverQuote` is not captured and does not create a payment. Checkout creation consumes or binds an active quote; provider-confirmed money creates or confirms a `Payment`.
2. Append-only applies to raw webhook ledger rows, reconciliation actions, and audit facts. Mutable state rows such as `CheckoutSession`, `Payment`, and `OwnershipCapture` may be updated only through guarded, audited transitions.
3. `Payment.status` must not use `CAPTURED` to mean money received. Use provider-neutral payment states such as `PENDING`, `CONFIRMED`, `FAILED`, `REFUND_PENDING`, and `REFUNDED`. Territory capture belongs only to `OwnershipCapture.status` and derived attempt state.
4. `Payment` must store `provider`; enforce unique `(provider, providerPaymentId)`.
5. Every Dodo-specific fact, including webhook headers, event IDs, retry behavior, status names, checkout payload shape, refund semantics, and SDK/API choice, remains `UNVALIDATED - requires official Dodo docs review`.
6. Checkout creation must not accept browser-supplied `returnUrl`, amount, currency, owner id, or territory version. The server derives all of them from trusted database state and configured trusted origins.
7. Status tokens must use at least 256 bits of entropy and be stored only as a keyed digest. UUIDv4 and bare SHA-256 are not sufficient for the Phase 3 status URL.
8. A provider-confirmed payment whose ownership capture fails must enter `RECONCILIATION_REQUIRED` or refund flow. Do not mark the payment as failed after money has been confirmed.
9. Ownership capture must use the existing transaction-scoped `TerritoryOwnership` version/CAS primitive. Do not duplicate ownership mutation logic in the payment service.
10. `TAKEOVER_PRICE_CHANGED` and `STALE_TERRITORY_VERSION` are distinct errors. Neither path may silently reprice, auto-charge, or consume a payment.

### 15.2 Final Minimal Model Set

- `Territory`: add `minimumTakeoverAmountMinor` and `currency`. These are authoritative pricing facts updated only by ownership/pricing transaction rules.
- `TakeoverQuote`: `id`, `territoryId`, `territoryVersion`, `companyId`, `minimumAmountMinor`, `currency`, `status`, `expiresAt`, `observedAt`, `createdAt`, optional `consumedAt`, optional `idempotencyKeyDigest`. Add an idempotent uniqueness scope for `(companyId, territoryId, territoryVersion, idempotencyKeyDigest)` when an idempotency key is present.
- `CheckoutSession`: `id`, `quoteId`, `companyId`, `provider`, `providerCheckoutId`, optional `providerCheckoutUrl`, `status`, `createdAt`, `updatedAt`, optional `expiresAt`. Enforce unique `(provider, providerCheckoutId)` and one active checkout per quote.
- `CheckoutStatusToken`: `id`, `checkoutId`, `tokenDigest`, `expiresAt`, optional `revokedAt`, `createdAt`. Enforce unique `tokenDigest`; never persist the raw token.
- `Payment`: `id`, `checkoutId`, `provider`, `providerPaymentId`, `amountMinor`, `currency`, `status`, optional `confirmedAt`, optional `failedAt`, `createdAt`, `updatedAt`. Enforce unique `(provider, providerPaymentId)` and at most one confirmed payment per checkout.
- `PaymentWebhookEvent`: `id`, `provider`, `providerEventId`, `signatureDigest`, `payload`, `receivedAt`, `processingStatus`, optional `paymentId`, optional `processedAt`, optional `errorCode`. Enforce unique `(provider, providerEventId)`. Store trusted provider facts only after signature verification succeeds.
- `OwnershipCapture`: `id`, `paymentId`, `territoryId`, `newOwnerCompanyId`, `expectedTerritoryVersion`, `status`, `attemptedAt`, optional `completedAt`, optional `failureCode`. Enforce unique `paymentId`.
- `PaymentReconciliationAction`: `id`, `paymentId`, `action`, `status`, `requestedByActorType`, optional `requestedByActorId`, `reason`, `createdAt`, optional provider refund reference. Enforce one active action of the same kind per payment.
- Reuse `AuditLog`. Do not add `User`, wallet, balance, bid, season, leaderboard, activity, Redis, queue, or worker models for the Phase 3 critical path.

### 15.3 Final State Machine

```text
QUOTE_ACTIVE -> CHECKOUT_CREATED -> PENDING_PAYMENT -> PAYMENT_CONFIRMED -> CAPTURE_IN_PROGRESS -> CAPTURED
QUOTE_ACTIVE -> QUOTE_EXPIRED
PENDING_PAYMENT -> PAYMENT_FAILED
PENDING_PAYMENT -> LOST_TERRITORY_RACE
PAYMENT_CONFIRMED -> RECONCILIATION_REQUIRED -> REFUND_PENDING -> REFUNDED
CAPTURE_IN_PROGRESS -> RECONCILIATION_REQUIRED -> REFUND_PENDING -> REFUNDED
```

Terminal states are `CAPTURED`, `QUOTE_EXPIRED`, `PAYMENT_FAILED`, `LOST_TERRITORY_RACE`, `RECONCILIATION_REQUIRED` for automated capture, and `REFUNDED`. The browser return URL only opens a status view. Only a verified, idempotently processed webhook may move an attempt to `PAYMENT_CONFIRMED` or start capture.

### 15.4 Final API Surface

- `POST /api/takeover-quotes`: company-scoped management session plus Origin/CSRF. Body `{ territorySlug }`. Optional `Idempotency-Key`. Returns a provider-neutral quote with decimal-string `territoryVersion`, authoritative amount/currency, expiry, and request metadata.
- `POST /api/takeover-checkouts`: company-scoped management session plus Origin/CSRF. Body `{ quoteId }`. Optional `Idempotency-Key`. Server revalidates quote, price, company authority, and territory version, creates provider checkout, and returns `{ checkoutId, statusToken, providerCheckoutUrl }`.
- `GET /api/takeover-status/:statusToken`: token-based, no management session required. Looks up the keyed digest and returns `{ state, terminal, amountCharged?, capturedAt?, newOwnerCompanyId?, failureReason?, updatedAt?, pollAfterMs? }`.
- `POST /api/payment/webhooks/dodo`: public raw-body endpoint. Verify signature before parsing or trusting provider fields, record the verified event idempotently, then validate amount, currency, internal references, quote, checkout, company, territory, and version before capture.
- `POST /api/payment-reconciliations`: operator-only future endpoint. Block implementation until operator identity and authorization are designed.

No provider-specific status, enum, checkout payload, or webhook payload may leak into `@takeover/shared` public domain contracts.

### 15.5 Exact Phase 3 Task Order

1. Add provider-neutral shared contracts and errors: attempt state, quote response, checkout response, status response, `TAKEOVER_PRICE_CHANGED`, and `STALE_TERRITORY_VERSION`.
2. Add Prisma models and migration for the minimal model set above.
3. Add provider-neutral payment domain interfaces. Use fakes only in tests; do not integrate Dodo until official docs are reviewed.
4. Implement quote creation with company management authority, server-side price/version snapshot, expiry, and idempotency.
5. Implement checkout creation with quote revalidation, no client amount/currency/return URL, trusted return URL construction, status token generation, and provider checkout creation.
6. Implement token-based status lookup and derived attempt state.
7. Implement raw webhook signature boundary and idempotent event ledger. Keep Dodo mapping blocked until official docs resolve all unvalidated facts.
8. Implement webhook processing validation for amount, currency, provider refs, checkout, quote, company, territory, and expected version.
9. Implement ownership capture through the existing `TerritoryOwnership` CAS transaction primitive, including payment/capture/audit updates in one transactional boundary where possible.
10. Implement reconciliation/refund handling for confirmed payments that cannot capture.
11. Add PostgreSQL integration and concurrency tests for quote expiry, stale version, stale price, duplicate/out-of-order webhooks, one-payment-one-capture, failed capture reconciliation, and privacy-safe status responses.
12. After official Dodo documentation review, implement the isolated Dodo adapter and provider-specific webhook mapping.
