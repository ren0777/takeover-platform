# Phase 1 Company + Claim Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build passwordless, company-scoped claim identity with verified contact email, revocable management capabilities, existing-company access approval, a development/test email transport, and a non-authoritative takeover-intent seam—without implementing territories, pricing, payment, or capture.

**Architecture:** `@takeover/shared` publishes browser/server-safe Zod contracts. `@takeover/database` remains the sole Prisma owner. Fastify feature plugins wire thin routes to testable services and Prisma repositories; opaque email tokens exchange into server-resolved company-scoped sessions. PostgreSQL owns challenges, grants, sessions, access state, rate counters, and audit evidence.

**Tech Stack:** Node.js >=22, pnpm 10.32.1, TypeScript 5.9.3 strict mode, Fastify 5.12.1, `@fastify/cookie` 11.1.2, Zod 4.5.2, Prisma CLI/client/adapter-pg 7.10.0, PostgreSQL, Vitest 3.2.7, Node `crypto`.

## Global Constraints

- Preserve independent `apps/web` and `apps/api` deployment units.
- `packages/shared` is the canonical framework-neutral contract source; it imports no Fastify, Prisma, Node-only API, secret, or provider SDK.
- `packages/database` is the only Prisma schema/client/migration owner.
- Do not add `User`, password, signup, login, password-reset, global end-user session, global dashboard, or generic `auth` module abstractions.
- A new-company contact must verify email and receive a draft-company grant/session before any future checkout.
- An existing-company contact must verify email and receive manager approval or successful manual recovery before receiving company authority.
- `contact_verified` is sufficient; do not require matching-domain email, DNS, incorporation, or a company-domain mailbox.
- Tokens use at least 256 random bits; persist only a selector and keyed digest; never log or persist raw link/session secrets.
- Cookie defaults: opaque server-resolved session, `HttpOnly`, `SameSite=Lax`, `Path=/api`, no `Domain`, `Secure` in production.
- TTL defaults are configuration: verification 900s, management/access-review link 900s, session 28,800s, access request 604,800s, draft 86,400s, recovery request 604,800s.
- Do not auto-merge normalized website collisions. One authoritative non-draft company per normalized website is enforced at the database boundary.
- Phase 1 may store only a non-authoritative `territoryExternalRef` and reference-only quote snapshot. Do not create Territory, ownership, pricing, checkout, payment, webhook, Dodo, or capture code.
- Manual recovery stores state and an operator-facing repository/service seam only. No public manual-approval route or invented administrator identity.
- No Redis, queue, worker, scheduler, email SaaS SDK, Dodo SDK, or speculative future-domain contract.
- Use red-green-refactor for behavior and small coherent commits. Do not mark Phase 1 complete without live PostgreSQL integration evidence.

---

## Locked Behavior and Terminology

### Website normalization

`normalizeCompanyWebsite()` accepts absolute HTTPS URLs only, rejects credentials, localhost, `.local`, IP literals in private/reserved ranges, query strings, and fragments, lowercases/ASCII-normalizes the hostname through `URL`, removes port 443, and removes a trailing slash except for `/`. It preserves path case because hosted startup pages may share one domain. The resulting full normalized URL—not merely the hostname—is the collision key.

An existing authoritative (`active`, `suspended`, or `archived`) company with that normalized URL always enters existing-company access/recovery handling. Multiple private drafts may race, but a partial unique PostgreSQL index prevents more than one from becoming authoritative. Draft activation conflicts are Phase 3 reconciliation cases.

### Email normalization

Trim the address, normalize Unicode to NFC, lowercase the domain, and preserve the local part. Do not apply Gmail-specific dot/plus rewriting. Zod validates the resulting address.

### Phase 1 takeover reference

`territoryExternalRef` is a 1–128 character opaque reference matching `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. It has no foreign key because Phase 2 owns Territory. Optional quote fields are explicitly `reference_only`, client-supplied, and never sufficient for checkout. Phase 1 exposes `identity_ready`, never `ready_for_checkout`.

### Rate-limit defaults

All values are validated runtime settings and enforced through PostgreSQL fixed-window buckets:

| Scope                                                    | Default |
| -------------------------------------------------------- | ------: |
| Verification/management link issuance per email per hour |       5 |
| Link issuance per IP per hour                            |      20 |
| Token exchange failures per selector                     |      10 |
| Token exchange attempts per IP per hour                  |      60 |
| Access requests per contact/company per day              |       3 |
| Access requests per IP per hour                          |      10 |
| Manager notification cooldown                            |  1 hour |
| Recovery requests per contact/company per day            |       2 |

Rate keys are HMAC digests of normalized scopes, never raw emails or IPs.

## Final Phase 1 HTTP Surface

All product schemas below live in `@takeover/shared` and use the existing `{ data, meta }` / `{ error }` envelopes.

| Method and path                                 | Behavior                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST /api/company-claims`                      | Create/reuse a private draft or identify an authoritative existing company; create intent and send verification |
| `POST /api/email-verifications`                 | Enumeration-resistant verification-link reissue                                                                 |
| `POST /api/email-verifications/exchange`        | Consume contact verification; grant/session a new draft or atomically create an existing-company access request |
| `POST /api/company-management-links`            | Enumeration-resistant link issuance for a known company/contact grant                                           |
| `POST /api/company-management-links/exchange`   | Consume link and create a scoped session                                                                        |
| `GET /api/company-management/context`           | Return only the current session's one-company context and CSRF token                                            |
| `DELETE /api/company-management/session`        | Revoke current session and clear cookies                                                                        |
| `POST /api/company-access-requests/:id/approve` | Existing same-company manager explicitly approves                                                               |
| `POST /api/company-access-requests/:id/reject`  | Existing same-company manager explicitly rejects                                                                |
| `POST /api/company-recovery-requests`           | Record pending recovery; report execution unavailable                                                           |
| `PUT /api/takeover-intents/:id/preparation`     | Store identity-side external territory reference and reference-only quote snapshot                              |

