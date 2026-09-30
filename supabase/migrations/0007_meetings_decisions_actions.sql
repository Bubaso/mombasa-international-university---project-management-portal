-- Meetings, decisions, actions and the questions nobody has answered (M3).
--
-- The team's most mature habit is already here: in Notion, the agenda,
-- attendees, notes, outcomes and actions are filled in with discipline. What
-- does not happen is the next step — an action has no owner, nothing says
-- whether it closed, and it is not carried into the following meeting. The
-- evaluation's finding that meetings are not held regularly points at the
-- same place.
--
-- So the single aim of this schema is to stop a meeting note being an archive
-- and make it a thing that produces commitments. That is why a decision, an
-- action and an unanswered question are each their own row rather than three
-- paragraphs inside a note: a paragraph cannot have an owner, a due date or a
-- state, and cannot be carried forward.
--
-- Requirements: M3-01 … M3-11, M3-15.

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

-- A person in this schema is either someone who signs in or someone in the
-- stakeholder register, and never a name typed into a box (M3-02). Exactly
-- one of the two columns is filled, which is what makes "who owns this" a
-- question with an answer.
create or replace function app.add_party_columns(p_table regclass, p_prefix text default '')
returns void
language plpgsql
as $$
declare
  v_profile text := p_prefix || 'profile_id';
  v_stakeholder text := p_prefix || 'stakeholder_id';
begin
  execute format(
    'alter table %s
       add column %I uuid references profiles (id),
       add column %I uuid references stakeholders (id)',
    p_table, v_profile, v_stakeholder);

  execute format(
    'alter table %s add constraint %I check ((%I is null) <> (%I is null))',
    p_table, p_table::text || '_exactly_one_party', v_profile, v_stakeholder);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

create type meeting_kind as enum (
  'internal',
  'trustee',
  'official',
  'partner',
  'legal',
  'site',
  'community'
);

create type meeting_status as enum ('planned', 'in_progress', 'completed', 'cancelled');

-- Draft until circulated, circulated until agreed, and then fixed. A minute
-- that can still be edited after it is agreed is not a minute (M3-15).
create type minutes_status as enum ('draft', 'circulated', 'final');

create type priority_level as enum ('low', 'normal', 'high', 'critical');

create type attendance_role as enum ('chair', 'secretary', 'participant', 'observer');

-- The five headings the team already writes under.
create type note_section as enum (
  'discussed',
  'decisions',
  'actions',
  'outcomes',
  'open_questions'
);

create type content_language as enum ('tr', 'en');

create type vote_outcome as enum ('unanimous', 'majority', 'carried_with_dissent', 'deferred');

create type decision_status as enum ('in_force', 'implemented', 'rescinded', 'suspended');

create type action_status as enum ('open', 'in_progress', 'blocked', 'done', 'cancelled');

create type question_status as enum ('open', 'answered', 'escalated', 'dropped');

-- ---------------------------------------------------------------------------
-- Meetings
-- ---------------------------------------------------------------------------

create table meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  held_at timestamptz not null,
  location text,
  kind meeting_kind not null default 'internal',
  priority priority_level not null default 'normal',
  status meeting_status not null default 'planned',
  minutes_status minutes_status not null default 'draft',
  prepared_by uuid references profiles (id) on delete set null,

  -- M3-08: "this meeting continues X". One subject followed across months is
  -- otherwise scattered across rows with nothing joining them.
  continues_meeting_id uuid references meetings (id) on delete set null,

  constraint meetings_title_not_blank check (btrim(title) <> ''),
  constraint meetings_not_its_own_sequel check (continues_meeting_id <> id)
);

select app.add_common_columns('meetings');
create index meetings_held_at_idx on meetings (held_at desc);
create index meetings_continues_idx on meetings (continues_meeting_id);

-- ---------------------------------------------------------------------------
-- Who was there (M3-02)
-- ---------------------------------------------------------------------------

create table meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  role_at_meeting attendance_role not null default 'participant',
  -- Invited and present are different facts, and the difference is what a
  -- quorum rule is about.
  attended boolean not null default true,
  note text,
  added_at timestamptz not null default now()
);

select app.add_party_columns('meeting_attendees');

create unique index meeting_attendees_profile_key
  on meeting_attendees (meeting_id, profile_id) where profile_id is not null;
create unique index meeting_attendees_stakeholder_key
  on meeting_attendees (meeting_id, stakeholder_id) where stakeholder_id is not null;

create trigger meeting_attendees_audit
  after insert or update or delete on meeting_attendees
  for each row execute function app.record_audit();

