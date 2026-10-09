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

# initdb ve pg_ctl root'tan çalışmayı reddediyor, ve CI konteynerleri genelde
# root. Hangi kullanıcı adına çalışılacağı burada belirleniyor, çünkü yalnız
# başlatma değil **durdurma** da ona ihtiyaç duyuyor.
RUNAS=""
if [ "$(id -u)" = "0" ]; then
  id -u postgres >/dev/null 2>&1 || useradd -m postgres
  RUNAS="postgres"
fi

# Sunucuyu durdur.
#
# Bu fonksiyon bir kusurdan doğdu ve kusur sessizdi: `cleanup` doğrudan
# `pg_ctl` çağırıyordu, root'tan çalışmadığı için her koşum arkasında ayakta
# bir sunucu bırakıyordu, ve bir sonraki koşum `rm -rf` ile o sunucunun veri
# dizinini altından siliyordu. Sunucu çökerken socket'i götürüyor, göç
# uygulaması ortada kesiliyordu. Dışarıdan rastgele bir çökme gibi görünüyor;
# aslında her koşum bir sonrakini bozuyordu.
pg_stop() {
  [ -n "$PGBIN" ] || return 0
  if [ -n "$RUNAS" ]; then
    su "$RUNAS" -c "$PGBIN/pg_ctl -D $DATADIR -s -m immediate stop" >/dev/null 2>&1 || true
  else
    "$PGBIN/pg_ctl" -D "$DATADIR" -s -m immediate stop >/dev/null 2>&1 || true
  fi
}

cleanup() {
  if [ "$STARTED_SERVER" = "1" ]; then
    pg_stop
  fi
}
trap cleanup EXIT

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "$PGBIN" ]; then
    echo "PostgreSQL is not installed. Install it, or set DATABASE_URL to an existing database." >&2
    exit 1
  fi

  # Kalmış bir sunucu varsa önce o durdurulur: dizini altından silmek onu
  # çökertir ve bu koşum bir sonrakini bozar.
  [ -f "$DATADIR/postmaster.pid" ] && pg_stop

  rm -rf "$DATADIR" "$SOCKET"
  mkdir -p "$DATADIR" "$SOCKET"

  # Dizinler yeni oluştu; sahipliği o kullanıcıya geçmeli.
  if [ -n "$RUNAS" ]; then chown -R "$RUNAS" "$DATADIR" "$SOCKET"; fi

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

# Sütun listesi veritabanından alınıyor, migration metninden değil: 0003'ün
# yardımcıları sütunları `execute` ile ekliyor ve metni ayrıştıran bir araç
# onları göremez. Burada zaten uygulanmış bir şema var; kullanılmaması israf.
echo "→ schema dump"
# Döküm silinmiyor: `tests/populated.mjs` de aynı şemayı okuyor ve kendi
# Postgres'ini kurmak yerine burada zaten uygulanmış olanı kullanıyor. Aynı
# şemayı iki yerde kurmak, ikisinin ayrı düşmesine davetiyedir (§4).
SCHEMA_JSON="$ROOT/tests/db/schema.json"
psql "$DATABASE_URL" -At -c "
  with enums as (
    select t.typname, json_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid
     group by t.typname
  )
  select coalesce(json_agg(json_build_object(
           'table_name', c.table_name, 'column_name', c.column_name,
           'is_nullable', c.is_nullable, 'data_type', c.data_type,
           'udt_name', c.udt_name,
           'has_default', c.column_default is not null,
           'table_type', t.table_type,
           'enum_values', e.labels)), '[]')
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    left join enums e on e.typname = c.udt_name
   where c.table_schema = 'public';
" > "$SCHEMA_JSON"

echo "→ api column check"
node "$ROOT/tests/api-columns.mjs" "$SCHEMA_JSON"
