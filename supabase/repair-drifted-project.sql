-- Removes the pre-Faz-0 tables so the migrations can be applied.
--
-- Run this once, in the Supabase SQL editor. Read the list first: this is the
-- only destructive step in the whole exercise, and it is the project owner's
-- to take rather than a tool's.
--
-- WHY THIS IS NEEDED
--
-- The project's `legal_cases`, `document_vault` and the rest were created by
-- the original application, before any of this work. They still carry the
-- fields Faz 0 removed as untrue: `document_vault.encrypted`, and
-- `financial_transactions.synced_with_accounting` / `sync_source`, which
-- together described a live accounting connection that was a timer. Two
-- tables the current schema needs are absent altogether.
--
-- So 0002 could never apply — its `create table` met tables that already
-- existed — and 0003 could not apply onto the result, because the columns it
-- refers to are not there. 0003 is the migration that creates every row level
-- security policy. Which is why the portal refuses everybody: row level
-- security is switched on and there is no policy behind it, and that combination
-- denies by definition rather than by accident.
--
-- Repairing forward was the first thing tried and it does not work here. The
-- difference is not a few missing columns: it is a different generation of the
-- schema, and the later migrations alter these tables expecting the current
-- shape.
--
-- WHAT IS LOST
--
-- One row, in `deadline_notifications` — a sample deadline. The tables that
-- hold anything worth keeping are deliberately NOT in the list below:
--
--     profiles    1 row    the administrator account          KEPT
--     audit_log   5 rows   the setup's own trail              KEPT
--
-- Nothing else in the public schema has a single row in it; that was checked
-- before writing this, table by table. The `auth` and `storage` schemas are
-- not touched at all, so the sign-in account itself is unaffected.
--
-- WHAT HAPPENS NEXT
--
-- Migrations 0002, 0003 and 0005 to 0016 are applied over the top. 0001 and
-- 0004 are already correct and are left alone — their tables match the
-- repository column for column.

begin;

-- Exactly the tables from the old application. Cascade, because the old
-- foreign keys between them go with them.
drop table if exists public.thread_messages cascade;
drop table if exists public.communication_threads cascade;
drop table if exists public.construction_blocks cascade;
drop table if exists public.deadline_acknowledgements cascade;
drop table if exists public.deadline_notifications cascade;
drop table if exists public.document_vault cascade;
drop table if exists public.financial_transactions cascade;
drop table if exists public.legal_cases cascade;
drop table if exists public.trustee_members cascade;

commit;

-- Proof of work: a DDL script returns nothing, so an editor says "Success"
-- whether it committed or the paste was cut short. No row below means the
-- paste did not finish.
select
  'old tables removed' as done,
  (select count(*) from information_schema.tables
    where table_schema = 'public') as public_tables_left,
  (select count(*) from public.profiles) as profiles_kept;
