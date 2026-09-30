#!/usr/bin/env bash
#
# Applies the migrations to a throwaway Postgres and runs the policy tests
# against them. No Supabase project needed: bootstrap.sql stands in for the
# auth primitives, and RLS is plain Postgres underneath.
#
# Usage:  npm run test:policies
#
# Set DATABASE_URL to run against an existing database instead of starting one.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
DATADIR="${TMPDIR:-/tmp}/miu-policy-test-pgdata"
SOCKET="${TMPDIR:-/tmp}/miu-policy-test-sock"
PORT="${PGPORT:-55432}"
STARTED_SERVER=0

cleanup() {
  if [ "$STARTED_SERVER" = "1" ]; then
    "$PGBIN/pg_ctl" -D "$DATADIR" -s -m immediate stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "$PGBIN" ]; then
    echo "PostgreSQL is not installed. Install it, or set DATABASE_URL to an existing database." >&2
    exit 1
  fi

  rm -rf "$DATADIR" "$SOCKET"
  mkdir -p "$DATADIR" "$SOCKET"

  # initdb refuses to run as root, which is how CI containers usually run.
  RUNAS=""
  if [ "$(id -u)" = "0" ]; then
    id -u postgres >/dev/null 2>&1 || useradd -m postgres
    chown -R postgres "$DATADIR" "$SOCKET"
    RUNAS="postgres"
  fi

  run() {
    if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$*"; else eval "$*"; fi
  }

  run "$PGBIN/initdb -D $DATADIR -U postgres --auth=trust" >/dev/null
  run "$PGBIN/pg_ctl -D $DATADIR -o '-p $PORT -k $SOCKET -c listen_addresses=' -w start" >/dev/null
  STARTED_SERVER=1

  export DATABASE_URL="postgresql://postgres@localhost:$PORT/postgres?host=$SOCKET"
fi

psql_q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo "→ auth shim"
psql_q -f "$ROOT/tests/db/bootstrap.sql" >/dev/null

echo "→ migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  psql_q -f "$f" >/dev/null
done

echo "→ seed"
psql_q -f "$ROOT/tests/db/seed.sql" >/dev/null

echo "→ policy tests"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/db/policies.test.sql" 2>&1 |
  sed -e 's/^NOTICE:  //' -e '/^$/d'
