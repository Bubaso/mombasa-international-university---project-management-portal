-- Fixtures for the policy tests: one person per interesting role, and one
-- record at each confidentiality tier.
--
-- Inserted as the table owner with RLS bypassed, so the seed itself proves
-- nothing about access — that is entirely the tests' job.

set role postgres;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.test',      now()),
  ('22222222-2222-2222-2222-222222222222', 'director@example.test',   now()),
  ('33333333-3333-3333-3333-333333333333', 'trustee@example.test',    now()),
  ('44444444-4444-4444-4444-444444444444', 'field@example.test',      now()),
  ('55555555-5555-5555-5555-555555555555', 'advocate@example.test',   now()),
  ('66666666-6666-6666-6666-666666666666', 'advocate2@example.test',  now()),
  ('77777777-7777-7777-7777-777777777777', 'contractor@example.test', now()),
  ('88888888-8888-8888-8888-888888888888', 'donor@example.test',      now()),
  ('99999999-9999-9999-9999-999999999999', 'expired@example.test',    now()),
  ('aaaa1111-1111-1111-1111-111111111111', 'trustee2@example.test',   now()),
  ('bbbb1111-1111-1111-1111-111111111111', 'trustee3@example.test',   now());

insert into profiles (id, full_name, email, role, organization, clearance, is_active, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'Admin',            'admin@example.test',      'admin',            'AUTK',        'restricted',   true, null),
  ('22222222-2222-2222-2222-222222222222', 'Project Director', 'director@example.test',   'project_director', 'AUTK',        'restricted',   true, null),
  ('33333333-3333-3333-3333-333333333333', 'Trustee',          'trustee@example.test',    'trustee',          'AUTK',        'restricted',   true, null),
  ('44444444-4444-4444-4444-444444444444', 'Field Team',       'field@example.test',      'field_team',       'AUTK',        'confidential', true, null),
  ('55555555-5555-5555-5555-555555555555', 'Advocate One',     'advocate@example.test',   'legal_counsel',    'Firm A',      'internal',     true, null),
  ('66666666-6666-6666-6666-666666666666', 'Advocate Two',     'advocate2@example.test',  'legal_counsel',    'Firm B',      'internal',     true, null),
  ('77777777-7777-7777-7777-777777777777', 'Contractor',       'contractor@example.test', 'contractor',       'Coast Eng',   'internal',     true, null),
  ('88888888-8888-8888-8888-888888888888', 'Donor',            'donor@example.test',      'donor',            'Foundation',  'public',       true, null),
  ('99999999-9999-9999-9999-999999999999', 'Expired Consult',  'expired@example.test',    'consultant',       'Advisory',    'internal',     true, now() - interval '1 day'),
  ('aaaa1111-1111-1111-1111-111111111111', 'Trustee Two',      'trustee2@example.test',   'trustee',          'AUTK',        'restricted',   true, null),
  -- A third trustee, because approving a delegation takes two who are not
  -- the recipient: with only two on the books, no trustee could ever receive
  -- one, which is the case 0005 had to get right.
  ('bbbb1111-1111-1111-1111-111111111111', 'Trustee Three',    'trustee3@example.test',   'trustee',          'AUTK',        'restricted',   true, null);

-- ---------------------------------------------------------------------------
-- Records, one per tier
-- ---------------------------------------------------------------------------

insert into legal_cases (id, case_number, title, court, confidentiality) values
  ('aaaa0000-0000-0000-0000-000000000001', 'CA/E062/2025', 'Public case',       'Court of Appeal', 'public'),
  ('aaaa0000-0000-0000-0000-000000000002', 'ELC/134/2013', 'Internal case',     'ELC Mombasa',     'internal'),
  ('aaaa0000-0000-0000-0000-000000000003', 'ELC/52/2022',  'Confidential case', 'ELC Mombasa',     'confidential'),
  ('aaaa0000-0000-0000-0000-000000000004', 'MIC/103/2012', 'Restricted case',   'Magistrate',      'restricted');

insert into construction_blocks (id, code, name, confidentiality) values
  ('bbbb0000-0000-0000-0000-000000000001', 'A1', 'Block A1', 'internal'),
  ('bbbb0000-0000-0000-0000-000000000002', 'B2', 'Block B2', 'internal');

