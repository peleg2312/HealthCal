#!/usr/bin/env bash
# Runs supabase/migrations against a throwaway local PostgreSQL and checks the
# row-level security and sync functions. Needs PostgreSQL 15+ binaries on the machine.
#   bash scripts/dev/test-sql.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$(dirname "$(find /usr/lib/postgresql /usr/local /opt/homebrew -name initdb -type f 2>/dev/null | sort | tail -1)")"
[ -x "$BIN/initdb" ] || { echo "PostgreSQL server binaries not found"; exit 2; }
WORK="$(mktemp -d)"
PORT=54329
RUN=""
# PostgreSQL refuses to run as root; use the postgres system user when we are root.
if [ "$(id -u)" = "0" ]; then chown postgres "$WORK"; RUN="runuser -u postgres --"; fi
cleanup() { $RUN "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

$RUN "$BIN/initdb" -D "$WORK/data" -A trust -U postgres >/dev/null
$RUN "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -c listen_addresses='' -k $WORK" -l "$WORK/log" -w start >/dev/null
PSQL="psql -h $WORK -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database healthcal" postgres
$PSQL -f "$ROOT/supabase/tests/stub_auth.sql" healthcal
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f" healthcal; done
# Applying the migration twice must be harmless.
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f" healthcal; done
$PSQL -f "$ROOT/supabase/tests/policies_and_sync.sql" healthcal
$PSQL -f "$ROOT/supabase/tests/friends.sql" healthcal
$PSQL -f "$ROOT/supabase/tests/friends_meals.sql" healthcal
