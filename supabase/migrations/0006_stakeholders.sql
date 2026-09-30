-- Stakeholders and the relationships themselves (M4).
--
-- The existing Notion Contacts table is a flat address book: name, body,
-- phone. What is missing is the relationship — is this person with us, who do
-- they influence, when did we last speak, what did they promise, when should
-- we speak again.
--
-- This matters more here than the word "CRM" suggests. The project's own
-- evaluation names stakeholder analysis and public perception as its two
-- clearest gaps, and the record bears that out: in a fortnight the project
-- dealt with a minister, a governor, an ambassador, a senator, a partner
-- trust, four candidate advocates, an auditor, contractors and community
-- leaders. What decides the outcome here is not technical progress. It is the
-- network.
--
-- Requirements: M4-01 … M4-11.

-- Attribution points at profiles rather than at auth.users, which no client
-- can read: "who wrote this" should be answerable in the same query that
-- fetches the row. Writing at all requires an active profile, so the
-- reference is always satisfiable.
create or replace function app.add_common_columns(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format($f$
    alter table %s
      add column if not exists confidentiality confidentiality not null default 'internal',
      add column if not exists created_by uuid references profiles (id),
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_by uuid references profiles (id),
      add column if not exists updated_at timestamptz not null default now();
  $f$, p_table);

  execute format(
    'create trigger %I before insert or update on %s for each row execute function app.touch_row()',
    'touch_' || p_table::text, p_table);

  execute format(
    'create trigger %I after insert or update or delete on %s for each row execute function app.record_audit()',
    'audit_' || p_table::text, p_table);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- Organizations and people share one taxonomy: a ministry and the minister in
-- it belong to the same part of the map.
create type stakeholder_category as enum (
  'government',
  'judiciary',
  'partner_trust',
  'legal',
  'contractor',
  'academia',
  'ngo',
  'community_leader',
  'media',
  'donor',
  'opposing_party',
  'other'
);

-- Where someone stands, which is the field this whole module exists for.
-- 'unknown' is the default on purpose: an unexamined relationship should read
-- as unexamined, not as neutral.
create type stance as enum (
  'champion',
  'supporter',
  'neutral',
  'sceptic',
  'opponent',
  'unknown'
);

create type contact_channel as enum (
  'in_person',
  'phone',
  'message',
  'email',
  'formal_letter',
  'other'
);

create type relationship_kind as enum (
  'influences',
  'works_with',
  'related_to',
  'reports_to',
  'opposes',
  'advises'
);

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category stakeholder_category not null default 'other',
  country text,
  website text,
  notes text,

  constraint organizations_name_not_blank check (btrim(name) <> '')
);