-- ---------------------------------------------------------------------------
-- The note (M3-03, M3-10)
-- ---------------------------------------------------------------------------
--
-- Held verbatim, in both languages, under the headings the team already uses.
-- The structured rows below are derived from it rather than replacing it: the
-- note is what was written at the time, and what a Notion page migrates into.
--
-- A translation that arrived by machine says so until a person agrees with
-- it. An unmarked machine translation of a board minute is a liability.

create table meeting_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  section note_section not null,
  language content_language not null,
  body text not null,
  is_machine_translation boolean not null default false,
  approved_by uuid references profiles (id) on delete set null,
  approved_at timestamptz,

  unique (meeting_id, section, language)
);

select app.add_common_columns('meeting_notes');

-- M3-15: once the minutes are final they are the record. Correcting one is an
-- addendum, which is a new note on a new meeting, not a quiet edit of this.
create or replace function app.refuse_final_minute_edit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting uuid := case tg_op when 'DELETE' then old.meeting_id else new.meeting_id end;
begin
  if exists (select 1 from meetings m where m.id = v_meeting and m.minutes_status = 'final') then
    raise exception 'the minutes of this meeting are final and cannot be %',
      case tg_op when 'DELETE' then 'deleted' else 'edited' end
      using errcode = 'insufficient_privilege';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger meeting_notes_final_is_final
  before update or delete on meeting_notes
  for each row execute function app.refuse_final_minute_edit();

-- And the status itself only moves forwards.
create or replace function app.refuse_minutes_reopening()
returns trigger
language plpgsql
as $$
begin
  if old.minutes_status = 'final' and new.minutes_status <> 'final' then
    raise exception 'minutes that have been made final cannot be reopened'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger meetings_minutes_are_one_way
  before update on meetings
  for each row execute function app.refuse_minutes_reopening();

-- ---------------------------------------------------------------------------
-- Decisions (M3-04)
-- ---------------------------------------------------------------------------

create table decisions (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: not every decision is taken in a meeting, and one taken by
  -- correspondence still has to be recorded somewhere.
  meeting_id uuid references meetings (id) on delete set null,
  reference_no text,
  text_en text,
  text_tr text,
  rationale_en text,
  rationale_tr text,
  -- The body that took it: Board of Trustees, Board of Directors, and so on.
  organ text,
  vote vote_outcome,
  decided_on date not null default current_date,
  status decision_status not null default 'in_force',

  -- A decision nobody can read in either language is not a record of
  -- anything.
  constraint decisions_has_text check (
    btrim(coalesce(text_en, '')) <> '' or btrim(coalesce(text_tr, '')) <> ''
  )
);

select app.add_common_columns('decisions');
create index decisions_meeting_idx on decisions (meeting_id);
create unique index decisions_reference_key on decisions (lower(btrim(reference_no)))
  where reference_no is not null;

-- Who voted against, which is the part that gets left out of minutes and is
-- the part that matters later.
create table decision_dissents (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisions (id) on delete cascade,
  note text,
  recorded_at timestamptz not null default now()
);

select app.add_party_columns('decision_dissents');

create trigger decision_dissents_audit
  after insert or update or delete on decision_dissents
  for each row execute function app.record_audit();

-- What the decision rests on (M3-04).
create table decision_documents (
  decision_id uuid not null references decisions (id) on delete cascade,
  document_id uuid not null references document_vault (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (decision_id, document_id)
);

create trigger decision_documents_audit
  after insert or update or delete on decision_documents
  for each row execute function app.record_audit();

-- ---------------------------------------------------------------------------
-- Actions (M3-05, M3-06)
-- ---------------------------------------------------------------------------
--
-- One owner and one date, both required by the table rather than by a
-- convention. Shared ownership is how an action ends up belonging to nobody,
-- and an action with no date cannot be late, so it is never chased.

create table action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings (id) on delete set null,
  decision_id uuid references decisions (id) on delete set null,
  text_en text,
  text_tr text,
  due_date date not null,
  status action_status not null default 'open',
  priority priority_level not null default 'normal',
  completed_at timestamptz,
  completion_note text,

  constraint action_items_has_text check (
    btrim(coalesce(text_en, '')) <> '' or btrim(coalesce(text_tr, '')) <> ''
  ),
  constraint action_items_done_is_dated check (
    (status = 'done') = (completed_at is not null)
  )
);

-- The owner: a portal user or someone in the stakeholder register. An
-- external owner is the ordinary case here, not the exception — a minister
-- who undertakes to make a call is exactly the kind of commitment that
-- currently disappears into a paragraph.
select app.add_party_columns('action_items', 'owner_');

