-- Retrieval for the weekly digest (M13-07d).
--
-- The other four uses of M13-07 either work on text the person supplied or
-- answer a question, and ai_context serves both: they start from something
-- somebody typed. A digest does not. It starts from a date range, and asking
-- the person to describe the week they want summarised would be asking them
-- to do the summarising.
--
-- So this is the same shape as ai_context and the same two guarantees:
-- security invoker, so the two views underneath are filtered by the policies
-- on the registers they read; and `restricted` excluded unconditionally,
-- because a digest is a piece of generated text and M13-03 is about where the
-- material goes, not who asked.
--
-- A digest that quietly leaves out the restricted item is a worse digest, and
-- that is the right trade: the person can see the item on their own screen,
-- where the portal is not paraphrasing it into something forwardable.
--
-- Requirements: M13-03, M13-07d.

create or replace function public.ai_digest_context(
  p_from date default (current_date - 7),
  p_to date default (current_date + 7)
)
returns table (
  source text,
  kind text,
  id text,
  title_en text,
  title_tr text,
  detail text,
  due_on date,
  state text,
  needs_attention boolean,
  confidentiality confidentiality
)
language sql
stable
security invoker
set search_path = public, app, pg_temp
as $$
  -- What falls due in the window, across every register that has dates.
  select
    'calendar'::text,
    c.kind::text,
    c.id::text,
    c.title_en,
    c.title_tr,
    c.detail,
    c.due_on,
    c.state,
    c.needs_attention,
    c.confidentiality
  from project_calendar c
  where c.due_on between least(p_from, p_to) and greatest(p_from, p_to)
    and c.confidentiality <> 'restricted'

  union all

  -- And what is waiting on somebody, which has no date and belongs in a
  -- digest more than anything that does.
  select
    'decision'::text,
    d.kind::text,
    d.id,
    d.title_en,
    d.title_tr,
    d.detail,
    d.due_on,
    null::text,
    true,
    d.confidentiality
  from pending_decisions d
  where d.confidentiality <> 'restricted'

  order by 7 nulls last, 1
  limit 80;
$$;

comment on function public.ai_digest_context(date, date) is
  'The week''s deadlines and open decisions, for the digest draft of '
  'M13-07d. Security invoker, so the policies on the underlying registers '
  'apply, and `restricted` is excluded unconditionally as in ai_context '
  '(M13-03).';

grant execute on function public.ai_digest_context(date, date) to authenticated;
