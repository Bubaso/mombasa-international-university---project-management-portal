-- Machine translation, marked as such (M3-10, M13-09).
--
-- The portal is bilingual in 43 tables and 70 field pairs, and measured on the
-- live database 55 of those fields hold one language only — mostly the
-- registers derived from the Notion archive, which were written in English
-- because that is the language the derivation was done in. A Turkish-speaking
-- trustee reading the obligations register sees English detail or nothing.
--
-- So translating automatically is worth doing. The danger in doing it is
-- precise and worth naming: a machine translation that is indistinguishable
-- from the record IS the record as far as any reader can tell. In a portal
-- whose whole premise is that nothing unverified may look verified, silently
-- filling title_tr from a language model would be the same defect as the
-- "SHA-256 verified" badge on an unread file that Faz 0 removed — the same
-- shape, in a different column.
--
-- 0007 already saw this: meeting_notes.is_machine_translation exists, with
-- approved_by and approved_at beside it. This migration generalises that to
-- every bilingual field in the portal, because a boolean per table cannot say
-- WHICH field was translated and there are seventy of them.
--
-- The design is one marker row per translated field:
--
--   it says which field, in which record, into which language
--   it keeps the machine's own words, so a later hand edit is distinguishable
--     from them without anybody having to remember
--   it is unapproved until a person approves it, and the approval is attributed
--
-- The consequence that matters: the review queue only goes down when somebody
-- reads a translation and says it is right. An unapproved translation is shown
-- as a machine's suggestion wherever it appears. That is the same arrangement
-- as the action candidates in 0032 — a queue of things a machine produced that
-- a person has not yet stood behind — and for the same reason.

-- ---------------------------------------------------------------------------
-- The marker
-- ---------------------------------------------------------------------------

create table machine_translations (
  id uuid primary key default gen_random_uuid(),

  -- The table and column that hold the translated text. Not a foreign key:
  -- seventy fields across forty-three tables cannot be referenced from one
  -- column, and the whitelist in app.translatable() is what keeps these honest.
  entity_table text not null,
  entity_id uuid not null,
  column_name text not null,

  -- Into which, and out of which. Both recorded, because "translated into
  -- Turkish" and "translated from English" are different facts and a reviewer
  -- wants the second one.
  into_language content_language not null,
  from_language content_language not null,

  -- The model is part of the provenance. When a better one arrives, the
  -- translations worth redoing are the ones this column names.
  model text not null,

  -- The machine's own words, kept so that an ordinary edit elsewhere in the
  -- portal resolves the review without anybody marking anything: if the
  -- field no longer says this, a person has been here.
  machine_text text not null,

  translated_at timestamptz not null default now(),
  translated_by uuid references profiles (id) on delete set null,

  approved_by uuid references profiles (id) on delete set null,
  approved_at timestamptz,
  -- Set when a reviewer rewrote it rather than accepting it. Worth keeping
  -- separately from approval: a column where this is often true is a column
  -- the machine is bad at.
  corrected boolean not null default false,

  constraint machine_translations_column_is_bilingual check (
    column_name like '%\_en' or column_name like '%\_tr' or column_name = 'title_tr'
  ),
  constraint machine_translations_directions_differ check (into_language <> from_language),
  constraint machine_translations_text_not_blank check (btrim(machine_text) <> ''),
  constraint machine_translations_approval_is_attributed check (
    (approved_at is null) = (approved_by is null)
  ),
  -- One marker per field. A re-translation replaces it, because a field has
  -- one current provenance and not a history of guesses.
  unique (entity_table, entity_id, column_name)
);

select app.add_common_columns('machine_translations');

create index machine_translations_unapproved_idx
  on machine_translations (entity_table, entity_id) where approved_at is null;

alter table machine_translations enable row level security;
alter table machine_translations force row level security;

-- ---------------------------------------------------------------------------
-- What may be translated
-- ---------------------------------------------------------------------------
--
-- Derived from the schema rather than listed by hand, so a field pair added
-- later is translatable without anybody remembering to add it here — and so
-- that the marker table cannot be pointed at a column that is not one half of
-- a bilingual pair. The second part is the security property: the review
-- function below builds dynamic SQL from these names, and this is the
-- whitelist that makes that safe.

