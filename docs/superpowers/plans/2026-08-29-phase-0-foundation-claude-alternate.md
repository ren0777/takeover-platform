# Archived Concurrent Phase 0 Plan (Non-Canonical)

> **DO NOT EXECUTE:** Preserved for review history. It contains rejected Next.js 16 and outdated Prisma 7 configuration details. The reconciled canonical plan is `docs/superpowers/plans/2026-08-29-phase-0-foundation.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small, runnable, independently deployable pnpm monorepo for TakeOver.com with honest documentation, proving the foundation works without implementing any product gameplay.

**Architecture:** A pnpm workspace with two deployable apps (`apps/web` Next.js, `apps/api` Fastify) and three packages (`packages/shared` framework-neutral contracts, `packages/database` sole Prisma owner, `packages/config` build-time config). The API separates instance construction (`app.ts`) from process startup (`server.ts`) so tests use `fastify.inject` without binding a port. No product modules, no placeholder directories.

**Tech Stack:** pnpm 10.32.1, Node 24.12.0, TypeScript 5.9.3, Next.js 16.3.3, React 19.2.8, Tailwind CSS v4.3.3, Fastify 5.12.1, Zod 4.5.2, Prisma 7.10.0, Vitest 4.1.11, ESLint 9.39.5, Prettier 3.9.6.

**Spec:** `docs/superpowers/specs/2026-08-29-phase-0-foundation-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Exact version pins.** Foundational tooling uses exact versions, no caret ranges. Approved by user 2026-08-29 to prevent version drift across agent environments.
- **Approved dependency set only.** Nothing outside: next, react, react-dom, tailwindcss, @tailwindcss/postcss, fastify, zod, prisma, @prisma/client, typescript, vitest, eslint, @eslint/js, typescript-eslint, eslint-config-prettier, eslint-plugin-react-hooks, prettier, tsx, pino-pretty, @types/node, @types/react, @types/react-dom.
- **Prohibited.** Redis, queues, workers, schedulers, Stripe, Razorpay, auth providers, email providers, Turbo/Nx, Docker provisioning, ORM alternatives, Nest-style DI.
- **No speculative product modules.** No empty directories, no placeholder service classes, no product schemas for territories/companies/bids/ownership/payments/seasons/battles.
- **`packages/shared` is browser-safe.** It must never import Fastify, Prisma, Node-only config, or provider SDKs.
- **`packages/database` is the only Prisma owner.** No other workspace creates a `PrismaClient`.
- **`apps/web` and `apps/api` stay independently deployable.** Neither imports the other. `apps/web` must not import `@takeover/database`.
- **Docs label every material architecture statement** `IMPLEMENTED NOW`, `PLANNED`, or `UNVALIDATED / NEEDS REVIEW`.
- **No financial state.** No route accepts or calculates money during Phase 0.
- **Money is integer minor units.** No floating-point arithmetic on money, ever.
- **Do not begin Phase 1.** Stop at the Phase 0 boundary.
- **Money type shape (verbatim from spec):** `{ amountMinor: number; currency: string }`
- **Success envelope (verbatim from spec):** `{ data: T; meta?: Record<string, unknown> }`
- **Error envelope (verbatim from spec):** `{ error: { code: string; message: string; requestId?: string; details?: unknown } }`

## File Structure

| Path                                     | Responsibility                                             |
| ---------------------------------------- | ---------------------------------------------------------- |
| `package.json`                           | Private root, pins pnpm, orchestrates recursive scripts    |
| `pnpm-workspace.yaml`                    | Declares `apps/*` and `packages/*`                         |
| `tsconfig.json`                          | Root solution file referencing workspaces                  |
| `.gitignore` / `.env.example`            | Ignore rules; env names with safe illustrative values only |
| `.prettierrc.json` / `.prettierignore`   | Formatting                                                 |
| `eslint.config.js`                       | Root flat config consuming `@takeover/config`              |
| `packages/config/tsconfig.base.json`     | Strict TS base extended by every workspace                 |
| `packages/config/eslint.base.js`         | Shared flat ESLint config array                            |
| `packages/shared/src/envelope.ts`        | `ApiSuccess`/`ApiError` Zod schemas + types                |
| `packages/shared/src/errors.ts`          | Stable error-code constants                                |
| `packages/shared/src/money.ts`           | Money schema, guard, constructor                           |
| `packages/shared/src/constants.ts`       | Infrastructure-neutral domain constants                    |
| `packages/shared/src/index.ts`           | Public surface                                             |
| `packages/database/prisma/schema.prisma` | PostgreSQL schema, infrastructure model only               |
| `packages/database/prisma/migrations/`   | Committed initial migration                                |
| `packages/database/src/client.ts`        | `getDatabaseClient` / `disconnectDatabase`                 |
| `apps/api/src/config/env.ts`             | Zod-validated runtime configuration                        |
| `apps/api/src/plugins/health.ts`         | `/health` and `/ready` routes                              |
| `apps/api/src/app.ts`                    | Builds Fastify instance, binds no port                     |
| `apps/api/src/server.ts`                 | Process lifecycle: listen, signals, exit codes             |
| `apps/web/src/app/layout.tsx`            | Root layout + metadata                                     |
| `apps/web/src/app/page.tsx`              | Minimal shell                                              |
| `apps/web/src/app/globals.css`           | Tailwind v4 entry                                          |
| `scripts/smoke-api.mjs`                  | Starts compiled API, asserts health endpoints              |
| `docs/*.md`                              | Six canonical documents                                    |

---

