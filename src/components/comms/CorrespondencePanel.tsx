/**
 * The official letter register (M11-12).
 *
 * "Dış paydaşa gönderilen resmî yazı kaydı: gönderim tarihi, kanal, ek,
 * teslim teyidi." Four things, and the fourth is the one that earns the
 * register: a letter to the Ministry that was posted and never acknowledged
 * is a different fact from one that was received, and six months later only a
 * record can tell them apart.
 *
 * Two refusals come from the database and are asked for here rather than
 * discovered as a constraint name: an outgoing letter is filed with the
 * letter itself, and a confirmed delivery says how it was confirmed.
 */
import React, { useState } from 'react';
import { FileCheck2, Mail, MailQuestion, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useAddCorrespondence,
  useConfirmDelivery,
  useCorrespondence,
  useUnconfirmedOutgoing,
} from '../../api/commsHooks';
import { useDocumentOptions } from '../../api/documentHooks';
import { useAuthority } from '../../api/adminHooks';
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
import { actsAs } from '../../lib/authority';
import { ROUTES, routeName } from '../../lib/comms';
import { formatDate } from '../../lib/site';
import { todayIso } from '../../lib/date';
import type { CorrespondenceEntry, UserRole } from '../../types';
import { MoreRows } from '../ui/MoreRows';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

/** Mirrors app.can_keep_correspondence(). */
const KEEPERS: UserRole[] = ['admin', 'project_director', 'trustee', 'board_director'];

