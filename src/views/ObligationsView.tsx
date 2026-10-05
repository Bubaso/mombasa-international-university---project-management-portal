import React, { useMemo, useState } from 'react';
import { Bilingual } from '../components/ui/Bilingual';
import { ScrollText, ShieldAlert, Plus, FileCheck2, FileX2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as register from '../api/obligationHooks';
import { useAuthority } from '../api/adminHooks';
import { useMeetings } from '../api/meetingHooks';
import { useCaseOrders } from '../api/hooks';
import { useStakeholders } from '../api/stakeholderHooks';
import { QueryStatus } from '../components/QueryStatus';
import { EmptyState } from '../components/EmptyState';
import { ASSESSORS, MINUTE_KEEPERS, actsAs } from '../lib/authority';
import {
  BAND_STYLES,
  OBLIGATION_SOURCES,
  OBLIGATION_STATES,
  SOURCE_STYLES,
  STATE_STYLES,
  bandLabel,
  sourceLabel,
  stateLabel,
  thresholdBand,
} from '../lib/obligations';
import {
  ActionButton,
  Field,
  Pill,
  Select,
  TextInput,
  WriteError,
} from '../components/ui/Controls';
import { ObligationDetail } from '../components/obligations/ObligationDetail';
import { ProhibitionPanel } from '../components/obligations/ProhibitionPanel';
import type {
  Confidentiality,
  Language,
  Obligation,
  ObligationSource,
  ObligationState,
} from '../types';
import { splitBySettled } from '../lib/registerStates';
import { SettledSection } from '../components/ui/SettledSection';
import { useRecordOrigins } from '../api/proposalHooks';
import { RecordOrigin } from '../components/ui/RecordOrigin';
import type { Provenance } from '../api/proposals';

/**
 * The obligations and commitments register (M2).
 *
 * Four sources have put obligations on this project — the lease, the courts,
 * the trust deed, the MoU and the rules — and none of them sit together
 * anywhere. Then there are the promises people make, which live inside
 * meeting notes and are followed by nobody.
 *
 * They are the same kind of thing: something a party undertook, with a date,
 * that ought to have evidence. This screen is the one list.
 */
export const ObligationsView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const obligations = register.useObligations();
  const authority = useAuthority();
  const canKeep = actsAs(authority.data, ...ASSESSORS);
  const canMinute = actsAs(authority.data, ...MINUTE_KEEPERS);

  const [source, setSource] = useState<ObligationSource | ''>('');
  const [state, setState] = useState<ObligationState | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = obligations.data ?? [];
  // Bir ekran dolusu için tek okuma (M13-21).
  const origins = useRecordOrigins(rows.map((o) => o.id));

  const shown = useMemo(
    () => rows.filter((o) => (!source || o.source === source) && (!state || o.state === state)),
    [rows, source, state],
  );

  // Grouped by where it came from, because that is how people think about
  // them: "what does the lease require" is a different question from "what
  // did the minister promise".
  const grouped = useMemo(() => {
    const map = new Map<ObligationSource, Obligation[]>();
    for (const o of shown) {
      const list = map.get(o.source) ?? [];
      list.push(o);
      map.set(o.source, list);
    }
    return [...map.entries()].sort(
      (a, b) => OBLIGATION_SOURCES.indexOf(a[0]) - OBLIGATION_SOURCES.indexOf(b[0]),
    );
  }, [shown]);

  // Hangi durumun son olduğu `lib/registerStates`'te, enum başına, bir kez.
  // Burada yalnız bölme var.
  const waitingOf = (items: Obligation[]) =>
    splitBySettled(items, 'obligation_state', (o) => o.state).open;
  const settledOf = (items: Obligation[]) =>
    splitBySettled(items, 'obligation_state', (o) => o.state).settled;

  const selected = rows.find((o) => o.id === selectedId) ?? null;
  const unverified = rows.filter((o) => !o.verified).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ScrollText className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Yükümlülük ve Taahhüt Kütüğü' : 'Obligations & Commitments'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Kira sözleşmesi, mahkeme kararları, vakıf senedi, mutabakatlar ve verilmiş sözler.'
                : 'The lease, the court orders, the trust deed, the memoranda, and promises people made.'}
            </p>
          </div>
        </div>
        {canKeep && !adding && (
          <ActionButton tone="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Yükümlülük ekle' : 'Record an obligation'}</span>
          </ActionButton>
        )}
      </header>

      <QueryStatus queries={[obligations]} />

      <ProhibitionPanel canRecord={canKeep} />

      {unverified > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5">
          <FileX2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-amber-900">
            <span className="font-semibold">
              {tr
                ? `${unverified} yükümlülüğün arkasında belge yok.`
                : `${unverified} obligations have no document behind them.`}
            </span>{' '}
            {tr
              ? 'Kayıtlı olmayan bir yükümlülük, doğrulanmamış olandan kötüdür — bu yüzden buradalar. Ama kaynak belge eklenene kadar "doğrulanmamış" kalırlar; bu işaret elle kaldırılamaz.'
              : 'An unrecorded obligation is worse than an unverified one, which is why they are here. They stay marked until a source document is attached, and that mark cannot be cleared by hand.'}
          </p>
        </div>
      )}

      {adding && (
        <NewObligationForm canMinuteOnly={!canKeep && canMinute} onDone={() => setAdding(false)} />
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field label={tr ? 'Kaynak' : 'Source'}>
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value as ObligationSource | '')}
          >
            <option value="">{tr ? 'Hepsi' : 'All'}</option>
            {OBLIGATION_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Durum' : 'State'}>
          <Select value={state} onChange={(e) => setState(e.target.value as ObligationState | '')}>
            <option value="">{tr ? 'Hepsi' : 'All'}</option>
            {OBLIGATION_STATES.map((s) => (
              <option key={s} value={s}>
                {stateLabel(s, language)}
              </option>
            ))}
          </Select>
        </Field>
        <span className="pb-1.5 text-xs text-slate-500">
          {tr ? `${shown.length} kayıt` : `${shown.length} of them`}
        </span>
      </div>

      <div className={selected ? 'grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]' : ''}>
        <div className="min-w-0 space-y-4">
          {shown.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title={tr ? 'Kütük boş' : 'The register is empty'}
              description={
                rows.length === 0
                  ? tr
                    ? 'Kira sözleşmesinden, mahkeme kararlarından ve vakıf senedinden doğan yükümlülükleri girerek başlayın. Her biri kaynak belgesine bağlandığında doğrulanmış sayılır.'
                    : 'Start with what the lease, the court orders and the trust deed require. Each counts as verified once its source document is attached.'
                  : tr
                    ? 'Bu filtrelerle eşleşen yükümlülük yok.'
                    : 'Nothing matches those filters.'
              }
            />
          ) : (
            grouped.map(([group, items]) => (
              <section
                key={group}
                className="rounded-xl border border-slate-200 bg-white shadow-xs"
              >
                <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Pill className={SOURCE_STYLES[group]}>{sourceLabel(group, language)}</Pill>
                  </h2>
                  {/* Bekleyen sayısı önce: grubun kaç işi olduğu o. Toplam
                      da yazıyor, yoksa geri çekilenler yok sayılmış olur. */}
                  <span className="text-xs text-slate-500">
                    {state === '' && settledOf(items).length > 0
                      ? `${waitingOf(items).length} / ${items.length}`
                      : items.length}
                  </span>
                </header>
                <ul className="divide-y divide-slate-100">
                  {waitingOf(items).map((o) => (
                    <ObligationRow
                      key={o.id}
                      o={o}
                      origin={origins.of(o.id)}
                      language={language}
                      selected={o.id === selectedId}
                      onOpen={() => setSelectedId(o.id)}
                    />
                  ))}
                </ul>
                {/* Yerine getirilmiş olan geri çekiliyor — ama kullanıcı
                    zaten bir duruma süzdüyse bölünmüyor: istediği tam o
                    liste, ve onu "tamamlanan" diye kapatmak soruyu
                    cevapsız bırakmak olurdu. */}
                {state === '' && (
                  <div className="px-4 pb-2">
                    <SettledSection
                      rows={settledOf(items)}
                      label={{ tr: 'Yerine getirilmiş', en: 'Fulfilled' }}
                    >
                      {(rowsShown) => (
                        <ul className="divide-y divide-slate-100">
                          {rowsShown.map((o) => (
                            <ObligationRow
                              key={o.id}
                              o={o}
                              origin={origins.of(o.id)}
                              language={language}
                              selected={o.id === selectedId}
                              onOpen={() => setSelectedId(o.id)}
                            />
                          ))}
                        </ul>
                      )}
                    </SettledSection>
                  </div>
                )}
              </section>
            ))
          )}
        </div>

        {selected && (
          <ObligationDetail
            obligation={selected}
            canKeep={canKeep}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

/**
 * Bir yükümlülük satırı.
 *
 * Buraya çıkarıldı çünkü iki yerde çiziliyor: bekleyenlerin arasında ve geri
 * çekilmiş olanların arasında.
 */
const ObligationRow: React.FC<{
  o: Obligation;
  /** Kaydın kökeni, ekranın tek okumasından (M13-21). */
  origin: Provenance | undefined;
  language: Language;
  selected: boolean;
  onOpen: () => void;
}> = ({ o, origin, language, selected, onOpen }) => {
  const tr = language === 'tr';
  const band = o.state === 'fulfilled' ? null : thresholdBand(o.dueOn);

  return (
    <li key={o.id}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50 ${
          selected ? 'bg-amber-50' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {o.prohibits && (
              <ShieldAlert
                className="h-3.5 w-3.5 shrink-0 text-rose-600"
                aria-label={tr ? 'yasak' : 'a prohibition'}
              />
            )}
            <span className="text-sm font-medium text-slate-900">
              <Bilingual table="obligations" id={o.id} base="title" en={o.titleEn} tr={o.titleTr} />
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span>
              {tr ? 'yükümlü: ' : 'owed by: '}
              <span className="font-medium text-slate-700">{o.obligorName}</span>
            </span>
            {o.beneficiaryName && (
              <span>
                {tr ? 'lehtar: ' : 'owed to: '}
                {o.beneficiaryName}
              </span>
            )}
            {o.dueOn && <span className="font-mono">{o.dueOn}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {band != null && <Pill className={BAND_STYLES[band]}>{bandLabel(band, language)}</Pill>}
          {o.verified ? (
            <span title={tr ? 'kaynak belgesi var' : 'a source document is attached'}>
              <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            </span>
          ) : (
            <span title={tr ? 'belgesiz' : 'no document behind it'}>
              <FileX2 className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            </span>
          )}
          <Pill className={STATE_STYLES[o.state]}>{stateLabel(o.state, language)}</Pill>
        </div>
      </button>
      <RecordOrigin origin={origin} />
    </li>
  );
};

// ---------------------------------------------------------------------------

const NewObligationForm: React.FC<{ canMinuteOnly: boolean; onDone: () => void }> = ({
  canMinuteOnly,
  onDone,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = register.useCreateObligation();
  const meetings = useMeetings();
  const orders = useCaseOrders(undefined);
  const stakeholders = useStakeholders();

  const [source, setSource] = useState<ObligationSource>(
    canMinuteOnly ? 'personal_commitment' : 'lease',
  );
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [obligorName, setObligorName] = useState('');
  const [obligorStakeholderId, setObligorStakeholderId] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [prohibits, setProhibits] = useState(false);
  const [meetingId, setMeetingId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('internal');

  // The schema requires these, and saying so here beats a rejected save.
  const needsMeeting = source === 'personal_commitment';
  const needsOrder = source === 'court_order';
  const ready =
    title.trim() && obligorName.trim() && (!needsMeeting || meetingId) && (!needsOrder || orderId);

  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        create.mutate(
          {
            titleEn: language === 'en' ? title.trim() : null,
            titleTr: language === 'tr' ? title.trim() : null,
            detailEn: detail.trim() || null,
            source,
            sourceDocumentId: null,
            sourceLegalOrderId: needsOrder ? orderId : null,
            sourceMeetingId: needsMeeting ? meetingId : null,
            obligorName: obligorName.trim(),
            obligorStakeholderId: obligorStakeholderId || null,
            beneficiaryName: beneficiary.trim() || null,
            dueOn: dueOn || null,
            prohibits,
            confidentiality,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Kaynak' : 'Where it comes from'}>
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value as ObligationSource)}
            disabled={canMinuteOnly}
          >
            {OBLIGATION_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Ne yapılacak' : 'What has to happen'} className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label={tr ? 'Ayrıntı' : 'Detail'} className="sm:col-span-3">
          <TextInput value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>
        <Field label={tr ? 'Yükümlü (kurum ya da kişi)' : 'Owed by'}>
          <TextInput
            value={obligorName}
            onChange={(e) => setObligorName(e.target.value)}
            placeholder={tr ? 'AUTK, müteahhit, bakan…' : 'AUTK, the contractor, the minister…'}
            required
          />
        </Field>
        <Field label={tr ? 'Kütükteki karşılığı' : 'That person, if in the register'}>
          <Select
            value={obligorStakeholderId}
            onChange={(e) => setObligorStakeholderId(e.target.value)}
          >
            <option value="">{tr ? 'Bağlanmadı' : 'Not linked'}</option>
            {(stakeholders.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Lehtar' : 'Owed to'}>
          <TextInput value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} />
        </Field>
        <Field label={tr ? 'Son tarih' : 'Due by'}>
          <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>
        {needsMeeting && (
          <Field label={tr ? 'Hangi toplantıda söz verildi' : 'Promised in which meeting'}>
            <Select value={meetingId} onChange={(e) => setMeetingId(e.target.value)} required>
              <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
              {(meetings.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.heldAt.slice(0, 10)} · {m.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {needsOrder && (
          <Field label={tr ? 'Hangi karardan doğdu' : 'Which order created it'}>
            <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} required>
              <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
              {(orders.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.madeOn} · {o.referenceNo ?? o.madeBy ?? ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={tr ? 'Gizlilik' : 'Tier'}>
          <Select
            value={confidentiality}
            onChange={(e) => setConfidentiality(e.target.value as Confidentiality)}
          >
            <option value="public">{tr ? 'Açık' : 'Public'}</option>
            <option value="internal">{tr ? 'Kuruma özel' : 'Internal'}</option>
            <option value="confidential">{tr ? 'Gizli' : 'Confidential'}</option>
          </Select>
        </Field>
      </div>

      <label className="mt-2.5 flex cursor-pointer items-start gap-1.5 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={prohibits}
          onChange={(e) => setProhibits(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-amber-600"
        />
        <span>
          {tr
            ? 'Bu bir yasak — bir şey yapılmasını emretmiyor, yapılmasını engelliyor. İşaretlenirse, çakışan bir saha işi açılmadan önce uyarı üretir.'
            : 'This forbids something rather than requiring it. Ticked, it warns before a site task that conflicts with it is opened.'}
        </span>
      </label>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {tr
          ? 'Kaynak belge sonradan eklenir; eklenene kadar kayıt "doğrulanmamış" görünür ve bu işaret elle kaldırılamaz. "Yerine getirildi" demek için de önce delil eklemek gerekir.'
          : 'The source document is attached later; until it is, the record reads as unverified and that mark cannot be cleared by hand. Marking it fulfilled needs evidence first.'}
      </p>

      <WriteError error={create.error} />

      <div className="mt-2.5 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={create.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending || !ready}>
          {tr ? 'Kütüğe ekle' : 'Add to the register'}
        </ActionButton>
      </div>
    </form>
  );
};
