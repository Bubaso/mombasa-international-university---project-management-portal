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
  0006_stakeholders.sql                  the register, the network, the log
  0007_meetings_decisions_actions.sql    minutes that produce commitments
  0008_provenance_and_suggestions.sql    where a row came from; the suggestion box
  0009_legal_register.sql                cases, hearings, filings, orders, evidence
  0010_obligations.sql                   what four sources oblige this project to do
  0011_project_calendar.sql              every dated thing, in one view
  0012_document_vault.sql                documents, versions, and who read them
functions/
  ai-assistant/                          server-side model proxy
  invite-user/                           creates an account and its profile
  verify-document/                       reads stored bytes, records their digest
  document-download/                     logs a reading, then signs a 60s link
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

## Scope rules, one per thing worth protecting

Clearance is not enough on its own, because several roles that sit outside the
organisation hold `internal` clearance. So each sensitive table names what,
besides a tier, lets someone reach a row:

| Table                                                 | Beyond clearance, a caller needs                |
| ----------------------------------------------------- | ----------------------------------------------- |
| `legal_cases`                                         | to be assigned to the case                      |
| `construction_blocks`                                 | to be assigned to the block                     |
| `financial_transactions`                              | a role that answers for money                   |
| `stakeholders`                                        | to be internal — or a grant on that one person  |
| `stakeholder_interactions`, `stakeholder_assessments` | to be internal, with no grant route at all      |
| `meetings`                                            | to have been in the room                        |
| `action_items`                                        | to be the owner                                 |
| `document_versions`                                   | to be able to read the document they belong to  |
| `document_access`                                     | to answer for the project — or to be the reader |

Every one of them narrows. None of them lifts: attending a confidential
meeting does not raise an advocate's clearance to confidential, and being the
owner of an action does not open the meeting it came from. Only a grant lifts
a ceiling, and never as far as `restricted`.

## What the record keeps on its own

Three things are written by triggers and cannot be written, edited or deleted
by anyone, because a record that can be tidied up afterwards is not evidence:

- **`audit_log`** — every write to every table that carries classification.
- **`stakeholder_stance_changes`** — how an opinion of someone moved, and who
  moved it. A stance that only shows its current value says nothing about
  whether a relationship is being won or lost.
- **Final minutes** — once `meetings.minutes_status` is `final`, its notes
  refuse edits and deletes, and the status cannot go back to draft. A
  correction is an addendum, not a quiet edit.
- **`exhibit_custody`** — who handed which exhibit to whom. A chain that can
  be tidied afterwards proves nothing, which is the only reason to keep one.
- **`obligation_overrides`** — proceeding in spite of an obligation. The
  portal warns and records; it does not block. A deliberate risk that can be
  erased later was never recorded.
- **`document_versions`** — a version is written once. Edits and deletes are
  refused, with one exception: the server filling in a digest that was null.
  Replacing a file is a new version, so which one was in force on a given day
  stays answerable.
- **`document_access`** — who opened which version, and when.

Each of these revokes `insert`/`update`/`delete` from `authenticated`
explicitly, because 0003's default privileges grant them to every new table.
Without the revoke the triggers are unreachable and an attempt to rewrite the
record fails silently with zero rows instead of saying no.

## Two rules the obligations register will not bend

- **`verified` is generated**, from whether a source document is attached.
  Nobody can assert it. An obligation with no paper behind it is still
  recorded — an unrecorded obligation is worse than an unverified one — but
  it says what it is.
- **Nothing is `fulfilled` without evidence.** A trigger refuses the state
  change until something is attached. "Done" without evidence is a claim, and
  on this project the claims that matter are ones a court may later be asked
  to believe.

## Three rules the vault keeps without asking the interface

- **A digest is computed, never stated.** `authenticated` holds no privilege
  on `document_versions.sha256`, so the column is unreachable from a browser
  whatever it sends. Only `verify-document` writes it, from the bytes it
  downloads out of the bucket — not from what the uploader claimed they sent.
  Until it runs the value is null and every screen says _unverified_, which is
  the true answer and the one the old module lied about.
- **The bytes have exactly one route out.** The `documents` bucket has no
  select policy for `authenticated` at all. A browser cannot fetch a file, and
  the only path to one is `document-download`, which writes the access row
  before it signs a sixty-second link. M9-07 asks for a log on confidential
  material; making it mandatory for everything costs one row and removes the
  question of who was supposed to remember.
- **Storage is written where a version already says so.** The bucket's one
  insert policy allows a path only if a `document_versions` row already claims
  it, so the client writes the row first and the upload second. A file with no
  row behind it cannot be put there.

Column privileges do the first of those, rather than a policy or a trigger,
because there is no expression to get wrong and nothing to reason around: the
grant simply does not exist.

## Importing from Notion

Every imported row records where it came from (`source_system`, `source_id`,
`source_url`) under a unique constraint, so the import is idempotent: run it,
look at what arrived, fix the mapping, run it again. "One time" was about the
direction of the migration, not the number of attempts.

The mapping, and more usefully the three things it cannot do, are in
[`docs/NOTION-GOC.md`](../docs/NOTION-GOC.md). The importer is
`scripts/import-notion.mjs`; start with `npm run import:notion -- --dry-run`.

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

## The two document functions

```bash
supabase functions deploy verify-document
supabase functions deploy document-download
```

Both follow the same shape as `invite-user`: the caller's own token asks for
the version first, under row level security, and the service role is used only
after the policies have already answered. Neither is a convenience wrapper —
without them a document has no digest and no route to its bytes at all.

## Applying to a real project

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy invite-user
supabase functions deploy verify-document
supabase functions deploy document-download
```

`bootstrap.sql` is never applied: Supabase already owns the `auth` schema.
0012 creates the `documents` bucket and its policies through
`storage.buckets`, so no console step is needed for it.
