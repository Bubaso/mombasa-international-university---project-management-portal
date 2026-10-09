-- Similar-record suggestion (M13-12).
--
-- "Bu toplantı şu konuyla ilgili." The easy way to build this is a text
-- similarity score and a list headed "ilgili kayıtlar", and that list is read
-- as a finding. It is not one. Two minutes of this project's archive share
-- the words Mombasa, university, trust and Nyali, which means a naive
-- similarity engine declares every record related to every other and the
-- reader has no way to tell which of the suggestions is worth opening.
--
-- So the rule here is: a suggestion has to say why it was suggested, and the
-- why has to be a fact the reader can check in a second. Two kinds, kept
-- apart, because they are not the same strength of claim:
--
--   * A recorded link. The two records are joined by something somebody
--     entered — a decision taken at that meeting, a risk raised out of that
--     case. These are not "similar", they are connected, and the register
--     says "bağlı" rather than "benzer". No judgement is involved.
--
--   * Shared distinctive terms. This is a guess, it is labelled as one, and
--     the terms it matched on are returned with it. A suggestion that names
--     its words can be dismissed in a second; one that does not is
--     unfalsifiable, which is the real defect in every "related items" box
--     ever shipped.
--
-- Two floors keep the second kind from being noise:
--
--   * A term in more than a tenth of the archive is dropped. "Mombasa" is in
--     everything here, so its presence in two records is not evidence of
--     anything. The ceiling is a parameter with a stated default rather than
--     a constant, so somebody can see what it is.
--
--   * One shared term is not a relation. Two is the floor, and the count
--     comes back so a reader can weigh three against two.
--
-- And a stop list, in a table rather than inside a function, because the
-- words that are in everything on this project are a thing people will want
-- to add to — and each entry records why it is there.
--
-- Requirements: M13-12.

-- ---------------------------------------------------------------------------
-- The words that are in everything
-- ---------------------------------------------------------------------------

create table search_stop_terms (
  term text primary key check (term = app.search_fold(term)),
  reason text not null check (btrim(reason) <> '')
);

alter table search_stop_terms enable row level security;
alter table search_stop_terms force row level security;

comment on table search_stop_terms is
  'Terms whose presence in two records is no evidence of a relation (M13-12). '
  'In a table rather than in a function because this list grows, and each '
  'entry says why it is on it.';

insert into search_stop_terms (term, reason) values
  ('mombasa', 'The project is in Mombasa; it is in nearly every record'),
  ('kenya', 'Likewise'),
  ('nyali', 'The site is in Nyali'),
  ('miu', 'The university''s own name'),
  ('autk', 'The trust''s own name'),
  ('university', 'The thing being built'),
  ('universite', 'The same word, Turkish'),
  ('universitesi', 'The same word, inflected'),
  ('trust', 'The body doing the building'),
  ('vakif', 'The same word, Turkish'),
  ('vakfi', 'The same word, inflected'),
  ('project', 'Everything here is the project'),
  ('proje', 'The same word, Turkish'),
  ('projesi', 'The same word, inflected'),
  ('international', 'Part of the university''s name'),
  ('board', 'Three of the governance organs are boards'),
  ('kurul', 'The same word, Turkish'),
  ('heyeti', 'As in Mütevelli Heyeti'),
  ('toplanti', 'Every minute is a meeting'),
  ('meeting', 'The same word, English'),
  ('karar', 'Every decision is a karar'),
  ('decision', 'The same word, English'),
  ('belge', 'Every document is a belge'),
  ('document', 'The same word, English'),
  ('tarih', 'A date is on everything'),
  ('date', 'The same word, English');

-- ---------------------------------------------------------------------------
-- Pulling terms out of a record
-- ---------------------------------------------------------------------------

-- Folded, split on anything that is not a letter or a digit, four characters
-- or more, and not on the stop list. Four because three-letter tokens in two
-- languages are mostly inflection, and this is a suggestion rather than a
-- search: a term that turns out to be noise costs a reader their attention.
create or replace function app.record_terms(p_text text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct t.term), '{}'::text[])
  from unnest(
    regexp_split_to_array(app.search_fold(coalesce(p_text, '')), '[^a-z0-9]+')
  ) as t(term)
  where length(t.term) >= 4
    and t.term not in (select s.term from search_stop_terms s);
$$;

comment on function app.record_terms(text) is
  'The distinctive-looking terms in a piece of text (M13-12): folded, four '
  'characters or more, stop list removed. Definer only so the stop list is '
  'readable; it discloses nothing but the list itself.';

-- ---------------------------------------------------------------------------
-- The suggestion
-- ---------------------------------------------------------------------------

create type suggestion_basis as enum (
  -- Somebody entered a link between these two records.
  'recorded_link',
  -- They share terms that are not in everything. A guess, labelled as one.
  'shared_terms'
);

create or replace function public.similar_records(
  p_kind search_kind,
  p_id uuid,
  p_limit int default 8,
  -- A term in more than this share of the archive is dropped. Stated rather
  -- than hidden in the body, so a reader can see what the floor is.
  p_max_share numeric default 0.10
)
returns table (
  kind search_kind,
  id uuid,
  title_en text,
  title_tr text,
  subtitle text,
  occurred_on date,
  confidentiality confidentiality,
  basis suggestion_basis,
  -- In words: what the link is, or that the terms are shared.
  relation text,
  -- Named, so the suggestion can be dismissed. Empty for a recorded link,
  -- because a recorded link does not rest on words.
  shared_terms text[],
  terms_in_common int
)
language plpgsql
stable
security invoker
set search_path = public, app, pg_temp
as $$
declare
  v_subject record;
  v_terms text[];
  v_kept text[];
  v_total bigint;
  v_ceiling bigint;
