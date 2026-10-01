-- Comments inside a document, and comparing two drawings (M9-14, M7-17).
--
-- Both of these requirements ask for something the portal cannot honestly
-- give, and the interesting part of the work is what goes in instead.
--
-- M9-14 asks for in-document comment and highlighting. The portal does not
-- read PDF content: `document_versions` holds where the bytes are and the
-- digest the server computed over them, and nothing else. A highlight over a
-- text range would therefore be a rectangle at coordinates some browser's
-- viewer happened to produce, and it would land somewhere else in the next
-- viewer, at the next zoom, or on the next version of the file. So there is
-- no coordinate column in this migration at all, and the absence is the
-- design: a geometric highlight needs the portal to render the document
-- itself at a fixed scale, which is a dependency decision nobody has taken.
--
-- What a comment can honestly be anchored to is a **version** and a **page**,
-- plus the passage the commenter transcribed themselves. Three consequences,
-- and they are the whole value of the feature:
--
--   * The excerpt is the commenter's transcription, not the document's text.
--     The portal cannot check that those words are on that page, and the
--     screen says so — the same distinction 0041 keeps between the deed's
--     words and somebody's reading of them.
--
--   * The anchor is to one version. When a newer version is uploaded, the
--     comment is reported as written against a superseded file: page 12 of
--     revision B is not page 12 of revision C, and only the person who
--     re-reads it can say whether the comment still lands.
--
--   * Where the server has never computed a digest for that version, the
--     comment says the portal has not read the file it is about.
--
-- M7-17 asks for a drawing viewer with version comparison. The portal cannot
-- diff drawing geometry either, so there is no "changed areas" overlay. What
-- it can compare is what it recorded: who uploaded each version and when, the
-- revision label whoever issued it typed, the change summary they wrote, the
-- byte sizes, and the two digests. Which yields two findings that are facts
-- rather than impressions:
--
--   * two versions with the same digest are byte-identical, which is almost
--     always somebody uploading the same file twice and believing they have
--     issued a revision;
--
--   * and where either digest is missing, the comparison says it cannot tell
--     whether the files differ. Not "different" — unread.
--
-- Requirements: M9-14, M7-17.

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
-- The revision, as whoever issued it described it (M7-17)
-- ---------------------------------------------------------------------------

alter table document_versions
  -- "Rev B", "C2". The issuer's own label, kept verbatim; null where the
  -- upload is not a numbered revision of anything.
  add column revision_label text,
  -- What changed, according to the person who issued it. This is the only
  -- description of a change this portal can hold, because it cannot read the
  -- drawing. Null reads as "neyin değiştiği kayıtlı değil".
  add column change_summary_en text,
  add column change_summary_tr text;

comment on column document_versions.change_summary_en is
  'What changed in this revision, according to whoever issued it (M7-17). '
  'The portal cannot diff a drawing, so this is the only account of a change '
  'it holds, and null means nobody wrote one rather than nothing changed.';

-- ---------------------------------------------------------------------------
-- The comment (M9-14)
-- ---------------------------------------------------------------------------

create table document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document_vault (id) on delete cascade,
  -- Not null. A comment on "the document" with no version behind it cannot be
  -- told apart later from a comment on a file that has since been replaced,
  -- and that is exactly the thing a reader needs to know.
  document_version_id uuid not null references document_versions (id) on delete cascade,

  -- Null is honest: a comment about the document as a whole is a real thing.
  page_no int check (page_no is null or page_no >= 1),

  -- The passage, as the commenter transcribed it. The portal cannot check
  -- that these words are on that page, and every screen that renders this
  -- says so.
  quoted_excerpt text,

  body_en text,
  body_tr text,

  resolved_at timestamptz,
  resolved_by uuid references profiles (id),
  resolution_note text,

  constraint document_comments_has_a_body check (
    btrim(coalesce(body_en, '')) <> '' or btrim(coalesce(body_tr, '')) <> ''
  ),
  constraint document_comments_resolution_is_whole check (
    (resolved_at is null) = (resolved_by is null)
  ),
  -- A comment closed with no account of why is a comment that was dismissed.
  constraint document_comments_resolution_is_reasoned check (
    resolved_at is null or btrim(coalesce(resolution_note, '')) <> ''
  )
);
select app.add_common_columns('document_comments');

create index document_comments_document_idx on document_comments (document_id, created_at desc);
create index document_comments_version_idx on document_comments (document_version_id);

comment on table document_comments is
  'A comment anchored to a document version and a page (M9-14). There is no '
  'coordinate column: the portal does not read document content, so a '
  'geometric highlight would be a rectangle at a position that moves with '
  'the viewer. quoted_excerpt is the commenter''s transcription, not the '
  'document''s text.';

-- The version a comment is anchored to has to belong to the document it is
-- against. Two registers disagreeing about which file is being discussed is
-- the kind of thing nobody notices until a comment is read out.
create or replace function app.comment_matches_its_document()
returns trigger
language plpgsql
as $$
declare
  v_document uuid;
begin
  select document_id into v_document
  from document_versions where id = new.document_version_id;

  if v_document is distinct from new.document_id then
    raise exception 'that version belongs to another document'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger document_comments_version_belongs
  before insert or update on document_comments
  for each row execute function app.comment_matches_its_document();

-- ---------------------------------------------------------------------------
-- What a comment is worth reading against
-- ---------------------------------------------------------------------------

