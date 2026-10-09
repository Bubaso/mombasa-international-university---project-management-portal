import React, { useMemo, useState } from 'react';
import { Archive, CalendarClock, CircleHelp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as vault from '../../api/documentHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { DOCUMENT_CATEGORIES, categoryLabel } from '../../lib/documents';
import {
  RETENTION_DISPOSITIONS,
  RETENTION_STATES,
  dispositionLabel,
  retentionStateLabel,
  retentionStateNote,
  retentionStateStyle,
} from '../../lib/retention';
import type { DocumentCategory } from '../../types';

/**
 * Saklama politikası ve ne durumda olduğu (M9-13, M9-11).
 *
 * EKRANIN EN ÖNEMLİ SATIRI "KARARI VERİLMEDİ" OLAN SATIR. Bir saklama
 * politikası yazılmamışsa portal bir varsayılan uydurmuyor; kategoriyi
 * kararsız gösteriyor. Varsayılan vermek kolaydı ve şu sonuca çıkardı:
 * kimsenin vermediği bir karar verilmiş görünür ve süresi "dolduğunda"
 * belge canlı listeden çıkar.
 *
 * Ve hiçbir şey kendiliğinden arşivlenmiyor. Liste "süresi doldu" diyor,
 * arşivleme bir insanın fiili — çünkü süresi dolmuş bir belgenin hâlâ
 * gerekip gerekmediğini bir tablo bilmiyor.
 *
 * YAŞ, BELGENİN TARİHİ DEĞİL. `document_vault` belgenin kendi tarihini
 * taşımıyor, yani sayılan şey kütüğe yüklendiği gün. 1998'de imzalanmış bir
 * senet 2026'da yüklendiyse burada 2026'dan sayılır, ve ekran bunu söylüyor.
 */
export const RetentionPanel: React.FC<{ canSetPolicy: boolean }> = ({ canSetPolicy }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const due = vault.useRetentionDue();
  const policies = vault.useRetentionPolicies();
  const save = vault.useSaveRetentionPolicy();

  const [category, setCategory] = useState<DocumentCategory>('trust_deed');
  const [disposition, setDisposition] = useState<string>('keep_forever');
  const [years, setYears] = useState('');
  const [note, setNote] = useState('');

  const rows = due.data ?? [];
  const byState = useMemo(() => {
    const out = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = out.get(row.state);
      if (list) list.push(row);
      else out.set(row.state, [row]);
    }
    return out;
  }, [rows]);

  // Görünümün verdiği ama bu paketin tanımadığı bir durum: bir göç yeni bir
  // değer ürettiyse onu kendi adıyla göstermek, bölümü kaybetmekten iyidir.
  const states = [
    ...RETENTION_STATES.filter((s) => byState.has(s)),
    ...[...byState.keys()].filter((s) => !(RETENTION_STATES as string[]).includes(s)),
  ];

  const decided = new Set((policies.data ?? []).map((p) => p.category));
  const undecided = DOCUMENT_CATEGORIES.filter((c) => !decided.has(c));

  return (
    <section data-retention-panel className="space-y-4">
      <QueryStatus queries={[due, policies]} />

      {/* Kararı verilmemiş kategoriler, listenin ÜSTÜNDE: bu bir sonuç değil
          bir soru, ve sorular sonuçların arkasına konmaz. */}
      <div
        data-retention-undecided={undecided.length}
        className={`rounded-xl border p-3 ${
          undecided.length > 0
            ? 'border-rose-300 bg-rose-50 text-rose-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        <div className="mb-1 flex items-center gap-2">
          <CircleHelp className="h-4 w-4 shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-semibold">
            {undecided.length === 0
              ? tr
                ? 'Her kategori için bir saklama kararı var'
                : 'Every category has a retention decision'
              : tr
                ? `${undecided.length} kategori için saklama kararı verilmedi`
                : `${undecided.length} categories have no retention decision`}
          </h3>
        </div>
        {undecided.length > 0 && (
          <>
            <p className="text-sm">
              {tr
                ? 'Varsayılan verilmiyor: kimsenin vermediği bir karar verilmiş gibi görünürse, o süre dolduğunda belge canlı listeden çıkar.'
                : 'No default is supplied: a decision nobody made would look like one, and the document would leave the live list when it expired.'}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {undecided.map((c) => (
                <li key={c}>
                  <Pill className="border-rose-300 bg-white text-rose-900">
                    {categoryLabel(c, language)}
                  </Pill>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {canSetPolicy && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {tr ? 'Bir kategori için karar yaz' : 'Record a decision for a category'}
          </h3>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={tr ? 'Kategori' : 'Category'} className="min-w-[160px]">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              >
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c, language)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Ne olacak' : 'What happens'} className="min-w-[180px]">
              <Select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                {RETENTION_DISPOSITIONS.map((d) => (
                  <option key={d} value={d}>
                    {dispositionLabel(d, language)}
                  </option>
                ))}
              </Select>
            </Field>
            {disposition !== 'keep_forever' && (
              <Field label={tr ? 'Kaç yıl sonra' : 'After how many years'} className="w-32">
                <TextInput
                  value={years}
                  onChange={(e) => setYears(e.target.value)}
                  inputMode="numeric"
                  placeholder="5"
                />
              </Field>
            )}
            <Field label={tr ? 'Not' : 'Note'} className="min-w-[180px] flex-1">
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <WriteError error={save.error} />
          <ActionButton
            tone="primary"
            disabled={save.isPending || (disposition !== 'keep_forever' && years.trim() === '')}
            onClick={() =>
              save.mutate(
                {
                  category,
                  disposition,
                  // `keep_forever` için null gönderiliyor, sıfır değil: kısıt
                  // ikisini ayırt ediyor ve istemci kısıta uyuyor, onu
                  // tekrar etmiyor.
                  afterYears: disposition === 'keep_forever' ? null : Number(years),
                  note: note.trim() === '' ? null : note.trim(),
                },
                { onSuccess: () => setNote('') },
              )
            }
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Kaydet' : 'Record it'}</span>
          </ActionButton>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tr ? 'Kütükte belge yok.' : 'The vault is empty.'}
        </p>
      ) : (
        states.map((state) => {
          const group = byState.get(state) ?? [];
          return (
            <div key={state} data-retention-state={state} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill className={retentionStateStyle(state)}>
                  {retentionStateLabel(state, language)} · {group.length}
                </Pill>
                <span className="text-sm text-slate-500">
                  {retentionStateNote(state, language)}
                </span>
              </div>
              <ul className="space-y-1">
                {group.map((row) => (
                  <li
                    key={row.documentId}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 font-medium text-slate-900">{row.title}</span>
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-500">
                      <span>{categoryLabel(row.category, language)}</span>
                      <span>
                        {tr ? 'yüklendi ' : 'uploaded '}
                        {row.uploadedOn.slice(0, 10)}
                      </span>
                      {row.dueOn && (
                        <span>
                          {tr ? 'vade ' : 'due '}
                          {row.dueOn}
                        </span>
                      )}
                      {row.deletionBarred && (
                        <Pill className="border-violet-200 bg-violet-50 text-violet-900">
                          {tr ? 'silinemez' : 'cannot be deleted'}
                        </Pill>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      <p className="flex items-start gap-2 text-sm text-slate-500">
        <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {tr
            ? 'Portal kendiliğinden hiçbir şeyi arşivlemiyor, ve yaş belgenin kendi tarihinden değil kütüğe yüklendiği günden sayılıyor — kütük belgenin tarihini taşımıyor.'
            : 'The portal archives nothing on its own, and age is counted from the day a document was added to the vault, not from the document’s own date — the vault does not record that date.'}
        </span>
      </p>
    </section>
  );
};
