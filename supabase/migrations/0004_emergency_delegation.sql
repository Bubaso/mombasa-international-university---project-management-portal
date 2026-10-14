-- Emergency access delegation (M1-14).
--
-- The project's own evaluation report names a single-person dependency as its
-- main structural weakness: what the project knows lives with whoever is
-- running it. Access control makes that worse, not better — locking the
-- portal down means that if the project director is unreachable, nobody can
-- act.
--
-- So: two trustees acting together can hand one person's authority to another
-- for a bounded window. Two, because one person quietly granting themselves
-- the director's clearance is the hole this would otherwise open.

create table emergency_delegations (
  id uuid primary key default gen_random_uuid(),
  -- Whose authority is being handed over.
  from_user uuid not null references profiles (id),
  -- Who acts in their place.
  to_user uuid not null references profiles (id),
  reason text not null,
  requested_by uuid not null references profiles (id),
  requested_at timestamptz not null default now(),
  -- Bounded by construction: an open-ended delegation is a role change.
  expires_at timestamptz not null,
  revoked_by uuid references profiles (id),
  revoked_at timestamptz,

  constraint emergency_delegations_distinct_parties check (to_user <> from_user),
  constraint emergency_delegations_bounded check (expires_at > requested_at)
);

create table emergency_delegation_approvals (
  delegation_id uuid not null references emergency_delegations (id) on delete cascade,
  approver_id uuid not null references profiles (id),
  approved_at timestamptz not null default now(),
  primary key (delegation_id, approver_id)
);

comment on table emergency_delegation_approvals is
  'Two distinct trustees, neither of them the recipient. The primary key '
  'stops one trustee approving twice; the trigger enforces the rest.';

create or replace function app.check_delegation_approver()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
  v_role app_role;
begin
  if new.approver_id <> auth.uid() then
    raise exception 'an approval must be recorded by the approver themselves'
      using errcode = 'insufficient_privilege';
  end if;

  select role into v_role from profiles
  where id = new.approver_id and is_active and (expires_at is null or expires_at > now());

  if v_role is distinct from 'trustee' then
    raise exception 'only an active trustee may approve a delegation'
      using errcode = 'insufficient_privilege';
  end if;

  select to_user into v_recipient from emergency_delegations where id = new.delegation_id;

  if v_recipient = new.approver_id then
    raise exception 'the recipient of a delegation cannot approve it'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger emergency_delegation_approvals_check
  before insert on emergency_delegation_approvals
  for each row execute function app.check_delegation_approver();

create trigger emergency_delegations_audit
  after insert or update or delete on emergency_delegations
  for each row execute function app.record_audit();

-- ---------------------------------------------------------------------------
-- Effect on the caller's authority
-- ---------------------------------------------------------------------------

-- The profile of whoever's authority the caller currently carries, if any.
create or replace function app.delegated_profile()
returns profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.*
  from emergency_delegations d
  join profiles p on p.id = d.from_user
  where d.to_user = auth.uid()
    and d.revoked_at is null
    and d.expires_at > now()
    and (
      select count(*) from emergency_delegation_approvals a
      where a.delegation_id = d.id
    ) >= 2
  -- If more than one is live, the widest wins; they are all deliberate.
  order by app.clearance_rank(p.clearance) desc
  limit 1;
$$;

-- A delegation adds a hat, it never removes one: the caller keeps at least
-- what they already had.
create or replace function app.current_role_name()
returns app_role
language sql
stable
as $$
  select coalesce(
    (select d.role from app.delegated_profile() d
      where app.clearance_rank(app.max_clearance(d.role))
            > app.clearance_rank(app.max_clearance((app.current_profile()).role))),
    (app.current_profile()).role
  );
$$;

create or replace function app.current_clearance()
returns confidentiality
language sql
stable
as $$
  -- The widest of what they hold and what is lent to them, then capped by
  -- what the effective role may ever hold.
  select case
    when own.id is null then null
    when app.clearance_rank(w.widest) > app.clearance_rank(app.max_clearance(app.current_role_name()))
      then app.max_clearance(app.current_role_name())
    else w.widest
  end
  from app.current_profile() own
  cross join lateral (
    select case
      when lent.id is not null
       and app.clearance_rank(lent.clearance) > app.clearance_rank(own.clearance)
        then lent.clearance
      else own.clearance
    end as widest
    from app.delegated_profile() lent
  ) w;
$$;

-- ---------------------------------------------------------------------------
-- Who may do what with a delegation
-- ---------------------------------------------------------------------------

alter table emergency_delegations enable row level security;
alter table emergency_delegations force row level security;

create policy emergency_delegations_read on emergency_delegations
  for select using (
    app.is_internal() or to_user = auth.uid() or from_user = auth.uid()
  );

-- A trustee or an administrator raises the request; approving it is separate,
-- so raising one grants nothing on its own.
create policy emergency_delegations_insert on emergency_delegations
  for insert with check (
    requested_by = auth.uid()
    and (app.current_role_name() in ('trustee', 'admin'))
  );

-- Revocation only, and only by a trustee or an administrator. Nothing else
-- about a delegation can be edited after the fact.
create policy emergency_delegations_revoke on emergency_delegations
  for update
  using (app.current_role_name() in ('trustee', 'admin'))
  with check (app.current_role_name() in ('trustee', 'admin'));

alter table emergency_delegation_approvals enable row level security;
alter table emergency_delegation_approvals force row level security;

create policy emergency_delegation_approvals_read on emergency_delegation_approvals
  for select using (app.is_internal());

create policy emergency_delegation_approvals_insert on emergency_delegation_approvals
  for insert with check (approver_id = auth.uid());

grant select, insert, update, delete on emergency_delegations to authenticated;
grant select, insert on emergency_delegation_approvals to authenticated;
grant execute on all functions in schema app to authenticated;