select app.add_common_columns('organizations');
create unique index organizations_name_key on organizations (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table stakeholders (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  organization_id uuid references organizations (id) on delete set null,
  category stakeholder_category not null default 'other',

  email text,
  phone text,
  whatsapp text,
  location text,
  -- Kenya works in English and Swahili; the trust works in Turkish. Free text
  -- rather than an enum because the answer is often two of them.
  preferred_language text,
  -- What this relationship is about, in a line.
  interest_topic text,

  stance stance not null default 'unknown',
  -- M4-04: the two axes of the power/interest grid, which the client turns
  -- into "manage closely · keep satisfied · keep informed · monitor".
  influence smallint not null default 3,
  interest smallint not null default 3,

  -- M4-05: every stakeholder is somebody's to keep. One left null is not an
  -- error, it is a finding — see the stakeholder_attention view.
  relationship_owner uuid references profiles (id) on delete set null,

  -- When this person also signs in to the portal. Optional: most contacts
  -- never will, and a contact record is not an account.
  profile_id uuid unique references profiles (id) on delete set null,

  notes text,

  constraint stakeholders_name_not_blank check (btrim(full_name) <> ''),
  constraint stakeholders_influence_range check (influence between 1 and 5),
  constraint stakeholders_interest_range check (interest between 1 and 5)
);

select app.add_common_columns('stakeholders');
create index stakeholders_organization_idx on stakeholders (organization_id);
create index stakeholders_owner_idx on stakeholders (relationship_owner);

-- ---------------------------------------------------------------------------
-- How a stance moved (M4-03)
-- ---------------------------------------------------------------------------
--
-- Recorded by a trigger rather than by whoever remembers to. A stance that
-- only ever shows its current value tells you nothing about whether the
-- relationship is being won or lost, which is the question worth asking.

create table stakeholder_stance_changes (
  id uuid primary key default gen_random_uuid(),
  stakeholder_id uuid not null references stakeholders (id) on delete cascade,
  from_stance stance,
  to_stance stance not null,
  changed_by uuid references profiles (id),
  changed_at timestamptz not null default now(),
  note text
);

create index stakeholder_stance_changes_idx
  on stakeholder_stance_changes (stakeholder_id, changed_at desc);

create or replace function app.record_stance_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into stakeholder_stance_changes (stakeholder_id, from_stance, to_stance, changed_by)
    values (new.id, null, new.stance, auth.uid());
  elsif new.stance is distinct from old.stance then
    insert into stakeholder_stance_changes (stakeholder_id, from_stance, to_stance, changed_by)
    values (new.id, old.stance, new.stance, auth.uid());
  end if;
  return new;
end;
$$;

create trigger stakeholders_stance_history
  after insert or update of stance on stakeholders
  for each row execute function app.record_stance_change();

-- ---------------------------------------------------------------------------
-- Who knows whom (M4-09)
-- ---------------------------------------------------------------------------
--
-- This project runs on who-knows-whom, so the edges are worth storing as
-- data. Direction matters: "the governor influences the minister" is not the
-- same claim as its reverse.

create table stakeholder_relationships (
  id uuid primary key default gen_random_uuid(),
  from_stakeholder_id uuid not null references stakeholders (id) on delete cascade,
  to_stakeholder_id uuid not null references stakeholders (id) on delete cascade,
  kind relationship_kind not null,
  strength smallint not null default 3,
  note text,

  constraint stakeholder_relationships_distinct
    check (from_stakeholder_id <> to_stakeholder_id),
  constraint stakeholder_relationships_strength_range check (strength between 1 and 5),
  unique (from_stakeholder_id, to_stakeholder_id, kind)
);

select app.add_common_columns('stakeholder_relationships');

-- ---------------------------------------------------------------------------
-- The contact log (M4-06)
-- ---------------------------------------------------------------------------

create table stakeholder_interactions (
  id uuid primary key default gen_random_uuid(),
  stakeholder_id uuid not null references stakeholders (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  channel contact_channel not null default 'in_person',
  summary text not null,
  outcome text,
  -- Who in the project was in the room. Null when the log was written up
  -- from someone else's account of it, which is worth being able to tell.
  logged_for uuid references profiles (id) on delete set null,

  constraint stakeholder_interactions_summary_not_blank check (btrim(summary) <> '')
);

select app.add_common_columns('stakeholder_interactions');
create index stakeholder_interactions_idx
  on stakeholder_interactions (stakeholder_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- The private assessment (M4-11)
-- ---------------------------------------------------------------------------
--
-- Every stakeholder record has two halves: a profile that can be shared, and
-- an assessment that cannot. They are separate tables because confidentiality
-- is a property of a row — keeping both in one row would mean classifying the
-- person's name as highly as the opinion held about them, and the register
-- would become unusable.
--
-- These default to 'restricted', which no external role can reach by any
-- route, grant included.

create table stakeholder_assessments (
  id uuid primary key default gen_random_uuid(),
  stakeholder_id uuid not null references stakeholders (id) on delete cascade,
  body text not null,
  assessed_at timestamptz not null default now(),

  constraint stakeholder_assessments_body_not_blank check (btrim(body) <> '')
);

select app.add_common_columns('stakeholder_assessments');
alter table stakeholder_assessments
  alter column confidentiality set default 'restricted';
create index stakeholder_assessments_idx on stakeholder_assessments (stakeholder_id);

-- ---------------------------------------------------------------------------
-- Who may see and keep the register
-- ---------------------------------------------------------------------------

-- The internal roles that write operational records, plus trustees, who make
-- the decisions being recorded but are not otherwise editors.
create or replace function app.can_minute()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'field_team', 'board_director', 'trustee');
$$;

-- Narrower: the private assessment of a person is not the field team's to
-- write, and a mistaken one is hard to take back.
create or replace function app.can_assess()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'board_director');
$$;

-- The register is the project's political map. Clearance alone is not enough
-- for it: an advocate and a contractor both hold 'internal' clearance, and
-- neither has any business browsing who the project thinks is an opponent.
-- They see what was published, and whatever was deliberately handed to them.
create or replace function app.can_see_stakeholder(p_conf confidentiality, p_id uuid)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf, 'stakeholders', p_id)
    and (
      p_conf = 'public'
      or app.is_internal()
      or app.has_grant('stakeholders', p_id, 'read')
    );
