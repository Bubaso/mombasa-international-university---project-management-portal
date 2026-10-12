import React, { useState } from 'react';
import { Camera, Snowflake } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as register from '../../api/stakeholderHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import {
  CONFIDENTIALITY_TIERS,
  clearanceLabel,
  clearanceRank,
  clearanceStyle,
} from '../../lib/authority';
import { roleLabel } from '../../lib/roles';
import {
  categoryLabel,
  quadrantLabel,
  quadrantOf,
  stanceLabel,
  stanceStyle,
} from '../../lib/stakeholders';
import type { Confidentiality, MapSnapshot } from '../../types';

/**
 * Dondurulmuş paydaş haritası (M4-14).
 *
 * BU EKRANIN TEK İDDİASI BİR TARİH, ve o yüzden tarih uydurulamıyor:
 * `created_at` sunucuda damgalanıyor, harita sunucuda kopyalanıyor, ikisi de
 * sonradan değiştirilemiyor (göç 0058). Yazılmamış hâli şu olurdu: Mart'ta
 * alınmış "tarihli" bir harita, Nisan'da açıldığında Nisan'ın tutumlarını
 * gösterir ve üzerinde hâlâ Mart tarihi yazar. Hiçbir hata çıkmaz; yalnızca
 * mütevelliye gösterilen tarih yalan olur.
 *
 * VE HARİTA, ALANIN GÖRDÜĞÜ KADARDIR. Daha dar yetkiyle alınmış bir anlık
 * görüntü daha küçük bir haritadır. `takenAsRole` o eksikliğin tek dayanağı,
 * ve bu panel onu her satırda yazıyor — yoksa iki haritanın neden farklı
 * olduğu hiçbir yerde durmaz.
 *
 * Kimse kendi yetkisinin üstüne kayıt yazamıyor, o yüzden gizlilik seçimi
 * okuyanın tavanıyla sınırlı: reddedilecek bir seçeneği sunmak, kişiyi
 * sistemin bozuk olduğunu sanmaya bırakır.
 */
