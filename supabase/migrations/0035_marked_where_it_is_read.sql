-- The badge, for every reader (M3-10, M13-09).
--
-- 0034 marks a machine-translated field and queues it for approval. The queue
-- lives on the assistant screen, which left the gap this migration closes: on
-- the obligations screen, the decision list, the meeting record, a reader sees
-- the text with nothing to say a machine wrote it. The queue is where the work
-- is managed; the badge is where the warning has to be, because the warning is
-- only useful to somebody reading the sentence.
--
-- The obstacle was the read policy. machine_translations is readable by
-- app.is_internal(), which is right for the marker rows — they carry the
-- machine's own wording, and a reader who cannot see a record should not learn
-- a previous version of its text. But it means a donor reading a published
-- report, or outside counsel reading an obligation, gets no badge at all. Those
-- are the readers who most need it: they have no way of knowing the portal
-- translates anything.
--
-- So the badge gets its own function, and it is deliberately narrow:
--
--   it answers only for ids the caller names, which are the rows already on
--     their screen — rows RLS let them read in the first place
--   it returns which COLUMN holds unapproved machine text, and nothing else:
--     no wording, no model, no dates, no reviewer
--   it drops a marker whose field has since been edited by hand, because that
--     text is a person's and badging it would be the opposite of the truth
--
-- It is security definer, and the disclosure that buys is bounded and worth
-- stating plainly: somebody who enumerated ids would learn that a given field
-- holds an unapproved machine translation. That is provenance, not content —
-- and it is the fact the portal wants shouted rather than hidden. Weighed
-- against a donor reading machine-written Turkish with no indication of it,
-- this is not a close call.

create or replace function public.machine_marked(p_table text, p_ids uuid[])
returns table (entity_id uuid, column_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_current text;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  for r in
    select m.entity_id as id, m.column_name as col, m.machine_text as said
      from machine_translations m
     where m.entity_table = p_table
       and m.entity_id = any (p_ids)
       -- Approved means a person has read it and stood behind it. It is their
       -- wording now, and badging it would be telling the reader something
       -- that stopped being true.
       and m.approved_at is null
  loop
    -- The same whitelist the review function uses, and for the same reason:
    -- the statement below is built from a column name.
    continue when not app.translatable(p_table, r.col);

    begin
      execute format('select %I::text from %I where id = $1', r.col, p_table)
        into v_current using r.id;
    exception
      when others then
        continue;
    end;

    continue when v_current is null;
    -- Edited by hand since. The field holds somebody's own words and there is
    -- nothing to warn about.
    continue when btrim(v_current) <> btrim(r.said);

    entity_id := r.id;
    column_name := r.col;
    return next;
  end loop;
end;
$$;

comment on function public.machine_marked(text, uuid[]) is
  'Which of these records hold unapproved machine text, and in which column. '
  'Returns no wording: it exists so the badge can be drawn for readers who '
  'cannot read the marker table, which is most of the people outside AUTK.';

select app.reset_function_grants();
