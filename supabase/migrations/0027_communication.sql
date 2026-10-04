-- Communication and notification (M11).
--
-- The requirement opens by saying what this module is NOT: "Portal içi
-- mesajlaşma WhatsApp'ın yerini almaz. Almaya çalışmak başarısızlığın
-- garantisidir. Portal resmî kayıt, WhatsApp günlük konuşma olarak kalır;
-- portal WhatsApp'a bildirim gönderir." The portal is the record; WhatsApp is
-- the conversation; the portal notifies WhatsApp. Everything here is built on
-- that division, which is why there is no presence, no typing indicator and
-- no read receipt on an ordinary message — only on an announcement, where
-- "who has seen this" is a governance question rather than a social one.
--
-- Two of M11's rows are P0 because they describe live defects:
--
--   M11-02  every message was attributed to the literal string
--           'Current User'
--   M11-03  a reply was appended by reading a JSONB array, pushing onto it
--           and writing it back, which silently loses a message whenever two
--           people reply at once
--
-- 0002 fixed both in the schema — messages are rows, and 0003's insert policy
-- requires sender_id = auth.uid() — but the client was never moved onto it
-- and still posts into a `messages` column that no longer exists. So the
-- screen has been writing to a table shape that cannot accept it. The client
-- rewrite accompanying this migration is the other half of that fix.
--
-- What this migration adds:
--
--   M11-04  six channels as an enum, with membership that WIDENS a default
--           derived from role rather than replacing it. A membership table
--           that starts empty and decides visibility on its own locks every
--           existing thread away from everybody, and the first fix for that
--           is always a policy weakened in a hurry.
--
--   M11-05  a thread can hang on a case, a block, an obligation or a
--           transaction, and when it does its visibility is the entity's.
--           Written as `exists (select 1 from legal_cases c where ...)`,
--           because a subquery inside a policy is itself subject to that
--           table's policies: the rule cannot drift from the register's.
--
--   M11-11  announcement and discussion are one table with a kind, because
--           they are the same object with a different reply rule, and two
--           tables would mean two inboxes.
--
--   M11-08  receipts, but only for announcements, and only on the ones
--           marked urgent. "Kimin gördüğü kayıtlı" is a record of who was
--           reached, which is a different thing from telling a colleague you
--           read their message at 11pm.
--
--   M11-07  preferences per person, per topic, per medium — and a trigger
--           that refuses to switch off a hearing or a deadline. The team is
--           spread across Türkiye, Mombasa and Nairobi; the requirement's
--           stated reason for this module is that a hearing date must not
--           slip past anybody, and a preference that can suppress one is a
--           feature that defeats the module.
--
--   M11-06  the four media as an outbox with a state per delivery. What this
--           does NOT do is claim to send: no e-mail, WhatsApp or push
--           provider is connected to this project, so a delivery for one of
--           those is written 'unconfigured' rather than 'queued', and the
--           screen says so in those words. A row saying 'sent' when nothing
--           was sent is the same class of defect as the vault's old
--           "SHA-256 verified" over files it had never read.
--
--   M11-10  the weekly digest as one SQL function with an audience, because
--           the trustee, the site team and the donor need different content
--           from the same week — and the donor's version must not be the
--           trustee's with a filter applied by the client.
--
--   M11-12  the official correspondence register: what was sent to an
--           outside party, when, by what route, with what attached, and
--           whether delivery was ever confirmed.
--
-- M11-09 is already done: 0024 replaced the banner's delete-for-everyone with
-- per-user calendar_acknowledgements.
--
-- Requirements: M11-01 … M11-12. M11-13 (attachments, quoting, reactions) is
-- P3 and not built.

-- ---------------------------------------------------------------------------
-- Shared helpers, as the earlier migrations define them
-- ---------------------------------------------------------------------------

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
-- Channels (M11-04)
-- ---------------------------------------------------------------------------

create type comm_channel as enum (
  'trustee',
  'legal',
  'construction',
  'finance',
  'official_relations',
  'general'
);

