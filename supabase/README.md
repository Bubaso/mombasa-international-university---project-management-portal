# Database

The schema, the access rules and the tests that prove them.

## Layout

```
migrations/
  0001_identity_and_classification.sql   profiles, roles, tiers, grants, audit
  0002_domain_tables.sql                 the tables the app reads
  0003_row_level_security.sql            who may read and write what
  0004_emergency_delegation.sql          two-trustee transfer of authority
  0005_effective_authority.sql           authority as a union; the audit gaps
functions/
  ai-assistant/                          server-side model proxy
  invite-user/                           creates an account and its profile
```

The console that drives all of this is `src/views/AdminConsoleView.tsx`.

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

**Authority is a set, not a rank.** `app.effective_roles()` is the caller's own
role plus every role a live delegation lends them, and every policy asks
`app.acts_as(...)` of that set. This matters because authority does not form a
ladder: a trustee may approve a delegation and a director may not; a director
may record a payment and a trustee may not. 0004 decided the question by
comparing clearance ceilings, which meant a delegation to a trustee — the most
likely recipient, since trustees are who approve — changed nothing at all.
0005 replaced it.

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
dependency as its main structural weakness. Requesting, approving and revoking
one is in the console, under Access & Administration.

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

## What the client is allowed to believe about itself

`public.current_authority()` returns the caller's effective role, the whole set
of roles they act under, their clearance, and any delegation in force — all
computed by the same functions the policies use. It is the only thing the
browser and the invite function ask about authority, because a profile row says
nothing about a delegation, and a JWT body is written by the browser.

It shapes the interface and nothing else. The console's rule is to never draw
a control the database would refuse, so that a person is never left guessing
whether the system is broken or they are not allowed. A person who edits their
way past that view reaches exactly nothing new.

## Inviting someone

Creating an account needs the service role key, which bypasses row level
security entirely and must never reach a browser, so it lives in the
`invite-user` edge function:

```bash
supabase functions deploy invite-user
```

It builds two clients on purpose: one carrying the caller's own token, used
only to ask `current_authority()` who is asking, and one with the service role,
used only after that answer says administrator. If the profile insert fails it
deletes the auth user it just created, so a half-made account never lingers.

## Applying to a real project

```bash
supabase link --project-ref <ref>
supabase db push
```

`bootstrap.sql` is never applied: Supabase already owns the `auth` schema.