select app.add_common_columns('action_items');
create index action_items_due_idx on action_items (due_date) where status <> 'done';
create index action_items_owner_profile_idx on action_items (owner_profile_id);
create index action_items_owner_stakeholder_idx on action_items (owner_stakeholder_id);
create index action_items_meeting_idx on action_items (meeting_id);

create or replace function app.stamp_action_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger action_items_completion_stamp
  before insert or update on action_items
  for each row execute function app.stamp_action_completion();

-- ---------------------------------------------------------------------------
-- Open questions (M3-09)
-- ---------------------------------------------------------------------------
--
-- Where the trustees disagree, or where nobody yet knows, the disagreement
-- itself is the record. Today those differences live in people's heads and in
-- the gaps between meeting notes; unresolved assessments among the trustees
-- are a live example. A question here has an owner and a date by which it
-- should have an answer, so it cannot quietly stop being asked.

create table open_questions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings (id) on delete set null,
  question_en text,
  question_tr text,
  detail_en text,
  detail_tr text,
  status question_status not null default 'open',
  target_resolution_date date,
  answer_en text,
  answer_tr text,
  answered_at timestamptz,

  constraint open_questions_has_text check (
    btrim(coalesce(question_en, '')) <> '' or btrim(coalesce(question_tr, '')) <> ''
  )
);

select app.add_party_columns('open_questions', 'owner_');
select app.add_common_columns('open_questions');
create index open_questions_status_idx on open_questions (status, target_resolution_date);

-- Who is on which side of it.
create table open_question_parties (
  id uuid primary key default gen_random_uuid(),
  open_question_id uuid not null references open_questions (id) on delete cascade,
  position_en text,
  position_tr text,
  added_at timestamptz not null default now()
);

select app.add_party_columns('open_question_parties');

create trigger open_question_parties_audit
  after insert or update or delete on open_question_parties
  for each row execute function app.record_audit();

-- ---------------------------------------------------------------------------
-- Who may see what
-- ---------------------------------------------------------------------------

-- Reads meeting_attendees, which is why that table is enabled but not forced
-- below: forcing it would put this function's own query back through the
-- policy that calls it.
create or replace function app.is_meeting_attendee(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from meeting_attendees a
    left join stakeholders s on s.id = a.stakeholder_id
    where a.meeting_id = p_meeting
      and (a.profile_id = auth.uid() or s.profile_id = auth.uid())
  );
$$;

-- An outside advocate who sat in a legal meeting reads it; anyone else
-- outside the organisation does not, whatever the tier says. Being in the
-- room is the scope rule here, exactly as an assigned case is for a lawyer.
create or replace function app.can_see_meeting(p_conf confidentiality, p_id uuid)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf, 'meetings', p_id)
    and (
      p_conf = 'public'
      or app.is_internal()
      or app.is_meeting_attendee(p_id)
      or app.has_grant('meetings', p_id, 'read')
    );
$$;

-- For rows that hang off a meeting. A decision taken outside any meeting is
-- internal business until somebody shares it deliberately.
create or replace function app.can_see_via_meeting(p_conf confidentiality, p_meeting uuid)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf)
    and (
      p_conf = 'public'
      or app.is_internal()
      or (p_meeting is not null and app.is_meeting_attendee(p_meeting))
    );
$$;

alter table meetings enable row level security;
alter table meetings force row level security;

create policy meetings_read on meetings
  for select using (app.can_see_meeting(confidentiality, id));

create policy meetings_insert on meetings
  for insert with check (app.can_minute());

create policy meetings_update on meetings
  for update
  using (app.can_see_meeting(confidentiality, id) and app.can_minute())
  with check (app.can_minute());

create policy meetings_delete on meetings
  for delete
  using (app.can_see_meeting(confidentiality, id) and app.can_minute());

-- Enabled, deliberately not forced: see app.is_meeting_attendee above.
alter table meeting_attendees enable row level security;

create policy meeting_attendees_read on meeting_attendees
  for select using (
    exists (
      select 1 from meetings m
      where m.id = meeting_id and app.can_see_meeting(m.confidentiality, m.id)
    )
  );

-- Split per command rather than written as one `for all`: a permissive
-- policy ORs into SELECT, so a write rule stated that way silently widens
-- who can read. That mistake was already made once, in 0003, and caught by
-- these tests.
create policy meeting_attendees_insert on meeting_attendees
  for insert with check (app.can_minute());

create policy meeting_attendees_update on meeting_attendees
  for update
  using (exists (
      select 1 from meetings m
      where m.id = meeting_id and app.can_see_meeting(m.confidentiality, m.id)
    ) and app.can_minute())
  with check (app.can_minute());

