import React, { useState } from 'react';
import { FileText, Check, Pencil, Languages, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNotes, useSaveNote } from '../../api/meetingHooks';
import { NOTE_SECTION_VALUES, noteSectionLabel } from '../../lib/meetings';
import { ActionButton, Pill, WriteError } from '../ui/Controls';
import type { ContentLanguage, MinutesStatus, NoteSection } from '../../types';

/**
 * The note, kept verbatim under the five headings the team already writes
 * under, in both languages (M3-03, M3-10).
 *
 * The structured records below it — decisions, actions, questions — are drawn
 * out of this rather than replacing it. The note is what was written at the
 * time and what a Notion page migrates into; the records are what can be
 * chased. Losing the first to get the second would be a bad trade.
 */
export const NoteEditor: React.FC<{
  meetingId: string;
  minutesStatus: MinutesStatus;
  canEdit: boolean;
}> = ({ meetingId, minutesStatus, canEdit }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const notes = useNotes(meetingId);
  const [noteLanguage, setNoteLanguage] = useState<ContentLanguage>(
    language === 'tr' ? 'tr' : 'en',
  );

  const locked = minutesStatus === 'final';
  const rows = notes.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <FileText className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Tutanak' : 'The note'}
        </h2>
        <div className="flex items-center gap-1.5">
          {locked && (
            <Pill className="border-slate-400 bg-slate-800 text-white">
              <span className="flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                {tr ? 'kesinleşti' : 'final'}
              </span>
            </Pill>
          )}
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(['tr', 'en'] as ContentLanguage[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setNoteLanguage(code)}
                className={`cursor-pointer px-2.5 py-1 text-xs font-semibold uppercase ${
                  noteLanguage === code
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="divide-y divide-slate-100">
        {NOTE_SECTION_VALUES.map((section) => {
          const note = rows.find((n) => n.section === section && n.language === noteLanguage);
          const other = rows.find((n) => n.section === section && n.language !== noteLanguage);
          return (
            <NoteSectionRow
              key={`${section}-${noteLanguage}`}
              meetingId={meetingId}
              section={section}
              language={noteLanguage}
              body={note?.body ?? ''}
              isMachineTranslation={note?.isMachineTranslation ?? false}
              hasOtherLanguage={other != null}
              canEdit={canEdit && !locked}
              locked={locked}
            />
          );
        })}
      </div>
    </section>
  );
};

const NoteSectionRow: React.FC<{
  meetingId: string;
  section: NoteSection;
  language: ContentLanguage;
  body: string;
  isMachineTranslation: boolean;
  hasOtherLanguage: boolean;
  canEdit: boolean;
  locked: boolean;
}> = ({
  meetingId,
  section,
  language: noteLanguage,
  body,
  isMachineTranslation,
  hasOtherLanguage,
  canEdit,
  locked,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const save = useSaveNote();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);

  const begin = () => {
    setDraft(body);
    save.reset();
    setEditing(true);
  };

  return (
    <div className="px-4 py-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {noteSectionLabel(section, language)}
        </h3>
        <div className="flex items-center gap-1.5">
          {isMachineTranslation && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-800">
              <span className="flex items-center gap-1">
                <Languages className="h-2.5 w-2.5" aria-hidden="true" />
                {tr ? 'makine çevirisi' : 'machine translation'}
              </span>
            </Pill>
          )}
          {!body && hasOtherLanguage && (
            <span className="text-xs text-slate-400">
              {tr ? 'diğer dilde yazılmış' : 'written in the other language'}
            </span>
          )}
          {canEdit && !editing && (
            <ActionButton onClick={begin}>
              <Pencil className="h-3 w-3" aria-hidden="true" />
              <span>{body ? (tr ? 'Düzenle' : 'Edit') : tr ? 'Yaz' : 'Write'}</span>
            </ActionButton>
          )}
        </div>
      </div>

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              { meetingId, section, language: noteLanguage, body: draft },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm leading-relaxed text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <WriteError error={save.error} />
          <div className="mt-2 flex justify-end gap-2">
            <ActionButton type="button" onClick={() => setEditing(false)} disabled={save.isPending}>
              {tr ? 'Vazgeç' : 'Cancel'}
            </ActionButton>
            <ActionButton type="submit" tone="primary" disabled={save.isPending}>
              <Check className="h-3 w-3" aria-hidden="true" />
              <span>{tr ? 'Kaydet' : 'Save'}</span>
            </ActionButton>
          </div>
        </form>
      ) : body ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{body}</p>
      ) : (
        <p className="text-xs text-slate-400">
          {locked
            ? tr
              ? 'Bu başlık boş bırakılmış ve tutanak kesinleşti.'
              : 'This heading was left empty and the minutes are final.'
            : tr
              ? 'Henüz yazılmamış.'
              : 'Not written yet.'}
        </p>
      )}
    </div>
  );
};