export const SnapshotPanel: React.FC<{ canTake: boolean }> = ({ canTake }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const snapshots = register.useMapSnapshots();
  const authority = useAuthority();
  const take = register.useTakeMapSnapshot();
  const discard = register.useDiscardMapSnapshot();

  const [openId, setOpenId] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const rows = snapshots.data ?? [];
  const live = rows.filter((r) => r.discardedAt === null);
  const dropped = rows.filter((r) => r.discardedAt !== null);

  return (
    <section data-snapshot-panel className="space-y-4">
      <QueryStatus queries={[snapshots]} />

      <div
        data-snapshot-count={live.length}
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Snowflake className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {tr ? 'Dondurulmuş haritalar' : 'Frozen maps'}
              </h3>
              <p className="text-sm text-slate-500">
                {tr
                  ? 'Her harita alındığı anın kopyası: tarihi ve içeriği sonradan değişmiyor.'
                  : 'Each map is a copy of the moment it was taken: its date and contents do not change afterwards.'}
              </p>
            </div>
          </div>
          {canTake && !taking && (
            <ActionButton tone="primary" onClick={() => setTaking(true)}>
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Anlık görüntü al' : 'Take a snapshot'}</span>
            </ActionButton>
          )}
        </header>

        {taking && authority.data && (
          <TakeForm
            ceiling={authority.data.clearance}
            pending={take.isPending}
            error={take.error}
            onCancel={() => setTaking(false)}
            onTake={(input) => take.mutate(input, { onSuccess: () => setTaking(false) })}
          />
        )}

        {live.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">
            {tr ? 'Henüz hiç anlık görüntü alınmamış.' : 'No snapshot has been taken yet.'}
          </p>
        )}

        <ul className="mt-2 divide-y divide-slate-100">
          {live.map((row) => (
            <SnapshotRow
              key={row.id}
              row={row}
              open={openId === row.id}
              canTake={canTake}
              onToggle={() => setOpenId(openId === row.id ? null : row.id)}
              onDiscard={() => {
                setDiscardingId(row.id);
                setReason('');
              }}
            />
          ))}
        </ul>

        {discardingId !== null && (
          <form
            className="mt-2 space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              discard.mutate(
                { id: discardingId, reason: reason.trim() },
                { onSuccess: () => setDiscardingId(null) },
              );
            }}
          >
            <p className="text-sm text-slate-700">
              {/* Üçüncü cümle ("silinebilen bir kayıt, kayıt değildir")
                  KESİLDİ: bir gerekçe, ve ilk iki cümle ne olacağını
                  zaten söylüyor. */}
              {tr
                ? 'Anlık görüntü silinmez, geçersiz sayılır — ve geçersiz sayılmış bir harita gerekçesiyle birlikte kütükte durmaya devam eder.'
                : 'A snapshot is not deleted but discarded — and a discarded map stays in the register with its reason beside it.'}
            </p>
            <Field label={tr ? 'Gerekçe (zorunlu)' : 'Reason (required)'}>
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} required />
            </Field>
            <WriteError error={discard.error} />
            <div className="flex flex-wrap gap-1">
              <ActionButton tone="primary" type="submit" disabled={discard.isPending}>
                {tr ? 'Geçersiz say' : 'Discard it'}
              </ActionButton>
              <ActionButton type="button" onClick={() => setDiscardingId(null)}>
                {tr ? 'Vazgeç' : 'Cancel'}
              </ActionButton>
            </div>
          </form>
        )}
      </div>

      {dropped.length > 0 && (
        <div
          data-snapshot-discarded={dropped.length}
          className="rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <h3 className="text-base font-semibold text-slate-700">
            {tr ? 'Geçersiz sayılanlar' : 'Discarded'}
          </h3>
          <ul className="mt-1 space-y-1">
            {dropped.map((row) => (
              <li key={row.id} className="text-sm text-slate-600">
                <span className="font-medium">{row.title}</span>
                {' — '}
                {row.discardedReason}
                {row.discardedByName !== null && <> · {row.discardedByName}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

const SnapshotRow: React.FC<{
  row: MapSnapshot;
  open: boolean;
  canTake: boolean;
  onToggle: () => void;
  onDiscard: () => void;
}> = ({ row, open, canTake, onToggle, onDiscard }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const people = register.useMapSnapshotPeople(open ? row.id : null);

  const tally = row.stanceTally;

  return (
    <li className="py-2" data-snapshot-role={row.takenAsRole}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="text-left text-sm font-medium text-slate-900 hover:underline"
          >
            {row.title}
          </button>
          <p className="text-sm text-slate-500">
            {new Date(row.takenAt).toLocaleString(tr ? 'tr-TR' : 'en-GB')}
            {' · '}
            {row.takenByName ?? (tr ? 'alan kişi görülemiyor' : 'taker not visible')}
            {' · '}
            {tr ? `${row.stakeholderCount} paydaş` : `${row.stakeholderCount} stakeholders`}
          </p>
          {row.note !== null && <p className="text-sm text-slate-500">{row.note}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Pill className={clearanceStyle(row.confidentiality)}>
            {clearanceLabel(row.confidentiality, language)}
          </Pill>
          {canTake && (
            <ActionButton onClick={onDiscard}>{tr ? 'Geçersiz say' : 'Discard'}</ActionButton>
          )}
        </div>
      </div>

      {/* EKSİKLİĞİN SEBEBİ, HER SATIRDA. Bir harita alanın gördüğü kadardır
          ve bunu söylemeyen bir harita tam harita sanılır. */}
      <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-900">
        {tr
          ? `Bu harita ${roleLabel(row.takenAsRole, language)} yetkisiyle alındı; o yetkinin o gün görebildiği paydaşları içerir, daha fazlasını değil.`
          : `This map was taken under the ${roleLabel(row.takenAsRole, language)} role; it holds the stakeholders that role could see that day, and no more.`}
      </p>

      {tally !== null && (
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(tally).map(([stance, n]) => (
            <Pill key={stance} className={stanceStyle(stance)}>
              {stanceLabel(stance, language)} {n}
            </Pill>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-2">
          <QueryStatus queries={[people]} />
          <ul data-snapshot-frozen={people.data?.length ?? 0} className="divide-y divide-slate-100">
            {(people.data ?? []).map((person) => (
              <li key={person.id} className="py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-900">{person.full_name}</span>
                  <Pill className={stanceStyle(person.stance)}>
                    {stanceLabel(person.stance, language)}
                  </Pill>
                  <span className="font-mono text-sm text-slate-500">
                    {person.influence} · {person.interest}
                  </span>
                  <span className="text-sm text-slate-500">
                    {quadrantLabel(
                      quadrantOf({ influence: person.influence, interest: person.interest }),
                      language,
                    )}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {[person.title, person.organization].filter(Boolean).join(' · ') ||
                    categoryLabel(person.category, language)}
                  {' · '}
                  {person.relationship_owner_id === null
                    ? tr
                      ? 'sorumlu atanmamış'
                      : 'nobody assigned'
                    : (person.relationship_owner_name ??
                      (tr ? 'sorumlusu o gün görülemiyordu' : 'the keeper was not visible'))}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
};

/**
 * Anlık görüntü formu.
 *
 * `payload` GÖNDERİLMİYOR, ve bu formun bütün dürüstlüğü orada: harita
 * sunucuda, o anda, okuyanın yetkisiyle kopyalanıyor. Form yalnızca ad, not
 * ve gizlilik soruyor.
 */
const TakeForm: React.FC<{
  ceiling: Confidentiality;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onTake: (input: { title: string; note: string | null; confidentiality: Confidentiality }) => void;
}> = ({ ceiling, pending, error, onCancel, onTake }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const allowed = CONFIDENTIALITY_TIERS.filter((t) => clearanceRank(t) <= clearanceRank(ceiling));
  const highest = allowed[allowed.length - 1] ?? 'internal';
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [tier, setTier] = useState<Confidentiality>(highest);

  return (
    <form
      className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onTake({
          title: title.trim(),
          note: note.trim() === '' ? null : note.trim(),
          confidentiality: tier,
        });
      }}
    >
      <Field label={tr ? 'Ad' : 'Name'}>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label={tr ? 'Not' : 'Note'}>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label={tr ? 'Gizlilik' : 'Classification'}>
        <Select value={tier} onChange={(e) => setTier(e.target.value as Confidentiality)}>
          {allowed.map((t) => (
            <option key={t} value={t}>
              {clearanceLabel(t, language)}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-slate-600">
        {tr
          ? 'Listede yalnızca kendi yetkinizin içindeki seviyeler var: kimse okuyamayacağı bir kaydı yazamıyor. Haritanın kendisi şimdi, sunucuda, sizin görebildiğiniz kadarıyla kopyalanacak.'
          : 'The list holds only the tiers inside your own clearance: nobody writes a record they could not read back. The map itself will be copied now, on the server, as far as you can see it.'}
      </p>
      <WriteError error={error} />
      <div className="flex flex-wrap gap-1">
        <ActionButton tone="primary" type="submit" disabled={pending}>
          {tr ? 'Al ve dondur' : 'Take and freeze'}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
      </div>
    </form>
  );
};