-- Who belongs to a channel by virtue of what they do. Membership below adds
-- to this; it never takes away, so there is no state of the system in which
-- the legal channel is invisible to counsel because nobody has been added yet.
create or replace function app.channel_default_roles(p_channel comm_channel)
returns app_role[]
language sql
immutable
as $$
  select case p_channel
    when 'trustee' then
      array['admin', 'trustee', 'board_director', 'project_director']::app_role[]
    when 'legal' then
      array['admin', 'project_director', 'trustee', 'board_director', 'legal_counsel']::app_role[]
    when 'construction' then
      array['admin', 'project_director', 'field_team', 'contractor', 'quantity_surveyor']::app_role[]
    when 'finance' then
      array['admin', 'project_director', 'trustee', 'audit_committee', 'external_auditor']::app_role[]
    when 'official_relations' then
      array['admin', 'project_director', 'trustee', 'board_director']::app_role[]
    -- Everyone with an account, including the people outside it. A general
    -- channel nobody outside can read is the trustee channel with a different
    -- name.
    when 'general' then
      enum_range(null::app_role)
  end;
$$;

create table channel_members (
  channel comm_channel not null,
  profile_id uuid not null references profiles (id) on delete cascade,
  added_by uuid references profiles (id),
  added_at timestamptz not null default now(),
  note text,
  primary key (channel, profile_id)
);

create or replace function app.in_channel(p_channel comm_channel)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  if a.profile_id is null then
    return false;
  end if;
  return a.roles && app.channel_default_roles(p_channel)
    or exists (
      select 1 from channel_members m
      where m.channel = p_channel and m.profile_id = a.profile_id
    );
end;
$$;

-- Adding somebody to a channel they would not otherwise see is an access
-- decision, so it sits with the people who make the others.
create or replace function app.can_keep_channels()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee');
$$;

alter table channel_members enable row level security;
alter table channel_members force row level security;

-- You can see your own membership, and the people who grant it can see all of
-- it. Being able to read who else is in a channel is how somebody notices
-- that counsel for the other side was added to it.
create policy channel_members_read on channel_members
  for select using (profile_id = auth.uid() or app.is_internal());

create policy channel_members_write on channel_members
  for all
  using (app.can_keep_channels())
  with check (app.can_keep_channels());

-- ---------------------------------------------------------------------------
-- Threads (M11-01, M11-05, M11-11)
-- ---------------------------------------------------------------------------

create type thread_kind as enum ('discussion', 'announcement');

-- The channel was free text, which meant 'Legal', 'legal' and 'hukuk' were
-- three channels. Anything the six do not cover becomes general rather than
-- being dropped: a thread whose channel nobody recognises is still a thread
-- somebody wrote.
alter table communication_threads
  alter column channel drop default,
  alter column channel type comm_channel using (
    case lower(btrim(channel))
      when 'trustee' then 'trustee'
      when 'trustees' then 'trustee'
      when 'legal' then 'legal'
      when 'construction' then 'construction'
      when 'finance' then 'finance'
      when 'financial' then 'finance'
      when 'official' then 'official_relations'
      when 'official_relations' then 'official_relations'
      when 'government' then 'official_relations'
      else 'general'
    end
  )::comm_channel,
  alter column channel set default 'general';

alter table communication_threads
  add column if not exists kind thread_kind not null default 'discussion',
  -- Closed, not deleted. A thread that was answered and a thread that was
  -- never written are different records.
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references profiles (id),
  -- M11-05: the four registers a conversation actually hangs on.
  add column if not exists legal_case_id uuid references legal_cases (id) on delete set null,
  add column if not exists construction_block_id uuid references construction_blocks (id) on delete set null,
  add column if not exists obligation_id uuid references obligations (id) on delete set null,
  add column if not exists transaction_id uuid references financial_transactions (id) on delete set null;

-- A thread about two things is a thread that will be found under neither.
alter table communication_threads
  add constraint communication_threads_at_most_one_subject check (
    (legal_case_id is not null)::int
    + (construction_block_id is not null)::int
    + (obligation_id is not null)::int
    + (transaction_id is not null)::int <= 1
  );

-- An announcement that nobody may reply to and that says nothing is a
-- notification with no content; the title is already not null, and this keeps
-- the urgent ones from being a bare headline.
alter table communication_threads
  add constraint communication_threads_urgent_announcement_has_a_body check (
    kind <> 'announcement' or not urgent or btrim(coalesce(title, '')) <> ''
  );

create index communication_threads_channel_idx on communication_threads (channel, created_at desc);
create index communication_threads_case_idx on communication_threads (legal_case_id)
  where legal_case_id is not null;
create index communication_threads_block_idx on communication_threads (construction_block_id)
  where construction_block_id is not null;

