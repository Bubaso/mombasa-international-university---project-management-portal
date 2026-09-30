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
  ('99999999-9999-9999-9999-999999999999', 'expired@example.test',    now());

insert into profiles (id, full_name, email, role, organization, clearance, is_active, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'Admin',            'admin@example.test',      'admin',            'AUTK',        'restricted',   true, null),
  ('22222222-2222-2222-2222-222222222222', 'Project Director', 'director@example.test',   'project_director', 'AUTK',        'restricted',   true, null),
  ('33333333-3333-3333-3333-333333333333', 'Trustee',          'trustee@example.test',    'trustee',          'AUTK',        'restricted',   true, null),
  ('44444444-4444-4444-4444-444444444444', 'Field Team',       'field@example.test',      'field_team',       'AUTK',        'confidential', true, null),
  ('55555555-5555-5555-5555-555555555555', 'Advocate One',     'advocate@example.test',   'legal_counsel',    'Firm A',      'internal',     true, null),
  ('66666666-6666-6666-6666-666666666666', 'Advocate Two',     'advocate2@example.test',  'legal_counsel',    'Firm B',      'internal',     true, null),
  ('77777777-7777-7777-7777-777777777777', 'Contractor',       'contractor@example.test', 'contractor',       'Coast Eng',   'internal',     true, null),
  ('88888888-8888-8888-8888-888888888888', 'Donor',            'donor@example.test',      'donor',            'Foundation',  'public',       true, null),
  ('99999999-9999-9999-9999-999999999999', 'Expired Consult',  'expired@example.test',    'consultant',       'Advisory',    'internal',     true, now() - interval '1 day');

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