create view document_comment_register with (security_invoker = true) as
select
  c.id as comment_id,
  c.document_id,
  c.document_version_id,
  v.version_no,
  v.file_name,
  v.revision_label,
  c.page_no,
  c.quoted_excerpt,
  c.body_en,
  c.body_tr,
  c.resolved_at,
  c.resolution_note,
  c.created_by,
  c.created_at,
  -- The anchor's standing. A newer version exists, so page 12 of the file
  -- this was written against may not be page 12 of the one in force.
  (
    v.version_no < (
      select max(v2.version_no) from document_versions v2
      where v2.document_id = c.document_id
    )
  ) as written_against_a_superseded_version,
  (
    select max(v2.version_no) from document_versions v2
    where v2.document_id = c.document_id
  ) as current_version_no,
  -- The server never read this file, so the portal cannot say the comment is
  -- about the bytes anybody else will download.
  (v.sha256 is null) as portal_has_not_read_the_file,
  greatest(c.confidentiality, d.confidentiality) as confidentiality
from document_comments c
join document_versions v on v.id = c.document_version_id
join document_vault d on d.id = c.document_id;

comment on view document_comment_register is
  'Comments with the standing of their anchor (M9-14): whether the version '
  'they were written against has been superseded, and whether the server has '
  'ever read the file they are about.';

-- ---------------------------------------------------------------------------
-- Comparing two versions (M7-17)
-- ---------------------------------------------------------------------------

-- Every adjacent pair of versions of a document, and what the portal
-- recorded about the step between them. No geometry: the columns are the
-- facts, and the one judgement — "these are byte-identical" — follows from
-- two digests the server computed itself.
create view document_version_steps with (security_invoker = true) as
select
  d.id as document_id,
  earlier.id as earlier_version_id,
  earlier.version_no as earlier_version_no,
  earlier.revision_label as earlier_revision_label,
  earlier.file_name as earlier_file_name,
  earlier.byte_size as earlier_byte_size,
  earlier.sha256 as earlier_sha256,
  earlier.uploaded_at as earlier_uploaded_at,
  later.id as later_version_id,
  later.version_no as later_version_no,
  later.revision_label as later_revision_label,
  later.file_name as later_file_name,
  later.byte_size as later_byte_size,
  later.sha256 as later_sha256,
  later.uploaded_at as later_uploaded_at,
  later.change_summary_en,
  later.change_summary_tr,
  -- Three answers, because "different" is a claim the portal can only make
  -- about files it has read.
  case
    when earlier.sha256 is null or later.sha256 is null then 'unread'
    when earlier.sha256 = later.sha256 then 'byte_identical'
    else 'different_bytes'
  end as bytes_verdict,
  -- The portal cannot say what changed. It can say whether anybody wrote it
  -- down, which is a different and answerable question.
  (
    btrim(coalesce(later.change_summary_en, '')) = ''
    and btrim(coalesce(later.change_summary_tr, '')) = ''
  ) as change_not_described,
  d.confidentiality
from document_vault d
join document_versions later on later.document_id = d.id
join document_versions earlier
  on earlier.document_id = d.id
 and earlier.version_no = (
   select max(v.version_no) from document_versions v
   where v.document_id = d.id and v.version_no < later.version_no
 );

comment on view document_version_steps is
  'Each step from one version of a document to the next, as recorded (M7-17). '
  'bytes_verdict is unread / byte_identical / different_bytes, because the '
  'portal can only call two files different once it has read both; and '
  'change_not_described says nobody wrote down what changed, which is not '
  'the same as nothing changing.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

alter table document_comments enable row level security;
alter table document_comments force row level security;

-- Reading a comment follows reading the document. Writing one follows being
-- able to read it too: a comment is a remark about material, and somebody
-- who cannot see the material has nothing to remark on.
create policy document_comments_read on document_comments
  for select using (
    app.can_read(confidentiality)
    and app.can_see_document(document_id)
  );
create policy document_comments_insert on document_comments
  for insert with check (
    app.can_read(confidentiality)
    and created_by = auth.uid()
    and app.can_see_document(document_id)
  );
-- Editing your own remark is ordinary; resolving one is the same update, and
-- the constraint above makes it carry a reason.
create policy document_comments_update on document_comments
  for update
  using (
    app.can_read(confidentiality)
    and app.can_see_document(document_id)
  )
  with check (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- No delete. A comment on a court document is a remark somebody made about
-- evidence, and one that can be removed without trace is one that can be
-- denied.
revoke all on document_comments from authenticated;
grant select, insert, update on document_comments to authenticated;

grant select on document_comment_register, document_version_steps to authenticated;

-- The revision label and the change summary are insert-time columns, and
-- there is deliberately no way to add them afterwards. 0012 made a document
-- version append-only — `app.refuse_version_mutation` refuses every update —
-- and that rule is right for these two as well: an account of what changed
-- in a revision that can be rewritten later is not an account of anything.
-- It travels with the upload or it does not exist, and a version that went up
-- without one says "neyin değiştiği kayıtlı değil" for good.
--
-- (This is also the shape I nearly got wrong. A column-level grant plus an
-- update policy would have read as a careful narrow permission and been
-- refused by the trigger at runtime: a writable path that cannot write.)
--
-- What they do need is naming in the insert grant. 0012's is column-level, so
-- a column added to this table is not insertable until it appears in the
-- list — and the failure is silent in the worst way: the whole upload is
-- refused with "permission denied for table document_versions", which names
-- the table and not the column, so nobody connects it to the migration that
-- added one.
grant insert (revision_label, change_summary_en, change_summary_tr)
  on document_versions to authenticated;

drop function app.add_common_columns(regclass);

select app.reset_function_grants();