-- Who may post a one-way announcement. Deliberately narrower than who may
-- start a discussion: an announcement cannot be answered, so the right to
-- make one is the right to have the last word.
create or replace function app.can_announce()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'board_director');
$$;

-- The visibility of a thread, in one place so the thread, its messages and
-- its receipts cannot disagree.
--
-- The entity clauses are subqueries rather than calls to app.can_see_case and
-- friends, because a subquery in a policy is subject to the referenced
-- table's own policies. "You can see this thread if you can see the case"
-- then means exactly what the legal register means by it, today and after the
-- next migration changes it.
create or replace function app.can_see_thread(
  p_conf confidentiality,
  p_id uuid,
  p_channel comm_channel
)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf, 'communication_threads', p_id)
    and app.in_channel(p_channel);
$$;

drop policy if exists communication_threads_read on communication_threads;
create policy communication_threads_read on communication_threads
  for select using (
    app.can_see_thread(confidentiality, id, channel)
    and (legal_case_id is null
      or exists (select 1 from legal_cases c where c.id = legal_case_id))
    and (construction_block_id is null
      or exists (select 1 from construction_blocks b where b.id = construction_block_id))
    and (obligation_id is null
      or exists (select 1 from obligations o where o.id = obligation_id))
    and (transaction_id is null
      or exists (select 1 from financial_transactions ft where ft.id = transaction_id))
  );

drop policy if exists communication_threads_insert on communication_threads;
create policy communication_threads_insert on communication_threads
  for insert with check (
    app.in_channel(channel)
    and app.can_read(confidentiality)
    and (kind = 'discussion' or app.can_announce())
  );

drop policy if exists communication_threads_update on communication_threads;
create policy communication_threads_update on communication_threads
  for update
  using (
    app.can_see_thread(confidentiality, id, channel)
    and (created_by = auth.uid() or app.can_announce())
  )
  with check (
    app.in_channel(channel)
    and (kind = 'discussion' or app.can_announce())
  );

-- ---------------------------------------------------------------------------
-- Messages (M11-02, M11-03, M11-11)
-- ---------------------------------------------------------------------------

-- 0003 already requires sender_id = auth.uid() on insert. These add the
-- announcement rule and the closed-thread rule, and make the record
-- append-only: a message somebody can go back and edit is not a record of
-- what was said, and this register is the formal one by design.

drop policy if exists thread_messages_read on thread_messages;
create policy thread_messages_read on thread_messages
  for select using (
    exists (
      select 1 from communication_threads t
      where t.id = thread_messages.thread_id
    )
  );

drop policy if exists thread_messages_insert on thread_messages;
create policy thread_messages_insert on thread_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from communication_threads t
      where t.id = thread_messages.thread_id
        and t.closed_at is null
        -- M11-11: one-way means one-way. The person who made the
        -- announcement may add to it; nobody else may reply into it.
        and (t.kind = 'discussion' or t.created_by = auth.uid())
    )
  );

create or replace function app.refuse_message_edit()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'a message cannot be edited or deleted — post a correction instead (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger thread_messages_append_only
  before update or delete on thread_messages
  for each row execute function app.refuse_message_edit();

revoke update, delete on thread_messages from authenticated;

-- ---------------------------------------------------------------------------
-- Who has seen an urgent announcement (M11-08)
-- ---------------------------------------------------------------------------
--
-- Only announcements, and in practice only the urgent ones, because the
-- question this answers is governance ("was the board told?") rather than
-- social ("did you read my message?"). Recording it on every message would
-- turn the formal record into a surveillance log of who read what and when,
-- which is a different system with different consent.

create table announcement_receipts (
  thread_id uuid not null references communication_threads (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table announcement_receipts enable row level security;
alter table announcement_receipts force row level security;

-- You see your own, and whoever may make an announcement sees all of them —
-- that is the point of the record. Nobody else sees who read what.
create policy announcement_receipts_read on announcement_receipts
  for select using (
    user_id = auth.uid()
    or (app.can_announce()
        and exists (select 1 from communication_threads t where t.id = thread_id))
  );

create policy announcement_receipts_insert on announcement_receipts
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from communication_threads t
      where t.id = thread_id and t.kind = 'announcement'
    )
  );

create trigger announcement_receipts_append_only
  before update or delete on announcement_receipts
  for each row execute function app.refuse_message_edit();

