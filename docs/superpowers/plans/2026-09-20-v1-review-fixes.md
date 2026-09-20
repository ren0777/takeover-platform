# V1 review fixes and acceptance

User authorization: continue the reviewed fixes and verify existing changes before pushing and deploying. Preserve the four existing web/Compose/runbook edits.

## Design

Recovery approval uses the independent recovery deadline; expiration of the original access request does not prevent reviewed recovery. Expired takeover intents stay expired. Keep transaction, authority, version and audit checks. The actionable recovery queue excludes expired/resolved entries and supports bounded stable pagination plus exact inspection.

Client IP forwarding is disabled by default. Configure exact trusted proxy IP addresses, with a dedicated Compose web/API network and a stable web address. The public TLS proxy must replace incoming forwarding headers. Do not trust arbitrary client headers or an entire Docker network.

## Execution

- [ ] Add failing recovery regression tests; implement the bounded operator/shared-contract changes; run operator PostgreSQL tests against the existing disposable test database.
- [ ] Add failing configuration/client-IP tests; configure exact proxy addresses; preserve local port override and compiled seed command; verify separate client IPs and spoof rejection.
- [ ] Run typecheck, lint, unit, sequential PostgreSQL integration, build and production smoke checks.
- [ ] Rebuild the local Compose application and inspect public pages, navigation, live API reads, SSE and unavailable-provider behavior. Keep paid/email/provider validation distinct from local success.
- [ ] Refresh repository memory/status with current evidence. Review the resulting diff; push/deploy only after functional acceptance and deployment target/provider configuration are available.

No database schema reset is needed. Use only the disposable test DB for fixture-mutating suites. Do not expose credentials or change provider/live-payment settings to manufacture a successful launch.
