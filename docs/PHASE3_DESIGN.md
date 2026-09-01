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
