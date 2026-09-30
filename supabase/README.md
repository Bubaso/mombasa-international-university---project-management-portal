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
  0013_site_and_works.sql                the breakdown, evidenced progress, quantities
  0014_own_profile_is_readable.sql       so a locked-out person can be told why
  0015_budget_and_money.sql              the four figures, vouchers, the badge
  0016_raid.sql                          risk, issue, assumption, dependency
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

| Table                                                 | Beyond clearance, a caller needs                 |
| ----------------------------------------------------- | ------------------------------------------------ |
| `legal_cases`                                         | to be assigned to the case                       |
| `construction_blocks`                                 | to be assigned to the block                      |
| `financial_transactions`                              | a role that answers for money                    |
| `stakeholders`                                        | to be internal — or a grant on that one person   |
| `stakeholder_interactions`, `stakeholder_assessments` | to be internal, with no grant route at all       |
| `meetings`                                            | to have been in the room                         |
| `action_items`                                        | to be the owner                                  |
| `document_versions`                                   | to be able to read the document they belong to   |
| `document_access`                                     | to answer for the project — or to be the reader  |
| `work_packages`, `site_tasks`, `task_progress`        | the block to be readable; to report, to be on it |
| `boq_versions`, `boq_items`, `valuations`             | to answer for money, or to be the surveyor on it |
| `budget_lines`, `donations`                           | a role that answers for money                    |
| `payment_vouchers`                                    | that, or to be the one who asked to be paid      |
| `risks`, `issues`, `assumptions`                      | to be internal — the register names partners     |

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
- **`task_progress`** — what a task was reported at, by whom, on what evidence.
  A progress history that can be tidied afterwards tells you what somebody
  currently wishes had happened.
- **`voucher_approvals`** — every ruling on a payment, with who made it and
  which role they were acting under, including the ones later reversed.
- **`risk_score_changes`** — how a risk's score moved. A register that shows
  only today's number cannot answer the one question worth asking of it.
- **`risk_escalations`** — each time a score crossed the line. Acknowledging
  one is the only thing anybody does to it; it cannot be deleted.

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

## What the site schema will not let anybody say

- **There is no progress column.** `construction_blocks.progress_percent` is
  gone. Progress is `task_progress`, whose `document_id` is `not null`, so
  there is nowhere to put a figure without putting the evidence with it
  (M7-03). `block_progress` then computes what a block is at, and answers
  **null** where nothing has been reported — which is not zero, and the
  screens keep the two apart.
- **Preservation is not progress.** A preservation task is its own kind and
  must record what justifies it, so money spent keeping an open structure
  standing never reads as the project advancing (M7-11).
- **An issued bill of quantities does not change.** A new version is the way,
  and a line's `amount` is generated from quantity × rate, so a total cannot
  disagree with its own parts (M7-07).
- **A valuation needs two signatures, in order, from two people.** A trigger
  refuses approval before certification and payment before approval; a check
  constraint refuses one person being both. An approval chain one person can
  be both links of is not a chain (M7-08).
- **A signed inspection is fixed.** Findings can still be closed out
  afterwards, because that is not editing the report — the finding stands and
  what is added is the answer to it (M7-04).

`obligation_blocks` records which blocks a prohibition reaches. Nothing infers
that from the text of an order, and a system that guessed would be worse than
one that asks: somebody who has read it says so once, and after that
`site_task_conflicts` cannot forget. The work is still not blocked — the
project did once resolve unanimously to keep building under an order, and a
portal that refused to record that would only have removed the trace.

## The one badge nobody can award themselves

`financial_transactions.audited_at` and `audited_by` are not in the update
grant. `authenticated` cannot write them by any statement, correct or
otherwise. The only thing that sets them is:

```sql
select public.mark_audited('<transaction id>', 'Vouched to invoice.');
```

which checks `app.acts_as('audit_committee', 'external_auditor')` first,
re-checks that the caller could have read the transaction (definer rights
bypass the policies, so that has to be explicit), and fills the columns once.

Not the director and not an administrator. A badge the spender can award
themselves says nothing to a donor, and one bad "audited" makes every other
figure in the portal a question.

The rest of M8 follows the same rule — a fact that follows from other facts is
never separately assertable:

- **Budget, committed, spent, remaining** are a view over the vouchers
  (`budget_position`). An approved voucher is committed, a paid one is spent,
  and remaining subtracts both, so money promised comes off the line before it
  moves. Stored side by side these four begin to disagree, and the old summary
  was that disagreement made visible (M8-02).
- **Every amount carries its currency and the rate**, and the base figure is
  generated from the two. The rate lives on the row, not in a table the sums
  look up later, because a later table silently restates history (M8-03).
- **`verified` is generated** from whether a document is attached, on both
  transactions and donation tranches (M8-07).
- **A pledge is not a receipt.** `donation_position` reports what was
  promised, what arrived, and the gap — never their sum (M8-08).
- **Approval thresholds are rows**, so a board can change its own and the
  ones that applied stay auditable. The trigger refuses a ruling from below
  the band, refuses anyone ruling on their own request, and stamps what the
  line had left at the moment of the decision, so "was this approved knowing
  the line was overspent" is answerable afterwards (M8-04, M8-05).

`app.required_approvers()` is security definer on purpose: the bands are a
rule of the institution, not rows belonging to the caller. Read under the
caller's own policies, a contractor's lookup comes back empty and the refusal
reads "no threshold covers this amount" — untrue, and a worse answer than the
real one.

## What the risk register does by itself

- **A score is generated** from likelihood × impact, so it is never a third
  number anybody maintains beside the two it comes from (M6-01).
- **Accepting a risk requires saying why.** A check constraint refuses
  `response = 'accept'` with no plan, because a decision to live with
  something, with no reasoning attached, is indistinguishable from not having
  noticed (M6-02).
