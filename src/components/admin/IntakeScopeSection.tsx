import React, { useState } from 'react';
import { Target } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as access from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Pill, Section, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';

/**
 * Asistanın alım kapsamı (M13-17).
 *
 * M13-17: "Modül her yazılabilir kayıt türüne teklif verebilir; kapsamı
 * veritabanındaki kayıttan gelir, koddan değil." 0056 o kaydı kurdu; bu bölüm
 * onu görünür ve değiştirilebilir yapıyor.
 *
 * Bir hedefi kapatmak asistanın bir işi yapmasını engelliyor, ve ekran bunu
 * böyle söylüyor: kapsam dışı bir hedef için teklif üretilmez. Açıklaması
 * burada duruyor çünkü kapatan kişi sonucu bilmeden karar vermemeli.
 *
 * Alan şeması bu ekranda YOK ve olmaması kasıtlı. Her hedefin alanları
 * `targets.js`'te, yazan fonksiyonun yanında; alan listesini buraya
 * getirmek, iki yerde tutulan bir şema yaratmak olurdu (CLAUDE.md §4).
 * Burada görünen şey bir yetki kararı, bir form değil.
 */
export const IntakeScopeSection: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const targets = access.useIntakeTargets();
  const set = access.useSetIntakeTarget();

  const [closing, setClosing] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const rows = targets.data ?? [];
  const open = rows.filter((r) => r.enabled);

  return (
    <Section
      icon={Target}
      title={tr ? 'Asistanın kapsamı' : "The assistant's scope"}
      subtitle={
        tr
          ? 'Belge okuyucunun hangi kayıt türlerine teklif verebileceği.'
          : 'Which kinds of record the document reader may propose.'
      }
      whoMayUse={
        tr
          ? 'Listeyi herkes okur; değiştirmek yöneticinin işi.'
          : 'Anybody may read the list; changing it belongs to an administrator.'
      }
      canUse={canManage}
      waiting={open.length}
    >
      <QueryStatus queries={[targets]} />

      <ul className="space-y-1" data-intake-scope="list">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-sm text-slate-800">{row.key}</span>
              {row.enabled ? (
                <Pill className="border-emerald-300 bg-emerald-50 text-emerald-800">
                  {tr ? 'kapsamda' : 'in scope'}
                </Pill>
              ) : (
                <Pill className="border-slate-300 bg-slate-100 text-slate-600">
                  {tr ? 'kapalı' : 'closed'}
                </Pill>
              )}
            </span>
            <span className="flex items-center gap-2 text-sm text-slate-500">
              {row.note && <span className="max-w-[18rem] truncate">{row.note}</span>}
              {!row.enabled && <span>{formatDate(row.updatedAt, language)}</span>}
              {canManage &&
                (row.enabled ? (
                  <ActionButton type="button" onClick={() => setClosing(row.id)}>
                    {tr ? 'Kapsamdan çıkar' : 'Take out of scope'}
                  </ActionButton>
                ) : (
                  <ActionButton
                    type="button"
                    disabled={set.isPending}
                    onClick={() => set.mutate({ id: row.id, enabled: true, note: null })}
                  >
                    {tr ? 'Kapsama al' : 'Put back in scope'}
                  </ActionButton>
                ))}
            </span>
          </li>
        ))}
      </ul>

      {closing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set.mutate(
              { id: closing, enabled: false, note: note.trim() },
              {
                onSuccess: () => {
                  setClosing(null);
                  setNote('');
                },
              },
            );
          }}
          className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
        >
          <p className="text-sm text-slate-700">
            {tr
              ? 'Niçin kapatılıyor? Kapatmak asistanın bu türe teklif vermesini durdurur.'
              : 'Why is it being closed? Closing stops the assistant proposing this kind.'}
          </p>
          <TextInput required value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <ActionButton type="submit" tone="primary" disabled={set.isPending}>
              {tr ? 'Kapsamdan çıkar' : 'Take out of scope'}
            </ActionButton>
            <ActionButton type="button" onClick={() => setClosing(null)}>
              {tr ? 'Vazgeç' : 'Cancel'}
            </ActionButton>
          </div>
          <WriteError error={set.error} />
        </form>
      )}
    </Section>
  );
};