create or replace view translatable_fields
with (security_invoker = true)
as
with pairs as (
  select c.table_name as entity_table,
         regexp_replace(c.column_name, '_(en|tr)$', '') as base,
         count(*) filter (where c.column_name like '%\_en') as has_en,
         count(*) filter (where c.column_name like '%\_tr') as has_tr
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
   where c.table_schema = 'public'
     and (c.column_name like '%\_en' or c.column_name like '%\_tr')
     and c.column_name not in ('search_en', 'search_tr')
   group by 1, 2
)
select entity_table, base, base || '_en' as en_column, base || '_tr' as tr_column
  from pairs
 where has_en = 1 and has_tr = 1;

comment on view translatable_fields is
  'Every bilingual field pair in the portal, derived from the schema. Also '
  'the whitelist that makes the review function''s dynamic SQL safe.';

grant select on translatable_fields to authenticated;

create or replace function app.translatable(p_table text, p_column text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from translatable_fields f
     where f.entity_table = p_table
       and p_column in (f.en_column, f.tr_column)
  )
  -- meetings.title is the one bilingual pair that does not follow the
  -- convention: the English title is the NOT NULL one and is called `title`,
  -- because it is the fallback every screen falls back to.
  or (p_table = 'meetings' and p_column = 'title_tr');
$$;

-- ---------------------------------------------------------------------------
-- Recording one
-- ---------------------------------------------------------------------------