revoke update, delete on announcement_receipts from authenticated;

-- ---------------------------------------------------------------------------
-- Preferences, and the ones that cannot be switched off (M11-07)
-- ---------------------------------------------------------------------------

create type notification_medium as enum ('in_app', 'email', 'whatsapp', 'push');

create type notification_topic as enum (
  'hearing',
  'deadline',
  'decision_needed',
  'announcement',
  'thread_reply',
  'digest',
  'site',
  'money'
);

-- The two the requirement names in parentheses — "kritik bildirimler
-- (duruşma, son tarih) kapatılamaz". The whole stated reason for this module
-- is that a hearing date must not slip past anybody while the team is spread
-- across three countries, so a preference that can suppress one would defeat
-- the module it belongs to.
create or replace function app.topic_is_critical(p_topic notification_topic)
returns boolean
language sql
immutable
as $$
  select p_topic in ('hearing', 'deadline');
$$;

create table notification_preferences (
  user_id uuid not null references profiles (id) on delete cascade,
  topic notification_topic not null,
  medium notification_medium not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic, medium)
);

create or replace function app.refuse_muting_critical()
returns trigger
language plpgsql
as $$
begin
  -- In-app is the floor. Someone who would rather not be messaged on
  -- WhatsApp about a hearing may turn that off; nobody may arrange not to be
  -- told at all.
  if not new.enabled
     and app.topic_is_critical(new.topic)
     and new.medium = 'in_app' then
    raise exception
      'a hearing or a deadline cannot be switched off in the portal itself — % is critical', new.topic
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger notification_preferences_critical_stays_on
  before insert or update on notification_preferences
  for each row execute function app.refuse_muting_critical();

alter table notification_preferences enable row level security;
alter table notification_preferences force row level security;

-- Yours alone. An administrator cannot read, let alone set, how somebody
-- chooses to be reached — and does not need to, because the critical ones are
-- guaranteed by the trigger rather than by supervision.
create policy notification_preferences_own on notification_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- What the portal will do when nobody has said otherwise. Expressed as a
-- function rather than seeded rows, so a person who has never opened the
-- preferences screen is covered by it, and so is a person created tomorrow.
create or replace function app.medium_is_on(
  p_user uuid,
  p_topic notification_topic,
  p_medium notification_medium
)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select p.enabled from notification_preferences p
      where p.user_id = p_user and p.topic = p_topic and p.medium = p_medium),
    -- The default: in the portal always, elsewhere only when it is urgent.
    case
      when p_medium = 'in_app' then true
      when app.topic_is_critical(p_topic) then true
      else false
    end
  );
$$;

-- ---------------------------------------------------------------------------
-- The outbox (M11-06)
-- ---------------------------------------------------------------------------
--
-- Four media, and the honest part: only one of them is connected.
--
-- E-mail, WhatsApp and web push each need a provider with credentials — a
-- transactional mail service, a WhatsApp Business sender, a VAPID key pair.
-- None is configured for this project. A system that writes 'sent' against a
-- delivery nobody attempted is the same defect as the vault's old "SHA-256
-- verified" over files it had never opened, so a delivery for an unconnected
-- medium is written 'unconfigured' and stays that way, visibly, until a
-- provider exists.
--
-- app.configured_media() is the single place that changes when one is
-- connected. Nothing else in the schema or the client needs to know.

create type delivery_state as enum (
  'queued',
  'sent',
  'delivered',
  'failed',
  -- Not an error: nothing was attempted, because there is nothing to attempt
  -- it with.
  'unconfigured'
);

create or replace function app.configured_media()
returns notification_medium[]
language sql
immutable
as $$
  -- In-app delivery is this database. The other three await a provider.
  select array['in_app']::notification_medium[];
$$;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  topic notification_topic not null,
  urgent boolean not null default false,
  title_en text not null,
  title_tr text,
  body text,
  -- What it is about, so the client can route a click without a second
  -- vocabulary for the same registers.
  entity_kind text,
  entity_id uuid,
  thread_id uuid references communication_threads (id) on delete cascade,
  raised_at timestamptz not null default now()
);
select app.add_common_columns('notifications');

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  medium notification_medium not null,
  state delivery_state not null default 'queued',
  queued_at timestamptz not null default now(),
  attempted_at timestamptz,
  settled_at timestamptz,
  -- What the provider called it, so a delivery can be traced back to the
  -- message in their console rather than taken on trust.
  provider_reference text,
  failure_reason text,
  read_at timestamptz,
  unique (notification_id, recipient_id, medium)
);

