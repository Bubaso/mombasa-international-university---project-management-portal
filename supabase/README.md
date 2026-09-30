# Database

The schema, the access rules and the tests that prove them.

## Layout

```
migrations/
  0001_identity_and_classification.sql   profiles, roles, tiers, grants, audit
  0002_domain_tables.sql                 the tables the app reads
  0003_row_level_security.sql            who may read and write what
  0004_emergency_delegation.sql          two-trustee transfer of authority
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

## Emergency delegation

Locking the portal down creates a problem of its own: if the project director
is unreachable, nobody can act. Two trustees acting together can hand one
person's authority to another for a bounded window.

Two, not one — a single trustee quietly granting themselves the director's
clearance is the hole this would otherwise open. The recipient cannot approve
their own delegation, a non-trustee cannot approve at all, and a trustee
cannot approve twice. A delegation always expires, can be revoked at any
moment, and adds a hat rather than removing one: the recipient keeps whatever
they already had. Every step lands in the audit log.

This exists because the project's own evaluation report names a single-person
dependency as its main structural weakness. It is enforced in the database and
covered by tests; the console for requesting and approving one is not built
yet, so today it is reachable only through SQL.

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