Access-request creation is intentionally atomic inside email verification exchange rather than a separate public endpoint: the server already possesses the verified contact, detected company, and intent scope and cannot be tricked by a client assertion that verification occurred.

## File Map

## Required Coverage Index

- Migrations/schema changes: Task 2.
- Shared contracts: Task 1.
- API endpoints: Tasks 6–9.
- Token hashing/consumption: Tasks 3, 6, and 7.
- Session lifecycle: Tasks 3 and 7.
- Company/contact/grant lifecycle: Tasks 2, 5, and 6.
- Access-request state machine: Task 8.
- Rate limiting: Tasks 3, 5, 6, 8, and 9.
- Audit events: Tasks 5–9.
- Dev/test email transport: Task 4.
- Tests and security failure cases: every behavior task plus the final matrix.
- Verification commands: every task and Task 10's complete acceptance gate.

## Planned Files

### Shared contracts

- Create `packages/shared/src/company.ts`: company, verification, contact-safe, and lifecycle schemas/types.
- Create `packages/shared/src/company-claim.ts`: claim, email exchange, management context, access request, recovery, and intent schemas/types.
- Modify `packages/shared/src/api.ts`: stable Phase 1 error codes.
- Modify `packages/shared/src/constants.ts`: framework-neutral enum constants only.
- Modify `packages/shared/src/index.ts`: public exports.
- Create `packages/shared/test/company.test.ts` and `packages/shared/test/company-claim.test.ts`.

### Database

- Modify `packages/database/prisma/schema.prisma`: Phase 1 enums/models and relations.
- Create `packages/database/prisma/migrations/<timestamp>_add_company_claim_identity/migration.sql`: generated migration plus reviewed partial indexes/check constraints.
- Modify `packages/database/src/index.ts`: export generated types and transaction helper.
- Modify `packages/database/src/client.ts`: add `withDatabaseTransaction()` without changing lifecycle semantics.
- Create `packages/database/scripts/prepare-integration-database.mjs`: guarded test-database migration command.
- Modify `packages/database/package.json` and root `package.json`: integration database/test scripts.

### API infrastructure

- Modify `apps/api/package.json`: pin `@fastify/cookie` 11.1.2.
- Modify `apps/api/src/config/env.ts`: identity TTL, origin, email, secret, cookie, and rate-limit configuration.
- Modify `.env.example`: safe names/defaults; no real secret.
- Create `apps/api/src/security/opaque-token.ts`, `scope-key.ts`, `session-cookie.ts`, and `request-origin.ts`.
- Create `apps/api/src/plugins/cookies.ts` and `apps/api/src/plugins/database.ts`.

### Email integration

- Create `apps/api/src/integrations/email/email-provider.ts`.
- Create `apps/api/src/integrations/email/development-email-provider.ts`.
- Create `apps/api/src/integrations/email/unavailable-email-provider.ts`.
- Create `apps/api/src/plugins/email.ts`.
- Create `apps/api/src/plugins/development-email-capture.ts`.

### Company identity module

- Create `apps/api/src/modules/company-identity/domain.ts`.
- Create `apps/api/src/modules/company-identity/repository.ts`.
- Create `apps/api/src/modules/company-identity/prisma-repository.ts`.
- Create `apps/api/src/modules/company-identity/service.ts`.
- Create `apps/api/src/modules/company-identity/authorization.ts`.
- Create `apps/api/src/modules/company-identity/routes.ts`.
- Create `apps/api/src/plugins/company-identity.ts`.
- Modify `apps/api/src/app.ts`: register real infrastructure/product plugins in dependency order and expand redaction.

### Tests

- Create `apps/api/test/opaque-token.test.ts`, `normalization.test.ts`, `development-email-provider.test.ts`, `company-identity-service.test.ts`, and `company-identity-http.test.ts`.
- Create `apps/api/test/integration/company-identity-postgres.test.ts` and `apps/api/test/integration/access-request-concurrency.test.ts`.
- Create `apps/api/vitest.config.ts` and `apps/api/vitest.integration.config.ts` so ordinary unit tests do not pretend to provide PostgreSQL evidence.
- Modify `scripts/smoke-api.mjs` for required non-secret test configuration while identity remains disabled in the infrastructure smoke.

### Documentation at implementation completion

- Modify `.env.example`, `docs/ARCHITECTURE.md`, `docs/PHASES.md`, and `docs/MEMORY.md` with only verified implementation status/contracts.

---

### Task 1: Publish Framework-Neutral Phase 1 Contracts

**Spec mapping:** shared-contract requirement; no Prisma/Fastify coupling; contact verification sufficient; identity/payment separation.

**Files:**

- Create: `packages/shared/src/company.ts`
- Create: `packages/shared/src/company-claim.ts`
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/company.test.ts`
- Test: `packages/shared/test/company-claim.test.ts`

**Interfaces:**

- Produces: `Company`, `CompanyStatus`, `VerificationLevel`, `CompanyClaimRequest`, `CompanyClaimResult`, `EmailTokenExchangeRequest`, `EmailTokenExchangeResult`, `ManagementContext`, `CompanyAccessRequest`, `RecoveryRequestResult`, `TakeoverIntent`, `TakeoverPreparationRequest`, and all corresponding Zod schemas.
- Consumed by: every later API route/service task and Claude's web data layer.

- [ ] **Step 1: Write failing contract tests**

Cover these exact cases:

```ts
expect(
  companyClaimRequestSchema.parse({
    company: { name: 'My Cool Startup', websiteUrl: 'https://mycoolstartup.com' },
    contactEmail: 'founder@gmail.com',
    intent: { territoryExternalRef: 'ai-coding' },
  }),
).toMatchObject({ contactEmail: 'founder@gmail.com' });