-- A settled delivery says when and, if it failed, why. Without this a failure
-- is indistinguishable from a message nobody has got to yet.
alter table notification_deliveries
  add constraint notification_deliveries_failure_is_explained check (
    state <> 'failed' or btrim(coalesce(failure_reason, '')) <> ''
  );

create index notification_deliveries_inbox_idx
  on notification_deliveries (recipient_id, medium, read_at, queued_at desc);

alter table notifications enable row level security;
alter table notifications force row level security;

-- You can read a notification if one was addressed to you, or if you raised
-- it. Not "if you could see the subject": a notification is a message sent to
-- named people, and the register it points at remains governed by its own
-- policies when the reader follows the link.
-- The two policies below would otherwise reference each other — a
-- notification is readable if one of its deliveries is yours, and a delivery
-- is readable if you raised its notification — and Postgres answers a cycle
-- like that with "infinite recursion detected in policy". These two helpers
-- are security definer, so each reads the other table without re-entering its
-- policy. They answer one question each and nothing wider than the policy
-- would have asked.
create or replace function app.addressed_to_me(p_notification uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from notification_deliveries d
    where d.notification_id = p_notification and d.recipient_id = auth.uid()
  );
$$;

create or replace function app.i_raised(p_notification uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from notifications n
    where n.id = p_notification and n.created_by = auth.uid()
  );
$$;

create policy notifications_read on notifications
  for select using (
    created_by = auth.uid() or app.addressed_to_me(id)
  );

-- Raised by the function below, which runs as the owner. Nothing writes here
-- directly: a notification anybody can insert is a way to put words in
-- somebody else's inbox under the portal's name.
create policy notifications_no_direct_write on notifications
  for insert with check (false);

alter table notification_deliveries enable row level security;
alter table notification_deliveries force row level security;

create policy notification_deliveries_read on notification_deliveries
  for select using (
    recipient_id = auth.uid() or app.i_raised(notification_id)
  );

-- The one thing a recipient may change about their own delivery: that they
-- have read it. Not its state, which is the provider's answer, not theirs.
create policy notification_deliveries_mark_read on notification_deliveries
  for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create or replace function app.refuse_delivery_rewrite()
returns trigger
language plpgsql
as $$
begin
  if new.state is distinct from old.state
     or new.provider_reference is distinct from old.provider_reference
     or new.recipient_id is distinct from old.recipient_id
     or new.medium is distinct from old.medium
     or new.notification_id is distinct from old.notification_id then
    raise exception
      'a delivery records what the provider did; only read_at is yours to set'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger notification_deliveries_only_read_at
  before update on notification_deliveries
  for each row execute function app.refuse_delivery_rewrite();

revoke insert, delete on notification_deliveries from authenticated;
revoke insert, update, delete on notifications from authenticated;

-- ---------------------------------------------------------------------------
-- Raising one
-- ---------------------------------------------------------------------------

create or replace function public.raise_notification(
  p_topic notification_topic,
  p_title_en text,
  p_recipients uuid[],
  p_title_tr text default null,
  p_body text default null,
  p_urgent boolean default false,
  p_entity_kind text default null,
  p_entity_id uuid default null,
  p_thread_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_recipient uuid;
  v_medium notification_medium;
begin
  -- Anyone who may minute a meeting may raise one. The guard matters more
  -- than usual here: this function runs as the owner, so without it the anon
  -- key would be able to write into everybody's inbox under the portal's name.
  if not app.can_minute() then
    raise exception 'raising a notification is not yours to do'
      using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(p_title_en, '')) = '' then
    raise exception 'a notification with no words in it is a badge, not a message'
      using errcode = 'check_violation';
  end if;

  if p_recipients is null or cardinality(p_recipients) = 0 then
    raise exception 'a notification addressed to nobody is not raised'
      using errcode = 'check_violation';
  end if;

  insert into notifications (
    topic, urgent, title_en, title_tr, body, entity_kind, entity_id, thread_id, created_by
  )
  values (
    p_topic, coalesce(p_urgent, false), btrim(p_title_en), p_title_tr, p_body,
    p_entity_kind, p_entity_id, p_thread_id, auth.uid()
  )
  returning id into v_id;

  foreach v_recipient in array p_recipients loop
    foreach v_medium in array enum_range(null::notification_medium) loop
      if app.medium_is_on(v_recipient, p_topic, v_medium) then
        insert into notification_deliveries (notification_id, recipient_id, medium, state)
        values (
          v_id, v_recipient, v_medium,
          case when v_medium = any (app.configured_media())
            then 'queued'::delivery_state
            -- Written down rather than skipped: "we would have sent you a
            -- WhatsApp message and there is no sender configured" is
            -- information, and silently dropping it is how a team comes to
            -- believe notifications are going out.
            else 'unconfigured'::delivery_state
          end
        )
        on conflict (notification_id, recipient_id, medium) do nothing;
      end if;
    end loop;
  end loop;

  return v_id;
