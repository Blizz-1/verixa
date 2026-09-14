#!/usr/bin/env bash
#
# Restores a dump created by db-backup.sh (Issue 057).
#
#   pnpm db:restore                 -> restores the most recent dump
#   pnpm db:restore my-label        -> restores backups/my-label.dump
#
# DESTRUCTIVE: drops and recreates every object in the target database.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://verixa:verixa@localhost:5432/verixa}"
BACKUP_DIR="${BACKUP_DIR:-backups}"

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "error: pg_restore not found. Install the Postgres client tools." >&2
  exit 1
fi

if [ $# -ge 1 ]; then
  SOURCE="${BACKUP_DIR}/$1.dump"
else
  SOURCE="$(ls -1t "${BACKUP_DIR}"/*.dump 2>/dev/null | head -n 1 || true)"
fi

if [ -z "${SOURCE}" ] || [ ! -f "${SOURCE}" ]; then
  echo "error: no dump found${1:+ named '$1'} in ${BACKUP_DIR}/." >&2
  exit 1
fi

# Refuse anything that isn't unmistakably a local database. A restore drops
# every existing object, so pointing this at a shared environment by way of a
# stale DATABASE_URL would be unrecoverable. The guard is deliberately dumb
# and strict: it is protecting against a tired mistake, not an adversary.
HOST="$(printf '%s' "${DATABASE_URL}" | sed -E 's#.*://[^@]*@([^:/]+).*#\1#')"
case "${HOST}" in
  localhost|127.0.0.1|postgres|::1) ;;
  *)
    echo "error: refusing to restore into non-local host '${HOST}'." >&2
    echo "This drops every object in the target database. If you are certain," >&2
    echo "run pg_restore directly and take responsibility explicitly." >&2
    exit 1
    ;;
esac

echo "Restoring ${SOURCE} into ${DATABASE_URL}"

# --clean --if-exists drops existing objects first, so the result is the dump's
# state rather than the dump merged on top of whatever was already there.
# --single-transaction makes the whole restore atomic: a failure halfway
# leaves the database as it was instead of half-restored, which is the state
# that turns a bad afternoon into a bad week.
pg_restore \
  --clean --if-exists \
  --no-owner --no-privileges \
  --single-transaction \
  --dbname="${DATABASE_URL}" \
  "${SOURCE}"

echo "Restored. Verify with: pnpm --filter @verixa/database exec prisma migrate status"
