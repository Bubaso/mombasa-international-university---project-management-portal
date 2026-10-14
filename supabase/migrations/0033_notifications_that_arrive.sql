-- Notifications that actually arrive (M2-09, M3-06, M4-07, M6-08, M6-10, M8-15, M11-06).
--
-- 0027 built the whole notification model: topics, the two critical ones that
-- cannot be muted, per-person preferences, delivery states, an inbox, and a
-- medium with no provider recorded `unconfigured` rather than pretended sent.
-- Measured afterwards, on the live database:
--
--   callers of public.raise_notification … 0
--
-- Nothing raised one. The model was correct and inert, which is the most
-- expensive kind of wrong: seven requirements read as built because their
-- visible half is built. The thresholds of M2-09 are computed and on screen;
-- no reminder arrives. M4-07's relationship-cooling strip is on screen; no
-- reminder arrives. M6-08's 5×5 matrix is on screen; nothing escalates.
--
-- This migration is the half that was missing: something that looks at the
-- registers and raises.
--
-- Three decisions worth stating, because each could have gone wrong quietly.
--
-- 1. A SWEEP, NOT A TRIGGER. A deadline is not an event; nothing happens in
--    the database on the day an obligation comes due. So the raising has to be
--    a periodic look at what the dates now say, which means it must be safe to
--    run again — hence dedupe_key. The key names the record AND the threshold,
--    so an obligation raises once at 60 days and again at 30, and running the
--    sweep twelve times a day raises nothing extra.
--
-- 2. THE TIGHTEST BAND CROSSED, NOT EVERY BAND. If the schedule stops for a
--    week and the sweep then runs with five days left, it raises "5 days" —
--    not "60 days", which crossed unobserved and would now be a lie about the
--    calendar. Bands that passed while nobody was looking stay unraised.
--
-- 3. A NOTIFICATION NEVER NAMES A RECORD TO SOMEBODY WHO MAY NOT SEE IT.
--    The sweep runs as the owner and therefore reads everything, including
--    restricted matters, and it puts titles into bodies. Without a guard that
--    is a channel straight through the classification model: the one place
--    where "you have a new notification" would leak what it is about. So
--    every recipient list goes through app.cleared(), which drops anybody
--    whose clearance does not reach the record's own tier. A notification
--    with no cleared recipient is not raised at all.
--
-- 4. A RECORD THAT NAMES NOBODY GOES TO WHOEVER RUNS THE PROJECT, and says
--    that it names nobody. Measured on the live database after the first
--    sweep: of 8 open obligations and 4 open risks carried in from the Notion
--    archive, none has an owner profile and none has a created_by, because
--    they were loaded server-side where auth.uid() is null. Under a strict
--    reading there is nobody to notify and the correct output is silence —
--    which is precisely wrong, because an obligation with a deadline and no
--    owner is more urgent than one with an owner, not less. So the recipient
--    list falls back to the directors, through the same clearance filter, and
--    the body says why they are the ones being told. A gap nobody is told
--    about is how the archive's open matters would have gone quiet again.
--
-- What this migration does NOT do, said plainly because the alternative is a
-- team that believes otherwise: it does not send email, WhatsApp or push.
-- app.configured_media() still returns {in_app} alone, so deliveries by the
-- other three media are still recorded `unconfigured`. The inbox inside the
-- portal is what now fills by itself. Email needs a provider key, WhatsApp
-- needs a Meta business account, and push needs a VAPID pair — none of which
-- can be conjured from inside a migration.
--
-- Scheduling is deployment configuration, not schema: pg_cron is available on
-- the project and the sweep is scheduled there. Because that lives outside
-- these files, notification_sweeps records every run, and the screen says how
-- long ago the last one was — so a schedule that silently stopped shows up as
-- a stale date instead of as an inbox nobody questions.

-- ---------------------------------------------------------------------------
-- Raising the same thing twice
-- ---------------------------------------------------------------------------

alter table notifications add column if not exists dedupe_key text;

-- Plain rather than partial: several NULLs do not conflict with each other, so
-- notifications raised by hand (which carry no key) are unaffected, and every
-- swept one is unique by its key.
create unique index if not exists notifications_dedupe_idx on notifications (dedupe_key);

comment on column notifications.dedupe_key is
  'Names the record and the threshold that raised this, so a sweep can run '
  'as often as it likes. Null for a notification somebody raised by hand.';