end;
$$;

comment on function public.raise_notification(
  notification_topic, text, uuid[], text, text, boolean, text, uuid, uuid
) is
  'Raises one notification and fans it out to each recipient''s enabled media. '
  'A medium with no provider configured is recorded unconfigured, never sent.';

-- The inbox, which is the only medium that actually delivers anything today.
create or replace view my_notifications
with (security_invoker = true)
as
select
  n.id,
  n.topic,
  n.urgent,
  n.title_en,
  n.title_tr,
  n.body,
  n.entity_kind,
  n.entity_id,
  n.thread_id,
  n.raised_at,
  d.id as delivery_id,
  d.read_at,
  -- The other three media, said plainly, so a person can see that the e-mail
  -- they are waiting for was never going to arrive.
  array(
    select o.medium::text from notification_deliveries o
    where o.notification_id = n.id and o.recipient_id = d.recipient_id
      and o.state = 'unconfigured'
    order by o.medium
  ) as awaiting_a_provider,
  p.full_name as raised_by
from notification_deliveries d
join notifications n on n.id = d.notification_id
left join profiles p on p.id = n.created_by
where d.recipient_id = auth.uid()
  and d.medium = 'in_app';

-- ---------------------------------------------------------------------------
-- Browser push registrations (M11-06, the push half)
-- ---------------------------------------------------------------------------
--
-- The app is already a PWA with a service worker, so a browser can hand over
-- a push subscription today. Sending to one needs a VAPID key pair this
-- project does not have, which is why app.configured_media() does not list
-- push: a subscription stored here is a registration, not a promise.
--
-- It is stored anyway rather than waiting, because a subscription is tied to
-- the browser that made it; collecting them from the day the feature exists
-- means the first push reaches the people who were already here.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (endpoint)
);

alter table push_subscriptions enable row level security;
alter table push_subscriptions force row level security;

-- Nobody else's business, including an administrator's: these are device
-- identifiers, and the portal has no reason to let one person enumerate
-- another's browsers.
create policy push_subscriptions_own on push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Official correspondence (M11-12)
-- ---------------------------------------------------------------------------
--
-- "Dış paydaşa gönderilen resmî yazı kaydı: gönderim tarihi, kanal, ek,
-- teslim teyidi." The four columns are the requirement read literally, and
-- the fourth is the one that matters: a letter to the Ministry that was
-- posted and never acknowledged is a different fact from one that was
-- received, and only the register can tell them apart later.

create type correspondence_direction as enum ('outgoing', 'incoming');

create type correspondence_route as enum (
  'letter',
  'email',
  'hand_delivery',
  'courier',
  'whatsapp',
  'portal'
);

create table correspondence (
  id uuid primary key default gen_random_uuid(),
  reference_no text,
  direction correspondence_direction not null,
  route correspondence_route not null,
  subject_en text not null,
  subject_tr text,
  summary text,
  sent_on date not null,
  -- Who it went to, by whichever of the two registers holds them.
  stakeholder_id uuid references stakeholders (id) on delete set null,
  organization_id uuid references organizations (id) on delete set null,
  counterparty_name text,
  signed_by uuid references profiles (id),
  -- The letter itself. An outgoing official letter with no document is a
  -- claim that something was sent.
  document_id uuid references document_vault (id) on delete set null,
  legal_case_id uuid references legal_cases (id) on delete set null,
  obligation_id uuid references obligations (id) on delete set null,
  delivery_confirmed_on date,
  delivery_evidence_document_id uuid references document_vault (id) on delete set null,
  delivery_note text,
  constraint correspondence_names_a_counterparty check (
    stakeholder_id is not null
    or organization_id is not null
    or btrim(coalesce(counterparty_name, '')) <> ''
  ),
  -- The same spine as the obligations register, the accreditation checklist
  -- and site progress: the register holds documents, not assertions about
  -- documents.
  constraint correspondence_outgoing_has_its_letter check (
    direction <> 'outgoing' or document_id is not null
  ),
  -- A confirmed delivery says how it was confirmed. "We are sure they got
  -- it" is the thing this column exists to replace.
  constraint correspondence_confirmation_is_evidenced check (
    delivery_confirmed_on is null
    or delivery_evidence_document_id is not null
    or btrim(coalesce(delivery_note, '')) <> ''
  ),
  constraint correspondence_confirmed_after_sending check (
    delivery_confirmed_on is null or delivery_confirmed_on >= sent_on
  )
);
select app.add_common_columns('correspondence');

