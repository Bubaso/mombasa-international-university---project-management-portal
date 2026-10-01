-- Action candidates (M3-05, M3-07, G-04).
--
-- The Notion migration brought 103 lines of action text across 21 meetings.
-- Three of them name both a person and a date. Eighty-five name neither:
--
--   "Explore discreet channels to communicate diplomatic pressure"
--   "Finalise legal team reinforcement plan to ensure no legal gaps"
--   "Develop a strategy to leverage Kenya's upcoming election year"
--
-- An action in this portal has one owner and one date, and the database
-- enforces both — due_date is NOT NULL and exactly one of the two owner
-- columns must be set. That rule is the module's reason for existing: the
-- requirement's measure is "sorumlusu veya tarihi olmayan aksiyon: 0".
--
-- So the importer cannot turn these into actions, and it must not invent the
-- two fields, because an action with a made-up date is worse than no action
-- at all: it looks tracked. The alternative is not to drop them either —
-- M3-07 says no action may disappear silently, and a line sitting inside a
-- paragraph of minutes is exactly how one disappears.
--
-- A candidate is the honest third thing. It holds the sentence somebody
-- wrote, says which minute it came from, carries whatever the text does
-- state, and waits. It is not an action and is not counted as one; it is a
-- queue with a number on it, and the number only goes down when a person
-- decides who and when.

create type candidate_state as enum ('pending', 'adopted', 'dismissed');

create table action_candidates (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  -- Where in the minute, so the order of the original list survives.
  sequence int not null,
  text_en text,
  text_tr text,

  -- What the sentence itself says, where it says anything. Suggestions, not
  -- values: adopting is where they become the action's own.
  suggested_owner_stakeholder_id uuid references stakeholders (id) on delete set null,
  suggested_due_on date,

  state candidate_state not null default 'pending',
  -- Set when adopted, so a candidate can never be adopted twice and the
  -- action it became can be found from it.
  action_item_id uuid references action_items (id) on delete set null,
  dismissed_reason text,
  settled_by uuid references profiles (id),
  settled_at timestamptz,

  constraint action_candidates_has_text check (
    btrim(coalesce(text_en, '')) <> '' or btrim(coalesce(text_tr, '')) <> ''
  ),
  constraint action_candidates_adopted_has_an_action check (
    (state = 'adopted') = (action_item_id is not null)
  ),
  -- A candidate dropped without a reason is the silent disappearance M3-07
  -- exists to prevent, arrived at by a different route.
  constraint action_candidates_dismissal_is_reasoned check (
    state <> 'dismissed' or btrim(coalesce(dismissed_reason, '')) <> ''
  ),
  constraint action_candidates_settled_is_attributed check (
    (state = 'pending') = (settled_at is null)
  ),
  unique (meeting_id, sequence)
);
select app.add_common_columns('action_candidates');

create index action_candidates_pending_idx on action_candidates (meeting_id)
  where state = 'pending';

alter table action_candidates enable row level security;
alter table action_candidates force row level security;

-- A candidate is as visible as the meeting it came out of, because it is a
-- sentence from that meeting's minute and nothing more.
create policy action_candidates_read on action_candidates
  for select using (
    exists (select 1 from meetings m where m.id = meeting_id)
  );

create policy action_candidates_insert on action_candidates
  for insert with check (
    app.can_minute()
    and exists (select 1 from meetings m where m.id = meeting_id)
  );

create policy action_candidates_update on action_candidates
  for update
  using (app.can_minute() and exists (select 1 from meetings m where m.id = meeting_id))
  with check (app.can_minute());

