-- A Turkish title for a meeting (G-02).
--
-- The Notion workspace keeps the same 22 meetings in two databases, one in
-- English and one in Turkish — not two sets of meetings, the same ones
-- written twice. The migration merges each pair into one record, because 44
-- meetings where there were 22 is not a record of anything.
--
-- Everything else about a meeting is already bilingual: meeting_notes carries
-- a language per section, and every register written after 0009 uses the
-- title_en / title_tr pair. `meetings` predates that convention and has a
-- single title, so merging a pair would have thrown away one of the two
-- titles — and for a team that works in Turkish, the one thrown away would
-- have been the one they read.
--
-- Nullable, because a meeting minuted only in English is the ordinary case
-- and an empty Turkish title is not a defect.

alter table meetings add column if not exists title_tr text;

comment on column meetings.title_tr is
  'The Turkish title, where one exists. The English title stays in `title`, '
  'which is not null; this one is the translation, not a second record.';