export const CorrespondencePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const PAGE = 25;
  const [limit, setLimit] = React.useState(25);
  const letters = useCorrespondence(limit);
  const unconfirmedCount = useUnconfirmedOutgoing();
  const documents = useDocumentOptions();
  const authority = useAuthority();
  const add = useAddCorrespondence();
  const confirm = useConfirmDelivery();

  const mayKeep = actsAs(authority.data, ...KEEPERS);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [form, setForm] = useState<{
    direction: CorrespondenceEntry['direction'];
    route: CorrespondenceEntry['route'];
    subjectEn: string;
    sentOn: string;
    counterpartyName: string;
    referenceNo: string;
    documentId: string;
  }>({
    direction: 'outgoing',
    route: 'letter',
    subjectEn: '',
    sentOn: todayIso(),
    counterpartyName: '',
    referenceNo: '',
    documentId: '',
  });

  const rows = letters.data?.rows ?? [];
  // Kütüğün tamamından sayılıyor; dilimin içinden saymak az gösterirdi.
  const unconfirmed = unconfirmedCount.data ?? 0;
  // Bir ekran dolusu için tek okuma (M13-21).
  const origins = useRecordOrigins(rows.map((r) => r.id));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Resmî yazışma kütüğü' : 'Official correspondence'}
            </h2>
            <p className="max-w-2xl text-xs text-slate-500">
              {tr
                ? 'Ne gönderildi, ne zaman, hangi yolla, eki ne ve ulaştığı teyit edildi mi. Postaya verilip cevapsız kalan bir yazı ile alındığı teyit edilen bir yazı farklı iki olgudur.'
                : 'What was sent, when, by what route, with what attached, and whether delivery was ever confirmed. A letter posted and unanswered is a different fact from one acknowledged.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unconfirmed > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              {tr ? `${unconfirmed} teyitsiz` : `${unconfirmed} unconfirmed`}
            </Pill>
          )}
          {mayKeep && !adding && (
            <ActionButton onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Yazı kaydet' : 'Record a letter'}
            </ActionButton>
          )}
        </div>
      </header>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.subjectEn.trim() || !form.counterpartyName.trim()) return;
            add.mutate(
              {
                direction: form.direction,
                route: form.route,
                subjectEn: form.subjectEn,
                sentOn: form.sentOn,
                counterpartyName: form.counterpartyName,
                referenceNo: form.referenceNo,
                documentId: form.documentId || null,
              },
              { onSuccess: () => setAdding(false) },
            );
          }}
          className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3"
        >
          <Field label={tr ? 'Yön' : 'Direction'}>
            <Select
              value={form.direction}
              onChange={(e) =>
                setForm({ ...form, direction: e.target.value as CorrespondenceEntry['direction'] })
              }
            >
              <option value="outgoing">{tr ? 'Giden' : 'Outgoing'}</option>
              <option value="incoming">{tr ? 'Gelen' : 'Incoming'}</option>
            </Select>
          </Field>
          <Field label={tr ? 'Yol' : 'Route'}>
            <Select
              value={form.route}
              onChange={(e) =>
                setForm({ ...form, route: e.target.value as CorrespondenceEntry['route'] })
              }
            >
              {ROUTES.map((r) => (
                <option key={r.key} value={r.key}>
                  {tr ? r.tr : r.en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Tarih' : 'Date'}>
            <TextInput
              type="date"
              value={form.sentOn}
              onChange={(e) => setForm({ ...form, sentOn: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Konu' : 'Subject'} className="sm:col-span-2">
            <TextInput
              value={form.subjectEn}
              onChange={(e) => setForm({ ...form, subjectEn: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Referans no' : 'Reference'}>
            <TextInput
              value={form.referenceNo}
              onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
              placeholder="OUT-2026-004"
            />
          </Field>
          <Field label={tr ? 'Muhatap' : 'Counterparty'}>
            <TextInput
              value={form.counterpartyName}
              onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Yazının kendisi (kasadan)' : 'The letter itself (from the vault)'}>
            <Select
              value={form.documentId}
              onChange={(e) => setForm({ ...form, documentId: e.target.value })}
            >
              <option value="">{tr ? 'seçin…' : 'choose…'}</option>
              {(documents.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-2 sm:col-span-3">
            <ActionButton type="submit" disabled={add.isPending}>
              {tr ? 'Kütüğe işle' : 'Add to the register'}
            </ActionButton>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="cursor-pointer text-xs text-slate-500 underline"
            >
              {tr ? 'vazgeç' : 'cancel'}
            </button>
            <div className="flex-1">
              <WriteError error={add.error} />
            </div>
          </div>
          {form.direction === 'outgoing' && (
            <p className="text-xs text-amber-800 sm:col-span-3">
              {tr
                ? 'Giden yazı, yazının kendisiyle birlikte kaydedilir. Eki olmayan bir yazışma kütüğü, iddialar listesidir.'
                : 'An outgoing letter is filed with the letter. A register of letters whose letters are missing is a list of assertions.'}
            </p>
          )}
        </form>
      )}

      <QueryStatus queries={[letters]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Kayıtlı resmî yazı yok. Bakanlığa gönderilen bir yazının ne zaman gittiği ve ulaşıp ulaşmadığı, altı ay sonra yalnızca buradan bilinebilir.'
            : 'No official letter is recorded. When a letter went to the Ministry, and whether it ever arrived, is knowable six months later only from here.'}
        </p>
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>{tr ? 'Konu' : 'Subject'}</Th>
              <Th>{tr ? 'Muhatap' : 'Counterparty'}</Th>
              <Th>{tr ? 'Yol' : 'Route'}</Th>
              <Th>{tr ? 'Tarih' : 'Sent'}</Th>
              <Th>{tr ? 'Teslim' : 'Delivery'}</Th>
            </tr>
          }
        >
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <Td>
                {row.referenceNo && (
                  <span className="mr-1.5 font-mono text-xs text-slate-500">{row.referenceNo}</span>
                )}
                <span className="text-sm text-slate-900">
                  {(tr ? row.subjectTr : row.subjectEn) ?? row.subjectEn}
                </span>
                <RecordOrigin origin={origins.of(row.id)} />
                {row.documentId ? (
                  <Pill className="ml-1.5 border-emerald-300 bg-emerald-50 text-emerald-900">
                    <FileCheck2 className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                    {tr ? 'kasada' : 'in the vault'}
                  </Pill>
                ) : (
                  <Pill className="ml-1.5 border-slate-300 bg-slate-100 text-slate-600">
                    {tr ? 'eksiz' : 'no attachment'}
                  </Pill>
                )}
              </Td>
              <Td>
                <span className="text-xs text-slate-700">
                  {row.counterparty ?? (tr ? '(adsız)' : '(unnamed)')}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-slate-600">{routeName(row.route, tr)}</span>
              </Td>
              <Td>
                <span className="font-mono text-xs text-slate-600">
                  {formatDate(row.sentOn, language)}
                </span>
              </Td>
              <Td>
                {row.deliveryConfirmedOn ? (
                  <span className="text-xs text-emerald-800">
                    {tr ? 'teyitli ' : 'confirmed '}
                    {formatDate(row.deliveryConfirmedOn, language)}
                  </span>
                ) : confirming === row.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      confirm.mutate(
                        {
                          id: row.id,
                          confirmedOn: todayIso(),
                          evidenceDocumentId: evidence || null,
                          note,
                        },
                        {
                          onSuccess: () => {
                            setConfirming(null);
                            setNote('');
                            setEvidence('');
                          },
                        },
                      );
                    }}
                    className="space-y-1"
                  >
                    <Select value={evidence} onChange={(e) => setEvidence(e.target.value)}>
                      <option value="">{tr ? 'teyit belgesi yok' : 'no receipt'}</option>
                      {(documents.data ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </Select>
                    <TextInput
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={tr ? 'veya nasıl teyit edildi' : 'or how it was confirmed'}
                    />
                    <ActionButton type="submit" disabled={confirm.isPending}>
                      {tr ? 'Teyidi işle' : 'Record it'}
                    </ActionButton>
                  </form>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-800">
                    <MailQuestion className="h-3 w-3" aria-hidden="true" />
                    {tr ? 'teyit edilmedi' : 'not confirmed'}
                    {mayKeep && (
                      <button
                        type="button"
                        onClick={() => setConfirming(row.id)}
                        className="cursor-pointer underline"
                      >
                        {tr ? 'teyit et' : 'confirm'}
                      </button>
                    )}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </TableFrame>
      )}
      <MoreRows
        shown={(letters.data?.rows ?? []).length}
        total={letters.data?.total ?? 0}
        onMore={() => setLimit(limit + PAGE)}
        busy={letters.isFetching}
      />
      <WriteError error={confirm.error} />
    </section>
  );
};
