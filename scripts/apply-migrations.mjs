/**
 * Applies the migrations to a Supabase project over the Management API.
 *
 * This exists because the two normal routes can both be closed at once.
 * `supabase link` needs an account with privileges on the project's settings,
 * and `supabase db push --db-url` needs a Postgres connection — which a
 * container that allows only outbound 443 does not have. The Management API is
 * HTTPS, so it is reachable when neither of those is.
 *
 * Each migration is sent as one request. A multi-statement simple query runs
 * inside a single implicit transaction, so a migration either lands whole or
 * not at all, and nothing here adds `begin`/`commit` of its own — doing that
 * is what made a truncated paste report success earlier.
 *
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token, or a fine-grained one
 * with database write on the project).
 *
 * Usage:
 *   node scripts/apply-migrations.mjs --project <ref> --verify
 *   node scripts/apply-migrations.mjs --project <ref> --from 4
 *   node scripts/apply-migrations.mjs --project <ref> --only 3
 *   node scripts/apply-migrations.mjs --project <ref> --admin you@example.com
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? true) : fallback;
};

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set.');
  process.exit(1);
}

const ref = flag('project', process.env.SUPABASE_PROJECT_REF);
if (!ref) {
  console.error('Pass --project <ref>, or set SUPABASE_PROJECT_REF.');
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

/** One request, one implicit transaction. Errors come back with a message. */
async function run(sql, { readOnly = false } = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && (body.message ?? body.error)) ||
      (typeof body === 'string' ? body : res.statusText);
    throw new Error(`${res.status} ${message}`);
  }
  return body;
}

const one = (rows, column) => (Array.isArray(rows) && rows.length > 0 ? rows[0][column] : null);

async function tableCount() {
  const rows = await run(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    { readOnly: true },
  );
  return one(rows, 'n');
}

async function verify() {
  console.log(`project  ${ref}`);
  console.log(`tables   ${await tableCount()}`);

  const applied = await run(
    `select coalesce(string_agg(version, ', ' order by version), '(none)') as v
     from supabase_migrations.schema_migrations`,
    { readOnly: true },
  ).catch(() => null);
  console.log(`history  ${applied ? one(applied, 'v') : '(no migration history table)'}`);

  // Which of the tables each phase introduced are actually there — a faster
  // read than counting, because it says which phase stopped.
  const probes = {
    'M1 identity': 'profiles',
    'M1 delegation': 'emergency_delegations',
    'M4 stakeholders': 'stakeholders',
    'M3 meetings': 'meetings',
    'M2 obligations': 'obligations',
    'M9 documents': 'document_versions',
    'M7 site': 'site_tasks',
    'M8 money': 'payment_vouchers',
    'M6 risk': 'risks',
  };
  for (const [label, table] of Object.entries(probes)) {
    const rows = await run(`select to_regclass('public.${table}') is not null as present`, {
      readOnly: true,
    });
    console.log(`  ${one(rows, 'present') ? '✓' : '✗'} ${label.padEnd(16)} ${table}`);
  }
}

