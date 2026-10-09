-- Attachments, quoting and reactions on a message (M11-13).
--
-- Three small features, and each one has an obvious cheap shape that this
-- portal should not take.
--
-- **Attachment.** `thread_messages.attachment_url` has been there since 0002:
-- a free-text URL. Nobody knows whether it resolves, it is outside the
-- vault's confidentiality model and outside its download log, and it can
-- point anywhere — which means a message in the trustee channel could hand
-- somebody a file the vault would have refused them. So an attachment here is
-- a vault document, by foreign key. It inherits that document's tier, its
-- digest, and the record of who opened it. The old column is dropped rather
-- than left as a second way of doing the same thing badly; it is empty, which
-- is checked below before dropping it, because dropping a column with data in
-- it would be deleting evidence.
--
-- **Quoting.** The cheap shape is to copy the quoted text into the new
-- message. Messages here are already append-only — 0027's
-- `app.refuse_message_edit` refuses every update — so the usual argument
-- against a copy, that it drifts when the original is edited, does not apply
-- to this portal. Two others do, and they are the reasons this is a
-- reference:
--
--   * a copy can misquote at the moment it is written. Nothing checks that
--     the text a client copied is the text that is in the row, and a
--     quotation nobody can check against its source is just a sentence with
--     somebody else's name on it;
--
--   * and a copy escapes. The quoted words would sit in the new message's
--     row, carrying the new message's tier and the new thread's membership,
--     so a restricted message could be quoted into a channel its author was
--     never in. A reference cannot do that: the words are read from the
--     original row under the reader's own clearance, and a reader who may
--     not see it is told so instead.
--
-- **Reaction.** The cheap shape is a count. On a thread where decisions get
-- taken, an anonymous count is a vote nobody can audit, so a reaction is
-- recorded per person and the count can be opened. And a reaction is not a
-- position: the stakeholder register has `stance` for that, and the screen
-- says so, because a thumb on a message is not somebody agreeing to
-- anything.
--
-- Requirements: M11-13.

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
-- A tier that is recorded and not enforced (found while building this)
-- ---------------------------------------------------------------------------

-- 0027's read policy gates a message on its thread alone:
--
--   create policy thread_messages_read on thread_messages
--     for select using (
--       exists (select 1 from communication_threads t
--               where t.id = thread_messages.thread_id));
--
-- The subquery does carry the thread's own policies, so a thread nobody may
-- read hides its messages. What it never looks at is the message's own
-- `confidentiality`, which `app.add_common_columns` gives every table in this
-- portal. So the column was recorded and not enforced: a trustee could mark a
-- remark `restricted` inside an `internal` thread and every member of that
-- channel would read it — including the surveyor, whom 0027's own seed adds
-- to the trustee channel by name at `internal` clearance.
--
-- That is the exact defect this project exists to remove, and it is worse
-- than having no tier at all, because the person who set it believes they
-- classified something. Found while writing the quoting test below: the
-- assertion that a reader below the tier sees none of a quoted message came
-- back with the quoted words in it.
--
-- The insert side needs it too, or somebody could write a message at a tier
-- they cannot themselves read — which would be classifying something out of
-- their own sight.

drop policy if exists thread_messages_read on thread_messages;
create policy thread_messages_read on thread_messages
  for select using (
    app.can_read(confidentiality)
    and exists (
      select 1 from communication_threads t
      where t.id = thread_messages.thread_id
    )
  );

