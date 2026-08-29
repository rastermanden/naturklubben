#!/usr/bin/env bash
#
# Afspiller hele migrationskæden mod en tom Postgres og kører pgTAP-testene
# ovenpå. Bruges af ci.yml mod en supabase/postgres-service-container.
#
# Forbindelsen styres af de sædvanlige PG*-miljøvariable (PGHOST, PGPORT,
# PGUSER, PGPASSWORD, PGDATABASE). Scriptet rører aldrig produktion: det skriver
# kun til den database, PG*-variablene peger på, og CI peger dem på en
# engangscontainer.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tests_dir="$repo_root/supabase/tests"
migrations_dir="$repo_root/supabase/migrations"

if ! command -v psql >/dev/null 2>&1; then
  echo "::error::psql findes ikke på PATH -- installer postgresql-client" >&2
  exit 1
fi

run_sql() {
  psql --no-psqlrc --quiet --tuples-only --no-align \
    --set ON_ERROR_STOP=1 "$@"
}

echo "==> Venter på databasen"
for attempt in $(seq 1 60); do
  if psql --no-psqlrc --quiet --command 'select 1' >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "::error::Databasen svarede ikke inden for 60 sekunder" >&2
    exit 1
  fi
  sleep 1
done

echo "==> Opretter det minimale Supabase-platformsskema"
run_sql --file "$tests_dir/00_platform.sql"

echo "==> Afspiller migrationer"
shopt -s nullglob
migrations=("$migrations_dir"/*.sql)
shopt -u nullglob
if [ ${#migrations[@]} -eq 0 ]; then
  echo "::error::Fandt ingen migrationer i $migrations_dir" >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  # Supabase kører hver migration i én transaktion. Samme her, så en migration
  # der fejler halvvejs ikke efterlader et halvt skema til de næste.
  if ! run_sql --single-transaction --file "$migration"; then
    echo "::error file=supabase/migrations/$(basename "$migration")::Migrationen kunne ikke køres" >&2
    exit 1
  fi
  echo "    $(basename "$migration")"
done
echo "    ${#migrations[@]} migrationer afspillet"

echo "==> Installerer pgTAP og testhjælpere"
run_sql --file "$tests_dir/01_helpers.sql"

echo "==> Kører pgTAP-tests"
failed=()
shopt -s nullglob
suites=("$tests_dir"/rls/*.sql)
shopt -u nullglob
if [ ${#suites[@]} -eq 0 ]; then
  echo "::error::Fandt ingen testfiler i $tests_dir/rls" >&2
  exit 1
fi
for suite in "${suites[@]}"; do
  name="$(basename "$suite")"
  echo "--- $name"
  # Hver fil er sin egen transaktion, der rulles tilbage til sidst. En fejlende
  # fil stopper ikke de øvrige -- hele billedet er mere værd end den første fejl.
  status=0
  output="$(run_sql --file "$suite" 2>&1)" || status=$?
  printf '%s\n' "$output"
  if [ "$status" -ne 0 ]; then
    failed+=("$name")
  elif printf '%s\n' "$output" | grep -q 'Looks like you planned'; then
    # pgTAP melder et forkert plan-tal som en kommentar og går alligevel ud med
    # 0. En fil, hvor plan og assertions ikke stemmer, kan miste en assertion,
    # uden at nogen opdager det -- så den tæller også som en fejl her.
    echo "::error file=supabase/tests/rls/$name::plan() passer ikke med antallet af assertions" >&2
    failed+=("$name")
  fi
done

if [ ${#failed[@]} -gt 0 ]; then
  echo "::error::pgTAP-tests fejlede: ${failed[*]}" >&2
  exit 1
fi

echo "==> Alle pgTAP-tests bestået"