begin
  -- Security invoker, and `searchable` carries the policies: a caller who
  -- cannot read the subject gets nothing back, and is not told whether it
  -- exists.
  select s.kind, s.id, s.heading, s.document, s.parent_kind, s.parent_id
    into v_subject
  from searchable s
  where s.kind = p_kind and s.id = p_id;

  if v_subject.id is null then
    return;
  end if;

  -- --- the recorded links -------------------------------------------------
  --
  -- Three shapes, all from what somebody entered: the record this one hangs
  -- off, the records hanging off it, and the ones hanging off the same
  -- parent. No judgement in any of them.

  return query
  select
    s.kind, s.id, s.title_en, s.title_tr, s.subtitle, s.occurred_on,
    s.confidentiality,
    'recorded_link'::suggestion_basis,
    'this record hangs off it'::text,
    '{}'::text[],
    0
  from searchable s
  where v_subject.parent_id is not null
    and s.kind = v_subject.parent_kind
    and s.id = v_subject.parent_id;

  return query
  select
    s.kind, s.id, s.title_en, s.title_tr, s.subtitle, s.occurred_on,
    s.confidentiality,
    'recorded_link'::suggestion_basis,
    'it hangs off this record'::text,
    '{}'::text[],
    0
  from searchable s
  where s.parent_kind = p_kind and s.parent_id = p_id
  order by s.occurred_on desc nulls last
  limit least(greatest(coalesce(p_limit, 8), 1), 50);

  return query
  select
    s.kind, s.id, s.title_en, s.title_tr, s.subtitle, s.occurred_on,
    s.confidentiality,
    'recorded_link'::suggestion_basis,
    'both hang off the same record'::text,
    '{}'::text[],
    0
  from searchable s
  where v_subject.parent_id is not null
    and s.parent_kind = v_subject.parent_kind
    and s.parent_id = v_subject.parent_id
    and not (s.kind = p_kind and s.id = p_id)
  order by s.occurred_on desc nulls last
  limit least(greatest(coalesce(p_limit, 8), 1), 50);

  -- --- the shared terms ---------------------------------------------------

  v_terms := app.record_terms(
    app.search_blob(v_subject.heading, v_subject.document)
  );

  if coalesce(array_length(v_terms, 1), 0) = 0 then
    return;
  end if;

  select count(*) into v_total from searchable;
  -- At least two, so a term in the subject and one other record is not
  -- dropped for being rare in a tiny archive.
  v_ceiling := greatest(2, floor(v_total * coalesce(p_max_share, 0.10))::bigint);

  -- One pass over the archive, counting every candidate term at once. A term
  -- above the ceiling is in too much of the record to mean anything.
  select coalesce(array_agg(c.term), '{}'::text[]) into v_kept
  from (
    select t.term, count(*) as holders
    from unnest(v_terms) as t(term)
    join searchable s
      on app.search_fold(app.search_blob(s.heading, s.document)) like '%' || t.term || '%'
    group by t.term
  ) c
  where c.holders <= v_ceiling;

  if coalesce(array_length(v_kept, 1), 0) = 0 then
    return;
  end if;

  return query
  with other as (
    select
      s.kind, s.id, s.title_en, s.title_tr, s.subtitle, s.occurred_on,
      s.confidentiality,
      array(
        select k.term
        from unnest(v_kept) as k(term)
        where app.search_fold(app.search_blob(s.heading, s.document))
              like '%' || k.term || '%'
        order by k.term
      ) as hits
    from searchable s
    where not (s.kind = p_kind and s.id = p_id)
  )
  select
    o.kind, o.id, o.title_en, o.title_tr, o.subtitle, o.occurred_on,
    o.confidentiality,
    'shared_terms'::suggestion_basis,
    'they share terms that are not in everything'::text,
    o.hits,
    array_length(o.hits, 1)
  from other o
  -- Two is the floor. One shared word is not a relation, and a list that
  -- included them would bury the rows that are.
  where array_length(o.hits, 1) >= 2
  order by array_length(o.hits, 1) desc, o.occurred_on desc nulls last
  limit least(greatest(coalesce(p_limit, 8), 1), 50);
end;
$$;

comment on function public.similar_records(search_kind, uuid, int, numeric) is
  'Records to look at next, and why (M13-12). A recorded link is a fact; '
  'shared terms are a guess that comes back with the words it matched on, '
  'because a suggestion that cannot be dismissed cannot be trusted. Security '
  'invoker: the policies decide what comes back, so a suggestion never '
  'reveals that a record exists.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- The stop list is readable by anybody signed in: it is twenty-six ordinary
-- words and a reason each, and a reader who cannot see it cannot understand
-- why a suggestion is missing. Changing it is an administrator's.
create policy search_stop_terms_read on search_stop_terms
  for select using (true);
create policy search_stop_terms_write on search_stop_terms
  for insert with check (app.acts_as('admin', 'project_director'));
create policy search_stop_terms_delete on search_stop_terms
  for delete using (app.acts_as('admin', 'project_director'));

revoke all on search_stop_terms from authenticated;
grant select, insert, delete on search_stop_terms to authenticated;

select app.reset_function_grants();
