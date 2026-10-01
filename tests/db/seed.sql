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
  ('bbbb1111-1111-1111-1111-111111111111', 'trustee3@example.test',   now()),
  ('cccc1111-1111-1111-1111-111111111111', 'qs@example.test',         now());

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
  ('bbbb1111-1111-1111-1111-111111111111', 'Trustee Three',    'trustee3@example.test',   'trustee',          'AUTK',        'restricted',   true, null),
  -- The quantity surveyor is the one external role whose whole job is the
  -- commercial papers, so M7-10 splits along them and not along the fence.
  ('cccc1111-1111-1111-1111-111111111111', 'Surveyor',         'qs@example.test',         'quantity_surveyor','Measure Ltd', 'internal',     true, null);

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

insert into financial_transactions
  (id, reference_no, date, category, amount, currency, confidentiality)
values
  ('cccc0000-0000-0000-0000-000000000001', 'PV-001', current_date, 'civil_construction',
   1000000, 'KES', 'internal');

-- Both on the general channel, which every role belongs to, so the two
-- assertions below turn on clearance alone. 0027 added channel membership as
-- a second gate; it has its own fixtures in the M11 block rather than
-- quietly becoming the reason these two pass.
insert into communication_threads (id, title, channel, confidentiality) values
  ('dddd0000-0000-0000-0000-000000000001', 'Internal thread',   'general', 'internal'),
  ('dddd0000-0000-0000-0000-000000000002', 'Restricted thread', 'general', 'restricted');

-- deadline_notifications is gone (0024). It held hand-typed dates with a
-- target_roles array, which was a second answer to "what falls due" and a
-- second, weaker access mechanism beside the policies. What falls due now
-- comes from project_calendar, computed from the registers, and a date worth
-- putting in front of somebody is an action item or a meeting — both of which
-- appear there with an owner and their own visibility.

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
   '22222222-2222-2222-2222-222222222222'),
  ('cccc1111-1111-1111-1111-111111111111', 'bbbb0000-0000-0000-0000-000000000001',
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
   null, 'government', 'unknown', 5, 3, null, null, 'internal'),
  -- A donor with an account of their own, so "the donor reads their own
  -- report" (M8-12) is something the tests can check rather than assert.
  ('0b000000-0000-0000-0000-000000000007', 'Foundation Donor', 'Programme lead',
   null, 'donor', 'supporter', 3, 5, '22222222-2222-2222-2222-222222222222',
   '88888888-8888-8888-8888-888888888888', 'internal');

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