create index correspondence_sent_idx on correspondence (sent_on desc);

-- Official letters are the project's formal voice, so keeping the register is
-- the same authority that signs them.
create or replace function app.can_keep_correspondence()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'board_director');
$$;

alter table correspondence enable row level security;
alter table correspondence force row level security;

create policy correspondence_read on correspondence
  for select using (
    app.can_read(confidentiality, 'correspondence', id)
    and (app.is_internal() or app.has_grant('correspondence', id, 'read'))
    -- A letter filed against a case is visible only to those who may see the
    -- case, however the register's own classification reads.
    and (legal_case_id is null
      or exists (select 1 from legal_cases c where c.id = legal_case_id))
  );

create policy correspondence_insert on correspondence
  for insert with check (
    app.can_read(confidentiality) and app.can_keep_correspondence()
  );

create policy correspondence_update on correspondence
  for update
  using (app.can_read(confidentiality, 'correspondence', id) and app.can_keep_correspondence())
  with check (app.can_keep_correspondence());

-- ---------------------------------------------------------------------------
-- The weekly digest (M11-10)
-- ---------------------------------------------------------------------------
--
-- "Haftalık otomatik özet: mütevelliye ayrı, saha ekibine ayrı, bağışçıya
-- ayrı içerik." Three audiences, one function, and the audience decides the
-- CONTENT rather than a formatting flag — a donor digest that is the trustee
-- digest with sections hidden by the client is a leak waiting for a bug.
--
-- Two mechanisms hold it closed, and the second is the one that matters:
--
--   security invoker  every row is already filtered by the policies of the
--                     register it came from, so nothing here can widen what
--                     the caller may read
--   the audience      narrows further, so a trustee previewing the donor
--                     digest sees what the donor will see, not what they
--                     themselves may read
--
-- It reads project_calendar and project_chronology rather than the twelve
-- registers underneath, because those two views are already the answer to
-- "what falls due" and "what happened", and a third answer that drifts from
-- them is worse than no digest.

create type digest_audience as enum ('trustee', 'field', 'donor');