async function applyFrom(from, only = null) {
  const all = readdirSync(migrationsDir)
    .filter((n) => /^\d{4}_.*\.sql$/.test(n))
    .sort();
  // `--only` exists because migrations do not always get applied in order in
  // the wild: this project had 0001, 0002 and 0004 in but not 0003, which is
  // the one that creates every policy. RLS enabled with no policy denies
  // everything, so the whole portal read as empty to everybody.
  // `--skip` is for a project where some migrations are already correctly in
  // place and re-running them would fail on tables that exist. This project
  // had 0001 and 0004 exactly right, and everything between them from an
  // older revision of the app entirely.
  const skipped = new Set(
    String(flag('skip', '') || '')
      .split(',')
      .filter(Boolean)
      .map(Number),
  );
  const selected = (
    only
      ? all.filter((n) => Number(n.slice(0, 4)) === only)
      : all.filter((n) => Number(n.slice(0, 4)) >= from)
  ).filter((n) => !skipped.has(Number(n.slice(0, 4))));

  if (skipped.size > 0) {
    console.log(`Skipping ${[...skipped].map((n) => String(n).padStart(4, '0')).join(', ')}\n`);
  }

  console.log(`Applying ${selected.length} migration(s) to ${ref}\n`);
  let before = await tableCount();
  console.log(`  start${' '.repeat(38)}${before} tables`);

  for (const name of selected) {
    const sql = readFileSync(join(migrationsDir, name), 'utf8');
    try {
      await run(sql);
    } catch (error) {
      console.error(`\n  ✗ ${name}\n    ${error.message}\n`);
      console.error('Nothing from this migration was applied. Earlier ones stand.');
      process.exit(1);
    }
    const after = await tableCount();
    const delta = after - before;
    console.log(
      `  ✓ ${name.padEnd(42)}${after} tables${delta === 0 ? ' (no new tables)' : ` (+${delta})`}`,
    );
    before = after;
  }

  // So a later `supabase db push` does not read an empty history and start
  // again from 0001.
  await run(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key);
    insert into supabase_migrations.schema_migrations (version)
    select v from unnest(array[${all.map((n) => `'${n.slice(0, 4)}'`).join(', ')}]) as t(v)
    on conflict (version) do nothing;
  `);
  console.log('\n  migration history recorded for the CLI');
}

/**
 * Creates the first administrator's profile from an existing auth user.
 *
 * Keyed on auth.users.id rather than the address, because that is what the
 * portal looks the profile up by and confusing the two is the commonest way
 * to end up locked out of your own project.
 */
async function makeAdmin(email) {
  const rows = await run(
    `select id::text as id, email from auth.users where email = '${email.replace(/'/g, "''")}'`,
    { readOnly: true },
  );
  const user = Array.isArray(rows) ? rows[0] : null;
  if (!user) {
    console.error(`No auth user with the address ${email}. Create the account first.`);
    process.exit(1);
  }

  await run(`
    insert into public.profiles (id, full_name, email, role, organization, clearance, is_active)
    values ('${user.id}', 'Burhan Basoglu', '${user.email.replace(/'/g, "''")}',
            'admin', 'AUTK', 'restricted', true)
    on conflict (id) do update
      set role = 'admin', clearance = 'restricted', is_active = true, expires_at = null;
  `);

  const check = await run(
    `select p.role::text as role, p.clearance::text as clearance, p.is_active, p.expires_at
     from public.profiles p where p.id = '${user.id}'`,
    { readOnly: true },
  );
  const profile = Array.isArray(check) ? check[0] : null;
  console.log(`\nProfile for ${email}`);
  console.log(`  auth id    ${user.id}`);
  console.log(`  role       ${profile?.role}`);
  console.log(`  clearance  ${profile?.clearance}`);
  console.log(`  active     ${profile?.is_active}`);
  console.log(`  expires    ${profile?.expires_at ?? 'never'}`);
}

/** What the browser's own query returns, as that caller. The real test. */
async function asCaller(email) {
  const rows = await run(
    `select u.id::text as id from auth.users where u.email = '${email.replace(/'/g, "''")}'`,
    { readOnly: true },
  ).catch(() =>
    run(`select id::text as id from auth.users where email = '${email.replace(/'/g, "''")}'`, {
      readOnly: true,
    }),
  );
  const id = one(rows, 'id');
  if (!id) return;

  const seen = await run(`
    select set_config('request.jwt.claims',
      json_build_object('sub', '${id}', 'role', 'authenticated')::text, true);
    set local role authenticated;
    select auth.uid()::text as seen_as,
           app.current_clearance()::text as clearance,
           (select count(*)::int from public.profiles where id = auth.uid()) as own_row;
  `);

  const row = Array.isArray(seen) ? seen[seen.length - 1] : seen;
  console.log('\nWhat the app will see when this person signs in');
  console.log(`  looked up as  ${row?.seen_as ?? '(nothing)'}`);
  console.log(`  clearance     ${row?.clearance ?? '(null — every policy closes)'}`);
  console.log(`  own row       ${row?.own_row ?? 0}`);
  if (row?.own_row === 1 && row?.clearance) {
    console.log('  → sign-in will work.');
  } else {
    console.log('  → sign-in will still be refused. Run --verify and read the output.');
  }
}

const admin = flag('admin');
const from = flag('from');
const only = flag('only');

if (argv.includes('--verify')) await verify();
if (only) await applyFrom(0, Number(only));
else if (from) await applyFrom(Number(from));
if (typeof admin === 'string') {
  await makeAdmin(admin);
  await asCaller(admin);
}
if (!argv.includes('--verify') && !from && !only && typeof admin !== 'string') {
  console.log('Nothing to do. Pass --verify, --from <n>, --only <n>, or --admin <email>.');
}