expect(() =>
  companyClaimRequestSchema.parse({
    company: { name: 'X', websiteUrl: 'http://localhost:3000' },
    contactEmail: 'not-an-email',
    intent: { territoryExternalRef: '../territory' },
  }),
).toThrow();

expect(
  managementContextSchema.parse({
    company: {
      id: crypto.randomUUID(),
      name: 'Acme',
      websiteUrl: 'https://acme.test',
      status: 'draft',
    },
    verificationLevels: ['contact_verified'],
    sessionExpiresAt: new Date().toISOString(),
    csrfToken: 'public-csrf-value',
  }),
).toBeDefined();
```

Assert every response exposes `checkoutAvailable: false`; raw token digests, manager emails, Prisma enums, and payment fields are absent.

- [ ] **Step 2: Run the shared tests and verify red**

Run: `pnpm --filter @takeover/shared test -- company.test.ts company-claim.test.ts`

Expected: FAIL because the modules/exports do not exist.

- [ ] **Step 3: Add exact framework-neutral vocabulary**

Use lowercase wire values:

```ts
export const COMPANY_STATUSES = ['draft', 'active', 'suspended', 'archived'] as const;
export const VERIFICATION_LEVELS = [
  'contact_verified',
  'domain_verified',
  'manually_verified',
] as const;
export const ACCESS_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
] as const;
export const TAKEOVER_INTENT_STATUSES = [
  'awaiting_email_verification',
  'awaiting_company_access',
  'identity_ready',
  'expired',
  'cancelled',
] as const;
export const QUOTE_AUTHORITY = 'reference_only' as const;
```

Define shared objects with ISO-date strings and opaque UUIDs. `TakeoverIntent` includes `territoryExternalRef`, optional reference-only `intendedBid`, and optional quote snapshot `{ territoryVersion, ownerCompanyId?, currentWinningAmount?, minimumTakeoverAmount?, observedAt }`; it always returns `quoteAuthority: 'reference_only'` and `checkoutAvailable: false`.

Add stable errors:

```ts
AUTHORIZATION_REQUIRED;
CONTACT_VERIFICATION_REQUIRED;
INVALID_OR_EXPIRED_TOKEN;
COMPANY_ACCESS_PENDING;
COMPANY_ACCESS_DENIED;
COMPANY_WEBSITE_CLAIMED;
RATE_LIMITED;
CONFLICT;
MANUAL_RECOVERY_UNAVAILABLE;
```

- [ ] **Step 4: Run contract verification**

Run:

```powershell
pnpm --filter @takeover/shared test
pnpm --filter @takeover/shared typecheck
pnpm --filter @takeover/shared lint
```

Expected: all commands exit 0; tests reject malformed URLs/emails/references, unsafe money, invalid states, and any `checkoutAvailable: true` Phase 1 response.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared
git commit -m "feat(shared): publish company claim contracts"
```

---

### Task 2: Add the Phase 1 PostgreSQL Schema and Integration Harness

**Spec mapping:** required data model; database constraints; one authoritative normalized website; no Territory model; live PostgreSQL evidence.

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<generated_timestamp>_add_company_claim_identity/migration.sql`
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/src/index.ts`
- Create: `packages/database/scripts/prepare-integration-database.mjs`
- Modify: `packages/database/package.json`
- Modify: root `package.json`

**Interfaces:**

- Produces: Prisma models/enums, `withDatabaseTransaction(operation)`, `db:test:prepare`, and `test:integration` root commands.
- Consumed by: the Prisma identity repository and all concurrency tests.

- [ ] **Step 1: Add a failing database transaction-lifecycle test**

Extend `packages/database/test/client.test.ts` so a fake client proves `withDatabaseTransaction()` passes the transaction client through and does not create another global client.

- [ ] **Step 2: Run it red**

Run: `pnpm --filter @takeover/database test`

Expected: FAIL because `withDatabaseTransaction` is not exported.

- [ ] **Step 3: Add the schema**

Use Prisma enums for lifecycle vocabulary and map every table/column to snake case. Add these exact durable models:

```text
Company: id, name, normalizedName, slug?, websiteUrl, normalizedWebsite,
  logoUrl?, status, expiresAt?, activatedAt?, createdAt, updatedAt
CompanyContact: id, email, normalizedEmail(unique), emailVerifiedAt?, revokedAt?, createdAt, updatedAt
CompanyVerification: id, companyId, contactId?, level, status, source,
  verifiedAt?, failedAt?, revokedAt?, failureReason?, createdAt
EmailVerificationChallenge: id, selector(unique), tokenDigest(Bytes), purpose,
  contactId, companyId, accessRequestId?, deliveryStatus, expiresAt,
  consumedAt?, revokedAt?, failedAttempts, createdAt, updatedAt
CompanyManagementGrant: id, companyId, contactId, status, source,
  accessRequestId?, grantedByGrantId?, grantedAt, revokedAt?, createdAt, updatedAt
CompanyManagementSession: id, companyId, grantId, tokenDigest(Bytes unique),
  csrfDigest(Bytes), expiresAt, lastSeenAt?, revokedAt?, createdAt
CompanyAccessRequest: id, companyId, contactId, takeoverIntentId?, status,
  requestedAt, expiresAt, decidedAt?, decidedByGrantId?, decisionReason?,
  lastNotifiedAt?, notificationCount, recoveryRequestedAt?, recoveryExpiresAt?,
  recoveryStatus, createdAt, updatedAt
TakeoverIntent: id, companyId, contactId, territoryExternalRef,
  intendedAmountMinor?, currency?, quotedTerritoryVersion?, quotedOwnerCompanyId?,
  quotedWinningAmountMinor?, quotedMinimumAmountMinor?, quoteObservedAt?,
  status, expiresAt, createdAt, updatedAt
AuditLog: id, actorType, actorId?, companyId?, action, targetType,
  targetId?, requestId?, reason?, metadata(Json?), createdAt
SecurityRateLimitBucket: id, keyDigest(Bytes), windowStartedAt, expiresAt,
  count, createdAt, updatedAt
```

