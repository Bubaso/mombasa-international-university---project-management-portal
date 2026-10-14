-- Push notifications that actually leave the database (M11-05).
--
-- 0027 wrote `app.configured_media()` as a constant returning `{in_app}`, and
-- everything downstream followed it honestly: a push or an email delivery was
-- recorded `unconfigured` rather than `queued`, and the screen said so. That
-- was the right thing to do with no provider. This migration makes one of the
-- three real.
--
-- Push needs no third-party account — unlike email, which needs a sending
-- provider's key, and WhatsApp, which needs a Meta business account. It needs
-- a VAPID key pair, and a key pair is something this project can generate for
-- itself. So push becomes a configured medium and the other two stay exactly
-- as they were, still reported `unconfigured`, because nothing has changed
-- about them and saying otherwise would be the lie this portal is built to
-- refuse.
--
-- **How `configured_media()` can say "push" without asserting it.** The
-- obvious shape is a settings table where an administrator ticks a box, and
-- that is worthless: a tick is a claim with nothing behind it. The test used
-- here is the one that cannot be faked — *is there a public key in the
-- database?* A browser cannot subscribe without one, so no key means no
-- subscription can exist, which means push genuinely is not configured. The
-- function reads the table.
--
-- The private key is not here and must never be. It lives as a secret on the
-- edge function that sends, the way the AI key does: the public half is
-- published to every browser by design, and the private half signs, so a
-- database row holding it would hand the signing identity to anybody who
-- could read one table.
--
-- Requirements: M11-05, M11-06.

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
-- The public half of the key
-- ---------------------------------------------------------------------------

create table push_keys (
  id uuid primary key default gen_random_uuid(),
  -- One row, and the id stays a uuid to say so. The obvious trick here is
  -- `id boolean primary key default true` — one value, one row, no second
  -- column. It does not survive contact with this schema: app.record_audit()
  -- reads (to_jsonb(new) ->> 'id')::uuid, so the first insert dies with
  -- `invalid input syntax for type uuid: "true"` and the error names the
  -- audit function rather than the table that broke the assumption. A
  -- constant column with a unique constraint costs one column and keeps the
  -- row auditable like every other row.
  --
  -- The rule itself matters: two public keys would mean subscriptions made
  -- against a key the sender no longer signs with, which fails silently —
  -- the push service accepts the request and the browser drops the payload.
  the_only_key boolean not null default true
    constraint push_keys_one_key_only unique
    constraint push_keys_one_key_is_true check (the_only_key),
  -- base64url, uncompressed P-256 point, 65 bytes raw. Checked by length
  -- rather than taken on trust, because a truncated key produces exactly the
  -- silent failure above.
  public_key text not null check (length(public_key) between 85 and 88),
  -- Who a push service can complain to about this sender (RFC 8292 `sub`).
  contact text not null check (contact ~ '^(mailto:|https://)'),
  note text
);
select app.add_common_columns('push_keys');

comment on table push_keys is
  'The public half of the VAPID key pair (M11-05). Its presence is what '
  'app.configured_media() reads: a browser cannot subscribe without it, so no '
  'row means push genuinely is not configured. The private half is a secret '
  'on the sending function and must never be stored here.';

-- ---------------------------------------------------------------------------
-- What counts as configured
-- ---------------------------------------------------------------------------

-- No longer immutable: it reads a table now, which is the whole point. The
-- callers are stable functions, so stable is what this has to be.
create or replace function app.configured_media()
returns notification_medium[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from push_keys)
      then array['in_app', 'push']::notification_medium[]
    else array['in_app']::notification_medium[]
  end;
$$;

comment on function app.configured_media() is
  'Which media have something behind them (M11-06). in_app is this database. '
  'push is configured exactly when a VAPID public key is on record, because '
  'without one no browser can subscribe. email and whatsapp are absent '
  'because nothing has been configured for them — an API key and a Meta '
  'business account respectively — and listing them would make every '
  'delivery read as sent.';

