/**
 * Machine translations waiting for somebody to stand behind them (M3-10, M13-09).
 *
 * The portal is bilingual in 43 tables and 70 field pairs, and a Turkish
 * trustee reading an English-only obligation detail is reading nothing. So
 * filling the empty half automatically is worth doing — and the danger in
 * doing it is exact: a machine translation indistinguishable from the record
 * IS the record, as far as any reader can tell. That is the same defect as a
 * "SHA-256 verified" badge on a file nobody read, in a different column.
 *
 * Hence this queue, and hence its wording. A translation here is a SUGGESTION
 * until a person reads it and says it is right. The count at the top is of
 * suggestions nobody has stood behind, and it only goes down when somebody
 * decides — the same arrangement as the action candidates, for the same reason.
 *
 * The row marked "edited by hand" needs no decision at all: if the field no
 * longer says what the machine said, a person has already been there, and the
 * queue says so rather than asking them to confirm their own edit.
 */
import React, { useState } from 'react';
import { Check, Languages, Pencil, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  translationConfigured,
  useApproveTranslation,
  useCorrectTranslation,
  useTranslationBacklog,
  useTranslationReview,
} from '../../api/translateHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Pill, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';

const LANGUAGE: Record<string, string> = { tr: 'Türkçe', en: 'English' };

export const TranslationPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const review = useTranslationReview();
  const backlog = useTranslationBacklog();
  const approve = useApproveTranslation();
  const correct = useCorrectTranslation();

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const rows = review.data ?? [];
  // Three states, genuinely different: waiting for a reader, already edited by
  // hand (nothing to do), and stood behind.
  const waiting = rows.filter((r) => r.approvedAt == null && r.stillTheMachinesWords);
  const editedByHand = rows.filter((r) => r.approvedAt == null && !r.stillTheMachinesWords);
  const settled = rows.filter((r) => r.approvedAt != null);

  const gap = (backlog.data ?? []).reduce((sum, r) => sum + r.onlyEn + r.onlyTr, 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Languages className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {tr ? 'Makine çevirileri' : 'Machine translations'}
            </h2>
            <p className="max-w-2xl text-[11px] text-slate-500">
              {tr
                ? 'Bir alanın boş olan dili otomatik dolduruluyor. Ama okuyandan ayırt edilemeyen bir makine çevirisi, okuyan için kaydın kendisidir — bu yüzden onaylanmamış çeviri bir öneridir, kayıt değil. Aşağıdaki sayı, arkasında henüz kimsenin durmadığı öneri sayısı.'
                : 'The empty language of a field is filled automatically. But a machine translation a reader cannot tell apart from the record IS the record to them — so an unapproved one is a suggestion, not the record. The count below is of suggestions nobody has stood behind.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill
            className={
              waiting.length > 0
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-emerald-300 bg-emerald-50 text-emerald-900'
            }
          >
            {tr ? `${waiting.length} öneri bekliyor` : `${waiting.length} awaiting a reader`}
          </Pill>
          {gap > 0 && (
            <Pill className="border-slate-300 bg-slate-50 text-slate-700">
              {tr ? `${gap} alan tek dilli` : `${gap} fields single-language`}
            </Pill>
          )}
          {settled.length > 0 && (
            <span className="text-[11px] text-slate-500">
              {tr ? `${settled.length} karara bağlandı` : `${settled.length} settled`}
            </span>
          )}
        </div>
      </header>

      {!translationConfigured && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {tr
            ? 'Çeviri için bir model bağlı değil, yani hiçbir alan otomatik dolmuyor. Aşağıdaki liste geçmişte yapılanlar.'
            : 'No model is connected, so no field is being filled automatically. The list below is what was done before.'}
        </p>
      )}

      <QueryStatus queries={[review, backlog]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {tr
            ? 'Henüz makine çevirisi yok. Bir toplantı, karar, aksiyon veya soru tek dilde kaydedildiğinde diğer dili burada önerilir.'
            : 'No machine translations yet. When a meeting, decision, action or question is recorded in one language, the other is suggested here.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {[...waiting, ...editedByHand, ...settled].map((row) => (
            <li key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="flex flex-wrap items-baseline gap-2 text-[11px]">
                <span className="font-mono text-slate-500">
                  {row.entityTable}.{row.columnName}
                </span>
                <span className="text-slate-500">
                  {LANGUAGE[row.fromLanguage]} → {LANGUAGE[row.intoLanguage]}
                </span>
                <span className="font-mono text-slate-400">{row.model}</span>
                <span className="font-mono text-slate-400">
                  {formatDate(row.translatedAt, language)}
                </span>
                {row.approvedAt == null && row.stillTheMachinesWords && (
                  <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                    {tr ? 'öneri — onaylanmadı' : 'a suggestion, not approved'}
                  </Pill>
                )}
                {row.approvedAt == null && !row.stillTheMachinesWords && (
                  <Pill className="border-slate-300 bg-white text-slate-600">
                    {tr ? 'elle değiştirilmiş' : 'edited by hand'}
                  </Pill>
                )}
                {row.approvedAt != null && (
                  <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
                    {row.corrected
                      ? tr
                        ? 'düzeltildi'
                        : 'corrected'
                      : tr
                        ? 'onaylandı'
                        : 'approved'}
                  </Pill>
                )}
              </div>

              <p className="mt-1 text-xs text-slate-900">{row.currentText}</p>

              {/* What the machine said, when the field no longer says it. The
                  pair is the record of "the machine wrote X and a person made
                  it Y", which is the only way to learn which columns the
                  machine is bad at. */}
              {!row.stillTheMachinesWords && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {tr ? 'Makinenin yazdığı: ' : 'The machine wrote: '}
                  <span className="italic">{row.machineText}</span>
                </p>
              )}

              {row.approvedAt == null && row.stillTheMachinesWords && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <ActionButton onClick={() => approve.mutate(row.id)} disabled={approve.isPending}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr ? 'Doğru, arkasında duruyorum' : 'Right — I stand behind it'}
                  </ActionButton>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row.id);
                      setDraft(row.currentText);
                    }}
                    className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-600 hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr ? 'yeniden yaz' : 'rewrite it'}
                  </button>
                </div>
              )}

              {editing === row.id && (
                <form
                  className="mt-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    correct.mutate(
                      {
                        id: row.id,
                        table: row.entityTable,
                        entityId: row.entityId,
                        column: row.columnName,
                        text: draft,
                      },
                      { onSuccess: () => setEditing(null) },
                    );
                  }}
                >
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs leading-relaxed text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <ActionButton type="submit" tone="primary" disabled={correct.isPending}>
                      {tr ? 'Düzeltmeyi kaydet' : 'Save the correction'}
                    </ActionButton>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="cursor-pointer text-[11px] text-slate-500 underline"
                    >
                      {tr ? 'vazgeç' : 'cancel'}
                    </button>
                  </div>
                  <WriteError error={correct.error} />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <WriteError error={approve.error} />
    </section>
  );
};
