-- The other half of the contract-to-valuation match (M14-07).
--
-- 0022 built the payment schedule and the link from an instalment to the
-- measured valuation and the voucher that settled it, and the screen says
-- "hakedişe bağlı" where that link exists. All of that reads in one
-- direction: from a milestone somebody wrote down, to the work behind it.
--
-- Four things it cannot see, each of which is a disagreement between two
-- registers that nobody would currently find out about:
--
--   1. Measured work with no instalment. A valuation is the quantity
--      surveyor's measurement of a period's work. If no milestone cites it,
--      the works register says the contractor earned money and the payment
--      schedule has never heard of it. This is the direction that is
--      invisible today, because every view starts from the schedule.
--
--   2. An instalment whose amount disagrees with the valuation it cites. Two
--      numbers for one piece of work, and the screen shows whichever one the
--      reader happened to open.
--
--   3. An instalment marked certified or paid whose valuation carries no
--      surveyor's certification — the schedule claiming a signature the works
--      register does not hold.
--
--   4. One valuation cited by two instalments, which is how a period of work
--      gets paid for twice.
--
-- Three of those four are reported, not refused, for the same reason
-- `over_committed` is: a variation is a real thing, a joint venture is a real
-- thing, and blocking the entry only moves the true figure into a
-- spreadsheet. The fourth is refused, because there is no reading of two
-- instalments against one measurement that is not either an error or a
-- double payment, and the honest fix is two valuations.
--
-- Requirements: M14-07.

-- ---------------------------------------------------------------------------
-- One measurement, one instalment
-- ---------------------------------------------------------------------------

-- A partial unique index rather than a constraint, because most milestones
-- cite no valuation at all — a legal retainer has none — and nulls must not
-- collide. If a period of work ever genuinely needs splitting across two
-- payments, the answer is two valuations measuring the two parts, not one
-- measurement pointing at two numbers.
create unique index contract_milestones_one_valuation_once
  on contract_milestones (valuation_id)
  where valuation_id is not null;

comment on index contract_milestones_one_valuation_once is
  'A measured valuation settles one instalment (M14-07). Two instalments '
  'against one measurement is a double payment; split the measurement '
  'instead.';

-- ---------------------------------------------------------------------------
-- The match, from the schedule
-- ---------------------------------------------------------------------------

create view milestone_matching with (security_invoker = true) as
select
  m.id as contract_milestone_id,
  m.contract_id,
  c.reference_no,
  c.counterparty_name,
  c.contractor_id as contract_contractor_id,
  m.sequence,
  m.title_en,
  m.title_tr,
  m.state,
  m.due_on,
  m.amount,
  m.currency,
  m.amount_kes,
  m.valuation_id,
  m.payment_voucher_id,
  v.amount as valuation_amount,
  v.currency as valuation_currency,
  v.contractor_id as valuation_contractor_id,
  v.construction_block_id,
  v.period_start,
  v.period_end,
  v.state as valuation_state,
  v.qs_certified_at,
  v.director_approved_at,

  -- Four answers, not two. A milestone with no valuation is not a
  -- disagreement, and two amounts in different currencies cannot be compared
  -- at all: a valuation carries no exchange rate, so declaring them unequal
  -- would be inventing the comparison.
  case
    when m.valuation_id is null then 'unmatched'
    when m.currency <> v.currency then 'different_currencies'
    when m.amount = v.amount then 'agree'
    else 'disagree'
  end as amount_verdict,

  -- The schedule claiming a signature the works register does not hold.
  (
    m.state in ('certified', 'paid')
    and (m.valuation_id is null or v.qs_certified_at is null)
  ) as claims_a_certification_the_works_do_not,

  -- A milestone citing work measured for a different firm. Both ids have to
  -- be known for this to mean anything; where either is absent the answer is
  -- false rather than a guess.
  (
    m.valuation_id is not null
    and c.contractor_id is not null
    and v.contractor_id is not null
    and v.contractor_id <> c.contractor_id
  ) as matched_to_another_firms_work,

  greatest(m.confidentiality, c.confidentiality) as confidentiality