create policy meeting_attendees_delete on meeting_attendees
  for delete
  using (exists (
      select 1 from meetings m
      where m.id = meeting_id and app.can_see_meeting(m.confidentiality, m.id)
    ) and app.can_minute());

alter table meeting_notes enable row level security;
alter table meeting_notes force row level security;

create policy meeting_notes_read on meeting_notes
  for select using (
    app.can_read(confidentiality, 'meeting_notes', id)
    and exists (
      select 1 from meetings m
      where m.id = meeting_id and app.can_see_meeting(m.confidentiality, m.id)
    )
  );

create policy meeting_notes_insert on meeting_notes
  for insert with check (app.can_minute());

create policy meeting_notes_update on meeting_notes
  for update
  using (
    app.can_read(confidentiality, 'meeting_notes', id)
    and app.can_minute()
  )
  with check (app.can_minute());

create policy meeting_notes_delete on meeting_notes
  for delete
  using (
    app.can_read(confidentiality, 'meeting_notes', id)
    and app.can_minute()
  );

alter table decisions enable row level security;
alter table decisions force row level security;

create policy decisions_read on decisions
  for select using (app.can_see_via_meeting(confidentiality, meeting_id));

create policy decisions_insert on decisions
  for insert with check (app.can_assess());

create policy decisions_update on decisions
  for update
  using (app.can_see_via_meeting(confidentiality, meeting_id) and app.can_assess())
  with check (app.can_assess());

create policy decisions_delete on decisions
  for delete
  using (app.can_see_via_meeting(confidentiality, meeting_id) and app.can_assess());

alter table decision_dissents enable row level security;
alter table decision_dissents force row level security;

create policy decision_dissents_read on decision_dissents
  for select using (
    exists (
      select 1 from decisions d
      where d.id = decision_id and app.can_see_via_meeting(d.confidentiality, d.meeting_id)
    )
  );

create policy decision_dissents_insert on decision_dissents
  for insert with check (app.can_assess());

create policy decision_dissents_update on decision_dissents
  for update
  using (exists (
      select 1 from decisions d
      where d.id = decision_id and app.can_see_via_meeting(d.confidentiality, d.meeting_id)
    ) and app.can_assess())
  with check (app.can_assess());

create policy decision_dissents_delete on decision_dissents
  for delete
  using (exists (
      select 1 from decisions d
      where d.id = decision_id and app.can_see_via_meeting(d.confidentiality, d.meeting_id)
    ) and app.can_assess());

alter table decision_documents enable row level security;
alter table decision_documents force row level security;

-- Both ends have to be visible: the list of documents a decision rests on is
-- itself a statement about those documents.
create policy decision_documents_read on decision_documents
  for select using (
    exists (
      select 1 from decisions d
      where d.id = decision_id and app.can_see_via_meeting(d.confidentiality, d.meeting_id)
    )
    and exists (
      select 1 from document_vault v
      where v.id = document_id and app.can_read(v.confidentiality, 'document_vault', v.id)
    )
  );

create policy decision_documents_insert on decision_documents
  for insert with check (app.can_assess());

create policy decision_documents_update on decision_documents
  for update
  using (exists (
      select 1 from decisions d
      where d.id = decision_id and app.can_see_via_meeting(d.confidentiality, d.meeting_id)
    ) and app.can_assess())
  with check (app.can_assess());

create policy decision_documents_delete on decision_documents
  for delete
  using (exists (
      select 1 from decisions d
      where d.id = decision_id and app.can_see_via_meeting(d.confidentiality, d.meeting_id)
    ) and app.can_assess());

alter table action_items enable row level security;
alter table action_items force row level security;

