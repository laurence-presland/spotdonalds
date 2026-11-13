#!/usr/bin/env bash
# Apply every migration, then apply them again, against the database in PG*.
# A stub auth schema is created first so vanilla Postgres 15+ can run the files.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
psql=(psql -v ON_ERROR_STOP=1 --no-psqlrc)

echo "stub auth"
"${psql[@]}" -f "$root/supabase/ci/auth-stub.sql"

apply() {
  local pass="$1"
  for file in "$root"/supabase/migrations/*.sql; do
    echo "$pass $(basename "$file")"
    "${psql[@]}" -f "$file"
  done
}

apply apply
apply reapply

echo "check"
"${psql[@]}" -f "$root/supabase/ci/check.sql"
echo "migrations ok"