$$;

alter table organizations enable row level security;
alter table organizations force row level security;

create policy organizations_read on organizations
  for select using (
    app.can_read(confidentiality, 'organizations', id)
    and (confidentiality = 'public' or app.is_internal()
         or app.has_grant('organizations', id, 'read'))
  );

create policy organizations_insert on organizations
  for insert with check (app.can_minute());

create policy organizations_update on organizations
  for update
  using (app.can_read(confidentiality, 'organizations', id) and app.can_minute())
  with check (app.can_minute());

create policy organizations_delete on organizations
  for delete
  using (app.can_read(confidentiality, 'organizations', id) and app.can_minute());

alter table stakeholders enable row level security;
alter table stakeholders force row level security;

create policy stakeholders_read on stakeholders
  for select using (app.can_see_stakeholder(confidentiality, id));

create policy stakeholders_insert on stakeholders
  for insert with check (app.can_minute());

create policy stakeholders_update on stakeholders
  for update
  using (app.can_see_stakeholder(confidentiality, id) and app.can_minute())
  with check (app.can_minute());

create policy stakeholders_delete on stakeholders
  for delete
  using (app.can_see_stakeholder(confidentiality, id) and app.can_minute());

-- The history follows the person it belongs to, and is written by the trigger
-- rather than by anyone. No policy grants insert, update or delete: like the
-- audit log, a stance history that can be tidied afterwards is worthless.
alter table stakeholder_stance_changes enable row level security;
alter table stakeholder_stance_changes force row level security;

create policy stakeholder_stance_changes_read on stakeholder_stance_changes
  for select using (
    exists (
      select 1 from stakeholders s
      where s.id = stakeholder_id and app.can_see_stakeholder(s.confidentiality, s.id)
    )
  );

alter table stakeholder_relationships enable row level security;
alter table stakeholder_relationships force row level security;

-- An edge is only visible when both of its ends are. Otherwise the shape of
-- the network leaks through the people you were not meant to see.
create or replace function app.can_see_relationship(p_from uuid, p_to uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from stakeholders s
    where s.id = p_from and app.can_see_stakeholder(s.confidentiality, s.id)
  ) and exists (
    select 1 from stakeholders s
    where s.id = p_to and app.can_see_stakeholder(s.confidentiality, s.id)
  );
$$;

create policy stakeholder_relationships_read on stakeholder_relationships
  for select using (
    app.can_read(confidentiality, 'stakeholder_relationships', id)
    and app.can_see_relationship(from_stakeholder_id, to_stakeholder_id)
  );

create policy stakeholder_relationships_insert on stakeholder_relationships
  for insert with check (app.can_minute());

create policy stakeholder_relationships_update on stakeholder_relationships
  for update
  using (
    app.can_read(confidentiality, 'stakeholder_relationships', id)
    and app.can_see_relationship(from_stakeholder_id, to_stakeholder_id)
    and app.can_minute()
  )
  with check (app.can_minute());

