-- Three gaps in the governance module, all found by somebody trying to use it.
--
-- A trustee was entered, could not be seated on any organ, could not be
-- deleted when the entry turned out to be wrong, and had to be marked as
-- having stood down instead — which says a person served and left, about
-- somebody who never served at all.
--
-- Two of the three were client-side: organ_memberships and governance_organs
-- have had their write policies since 0021 and nothing in the portal ever
-- called them. This migration is the third, which is a rule and therefore
-- belongs here rather than in a button.
--
-- Requirements: M10-01, M10-02, M3-14.

-- ---------------------------------------------------------------------------
-- Deleting a trustee is for a record that should never have existed
-- ---------------------------------------------------------------------------
--
-- The three tables that reference trustees all say `on delete cascade`. So
-- deleting somebody who actually served would silently take their organ seats,
-- their declared interests and the deed clauses cited against them with it —
-- and the quorum computed over a sitting held years ago would change without
-- anybody touching that sitting. That is a destructive reading of a word that
-- was meant for a typo.
--
-- The rule: a trustee nothing refers to may be deleted; a trustee anything
-- refers to may not. The refusal names which register holds them, because
-- "cannot delete" without a reason is a dead end, and standing somebody down
-- is the right action for a person who served.
--
-- What holds a trustee, in one place.
--
-- The trigger below and the register's own column both need this answer, and
-- the first draft of this migration asked the question twice — the same three
-- `exists` clauses written out in a function and in a trigger. CLAUDE.md §4 is
-- about exactly that: the copy is what drifts, and here the drift would be
-- silent in the worst direction (a register saying a trustee can be deleted
-- while the trigger refuses, or worse, the reverse).
--
-- Definer, because the answer must include referring rows the caller cannot
-- read. Written as an invoker function it would count only the declarations the
-- caller is cleared for, and a conflict declaration above their tier would make
-- it answer "nothing refers to this trustee" — after which the cascade runs.
-- That is the dangerous direction to be wrong in. It returns the names of the
-- registers and not their contents, so nothing about a declaration leaks.
--
-- The authority test is not this function's: trustees_delete already restricts
-- deleting to an administrator, and this is an integrity check rather than a
-- permission.
create or replace function app.what_holds_the_trustee(p_trustee uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(held order by held), '{}')
  from (
    select 'a seat on an organ' as held
     where exists (select 1 from organ_memberships m where m.trustee_id = p_trustee)
    union all
    select 'a declared interest'
     where exists (select 1 from conflict_declarations d where d.trustee_id = p_trustee)
    union all
    select 'a citation of the trust deed'
     where exists (select 1 from charter_citations c where c.trustee_id = p_trustee)
  ) as holds;
$$;

comment on function app.what_holds_the_trustee(uuid) is
  'Which registers refer to this trustee (M10-01). One definer function, read '
  'by both the delete trigger and the register view, so the rule cannot drift '
  'between what the screen offers and what the database allows.';

create or replace function app.refuse_deleting_a_trustee_on_the_record()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_holds text[] := app.what_holds_the_trustee(old.id);
begin
  if cardinality(v_holds) > 0 then
    raise exception
      'this trustee is on the record (%) and cannot be deleted; stand them down instead',
      array_to_string(v_holds, ', ')
      using errcode = 'foreign_key_violation';
  end if;

  return old;
end;
$$;

create trigger trustees_delete_only_when_nothing_refers
  before delete on trustees
  for each row execute function app.refuse_deleting_a_trustee_on_the_record();

-- ---------------------------------------------------------------------------
-- The register, with the answer on each row
-- ---------------------------------------------------------------------------
--
-- security_invoker, so the trustee rows obey the register's own policy. Only
-- `on_the_record` comes from the definer function above, and only as a
-- boolean.
create view trustee_register with (security_invoker = true) as
select
  t.*,
  cardinality(app.what_holds_the_trustee(t.id)) > 0 as on_the_record,
  -- Deletable is not the same question as on_the_record, and keeping them
  -- apart is the point: an ordinary reader may not delete anything, and a
  -- screen that greys the control for the wrong reason teaches the wrong rule.
  (app.is_admin() and cardinality(app.what_holds_the_trustee(t.id)) = 0) as may_delete
from trustees t;

comment on view trustee_register is
  'The trustee register plus whether anything refers to each trustee (M10-01). '
  'A record nothing refers to can be deleted as the mistake it was; one that '
  'is on the record is stood down instead, because deleting it would take a '
  'past sitting''s quorum with it.';

grant select on trustee_register to authenticated;

select app.reset_function_grants();
