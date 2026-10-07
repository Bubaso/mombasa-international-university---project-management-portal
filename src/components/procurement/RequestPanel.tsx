/**
 * Procurement requests, and the comparison that settles them
 * (M14-01, M14-02).
 *
 * The requirement names the actual situation: four advocates were evaluated
 * in parallel and the reasoning for choosing one of them is in scattered
 * meeting notes. So this panel's two unusual demands are both about reasons.
 *
 * Approving asks for a note and goes through a database function that reads
 * 0015's money bands — the same bands that decide who may approve a payment —
 * and refuses self-approval. The button is offered to everybody; the band
 * decides, and the error says which roles were needed. Hiding the button from
 * people outside the band would teach them nothing.
 *
 * Rejecting a candidate asks for a reason and will not proceed without one.
 * That is the half that went missing: why the other three were not chosen.
 */
import React, { useState } from 'react';
import { CircleCheck, CircleX, Gavel, Plus, Trophy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useAddCandidate,
  useAddRequest,
  useApproveRequest,
  useAwardTo,
  useCandidates,
  useRejectCandidate,
  useRequests,
} from '../../api/procurementHooks';
import { QueryStatus } from '../QueryStatus';
import {
  ActionButton,
  Field,
  Pill,
  Select,
  TableFrame,
  Td,
  TextInput,
  Th,
  WriteError,
} from '../ui/Controls';
import {
  OUTCOME_TONE,
  REQUEST_TONE,
  feeBasisLabel,
  kindLabel,
  outcomeLabel,
  requestStateLabel,
} from '../../lib/procurement';
import { money, formatDate } from '../../lib/site';
import { splitBySettled } from '../../lib/registerStates';
import { SettledSection } from '../ui/SettledSection';
import type { ProcurementKind, ProcurementRequest } from '../../types';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

const KINDS: ProcurementKind[] = [
  'legal_counsel',
  'contractor',
  'auditor',
  'consultant',
  'supplier',
  'other',
];

