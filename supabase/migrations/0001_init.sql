-- Passage schema, spec §8. Enums mirror src/domain/types.ts.
-- Auth is Clerk: the server talks to Postgres with the service role. RLS is enabled on every
-- table with no policies, so the public anon key and the authenticated role can read nothing.

create extension if not exists pgcrypto;

create type case_state as enum (
  'Draft', 'IntakeIncomplete', 'SanctionsCheck', 'SanctionsReview', 'AwaitingClient', 'Classifying',
  'AwaitingClient2', 'EmergingQuote', 'EmergingReview', 'OfficerReview', 'RouteQuote', 'RouteInProgress',
  'AwaitingClient3', 'Filed', 'Granted', 'Refused', 'Active', 'Monitoring', 'ClosedNotControlled',
  'ClosedDoNotProceed', 'Closed'
);
create type user_role as enum (
  'client_admin', 'client_member', 'client_approver', 'client_viewer', 'buyer',
  'analyst', 'officer', 'specialist', 'partner', 'ops_admin'
);
create type vetting_level as enum ('none', 'baseline', 'sc', 'dv');
-- 'secret' is deliberately absent: SECRET material is out of scope (§7.1, §9.9).
create type sensitivity as enum ('unclassified', 'official_sensitive', 'controlled_technology');
create type data_ceiling as enum ('unclassified', 'official_sensitive');
create type screening_verdict as enum ('clear', 'possible', 'red_flag', 'match');
create type route as enum ('A', 'B', 'C', 'D');
create type quote_item as enum ('emerging', 'general_setup', 'individual', 'consultation', 'sanctions_licence', 'general_shipment');
create type quote_status as enum ('shown', 'approved', 'declined');
create type plan as enum ('P', 'S');
create type onboarding_status as enum ('pending', 'agreements_signed', 'checks_passed', 'authorised', 'suspended');
create type org_sanctions_status as enum ('clear', 'under_review', 'blocked');
create type case_sanctions_status as enum ('pending', 'clear', 'under_review', 'blocked');
create type party_type as enum ('buyer', 'end_user', 'consignee', 'intermediary', 'forwarder', 'agent', 'bank');
create type file_type as enum ('spec', 'bom', 'order', 'euc', 'licence', 'other');
create type agreement_type as enum ('nda', 'terms', 'dpa');
create type licence_type as enum ('general', 'individual', 'open_individual');

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reg_no text not null,
  country text not null,
  plan plan not null,
  plan_tier text,
  onboarding_status onboarding_status not null default 'pending',
  sanctions_status org_sanctions_status not null default 'under_review',
  data_ceiling data_ceiling not null default 'unclassified',
  clerk_org_id text unique
);

create table users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id), -- null for internal and partner staff
  name text not null,
  email text not null unique,
  role user_role not null,
  identity_verified boolean not null default false,
  vetting_level vetting_level not null default 'none',
  location text not null default 'GB',
  clerk_user_id text unique
);

create table agreements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  type agreement_type not null,
  signed_by uuid references users(id),
  signed_at timestamptz,
  file_id uuid
);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  name text not null,
  version text not null default '',
  description text not null default '',
  parameters jsonb not null default '{}',
  classification_id uuid
);

create table parties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type party_type not null,
  country text not null,
  identifiers jsonb not null default '{}',
  owners jsonb not null default '[]'
);

create table cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  product_ids uuid[] not null default '{}',
  party_ids uuid[] not null default '{}',
  destination text,
  end_use text check (end_use is null or length(end_use) <= 600),
  deadline date,
  sensitivity sensitivity not null default 'unclassified',
  sanctions_status case_sanctions_status not null default 'pending',
  state case_state not null default 'Draft',
  route route,
  emerging_flag boolean not null default false,
  pending_client_kind text check (pending_client_kind in ('ANSWER', 'SIGN')),
  ai_status text, -- 'failed' = manual classification needed (plan Task 7)
  created_at timestamptz not null default now()
);

create table screening_results (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references parties(id), -- null when the destination itself is screened
  case_id uuid not null references cases(id),
  lists_checked text[] not null,
  list_versions jsonb not null,
  result screening_verdict not null,
  reviewed_by uuid references users(id),
  decision text check (decision in ('cleared', 'confirmed')),
  reason text,
  screened_at timestamptz not null default now(),
  check (decision is null or (reviewed_by is not null and reason is not null))
);

create table case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  type file_type not null,
  name text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  sensitivity sensitivity not null,
  storage_region text not null default 'eu-west-2',
  storage_path text not null,
  hash text not null,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now(),
  unique (case_id, hash)
);

create table classifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  list_entries text[] not null default '{}',
  reasoning text not null default '',
  rulebook_refs text[] not null default '{}',
  confidence numeric check (confidence between 0 and 1),
  signed_by uuid references users(id),
  signed_at timestamptz
);

create table rulebook_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  list_entries text[] not null default '{}',
  decision_logic text not null,
  examples jsonb not null default '[]',
  author uuid not null references users(id),
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  item quote_item not null,
  amount integer not null check (amount >= 0), -- GBP pence
  status quote_status not null default 'shown',
  approved_by uuid references users(id),
  approved_at timestamptz
);

create table licences (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  type licence_type not null,
  reference text,
  conditions jsonb not null default '[]',
  quantity_limits jsonb not null default '{}',
  expiry date
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  licence_id uuid not null references licences(id),
  party_ids uuid[] not null default '{}',
  items jsonb not null default '[]',
  value integer, -- GBP pence
  screening_result_ids uuid[] not null default '{}',
  check_result jsonb,
  recorded_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  from_user uuid not null references users(id),
  to_role user_role not null,
  text text not null,
  answer text,
  status text not null default 'open' check (status in ('open', 'answered'))
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  user_id uuid not null references users(id),
  role user_role not null,
  unique (case_id, user_id)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  object text not null,
  object_id text not null,
  timestamp timestamptz not null default now(),
  ip text,
  location text
);

create index on cases (org_id);
create index on assignments (user_id);
create index on screening_results (case_id);
create index on audit_events (object, object_id);

-- Append-only audit log (§7.1 principle 5, §9.6).
revoke update, delete, truncate on audit_events from anon, authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'organisations', 'users', 'agreements', 'products', 'parties', 'cases', 'screening_results',
    'case_files', 'classifications', 'rulebook_entries', 'quotes', 'licences', 'shipments',
    'questions', 'assignments', 'audit_events'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Private storage bucket for case files, UK region project (§9.1).
insert into storage.buckets (id, name, public) values ('case-files', 'case-files', false)
on conflict (id) do nothing;
