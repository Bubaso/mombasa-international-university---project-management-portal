-- The tables the application already reads, declared for the first time.
--
-- The client has been querying these all along, but no migration ever defined
-- them, so the schema lived only in whatever a developer had clicked together.
-- Each one now carries the classification and attribution columns that access
-- control and the audit trail depend on.
--
-- Requirement M1-04: confidentiality is mandatory and defaults to 'internal',
-- so a new record is never accidentally public.

-- ---------------------------------------------------------------------------
-- Columns every domain table carries
-- ---------------------------------------------------------------------------

create or replace function app.add_common_columns(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format($f$
    alter table %s
      add column if not exists confidentiality confidentiality not null default 'internal',
      add column if not exists created_by uuid references auth.users (id),
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_by uuid references auth.users (id),
      add column if not exists updated_at timestamptz not null default now();
  $f$, p_table);

  execute format(
    'create trigger %I before insert or update on %s for each row execute function app.touch_row()',
    'touch_' || p_table::text, p_table);

  execute format(
    'create trigger %I after insert or update or delete on %s for each row execute function app.record_audit()',
    'audit_' || p_table::text, p_table);
end;
$$;

-- ---------------------------------------------------------------------------
-- Legal
-- ---------------------------------------------------------------------------

create table legal_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null,
  title text not null,
  court text not null,
  case_type text,
  current_status text,
  priority text check (priority in ('medium', 'high', 'urgent')),
  filing_date date,
  next_hearing_date date,
  description_en text,
  description_tr text,
  key_parties jsonb not null default '{}'::jsonb,
  key_issues text[] not null default '{}',
  orders jsonb not null default '[]'::jsonb,
  documents_count int not null default 0
);
select app.add_common_columns('legal_cases');

-- ---------------------------------------------------------------------------
-- Construction
-- ---------------------------------------------------------------------------

create table construction_blocks (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  floors int,
  total_area_sqm numeric,
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  status text,
  budget_kshs numeric,
  spent_kshs numeric,
  lead_engineer text,
  contractor text,
  urgent_preservation_needed boolean not null default false,
  preservation_action_en text,
  preservation_action_tr text,
  last_inspection_date date,
  items jsonb not null default '[]'::jsonb
);
select app.add_common_columns('construction_blocks');

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

-- No file storage yet, so this is a register of document metadata. The
-- sha256_hash column stays nullable: it must only ever be written by the
-- server after hashing real bytes, never supplied by a client.
create table document_vault (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  version text not null default 'v1.0',
  file_format text,
  file_size text,
  uploaded_by text,
  uploaded_date date,
  sha256_hash text,
  description_en text,
  description_tr text,
  status text check (status in ('approved', 'under_review', 'archived')),
  versions_count int not null default 1,
  download_url text
);
select app.add_common_columns('document_vault');

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------

create table financial_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null,
  date date not null,
  category text not null,
  description text,
  amount_kshs numeric not null,
  payee text,
  verified_by_audit boolean not null default false,
  -- Deliberately not a 'synced' flag: no accounting integration exists, and
  -- the previous UI reported a live sync that was a timer.
  external_reference text
);
select app.add_common_columns('financial_transactions');

-- ---------------------------------------------------------------------------
-- Governance
-- ---------------------------------------------------------------------------

create table trustee_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  national_id text,
  appointed_by text not null,
  origin text,
  role_in_trust text,
  active_status boolean not null default true
);
select app.add_common_columns('trustee_members');

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------

create table communication_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  channel text not null,
  urgent boolean not null default false,
  pinned boolean not null default false
);
select app.add_common_columns('communication_threads');

-- Messages are rows, not a JSON array on the thread. The previous approach
-- read the array, appended and wrote it back, which loses a message whenever
-- two people reply at once — and left every message attributed to the literal
-- string 'Current User'.
create table thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references communication_threads (id) on delete cascade,
  sender_id uuid not null references profiles (id),
  body text not null,
  attachment_url text
);
select app.add_common_columns('thread_messages');

create index thread_messages_thread_idx on thread_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Deadlines
-- ---------------------------------------------------------------------------

create table deadline_notifications (
  id uuid primary key default gen_random_uuid(),
  title_en text not null,
  title_tr text not null,
  due_date date not null,
  urgency text not null check (urgency in ('info', 'warning', 'critical')),
  category text not null,
  action_required_en text,
  action_required_tr text,
  target_roles app_role[] not null default '{}'
);
select app.add_common_columns('deadline_notifications');

-- Dismissing a deadline used to DELETE the row, hiding a court date from
-- everyone. An acknowledgement is per person and removes nothing.
create table deadline_acknowledgements (
  deadline_id uuid not null references deadline_notifications (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (deadline_id, user_id)
);

-- Migration-time helper only. Dropped so it cannot be reached at runtime:
-- it runs DDL, and every function left in the app schema is callable by
-- signed-in users so the policies can use them.
drop function app.add_common_columns(regclass);