create or replace function public.record_machine_translation(
  p_table text,
  p_id uuid,
  p_column text,
  p_into content_language,
  p_from content_language,
  p_model text,
  p_text text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not app.translatable(p_table, p_column) then
    raise exception '% .% is not one half of a bilingual field pair', p_table, p_column
      using errcode = 'check_violation';
  end if;

  insert into machine_translations (
    entity_table, entity_id, column_name, into_language, from_language,
    model, machine_text, translated_by
  )
  values (p_table, p_id, p_column, p_into, p_from, p_model, p_text, auth.uid())
  on conflict (entity_table, entity_id, column_name) do update
    set into_language = excluded.into_language,
        from_language = excluded.from_language,
        model = excluded.model,
        machine_text = excluded.machine_text,
        translated_at = now(),
        translated_by = excluded.translated_by,
        -- A re-translation is unapproved again. Approval is of a particular
        -- wording, not of the field.
        approved_by = null,
        approved_at = null,
        corrected = false
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_machine_translation(
  text, uuid, text, content_language, content_language, text, text
) is
  'Marks a field as holding a machine translation, unapproved. The text is '
  'written by the ordinary update; this records where it came from.';

-- ---------------------------------------------------------------------------
-- Standing behind one, or correcting it
-- ---------------------------------------------------------------------------

create or replace function public.approve_translation(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update machine_translations
     set approved_by = auth.uid(), approved_at = now()
   where id = p_id
     and approved_at is null;

  if not found then
    raise exception 'no such translation to approve, or it is already approved'
      using errcode = 'no_data_found';
  end if;
end;
$$;

-- Corrected rather than approved: the reviewer rewrote it. The text itself is
-- written by the ordinary update, which is also what makes the marker's
-- machine_text disagree with the field from then on.
create or replace function public.mark_translation_corrected(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update machine_translations
     set corrected = true, approved_by = auth.uid(), approved_at = now()
   where id = p_id;

  if not found then
    raise exception 'no such translation' using errcode = 'no_data_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The review queue
-- ---------------------------------------------------------------------------
--
-- Returns each marker beside the text the field currently holds, so a reviewer
-- compares the machine's words with what is there now. The comparison is the
-- interesting column: when they differ, somebody has already edited the field
-- by hand and there is nothing left to review.
--
-- security invoker, so the caller reads only the records they could read
-- anyway — a reviewer is not shown the title of a restricted obligation by
-- virtue of it being untranslated.
--
-- The dynamic SQL is built only from names app.translatable() has approved,
-- which is why that function exists.

create or replace function public.translation_review()
returns table (
  id uuid,
  entity_table text,
  entity_id uuid,
  column_name text,
  into_language content_language,
  from_language content_language,
  model text,
  machine_text text,
  current_text text,
  still_the_machines_words boolean,
  translated_at timestamptz,
  approved_at timestamptz,
  corrected boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r record;
  v_current text;
begin
  for r in
    select m.* from machine_translations m order by m.translated_at desc
  loop
    continue when not app.translatable(r.entity_table, r.column_name);

    begin
      execute format('select %I::text from %I where id = $1', r.column_name, r.entity_table)
        into v_current using r.entity_id;
    exception
      when others then
        -- The row is gone, or not visible to this caller. Either way there is
        -- nothing to review and nothing to say about it.
        continue;
    end;

    continue when v_current is null;

    id := r.id;
    entity_table := r.entity_table;
    entity_id := r.entity_id;
    column_name := r.column_name;
    into_language := r.into_language;
    from_language := r.from_language;
    model := r.model;
    machine_text := r.machine_text;
    current_text := v_current;
    still_the_machines_words := (btrim(v_current) = btrim(r.machine_text));
    translated_at := r.translated_at;
    approved_at := r.approved_at;
    corrected := r.corrected;
    return next;
  end loop;
end;
$$;

comment on function public.translation_review() is
  'Machine translations beside the text their field now holds. A field that '
  'no longer says what the machine said has been edited by hand, and there '
  'is nothing left to approve.';

-- ---------------------------------------------------------------------------
-- How much of the portal is single-language
-- ---------------------------------------------------------------------------
--
-- The number this feature exists to bring down. Measured rather than
-- estimated, over every pair in translatable_fields, under the caller's own
-- visibility — so a reader is told about the gap in the records they can see
-- and not about the ones they cannot.

create or replace function public.translation_backlog()
returns table (
  entity_table text,
  base text,
  only_en bigint,
  only_tr bigint,
  -- Not `both`: that is a reserved word, as `trim(both ...)` needs it to be.
  in_both bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  f record;
begin
  for f in select * from translatable_fields order by entity_table, base loop
    execute format(
      'select %L, %L,
              count(*) filter (where btrim(coalesce(%I, '''')) <> ''''
                                 and btrim(coalesce(%I, '''')) = ''''),
              count(*) filter (where btrim(coalesce(%I, '''')) = ''''
                                 and btrim(coalesce(%I, '''')) <> ''''),
              count(*) filter (where btrim(coalesce(%I, '''')) <> ''''
                                 and btrim(coalesce(%I, '''')) <> '''')
         from %I',
      f.entity_table, f.base,
      f.en_column, f.tr_column, f.en_column, f.tr_column, f.en_column, f.tr_column,
      f.entity_table)
      into entity_table, base, only_en, only_tr, in_both;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
--
-- A translation marker is as visible as anything else about the portal's own
-- workings: internal readers see it. Writing one requires the authority to
-- write the record it is about — which this cannot check across forty-three
-- tables, so it requires the authority to keep minutes, the same bar as the
-- other content-producing functions.

create policy machine_translations_read on machine_translations
  for select using (app.is_internal());

create policy machine_translations_write on machine_translations
  for insert with check (app.can_minute());

create policy machine_translations_update on machine_translations
  for update using (app.can_minute()) with check (app.can_minute());

comment on table machine_translations is
  'One row per machine-translated field, unapproved until a person stands '
  'behind it (M3-10, M13-09). The portal shows an unapproved translation as '
  'a suggestion, never as the record.';

-- ---------------------------------------------------------------------------
-- The revoke tail, which has to stop being a tail
-- ---------------------------------------------------------------------------
--
-- Since 0026 every migration has ended with the same four lines, because
-- Postgres grants EXECUTE on each new function to PUBLIC and a default ACL
-- cannot take it back. Writing this migration found the flaw in that habit:
-- the third line grants EXECUTE on EVERY function in `app` to authenticated,
-- which silently re-opened app.sweep_notifications — closed by name one
-- migration earlier in 0033, so that only the schedule could call it. The
-- policy test caught it, which is the only reason this is a paragraph rather
-- than a hole.
--
-- The habit was wrong in a way no amount of care would fix: a blanket grant in
-- any future migration re-opens every exception ever made. So the tail becomes
-- a function, the exceptions live inside it, and from here on a migration ends
-- with one line that cannot forget them.

create or replace function app.reset_function_grants()
returns void
language plpgsql
as $$
begin
  execute 'revoke all privileges on all functions in schema public from anon, public';
  execute 'revoke all privileges on all functions in schema app from anon, public';
  execute 'grant execute on all functions in schema public to authenticated, service_role';
  execute 'grant execute on all functions in schema app to authenticated';

  -- The exceptions. app.sweep_notifications is unguarded by design — the
  -- schedule that calls it has no identity to check — so the privilege is the
  -- only thing keeping it out of reach of a session.
  execute 'revoke all privileges on function app.sweep_notifications(text) from authenticated';
end;
$$;

comment on function app.reset_function_grants() is
  'The grant state every migration must end in. Call this rather than writing '
  'the revokes by hand: a blanket grant written out again would re-open every '
  'function ever closed by name, which is what happened between 0033 and 0034.';

select app.reset_function_grants();