Relations must use restrictive deletion for security/financial evidence. Use `BigInt` for stored minor units and map to safe integers at shared boundaries.

Add reviewed SQL constraints/indexes after Prisma generates the migration:

```sql
CREATE UNIQUE INDEX "companies_authoritative_website_key"
ON "companies" ("normalized_website")
WHERE "status" <> 'DRAFT';

CREATE UNIQUE INDEX "company_access_requests_pending_key"
ON "company_access_requests" ("company_id", "contact_id")
WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "company_verifications_active_key"
ON "company_verifications" ("company_id", "contact_id", "level")
WHERE "status" = 'VERIFIED';

CREATE UNIQUE INDEX "security_rate_limit_bucket_scope_key"
ON "security_rate_limit_buckets" ("key_digest", "window_started_at");
```

Add checks for nonnegative minor amounts, challenge/session/access/draft expiry after creation, `territory_external_ref` length, three-letter currency, and terminal access decisions having `decided_at`.

- [ ] **Step 4: Add the transaction helper and guarded integration script**

`withDatabaseTransaction` delegates to the one lifecycle-owned Prisma client. `prepare-integration-database.mjs` must parse `TEST_DATABASE_URL`, require its database name to contain `test`, require `TAKEOVER_ALLOW_TEST_DATABASE_RESET=true`, then spawn `prisma migrate reset --force` with `DATABASE_URL` set to that exact URL. It must refuse broad/empty URLs.

- [ ] **Step 5: Generate, validate, and apply to the dedicated test database**

Run:

```powershell
pnpm db:generate
pnpm db:validate
$env:TAKEOVER_ALLOW_TEST_DATABASE_RESET='true'
pnpm db:test:prepare
```

Expected: generation/validation exit 0; the guarded reset applies both committed migrations to a database whose name contains `test`. If PostgreSQL is unavailable, record Phase 1 integration as unvalidated and do not mark the phase complete.

- [ ] **Step 6: Commit**

```powershell
git add package.json packages/database
git commit -m "feat(database): add company claim identity schema"
```

---

### Task 3: Validate Identity Configuration and Implement Security Primitives

**Spec mapping:** locked TTLs; >=256-bit secrets; hashed storage; company-scoped opaque cookie; CSRF/Origin protection.

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`
- Create: `apps/api/src/security/opaque-token.ts`
- Create: `apps/api/src/security/scope-key.ts`
- Create: `apps/api/src/security/session-cookie.ts`
- Create: `apps/api/src/security/request-origin.ts`
- Create: `apps/api/src/plugins/cookies.ts`
- Test: `apps/api/test/opaque-token.test.ts`
- Modify/Test: `apps/api/test/env.test.ts`

**Interfaces:**

- Produces: `IdentityConfig`, `OpaqueTokenService`, `hashSecurityScope`, cookie helpers, and `assertTrustedMutationOrigin`.
- Consumed by: email, service, repository, authorization, and HTTP tasks.

- [ ] **Step 1: Install only the cookie plugin**

Run: `pnpm --filter @takeover/api add @fastify/cookie@11.1.2 --save-exact`

Expected: package and lockfile change; no session/auth/email/payment SDK appears. Version 11.x is compatible with Fastify 5.x.

- [ ] **Step 2: Write failing config/token/cookie tests**

Tests must prove:

- exact default TTL seconds listed in Global Constraints;
- token secret configuration decodes to at least 32 bytes;
- production rejects development email transport and insecure web origins;
- 32-byte secret issuance produces unique opaque values;
- stored digest cannot reconstruct the raw token;
- wrong purpose/secret fails constant-time verification;
- session cookie is `HttpOnly`, `SameSite=Lax`, `Path=/api`, no `Domain`, and production-only `Secure`;
- wrong/missing `Origin` fails cookie-authenticated mutations.

- [ ] **Step 3: Run red tests**

Run: `pnpm --filter @takeover/api test -- env.test.ts opaque-token.test.ts`

Expected: FAIL on missing configuration/security modules.

- [ ] **Step 4: Implement primitives with Node crypto**

Use selector-plus-secret links (`base64url(selector).base64url(secret)`) and raw random session tokens. Compute keyed digests with HMAC-SHA-256 and compare with `timingSafeEqual`. Keep raw material only in local return values:

```ts
type IssuedLinkToken = { rawToken: string; selector: string; digest: Uint8Array };
type IssuedSessionToken = { rawToken: string; digest: Uint8Array };

interface OpaqueTokenService {
  issueLinkToken(): IssuedLinkToken;
  issueSessionToken(): IssuedSessionToken;
  digestLinkSecret(selector: string, secret: string): Uint8Array;
  digestSessionToken(rawToken: string): Uint8Array;
  verifyDigest(candidate: Uint8Array, stored: Uint8Array): boolean;
}
```

Use a separate domain-separation prefix for link, session, CSRF, rate-key, and IP digests even when one configured pepper is used.

- [ ] **Step 5: Implement configuration**

Add `WEB_APP_ORIGIN`, `TOKEN_HMAC_SECRET`, `EMAIL_PROVIDER=development|unavailable`, `DEV_EMAIL_CAPTURE_ENABLED`, the six TTL variables, and rate-limit variables. Parse once in `env.ts`; convert to an immutable `identity` config object. Disallow capture/development provider in production.

- [ ] **Step 6: Run tests and static checks**

Run:

```powershell
pnpm --filter @takeover/api test -- env.test.ts opaque-token.test.ts
pnpm --filter @takeover/api typecheck
pnpm --filter @takeover/api lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```powershell
git add .env.example pnpm-lock.yaml apps/api
git commit -m "feat(api): add capability security primitives"
```