export const RequestPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const requests = useRequests();
  const [openId, setOpenId] = useState<string | null>(null);
  const candidates = useCandidates(openId);

  const addRequest = useAddRequest();
  const approve = useApproveRequest();
  const addCandidate = useAddCandidate();
  const award = useAwardTo();
  const reject = useRejectCandidate();

  const [raising, setRaising] = useState(false);
  const [form, setForm] = useState({
    kind: 'consultant' as ProcurementKind,
    referenceNo: '',
    needEn: '',
    justificationEn: '',
    estimatedAmount: '',
    neededBy: '',
  });

  const [adding, setAdding] = useState(false);
  const [cand, setCand] = useState({
    name: '',
    scopeEn: '',
    feeAmount: '',
    feeBasis: 'fixed' as const,
    strengthsEn: '',
    weaknessesEn: '',
    score: '',
  });

  // One reason box, reused for whichever candidate is being decided, because
  // only one decision happens at a time.
  const [deciding, setDeciding] = useState<{ id: string; how: 'award' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');

  const rows = requests.data ?? [];
  // İhale edilmiş ya da iptal edilmiş talebin işi bitti; hüküm
  // `lib/registerStates`'te, bir kez (CLAUDE.md §4).
  const { open: waiting, settled } = splitBySettled(rows, 'procurement_state', (r) => r.state);
  // Bu ayrı bir soru ve hükmün tekrarı değil: açık her talep onay beklemiyor,
  // adayları çağrılmış olan zaten onaylanmış durumda.
  const awaitingApproval = waiting.filter((r) => r.state === 'drafted').length;
  // Bu ekranın bütün satırlarının kökeni, tek okumada (M13-21).
  const origins = useRecordOrigins(rows.map((r) => r.id));

  /** Bir satır; iki yerde çiziliyor (bekleyen ve kapanan). */
  const row = (request: ProcurementRequest) => {
    const open = openId === request.id;
    return (
      <li key={request.id} className="py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpenId(open ? null : request.id)}
            aria-expanded={open}
            className="min-w-0 flex-1 cursor-pointer text-left"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {request.referenceNo && (
                <span className="font-mono text-xs font-semibold text-indigo-800">
                  {request.referenceNo}
                </span>
              )}
              <span className="text-sm font-medium text-slate-900">
                {(tr ? request.needTr : request.needEn) ?? request.needEn}
              </span>
              <Pill>{kindLabel(request.kind, language)}</Pill>
              <Pill className={REQUEST_TONE[request.state]}>
                {requestStateLabel(request.state, language)}
              </Pill>
            </div>
            <p className="mt-0.5 text-sm text-slate-600">
              {(tr ? request.justificationTr : request.justificationEn) ?? request.justificationEn}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono">
                {money(request.estimatedAmount, request.estimatedCurrency)}
              </span>
              {request.requestedByName && (
                <span>
                  {tr ? 'isteyen ' : 'asked by '}
                  {request.requestedByName}
                </span>
              )}
              {request.neededBy && (
                <span>
                  {tr ? 'ne zamana ' : 'needed by '}
                  {formatDate(request.neededBy, language)}
                </span>
              )}
              <span>
                {request.candidateCount}{' '}
                {tr ? 'aday' : request.candidateCount === 1 ? 'candidate' : 'candidates'}
              </span>
              {request.approvedByName && (
                <span className="text-emerald-800">
                  {tr ? 'onaylayan ' : 'approved by '}
                  {request.approvedByName}
                </span>
              )}
            </div>
          </button>

          {request.state === 'drafted' && (
            <ActionButton
              onClick={() => approve.mutate({ id: request.id })}
              disabled={approve.isPending}
            >
              <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Onayla' : 'Approve'}
            </ActionButton>
          )}
        </div>
        <RecordOrigin origin={origins.of(request.id)} />

        {open && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold tracking-wider text-slate-600 uppercase">
                {tr ? 'Adaylar' : 'Candidates'}
              </p>
              {!adding && request.state !== 'awarded' && (
                <ActionButton onClick={() => setAdding(true)}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {tr ? 'Aday ekle' : 'Add a candidate'}
                </ActionButton>
              )}
            </div>

            {adding && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fee = Number(cand.feeAmount);
                  if (!cand.name.trim() || !(fee > 0)) return;
                  addCandidate.mutate(
                    {
                      requestId: request.id,
                      name: cand.name,
                      scopeEn: cand.scopeEn,
                      feeAmount: fee,
                      feeCurrency: 'KES',
                      feeBasis: cand.feeBasis,
                      strengthsEn: cand.strengthsEn,
                      weaknessesEn: cand.weaknessesEn,
                      score: cand.score === '' ? null : Number(cand.score),
                    },
                    {
                      onSuccess: () => {
                        setCand({
                          name: '',
                          scopeEn: '',
                          feeAmount: '',
                          feeBasis: 'fixed',
                          strengthsEn: '',
                          weaknessesEn: '',
                          score: '',
                        });
                        setAdding(false);
                      },
                    },
                  );
                }}
                className="mb-2 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-3"
              >
                <Field label={tr ? 'Aday' : 'Candidate'}>
                  <TextInput
                    value={cand.name}
                    onChange={(e) => setCand({ ...cand, name: e.target.value })}
                    required
                  />
                </Field>
                <Field label={tr ? 'Ücret (KES)' : 'Fee (KES)'}>
                  <TextInput
                    type="number"
                    min="1"
                    step="0.01"
                    value={cand.feeAmount}
                    onChange={(e) => setCand({ ...cand, feeAmount: e.target.value })}
                    required
                  />
                </Field>
                <Field label={tr ? 'Puan (0-100)' : 'Score (0-100)'}>
                  <TextInput
                    type="number"
                    min="0"
                    max="100"
                    value={cand.score}
                    onChange={(e) => setCand({ ...cand, score: e.target.value })}
                  />
                </Field>
                <Field label={tr ? 'Kapsam' : 'Scope'}>
                  <TextInput
                    value={cand.scopeEn}
                    onChange={(e) => setCand({ ...cand, scopeEn: e.target.value })}
                  />
                </Field>
                <Field label={tr ? 'Güçlü yönü' : 'Strengths'}>
                  <TextInput
                    value={cand.strengthsEn}
                    onChange={(e) => setCand({ ...cand, strengthsEn: e.target.value })}
                  />
                </Field>
                <Field label={tr ? 'Zayıf yönü' : 'Weaknesses'}>
                  <TextInput
                    value={cand.weaknessesEn}
                    onChange={(e) => setCand({ ...cand, weaknessesEn: e.target.value })}
                  />
                </Field>
                <div className="flex items-center gap-2 sm:col-span-3">
                  <ActionButton type="submit" disabled={addCandidate.isPending}>
                    {tr ? 'Adayı ekle' : 'Add'}
                  </ActionButton>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="cursor-pointer text-xs text-slate-500 underline"
                  >
                    {tr ? 'vazgeç' : 'cancel'}
                  </button>
                  <div className="flex-1">
                    <WriteError error={addCandidate.error} />
                  </div>
                </div>
              </form>
            )}

            <QueryStatus queries={[candidates]} />
            <WriteError error={award.error} />
            <WriteError error={reject.error} />

            {(candidates.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">
                {tr ? 'Henüz aday girilmemiş.' : 'No candidate has been entered yet.'}
              </p>
            ) : (
              <TableFrame
                head={
                  <tr>
                    <Th>{tr ? 'Aday' : 'Candidate'}</Th>
                    <Th className="text-right">{tr ? 'Ücret' : 'Fee'}</Th>
                    <Th className="text-right">{tr ? 'Puan' : 'Score'}</Th>
                    <Th>{tr ? 'Güçlü / zayıf' : 'Strengths / weaknesses'}</Th>
                    <Th>{tr ? 'Karar' : 'Decision'}</Th>
                  </tr>
                }
              >
                {(candidates.data ?? []).map((c) => (
                  <React.Fragment key={c.id}>
                    <tr className="hover:bg-white">
                      <Td>
                        <span className="text-sm font-medium text-slate-900">{c.name}</span>
                        {c.scopeEn && (
                          <span className="block text-xs text-slate-500">{c.scopeEn}</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <span className="font-mono text-xs text-slate-700">
                          {money(c.feeAmount, c.feeCurrency)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {feeBasisLabel(c.feeBasis, language)}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <span className="font-mono text-xs text-slate-700">{c.score ?? '—'}</span>
                      </Td>
                      <Td>
                        {c.strengthsEn && (
                          <span className="block text-xs text-emerald-800">+ {c.strengthsEn}</span>
                        )}
                        {c.weaknessesEn && (
                          <span className="block text-xs text-rose-800">− {c.weaknessesEn}</span>
                        )}
                      </Td>
                      <Td>
                        <Pill className={OUTCOME_TONE[c.outcome]}>
                          {outcomeLabel(c.outcome, language)}
                        </Pill>
                        {c.decisionNoteEn && (
                          <span className="mt-0.5 block text-xs text-slate-600">
                            {c.decisionNoteEn}
                          </span>
                        )}
                        {c.outcome === 'under_review' &&
                          request.state !== 'awarded' &&
                          deciding?.id !== c.id && (
                            <span className="mt-1 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setDeciding({ id: c.id, how: 'award' });
                                  setReason('');
                                }}
                                className="flex cursor-pointer items-center gap-1 text-xs text-emerald-800 hover:underline"
                              >
                                <Trophy className="h-3 w-3" aria-hidden="true" />
                                {tr ? 'seç' : 'select'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeciding({ id: c.id, how: 'reject' });
                                  setReason('');
                                }}
                                className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:underline"
                              >
                                <CircleX className="h-3 w-3" aria-hidden="true" />
                                {tr ? 'ele' : 'reject'}
                              </button>
                            </span>
                          )}
                      </Td>
                    </tr>
                    {deciding?.id === c.id && (
                      <tr>
                        <Td className="bg-amber-50">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!reason.trim()) return;
                              const done = { onSuccess: () => setDeciding(null) };
                              if (deciding.how === 'award') {
                                award.mutate({ candidateId: c.id, reasonEn: reason }, done);
                              } else {
                                reject.mutate({ id: c.id, reasonEn: reason }, done);
                              }
                            }}
                            className="flex flex-wrap items-end gap-2"
                          >
                            {/* Required either way. The reason a
                                      candidate was NOT chosen is the record
                                      this module exists to keep. */}
                            <Field
                              label={
                                deciding.how === 'award'
                                  ? tr
                                    ? 'Neden bu aday?'
                                    : 'Why this candidate?'
                                  : tr
                                    ? 'Neden elendi?'
                                    : 'Why not this one?'
                              }
                            >
                              <TextInput
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                required
                                autoFocus
                              />
                            </Field>
                            <ActionButton
                              type="submit"
                              disabled={award.isPending || reject.isPending}
                            >
                              {deciding.how === 'award'
                                ? tr
                                  ? 'Seç ve kapat'
                                  : 'Select and close'
                                : tr
                                  ? 'Elemeyi kaydet'
                                  : 'Record the rejection'}
                            </ActionButton>
                            <button
                              type="button"
                              onClick={() => setDeciding(null)}
                              className="cursor-pointer pb-1 text-xs text-slate-500 underline"
                            >
                              {tr ? 'vazgeç' : 'cancel'}
                            </button>
                          </form>
                        </Td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </TableFrame>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="flex flex-wrap items-center gap-1.5 text-base font-bold text-slate-900">
              {tr ? 'Tedarik talepleri ve aday karşılaştırması' : 'Requests and candidates'}
              <Pill>{waiting.length}</Pill>
            </h2>
            <p className="text-sm text-slate-500">
              {tr
                ? 'Onay, ödemelerdeki aynı tutar bandından geçer; talep eden kendi talebini onaylayamaz.'
                : 'Approval uses the same money bands as a payment; a requester cannot approve their own.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {awaitingApproval > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              {tr ? `${awaitingApproval} onay bekliyor` : `${awaitingApproval} awaiting approval`}
            </Pill>
          )}
          {!raising && (
            <ActionButton onClick={() => setRaising(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Talep aç' : 'Raise a request'}
            </ActionButton>
          )}
        </div>
      </header>

      {raising && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const amount = Number(form.estimatedAmount);
            if (!form.needEn.trim() || !form.justificationEn.trim() || !(amount > 0)) return;
            addRequest.mutate(
              {
                kind: form.kind,
                referenceNo: form.referenceNo,
                needEn: form.needEn,
                justificationEn: form.justificationEn,
                estimatedAmount: amount,
                estimatedCurrency: 'KES',
                neededBy: form.neededBy || null,
              },
              {
                onSuccess: () => {
                  setForm({
                    kind: 'consultant',
                    referenceNo: '',
                    needEn: '',
                    justificationEn: '',
                    estimatedAmount: '',
                    neededBy: '',
                  });
                  setRaising(false);
                },
              },
            );
          }}
          className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
        >
          <Field label={tr ? 'Ne için' : 'What for'}>
            <Select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as ProcurementKind })}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k, language)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Referans no' : 'Reference'}>
            <TextInput
              value={form.referenceNo}
              onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
            />
          </Field>
          <Field label={tr ? 'İhtiyaç' : 'The need'} className="sm:col-span-2">
            <TextInput
              value={form.needEn}
              onChange={(e) => setForm({ ...form, needEn: e.target.value })}
              required
            />
          </Field>
          {/* Not optional in the database either. A need without a reason is a
              purchase somebody will later have to reconstruct a reason for. */}
          <Field label={tr ? 'Gerekçe' : 'Why'} className="sm:col-span-2">
            <TextInput
              value={form.justificationEn}
              onChange={(e) => setForm({ ...form, justificationEn: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Tahmini tutar (KES)' : 'Estimate (KES)'}>
            <TextInput
              type="number"
              min="1"
              step="0.01"
              value={form.estimatedAmount}
              onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Ne zamana' : 'Needed by'}>
            <TextInput
              type="date"
              value={form.neededBy}
              onChange={(e) => setForm({ ...form, neededBy: e.target.value })}
            />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <ActionButton type="submit" disabled={addRequest.isPending}>
              {tr ? 'Talebi kaydet' : 'Record the request'}
            </ActionButton>
            <button
              type="button"
              onClick={() => setRaising(false)}
              className="cursor-pointer text-xs text-slate-500 underline"
            >
              {tr ? 'vazgeç' : 'cancel'}
            </button>
            <p className="text-sm text-slate-500">
              {tr
                ? 'Tahmin, kimin onaylayabileceğini belirleyen bandı seçiyor.'
                : 'The estimate decides which approval band applies.'}
            </p>
          </div>
          <div className="sm:col-span-2">
            <WriteError error={addRequest.error} />
          </div>
        </form>
      )}

      <QueryStatus queries={[requests]} />
      <WriteError error={approve.error} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {tr
            ? 'Kayıtlı tedarik talebi yok. Dört avukat adayı, müteahhit seçimi ve denetçi arayışı bu kütükte durur.'
            : 'No procurement is on the register. The four counsel candidates, the contractor selection and the search for an auditor belong here.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">{waiting.map(row)}</ul>

          {/* Bekleyen kalmadıysa bunu söylemek gerekiyor: boş bir alan,
              kapananların altında "hepsi sonuçlandı" ile "hiç talep yoktu"yu
              birbirine karıştırır. */}
          {waiting.length === 0 && settled.length > 0 && (
            <p className="text-sm text-slate-500">
              {tr
                ? 'Bekleyen tedarik talebi yok; kayıtlı olanların hepsi ihale edilmiş ya da iptal edilmiş.'
                : 'No request is waiting; every one recorded here was awarded or cancelled.'}
            </p>
          )}

          <SettledSection rows={settled} label={{ tr: 'Sonuçlanan', en: 'Concluded' }}>
            {(shown) => <ul className="divide-y divide-slate-100">{shown.map(row)}</ul>}
          </SettledSection>
        </>
      )}
    </section>
  );
};