-- An action reaches its owner even when the meeting behind it does not: a
-- contractor who undertook to do something must be able to see what they
-- undertook, without being shown the discussion around it.
create or replace function app.owns_action(p_profile uuid, p_stakeholder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_profile = auth.uid()
    or exists (
      select 1 from stakeholders s
      where s.id = p_stakeholder and s.profile_id = auth.uid()
    );
$$;

create policy action_items_read on action_items
  for select using (
    app.owns_action(owner_profile_id, owner_stakeholder_id)
    or app.can_see_via_meeting(confidentiality, meeting_id)
    or app.has_grant('action_items', id, 'read')
  );

create policy action_items_insert on action_items
  for insert with check (app.can_minute());

-- The owner reports on their own action. What they may not do is redefine it,
-- and a policy cannot express that: it sees the old row or the new one, never
-- both. So the boundary is a trigger, and the policy just says who may write.
create or replace function app.restrict_action_owner_edits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.can_minute() then
    return new;
  end if;

  if new.due_date is distinct from old.due_date
     or new.owner_profile_id is distinct from old.owner_profile_id
     or new.owner_stakeholder_id is distinct from old.owner_stakeholder_id
     or new.meeting_id is distinct from old.meeting_id
     or new.decision_id is distinct from old.decision_id
     or new.text_en is distinct from old.text_en
     or new.text_tr is distinct from old.text_tr
     or new.confidentiality is distinct from old.confidentiality then
    raise exception 'the owner of an action may report on it, not redefine it'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Runs after the completion stamp, which sorts before it by name.
create trigger action_items_owner_limits
  before update on action_items
  for each row execute function app.restrict_action_owner_edits();

create policy action_items_owner_update on action_items
  for update
  using (app.owns_action(owner_profile_id, owner_stakeholder_id))
  with check (app.owns_action(owner_profile_id, owner_stakeholder_id));

create policy action_items_manage_update on action_items
  for update
  using (app.can_see_via_meeting(confidentiality, meeting_id) and app.can_minute())
  with check (app.can_minute());

create policy action_items_delete on action_items
  for delete
  using (app.can_see_via_meeting(confidentiality, meeting_id) and app.can_minute());

alter table open_questions enable row level security;
alter table open_questions force row level security;

create policy open_questions_read on open_questions
  for select using (
    app.owns_action(owner_profile_id, owner_stakeholder_id)
    or app.can_see_via_meeting(confidentiality, meeting_id)
  );

create policy open_questions_insert on open_questions
  for insert with check (app.can_minute());

create policy open_questions_update on open_questions
  for update
  using (app.can_see_via_meeting(confidentiality, meeting_id) and app.can_minute())
  with check (app.can_minute());

create policy open_questions_delete on open_questions
  for delete
  using (app.can_see_via_meeting(confidentiality, meeting_id) and app.can_minute());

alter table open_question_parties enable row level security;
alter table open_question_parties force row level security;

create policy open_question_parties_read on open_question_parties
  for select using (
    exists (
      select 1 from open_questions q
      where q.id = open_question_id
        and app.can_see_via_meeting(q.confidentiality, q.meeting_id)
    )
  );

create policy open_question_parties_insert on open_question_parties
  for insert with check (app.can_minute());

create policy open_question_parties_update on open_question_parties
  for update
  using (exists (
      select 1 from open_questions q
      where q.id = open_question_id
        and app.can_see_via_meeting(q.confidentiality, q.meeting_id)
    ) and app.can_minute())
  with check (app.can_minute());

create policy open_question_parties_delete on open_question_parties
  for delete
  using (exists (
      select 1 from open_questions q
      where q.id = open_question_id
        and app.can_see_via_meeting(q.confidentiality, q.meeting_id)
    ) and app.can_minute());

-- ---------------------------------------------------------------------------
-- The agenda builds itself (M3-07)
-- ---------------------------------------------------------------------------
--
-- Everything still open, with who owes it and by when. A new meeting starts
-- from this rather than from a blank page, which is the mechanism behind "no
-- action disappears quietly": the only way off this list is to finish the
-- thing or to say out loud that it is cancelled.

create view meeting_agenda_candidates with (security_invoker = true) as
select
  'action'::text as item_kind,
  a.id,
  a.text_en,
  a.text_tr,
  a.due_date as due_on,
  a.status::text as status,
  a.priority,
  a.meeting_id as raised_at_meeting_id,
  a.owner_profile_id,
  a.owner_stakeholder_id,
  (a.due_date < current_date) as overdue,
  a.confidentiality
from action_items a
where a.status in ('open', 'in_progress', 'blocked')

union all

select
  'question'::text,
  q.id,
  q.question_en,
  q.question_tr,
  q.target_resolution_date,
  q.status::text,
  'normal'::priority_level,
  q.meeting_id,
  q.owner_profile_id,
  q.owner_stakeholder_id,
  (q.target_resolution_date is not null and q.target_resolution_date < current_date),
  q.confidentiality
from open_questions q
where q.status in ('open', 'escalated');

comment on view meeting_agenda_candidates is
  'Open actions and unanswered questions, for the next meeting to start from '
  '(M3-07). Rows are filtered by the same policies as their own tables.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  meetings, meeting_attendees, meeting_notes,
  decisions, decision_dissents, decision_documents,
  action_items, open_questions, open_question_parties
  to authenticated;

grant select on meeting_agenda_candidates to authenticated;
grant execute on all functions in schema app to authenticated;

drop function app.add_common_columns(regclass);
drop function app.add_party_columns(regclass, text);