### Task 1: Workspace root, shared config, and tooling

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`, `.env.example`, `.npmrc`
- Create: `.prettierrc.json`, `.prettierignore`, `eslint.config.js`
- Create: `packages/config/package.json`, `packages/config/tsconfig.base.json`, `packages/config/eslint.base.js`

**Interfaces:**

- Consumes: nothing (first task)
- Produces: `@takeover/config` exporting `./tsconfig.base.json` and `./eslint.base.js`; root scripts `dev build typecheck lint test format format:check db:generate db:validate smoke:api`

- [ ] **Step 1: Create the workspace manifest files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`.npmrc`:

```
strict-peer-dependencies=false
auto-install-peers=true
```

`package.json`:

```json
{
  "name": "takeover",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@10.32.1",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "pnpm --parallel --filter \"./apps/*\" dev",
    "build": "pnpm --filter \"./packages/*\" build && pnpm --filter \"./apps/*\" build",
    "typecheck": "pnpm --recursive typecheck",
    "lint": "eslint .",
    "test": "vitest run",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:generate": "pnpm --filter @takeover/database db:generate",
    "db:validate": "pnpm --filter @takeover/database db:validate",
    "smoke:api": "node scripts/smoke-api.mjs"
  },
  "devDependencies": {
    "@eslint/js": "9.39.5",
    "@types/node": "24.13.3",
    "eslint": "9.39.5",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-react-hooks": "7.1.1",
    "prettier": "3.9.6",
    "typescript": "5.9.3",
    "typescript-eslint": "8.68.0",
    "vitest": "4.1.11"
  }
}
```

- [ ] **Step 2: Create ignore and environment example files**

`.gitignore`:

```
node_modules/
dist/
.next/
out/
coverage/
*.tsbuildinfo
.env
.env.local
.env.*.local
.DS_Store
generated/
```

`.env.example` — names and safe illustrative values only, no real secrets:

```
NODE_ENV=development
HOST=127.0.0.1
PORT=4000
LOG_LEVEL=info
DATABASE_URL=postgresql://takeover:takeover@localhost:5432/takeover?schema=public
```

- [ ] **Step 3: Create `packages/config`**

`packages/config/package.json`:

```json
{
  "name": "@takeover/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./eslint.base.js": "./eslint.base.js"
  },
  "scripts": {
    "typecheck": "node -e \"console.log('@takeover/config has no TypeScript sources')\""
  }
}
```

`packages/config/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`packages/config/eslint.base.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** Shared flat ESLint configuration for all TakeOver workspaces. */
export const baseConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
];

export default baseConfig;
```

- [ ] **Step 4: Create root ESLint and Prettier configuration**

`eslint.config.js`:

```js
import { baseConfig } from '@takeover/config/eslint.base.js';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/generated/**',
      '**/coverage/**',
      'packages/database/prisma/migrations/**',
    ],
  },
  ...baseConfig,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['**/*.config.{js,mjs,ts}', 'scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
];
```

`.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

`.prettierignore`:

```
node_modules/
dist/
.next/
coverage/
pnpm-lock.yaml
packages/database/prisma/migrations/
generated/
```

- [ ] **Step 5: Create the root TypeScript solution file**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./packages/shared" },
    { "path": "./packages/database" },
    { "path": "./apps/api" }
  ]
}
```

Note: `apps/web` is intentionally excluded from project references because Next.js manages its own TypeScript program and generates `next-env.d.ts` during build.

- [ ] **Step 6: Verify the workspace resolves**

Run: `pnpm install`
Expected: completes, creates `pnpm-lock.yaml`, links `@takeover/config`.

Run: `pnpm format` then `pnpm format:check`
Expected: `format:check` passes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: establish pnpm workspace root and shared tooling config"
```

---

### Task 2: `packages/shared` contracts (TDD)

**Files:**

- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/{money,envelope,errors,constants,index}.ts`
- Test: `packages/shared/test/{money,envelope}.test.ts`

**Interfaces:**

- Consumes: `@takeover/config/tsconfig.base.json`
- Produces, imported by `apps/api` and later `apps/web` as `@takeover/shared`:
  - `type Money = { amountMinor: number; currency: string }`
  - `moneySchema` — Zod schema for `Money`
  - `createMoney(amountMinor: number, currency: string): Money` — throws `ZodError` when invalid
  - `isMoney(value: unknown): value is Money`
  - `type ApiSuccess<T> = { data: T; meta?: Record<string, unknown> }`
  - `type ApiError = { error: { code: string; message: string; requestId?: string; details?: unknown } }`
  - `apiSuccessSchema(dataSchema)`, `apiErrorSchema`
  - `ERROR_CODES` with `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`
  - `type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]`
  - `DEFAULT_CURRENCY`, `HEALTH_STATUS`

- [ ] **Step 1: Create the package manifest and TS config**

`packages/shared/package.json`:

```json
{
  "name": "@takeover/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "4.5.2" },
  "devDependencies": { "typescript": "5.9.3", "vitest": "4.1.11" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "@takeover/config/tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Write the failing money tests**

`packages/shared/test/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMoney, isMoney, moneySchema } from '../src/money.js';

describe('createMoney', () => {
  it('accepts a valid non-negative integer minor amount', () => {
    expect(createMoney(42000, 'USD')).toEqual({ amountMinor: 42000, currency: 'USD' });
  });

  it('accepts zero', () => {
    expect(createMoney(0, 'USD').amountMinor).toBe(0);
  });

  it('rejects fractional amounts', () => {
    expect(() => createMoney(10.5, 'USD')).toThrow();
  });

  it('rejects negative amounts in phase 0', () => {
    expect(() => createMoney(-1, 'USD')).toThrow();
  });

  it('rejects unsafe integers', () => {
    expect(() => createMoney(Number.MAX_SAFE_INTEGER + 1, 'USD')).toThrow();
  });

  it('rejects NaN and Infinity', () => {
    expect(() => createMoney(Number.NaN, 'USD')).toThrow();
    expect(() => createMoney(Number.POSITIVE_INFINITY, 'USD')).toThrow();
  });

  it('rejects lowercase currency codes', () => {
    expect(() => createMoney(100, 'usd')).toThrow();
  });

  it('rejects currency codes that are not exactly three letters', () => {
    expect(() => createMoney(100, 'US')).toThrow();
    expect(() => createMoney(100, 'USDD')).toThrow();
    expect(() => createMoney(100, 'U5D')).toThrow();
  });
});

