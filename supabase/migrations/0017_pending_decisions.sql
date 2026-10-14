-- What is waiting on somebody to decide (M12-10).
--
-- The requirement asks for a decision support panel: "the things currently
-- waiting on a trustee's decision". By the end of Faz 4 those things exist in
-- six different registers, and the person who has to settle them has no way
-- of finding them all — which is the ordinary way a decision gets delayed.
-- Nobody refuses; it simply never reaches the top of anybody's screen.
--
-- So this is one read over six registers, and the column that makes it useful
-- is `waiting_on`: which roles can actually settle the item. A list of things
-- needing attention that does not say whose attention is a list everybody can
-- reasonably assume is somebody else's.
--
-- Declared security_invoker, so every row came out through the policy of the
-- table it belongs to. An advocate sees the questions on their own cases and
-- nothing about money; a contractor sees their own voucher and nothing else.
-- The view does nothing to enforce that and does not need to.
--
-- Requirements: M12-10, and the data behind M12-01 and M12-02.

create type decision_kind as enum (
  'risk_escalation',
  'payment_voucher',
  'valuation_approval',
  'open_question',
  'work_under_prohibition',
  'delegation_approval'
);

create view pending_decisions with (security_invoker = true) as

-- A risk crossed the escalation line and nobody has said they have seen it.
-- The crossing was recorded by the database; the acknowledgement is a person.
select
  'risk_escalation'::decision_kind as kind,
  e.id::text as id,
  r.title_en,
  r.title_tr,
  format('Score %s, over the threshold of %s', e.score, e.threshold) as detail,
  e.escalated_at as waiting_since,
  null::date as due_on,
  array['admin', 'trustee', 'board_director']::app_role[] as waiting_on,
  r.confidentiality
from risk_escalations e
join risks r on r.id = e.risk_id
where e.acknowledged_at is null

union all

-- A payment asking to be approved. Who may approve it depends on the amount,
-- so the band is read rather than assumed — the same function the trigger
-- uses, so the panel and the rule cannot disagree.
select
  'payment_voucher'::decision_kind,
  v.id::text,
  format('%s — %s', v.reference_no, v.payee),
  null,
  v.purpose,
  v.requested_at,
  null::date,
  app.required_approvers(v.amount_kes),
  v.confidentiality
from payment_vouchers v
where v.state = 'requested'

union all

-- Measured by the surveyor, waiting on the director. The other order is
-- refused by a trigger, so this is the only direction anything waits in.
select
  'valuation_approval'::decision_kind,
  val.id::text,
  format('Valuation to %s', coalesce(c.name, 'a contractor')),
  null,
  format('%s to %s', val.period_start, val.period_end),
  val.qs_certified_at,
  null::date,
  array['admin', 'project_director']::app_role[],
  val.confidentiality
from valuations val
left join contractors c on c.id = val.contractor_id
where val.qs_certified_at is not null and val.director_approved_at is null

union all

-- An unresolved question from a meeting. These are the disagreements that are
-- real and have nowhere else to sit; M3 exists partly to stop them
-- evaporating between sittings.
select
  'open_question'::decision_kind,
  q.id::text,
  q.question_en,
  q.question_tr,
  null,
  q.created_at,
  q.target_resolution_date,
  array['admin', 'project_director', 'trustee', 'board_director']::app_role[],
  q.confidentiality
from open_questions q
where q.status = 'open'

union all

-- Open work that a live prohibition reaches, and nobody has put their name to
-- continuing. The portal never blocks the work — but until somebody records a
-- reason, this is a decision that has been taken without being made.
select
  'work_under_prohibition'::decision_kind,
  c.site_task_id::text || ':' || c.obligation_id::text,
  c.task_title_en,
  c.task_title_tr,
  c.obligation_title_en,
  null::timestamptz,
  null::date,
  array['admin', 'project_director', 'trustee']::app_role[],
  c.confidentiality
from site_task_conflicts c
where not c.acknowledged

union all

-- A delegation of authority waiting for its second trustee. One approval is
-- not a delegation; it is a request.
select
  'delegation_approval'::decision_kind,
  d.id::text,
  'Emergency delegation of authority',
  'Olağanüstü yetki devri',
  d.reason,
  d.requested_at,
  d.expires_at::date,
  array['trustee']::app_role[],
  'restricted'::confidentiality
from emergency_delegations d
where d.revoked_at is null
  and d.expires_at > now()
  and (select count(*) from emergency_delegation_approvals a where a.delegation_id = d.id) < 2;

comment on view pending_decisions is
  'Everything waiting on a ruling, across six registers (M12-10). '
  '`waiting_on` names the roles that can settle each item, because a list of '
  'things needing attention that does not say whose is a list everybody can '
  'assume is somebody else''s. security_invoker, so each row arrived through '
  'the policy of its own table.';

grant select on pending_decisions to authenticated;
grant execute on all functions in schema app to authenticated;
