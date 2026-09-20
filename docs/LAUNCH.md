# V1 launch and recovery runbook

This repository can be built and tested locally without external provider credentials. A software test pass does not establish payment-provider, email-delivery or production operational readiness.

## Repeatable local acceptance

Use Node 24 and `pnpm` 10.32.1 directly. The Windows global Corepack wrapper was observed launching an incompatible nested pnpm; the direct pnpm launcher selected the pinned version correctly.

```powershell
pnpm install --frozen-lockfile
docker compose -f compose.test.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://takeover_test:takeover_test_local@127.0.0.1:55440/takeover_v1_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:TAKEOVER_ALLOW_TEST_DATABASE_RESET = 'true'
pnpm db:generate
pnpm db:test:prepare
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
$env:TAKEOVER_API_ORIGIN = 'http://127.0.0.1:4000'
$env:TAKEOVER_LIVE_RESOURCES = 'all'
$env:NEXT_PUBLIC_SITE_URL = 'https://takeover.example'
pnpm build
pnpm smoke:api
```

The reset command is only for the disposable test database. Integration suites may truncate fixture tables; do not run multiple suites concurrently against one database. `compose.test.yaml` stores data in tmpfs; stopping/removing its container discards that test data. Unit tests do not need PostgreSQL. The production smoke test requires a migrated database and checks actual database readiness.

## Deployment

`compose.yaml` provides PostgreSQL, an explicit migration job, API and web services. The database and API are internal; the web listener binds to loopback for a separately configured HTTPS reverse proxy. Set `WEB_PORT` in `.env` if the default 3000 is unavailable; Windows commonly reserves it for Hyper-V/WinNAT (`netsh interface ipv4 show excludedportrange protocol=tcp`). Configure a domain, TLS, ingress request/connection limits, alert routing, and backups before public traffic.

1. Create a private `.env` from `.env.example`. Set a URL-safe `POSTGRES_PASSWORD`, public HTTPS `WEB_APP_ORIGIN`, matching `NEXT_PUBLIC_SITE_URL`, independent random 32-byte base64url `TOKEN_HMAC_SECRET`, and provider configuration. Never place secrets in public web variables.
2. Configure Resend as described in [EMAIL.md](EMAIL.md). `EMAIL_PROVIDER=unavailable` deliberately prevents mail and is suitable only before delivery acceptance.
3. Configure Dodo **test** API key, Standard Webhooks secret and JSON currency/product mapping. Subscribe the provider to the public `/api/payment/webhooks/dodo` URL. Run the sandbox matrix below. The software does not create products or send test payments automatically.
4. Configure an independent operator ID/credential as described in [OPERATIONS.md](OPERATIONS.md); start with read-only permission.
5. Build with `docker compose build`. Rehearse forward migrations on a restored database, back up the deployment database, then run `docker compose up -d` during the maintenance window. The API waits for successful migration completion.
6. Apply the reviewed deterministic territory seed once using `docker compose exec api node packages/database/dist/territory-seed-cli.js`. The image runs as a non-root user with read-only build output, so use the compiled CLI rather than the `db:seed:territories` script, which rebuilds first. This creates no fictional owners.
7. Check the internal `/ready`, public pages, management email exchange, SSE reconnect and operator denial before accepting traffic. Keep the API inaccessible except through the trusted deployment network.

