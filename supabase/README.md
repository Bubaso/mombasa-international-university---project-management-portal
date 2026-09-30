# Database

The schema, the access rules and the tests that prove them.

## Layout

```
migrations/
  0001_identity_and_classification.sql   profiles, roles, tiers, grants, audit
  0002_domain_tables.sql                 the tables the app reads
  0003_row_level_security.sql            who may read and write what
functions/
  ai-assistant/                          server-side model proxy
```

## Access model in one page

**Thirteen roles**, split into internal (`admin`, `project_director`,
`field_team`, `trustee`, `board_director`, `audit_committee`) and external
(`legal_counsel`, `contractor`, `quantity_surveyor`, `external_auditor`,
`donor`, `observer`, `consultant`).

**Four confidentiality tiers**, on every domain row, defaulting to `internal`:

| Tier           | Who                                                      |
| -------------- | -------------------------------------------------------- |
| `public`       | anyone with an active profile — published material       |
| `internal`     | the core team, plus the relevant external party          |
| `confidential` | the core team, or an explicit per-record grant           |
| `restricted`   | internal roles only; never reachable by an external role |

Three things decide a read, and all three must agree:

1. **Clearance** — the tier must be within the caller's ceiling. The ceiling is
   the lower of what their profile grants and what `app.max_clearance` allows
   their role, so a misconfigured profile cannot hand out more than the role
   may ever hold.
2. **Scope** — an advocate sees their assigned cases, a contractor their
   assigned blocks. Out-of-scope rows do not leave the database.
3. **Grants** — `record_grants` shares one record with one person, overriding
   both clearance and scope, and expiring if given an expiry. A grant can never
   reach `restricted`.

Writing is narrower than reading, and every mutating policy also requires the
row to be readable: permission to edit is never a way to see something.

## Running the tests

```bash
npm run test:policies
```

Starts a throwaway Postgres, applies the migrations over a small shim for the
Supabase auth primitives (`tests/db/bootstrap.sql`), seeds one person per role
and one record per tier, then asserts each rule from the caller's seat. Set
`DATABASE_URL` to use an existing database instead.

These are not optional. External stakeholders sign in to this portal, and the
confidentiality model is what stands between a contractor and the trustees'
private assessments.

## Applying to a real project

```bash
supabase link --project-ref <ref>
supabase db push
```

`bootstrap.sql` is never applied: Supabase already owns the `auth` schema.