---

### Task 4: Add the EmailProvider Boundary and Dev/Test Transport

**Spec mapping:** provider abstraction; four required operations; no external service; raw tokens absent from normal logs; production configurable/unavailable.

**Files:**

- Create: `apps/api/src/integrations/email/email-provider.ts`
- Create: `apps/api/src/integrations/email/development-email-provider.ts`
- Create: `apps/api/src/integrations/email/unavailable-email-provider.ts`
- Create: `apps/api/src/plugins/email.ts`
- Create: `apps/api/src/plugins/development-email-capture.ts`
- Test: `apps/api/test/development-email-provider.test.ts`

**Interfaces:**

- Produces:

```ts
interface EmailProvider {
  sendVerification(input: VerificationEmail): Promise<EmailDeliveryResult>;
  sendManagementLink(input: ManagementLinkEmail): Promise<EmailDeliveryResult>;
  sendAccessRequestNotification(input: AccessRequestEmail): Promise<EmailDeliveryResult>;
  sendAccessDecisionNotification(input: AccessDecisionEmail): Promise<EmailDeliveryResult>;
}

type EmailDeliveryResult = { messageId: string; acceptedAt: Date };
```

- Consumed by: company identity service.

- [ ] **Step 1: Write failing provider tests**

Assert the in-memory provider captures each message type without calling the logger; capacity is bounded; `clear()` erases raw links; fragments carry tokens (`/verify#token=...`) so web servers do not receive them in request URLs; unavailable provider throws a typed service-unavailable error.

- [ ] **Step 2: Run red**

Run: `pnpm --filter @takeover/api test -- development-email-provider.test.ts`

Expected: FAIL because the provider files do not exist.

- [ ] **Step 3: Implement the interface and transports**

The development provider stores captures only in process memory and exposes them through an injected test accessor. Register `GET /__dev/email-captures/:messageId` only when all are true: `NODE_ENV=development`, `DEV_EMAIL_CAPTURE_ENABLED=true`, and `API_HOST` is loopback. Add `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Never register the route in test/production builds unless explicitly injected by a test.

The production factory currently selects `unavailable`; identity issuance returns the stable service-unavailable envelope without pretending delivery succeeded. Future providers implement the interface in one integration folder.

- [ ] **Step 4: Verify secret-safe behavior**

Run provider tests with a recording logger and assert no captured log object/string contains the raw token, link, cookie, or email body.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/integrations apps/api/src/plugins apps/api/test/development-email-provider.test.ts
git commit -m "feat(api): add development email provider boundary"
```

---

### Task 5: Implement Domain Rules, Prisma Repository, Durable Rate Limits, and Audit Writes

**Spec mapping:** thin HTTP; testable business logic; transactional security state; durable rate limits; audit trail; normalization/collision behavior.

**Files:**