from contract_milestones m
join contracts c on c.id = m.contract_id
left join valuations v on v.id = m.valuation_id;

comment on view milestone_matching is
  'Each instalment against the valuation it cites (M14-07). amount_verdict '
  'has four values because "no valuation yet" and "two currencies and no '
  'rate" are not disagreements.';

-- ---------------------------------------------------------------------------
-- The match, from the works
-- ---------------------------------------------------------------------------

-- Measured work that no instalment pays for. This is the half that was
-- missing: a valuation the surveyor has certified, with nothing in the
-- payment schedule against it, is the project owing money it has not written
-- down.
create view unscheduled_valuations with (security_invoker = true) as
select
  v.id as valuation_id,
  v.construction_block_id,
  b.code as block_code,
  v.contractor_id,
  ct.name as contractor_name,
  v.period_start,
  v.period_end,
  v.amount,
  v.currency,
  v.state,
  v.qs_certified_at,
  v.director_approved_at,
  v.paid_at,
  -- Certified and unscheduled is the case that matters: a draft valuation is
  -- a working figure, a certified one is a measurement somebody signed.
  (v.qs_certified_at is not null) as certified,
  -- Which contract this probably belongs to, named only where exactly one
  -- live contract names the same firm. Where there are none or several the
  -- answer is null: the register does not pick one, because a wrong
  -- suggestion here is a payment against the wrong contract.
  case
    when (
      select count(*) from contracts c
      where c.contractor_id = v.contractor_id
        and c.state in ('signed', 'active')
    ) = 1
    then (
      select c.id from contracts c
      where c.contractor_id = v.contractor_id
        and c.state in ('signed', 'active')
      limit 1
    )
  end as the_only_live_contract_for_that_firm,
  v.confidentiality
from valuations v
left join construction_blocks b on b.id = v.construction_block_id
left join contractors ct on ct.id = v.contractor_id
where not exists (
  select 1 from contract_milestones m where m.valuation_id = v.id
)
  and v.state <> 'rejected';

comment on view unscheduled_valuations is
  'Measured work with no instalment against it (M14-07). The contract is '
  'named only where exactly one live contract names the same firm; otherwise '
  'null, because a wrong suggestion here is a payment against the wrong '
  'contract.';

-- ---------------------------------------------------------------------------
-- What the two registers disagree about
-- ---------------------------------------------------------------------------

create view payment_matching_health with (security_invoker = true) as
select
  (
    select count(*) from milestone_matching
    where amount_verdict = 'disagree'
  ) as instalments_whose_amount_disagrees,
  (
    select count(*) from milestone_matching
    where amount_verdict = 'different_currencies'
  ) as instalments_that_cannot_be_compared,
  (
    select count(*) from milestone_matching
    where claims_a_certification_the_works_do_not
  ) as instalments_claiming_an_uncertified_measurement,
  (
    select count(*) from milestone_matching
    where matched_to_another_firms_work
  ) as instalments_matched_to_another_firms_work,
  (
    -- Only the settled end of the schedule. A planned instalment with no
    -- valuation is the normal state of a payment plan, not a finding.
    select count(*) from milestone_matching
    where amount_verdict = 'unmatched' and state in ('certified', 'paid')
  ) as settled_instalments_with_no_measurement,
  (select count(*) from unscheduled_valuations) as measured_work_with_no_instalment,
  (select count(*) from unscheduled_valuations where certified)
    as certified_work_with_no_instalment;

comment on view payment_matching_health is
  'Where the payment schedule and the works register disagree (M14-07). '
  'Every column is two registers saying different things about the same '
  'money, which is the thing nobody finds out about on their own.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Read follows the underlying tables: all three are security_invoker, so a
-- contractor sees the rows their own contract and block scope already lets
-- them see, and the commercial gate on valuations still applies.
grant select on milestone_matching, unscheduled_valuations, payment_matching_health
  to authenticated;

select app.reset_function_grants();