create policy stakeholder_relationships_delete on stakeholder_relationships
  for delete
  using (
    app.can_read(confidentiality, 'stakeholder_relationships', id)
    and app.can_see_relationship(from_stakeholder_id, to_stakeholder_id)
    and app.can_minute()
  );

alter table stakeholder_interactions enable row level security;
alter table stakeholder_interactions force row level security;

-- What was said to a minister is not something an outside contractor reads,
-- whatever its tier, so this one has no grant route at all.
create policy stakeholder_interactions_read on stakeholder_interactions
  for select using (
    app.is_internal() and app.can_read(confidentiality, 'stakeholder_interactions', id)
  );

create policy stakeholder_interactions_insert on stakeholder_interactions
  for insert with check (app.can_minute());

create policy stakeholder_interactions_update on stakeholder_interactions
  for update
  using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_interactions', id)
    and app.can_minute()
  )
  with check (app.can_minute());

create policy stakeholder_interactions_delete on stakeholder_interactions
  for delete
  using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_interactions', id)
    and app.can_minute()
  );

alter table stakeholder_assessments enable row level security;
alter table stakeholder_assessments force row level security;

create policy stakeholder_assessments_read on stakeholder_assessments
  for select using (
    app.is_internal() and app.can_read(confidentiality, 'stakeholder_assessments', id)
  );

create policy stakeholder_assessments_insert on stakeholder_assessments
  for insert with check (app.can_assess());

create policy stakeholder_assessments_update on stakeholder_assessments
  for update
  using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_assessments', id)
    and app.can_assess()
  )
  with check (app.can_assess());

create policy stakeholder_assessments_delete on stakeholder_assessments
  for delete
  using (
    app.is_internal()
    and app.can_read(confidentiality, 'stakeholder_assessments', id)
    and app.can_assess()
  );

-- ---------------------------------------------------------------------------
-- What needs attention (M4-05, M4-07)
-- ---------------------------------------------------------------------------
--
-- A relationship does not fail loudly. It goes quiet, and the going-quiet is
-- the thing nobody notices until it matters, so the portal has to do the
-- noticing. The threshold scales with influence: a minister left alone for
-- six weeks is a problem in a way that a supplier contact is not.
--
-- security_invoker keeps every row here subject to the same policies as the
-- table underneath. Without it a view runs as its owner and would hand the
-- whole register to anyone who could select from it.

create view stakeholder_attention with (security_invoker = true) as
select
  s.id,
  s.full_name,
  s.category,
  s.stance,
  s.influence,
  s.interest,
  s.relationship_owner,
  last_contact.occurred_at as last_contact_at,
  case s.influence
    when 5 then 30
    when 4 then 45
    when 3 then 60
    when 2 then 90
    else 120
  end as quiet_after_days,
  (s.relationship_owner is null) as needs_an_owner,
  (
    last_contact.occurred_at is null
    or last_contact.occurred_at < now() - make_interval(days => case s.influence
        when 5 then 30
        when 4 then 45
        when 3 then 60
        when 2 then 90
        else 120
      end)
  ) as has_gone_quiet
from stakeholders s
left join lateral (
  select i.occurred_at
  from stakeholder_interactions i
  where i.stakeholder_id = s.id
  order by i.occurred_at desc
  limit 1
) last_contact on true;

comment on view stakeholder_attention is
  'Stakeholders with nobody keeping them, or with no contact inside the window '
  'their influence warrants (M4-05, M4-07).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  organizations, stakeholders, stakeholder_relationships,
  stakeholder_interactions, stakeholder_assessments
  to authenticated;

-- Written only by the trigger, so nothing but select is granted.
grant select on stakeholder_stance_changes to authenticated;
grant select on stakeholder_attention to authenticated;
grant execute on all functions in schema app to authenticated;

drop function app.add_common_columns(regclass);