-- ---------------------------------------------------------------------------
-- The fan-out, now shared
-- ---------------------------------------------------------------------------
--
-- 0027 did this inline inside raise_notification. Two callers now need it, and
-- two copies of a fan-out is how one of them comes to disagree with the other
-- about which media are configured.

create or replace function app.fan_out(
  p_notification uuid,
  p_recipients uuid[],
  p_topic notification_topic
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
  v_medium notification_medium;
  v_sent int := 0;
begin
  foreach v_recipient in array p_recipients loop
    foreach v_medium in array enum_range(null::notification_medium) loop
      if app.medium_is_on(v_recipient, p_topic, v_medium) then
        insert into notification_deliveries (notification_id, recipient_id, medium, state)
        values (
          p_notification, v_recipient, v_medium,
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
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

-- Restated to use the one fan-out. The guard is unchanged and is the reason
-- this function is dangerous without it: it runs as the owner, so an
-- unguarded version would let any key write into everybody's inbox under the
-- portal's name.
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
begin
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

  perform app.fan_out(v_id, p_recipients, p_topic);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may be told about a record
-- ---------------------------------------------------------------------------
--
-- The guard named in decision 3 above. The confidentiality enum is ordered
-- public < internal < confidential < restricted, so a comparison is the whole
-- rule: a reader whose clearance does not reach the record's tier is dropped
-- from the recipient list before the notification exists.
--
-- Nulls in the list are dropped as a side effect of the join, which is why
-- callers can pass "the owner, or whoever recorded it" without checking which
-- of the two is set.

create or replace function app.cleared(p_recipients uuid[], p_tier confidentiality)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
    from profiles p
   where p.id = any (p_recipients)
     and p.is_active
     and (p.expires_at is null or p.expires_at > now())
     and p.clearance >= p_tier;
$$;

comment on function app.cleared(uuid[], confidentiality) is
  'The subset of those people who may be told about a record at that tier. '
  'A notification body names the record, so this is what stops the inbox '
  'being a way around the classification model.';

-- Raise one, unless it has been raised before. Returns whether it was raised
-- now, so the sweep can count honestly.
create or replace function app.raise_once(
  p_key text,
  p_topic notification_topic,
  p_title_en text,
  p_title_tr text,
  p_body text,
  p_urgent boolean,
  p_entity_kind text,
  p_entity_id uuid,
  p_recipients uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- Nobody cleared to hear it: not raised, rather than raised into the void.
  if p_recipients is null or cardinality(p_recipients) = 0 then
    return false;
  end if;

  insert into notifications (
    dedupe_key, topic, urgent, title_en, title_tr, body, entity_kind, entity_id
  )
  values (
    p_key, p_topic, coalesce(p_urgent, false), p_title_en, p_title_tr, p_body,
    p_entity_kind, p_entity_id
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  perform app.fan_out(v_id, p_recipients, p_topic);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- The record of the sweep itself
-- ---------------------------------------------------------------------------
--
-- Without this, an empty inbox has two explanations that look identical: there
-- was nothing to raise, or the schedule stopped three weeks ago. The second
-- one is the dangerous one, and it is invisible unless the runs are written
-- down.

-- Guarded so the whole file can be re-applied. That is not the usual licence
-- in this directory — migrations here are sequential and irreversible — but
-- this one carries five sweep bodies that were corrected against what the
-- live data turned out to be, and a function change should not require a new
-- migration each time while it is still being measured.
create table if not exists notification_sweeps (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  -- 'schedule' when pg_cron ran it, 'manual' when a person pressed the button.
  trigger_source text not null,
  raised int not null,
  by_topic jsonb not null default '{}'::jsonb,
  ran_by uuid references profiles (id) on delete set null,

  constraint notification_sweeps_source_is_known check (
    trigger_source in ('schedule', 'manual')
  ),
  constraint notification_sweeps_manual_is_attributed check (
    trigger_source <> 'manual' or ran_by is not null
  )
);

create index if not exists notification_sweeps_ran_at_idx
  on notification_sweeps (ran_at desc);

alter table notification_sweeps enable row level security;
alter table notification_sweeps force row level security;

-- Readable by the people who would notice it had stopped. Not writable by
-- anybody: the sweep writes it, and a run log somebody can edit is not one.
drop policy if exists notification_sweeps_read on notification_sweeps;
create policy notification_sweeps_read on notification_sweeps
  for select using (app.acts_as('admin', 'project_director', 'trustee', 'audit_committee'));

comment on table notification_sweeps is
  'One row per sweep. Exists so that "no reminders arrived" can be told '
  'apart from "the schedule stopped running", which otherwise look the same.';

-- ---------------------------------------------------------------------------
-- How a date is said
-- ---------------------------------------------------------------------------

create or replace function app.when_words(p_band int, p_tr boolean)
returns text
language sql
immutable
as $$
  select case
    when p_band < 0 then case when p_tr then 'vadesi geçti' else 'overdue' end
    when p_band <= 1 then case when p_tr then 'bugün ya da yarın' else 'today or tomorrow' end
    else case when p_tr then p_band || ' gün içinde' else 'in ' || p_band || ' days' end
  end;
$$;

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------

create or replace function app.sweep_notifications(p_source text default 'schedule')
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_days int;
  v_band int;
  v_to uuid[];
  v_raised int := 0;
  v_counts jsonb := '{}'::jsonb;
  v_trustees uuid[];
  v_directors uuid[];
  v_pct int;
  v_unowned boolean;
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_trustees
    from profiles
   where role::text = any (array['trustee', 'board_director'])
     and is_active;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_directors
    from profiles
   where role::text = any (array['admin', 'project_director'])
     and is_active;

  -- --- M2-09: obligations, at the five thresholds the requirement names ----
  --
  -- state is the filter that matters: an obligation already fulfilled has no
  -- deadline left to warn about, and one suspended is not owed today.
  for r in
    select o.id, o.title_en, o.title_tr, o.due_on, o.confidentiality,
           o.obligor_profile_id, o.obligor_name, o.created_by
      from obligations o
     where o.state in ('open', 'in_progress', 'at_risk')
       and o.due_on is not null
  loop
    v_days := r.due_on - current_date;
    v_band := case
      when v_days < 0 then -1
      when v_days <= 1 then 1
      when v_days <= 7 then 7
      when v_days <= 14 then 14
      when v_days <= 30 then 30
      when v_days <= 60 then 60
      else null
    end;
    continue when v_band is null;

    v_to := app.cleared(array[r.obligor_profile_id, r.created_by], r.confidentiality);
    v_unowned := cardinality(v_to) = 0;
    if v_unowned then
      v_to := app.cleared(v_directors, r.confidentiality);
    end if;

    if app.raise_once(
      format('obligation:%s:%s', r.id, v_band),
      'deadline',
      format('Obligation %s: %s', app.when_words(v_band, false),
             coalesce(r.title_en, r.title_tr)),
      format('Yükümlülük %s: %s', app.when_words(v_band, true),
             coalesce(r.title_tr, r.title_en)),
      format('%s · %s%s', r.due_on,
             coalesce(nullif(r.obligor_name, ''), 'obligor not named'),
             case when v_unowned then ' · Nobody in the portal is named on this '
               'record, which is why you are the one being told.' else '' end),
      v_band <= 1,
      'obligation', r.id, v_to
    ) then
      v_raised := v_raised + 1;
      v_counts := jsonb_set(v_counts, array['deadline'],
        to_jsonb(coalesce((v_counts->>'deadline')::int, 0) + 1), true);
    end if;
  end loop;

  -- --- hearings: the topic M11-07 says may never be switched off -----------
  for r in
    select h.id, h.scheduled_for, h.kind, h.confidentiality, h.created_by,
           c.case_number, c.title as case_title, c.created_by as case_keeper,
           c.confidentiality as case_tier, s.profile_id as counsel_profile
      from hearings h
      join legal_cases c on c.id = h.legal_case_id
      left join stakeholders s on s.id = c.lead_counsel_stakeholder_id
     where h.scheduled_for >= now()
       and h.scheduled_for < now() + interval '15 days'
  loop
    v_days := r.scheduled_for::date - current_date;
    v_band := case
      when v_days <= 1 then 1
      when v_days <= 3 then 3
      when v_days <= 7 then 7
      else 14
    end;

    -- The stricter of the two tiers, because a hearing on a restricted case is
    -- as restricted as the case.
    v_to := app.cleared(
      array[r.created_by, r.case_keeper, r.counsel_profile],
      greatest(r.confidentiality, r.case_tier));
    v_unowned := cardinality(v_to) = 0;
    if v_unowned then
      v_to := app.cleared(v_directors, greatest(r.confidentiality, r.case_tier));
    end if;

    if app.raise_once(
      format('hearing:%s:%s', r.id, v_band),
      'hearing',
      format('Hearing %s: %s', app.when_words(v_band, false), r.case_number),
      format('Duruşma %s: %s', app.when_words(v_band, true), r.case_number),
      format('%s · %s', to_char(r.scheduled_for, 'DD Mon YYYY HH24:MI'), r.case_title),
      v_band <= 3,
      'legal_case', r.id, v_to
    ) then
      v_raised := v_raised + 1;
      v_counts := jsonb_set(v_counts, array['hearing'],
        to_jsonb(coalesce((v_counts->>'hearing')::int, 0) + 1), true);
    end if;
  end loop;

  -- --- actions: and the honest part of M3-06 -------------------------------
  --
  -- M3-06 asks that an external owner be notified by email or WhatsApp. There
  -- is no provider for either, so that half cannot be done here and is not
  -- pretended: when the owner is in the register rather than in the portal,
  -- the notification goes to whoever recorded the action and says plainly that
  -- the owner cannot be reached from inside the portal. Somebody has to chase
  -- them, and now the system says who.
  for r in
    select a.id, a.text_en, a.text_tr, a.due_date, a.confidentiality,
           a.owner_profile_id, a.owner_stakeholder_id, a.created_by,
           s.full_name as owner_name
      from action_items a
      left join stakeholders s on s.id = a.owner_stakeholder_id
     where a.status in ('open', 'in_progress', 'blocked')
  loop
    v_days := r.due_date - current_date;
    v_band := case
      when v_days < 0 then -1
      when v_days <= 1 then 1
      when v_days <= 7 then 7
      when v_days <= 14 then 14
      else null
    end;
    continue when v_band is null;

    v_to := app.cleared(array[r.owner_profile_id, r.created_by], r.confidentiality);
    v_unowned := cardinality(v_to) = 0;
    if v_unowned then
      v_to := app.cleared(v_directors, r.confidentiality);
    end if;

    if app.raise_once(
      format('action:%s:%s', r.id, v_band),
      'deadline',
      format('Action %s: %s', app.when_words(v_band, false),
             left(coalesce(r.text_en, r.text_tr), 90)),
      format('Aksiyon %s: %s', app.when_words(v_band, true),
             left(coalesce(r.text_tr, r.text_en), 90)),
      case
        when r.owner_stakeholder_id is not null then
          format('%s · Owner is %s, who is in the register and not in the '
                 'portal — no notification reaches them from here.',
                 r.due_date, coalesce(r.owner_name, 'someone outside'))
        when v_unowned then
          format('%s · Nobody in the portal is named on this action, which is '
                 'why you are the one being told.', r.due_date)
        else r.due_date::text
      end,
      v_band <= 1,
      'action_item', r.id, v_to
    ) then
      v_raised := v_raised + 1;
      v_counts := jsonb_set(v_counts, array['deadline'],
        to_jsonb(coalesce((v_counts->>'deadline')::int, 0) + 1), true);
    end if;
  end loop;

  -- --- M6-08 and M6-10: a score over the threshold, and the escalation -----
  --
  -- The band rather than the score is in the key, so a risk moving 15 → 16
  -- does not raise again, and one crossing into 20 does.
  for r in
    select k.id, k.title_en, k.title_tr, k.score, k.confidentiality,
           k.owner_profile_id, k.created_by
      from risks k
     where k.state in ('open', 'mitigating')
       and k.score >= 15
  loop
    v_band := case when r.score >= 20 then 20 else 15 end;

    -- At 20 the requirement sends it to the board. The clearance filter still
    -- applies: a trustee without the clearance for a restricted risk is not
    -- told its title, which is the right answer even for a trustee.
    v_to := app.cleared(
      array[r.owner_profile_id, r.created_by]
        || case when v_band = 20 then v_trustees else '{}'::uuid[] end,
      r.confidentiality);
    v_unowned := cardinality(v_to) = 0;
    if v_unowned then
      v_to := app.cleared(v_directors, r.confidentiality);
    end if;

    if app.raise_once(
      format('risk:%s:band:%s', r.id, v_band),
      'announcement',
      format('Risk score %s: %s', r.score, coalesce(r.title_en, r.title_tr)),
      format('Risk puanı %s: %s', r.score, coalesce(r.title_tr, r.title_en)),
      case when v_band = 20
        then 'Over the escalation threshold — the board is on this notice.'
        else 'Over the attention threshold.'
      end
      || case when v_unowned then ' Nobody in the portal owns this risk.' else '' end,
      v_band = 20,
      'risk', r.id, v_to
    ) then
      v_raised := v_raised + 1;
      v_counts := jsonb_set(v_counts, array['announcement'],
        to_jsonb(coalesce((v_counts->>'announcement')::int, 0) + 1), true);
    end if;
  end loop;

  -- --- M8-15: a budget line past its threshold ----------------------------
  --
  -- The requirement says the notification goes to "sorumluya" — the person
  -- responsible. A budget line records no owner, so there is nobody to name,
  -- and inventing one would be worse than the gap. It goes to the people who
  -- run the project, and the missing owner column is on the list.
  for r in
    select b.budget_line_id, b.title_en, b.title_tr, b.confidentiality,
           b.budget_kes, coalesce(b.spent_kes, 0) + coalesce(b.committed_kes, 0) as used
      from budget_position b
     where b.budget_kes > 0
       and coalesce(b.spent_kes, 0) + coalesce(b.committed_kes, 0) >= b.budget_kes * 0.9
  loop
    v_pct := floor(r.used * 100.0 / r.budget_kes)::int;
    v_band := case when v_pct >= 100 then 100 else 90 end;

    v_to := app.cleared(v_directors, r.confidentiality);

    if app.raise_once(
      format('budget:%s:%s', r.budget_line_id, v_band),
      'money',
      format('Budget line at %s%%: %s', v_pct, coalesce(r.title_en, r.title_tr)),
      format('Bütçe kalemi %%%s: %s', v_pct, coalesce(r.title_tr, r.title_en)),
      format('%s of %s KES committed or spent.', round(r.used), round(r.budget_kes)),
      v_band = 100,
      'budget_line', r.budget_line_id, v_to
    ) then
      v_raised := v_raised + 1;
      v_counts := jsonb_set(v_counts, array['money'],
        to_jsonb(coalesce((v_counts->>'money')::int, 0) + 1), true);
    end if;
  end loop;

  insert into notification_sweeps (trigger_source, raised, by_topic, ran_by)
  values (
    case when p_source = 'manual' then 'manual' else 'schedule' end,
    v_raised, v_counts,
    case when p_source = 'manual' then auth.uid() else null end
  );

  return v_raised;
end;
$$;

-- ---------------------------------------------------------------------------
-- The two ways it runs
-- ---------------------------------------------------------------------------
--
-- pg_cron calls app.sweep_notifications() as the owner. A person pressing the
-- button in the console calls this, which is guarded and attributed.

create or replace function public.run_notification_sweep()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_minute() then
    raise exception 'running the sweep is not yours to do'
      using errcode = 'insufficient_privilege';
  end if;
  return app.sweep_notifications('manual');
end;
$$;

comment on function public.run_notification_sweep() is
  'Runs the notification sweep now and records it as a manual run. Safe to '
  'call repeatedly: every raise is keyed by record and threshold.';

-- ---------------------------------------------------------------------------
-- Whether the thing is running at all
-- ---------------------------------------------------------------------------
--
-- One row. The screen needs three facts from it and would otherwise compute
-- them from a table it is not allowed to read in full: when the last sweep
-- was, how stale that is, and which media still have no provider — because
-- "no reminders" means something entirely different in each case.

create or replace view notification_health
with (security_invoker = true)
as
select
  s.ran_at as last_ran_at,
  s.trigger_source as last_trigger_source,
  s.raised as last_raised,
  s.by_topic as last_by_topic,
  extract(epoch from (now() - s.ran_at)) / 3600 as hours_since,
  -- Two days without a sweep is not a quiet week; it is a schedule that
  -- stopped. The screen says so rather than leaving the reader to subtract
  -- dates in their head.
  (s.ran_at < now() - interval '2 days') as looks_stopped,
  app.configured_media() as media_with_a_provider,
  (
    select coalesce(array_agg(m), '{}')
      from unnest(enum_range(null::notification_medium)) m
     where not (m = any (app.configured_media()))
  ) as media_without_a_provider
from notification_sweeps s
order by s.ran_at desc
limit 1;

comment on view notification_health is
  'The last sweep, how long ago it was, and which media still have no '
  'provider. Exists so an empty inbox is explainable.';

grant select on notification_health to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE on every new function to PUBLIC and a default ACL
-- cannot take it back (measured in 0026), so every migration ends with this.

revoke all privileges on all functions in schema public from anon, public;
revoke all privileges on all functions in schema app from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated;

-- The sweep itself is not a user-facing function: it attributes its run to the
-- schedule and is not guarded, because the schedule has no identity to check.
-- The guarded wrapper above is the only way in from a session.
revoke all privileges on function app.sweep_notifications(text) from authenticated;
