# Free pilot hosting

Research checked 2026-09-20. Recommended pilot: one Oracle Always Free ARM VM, PostgreSQL on its persistent volume, the existing Compose stack, and Caddy directly exposed to the internet. This is a deployment candidate, not an availability guarantee or completed deployment.

## Current limits and fit

- Oracle's current Always Free documentation lists **2 OCPUs / 12 GB RAM**, 200 GB combined boot/block storage, and 20 GB combined object storage for an Always Free-only account. Older 4-core/24-GB guidance is not the current free-tenancy allowance. Confirm the console's Always Free label and limits before provisioning. Home-region capacity may be unavailable; Oracle may reclaim idle instances. [Official limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- The VM approach keeps the existing always-running worker and PostgreSQL transactions. Production ARM build/runtime acceptance must still run on the selected VM; local x64 Docker success does not prove ARM acceptance.
- Render's free database expires after 30 days, making it unsuitable for persistent marketplace data. [Render free services](https://render.com/docs/free)
- Resend's free sending limit is 100 emails/day; sender-domain DNS verification is still required. A free web hostname is not automatically a usable email sender domain. [Pricing](https://resend.com/pricing), [domain verification](https://resend.com/docs/dashboard/domains/introduction)
- DuckDNS can provide a free web hostname. Its published update API supports address/TXT updates; verify all DNS records required by the email provider before treating this as a complete zero-cost signup solution. Use an existing domain you control if available. [DuckDNS API](https://www.duckdns.org/spec.jsp)

## Provisioning prerequisites

The account owner completes Oracle account verification and creates an Always Free eligible Ubuntu ARM VM within the displayed allowance. Do not enable paid upgrades or paid resources just to bypass capacity. Save the SSH private key locally; never paste it into chat. Provide the VM public IP, SSH user/key-file location, and selected public hostname for deployment.

Open inbound TCP 80/443 in both OCI network rules and the VM firewall. Restrict SSH to the administrator's address. Do not open 3000, 4000 or 5432 publicly. Point the hostname's DNS to the VM. Use DNS-only if managing it through Cloudflare; the supplied Caddy forwarding boundary assumes direct client traffic.

## Reproducible deployment

Install Docker Engine and its Compose plugin using [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Clone the reviewed commit onto the VM. Create a private `.env` (mode 600), with a strong URL-safe `POSTGRES_PASSWORD`, independent random `TOKEN_HMAC_SECRET`, `SITE_DOMAIN` (hostname only), and `WEB_APP_ORIGIN=https://<hostname>`. Keep `DODO_LIVE_ENABLED=false`; configure Resend and Dodo sandbox using the existing runbooks.

```sh
docker compose -f compose.yaml -f compose.edge.yaml config --quiet
docker compose -f compose.yaml -f compose.edge.yaml build
docker compose -f compose.yaml -f compose.edge.yaml up -d
docker compose exec api node packages/database/dist/territory-seed-cli.js
```

The overlay runs Caddy on the Linux host network so it reaches the loopback web port. Its persistent volumes retain certificate state. Caddy terminates TLS and replaces forwarding headers; API trust stays limited to the dedicated web address. [Automatic HTTPS](https://caddyserver.com/docs/automatic-https), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

Confirm HTTPS, secure management-cookie exchange, two-client IP separation, SSE reconnect, Dodo sandbox webhooks/refunds, operator denial/audited recovery, and no secret-bearing logs using `docs/LAUNCH.md`. Public page availability alone does not establish functional email or payment acceptance.

## Backups and recovery

Run `bash deploy/backup.sh` from a scheduled job; it creates a private custom-format PostgreSQL archive, checks readability, and writes a SHA-256 checksum. Set `BACKUP_DIR` outside the checkout if preferred. Copy each successful archive to private off-host object storage through an independently configured OCI service identity. Apply bounded retention within the account's free storage allowance; do not delete the only successful backup.

Restore a copied archive into a **new disposable database** with `pg_restore --exit-on-error --no-owner`; compare table counts and migration history, then rehearse application reads against that restored database. Record the recovery duration. Alerts must reach the operator when backup upload, restore verification, health or reconciliation fails. Until off-host upload and a restore drill succeed, the production backup gate remains open.