-- The client needs the public key to subscribe, and nothing else from this
-- table. Returning the row would also hand out who recorded it and when.
create or replace function public.push_public_key()
returns table (public_key text, contact text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select k.public_key, k.contact from push_keys k limit 1;
$$;

comment on function public.push_public_key() is
  'The VAPID public key, for a browser about to subscribe (M11-05). Definer '
  'and two columns only: the key is public by design, the rest of the row is '
  'not.';

-- ---------------------------------------------------------------------------
-- Recording a device
-- ---------------------------------------------------------------------------

-- A subscription is per device, and the endpoint is unique, so a device that
-- re-subscribes replaces its own row rather than accumulating. `last_seen_at`
-- moves, which is how a dead device is told from a quiet one.
create or replace function public.record_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent,
        last_seen_at = now();
end;
$$;

comment on function public.record_push_subscription(text, text, text, text) is
  'Records this browser as a push destination for the signed-in person '
  '(M11-05). Invoker, and the row is written under auth.uid(): a subscription '
  'cannot be filed in somebody else''s name.';

-- ---------------------------------------------------------------------------
-- What the sender claims, and how it settles
-- ---------------------------------------------------------------------------

-- Definer, because the sender runs as the service role and has to see every
-- queued push regardless of whose it is; and it returns the subscription keys,
-- which is why it is revoked from `authenticated` at the tail of this file.
--
-- `attempted_at` is stamped as the rows are claimed, so a crashed run leaves
-- a trail rather than a notification that is queued forever and looks fine.
--
-- Two things here were wrong in the first draft and are worth the comment,
-- because both failed silently in the direction this portal exists to refuse.
--
-- One: the claim used to stamp every due row and then join to
-- push_subscriptions. A recipient with no device got their delivery stamped
-- and never returned — so it stayed `queued` with `attempted_at` set, was
-- never sent, never failed, and could never be claimed again, not even after
-- they registered a phone. It now refuses to claim a delivery with nowhere to
-- go, which leaves it genuinely queued and picked up by the next run after a
-- device appears. push_health.queued_with_nowhere_to_go is what says so on
-- screen in the meantime.
--
-- Two: it returned one row per device. A person with a laptop and a phone has
-- two subscriptions and one delivery row, so the sender settled the same
-- delivery twice and the state that stuck was whichever device answered last
-- — a dead laptop could record a push to a live phone as failed. The devices
-- now come back as an array against one delivery, and the sender settles once
-- for all of them.
create or replace function public.claim_push_deliveries(p_limit int default 50)
returns table (
  delivery_id uuid,
  -- [{endpoint, p256dh, auth}] — every device of this recipient, so the
  -- sender settles the delivery once having tried all of them.
  devices jsonb,
  title_en text,
  title_tr text,
  body text,
  topic notification_topic,
  entity_kind text,
  entity_id uuid,
  thread_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select d.id
    from notification_deliveries d
    where d.medium = 'push'
      and d.state = 'queued'
      -- A delivery already being attempted is left alone, so two overlapping
      -- runs cannot both send the same notification to the same device.
      and d.attempted_at is null
      -- Nowhere to go is not a failed send and not an attempt. Claiming it
      -- would strand it: see the second note above.
      and exists (
        select 1 from push_subscriptions ps where ps.user_id = d.recipient_id
      )
    order by d.queued_at
    limit least(greatest(coalesce(p_limit, 50), 1), 500)
    for update skip locked
  ),
  stamped as (
    update notification_deliveries d
       set attempted_at = now()
     where d.id in (select id from due)
    returning d.id, d.notification_id, d.recipient_id
  )
  select
    s.id,
    jsonb_agg(
      jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth_key)
      order by ps.created_at
    ),
    n.title_en,
    n.title_tr,
    n.body,
    n.topic,
    n.entity_kind,
    n.entity_id,
    n.thread_id
  from stamped s
  join notifications n on n.id = s.notification_id
  join push_subscriptions ps on ps.user_id = s.recipient_id
  group by s.id, n.title_en, n.title_tr, n.body, n.topic,
           n.entity_kind, n.entity_id, n.thread_id;
end;
$$;

comment on function public.claim_push_deliveries(int) is
  'The queued pushes, claimed and stamped attempted (M11-05). One row per '
  'delivery with every device of its recipient, so the sender settles once. '
  'Stamping as they are handed out is what stops two runs sending the same '
  'notification twice, and what leaves a trail when a run dies mid-flight. A '
  'delivery whose recipient has no device is not claimed at all: stamping it '
  'would strand it as queued-and-never-attemptable.';

