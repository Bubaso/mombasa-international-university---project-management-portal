-- The badge, without naming every row first (M3-10).
--
-- 0035 answers the badge question for ids the caller names. That was the right
-- shape for one record, and the wrong shape for a register: a list of a hundred
-- obligations would either send a hundred ids up on every render, or ask once
-- per row. The component that draws the badge cannot know the whole screen's
-- ids — it is given one row — so the query has to be per table and shared.
--
-- So p_ids becomes optional, and null means every marker in that table. The
-- disclosure is the same class 0035 already weighed and the tests already
-- assert: which fields hold unapproved machine text, never a wording. What is
-- added is that a caller can learn it without guessing ids — and a caller who
-- wanted to guess could already enumerate them, so the boundary has not moved.
-- Against seventeen registers showing machine-written Turkish with nothing to
-- say so, this is the cheap side of the trade.
--
-- Everything else is unchanged: an approved marker is not returned, because it
-- is the approver's wording now, and one whose field has since been edited is
-- not returned either, because those are a person's words.

create or replace function public.machine_marked(p_table text, p_ids uuid[] default null)
returns table (entity_id uuid, column_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_current text;
begin
  for r in
    select m.entity_id as id, m.column_name as col, m.machine_text as said
      from machine_translations m
     where m.entity_table = p_table
       -- Null asks about the whole register; a list asks about those rows.
       and (p_ids is null or m.entity_id = any (p_ids))
       and m.approved_at is null
  loop
    continue when not app.translatable(p_table, r.col);

    begin
      execute format('select %I::text from %I where id = $1', r.col, p_table)
        into v_current using r.id;
    exception
      when others then
        continue;
    end;

    continue when v_current is null;
    continue when btrim(v_current) <> btrim(r.said);

    entity_id := r.id;
    column_name := r.col;
    return next;
  end loop;
end;
$$;

comment on function public.machine_marked(text, uuid[]) is
  'Which records in this table hold unapproved machine text, and in which '
  'column. Null p_ids means the whole register. Returns no wording: it exists '
  'so the badge can be drawn for readers who cannot read the marker table, '
  'which is most of the people outside AUTK.';

select app.reset_function_grants();