- **Crossing the escalation line is an event**, recorded once on the way up. A
  risk that goes over and comes back has crossed twice and both are kept; one
  that sits above the line does not escalate again when somebody edits its
  title (M6-08).
- **`materialise_risk()` is one act** — the issue is created, linked and the
  risk moved, or none of it happens. So "we could not have known" stays
  checkable against the register that saw it coming (M6-04, M6-05).
- **A collapsed assumption raises a risk on its own.** This is the only
  automation in the schema that files a record nobody asked for, and it earns
  that: the moment an assumption fails is the moment everybody is busy with
  the consequences, so a risk filed then is one filed after it mattered.
  Likelihood five, because it has already happened; impact three, as a
  placeholder for a person, because the database has no way of knowing
  (M6-06).

`dependency_status.blocker_settled` is deliberately three-valued. Null means
the portal cannot say — a court case being open tells you nothing about
whether the particular ruling the work waits on has come, and answering "not
settled" there would be making something up. A dependency may also name
something the portal does not hold: accreditation has no module, and a
register that could not mention it would be describing a different project.

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

## When a verified sign-in says there is no access

The portal now names which of four things happened, and shows the id it
looked the profile up by. The id is the part that matters: a profile is keyed
on `auth.users.id`, not on the email address, and the email is what people
compare by eye.

Run this in the SQL editor, as the project owner, so row level security is out
of the way and you see what is actually there:

```sql
select
  u.id            as auth_user_id,
  u.email         as auth_email,
  u.email_confirmed_at,
  p.id            as profile_id,
  p.role,
  p.clearance,
  p.is_active,
  p.expires_at
from auth.users u
full outer join profiles p on p.id = u.id
where u.email = 'you@example.com' or p.email = 'you@example.com';
```

What the rows mean:

- **`profile_id` null** — the account exists and nothing in `profiles` carries
  its id. Insert one with `id` set to the `auth_user_id` above, not a fresh
  uuid. (`profiles.id` is a foreign key to `auth.users`, so a wrong id is
  refused rather than accepted quietly.)
- **`auth_user_id` null** — there is a profile row for that address and no
  account behind it. The address in `profiles` is a label; sign-in goes
  through `auth.users`.
- **both present, `is_active` false or `expires_at` in the past** — the account
  is switched off or timed out. This is what 0014 exists for: before it, such
  a person could not read the row that said so, so the portal could only
  report the vaguest of the four answers.
- **both present and healthy, and the portal still refuses** — the build is
  probably pointed at a different project. Check `VITE_SUPABASE_URL` in the
  deployment against the project you are looking at, and compare the
  `auth_user_id` here with the id the sign-in screen prints.

To set up the first administrator by hand, after `supabase db push`:

```sql
insert into profiles (id, full_name, email, role, clearance)
select u.id, 'Your Name', u.email, 'admin', 'restricted'
from auth.users u
where u.email = 'you@example.com';
```

Everyone after that should come through `invite-user`, which creates the
account and the profile together and cannot leave one without the other.

## Applying to a real project

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy invite-user
supabase functions deploy verify-document
supabase functions deploy document-download
```

**If `supabase link` refuses.** An error like _your account does not have the
necessary privileges to access this endpoint_ is about the Management API, not
the database: the CLI is signed in as an account that cannot read this
project's settings — a different account, or one whose role in the
organisation is below Administrator. `supabase projects list` shows which it
is.

Linking is avoidable. Both commands take a connection string and talk to
Postgres directly, so neither touches the endpoint that refused:

```bash
supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
```

The string is in Project Settings → Database → Connection string, and it must
be percent-encoded: a password containing `@`, `/`, `:` or `#` has to be
escaped or the URL parses wrongly and the error will be about the host rather
than the password.

**If the CLI cannot be used at all.** No account with the privileges, and no
way to open a Postgres connection from where you are — a container or CI that
allows only outbound 443 cannot reach port 5432, and the failure looks like a
timeout rather than a refusal. The dashboard is plain HTTPS, so it is the
route that is left:

```bash
npm run sql:bundle -- --from 4     # or omit --from for everything
```

That writes `supabase/bundled/migrations-0004-onwards.sql` — generated from
the migrations each time rather than kept in the repository, because a second
copy of the schema is a second thing to forget. Paste it into the SQL editor
and run it once. It is wrapped in a single transaction, so a failure part-way
applies nothing and the error names the statement that stopped it; the last
block records every migration as applied so a later `supabase db push` does
not start again from 0001.

If the editor struggles with the size, apply the files in
`supabase/migrations/` one at a time in numeric order instead. Each is
self-contained, and you then know exactly which one stopped.

**If the project already has some of these applied by hand.** `db push` works
out what to run from `supabase_migrations.schema_migrations`, which is written
by the CLI and by nothing else. A project whose early migrations were pasted
into the SQL editor has an empty table, so push starts at 0001 and stops on
`type "app_role" already exists`. Tell it what is already there, then push:

```bash
supabase migration repair --status applied 0001 0002 0003 --db-url "<the same string>"
supabase db push --db-url "<the same string>"
```

(Drop `--db-url` from both if the project is linked.)

A half-applied migration is worth ruling out before anything else, because it
does not look like one from outside. Every policy in this schema calls into
the `app` schema, so a run that stopped before the grants at the end of 0003
leaves row level security switched on and every query raising _permission
denied for schema app_ — which reaches a browser as a failure to load, not as
a schema problem. `supabase/diagnose-access.sql` part 2 answers it in one
query.

`bootstrap.sql` is never applied: Supabase already owns the `auth` schema.
0012 creates the `documents` bucket and its policies through
`storage.buckets`, so no console step is needed for it.
