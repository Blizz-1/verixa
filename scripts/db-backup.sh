#!/usr/bin/env bash
#
# Dumps the local development database (Issue 057).
#
#   pnpm db:backup              -> backups/verixa-<timestamp>.dump
#   pnpm db:backup my-label     -> backups/my-label.dump
#
# Local and development use only. Production backup strategy — scheduling,
# offsite retention, encryption, PITR — is Phase 20 and is not this script.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://verixa:verixa@localhost:5432/verixa}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
LABEL="${1:-verixa-$(date -u +%Y%m%d-%H%M%S)}"
TARGET="${BACKUP_DIR}/${LABEL}.dump"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "error: pg_dump not found." >&2
  echo "Install the Postgres client tools, or run inside the compose stack:" >&2
  echo "  docker compose exec postgres pg_dump ... " >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# --format=custom, not plain SQL. The custom format is compressed, and it is
# the only format pg_restore can restore *selectively* from (single table,
# schema-only, data-only) or in parallel. A plain .sql dump can only be
# replayed start to finish, which is exactly the wrong property at the moment
# you need it most.
pg_dump --format=custom --no-owner --no-privileges --file="${TARGET}" "${DATABASE_URL}"

echo "Wrote ${TARGET} ($(du -h "${TARGET}" | cut -f1))"
echo
echo "A backup you have never restored is not a backup. Verify it:"
echo "  pnpm db:restore ${LABEL}"