insert into meetings (id, title, title_tr, held_at, kind, status, minutes_status, confidentiality) values
  -- Bilingual, because the Notion migration merges the English and Turkish
  -- minute of one meeting into one record rather than importing two (0028).
  ('0e000000-0000-0000-0000-000000000001', 'Legal strategy', 'Hukuk stratejisi',
   now() - interval '2 days',
   'legal', 'completed', 'draft', 'internal'),
  ('0e000000-0000-0000-0000-000000000002', 'Trustee session', null, now() - interval '1 day',
   'trustee', 'completed', 'final', 'restricted'),
  ('0e000000-0000-0000-0000-000000000003', 'Community briefing', null, now() - interval '5 days',
   'community', 'completed', 'draft', 'public'),
  -- Attended by the same advocate, but classified above their clearance: scope
  -- narrows, it never lifts.
  ('0e000000-0000-0000-0000-000000000004', 'Confidential counsel review', null, now(),
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

-- ---------------------------------------------------------------------------
-- The document vault (M9)
-- ---------------------------------------------------------------------------

set role postgres;

insert into document_vault (id, title, category, status, confidentiality) values
  ('1b000000-0000-0000-0000-000000000001', 'Certified copy of the title',
   'trust_deed', 'approved', 'internal'),
  ('1b000000-0000-0000-0000-000000000002', 'Board assessment pack',
   'correspondence', 'approved', 'restricted');

-- Two uploads of the same document, so "which one is in force" is testable.
-- The digests here stand in for ones the server computed; nothing but the
-- service role can write them at runtime.
insert into document_versions
  (id, document_id, storage_path, file_name, content_type, byte_size, sha256,
   digest_computed_at)
values
  ('1c000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001',
   '1b000000-0000-0000-0000-000000000001/1c000000-0000-0000-0000-000000000001',
   'title-copy-v1.pdf', 'application/pdf', 182344,
   'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', now()),
  ('1c000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000001',
   '1b000000-0000-0000-0000-000000000001/1c000000-0000-0000-0000-000000000002',
   'title-copy-v2.pdf', 'application/pdf', 190112,
   'b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c', now());

-- One that was uploaded but whose digest has not been computed: the interface
-- must show this as unverified rather than as a document.
insert into document_versions (id, document_id, storage_path, file_name)
values ('1c000000-0000-0000-0000-000000000003', '1b000000-0000-0000-0000-000000000002',
        '1b000000-0000-0000-0000-000000000002/1c000000-0000-0000-0000-000000000003',
        'board-pack.pdf');

insert into document_access (document_id, version_id, profile_id, action) values
  ('1b000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333', 'downloaded');

insert into document_links (document_id, entity_type, entity_id) values
  ('1b000000-0000-0000-0000-000000000001', 'legal_cases',
   'aaaa0000-0000-0000-0000-000000000002');

reset role;

-- ---------------------------------------------------------------------------
-- The site (M7)
-- ---------------------------------------------------------------------------

insert into project_phases (id, code, name_en, sequence) values
  ('1c000000-0000-0000-0000-000000000001', 'P1', 'Phase one', 1);

insert into contractors (id, name, contract_reference, starts_on) values
  ('1c000000-0000-0000-0000-000000000010', 'Coast Engineering', 'C-2024-01', current_date - 200);

update construction_blocks
set phase_id = '1c000000-0000-0000-0000-000000000001',
    contractor_id = '1c000000-0000-0000-0000-000000000010';

insert into work_packages (id, construction_block_id, code, title_en) values
  ('1c000000-0000-0000-0000-000000000020', 'bbbb0000-0000-0000-0000-000000000001',
   'A1-SUB', 'Substructure'),
  ('1c000000-0000-0000-0000-000000000021', 'bbbb0000-0000-0000-0000-000000000002',
   'B2-SUB', 'Substructure');

-- Two on the assigned block: one ordinary, one preservation with the reason
-- it exists recorded. And one on the block nobody outside is assigned to.
insert into site_tasks (id, work_package_id, title_en, kind, state, legal_basis_en) values
  ('1c000000-0000-0000-0000-000000000030', '1c000000-0000-0000-0000-000000000020',
   'Pour the raft', 'construction', 'in_progress', null),
  ('1c000000-0000-0000-0000-000000000031', '1c000000-0000-0000-0000-000000000020',
   'Sheet the open slab before the monsoon', 'preservation', 'in_progress',
   'Works are stopped by the boundary order; the structure still has to be kept.'),
  ('1c000000-0000-0000-0000-000000000032', '1c000000-0000-0000-0000-000000000021',
   'Set out grid lines', 'construction', 'planned', null);

-- The prohibition from the court order reaches the first block. Somebody who
-- read the order said so; nothing inferred it.
insert into obligation_blocks (obligation_id, construction_block_id) values
  ('19000000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Money (M8)
-- ---------------------------------------------------------------------------

-- The external auditor is capped at `internal` by their role, which is the
-- point: the audit badge is theirs to award and the restricted tier is still
-- not theirs to read.
insert into auth.users (id, email, email_confirmed_at)
values ('dddd1111-1111-1111-1111-111111111111', 'auditor@example.test', now());

insert into profiles (id, full_name, email, role, organization, clearance, is_active)
values ('dddd1111-1111-1111-1111-111111111111', 'Auditor', 'auditor@example.test',
        'external_auditor', 'Audit LLP', 'internal', true);

insert into budget_categories (id, code, name_en, sequence) values
  ('1d000000-0000-0000-0000-000000000001', 'CIVIL', 'Civil construction', 1),
  ('1d000000-0000-0000-0000-000000000002', 'LEGAL', 'Legal costs', 2);

insert into budget_lines
  (id, budget_category_id, construction_block_id, title_en, amount, currency, confidentiality)
values
  ('1d000000-0000-0000-0000-000000000010', '1d000000-0000-0000-0000-000000000001',
   'bbbb0000-0000-0000-0000-000000000001', 'Substructure to Block A1',
   10000000, 'KES', 'internal'),
  -- Pledged in one currency, reported in another: the rate is on the row.
  ('1d000000-0000-0000-0000-000000000011', '1d000000-0000-0000-0000-000000000002',
   null, 'Counsel fees', 20000, 'USD', 'internal');

update budget_lines set fx_rate_to_kes = 130
where id = '1d000000-0000-0000-0000-000000000011';

insert into donations
  (id, donor_name, pledged_on, pledged_amount, pledged_currency, confidentiality)
values ('1d000000-0000-0000-0000-000000000020', 'A Turkish foundation',
        current_date - 90, 1000000, 'TRY', 'internal');

update donations set pledged_fx_rate_to_kes = 4
where id = '1d000000-0000-0000-0000-000000000020';

-- The same donor's pledge, attributed to them, with one tranche received and
-- one received without a document — the distinction M8-08 and the vault both
-- turn on.
insert into donations
  (id, donor_stakeholder_id, donor_name, pledged_on, pledged_amount, pledged_currency,
   confidentiality)
values ('1d000000-0000-0000-0000-000000000021', '0b000000-0000-0000-0000-000000000007',
        'Foundation Donor', current_date - 200, 4000000, 'KES', 'internal');

insert into donation_tranches
  (id, donation_id, received_on, received_amount, received_currency, document_id, confidentiality)
values
  ('1d000000-0000-0000-0000-000000000031', '1d000000-0000-0000-0000-000000000021',
   current_date - 150, 1500000, 'KES', '1b000000-0000-0000-0000-000000000001', 'internal'),
  ('1d000000-0000-0000-0000-000000000032', '1d000000-0000-0000-0000-000000000021',
   current_date - 40, 500000, 'KES', null, 'internal');

-- A third of it has actually arrived, and it has a receipt against it.
insert into donation_tranches
  (donation_id, received_on, received_amount, received_currency, received_fx_rate_to_kes,
   document_id)
values ('1d000000-0000-0000-0000-000000000020', current_date - 30, 300000, 'TRY', 4,
        '1b000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- RAID (M6)
-- ---------------------------------------------------------------------------

insert into risks
  (id, title_en, category, likelihood, impact, state, owner_profile_id, confidentiality)
values
  ('1e000000-0000-0000-0000-000000000001', 'The lease is not renewed', 'legal',
   3, 4, 'open', '22222222-2222-2222-2222-222222222222', 'internal'),
  ('1e000000-0000-0000-0000-000000000002', 'Monsoon damage to the open slab', 'climate',
   2, 3, 'open', '44444444-4444-4444-4444-444444444444', 'internal');

-- The load-bearing belief the whole programme rests on.
insert into assumptions
  (id, statement_en, risk_category, state, owner_profile_id, confidentiality)
values ('1e000000-0000-0000-0000-000000000010',
        'The partner foundation continues to fund the appeal', 'partnership',
        'unverified', '22222222-2222-2222-2222-222222222222', 'internal');

-- The chain the requirement names: a ruling, then the work, then the rest.
insert into dependencies
  (id, blocker_legal_case_id, dependent_site_task_id, note_en, confidentiality)
values ('1e000000-0000-0000-0000-000000000020',
        'aaaa0000-0000-0000-0000-000000000002',
        '1c000000-0000-0000-0000-000000000030',
        'The raft cannot be signed off while the boundary is before the court.',
        'internal');

insert into dependencies
  (id, blocker_site_task_id, dependent_label, note_en, confidentiality)
values ('1e000000-0000-0000-0000-000000000021',
        '1c000000-0000-0000-0000-000000000030',
        'Accreditation inspection',
        'The inspectors will not come to a site without a completed raft.',
        'internal');

-- ---------------------------------------------------------------------------
-- Communication (M11)
-- ---------------------------------------------------------------------------

-- A thread on a channel the field team does NOT belong to by role, so the
-- channel rule can be tested apart from clearance: this one is internal, and
-- the field team's clearance is confidential. If they cannot see it, the
-- channel is the only reason.
insert into communication_threads (id, title, channel, kind, confidentiality) values
  ('1f000000-0000-0000-0000-000000000001', 'Appointment of new counsel', 'trustee',
   'discussion', 'internal');

-- A thread hanging on the restricted case. Its channel is general, which the
-- contractor belongs to, and its own classification is internal — so the only
-- thing that can keep the contractor out of it is the case behind it.
insert into communication_threads
  (id, title, channel, kind, confidentiality, legal_case_id)
values
  ('1f000000-0000-0000-0000-000000000002', 'Costs on the restricted file', 'general',
   'discussion', 'internal', 'aaaa0000-0000-0000-0000-000000000004');

-- One-way, urgent, and on a channel everybody is in.
insert into communication_threads
  (id, title, channel, kind, urgent, confidentiality, created_by)
values
  ('1f000000-0000-0000-0000-000000000003', 'The appeal is listed for 12 February', 'general',
   'announcement', true, 'internal', '22222222-2222-2222-2222-222222222222');

insert into thread_messages (id, thread_id, sender_id, body) values
  ('1f000000-0000-0000-0000-000000000011', '1f000000-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333', 'Four firms have been approached.');

-- The surveyor is added to the trustee channel by name. Membership widens the
-- default; it is the mechanism for "this one outside person needs to be in
-- this conversation" without making them a trustee.
insert into channel_members (channel, profile_id, added_by, note) values
  ('trustee', 'cccc1111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'Measuring the counsel fee proposals');

-- An official letter that was sent and never acknowledged, which is the
-- distinction M11-12 exists to keep.
insert into correspondence
  (id, reference_no, direction, route, subject_en, sent_on, counterparty_name,
   document_id, confidentiality)
values
  ('1f000000-0000-0000-0000-000000000030', 'OUT-2026-004', 'outgoing', 'letter',
   'Request for extension of the temporary occupation licence', current_date - 20,
   'County Government of Mombasa', '1b000000-0000-0000-0000-000000000001', 'internal');

-- ---------------------------------------------------------------------------
-- The watch book (0037)
-- ---------------------------------------------------------------------------
--
-- Three shifts, chosen so the register's own distinctions are testable: one
-- closed shift short of its rounds, one left open for three days with no
-- expected count recorded at all, and one open for two hours at a block.
-- recorded_at is not given anywhere below — the trigger stamps it, which is
-- the point, and the write-up lag against began_at falls out of that.

insert into watch_shifts
  (id, post, construction_block_id, on_watch, watch_firm, began_at, ended_at,
   rounds_expected, handover_note, recorded_by)
values
  ('b7000000-0000-0000-0000-000000000001', 'main_gate', null,
   'J. Mwakio', 'Pwani Security', now() - interval '30 hours',
   now() - interval '22 hours', 4, 'Quiet night; gate light out on the north side.',
   '44444444-4444-4444-4444-444444444444'),
  -- Never closed. Nothing in the schema will close it.
  ('b7000000-0000-0000-0000-000000000002', 'perimeter', null,
   'A. Kazungu', 'Pwani Security', now() - interval '3 days', null,
   null, null, '44444444-4444-4444-4444-444444444444'),
  ('b7000000-0000-0000-0000-000000000003', 'block',
   'bbbb0000-0000-0000-0000-000000000001',
   'S. Omondi', 'Pwani Security', now() - interval '2 hours', null,
   2, null, '44444444-4444-4444-4444-444444444444');

insert into watch_rounds (id, watch_shift_id, walked_at, route, note, recorded_by) values
  ('b7010000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001',
   now() - interval '29 hours', 'Gate → store → block A1', null,
   '44444444-4444-4444-4444-444444444444'),
  ('b7010000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-000000000001',
   now() - interval '24 hours', 'Gate → perimeter north', 'North fence light still out.',
   '44444444-4444-4444-4444-444444444444'),
  ('b7010000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000002',
   now() - interval '70 hours', 'Perimeter full', null,
   '44444444-4444-4444-4444-444444444444');

insert into gate_visits
  (id, watch_shift_id, construction_block_id, person_name, organisation, purpose,
   vehicle_plate, escorted_by, id_document_seen, entered_at, exited_at, recorded_by)
values
  ('b7100000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001',
   null, 'County inspector', 'County Government of Mombasa', 'Licence inspection',
   'KBX 221A', 'S. Omondi', true, now() - interval '29 hours',
   now() - interval '28 hours', '44444444-4444-4444-4444-444444444444'),
  -- Entered, never written out. The watch it belongs to has ended, so the
  -- register can say this is almost certainly an unrecorded exit — and still
  -- does not close it.
  ('b7100000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-000000000001',
   null, 'Delivery driver', 'Coast Hardware', 'Cement delivery',
   'KCD 884Q', null, false, now() - interval '27 hours', null,
   '44444444-4444-4444-4444-444444444444'),
  -- Open inside a watch that is still open: nothing is wrong with this one.
  ('b7100000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000003',
   'bbbb0000-0000-0000-0000-000000000001', 'Surveyor', 'Measure Ltd',
   'Measuring block A1', null, 'S. Omondi', true, now() - interval '1 hour',
   null, '44444444-4444-4444-4444-444444444444');

insert into site_incidents
  (id, watch_shift_id, construction_block_id, kind, occurred_at,
   description_en, intervention_en, injured_count, severity, police_ob_number,
   authority_notice, notified_at, notification_document_id,
   confirmed_at, confirmed_by, recorded_by)
values
  -- Notified, with the letter behind it, confirmed, and evidence filed.
  ('b7200000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001',
   'bbbb0000-0000-0000-0000-000000000001', 'intrusion', now() - interval '28 hours',
   'Two men came over the north fence and left when the watch approached.',
   'Watch called the Nyali station; patrol attended and took a statement.',
   0, 3, 'OB 41/2026', 'notified', now() - interval '27 hours',
   '1b000000-0000-0000-0000-000000000001',
   now() - interval '20 hours', '22222222-2222-2222-2222-222222222222',
   '44444444-4444-4444-4444-444444444444'),
  -- An accident with somebody hurt, nobody's response written down, no
  -- evidence, and no decision recorded about telling an authority. Three
  -- separate unfinished jobs, and the register counts all three.
  ('b7200000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-000000000002',
   'bbbb0000-0000-0000-0000-000000000001', 'accident', now() - interval '70 hours',
   'A labourer fell from the second-floor slab edge of block A1.',
   null, 1, 4, null, 'unknown', null, null, null, null,
   '44444444-4444-4444-4444-444444444444'),
  -- A near miss, which is the word for it only because nobody was hurt.
  ('b7200000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000003',
   'bbbb0000-0000-0000-0000-000000000001', 'near_miss', now() - interval '2 hours',
   'Scaffold board slipped; nobody was underneath.',
   'Board refixed and the bay closed for the shift.',
   0, 2, null, 'not_required', null, null, null, null,
   '44444444-4444-4444-4444-444444444444');

insert into incident_evidence (site_incident_id, document_id, note, added_by) values
  ('b7200000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001',
   'Police abstract', '44444444-4444-4444-4444-444444444444');
