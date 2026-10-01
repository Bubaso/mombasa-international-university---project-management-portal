-- A candidate who has not quoted a fee (M14-02).
--
-- Found by putting the real archive into the register. The legal adviser
-- search in the Notion Meeting Hub has seven candidates and exactly one
-- quoted figure: 100,000 USD, for a ten to twelve page record of appeal.
-- Four of the others were asked for a proposal and had not sent one; one was
-- rejected before quoting; one is waiting to see the Court of Appeal position
-- before making an offer.
--
-- app.add_money_columns makes an amount NOT NULL, which is right for a
-- payment voucher and a budget line — there is no such thing as a payment of
-- an unknown amount. It is wrong for a candidate: the comparison screen would
-- have shown four advocates offering to work for KES 0, which is not a
-- discount, it is a number nobody said.
--
-- So the fee becomes nullable, and the rule moves to where it belongs: a
-- candidate cannot be SELECTED without one. Awarding work at an unknown
-- price is the thing worth refusing; inviting a proposal and not having it
-- yet is the ordinary state of a procurement halfway through.
--
-- fee_amount_kes is generated as round(fee_amount * rate, 2) and is already
-- nullable, so a null fee simply makes the converted figure null too — which
-- is what every screen reading it should see.

alter table procurement_candidates alter column fee_amount drop not null;

alter table procurement_candidates
  add constraint procurement_candidates_selected_has_a_fee check (
    outcome <> 'selected' or fee_amount is not null
  );

comment on column procurement_candidates.fee_amount is
  'What they quoted, or null when they have not quoted yet. A selected '
  'candidate must have one: work awarded at an unknown price is the case '
  'worth refusing.';
