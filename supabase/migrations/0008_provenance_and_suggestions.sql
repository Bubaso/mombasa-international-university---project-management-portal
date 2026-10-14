-- What the Notion workspace needs before anything can be moved out of it.
--
-- Two things, both of them consequences of looking at the real data rather
-- than at the plan.
--
-- First, provenance. The decision was a one-time migration, after which the
-- portal is the system of record — but a one-time migration that cannot be
-- run twice is a migration you get one attempt at, and nobody gets an import
-- of a year of meetings right on the first attempt. Recording where a row
-- came from makes the import idempotent: run it, look at what arrived, fix
-- the mapping, run it again.
--
-- Second, suggestions. The Meeting Hub has a Team Suggestions database that
-- the requirements anticipated and the schema had no home for. It is how
-- somebody who is not running the project proposes a contact, an agenda item
-- or a topic, and gets an answer. Dropping it in the move would quietly
-- remove the only channel those people have.

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
-- Where a row came from
-- ---------------------------------------------------------------------------

create or replace function app.add_provenance(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format($f$
    alter table %s
      add column if not exists source_system text,
      add column if not exists source_id text,
      add column if not exists source_url text;
  $f$, p_table);

  -- A plain unique constraint rather than one restricted to rows that have a
  -- source. Nulls are distinct in Postgres, so records created in the portal
  -- — which have none — are unaffected, while an imported row can never
  -- arrive twice. It has to be a constraint and not a partial index, because
  -- only a constraint can be named as the conflict target of an upsert, and
  -- the importer's whole idempotency rests on that.
  execute format(
    'alter table %s add constraint %I unique (source_system, source_id)',
    p_table, p_table::text || '_source_key');
end;
$$;

select app.add_provenance('organizations');
select app.add_provenance('stakeholders');
select app.add_provenance('meetings');

comment on column meetings.source_url is
  'The page this record was imported from, so a reader can check it against '
  'the original while both still exist.';

-- ---------------------------------------------------------------------------
-- Suggestions
-- ---------------------------------------------------------------------------

create type suggestion_kind as enum (
  'contact',
  'agenda_item',
  'meeting_topic',
  'material',
  'other'
);

create type suggestion_status as enum (
  'pending_review',
  'approved',
  'rejected',
  'added_to_plan'
);

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  kind suggestion_kind not null default 'other',
  status suggestion_status not null default 'pending_review',
  priority priority_level not null default 'normal',

  -- Who proposed it, and who answered. Both are references where the person
  -- is known to the portal and free text where they are not: what arrives
  -- from Notion is a name and nothing else. The text column exists alongside
  -- the reference rather than instead of it, so a migrated row is neither
  -- unattributable nor pretending to an attribution it does not have.
  -- Defaulted to the caller, so somebody who posts into the box can see what
  -- happened to their own suggestion. Without it the policy below hides a
  -- person's post from them the moment they make it, which makes the box a
  -- bin. The import writes under the service role, where this is null, and
  -- supplies the name instead.
  suggested_by_profile_id uuid default auth.uid() references profiles (id),
  suggested_by_stakeholder_id uuid references stakeholders (id),
  suggested_by_name text,

  reviewed_by uuid references profiles (id),
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_notes text,

  -- Likewise the meeting it concerns: a link once it is known, the text that
  -- was written until then.
  relevant_meeting_id uuid references meetings (id) on delete set null,
  relevant_meeting_text text,

  constraint suggestions_title_not_blank check (btrim(title) <> ''),
  constraint suggestions_has_a_proposer check (
    num_nonnulls(suggested_by_profile_id, suggested_by_stakeholder_id, suggested_by_name) >= 1
  )
);

select app.add_common_columns('suggestions');
select app.add_provenance('suggestions');
create index suggestions_status_idx on suggestions (status, priority);

-- ---------------------------------------------------------------------------
-- Who may see and answer a suggestion
-- ---------------------------------------------------------------------------

alter table suggestions enable row level security;
alter table suggestions force row level security;

-- Internal business. Somebody outside the organisation who proposed something
-- still sees their own, which is the least a suggestion box owes them.
create policy suggestions_read on suggestions
  for select using (
    app.can_read(confidentiality, 'suggestions', id)
    -- caller_is, not an inline lookup: the register is not readable by the
    -- people this exists to answer yes for.
    and (app.is_internal() or app.caller_is(suggested_by_profile_id, suggested_by_stakeholder_id))
  );

create policy suggestions_insert on suggestions
  for insert with check (app.current_clearance() is not null);

-- Answering one is a decision about the project's own plan, so it sits with
-- the roles that take those.
create policy suggestions_review on suggestions
  for update
  using (app.can_read(confidentiality, 'suggestions', id) and app.can_assess())
  with check (app.can_assess());

create policy suggestions_delete on suggestions
  for delete
  using (app.can_read(confidentiality, 'suggestions', id) and app.can_assess());

grant select, insert, update, delete on suggestions to authenticated;
grant execute on all functions in schema app to authenticated;

drop function app.add_common_columns(regclass);
drop function app.add_provenance(regclass);