The Dodo base URLs are independently documented by its [official TypeScript client](https://github.com/dodopayments/dodopayments-typescript/blob/main/src/client.ts). Live mode requires both the live host and `DODO_LIVE_ENABLED=true`. Keep it false until sandbox, financial-policy and operational acceptance is signed off. Disabling new checkout by removing Dodo configuration also disables provider reconciliation, so during an incident prefer disabling affected territories while leaving webhook/refund processing active.

## Required sandbox matrix

### Client IP boundary

Compose gives the web service `172.30.85.3` on a dedicated `web-api` network; the API trusts only that exact address. Outside Compose, set `API_TRUSTED_PROXIES` to a comma-separated list of exact IPv4/IPv6 proxy addresses. Blank means forwarding headers are ignored. If this subnet overlaps your host network, update the subnet, both service addresses and the trusted address together.

The public TLS reverse proxy must **replace** inbound `X-Forwarded-For` with the actual socket client address before forwarding to the loopback web listener. For nginx directly facing clients, use `proxy_set_header X-Forwarded-For $remote_addr;`, `proxy_set_header X-Forwarded-Proto $scheme;` and `proxy_set_header Host $host;`. With a CDN/load balancer, validate its documented trusted-source chain first. Never expose the web listener directly or trust arbitrary forwarding headers. This keeps per-IP email and token limits separate across visitors. See [Fastify proxy trust](https://fastify.dev/docs/latest/Reference/Server/#trustproxy).

Before opening traffic, verify two real client addresses get separate rate-limit buckets and a client-supplied forwarding header cannot choose its bucket. The API is internal-only; do not publish its port.

### Payment provider cases

Record provider event IDs, internal checkout/payment IDs and outcome timestamps, without recording secrets or bearer links. Exercise successful capture; failed/cancelled payment; intermediate processing then success; duplicate event delivery; wrong money/reference; two concurrent bidders; stale ownership; refund pending/succeeded/failed; retry after an unknown provider response; late webhooks after refund. Verify one capture and at most one provider refund. Unit/mocked transport tests do not substitute for this matrix.

## Monitoring and incidents

- Poll `/health` for process liveness and `/ready` for database connectivity. Readiness returns 503 on a failed or timed-out database probe. Alert on sustained failure, process restarts and non-2xx webhook responses.
- Alert on `request.failed`, `takeover.reconciliation.startup_failed`, reconciliation driver failures and `Season rollover failed` logs. Send structured logs to the selected operator system; no destination is configured by this repository.
- Inspect pending reconciliation actions via the read-only operator API. Never clear `CLAIMED_` refund references or retry a provider POST manually after an unknown outcome. The existing reconciliation worker owns lookup/retry.
- For abuse, disable the affected territory or suspend the company with a reviewed reason; retain ownership and financial history. Revoke compromised grants and operator credentials. Do not expose operator credentials in browser storage.
- SSE clients replay committed sequence IDs, reconnect after a bounded stream lifetime, and show a reconnecting state on disconnection. Validate that the ingress does not buffer the stream and supports its connection count.
- Treat a sustained rollback/constraint error as an incident, preserve evidence, stop new affected checkouts, and inspect the authoritative database before repair. There is intentionally no generic financial repair endpoint.

## Backup and restore

Use an encrypted off-host backup destination and deployment-specific retention. Neither is provisioned here. Rehearse the following against a **new** isolated database; never overwrite an active application database.

Example container-side backup (avoids PowerShell corrupting a binary dump through text redirection):

```powershell
docker compose exec -T database pg_dump -U takeover -d takeover -Fc -f /tmp/takeover-backup.dump
$dbContainer = docker compose ps -q database
docker cp "${dbContainer}:/tmp/takeover-backup.dump" './takeover-backup.dump'
```

Move the file into the approved encrypted backup store; keep it outside Git. To rehearse, copy it into an isolated PostgreSQL 17 container, create a new database whose name ends in `_restore_test`, and run `pg_restore --exit-on-error --no-owner -U <test-user> -d <new-test-db> /tmp/takeover-backup.dump`. Check migration history, ownership uniqueness/overlap constraints, frozen season immutability, row counts, and application readiness against the restored database. Record elapsed recovery time and the backup timestamp; agree RPO/RTO with the deployment owner.

Rollback means restoring the prior application image only when compatible with the forward schema. Do not reverse financial/ownership migrations ad hoc. For incompatible schema changes, isolate traffic, restore to a new database, reconcile provider events since the backup, and explicitly approve cutover.

## External acceptance record

These must have real evidence before launch: verified sender delivery, Dodo sandbox matrix, HTTPS ingress/SSE behavior, secret rotation, off-host backup recovery, delivered alerts, expected-load/soak results, refund/moderation/privacy policies, and named incident ownership. They remain unvalidated until filled with deployment-specific evidence.