describe('isMoney', () => {
  it('narrows valid money', () => {
    expect(isMoney({ amountMinor: 1, currency: 'EUR' })).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isMoney(null)).toBe(false);
    expect(isMoney({ amountMinor: '1', currency: 'EUR' })).toBe(false);
    expect(isMoney({ amountMinor: 1 })).toBe(false);
  });
});

describe('moneySchema', () => {
  it('strips unknown keys rather than trusting caller input', () => {
    const parsed = moneySchema.parse({ amountMinor: 1, currency: 'USD', evil: true });
    expect(parsed).toEqual({ amountMinor: 1, currency: 'USD' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @takeover/shared test`
Expected: FAIL — cannot resolve `../src/money.js`.

- [ ] **Step 4: Implement money primitives**

`packages/shared/src/money.ts`:

```ts
import { z } from 'zod';

/**
 * Money is always represented in integer minor units (e.g. cents).
 * Floating point arithmetic on money is prohibited across the codebase.
 */
export const moneySchema = z.object({
  amountMinor: z
    .number()
    .int('amountMinor must be an integer number of minor units')
    .nonnegative('amountMinor must not be negative')
    .refine(Number.isSafeInteger, 'amountMinor must be a safe integer'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter uppercase ISO code'),
});

export type Money = z.infer<typeof moneySchema>;

/** Builds a validated Money value. Throws ZodError when the input is invalid. */
export function createMoney(amountMinor: number, currency: string): Money {
  return moneySchema.parse({ amountMinor, currency });
}

/** Type guard for untrusted input. */
export function isMoney(value: unknown): value is Money {
  return moneySchema.safeParse(value).success;
}
```

Note: Zod object schemas strip unknown keys by default, which satisfies the strip test.

- [ ] **Step 5: Run the money tests to verify they pass**

Run: `pnpm --filter @takeover/shared test`
Expected: PASS.

- [ ] **Step 6: Write the failing envelope tests**

`packages/shared/test/envelope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema, apiSuccessSchema } from '../src/envelope.js';
import { ERROR_CODES } from '../src/errors.js';

describe('apiSuccessSchema', () => {
  it('accepts data without meta', () => {
    const schema = apiSuccessSchema(z.object({ status: z.string() }));
    expect(schema.parse({ data: { status: 'ok' } })).toEqual({ data: { status: 'ok' } });
  });

  it('accepts optional meta', () => {
    const schema = apiSuccessSchema(z.object({ status: z.string() }));
    const parsed = schema.parse({ data: { status: 'ok' }, meta: { requestId: 'abc' } });
    expect(parsed.meta).toEqual({ requestId: 'abc' });
  });

  it('rejects a missing data field', () => {
    const schema = apiSuccessSchema(z.object({ status: z.string() }));
    expect(() => schema.parse({ meta: {} })).toThrow();
  });
});

describe('apiErrorSchema', () => {
  it('accepts a minimal error', () => {
    const parsed = apiErrorSchema.parse({
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Route not found' },
    });
    expect(parsed.error.code).toBe('NOT_FOUND');
  });

  it('rejects an error without a code', () => {
    expect(() => apiErrorSchema.parse({ error: { message: 'nope' } })).toThrow();
  });

  it('rejects an empty error code', () => {
    expect(() => apiErrorSchema.parse({ error: { code: '', message: 'nope' } })).toThrow();
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `pnpm --filter @takeover/shared test`
Expected: FAIL — cannot resolve `../src/envelope.js`.

- [ ] **Step 8: Implement envelopes, error codes, and constants**

`packages/shared/src/errors.ts`:

```ts
/** Stable, transport-agnostic error codes shared by API and clients. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
```

`packages/shared/src/envelope.ts`:

```ts
import { z } from 'zod';

/** Successful responses always nest the payload under `data`. */
export function apiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

export type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
};
```

`packages/shared/src/constants.ts`:

```ts
/** Infrastructure-neutral constants shared across workspaces. */
export const DEFAULT_CURRENCY = 'USD';

/** Health endpoint status literals returned by the API. */
export const HEALTH_STATUS = {
  OK: 'ok',
  READY: 'ready',
} as const;
```

`packages/shared/src/index.ts`:

```ts
export { moneySchema, createMoney, isMoney } from './money.js';
export type { Money } from './money.js';
export { apiSuccessSchema, apiErrorSchema } from './envelope.js';
export type { ApiSuccess, ApiError } from './envelope.js';
export { ERROR_CODES } from './errors.js';
export type { ErrorCode } from './errors.js';
export { DEFAULT_CURRENCY, HEALTH_STATUS } from './constants.js';
```

- [ ] **Step 9: Run all shared tests, typecheck, and build**

Run: `pnpm --filter @takeover/shared test && pnpm --filter @takeover/shared typecheck && pnpm --filter @takeover/shared build`
Expected: tests PASS, no type errors, `dist/index.js` and `dist/index.d.ts` emitted.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(shared): add money primitives, API envelopes, and error codes"
```

---

### Task 3: `packages/database` — sole Prisma owner

**Files:**

- Create: `packages/database/package.json`, `packages/database/tsconfig.json`
- Create: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/0000_init/migration.sql`
- Create: `packages/database/prisma/migrations/migration_lock.toml`
- Create: `packages/database/src/client.ts`, `packages/database/src/index.ts`

**Interfaces:**

- Consumes: `@takeover/config/tsconfig.base.json`
- Produces, imported by `apps/api` only (never by `apps/web`):
  - `getDatabaseClient(): PrismaClient` — lazily constructs and memoizes a single client
  - `disconnectDatabase(): Promise<void>` — disconnects only if a client was created
  - `isDatabaseInitialized(): boolean` — lets `server.ts` skip disconnect when unused

- [ ] **Step 1: Create the package manifest**

`packages/database/package.json`:

```json
{
  "name": "@takeover/database",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "db:generate": "prisma generate",
    "db:validate": "prisma validate",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy"
  },
  "dependencies": { "@prisma/client": "7.10.0" },
  "devDependencies": { "prisma": "7.10.0", "typescript": "5.9.3" }
}
```

`packages/database/tsconfig.json`:

```json
{
  "extends": "@takeover/config/tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "outDir": "./dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Create the Prisma schema**

`packages/database/prisma/schema.prisma`. The single model is infrastructure, not a product model — it exists solely so Prisma has a concrete datamodel to validate and migrate against.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// INFRASTRUCTURE ONLY — not a product model.
/// Records applied foundation metadata so Phase 0 has a concrete datamodel
/// to validate and generate an initial migration from. Product models
/// (companies, territories, bids, ownership) are introduced in later phases.
model InfrastructureMetadata {
  id        String   @id @default(uuid())
  key       String   @unique
  value     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("infrastructure_metadata")
}
```

Note: Prisma 7 may require an explicit `output` path on the `client` generator. If `prisma generate` errors asking for one, add `output = "../generated/client"` to the generator block, add `generated/` to `.gitignore` (already present), and re-export from that path in `src/client.ts`. Record whichever form was used in `ARCHITECTURE.md`.

- [ ] **Step 3: Generate the initial migration without a live database**

`prisma migrate dev` requires a running PostgreSQL server. `prisma migrate diff` does not, so it is used to produce the committed initial migration offline.

Run:

```bash
mkdir -p packages/database/prisma/migrations/0000_init
pnpm --filter @takeover/database exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > packages/database/prisma/migrations/0000_init/migration.sql
```

Then create `packages/database/prisma/migrations/migration_lock.toml`:

```toml
# Please do not edit this file manually
provider = "postgresql"
```

Expected: `migration.sql` contains a `CREATE TABLE "infrastructure_metadata"` statement. Verify it is non-empty before continuing.

- [ ] **Step 4: Implement the client lifecycle**

`packages/database/src/client.ts`:

```ts
import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

/**
 * Returns the process-wide Prisma client, constructing it on first use.
 * Applications must never construct PrismaClient directly.
 */
export function getDatabaseClient(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

/** True when a client has actually been constructed. */
export function isDatabaseInitialized(): boolean {
  return client !== undefined;
}

/** Disconnects the client if one was created. Safe to call unconditionally. */
export async function disconnectDatabase(): Promise<void> {
  if (client === undefined) return;
  const current = client;
  client = undefined;
  await current.$disconnect();
}
```

`packages/database/src/index.ts`:

```ts
export { getDatabaseClient, disconnectDatabase, isDatabaseInitialized } from './client.js';
```

- [ ] **Step 5: Verify schema validation and client generation**

Run: `pnpm db:validate`
Expected: "The schema at prisma/schema.prisma is valid".

Run: `pnpm db:generate`
Expected: Prisma Client generated successfully, with no database connection required.

Run: `pnpm --filter @takeover/database typecheck && pnpm --filter @takeover/database build`
Expected: no type errors, `dist/` emitted.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(database): add prisma postgresql foundation and client lifecycle"
```

---

### Task 4: `apps/api` — Fastify foundation (TDD)

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/plugins/health.ts`
- Create: `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Test: `apps/api/test/{env,health}.test.ts`

**Interfaces:**

- Consumes: `@takeover/shared` (`ERROR_CODES`, `HEALTH_STATUS`, `ApiSuccess`), `@takeover/database` (`disconnectDatabase`, `isDatabaseInitialized`)
- Produces:
  - `loadConfig(source?: NodeJS.ProcessEnv): AppConfig` where `AppConfig = { nodeEnv: 'development' | 'test' | 'production'; host: string; port: number; logLevel: 'fatal'|'error'|'warn'|'info'|'debug'|'trace'; databaseUrl?: string }`
  - `buildApp(config?: Partial<AppConfig>): FastifyInstance` — binds no port
  - `apps/api/dist/server.js` — executable entrypoint

- [ ] **Step 1: Create the manifest and TS configs**

`apps/api/package.json`:

```json
{
  "name": "@takeover/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@takeover/database": "workspace:*",
    "@takeover/shared": "workspace:*",
    "fastify": "5.12.1",
    "zod": "4.5.2"
  },
  "devDependencies": {
    "pino-pretty": "13.1.3",
    "tsx": "4.23.12",
    "typescript": "5.9.3",
    "vitest": "4.1.11"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "@takeover/config/tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": ".",
    "outDir": "./dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "references": [{ "path": "../../packages/shared" }, { "path": "../../packages/database" }]
}
```

`apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Write the failing config tests**

`apps/api/test/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const base = { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '4000', LOG_LEVEL: 'info' };

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig({ ...base });
    expect(config).toMatchObject({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 4000,
      logLevel: 'info',
    });
  });

  it('coerces the port to a number', () => {
    expect(loadConfig({ ...base, PORT: '8080' }).port).toBe(8080);
  });

  it('applies defaults when optional values are absent', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4000);
    expect(config.logLevel).toBe('info');
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadConfig({ ...base, PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadConfig({ ...base, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ ...base, LOG_LEVEL: 'chatty' })).toThrow(/LOG_LEVEL/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('treats DATABASE_URL as optional in phase 0', () => {
    expect(loadConfig({ ...base }).databaseUrl).toBeUndefined();
  });

  it('rejects a malformed DATABASE_URL when one is supplied', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: 'not a url' })).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @takeover/api test`
Expected: FAIL — cannot resolve `../src/config/env.js`.

- [ ] **Step 4: Implement configuration validation**

`apps/api/src/config/env.ts`:

```ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url().optional(),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  databaseUrl?: string;
};

/**
 * Validates runtime configuration before the process opens a port.
 * Throws with the offending variable names so startup failures are actionable.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid API configuration -> ${detail}`);
  }

  const parsed = result.data;
  const config: AppConfig = {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
  };

  if (parsed.DATABASE_URL !== undefined) {
    config.databaseUrl = parsed.DATABASE_URL;
  }

  return config;
}
```

Note: `exactOptionalPropertyTypes` is enabled, so `databaseUrl` is assigned conditionally rather than set to `undefined`.

- [ ] **Step 5: Run config tests to verify they pass**

Run: `pnpm --filter @takeover/api test`
Expected: PASS.

- [ ] **Step 6: Write the failing health tests**

`apps/api/test/health.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

describe('GET /health', () => {
  it('reports liveness in a success envelope', async () => {
    app = buildApp({ nodeEnv: 'test', logLevel: 'fatal' });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);

    const body = response.json();
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.uptimeSeconds).toBe('number');
  });

  it('exposes a request id for correlation', async () => {
    app = buildApp({ nodeEnv: 'test', logLevel: 'fatal' });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json().meta.requestId).toEqual(expect.any(String));
  });
});

describe('GET /ready', () => {
  it('reports readiness and names the checks it actually performed', async () => {
    app = buildApp({ nodeEnv: 'test', logLevel: 'fatal' });
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('ready');
    expect(body.data.checks).toEqual({ application: 'ok' });
  });

  it('does not claim a database check in phase 0', async () => {
    app = buildApp({ nodeEnv: 'test', logLevel: 'fatal' });
    const body = (await app.inject({ method: 'GET', url: '/ready' })).json();
    expect(body.data.checks.database).toBeUndefined();
  });
});

describe('unknown routes', () => {
  it('returns the shared error envelope', async () => {
    app = buildApp({ nodeEnv: 'test', logLevel: 'fatal' });
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toEqual(expect.any(String));
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it('does not leak a stack trace', async () => {
    app = buildApp({ nodeEnv: 'production', logLevel: 'fatal' });
    const raw = (await app.inject({ method: 'GET', url: '/nope' })).body;
    expect(raw).not.toMatch(/at .*\(/);
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `pnpm --filter @takeover/api test`
Expected: FAIL — cannot resolve `../src/app.js`.

- [ ] **Step 8: Implement the health plugin**

`apps/api/src/plugins/health.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { HEALTH_STATUS } from '@takeover/shared';

/**
 * Liveness and readiness routes.
 *
 * Phase 0 readiness verifies only that the application initialized. It must
 * not claim a database check until an API workflow actually requires one.
 */
export async function healthPlugin(app: FastifyInstance): Promise<void> {
  app.get('/health', async (request) => ({
    data: {
      status: HEALTH_STATUS.OK,
      uptimeSeconds: Math.round(process.uptime()),
    },
    meta: { requestId: request.id },
  }));

  app.get('/ready', async (request) => ({
    data: {
      status: HEALTH_STATUS.READY,
      checks: { application: 'ok' },
    },
    meta: { requestId: request.id },
  }));
}
```

- [ ] **Step 9: Implement `app.ts`**

`apps/api/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { ERROR_CODES } from '@takeover/shared';
import { healthPlugin } from './plugins/health.js';
import type { AppConfig } from './config/env.js';

/**
 * Builds a configured Fastify instance without binding a network port,
 * so tests can drive it through `fastify.inject`.
 */
export function buildApp(overrides: Partial<AppConfig> = {}): FastifyInstance {
  const nodeEnv = overrides.nodeEnv ?? 'development';
  const isProduction = nodeEnv === 'production';

  const app = Fastify({
    logger: {
      level: overrides.logLevel ?? 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
    },
    disableRequestLogging: nodeEnv === 'test',
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode ?? 500;
    const isClientError = status < 500;

    if (!isClientError) {
      request.log.error({ err: error }, 'unhandled request error');
    }

    reply.status(status).send({
      error: {
        code: isClientError ? ERROR_CODES.VALIDATION_ERROR : ERROR_CODES.INTERNAL_ERROR,
        message: isProduction && !isClientError ? 'Internal server error' : error.message,
        requestId: request.id,
      },
    });
  });

  app.register(healthPlugin);

  return app;
}
```

- [ ] **Step 10: Run health tests to verify they pass**

Run: `pnpm --filter @takeover/api test`
Expected: PASS (all env and health tests).

- [ ] **Step 11: Implement `server.ts` process lifecycle**

`apps/api/src/server.ts`:

```ts
import { disconnectDatabase, isDatabaseInitialized } from '@takeover/database';
import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp(config);

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      app.log.warn({ signal }, 'second shutdown signal, forcing exit');
      process.exit(1);
    }
    shuttingDown = true;
    app.log.info({ signal }, 'shutdown started');

    try {
      await app.close();
      if (isDatabaseInitialized()) {
        await disconnectDatabase();
      }
      app.log.info({ signal }, 'shutdown complete');
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error('API failed to start:', error);
  process.exit(1);
});
```

- [ ] **Step 12: Typecheck and build the API**

Run: `pnpm --filter @takeover/api typecheck && pnpm --filter @takeover/api build`
Expected: no type errors, `apps/api/dist/server.js` exists.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(api): add validated config, health routes, and process lifecycle"
```

---

### Task 5: `apps/web` — minimal Next.js shell

**Files:**

- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/{layout.tsx,page.tsx,globals.css}`
- Create: `apps/web/src/lib/site.ts`
- Test: `apps/web/test/site.test.ts`

**Interfaces:**

- Consumes: `@takeover/shared` (proves the cross-workspace import path works)
- Produces: `SITE = { name: 'TakeOver', tagline: 'Own a piece of the internet.' }`, `buildPageTitle(pageName?: string): string`

Phase 0 adds no product UI. The one extracted function exists so the web app has real behavior under test rather than a snapshot.

- [ ] **Step 1: Create the manifest and configs**

`apps/web/package.json`:

```json
{
  "name": "@takeover/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@takeover/shared": "workspace:*",
    "next": "16.3.3",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.5",
    "tailwindcss": "4.3.3",
    "typescript": "5.9.3",
    "vitest": "4.1.11"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "@takeover/config/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    "test/**/*.ts",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@takeover/shared'],
};

export default nextConfig;
```

`apps/web/postcss.config.mjs`:

```js
const config = {
  plugins: { '@tailwindcss/postcss': {} },
};

export default config;
```

- [ ] **Step 2: Write the failing site test**

`apps/web/test/site.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SITE, buildPageTitle } from '../src/lib/site.js';

describe('buildPageTitle', () => {
  it('returns the branded title when no page name is supplied', () => {
    expect(buildPageTitle()).toBe('TakeOver — Own a piece of the internet.');
  });

  it('prefixes the page name', () => {
    expect(buildPageTitle('Leaderboard')).toBe('Leaderboard — TakeOver');
  });

  it('ignores whitespace-only page names', () => {
    expect(buildPageTitle('   ')).toBe('TakeOver — Own a piece of the internet.');
  });
});

describe('SITE', () => {
  it('carries the product tagline', () => {
    expect(SITE.tagline).toBe('Own a piece of the internet.');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @takeover/web test`
Expected: FAIL — cannot resolve `../src/lib/site.js`.

- [ ] **Step 4: Implement the site metadata helper**

`apps/web/src/lib/site.ts`:

```ts
export const SITE = {
  name: 'TakeOver',
  tagline: 'Own a piece of the internet.',
} as const;

/** Builds a document title. Falsy or whitespace-only page names fall back to the branded title. */
export function buildPageTitle(pageName?: string): string {
  const trimmed = pageName?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return `${SITE.name} — ${SITE.tagline}`;
  }
  return `${trimmed} — ${SITE.name}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @takeover/web test`
Expected: PASS.

- [ ] **Step 6: Create the Tailwind v4 stylesheet and app shell**

`apps/web/src/app/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --color-background: #0a0a0b;
  --color-surface: #111113;
  --color-border: #26262b;
  --color-foreground: #fafafa;
  --color-muted: #8a8a93;
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
}
```

Note: this is the minimal token set Phase 0 needs to render a styled shell. The full TakeOver design system (owner/challenger/contested/premium semantics, typography, radii) is specified in `docs/DESIGN.md` and implemented during the frontend milestone, not here.

`apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { SITE, buildPageTitle } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: buildPageTitle(),
  description: `${SITE.name} — a competitive marketplace where companies capture and defend internet territories.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx`:

```tsx
import { SITE } from '@/lib/site';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">{SITE.name}</h1>
      <p className="text-lg text-[var(--color-muted)]">{SITE.tagline}</p>
      <p className="text-sm text-[var(--color-muted)]">
        Foundation only. The territory board, capture flow, and empire views are not implemented
        yet.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Typecheck and produce a production build**

Run: `pnpm --filter @takeover/web build`
Expected: Next.js production build succeeds and generates `next-env.d.ts`.

Run: `pnpm --filter @takeover/web typecheck`
Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): add minimal next.js shell with tailwind v4 foundation"
```

---

### Task 6: Root test orchestration and API runtime smoke check

**Files:**

- Create: `vitest.config.ts` (root, workspace projects)
- Create: `scripts/smoke-api.mjs`

**Interfaces:**

- Consumes: `apps/api/dist/server.js` from Task 4
- Produces: `pnpm test` runs every workspace suite in one pass; `pnpm smoke:api` proves the compiled API serves both health endpoints and shuts down cleanly

- [ ] **Step 1: Create the root Vitest configuration**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/web'],
  },
});
```

Note: if Vitest 4 reports that a workspace lacks its own config, add a minimal `vitest.config.ts` to that workspace exporting `defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } })`. Record the final shape in `ARCHITECTURE.md`.

- [ ] **Step 2: Write the smoke check script**

`scripts/smoke-api.mjs`. It picks a free port, starts the compiled server, polls `/health` until it answers, asserts both endpoints, then terminates the process and asserts a clean exit.

```js
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';

/** Asks the OS for an unused port so the smoke check never collides with a dev server. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, attempts = 50) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response;
    } catch {
      // server not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API did not become healthy at ${baseUrl} within the timeout`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

let exitCode = 0;

try {
  const healthResponse = await waitForHealth(baseUrl);
  assert(healthResponse.status === 200, `/health returned ${healthResponse.status}`);
  const health = await healthResponse.json();
  assert(health.data.status === 'ok', `/health status was ${health.data.status}`);
  assert(typeof health.data.uptimeSeconds === 'number', '/health missing uptimeSeconds');

  const readyResponse = await fetch(`${baseUrl}/ready`);
  assert(readyResponse.status === 200, `/ready returned ${readyResponse.status}`);
  const ready = await readyResponse.json();
  assert(ready.data.status === 'ready', `/ready status was ${ready.data.status}`);
  assert(ready.data.checks.application === 'ok', '/ready did not report the application check');

  const notFound = await fetch(`${baseUrl}/definitely-not-a-route`);
  assert(notFound.status === 404, `unknown route returned ${notFound.status}`);
  const notFoundBody = await notFound.json();
  assert(notFoundBody.error.code === 'NOT_FOUND', 'unknown route did not use the error envelope');

  console.log('API smoke check passed: /health, /ready, and 404 envelope verified.');
} catch (error) {
  console.error('API smoke check failed:', error.message);
  exitCode = 1;
} finally {
  child.kill('SIGTERM');
  const closed = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 5000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  if (closed === 'timeout') {
    child.kill('SIGKILL');
    console.error('API did not shut down within 5s of SIGTERM.');
    exitCode = 1;
  } else if (closed !== 0) {
    console.error(`API exited with code ${closed} after SIGTERM (expected 0).`);
    exitCode = 1;
  } else {
    console.log('API shut down gracefully on SIGTERM with exit code 0.');
  }
}

process.exit(exitCode);
```

- [ ] **Step 3: Run the full test suite from the root**

Run: `pnpm test`
Expected: all shared, api, and web suites PASS in one invocation.

- [ ] **Step 4: Build, then run the smoke check**

Run: `pnpm build && pnpm smoke:api`
Expected: "API smoke check passed" and "API shut down gracefully on SIGTERM with exit code 0."

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add root test orchestration and api runtime smoke check"
```

---

### Task 7: The six canonical documents

**Files:**

- Create: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/RULES.md`, `docs/PHASES.md`, `docs/DESIGN.md`, `docs/MEMORY.md`

**Interfaces:**

- Consumes: the verified state produced by Tasks 1–6
- Produces: the shared documentation both agents read at session start

Every material architecture statement carries `IMPLEMENTED NOW`, `PLANNED`, or `UNVALIDATED / NEEDS REVIEW`. Nothing unbuilt may be described as working.

- [ ] **Step 1: Write `docs/PRD.md`**

Must cover, per the master product brief: target users; the core loop (see territory → want it → beat the price → capture it → defend it → build an empire); user journeys for visitor, company owner, and returning owner; territory discovery; company onboarding and verification; the takeover flow; empire building; ranking; seasons; battles; live feed; Hall of Fame; sharing; company dashboard; mobile; accessibility; onboarding; empty states; payment states; V1 scope; launch criteria; risks; success metrics; explicitly deferred capabilities.

Mark every product capability as `PLANNED` — Phase 0 implements none of them.

- [ ] **Step 2: Write `docs/ARCHITECTURE.md`**

Document what actually exists: the pnpm workspace layout, the five workspaces and their boundaries, the `app.ts` / `server.ts` split, config validation, the health/readiness contract and exactly which checks `/ready` performs, the shared envelope and money contracts, the Prisma ownership rule, the exact pinned versions and why (user decision, 2026-08-29: stable-only, no TS 7, no Prisma 8 RC, matched Prisma CLI/client), and the offline `prisma migrate diff` approach for the initial migration.

Record the frontend architecture decisions already approved, labeled `PLANNED`: server components by default; the `lib/data/*` data-access seam with a per-resource fixture/live switch; fixtures development-only and never imported in production; `@takeover/shared` as the single canonical source of domain contracts with `apps/web` allowed only clearly-separated presentation view models; `lib/realtime` as an interface boundary only, with no fabricated SSE/WebSocket connection; route structure; SEO and Open Graph plans; error and loading boundaries.

Include the Mermaid flows the spec requires, each labeled with its status.

- [ ] **Step 3: Write `docs/RULES.md`**

The engineering constitution: TypeScript strict, no `any` without written justification; naming; the money rule (integer minor units, no floating-point money); API envelope and error-code conventions; security (no secrets in browser-safe packages, redact authorization/cookie/credential fields, validate all runtime config, never leak stack traces in production); testing expectations; logging; migration discipline; environment handling; Git conventions.

Frontend rules from the approved design must be included verbatim in intent: reusable components; shared domain types from `@takeover/shared`; accessibility and keyboard interaction; responsive behavior; consistent spacing; **no fake successful transactions**; **no fake verified state**; **no frontend-generated financial, leaderboard, or ownership truth**; no permanent dependence on mock data; loading, error, and empty states for async views; buttons disabled during mutation; destructive actions get correct UX; no secrets in the browser; validate URL output; sanitize untrusted content including externally sourced brand colors.

- [ ] **Step 4: Write `docs/PHASES.md`**

Phases 0 through 9, each with objective, tasks, dependencies, status, acceptance criteria, tests, and risks. Phase 0 records its real verification results from Task 8 — including anything that could not be verified. Phases 1–9 are `PLANNED` and unstarted. Note explicitly that a frontend phase is never marked complete on static UI alone when real integration is required.

- [ ] **Step 5: Write `docs/DESIGN.md`**

This is the document that must preserve every approved frontend decision so none is lost:

- **Primary board direction: Value Mosaic, with restrained competitive/Throne Room accents.** (record verbatim)
- **Liveness direction: Ambient by default with event-driven bursts.** (record verbatim)
- Tile tiers: flagship 2×2, major 2×1, standard 1×1.
- `tierOf()` is a **temporary presentation heuristic only**; current price is not the permanent authoritative determinant of tile importance. An authoritative `displayWeight: number` is requested from Codex.
- **Mosaic position and physical adjacency carry no gameplay meaning.** Do not derive territory-neighbor rules from CSS layout.
- Mobile: ranked variable-size feed; do not preserve desktop geometry; no horizontal scrolling for the core board; premium territories stay visually larger; prioritize price, owner, and the TAKE OVER CTA.
- In-tile hierarchy: territory name → owner + logo → current value → minimum takeover price → TAKE OVER action → reign/competition metadata.
- Visual system: near-black ground, tight radii (4px tiles, 6px controls, pills for badges only), hairline 1px borders with 2px reserved for contested and owned-by-you, restrained owner accents that are decorative only and must be validated before use.
- Typography: Space Grotesk (display), Inter (body/UI), JetBrains Mono (prices, timers, ranks).
- Semantic color tokens: background, surface, raised surface, border, text, muted text, owner, challenger, contested, premium/crown, success, warning, destructive, unclaimed.
- Motion: communicates state change, never decoration; bursts settle in roughly 400–700ms; respect `prefers-reduced-motion`; never let information depend on animation alone; never block clicks or takeover actions; no layout shift; animate transform/opacity; only changed tiles re-render.
- Takeover honesty: the flow may implement select company → confirmation → pricing/fee presentation → payment-not-connected boundary, and must never visually imply payment success, ownership change, verification, or leaderboard movement before backend confirmation.
- Stale-price UX: explain the territory changed, show the new owner and current price, show the new minimum takeover amount, let the user review again, and never auto-charge a revised amount.
- Accessibility: keyboard navigation, visible focus, semantic buttons, accessible dialogs, heading hierarchy, readable contrast, aria labels where needed.

Mark the entire design system `PLANNED` — Phase 0 ships only the five-token shell from Task 5.

- [ ] **Step 6: Write `docs/MEMORY.md`**

Current state, contracts, commands, decisions, blockers, ownership boundaries, and both handoff directions. It must record:

- Phase 0 verification results, including anything unverified and why.
- The exact pinned versions and the stable-only decision.
- Ownership: Codex owns backend/database/payments/bidding/seasons engine; Claude owns frontend/product UX/design system.
- The fixture/live seam design and the rule that fixtures are development-only.
- **Claude → Codex requests**, each with the reason:
  - `displayWeight: number` on territory — authoritative presentation weight, so tile size is not permanently derived from current price in the frontend.
  - A real-time event stream (SSE preferred) for capture, dethrone, contested, empire-milestone, leaderboard-change, battle, and season events — `lib/realtime` currently defines only the integration boundary and fabricates nothing.
  - Takeover/payment endpoints, including the stale-price response shape carrying new owner, new current price, and new minimum takeover amount.
  - Territory history including `previousOwner.logoUrl`.
- The realtime dependency and the takeover/payment dependency as explicit blockers on the frontend milestone.

- [ ] **Step 7: Verify documentation formatting**

Run: `pnpm format:check`
Expected: passes. Run `pnpm format` first if needed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: add six canonical project documents"
```

---

### Task 8: Full Phase 0 acceptance verification

**Files:**

- Modify: `docs/PHASES.md`, `docs/MEMORY.md` (record real results)

**Interfaces:**

- Consumes: everything from Tasks 1–7
- Produces: an honest Phase 0 status

- [ ] **Step 1: Run every acceptance check and capture real output**

Run each and record the actual result:

```bash
pnpm install
pnpm --filter @takeover/web typecheck
pnpm --filter @takeover/api typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:validate
pnpm smoke:api
```

The smoke check covers criteria 8, 9 (API starts, `/health` and `/ready` respond correctly).

- [ ] **Step 2: Run the repository scan**

Confirm no prohibited dependencies and no placeholder product modules:

```bash
grep -rEn "redis|bullmq|stripe|razorpay|nodemailer|next-auth|@auth/|turbo" \
  --include=package.json --include=*.ts --include=*.tsx . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next
find apps packages -type d -empty -not -path "*/node_modules/*"
```

Expected: no dependency hits; no empty directories.

- [ ] **Step 3: Record results honestly**

Update `docs/PHASES.md` and `docs/MEMORY.md` with the actual output of each check. Any criterion that could not be verified because external infrastructure was unavailable is recorded as **explicitly unverified with its blocker stated**, and Phase 0 is not described as broadly complete.

Known expected limitation: applying migrations against a live PostgreSQL server (`prisma migrate deploy`) cannot be verified without a running database. Schema validation and client generation are verifiable offline; migration application is not. Record this rather than implying it works.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: record phase 0 verification results and remaining blockers"
```

---

## Self-Review

**1. Spec coverage.** Each spec requirement maps to a task:

| Spec requirement                                                          | Task                                     |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| Git init with `main`                                                      | Already done (commit `d071581`)          |
| pnpm workspace with five workspaces                                       | 1, 2, 3, 4, 5                            |
| Six canonical documents                                                   | 7                                        |
| Minimal Next 15+/React 19/TS/Tailwind v4 web app                          | 5                                        |
| Minimal Fastify API, `app.ts` / `server.ts` split                         | 4                                        |
| Runtime configuration validation                                          | 4                                        |
| Pino structured logging, redaction, request IDs                           | 4                                        |
| Graceful shutdown, exit codes                                             | 4                                        |
| Liveness and readiness endpoints                                          | 4, 6                                     |
| Shared contracts, constants, money primitives                             | 2                                        |
| PostgreSQL/Prisma config, client lifecycle, initial migration, validation | 3                                        |
| Strict TS, ESLint, Prettier, Vitest, root commands                        | 1, 6                                     |
| Verification of install/lint/test/build/prisma/startup/health             | 8                                        |
| Exclusions honored (no auth, payments, product models, Redis, queues)     | Global Constraints; verified in 8 Step 2 |

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Two implementation notes flag genuine tool-behavior uncertainty (Prisma 7 generator `output`, Vitest 4 project configs) and each states the exact fallback and requires recording the outcome — these are contingencies with defined resolutions, not deferred decisions.

**3. Type consistency.** Verified across tasks: `Money`/`moneySchema`/`createMoney`/`isMoney` (Task 2) are consumed unchanged; `ERROR_CODES` and `HEALTH_STATUS` (Task 2) are imported by `apps/api` (Task 4); `AppConfig`/`loadConfig` (Task 4 Step 4) match `buildApp(overrides: Partial<AppConfig>)` (Task 4 Step 9) and `server.ts` (Step 11); `getDatabaseClient`/`disconnectDatabase`/`isDatabaseInitialized` (Task 3) match the `server.ts` import; `SITE`/`buildPageTitle` (Task 5) match their test and `layout.tsx`.

**4. Scope check.** Single coherent foundation, no product subsystems. Phase 1 is explicitly out of scope.