-- ---------------------------------------------------------------------------
-- A delivery settles once, forwards
-- ---------------------------------------------------------------------------
--
-- 0027 gave notification_deliveries a trigger refusing every change to
-- `state`, with the comment "a delivery records what the provider did; only
-- read_at is yours to set". That was right about the intent and wrong as
-- written, and nothing noticed because until now nothing settled anything:
-- fan_out wrote the state at insert and no code ever updated it. The first
-- thing that genuinely has a provider's answer to record — the push sender
-- below — was refused by it.
--
-- So the rule is split into the two it was always doing at once:
--
--   * A recipient cannot touch `state` because they are not granted the
--     column. That is the part the trigger was standing in for, and a grant
--     is the better place for it: it cannot be reasoned around.
--   * The trigger now says which transitions exist at all. A queued delivery
--     may settle; a settled one stays settled; and no delivery is ever
--     re-pointed at a different notification, person or medium.
--
-- An `unconfigured` delivery is deliberately not re-queueable. If email is
-- configured next year, the rows that record "there was no sender when this
-- was raised" are history, not a backlog — re-queueing them would send a
-- year-old hearing reminder.
create or replace function app.refuse_delivery_rewrite()
returns trigger
language plpgsql
as $$
begin
  if new.recipient_id is distinct from old.recipient_id
     or new.medium is distinct from old.medium
     or new.notification_id is distinct from old.notification_id then
    raise exception
      'a delivery cannot be re-pointed at another notification, person or medium'
      using errcode = 'insufficient_privilege';
  end if;

  if new.state is distinct from old.state then
    if old.state <> 'queued' then
      raise exception 'this delivery is already %, and a delivery settles once', old.state
        using errcode = 'insufficient_privilege';
    end if;
    if new.state = 'queued' then
      raise exception 'a delivery cannot be put back in the queue'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- What the provider said is recorded as part of settling, not edited
  -- afterwards: a reference that can be changed later is a reference nobody
  -- can trace.
  if (new.provider_reference is distinct from old.provider_reference
      or new.failure_reason is distinct from old.failure_reason)
     and new.state is not distinct from old.state then
    raise exception 'what the provider said is recorded with the settle, not edited after'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- The column grant is the other half, and the reason the trigger can be a
-- rule rather than a wall. src/api/comms.ts updates read_at and nothing else,
-- so this closes a door nobody was using.
revoke update on notification_deliveries from authenticated;
grant update (read_at) on notification_deliveries to authenticated;

