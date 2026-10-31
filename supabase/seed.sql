-- Phase 1 seed: one authorised org, one user per role, one demo case with assignments.
-- Fixed UUIDs so tests and /dev/act-as can refer to them. All names are fictional.

insert into organisations (id, name, reg_no, country, plan, plan_tier, onboarding_status, sanctions_status, data_ceiling)
values ('00000000-0000-0000-0000-000000000001', 'Skyline Drones Ltd', '12345678', 'GB', 'S', 'tier-1',
        'authorised', 'clear', 'official_sensitive');

-- Client users are seeded at baseline so they pass the vetting check on official_sensitive files.
insert into users (id, org_id, name, email, role, identity_verified, vetting_level, location) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Claire Admin',    'admin@skyline.test',    'client_admin',    true, 'baseline', 'GB'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Mark Member',     'member@skyline.test',   'client_member',   true, 'baseline', 'GB'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Amy Approver',    'approver@skyline.test', 'client_approver', true, 'baseline', 'GB'),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Victor Viewer',   'viewer@skyline.test',   'client_viewer',   true, 'baseline', 'GB'),
  ('00000000-0000-0000-0000-000000000105', null, 'Bohdan Buyer',      'buyer@kalyna.test',      'buyer',      true, 'none',     'UA'),
  ('00000000-0000-0000-0000-000000000201', null, 'Ana Analyst',       'analyst@passage.test',   'analyst',    true, 'baseline', 'GB'),
  ('00000000-0000-0000-0000-000000000202', null, 'Owen Officer',      'officer@passage.test',   'officer',    true, 'sc',       'GB'),
  ('00000000-0000-0000-0000-000000000203', null, 'Sara Specialist',   'specialist@passage.test','specialist', true, 'sc',       'GB'),
  ('00000000-0000-0000-0000-000000000204', null, 'Petro Partner',     'partner@kyivlaw.test',   'partner',    true, 'baseline', 'UA'),
  ('00000000-0000-0000-0000-000000000205', null, 'Olive Ops',         'ops@passage.test',       'ops_admin',  true, 'baseline', 'GB'),
  -- Second analyst, never assigned: exercises Review Focus 2 (direct URL to someone else's case -> 404).
  ('00000000-0000-0000-0000-000000000206', null, 'Uma Unassigned',    'analyst2@passage.test',  'analyst',    true, 'baseline', 'GB');

-- Demo case (spec §11.1): 200 flight controllers with thermal cameras to a Ukrainian buyer.
-- The consignee name near-matches a fictional entry in src/providers/screening/fixture-list.json
-- (pinned by tests/domain/screening.test.ts) so the possible-match path can be exercised.
insert into parties (id, name, type, country) values
  ('00000000-0000-0000-0000-000000000301', 'Kalyna Agro Systems TOV',      'buyer',     'UA'),
  ('00000000-0000-0000-0000-000000000302', 'Polissia Field Survey TOV',    'end_user',  'UA'),
  ('00000000-0000-0000-0000-000000000303', 'Nordline Freight Services TOV','consignee', 'UA');

insert into cases (id, org_id, party_ids, destination, end_use, deadline, sensitivity, state)
values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001',
        array['00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000303']::uuid[],
        'UA', '200 flight controllers with thermal cameras for agricultural field survey.', '2026-12-15',
        'official_sensitive', 'Draft');

insert into assignments (case_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000201', 'analyst'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000202', 'officer'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000203', 'specialist');

-- Developer account (signs in with Google through Clerk; linked by verified email on first sign-in).
insert into users (id, org_id, name, email, role, identity_verified, vetting_level, location) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000001', 'Ibad Zuberi (dev)', 'ibadullahzuberi@gmail.com', 'client_admin', true, 'sc', 'GB')
on conflict (email) do nothing;