insert into financial_transactions (id, reference_no, date, category, amount_kshs, confidentiality) values
  ('cccc0000-0000-0000-0000-000000000001', 'PV-001', current_date, 'civil_construction', 1000000, 'internal');

insert into communication_threads (id, title, channel, confidentiality) values
  ('dddd0000-0000-0000-0000-000000000001', 'Internal thread',   'legal',    'internal'),
  ('dddd0000-0000-0000-0000-000000000002', 'Restricted thread', 'trustees', 'restricted');

insert into deadline_notifications (id, title_en, title_tr, due_date, urgency, category, target_roles, confidentiality) values
  ('eeee0000-0000-0000-0000-000000000001', 'Hearing', 'Duruşma', current_date + 7, 'critical', 'legal', '{}', 'internal'),
  ('eeee0000-0000-0000-0000-000000000002', 'Board only', 'Kurul', current_date + 14, 'warning', 'governance', '{trustee}', 'internal');

-- ---------------------------------------------------------------------------
-- Scope and grants
-- ---------------------------------------------------------------------------

-- Advocate One is on the internal case only; Advocate Two is on nothing.
insert into case_assignments (user_id, legal_case_id, assigned_by) values
  ('55555555-5555-5555-5555-555555555555', 'aaaa0000-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222');

-- The contractor has Block A1 and not B2.
insert into block_assignments (user_id, construction_block_id, assigned_by) values
  ('77777777-7777-7777-7777-777777777777', 'bbbb0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222');

-- A grant lifting Advocate One to one confidential case, and an expired one
-- that must no longer count.
insert into record_grants (user_id, entity_type, entity_id, permission, granted_by, expires_at) values
  ('55555555-5555-5555-5555-555555555555', 'legal_cases', 'aaaa0000-0000-0000-0000-000000000003',
   'read', '22222222-2222-2222-2222-222222222222', null),
  ('66666666-6666-6666-6666-666666666666', 'legal_cases', 'aaaa0000-0000-0000-0000-000000000002',
   'read', '22222222-2222-2222-2222-222222222222', now() - interval '1 hour');

-- Advocate Two is granted the restricted case on purpose: the tests assert
-- that this still does not let an external role read it.
insert into record_grants (user_id, entity_type, entity_id, permission, granted_by) values
  ('66666666-6666-6666-6666-666666666666', 'legal_cases', 'aaaa0000-0000-0000-0000-000000000004',
   'read', '22222222-2222-2222-2222-222222222222');

reset role;

-- ---------------------------------------------------------------------------
-- Stakeholders and meetings (M3, M4)
-- ---------------------------------------------------------------------------

set role postgres;

insert into organizations (id, name, category, country) values
  ('0a000000-0000-0000-0000-000000000001', 'Ministry of Education', 'government', 'Kenya'),
  ('0a000000-0000-0000-0000-000000000002', 'Coast Engineering Ltd', 'contractor',  'Kenya');

insert into stakeholders
  (id, full_name, title, organization_id, category, stance, influence, interest,
   relationship_owner, profile_id, confidentiality) values
  ('0b000000-0000-0000-0000-000000000001', 'The Minister', 'Cabinet Secretary',
   '0a000000-0000-0000-0000-000000000001', 'government', 'supporter', 5, 4,
   '22222222-2222-2222-2222-222222222222', null, 'internal'),
  ('0b000000-0000-0000-0000-000000000002', 'Community Elder', 'Elder',
   null, 'community_leader', 'neutral', 2, 3,
   '22222222-2222-2222-2222-222222222222', null, 'public'),
  ('0b000000-0000-0000-0000-000000000003', 'Advocate One', 'Advocate',
   null, 'legal', 'supporter', 3, 5,
   '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'internal'),
  ('0b000000-0000-0000-0000-000000000004', 'Contractor Lead', 'Site Manager',
   '0a000000-0000-0000-0000-000000000002', 'contractor', 'neutral', 2, 4,
   '22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777', 'internal'),
  -- Nobody keeps this one and nobody has spoken to them: the two findings the
  -- attention view exists to surface.
  ('0b000000-0000-0000-0000-000000000005', 'Unattended Senator', 'Senator',
   null, 'government', 'unknown', 5, 3, null, null, 'internal');

insert into stakeholder_interactions (id, stakeholder_id, occurred_at, channel, summary) values
  ('0c000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001',
   now() - interval '3 days', 'in_person', 'Met at the ministry; promised to make calls.');

insert into stakeholder_assessments (id, stakeholder_id, body) values
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001',
   'Warm in person, slow to act. Follow up through the governor.');

