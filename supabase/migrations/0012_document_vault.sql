-- A document vault that actually holds documents (M9).
--
-- The module this replaces was the most dangerous thing in the application.
-- It said "encrypted", "SHA-256 verified" and "securely stored" on a screen
-- where file upload did not exist. Faz 0 took the words off. This puts the
-- thing behind them in.
--
-- What makes it worth building properly: which version of a document is the
-- operative one, and who saw it when, have legal consequences here. These are
-- court filings, certified copies, the trust deed, the lease, architectural
-- drawings and donation receipts.
--
-- Three properties the design turns on, each enforced by the database rather
-- than promised by the interface:
--
--   1. The digest is computed by the server from the bytes that were stored,
--      and no client can write that column — not by policy, by privilege.
--   2. A version is never deleted and never edited. A newer one supersedes it.
--   3. Reading a file goes through a function that records who read it, so
--      the access log is not something the client can decline to write.
--
-- Requirements: M9-01 … M9-09. (M9-03: nothing here claims encryption. At-rest
-- encryption is a property of the storage provider, not of this application,
-- and this application is not in a position to attest to it.)

create or replace function app.add_common_columns(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format($f$
    alter table %s
      add column if not exists confidentiality confidentiality not null default 'internal',
      add column if not exists created_by uuid references profiles (id),
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_by uuid references profiles (id),
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
-- Vocabulary (M9-05)
-- ---------------------------------------------------------------------------

create type document_category as enum (
  'trust_deed',
  'court_order',
  'pleading',
  'evidence',
  'contract_mou',
  'architectural',
  'boq_financial',
  'accreditation',
  'correspondence',
  'photograph',
  'other'
);

create type document_action as enum ('viewed', 'downloaded');

-- ---------------------------------------------------------------------------
-- The record: what a document is, rather than what a file is
-- ---------------------------------------------------------------------------
--
-- Everything that describes a file — its name, size, format, digest, who
-- uploaded it and when — moves to the version, because those are facts about
-- one upload and not about the document. What stays here is what is true of
-- the document across every version of it.

alter table document_vault
  drop column file_format,
  drop column file_size,
  drop column uploaded_by,
  drop column uploaded_date,
  -- Taken from whoever typed it. The replacement is computed and unwritable.
  drop column sha256_hash,
  drop column versions_count,
  -- Pointed nowhere; there was no file to point at.
  drop column download_url,
  drop column version;

alter table document_vault
  alter column category drop default,
  alter column category type document_category using (
    case category
      when 'trust_deed' then 'trust_deed'
      when 'court_order' then 'court_order'
      when 'legal_pleadings' then 'pleading'
      when 'architectural' then 'architectural'
      when 'boq_finance' then 'boq_financial'
      when 'accreditation_cue' then 'accreditation'
      when 'site_survey' then 'architectural'
      else 'other'
    end::document_category
  ),
  alter column category set default 'other';

-- ---------------------------------------------------------------------------
-- Versions (M9-01, M9-02, M9-04)
-- ---------------------------------------------------------------------------

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document_vault (id) on delete cascade,
  version_no int not null,

  -- Where the bytes are, inside the documents bucket. The client picks the id
  -- first and builds the path from it, so the row exists before the upload
  -- does and the storage policy has something to authorise against.
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  byte_size bigint,

  -- M9-02. Computed by the server from what was stored, never accepted from a
  -- caller: the grants below give `authenticated` no way to write either of
  -- these columns. Null means not yet computed, and the interface says so
  -- rather than showing a document as verified.
  sha256 text,
  digest_computed_at timestamptz,

  uploaded_by uuid references profiles (id),
  uploaded_at timestamptz not null default now(),
  note text,

  unique (document_id, version_no),
  constraint document_versions_digest_is_dated check (
    (sha256 is null) = (digest_computed_at is null)
  ),
  constraint document_versions_file_name_not_blank check (btrim(file_name) <> '')
);

create index document_versions_document_idx on document_versions (document_id, version_no desc);

-- The version in force. Maintained by a trigger, so "current" is never a
-- thing somebody forgot to update.
alter table document_vault
  add column current_version_id uuid references document_versions (id) on delete set null;

create or replace function app.assign_version_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select coalesce(max(v.version_no), 0) + 1 into new.version_no
  from document_versions v where v.document_id = new.document_id;
  new.uploaded_by := coalesce(new.uploaded_by, auth.uid());
  return new;
end;
$$;

create trigger document_versions_number
  before insert on document_versions
  for each row execute function app.assign_version_number();

create or replace function app.point_at_latest_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update document_vault
  set current_version_id = new.id
  where id = new.document_id;
  return new;
end;
$$;

create trigger document_versions_become_current
  after insert on document_versions
  for each row execute function app.point_at_latest_version();

-- M9-04: an older version is superseded, never removed. Nothing about a
-- version changes after it is written either — a new upload is how a document
-- changes.
create or replace function app.refuse_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'a document version is written once (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger document_versions_no_update
  before update on document_versions
  for each row
  -- The server writing the digest it just computed is the one exception, and
  -- it is the only party with the privilege to attempt it.
  when (old.sha256 is not null or new.sha256 is null)
  execute function app.refuse_version_mutation();

create trigger document_versions_no_delete
  before delete on document_versions
  for each row execute function app.refuse_version_mutation();

create trigger document_versions_audit
  after insert or update on document_versions
  for each row execute function app.record_audit();

-- ---------------------------------------------------------------------------
-- Who saw what (M9-07)
-- ---------------------------------------------------------------------------
--
-- Written only by the function that hands out a download link. No client can
-- insert here, which is what makes the log mandatory rather than polite: the
-- only way to get at the bytes is through the thing that records the reading.

create table document_access (
  id bigserial primary key,
  document_id uuid not null references document_vault (id) on delete cascade,
  version_id uuid references document_versions (id) on delete set null,
  profile_id uuid not null references profiles (id),
  action document_action not null,
  at timestamptz not null default now()
);

create index document_access_document_idx on document_access (document_id, at desc);
create index document_access_profile_idx on document_access (profile_id, at desc);

create trigger document_access_no_update
  before update or delete on document_access
  for each row execute function app.refuse_version_mutation();

-- ---------------------------------------------------------------------------
-- What a document is attached to (M9-08)
-- ---------------------------------------------------------------------------
--
-- Several tables already point at a document — a filing, an order, an
-- exhibit, an obligation and its evidence. This is the other direction: from
-- a document, what does it belong to. Kept generic because the answer is
-- often more than one thing, and often something the document was not
-- uploaded for.

create table document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document_vault (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  note text,

  unique (document_id, entity_type, entity_id)
);

select app.add_common_columns('document_links');
create index document_links_entity_idx on document_links (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- A version is visible exactly when its document is. There is nothing about a
-- version that is more or less sensitive than the document it belongs to.
create or replace function app.can_see_document(p_document uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from document_vault d
    where d.id = p_document and app.can_read(d.confidentiality, 'document_vault', d.id)
  );
$$;

alter table document_versions enable row level security;
alter table document_versions force row level security;

create policy document_versions_read on document_versions
  for select using (app.can_see_document(document_id));

create policy document_versions_insert on document_versions
  for insert with check (
    app.can_see_document(document_id) and app.can_write('document_vault', document_id)
  );

alter table document_access enable row level security;
alter table document_access force row level security;

-- Read by the people who answer for the project, and by anyone reading their
-- own trail: what a person has looked at is also a fact about that person.
create policy document_access_read on document_access
  for select using (
    profile_id = auth.uid()
    or app.acts_as('admin', 'project_director', 'trustee', 'audit_committee')
  );

alter table document_links enable row level security;
alter table document_links force row level security;

create policy document_links_read on document_links
  for select using (app.can_see_document(document_id));

create policy document_links_insert on document_links
  for insert with check (
    app.can_see_document(document_id) and app.can_write('document_vault', document_id)
  );

create policy document_links_delete on document_links
  for delete using (
    app.can_see_document(document_id) and app.can_write('document_vault', document_id)
  );

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- A private bucket. Clients may put bytes in, at a path that a version row has
-- already claimed, and may not take bytes out — reading goes through the
-- function that writes the access log, which is the only way M9-07 can be
-- mandatory rather than a convention.

-- Both statements below are wrapped, and neither is allowed to fail the
-- migration. The `storage` schema is not this schema: its tables are owned by
-- Supabase's own storage role, and whether the role running a migration may
-- write to them differs between a project, a local stack and the test
-- harness — which fakes `storage.objects` entirely, and so can prove that
-- these statements compile but not that they are permitted.
--
-- A bucket is infrastructure configuration rather than schema, and taking
-- thirteen migrations down over it would be the wrong trade. The failure
-- direction is safe: with no bucket and no insert policy, uploads are refused
-- and nothing is exposed. The warning says what to do by hand.

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do nothing;
exception
  when others then
    raise warning
      'Could not create the private documents bucket (%). Create it by hand: '
      'Storage > New bucket > name "documents", Public unchecked.', sqlerrm;
end;
$$;

-- Executed dynamically because plpgsql cannot take a utility statement
-- directly, and it has to be inside a block to be catchable at all.
do $$
begin
  execute $policy$
    create policy "upload only to a path a version already claims"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'documents'
      and exists (
        select 1 from document_versions v
        where v.storage_path = storage.objects.name
          and app.can_see_document(v.document_id)
          and app.can_write('document_vault', v.document_id)
      )
    )
  $policy$;
exception
  when duplicate_object then
    null;
  when others then
    raise warning
      'Could not create the storage upload policy (%). Add it by hand from '
      'supabase/migrations/0012_document_vault.sql, as a role that owns '
      'storage.objects. Until then uploads are refused, which is the safe '
      'direction to be wrong in.', sqlerrm;
end;
$$;

-- Deliberately no select, update or delete policy for authenticated on this
-- bucket. Without a select policy the bytes are unreachable from a browser,
-- which is the point: every read is a call to document-download, and every
-- call to it leaves a row in document_access.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- Column-level, for the one thing that matters most here. `authenticated` can
-- insert the facts about an upload and cannot write the digest or the time it
-- was computed, because those are not facts a client is in a position to
-- state. This is a privilege, not a policy: there is no expression to get
-- wrong and no trigger to reason around.

revoke all on document_versions from authenticated;
grant select on document_versions to authenticated;
grant insert (id, document_id, storage_path, file_name, content_type, byte_size, note)
  on document_versions to authenticated;

-- Written by the download function alone.
revoke all on document_access from authenticated;
grant select on document_access to authenticated;

grant select, insert, delete on document_links to authenticated;
grant execute on all functions in schema app to authenticated;

drop function app.add_common_columns(regclass);