-- The sentence is the record. Once a candidate exists, its text is what
-- somebody wrote in the minute; editing it would make the queue disagree
-- with the minute it came from.
create or replace function app.refuse_candidate_rewrite()
returns trigger
language plpgsql
as $$
begin
  if new.text_en is distinct from old.text_en
     or new.text_tr is distinct from old.text_tr
     or new.meeting_id is distinct from old.meeting_id
     or new.sequence is distinct from old.sequence then
    raise exception
      'a candidate is a sentence from a minute; adopt it or dismiss it, but do not rewrite it'
      using errcode = 'insufficient_privilege';
  end if;
  if old.state <> 'pending' and new.state is distinct from old.state then
    raise exception 'that candidate has already been %', old.state
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger action_candidates_text_is_the_minute
  before update on action_candidates
  for each row execute function app.refuse_candidate_rewrite();

-- ---------------------------------------------------------------------------
-- Settling one
-- ---------------------------------------------------------------------------

create or replace function public.adopt_action_candidate(
  p_id uuid,
  p_due_date date,
  p_owner_profile uuid default null,
  p_owner_stakeholder uuid default null,
  p_priority priority_level default 'normal'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v action_candidates;
  v_action uuid;
begin
  select * into v from action_candidates where id = p_id;
  if not found then
    raise exception 'no such candidate, or it is not yours to see'
      using errcode = 'no_data_found';
  end if;
  if v.state <> 'pending' then
    raise exception 'that candidate has already been %', v.state
      using errcode = 'check_violation';
  end if;
  if p_due_date is null then
    raise exception
      'an action needs a date. If nobody has set one, that is the decision to '
      'take — not a field to leave empty'
      using errcode = 'check_violation';
  end if;
  if (p_owner_profile is null) = (p_owner_stakeholder is null) then
    raise exception
      'an action needs exactly one owner: a portal user or somebody in the '
      'stakeholder register'
      using errcode = 'check_violation';
  end if;

  insert into action_items (
    meeting_id, text_en, text_tr, due_date, priority,
    owner_profile_id, owner_stakeholder_id, confidentiality
  )
  values (
    v.meeting_id, v.text_en, v.text_tr, p_due_date, p_priority,
    p_owner_profile, p_owner_stakeholder, v.confidentiality
  )
  returning id into v_action;

  update action_candidates
     set state = 'adopted', action_item_id = v_action,
         settled_by = auth.uid(), settled_at = now()
   where id = p_id;

  return v_action;
end;
$$;

create or replace function public.dismiss_action_candidate(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception
      'say why it is being dropped — a line from a minute that vanishes without '
      'a reason is the thing this queue exists to prevent'
      using errcode = 'check_violation';
  end if;

  update action_candidates
     set state = 'dismissed', dismissed_reason = btrim(p_reason),
         settled_by = auth.uid(), settled_at = now()
   where id = p_id and state = 'pending';

  if not found then
    raise exception 'no such pending candidate, or it is not yours to see'
      using errcode = 'no_data_found';
  end if;
end;
$$;

-- What is left to triage, per meeting, so the number is on the screen rather
-- than in somebody's head.
create or replace view action_triage
with (security_invoker = true)
as
select
  c.id,
  c.meeting_id,
  m.title as meeting_title,
  m.title_tr as meeting_title_tr,
  m.held_at,
  c.sequence,
  c.text_en,
  c.text_tr,
  c.suggested_owner_stakeholder_id,
  s.full_name as suggested_owner_name,
  c.suggested_due_on,
  c.state,
  c.action_item_id,
  c.dismissed_reason,
  c.confidentiality,
  -- Whether the sentence came with anything at all, which is what decides
  -- how much work adopting it is.
  (c.suggested_owner_stakeholder_id is not null) as names_an_owner,
  (c.suggested_due_on is not null) as names_a_date
from action_candidates c
join meetings m on m.id = c.meeting_id
left join stakeholders s on s.id = c.suggested_owner_stakeholder_id;

comment on table action_candidates is
  'A line of action text from a minute, waiting for the owner and the date '
  'that would make it an action (M3-05, M3-07). Not an action and not '
  'counted as one: the queue only goes down when a person decides.';

grant select on action_triage to authenticated;

revoke all privileges on all functions in schema public from anon, public;
revoke all privileges on all functions in schema app from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated;