drop policy if exists thread_messages_insert on thread_messages;
create policy thread_messages_insert on thread_messages
  for insert with check (
    sender_id = auth.uid()
    and app.can_read(confidentiality)
    and exists (
      select 1 from communication_threads t
      where t.id = thread_messages.thread_id
        and t.closed_at is null
        -- M11-11: one-way means one-way. The person who made the
        -- announcement may add to it; nobody else may reply into it.
        and (t.kind = 'discussion' or t.created_by = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- The free-text URL goes
-- ---------------------------------------------------------------------------

-- Checked before dropped. A column with data in it is evidence, and this
-- migration would be deleting it; if anything is there the migration stops
-- and somebody moves those files into the vault first.
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows
  from thread_messages where attachment_url is not null;

  if v_rows > 0 then
    raise exception
      '% message(s) carry an attachment_url. Move those files into the vault '
      'before this migration drops the column; dropping it now would delete '
      'the only record of them.', v_rows
      using errcode = 'check_violation';
  end if;
end;
$$;

alter table thread_messages drop column attachment_url;

-- ---------------------------------------------------------------------------
-- An attachment is a vault document
-- ---------------------------------------------------------------------------

create table message_attachments (
  thread_message_id uuid not null references thread_messages (id) on delete cascade,
  -- restrict, not cascade: a file somebody attached to a message about it is
  -- a file that was discussed, and removing it from the vault would leave the
  -- discussion pointing at nothing.
  document_id uuid not null references document_vault (id) on delete restrict,
  note text,
  attached_by uuid references profiles (id) default auth.uid(),
  attached_at timestamptz not null default now(),
  primary key (thread_message_id, document_id)
);

alter table message_attachments enable row level security;
alter table message_attachments force row level security;

create index message_attachments_document_idx on message_attachments (document_id);

comment on table message_attachments is
  'A file on a message, as a vault document (M11-13). By foreign key rather '
  'than by URL, so it carries the document''s own tier and its download log: '
  'a message must not be a way around the vault.';

-- ---------------------------------------------------------------------------
-- A quote is a reference
-- ---------------------------------------------------------------------------

alter table thread_messages
  add column quoted_message_id uuid references thread_messages (id) on delete set null,
  add constraint thread_messages_not_quoting_itself
    check (quoted_message_id is null or quoted_message_id <> id);

comment on column thread_messages.quoted_message_id is
  'The message this one quotes (M11-13). A reference, never a copy: a copied '
  'quotation drifts from what was said, and this one cannot.';

-- A quote across threads would move text out of the channel it was said in,
-- past the membership rule that decides who is in that conversation.
create or replace function app.quote_stays_in_its_thread()
returns trigger
language plpgsql
as $$
declare
  v_thread uuid;
begin
  if new.quoted_message_id is null then
    return new;
  end if;

  select thread_id into v_thread
  from thread_messages where id = new.quoted_message_id;

  if v_thread is distinct from new.thread_id then
    raise exception
      'a quote cannot cross threads: that would move what was said past the '
      'membership rule of the channel it was said in'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger thread_messages_quote_stays
  before insert or update on thread_messages
  for each row execute function app.quote_stays_in_its_thread();

-- ---------------------------------------------------------------------------
-- A reaction is a person, not a number
-- ---------------------------------------------------------------------------

create table message_reactions (
  thread_message_id uuid not null references thread_messages (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  -- A short token, not free text: a "reaction" that can hold a sentence is a
  -- reply with no author line.
  reaction text not null check (reaction in ('agree', 'disagree', 'seen', 'question')),
  reacted_at timestamptz not null default now(),
  primary key (thread_message_id, profile_id, reaction)
);

alter table message_reactions enable row level security;
alter table message_reactions force row level security;

comment on table message_reactions is
  'Who reacted to a message and how (M11-13). Per person, so a count on a '
  'thread where decisions get taken can be opened; and a reaction is not a '
  'recorded position — the stakeholder register has stance for that.';

-- ---------------------------------------------------------------------------
-- What a reader is shown
-- ---------------------------------------------------------------------------

create view message_detail with (security_invoker = true) as
select
  m.id as thread_message_id,
  m.thread_id,
  m.sender_id,
  m.body,
  m.created_at,
  m.quoted_message_id,
  -- The quoted words come from the original row, every time it is read, so
  -- the quotation is whatever was actually said. Null where the reader may
  -- not see the original: the screen says so rather than showing text that
  -- escaped its thread.
  (
    select q.body from thread_messages q
    where q.id = m.quoted_message_id
  ) as quoted_body,
  (
    select p.full_name from profiles p
    where p.id = (select q.sender_id from thread_messages q where q.id = m.quoted_message_id)
  ) as quoted_sender_name,
  -- Said apart from the body being null, because "nothing quoted" and
  -- "quoted something you cannot read" are different sentences.
  (
    m.quoted_message_id is not null
    and not exists (select 1 from thread_messages q where q.id = m.quoted_message_id)
  ) as quoted_message_not_readable,
  (
    select count(*) from message_attachments a where a.thread_message_id = m.id
  ) as attachments,
  (
    select count(*) from message_reactions r where r.thread_message_id = m.id
  ) as reactions,
  m.confidentiality
from thread_messages m;

comment on view message_detail is
  'A message with its quotation resolved from the original row (M11-13), so '
  'it cannot drift, and with quoted_message_not_readable set where the reader '
  'may not see what was quoted.';

create view message_reaction_detail with (security_invoker = true) as
select
  r.thread_message_id,
  r.reaction,
  count(*) as people,
  -- Openable on purpose: an anonymous count on a thread where decisions are
  -- taken is a vote nobody can audit.
  coalesce(array_agg(p.full_name order by p.full_name), '{}'::text[]) as who
from message_reactions r
join profiles p on p.id = r.profile_id
group by r.thread_message_id, r.reaction;

comment on view message_reaction_detail is
  'Who reacted, not how many (M11-13). The names are the point: a count '
  'nobody can open is not evidence of anything.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- Attachments and reactions follow the message, and the message follows the
-- channel. Attaching additionally requires being able to read the document:
-- a message must not become a way to hand somebody a file the vault would
-- have refused them.
create policy message_attachments_read on message_attachments
  for select using (
    exists (
      select 1 from thread_messages m
      where m.id = thread_message_id and app.can_read(m.confidentiality)
    )
    and app.can_see_document(document_id)
  );
create policy message_attachments_insert on message_attachments
  for insert with check (
    attached_by = auth.uid()
    and exists (
      select 1 from thread_messages m
      where m.id = thread_message_id and app.can_read(m.confidentiality)
    )
    and app.can_see_document(document_id)
  );
create policy message_attachments_delete on message_attachments
  for delete using (
    attached_by = auth.uid()
    and exists (
      select 1 from thread_messages m
      where m.id = thread_message_id and app.can_read(m.confidentiality)
    )
  );

create policy message_reactions_read on message_reactions
  for select using (
    exists (
      select 1 from thread_messages m
      where m.id = thread_message_id and app.can_read(m.confidentiality)
    )
  );
-- Only your own: a reaction recorded in somebody else's name is a forged
-- position, which is the whole reason these are per person.
create policy message_reactions_insert on message_reactions
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from thread_messages m
      where m.id = thread_message_id and app.can_read(m.confidentiality)
    )
  );
create policy message_reactions_delete on message_reactions
  for delete using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on message_attachments from authenticated;
grant select, insert, delete on message_attachments to authenticated;

revoke all on message_reactions from authenticated;
grant select, insert, delete on message_reactions to authenticated;

grant select on message_detail, message_reaction_detail to authenticated;

-- 0002 gave thread_messages no column-level grants, so the new column needs
-- none of its own; the table-wide insert covers it.

drop function app.add_common_columns(regclass);

select app.reset_function_grants();