insert into stakeholder_relationships
  (from_stakeholder_id, to_stakeholder_id, kind, strength) values
  ('0b000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000000000001',
   'influences', 4);

insert into meetings (id, title, held_at, kind, status, minutes_status, confidentiality) values
  ('0e000000-0000-0000-0000-000000000001', 'Legal strategy', now() - interval '2 days',
   'legal', 'completed', 'draft', 'internal'),
  ('0e000000-0000-0000-0000-000000000002', 'Trustee session', now() - interval '1 day',
   'trustee', 'completed', 'final', 'restricted'),
  ('0e000000-0000-0000-0000-000000000003', 'Community briefing', now() - interval '5 days',
   'community', 'completed', 'draft', 'public'),
  -- Attended by the same advocate, but classified above their clearance: scope
  -- narrows, it never lifts.
  ('0e000000-0000-0000-0000-000000000004', 'Confidential counsel review', now(),
   'legal', 'planned', 'draft', 'confidential');

insert into meeting_attendees (meeting_id, profile_id, stakeholder_id, role_at_meeting) values
  ('0e000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', null, 'chair'),
  ('0e000000-0000-0000-0000-000000000001', null, '0b000000-0000-0000-0000-000000000003', 'participant'),
  ('0e000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', null, 'chair'),
  ('0e000000-0000-0000-0000-000000000003', null, '0b000000-0000-0000-0000-000000000002', 'participant'),
  ('0e000000-0000-0000-0000-000000000004', null, '0b000000-0000-0000-0000-000000000003', 'participant');

insert into meeting_notes (id, meeting_id, section, language, body) values
  ('0f000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001',
   'discussed', 'en', 'Appeal timetable and the record of appeal.'),
  ('0f000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-000000000002',
   'discussed', 'en', 'Board assessment of the partner trust.');

insert into decisions (id, meeting_id, reference_no, text_en, organ, vote, status, confidentiality)
values
  ('10000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001',
   'D-2026-01', 'File our own Record of Appeal.', 'Board of Trustees', 'unanimous',
   'in_force', 'internal');

insert into action_items
  (id, meeting_id, text_en, due_date, status, owner_profile_id, owner_stakeholder_id,
   confidentiality) values
  -- Owned by someone outside the organisation, which is the ordinary case.
  ('11000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001',
   'Secure the site boundary markers.', current_date + 3, 'open',
   null, '0b000000-0000-0000-0000-000000000004', 'internal'),
  ('11000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-000000000002',
   'Draft the trustee briefing pack.', current_date + 7, 'open',
   '44444444-4444-4444-4444-444444444444', null, 'internal');

insert into open_questions
  (id, meeting_id, question_en, status, target_resolution_date, owner_profile_id,
   confidentiality) values
  ('12000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001',
   'Do we join the partner trust''s appeal or file separately?', 'open',
   current_date + 14, '22222222-2222-2222-2222-222222222222', 'internal');

reset role;

-- ---------------------------------------------------------------------------
-- Suggestions and provenance (0008)
-- ---------------------------------------------------------------------------

set role postgres;

insert into suggestions
  (id, title, details, kind, status, suggested_by_stakeholder_id, suggested_by_name,
   confidentiality) values
  -- Proposed by somebody outside the organisation, which is the case the
  -- suggestion box exists for.
  ('13000000-0000-0000-0000-000000000001', 'Invite the county education office',
   'They asked to be kept in the loop.', 'contact', 'pending_review',
   '0b000000-0000-0000-0000-000000000004', 'Contractor Lead', 'internal'),
  ('13000000-0000-0000-0000-000000000002', 'Move the trustee session earlier',
   null, 'meeting_topic', 'pending_review', null, 'Someone in Notion', 'internal');

-- A record that came from somewhere else, so provenance can be exercised.
insert into stakeholders (id, full_name, category, confidentiality, source_system, source_id)
values ('0b000000-0000-0000-0000-000000000006', 'Imported Contact', 'other', 'internal',
        'notion', 'notion-page-id-1');

reset role;

-- ---------------------------------------------------------------------------
-- The legal register and the obligations it feeds (M5, M2)
-- ---------------------------------------------------------------------------

