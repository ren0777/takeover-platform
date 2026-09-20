#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run from the checkout, or point TAKEOVER_ROOT at it. No credentials in arguments.
repo_dir="${TAKEOVER_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
backup_dir="${BACKUP_DIR:-${repo_dir}/backups}"
mkdir -p -- "$backup_dir"
backup_dir="$(cd -- "$backup_dir" && pwd)"
archive="${backup_dir}/takeover-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
trap 'rm -f -- "${archive}.partial"' EXIT
cd -- "$repo_dir"
docker compose exec -T database pg_dump -U takeover -d takeover -Fc > "${archive}.partial"
docker compose exec -T database pg_restore --list < "${archive}.partial" > /dev/null
mv -- "${archive}.partial" "$archive"
sha256sum -- "$archive" > "${archive}.sha256"
printf '%s\n' "$archive"

# Upload this archive to a private off-host bucket using a separately configured
# OCI CLI/service identity. A local dump alone is not an off-host backup.