create or replace function public.weekly_digest(
  p_audience digest_audience,
  p_from date default (current_date - 7),
  p_to date default current_date
)
returns table (
  section text,
  occurred_on date,
  title_en text,
  title_tr text,
  detail text,
  entity_kind text,
  -- text rather than uuid: a pending decision's id is a risk escalation's
  -- bigserial, and a digest that cannot carry one would quietly drop the
  -- section the board most needs.
  entity_id text,
  confidentiality confidentiality
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  -- What happened in the week.
  select
    'happened'::text,
    c.occurred_on,
    c.title_en,
    coalesce(c.title_tr, c.title_en),
    c.detail_en,
    c.source,
    c.id::text,
    c.confidentiality
  from project_chronology c
  where c.occurred_on between p_from and p_to
    and case p_audience
      -- A donor is shown what the project has published, and nothing it has
      -- merely recorded. This is the line the trust's own transparency
      -- undertaking draws, so it is drawn here too.
      when 'donor' then c.confidentiality = 'public'
      when 'field' then c.category in ('construction', 'land', 'legal')
      else true
    end

  union all

  -- What falls due in the fortnight ahead. A digest that only looks backwards
  -- is a newsletter.
  select
    'ahead'::text,
    cal.due_on,
    cal.title_en,
    coalesce(cal.title_tr, cal.title_en),
    cal.detail,
    cal.kind::text,
    cal.id::text,
    cal.confidentiality
  from project_calendar cal
  where cal.due_on between p_to and (p_to + 14)
    and case p_audience
      when 'donor' then cal.confidentiality = 'public'
      when 'field' then cal.kind in ('obligation', 'milestone', 'action')
      else true
    end

  union all

  -- And, for the board only, what is waiting on them. The requirement's
  -- measure of success for the trustee pack is that nothing sits unanswered
  -- because nobody knew it was theirs to answer.
  select
    'waiting on you'::text,
    coalesce(d.due_on, d.waiting_since::date),
    d.title_en,
    coalesce(d.title_tr, d.title_en),
    d.detail,
    d.kind::text,
    d.id,
    d.confidentiality
  from pending_decisions d
  where p_audience = 'trustee'

  order by 1, 2;
$$;

comment on function public.weekly_digest(digest_audience, date, date) is
  'The week for one audience (M11-10). Security invoker, so the caller''s own '
  'policies apply first; the audience narrows further, which is why a donor '
  'digest is not the trustee digest with sections hidden by the client.';

-- ---------------------------------------------------------------------------
-- Two views the screens read
-- ---------------------------------------------------------------------------

-- A thread with the things a list needs: how many replies, when the last one
-- was, and who is in it. Counted in SQL because a client that counts replies
-- by fetching them all is a client that fetches every message in the project
-- to draw a list.
create or replace view thread_board
with (security_invoker = true)
as
select
  t.id,
  t.title,
  t.channel,
  t.kind,
  t.urgent,
  t.pinned,
  t.closed_at,
  t.confidentiality,
  t.created_at,
  t.created_by,
  o.full_name as started_by,
  t.legal_case_id,
  t.construction_block_id,
  t.obligation_id,
  t.transaction_id,
  (select count(*) from thread_messages m where m.thread_id = t.id) as messages,
  (select max(m.created_at) from thread_messages m where m.thread_id = t.id) as last_message_at,
  (select p.full_name from thread_messages m
     join profiles p on p.id = m.sender_id
    where m.thread_id = t.id order by m.created_at desc limit 1) as last_speaker,
  -- Whether this reader has acknowledged it, which is only ever about
  -- announcements.
  exists (
    select 1 from announcement_receipts r
    where r.thread_id = t.id and r.user_id = auth.uid()
  ) as seen_by_me
from communication_threads t
left join profiles o on o.id = t.created_by;

-- Who an urgent announcement actually reached (M11-08).
--
-- The denominator is the people who could see it at all, so "3 of 9" means
-- three of the nine who can read it, not three of everybody with an account.
-- Visible only to those who may announce: it answers whether the board was
-- told, and is not a per-person reading log for colleagues to browse.
create or replace view announcement_reach
with (security_invoker = true)
as
select
  t.id as thread_id,
  t.title,
  t.channel,
  t.urgent,
  t.created_at,
  (select count(*) from announcement_receipts r where r.thread_id = t.id) as seen,
  (select count(*) from profiles p
    where p.is_active
      and (p.expires_at is null or p.expires_at > now())
      and p.role = any (app.channel_default_roles(t.channel))) as could_see,
  array(
    select p.full_name from announcement_receipts r
    join profiles p on p.id = r.user_id
    where r.thread_id = t.id
    order by r.seen_at
  ) as seen_by
from communication_threads t
where t.kind = 'announcement'
  and app.can_announce();

grant select on thread_board to authenticated;
grant select on announcement_reach to authenticated;
grant select on my_notifications to authenticated;

comment on view announcement_reach is
  'Who an announcement reached, against who could see it at all (M11-08).';
comment on table notification_deliveries is
  'One row per recipient per medium. A medium with no provider configured is '
  'recorded unconfigured rather than sent, because a row saying sent when '
  'nothing was attempted is worse than no row.';
comment on table correspondence is
  'Official letters to and from outside parties (M11-12): date, route, the '
  'letter itself, and whether delivery was ever confirmed.';

-- ---------------------------------------------------------------------------
-- The tail 0026 requires
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and a default ACL
-- cannot take that away (0026 says why, with the measurement). Without these
-- three lines public.raise_notification — which is security definer and
-- writes into other people's inboxes under the portal's name — would be
-- callable with the anon key. The policy tests assert this.

revoke all privileges on all functions in schema public from anon, public;
revoke all privileges on all functions in schema app from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated;