set role postgres;

-- Everything below hangs off the internal case, which Advocate One is on and
-- Advocate Two is not: that is what makes M5-16 testable.
insert into legal_orders (id, legal_case_id, made_on, made_by, reference_no, text_en, state)
values
  ('14000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002',
   current_date - 60, 'ELC Mombasa', 'ORD-2026-01',
   'No interference with the boundary pending determination.', 'in_force'),
  ('14000000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000004',
   current_date - 30, 'Magistrate', 'ORD-2026-02',
   'Restricted matter.', 'in_force');

insert into hearings (id, legal_case_id, scheduled_for, kind, bench, preparation)
values ('15000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002',
        now() + interval '10 days', 'hearing', 'ELC Mombasa', 'in_preparation');

insert into filings (id, legal_case_id, kind, title, due_on, state)
values ('16000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002',
        'record_of_appeal', 'Record of Appeal', current_date + 5, 'drafting');

insert into exhibits (id, legal_case_id, mark, description, source)
values ('17000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002',
        'AUTK-1', 'Certified copy of the title', 'Land registry');

insert into exhibit_custody (id, exhibit_id, from_party, to_party)
values ('18000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001',
        'Land registry', 'Advocate One');

insert into case_counsel (legal_case_id, stakeholder_id, state, power_of_attorney_filed)
values ('aaaa0000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000003',
        'on_record', true);

-- --- obligations, one per source that matters ------------------------------

insert into obligations
  (id, title_en, source, obligor_name, beneficiary_name, due_on, state, confidentiality)
values
  ('19000000-0000-0000-0000-000000000001', 'Build a mosque on the campus', 'lease',
   'AUTK', 'The lessor', current_date + 40, 'open', 'internal'),
  ('19000000-0000-0000-0000-000000000002', 'Full scholarships for 20% of students', 'lease',
   'AUTK', 'Coastal youth', current_date + 400, 'open', 'internal');

-- From a court order, and forbidding rather than requiring: the case M2-06
-- exists for.
insert into obligations
  (id, title_en, source, source_legal_order_id, obligor_name, due_on, state, prohibits,
   confidentiality)
values ('19000000-0000-0000-0000-000000000003',
        'Do not interfere with the boundary', 'court_order',
        '14000000-0000-0000-0000-000000000001', 'AUTK', null, 'open', true, 'internal');

-- A promise made in a meeting, owed by somebody in the register.
insert into obligations
  (id, title_en, source, source_meeting_id, obligor_name, obligor_stakeholder_id,
   due_on, state, confidentiality)
values
  ('19000000-0000-0000-0000-000000000004',
   'Use his contacts to support the legal case', 'personal_commitment',
   '0e000000-0000-0000-0000-000000000001', 'The Minister',
   '0b000000-0000-0000-0000-000000000001', current_date + 3, 'open', 'internal'),
  ('19000000-0000-0000-0000-000000000005',
   'Sign the MoU before the departure', 'personal_commitment',
   '0e000000-0000-0000-0000-000000000001', 'The Minister',
   '0b000000-0000-0000-0000-000000000001', current_date - 10, 'breached', 'internal');

-- One the contractor owes, so an external obligor has something to find.
insert into obligations
  (id, title_en, source, obligor_name, obligor_stakeholder_id, due_on, state, confidentiality)
values ('19000000-0000-0000-0000-000000000006', 'Keep the site boundary markers in place',
        'contract', 'Contractor Lead', '0b000000-0000-0000-0000-000000000004',
        current_date + 20, 'open', 'internal');

-- Evidence first, then the state moves: the trigger allows no other order.
insert into obligations
  (id, title_en, source, source_meeting_id, obligor_name, obligor_stakeholder_id,
   state, confidentiality)
values ('19000000-0000-0000-0000-000000000007', 'Brief the ambassador', 'personal_commitment',
        '0e000000-0000-0000-0000-000000000001', 'The Minister',
        '0b000000-0000-0000-0000-000000000001', 'open', 'internal');

insert into obligation_evidence (obligation_id, description, observed_on)
values ('19000000-0000-0000-0000-000000000007', 'Briefing note circulated', current_date - 2);

update obligations set state = 'fulfilled'
where id = '19000000-0000-0000-0000-000000000007';

reset role;
