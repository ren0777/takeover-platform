# Operator API runbook

The V1 operator API is a server-side emergency and moderation surface. It accepts only an independently configured bearer credential. Company-management cookies have no operator authority. Keep the credential in a managed secret store or a temporary shell environment; never place it in browser storage, URLs, logs, screenshots, or source control.

Required runtime configuration supplied to `registerOperatorRoutes`:

- `operatorId`: stable UUID identifying the human or controlled operator identity written to `AuditLog.actorId`.
- `credential`: independently generated value with at least 32 random bytes (43 base64url characters). Startup fails closed for missing or weak values.
- `permissions`: `read`, `moderate`, or both. `moderate` does not imply `read`.

Generate a credential with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Store it as `OPERATOR_CREDENTIAL` in the deployment secret manager. Set `OPERATOR_ID`, `OPERATOR_CREDENTIAL` and comma-separated `OPERATOR_PERMISSIONS`; the API validates and registers these routes only when configured.

Set the secret only for the current PowerShell process before calling the API:

```powershell
$env:OPERATOR_CREDENTIAL = '<secret-from-password-manager>'
$headers = @{ Authorization = "Bearer $env:OPERATOR_CREDENTIAL" }
Invoke-RestMethod -Headers $headers -Uri 'https://api.example.com/api/operator/recovery-requests?limit=50'
```

Company, territory and management-grant targets are available at `/api/operator/companies`, `/api/operator/territories`, `/api/operator/management-grants` and their `/:id` detail routes. Each exposes the exact `updatedAt` for reviewed mutations. Other read endpoints are bounded to 100 newest rows: `/api/operator/audit-logs`, `/api/operator/payments`, `/api/operator/reconciliation-actions`, and `/api/operator/recovery-requests`. These inspect state only. They do not edit amounts, payment status, ownership, or provider reconciliation claims.

Before a mutation, fetch and review the exact target and copy its `updatedAt` value. Every mutation requires a 10–500 character reason and `expectedUpdatedAt`; a concurrent change returns HTTP 409. Example:

```powershell
$body = @{ reason = 'Confirmed policy violation ticket INC-1234'; expectedUpdatedAt = '2026-09-20T10:00:00.000Z' } | ConvertTo-Json
Invoke-RestMethod -Method Post -ContentType 'application/json' -Headers $headers -Body $body -Uri 'https://api.example.com/api/operator/companies/<uuid>/suspend'
```

Available state transitions are company `suspend`/`restore`, territory `disable`/`enable`, management-grant `revoke`, and recovery-request `decision`. Grant revocation also revokes all sessions for that grant. Recovery decisions accept `decision: approve|reject` only for an unexpired `PENDING` recovery request at the reviewed version. Approval grants management access to the verified requester and does not revoke other managers, alter payments, or transfer territory ownership. Review identity evidence and an external support ticket before approval.

After a mutation, verify the returned state and locate the corresponding `operator.*` audit entry. Preserve the request ID and audit ID in the incident ticket. If a mutation returns 409, repeat the read and review; do not replace the version with a newer value without reviewing the changed record.

Recovery resolution is persisted as `RESOLVED` plus `APPROVED`/`REJECTED` on the access request. Approval rechecks a verified non-revoked contact and active company, revokes all prior sessions and pending emailed challenges for the reactivated grant, and leaves the requester to obtain a fresh management link. It never revives expired/cancelled takeover intents.