- Create: `apps/api/src/modules/company-identity/domain.ts`
- Create: `apps/api/src/modules/company-identity/repository.ts`
- Create: `apps/api/src/modules/company-identity/prisma-repository.ts`
- Create: `apps/api/src/modules/company-identity/authorization.ts`
- Create: `apps/api/src/plugins/database.ts`
- Test: `apps/api/test/normalization.test.ts`
- Test: `apps/api/test/integration/company-identity-postgres.test.ts`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/vitest.integration.config.ts`
- Modify: `apps/api/package.json`

**Interfaces:**

- Produces: normalization functions, state transitions, `CompanyIdentityRepository`, `PrismaCompanyIdentityRepository`, `consumeRateLimit`, `writeAudit`, and same-company authorization policy.
- Consumed by: service/routes.

- [ ] **Step 1: Write failing pure-domain tests**

Cover website normalization, personal-email acceptance, private-host rejection, path preservation, name normalization, external territory-reference validation, legal access transitions, terminal-state denial, draft/access/recovery expiry, and Company A/Company B authorization denial.

- [ ] **Step 2: Configure and write failing PostgreSQL repository tests**

Add `test:integration` to `apps/api/package.json`. The ordinary Vitest config excludes `test/integration/**`; the integration config includes only that directory and requires `TEST_DATABASE_URL`. With a migrated dedicated test DB, prove:

- an authoritative normalized website is unique;
- drafts do not silently merge;
- one pending access request per company/contact;
- rate bucket increment is atomic under concurrency;
- audit rows are created in the same transaction as grant/request/session mutations;
- `BigInt` amounts outside JS safe range are rejected at the API mapper boundary.

- [ ] **Step 3: Run unit red and integration red**

Run:

```powershell
pnpm --filter @takeover/api test -- normalization.test.ts
pnpm --filter @takeover/api test:integration -- company-identity-postgres.test.ts
```

Expected: both fail because domain/repository code is absent.

- [ ] **Step 4: Implement the smallest repository surface**

Use explicit operation methods rather than generic CRUD:

```ts
interface CompanyIdentityRepository {
  beginCompanyClaim(input: BeginClaimRecord): Promise<BeginClaimRecordResult>;
  consumeContactVerification(input: ConsumeChallengeInput): Promise<VerificationExchangeResult>;
  issueManagementChallenge(
    input: IssueManagementChallengeInput,
  ): Promise<IssuedChallengeRecord | null>;
  createManagementSession(input: CreateSessionInput): Promise<SessionRecord>;
  resolveManagementSession(digest: Uint8Array, now: Date): Promise<ManagementAuthority | null>;
  revokeManagementSession(input: RevokeSessionInput): Promise<void>;
  decideAccessRequest(input: DecideAccessRequestInput): Promise<AccessDecisionResult>;
  requestManualRecovery(input: RecoveryRecordInput): Promise<RecoveryRecordResult>;
  updateTakeoverPreparation(input: UpdateTakeoverPreparationInput): Promise<TakeoverIntentRecord>;
  consumeRateLimit(input: RateLimitInput): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}
```

Each compound mutation accepts one transaction client internally. Do not call the lifecycle/global client from inside a transaction callback.

- [ ] **Step 5: Make tests green**

Run unit and integration commands from Step 3. Expected: exit 0 with actual PostgreSQL evidence.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/company-identity apps/api/src/plugins/database.ts apps/api/test apps/api/vitest*.ts
git commit -m "feat(api): add company identity persistence rules"
```

---

### Task 6: Implement New-Company Claim, Email Verification, Grant, and Session Flow

**Spec mapping:** mandatory verified email before checkout; private draft; grant/session after exchange; no payment or ownership.

**Files:**

- Create: `apps/api/src/modules/company-identity/service.ts`
- Create: `apps/api/src/modules/company-identity/routes.ts`
- Create: `apps/api/src/plugins/company-identity.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/company-identity-service.test.ts`
- Test: `apps/api/test/company-identity-http.test.ts`

**Interfaces:**

- Consumes: Tasks 1–5 contracts, token service, email provider, repository, cookie/Origin helpers.
- Produces: working claim, verification reissue/exchange, management context, and session revocation endpoints.

- [ ] **Step 1: Write failing service tests**

Test exact new-company sequence:

1. claim creates a private 24-hour draft, contact, 24-hour intent, and 15-minute challenge;
2. email provider receives raw link but repository/logs never do;
3. unverified state returns `checkoutAvailable: false` and cannot create grant/session;
4. exchange consumes once and atomically marks contact verified, records `contact_verified`, creates draft grant, creates 8-hour session, advances intent to `identity_ready`, and writes audits;
5. replay, expiry, wrong purpose, revoked challenge, too many failures, and company collision fail safely;
6. email `founder@gmail.com` with `https://mycoolstartup.com` succeeds.

- [ ] **Step 2: Run service tests red**

Run: `pnpm --filter @takeover/api test -- company-identity-service.test.ts`

Expected: FAIL because service operations are absent.

- [ ] **Step 3: Implement claim and exchange services**

Expose cohesive methods:

```ts
beginCompanyClaim(request, context);
reissueEmailVerification(request, context);
exchangeEmailVerification(request, context);
getManagementContext(sessionToken);
revokeManagementSession(sessionToken, context);
```

The service calculates all expirations from injected `IdentityConfig` and `Clock`. It returns raw link/session material only to the email/cookie adapter at the application boundary.

- [ ] **Step 4: Write failing Fastify tests**

Use `fastify.inject` and injected fake repository/email provider. Assert validation envelopes, generic reissue response, `Set-Cookie` flags, CSRF cookie separation, no response token leakage, 401/403/409/429 mappings, no state-changing `GET`, and no checkout endpoint.

- [ ] **Step 5: Implement thin routes/plugin registration**

Register cookie parsing before company routes. Register database, email, and identity plugins only after config is parsed. Routes call one service operation, set/clear cookies, and return shared schemas. Expand Pino redaction to `req.body.token`, cookie headers, and `set-cookie`; do not log request bodies.

- [ ] **Step 6: Run focused and workspace checks**

Run:

```powershell
pnpm --filter @takeover/api test -- company-identity-service.test.ts company-identity-http.test.ts
pnpm --filter @takeover/api typecheck
pnpm --filter @takeover/api lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src apps/api/test
git commit -m "feat(api): add verified company claim flow"
```

---

### Task 7: Implement Management-Link and Session Lifecycle

**Spec mapping:** opaque email link -> exchange -> company-scoped HttpOnly session; revocation; no global user context.

**Files:**

- Modify: `apps/api/src/modules/company-identity/service.ts`
- Modify: `apps/api/src/modules/company-identity/routes.ts`
- Modify: `apps/api/src/modules/company-identity/repository.ts`
- Modify: `apps/api/src/modules/company-identity/prisma-repository.ts`
- Modify/Test: `apps/api/test/company-identity-service.test.ts`
- Modify/Test: `apps/api/test/company-identity-http.test.ts`

**Interfaces:**

- Produces: management link issuance/exchange, context, CSRF validation, current-session revocation, and grant-wide invalidation behavior.
- Consumed by: access-decision task.

- [ ] **Step 1: Add failing lifecycle tests**

Prove enumeration-resistant issuance for unknown email/company; only active verified grants receive mail; 15-minute link single use; session renewal revokes/replaces prior link-derived session where configured; session expires at 8 hours; revoking a grant invalidates all sessions; context includes exactly one company; Company A cookie fails Company B actions; CSRF/Origin failures do not mutate state.

- [ ] **Step 2: Run red**

Run: `pnpm --filter @takeover/api test -- company-identity-service.test.ts company-identity-http.test.ts`

- [ ] **Step 3: Implement management operations and routes**

Add:

```ts
requestManagementLink(request, context);
exchangeManagementLink(request, context);
authorizeCompanyMutation(sessionToken, csrfToken, companyId, context);
```

Always return the same accepted response for link issuance, regardless of whether a grant exists. Email link `GET` only loads the frontend; `POST /exchange` consumes it. Context responses have no contact-global company list.

- [ ] **Step 4: Run tests, typecheck, and lint**

Expected: all exit 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/company-identity apps/api/test
git commit -m "feat(api): add scoped management sessions"
```

---

### Task 8: Implement Existing-Company Access Requests and Decisions

**Spec mapping:** verified email alone is not authority; pending blocks checkout/mutations; manager approve/reject; notifications; stale preparation preserved without price lock.

**Files:**

- Modify: `apps/api/src/modules/company-identity/domain.ts`
- Modify: `apps/api/src/modules/company-identity/service.ts`
- Modify: `apps/api/src/modules/company-identity/routes.ts`
- Modify: `apps/api/src/modules/company-identity/prisma-repository.ts`
- Modify/Test: `apps/api/test/company-identity-service.test.ts`
- Modify/Test: `apps/api/test/company-identity-http.test.ts`
- Test: `apps/api/test/integration/access-request-concurrency.test.ts`

**Interfaces:**

- Produces: automatic pending request creation after verified exchange, manager notification, explicit approve/reject endpoints, requester decision notification, and continuation management-link issuance on approval.

- [ ] **Step 1: Write failing flow and concurrency tests**

Cover:

- website collision selects existing company instead of silently creating/merging an authoritative company;
- requester email verifies successfully but receives no grant/session;
- exchange creates one pending seven-day access request and sets intent `awaiting_company_access`;
- pending/rejected/expired/cancelled requests cannot use company mutation or checkout seams;
- active same-company manager can approve/reject with valid CSRF/Origin;
- wrong-company and revoked manager sessions fail;
- approval atomically creates/reactivates the exact grant, sets approved/decision fields, advances intent to `identity_ready`, writes audit, and sends requester management link;
- rejection grants nothing, sets terminal state, cancels intent, audits, and sends decision notification;
- concurrent approve/reject produces exactly one terminal decision;
- duplicate pending requests and notification storms are rate-limited/deduplicated.

- [ ] **Step 2: Run red including PostgreSQL concurrency**

Run:

```powershell
pnpm --filter @takeover/api test -- company-identity-service.test.ts company-identity-http.test.ts
pnpm --filter @takeover/api test:integration -- access-request-concurrency.test.ts
```

- [ ] **Step 3: Implement decision transitions**

Lock the access-request row in a Prisma interactive transaction (use parameterized raw SQL only where Prisma lacks row locking), re-read manager grant/company scope, transition once, create grant/audit, update intent, and commit before sending the decision email. If email delivery fails, preserve the authoritative decision and record delivery failure; do not roll back the security decision.

- [ ] **Step 4: Make all focused tests green**

Expected: unit/HTTP/integration commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/company-identity apps/api/test
git commit -m "feat(api): add existing company access approval"
```

---

### Task 9: Add Manual-Recovery State and the TakeoverIntent Identity Seam

**Spec mapping:** recovery data/operator seam without fake admin; reference-only intent; no territory/pricing/payment/capture.

**Files:**

- Modify: `packages/shared/src/company-claim.ts`
- Modify/Test: `packages/shared/test/company-claim.test.ts`
- Modify: `apps/api/src/modules/company-identity/domain.ts`
- Modify: `apps/api/src/modules/company-identity/service.ts`
- Modify: `apps/api/src/modules/company-identity/routes.ts`
- Modify: `apps/api/src/modules/company-identity/prisma-repository.ts`
- Modify/Test: API unit/HTTP/integration tests

**Interfaces:**

- Produces: pending recovery records with `executionAvailable: false`, a non-public `ManualRecoveryOperatorPort`, and takeover preparation update with `quoteAuthority: reference_only`.

- [ ] **Step 1: Write failing recovery/intent tests**

Assert recovery requires a verified contact tied to a pending/expired existing-company request; rate limit is two per contact/company/day; expiry is seven days; no public endpoint can approve; response is 202 with `status: pending` and `executionAvailable: false`; audit is durable.

Assert intent update requires a valid draft-company session or approved existing-company session; stores only validated external reference and reference quote; always returns `checkoutAvailable: false`; unverified/pending/wrong-company sessions fail; no Territory/Payment/Bid/Ownership Prisma model or route is introduced.

- [ ] **Step 2: Run red**

Run shared, API unit, HTTP, and integration focused tests.

- [ ] **Step 3: Implement the operator seam and intent update**

Define but do not expose:

```ts
type ManualRecoveryResolution = {
  status: 'approved' | 'rejected';
  operatorReference: string;
  reason: string;
};

interface ManualRecoveryOperatorPort {
  resolve(requestId: string): Promise<ManualRecoveryResolution>;
}
```

The Phase 1 implementation returns a typed unavailable error if invoked. Do not provide an operator credential, route, environment bypass, or direct grant mutation.

`PUT /api/takeover-intents/:id/preparation` validates/stores reference data and never evaluates a legal minimum or transitions to checkout readiness.

- [ ] **Step 4: Make focused tests green and run prohibited-scope scan**

Run:

```powershell
rg -n -i "model (User|Territory|Payment|Bid|TerritoryOwnership)|Dodo|Stripe|Razorpay|checkout|webhook" packages/database/prisma apps/api/src
```

Expected: no prohibited model/provider/route implementation; documentation/error copy may mention checkout only as unavailable.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared apps/api
git commit -m "feat(api): add recovery and takeover intent seams"
```

---

### Task 10: Complete Integration Evidence, Documentation, and Handoff

**Spec mapping:** acceptance criteria; honest implemented/planned labels; Claude contract handoff; no Phase 2/3 drift.

**Files:**

- Modify: `scripts/smoke-api.mjs`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PHASES.md`
- Modify: `docs/MEMORY.md`
- Modify if contracts changed: `docs/PRD.md`, `docs/RULES.md`, `docs/DESIGN.md`

**Interfaces:**

- Produces: verified Phase 1 status, exact endpoint/contracts handoff, deployment blockers, and final clean repository.

- [ ] **Step 1: Run the complete offline/static suite**

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
pnpm smoke:api
```

Expected: all exit 0. API smoke keeps identity unavailable unless it supplies a test database/provider; `/health` and `/ready` remain honest.

- [ ] **Step 2: Run live PostgreSQL Phase 1 integration**

```powershell
$env:TAKEOVER_ALLOW_TEST_DATABASE_RESET='true'
pnpm db:test:prepare
pnpm test:integration
```

Expected: migrations apply and all concurrency/persistence tests pass. Without a live dedicated PostgreSQL instance, record Phase 1 as **IN PROGRESS / UNVALIDATED**, not complete.

- [ ] **Step 3: Run security and scope scans**

Verify:

- no raw token appears in captured normal logs, database fixtures, snapshots, or error bodies;
- no `User`, password route, global session/context, Territory, ownership, pricing, Dodo, payment, webhook, capture, Redis, queue, or worker implementation;
- `@takeover/shared` imports no Fastify/Prisma/Node/provider module;
- `apps/web` and `apps/api` still build independently;
- generated Prisma CLI/client/adapter versions remain exactly 7.10.0;
- `@fastify/cookie` is exactly 11.1.2.

- [ ] **Step 4: Update canonical documentation honestly**

Mark only evidenced operations **IMPLEMENTED NOW**. Keep production email delivery, manual recovery execution, Phase 2 territory ownership, and Phase 3 Dodo/payment/capture **PLANNED** or **UNVALIDATED / NEEDS REVIEW**.

Add a Codex -> Claude handoff listing the exact shared exports, endpoint bodies, cookie/CSRF requirements, development email limitation, and unavailable checkout boundary. Remove obsolete provisional company identity contracts from Claude's pending requirements, but do not claim Claude has integrated them.

- [ ] **Step 5: Review the diff and commit**

```powershell
git diff --check
git status --short
git add scripts docs .env.example package.json pnpm-lock.yaml apps packages
git commit -m "docs: record phase 1 company identity status"
```

Do not start Phase 2 or Phase 3.

---

## Task Order and Dependencies

```text
Task 1 shared contracts
  -> Task 2 schema/integration harness
  -> Task 3 config/security primitives
  -> Task 4 email boundary
  -> Task 5 domain/repository/rate/audit
  -> Task 6 new-company verification flow
  -> Task 7 management sessions
  -> Task 8 existing-company access decisions
  -> Task 9 recovery + intent seam
  -> Task 10 full verification/docs/handoff
```

Tasks are deliberately sequential because their interfaces and migrations are shared. Do not parallel-edit `schema.prisma`, shared contracts, the identity service, or canonical docs.

## Security Failure Matrix

The implementation is incomplete until tests prove every row:

| Failure                                                                    | Required result                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Unverified new contact attempts takeover preparation beyond identity draft | `CONTACT_VERIFICATION_REQUIRED`; no grant/session/checkout          |
| Verified new contact exchanges valid link                                  | Draft-only grant/session; no ownership/payment                      |
| Verified different contact selects managed company                         | Pending access request; no session/grant/checkout                   |
| Wrong-company manager approves                                             | Authorization denial; no state change                               |
| Duplicate/concurrent approval and rejection                                | Exactly one terminal decision                                       |
| Expired/replayed/wrong-purpose token                                       | Generic invalid/expired response; failure count/audit; no session   |
| Revoked grant/session                                                      | Authorization denial and cookie clearing where applicable           |
| Missing/wrong Origin or CSRF                                               | Mutation denial before service call                                 |
| Rate limit exceeded                                                        | 429 stable envelope with safe retry metadata; no email/notification |
| Normalized website already authoritative                                   | Existing-company flow; no merge/second authoritative company        |
| Dev email transport requested in production                                | Startup/configuration failure                                       |
| Manual approval attempted                                                  | Unavailable; no public operator bypass                              |
| Client quote claims eligibility                                            | Stored as reference-only; checkout remains unavailable              |
| Browser visits email link with GET                                         | No security/domain mutation                                         |
| Token appears in log/error/database                                        | Test failure and release blocker                                    |

## Plan Self-Review

### Spec and canonical-doc coverage

- New company verified-before-checkout rule: Tasks 1, 6, and failure matrix.
- Existing company verified-email-plus-approval rule: Task 8.
- Email abstraction and dev/test-only transport: Task 4.
- Locked TTL defaults: Task 3 and configuration tests.
- Opaque HttpOnly server-resolved company session: Tasks 3 and 7.
- Website normalization/collision/no merge: Tasks 2, 5, and 8.
- Manual recovery state without fake admin: Task 9.
- External/reference takeover intent only: Tasks 1, 2, and 9.
- Shared browser/server-safe contracts: Task 1.
- Migrations, endpoints, token consumption, lifecycle, rate limiting, audit, tests, and verification: Tasks 2–10.
- Phase 0 boundaries and independent builds: Global Constraints and Task 10.
- Dodo/payment/browser-return rules remain Phase 3 only: Global Constraints, Task 9 scan, and Task 10 docs.

### Placeholder scan

The plan contains no implementation placeholder task, fake provider success, fake recovery approval, or speculative Phase 2/3 module. Production email and manual recovery execution are explicitly unavailable, not simulated.

### Type/interface consistency

- Wire states stay lowercase in `@takeover/shared`; Prisma maps uppercase enums inside the repository.
- `CompanyManagementSession` always binds one `companyId` and `grantId`.
- `TakeoverIntent` uses `territoryExternalRef`, `quoteAuthority: 'reference_only'`, and `checkoutAvailable: false` throughout Phase 1.
- Email provider method names match the approved four-operation interface.
- Token services return raw secrets only to the immediate email/cookie boundary; repositories accept only digests/selectors.
- Phase 1 response money uses the existing safe-integer `Money`; persistence uses `BigInt` with checked conversion.

## Completion Gate

Phase 1 is complete only if both the full workspace suite and dedicated live PostgreSQL integration suite pass, security/scope scans are clean, canonical docs reflect actual behavior, and production-unavailable integrations remain labeled honestly. A missing PostgreSQL service or production email provider is not permission to claim those integrations work.
