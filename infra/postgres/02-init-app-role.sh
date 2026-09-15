#!/bin/sh
# Creates the unprivileged role the application connects as.
#
# ## Why the application must not connect as POSTGRES_USER
#
# `verixa` is this cluster's superuser, and **PostgreSQL superusers bypass row
# level security entirely**. Not "are exempt from some policies" — RLS is not
# consulted at all. So every tenant-isolation policy in
# 20260904033449_enable_row_level_security is, for a superuser connection,
# decoration.
#
# `FORCE ROW LEVEL SECURITY` on those tables closes the *owner* half of this
# (an owner is otherwise exempt from their own tables' policies) but it does
# nothing about superusers. Both halves have to be closed, and this is the
# other one.
#
# The consequence is easy to miss and expensive to discover: with the API
# connected as a superuser, a bug that forgot to set
# `app.current_organization_id` would read across every tenant and no test
# would fail, because the policy that should have stopped it was never
# evaluated. Multi-tenancy would appear to work right up until it mattered.
#
# ## The split
#
# - `verixa` (superuser, owner) runs migrations. DDL needs it.
# - `verixa_app` (NOSUPERUSER, NOBYPASSRLS) runs the application. DML only,
#   and fully subject to RLS.
#
# Two roles, not one with conditional privileges, because "which connection is
# this" is then answerable from the connection string rather than from
# reasoning about code paths.
#
# ## Ordering
#
# Runs after 01-init-test-db.sh — hence the numeric prefix, since
# docker-entrypoint-initdb.d executes in filename order — because the grants
# below have to be applied inside `verixa_test` as well, and that database
# does not exist until the previous script creates it.
#
# ## When this runs
#
# Only on **first** container start, when the data directory is empty. An
# existing volume will not pick it up: `docker compose down -v` first. See
# docs/guides/database.md.
set -e

# Role creation is cluster-scoped and idempotent-guarded, so re-running
# against an existing cluster is harmless rather than fatal.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verixa_app') THEN
        CREATE ROLE verixa_app LOGIN PASSWORD 'verixa_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF;
    END
    \$\$;
EOSQL

# Privileges are per-database, so both need the same treatment.
#
# The ALTER DEFAULT PRIVILEGES line is the one that matters for the future:
# GRANT ... ON ALL TABLES only covers tables that exist *now*, and every table
# in this schema is created by a migration that has not run yet at init time.
# Without it, the first migration after setup would produce tables the
# application cannot read, presenting as a permission error nobody connects
# back to this file.
for db in "$POSTGRES_DB" verixa_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
      GRANT CONNECT ON DATABASE "$db" TO verixa_app;
      GRANT USAGE ON SCHEMA public TO verixa_app;

      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO verixa_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO verixa_app;

      ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO verixa_app;
      ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO verixa_app;

      -- Deliberately no CREATE on the schema. The application never issues
      -- DDL; if it ever appears to need to, that is a migration that went
      -- missing, not a privilege that should be granted.
      REVOKE CREATE ON SCHEMA public FROM verixa_app;
EOSQL
done