create or replace function public.settle_push_delivery(
  p_delivery uuid,
  p_state delivery_state,
  p_provider_reference text default null,
  p_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 'sent' or 'failed', and deliberately not 'delivered'. A push service's
  -- 201 means it accepted the bytes; whether a device ever showed anything is
  -- not knowable from here. The enum carries `delivered` for a medium that
  -- reports back, and this function refuses it so that no push can ever be
  -- recorded as something nobody observed.
  if p_state not in ('sent', 'failed') then
    raise exception 'a push settles as sent or failed; delivery is not observable'
      using errcode = 'check_violation';
  end if;

  update notification_deliveries
     set state = p_state,
         settled_at = now(),
         provider_reference = p_provider_reference,
         failure_reason = p_failure_reason
   where id = p_delivery;
end;
$$;

comment on function public.settle_push_delivery(uuid, delivery_state, text, text) is
  'Records what the push service said (M11-05). sent means it accepted the '
  'bytes — not that a device displayed anything, which this portal cannot '
  'know and therefore does not claim. delivered is refused for exactly that '
  'reason.';

-- A push service answering 404 or 410 is telling us the subscription is dead:
-- the browser threw it away. Keeping it means every future run retries a
-- destination that cannot exist.
create or replace function public.forget_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint;
end;
$$;

comment on function public.forget_push_subscription(text) is
  'Drops a subscription a push service reported gone (M11-05). Not an error: '
  'a browser discarding its own subscription is ordinary, and retrying it '
  'forever would turn one dead device into a permanent failure count.';

-- ---------------------------------------------------------------------------
-- What a reader can see about delivery
-- ---------------------------------------------------------------------------

create view push_health with (security_invoker = true) as
select
  (select count(*) from push_keys) = 1 as key_on_record,
  (select count(*) from push_subscriptions where user_id = auth.uid()) as my_devices,
  (
    select count(*) from notification_deliveries d
    where d.medium = 'push' and d.recipient_id = auth.uid() and d.state = 'queued'
  ) as my_queued,
  (
    select count(*) from notification_deliveries d
    where d.medium = 'push' and d.recipient_id = auth.uid() and d.state = 'sent'
  ) as my_sent,
  (
    select count(*) from notification_deliveries d
    where d.medium = 'push' and d.recipient_id = auth.uid() and d.state = 'failed'
  ) as my_failed,
  -- Queued with no device of their own: the notification will sit there, and
  -- that is worth saying rather than counting as a send.
  (
    select count(*) from notification_deliveries d
    where d.medium = 'push' and d.recipient_id = auth.uid() and d.state = 'queued'
  ) > 0
  and (select count(*) from push_subscriptions where user_id = auth.uid()) = 0
    as queued_with_nowhere_to_go;

-- src/lib/comms.ts carried `CONFIGURED_MEDIA = ['in_app']` — a hand-kept copy
-- of app.configured_media() in the client. It was correct until this
-- migration and would have been wrong the moment a key was recorded, which is
-- the drift CLAUDE.md §4 is about: the rule is in the database and the copy is
-- what goes stale. notification_health already exposes both lists, but it
-- returns nothing until a sweep has run, so a panel cannot rely on it for a
-- fact that is true before any sweep. This always answers.
create view delivery_media with (security_invoker = true) as
select
  app.configured_media() as with_a_provider,
  (
    select coalesce(array_agg(m), '{}')
      from unnest(enum_range(null::notification_medium)) m
     where not (m = any (app.configured_media()))
  ) as without_a_provider;

comment on view delivery_media is
  'Which media can actually deliver and which cannot (M11-06). Exists so the '
  'client stops keeping its own list: one row, always present, straight from '
  'app.configured_media().';

grant select on delivery_media to authenticated;

comment on view push_health is
  'Whether push can leave at all, and what is waiting for this reader '
  '(M11-05). queued_with_nowhere_to_go is the state a screen must not render '
  'as a delivery: the notification exists and no device of theirs does.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

alter table push_keys enable row level security;
alter table push_keys force row level security;

-- Readable by anybody signed in: it is the public half, and a reader who
-- cannot see it cannot understand why push is off. Writable by an
-- administrator, because recording a key that does not match the sender's
-- secret breaks push silently for everybody.
create policy push_keys_read on push_keys for select using (true);
create policy push_keys_insert on push_keys
  for insert with check (app.acts_as('admin'));
create policy push_keys_update on push_keys
  for update using (app.acts_as('admin')) with check (app.acts_as('admin'));
create policy push_keys_delete on push_keys
  for delete using (app.acts_as('admin'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on push_keys from authenticated;
grant select, insert, update, delete on push_keys to authenticated;

grant select on push_health to authenticated;

-- The sender's three functions hand out subscription keys and settle other
-- people's deliveries, so they belong to the service role alone.
--
-- The revokes go INSIDE app.reset_function_grants rather than after a call to
-- it. CLAUDE.md records why, from the 0033→0034 incident: that function ends
-- with a blanket `grant execute on all functions in schema public`, so a
-- revoke written after one call survives only until the next migration calls
-- it again — and then the door is open with nothing in the diff to show it.
-- The exceptions live in one place, which is this function.
create or replace function app.reset_function_grants()
returns void
language plpgsql
as $$
begin
  execute 'revoke all privileges on all functions in schema public from anon, public';
  execute 'revoke all privileges on all functions in schema app from anon, public';
  execute 'grant execute on all functions in schema public to authenticated, service_role';
  execute 'grant execute on all functions in schema app to authenticated';

  -- The notification sweep: 0033's, closed by 0034 for the same reason.
  execute 'revoke all privileges on function app.sweep_notifications(text) from authenticated';

  -- The push sender's three (0045). claim_push_deliveries returns the
  -- subscription keys of every recipient; settle and forget write other
  -- people's rows.
  execute 'revoke all privileges on function public.claim_push_deliveries(int) from authenticated';
  execute 'revoke all privileges on function '
    || 'public.settle_push_delivery(uuid, delivery_state, text, text) from authenticated';
  execute 'revoke all privileges on function public.forget_push_subscription(text) from authenticated';
end;
$$;

drop function app.add_common_columns(regclass);

select app.reset_function_grants();
