import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { ShieldCheck, Plus, ScrollText, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { useCaseOrders } from '../../api/hooks';
import { useCreateObligation, useObligations } from '../../api/obligationHooks';
import { todayIso } from '../../lib/date';
import { ORDER_STATE_STYLES, ORDER_STATE_VALUES, orderStateLabel } from '../../lib/legal';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { EmptyState } from '../EmptyState';
import type { LegalOrder, OrderState } from '../../types';

/**
 * Court orders, and the one thing that makes this register worth more than a
 * case summary: turning an order into obligations (M5-05, M2-05).
 *
 * An order is a paragraph until somebody says what it forbids and what it
 * requires. Those clauses are separate obligations with separate dates, and
 * once they are in the register the site work, the calendar and the
 * prohibition panel all know about them.
 */
export const OrderList: React.FC<{ caseId: string; canWrite: boolean; canOblige: boolean }> = ({
  caseId,
  canWrite,
  canOblige,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const orders = useCaseOrders(caseId);
  const obligations = useObligations();
  const setState = legal.useSetOrderState();
  const [adding, setAdding] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const rows = orders.data ?? [];

  const obligationsFrom = (orderId: string) =>
    (obligations.data ?? []).filter((o) => o.sourceLegalOrderId === orderId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Mahkeme kararları' : 'Court orders'}
          <Pill>{rows.length}</Pill>
        </h2>
        {canWrite && !adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{tr ? 'Karar ekle' : 'Add'}</span>
          </ActionButton>
        )}
      </header>

      <div className="space-y-2 p-4">
        {adding && <NewOrderForm caseId={caseId} onDone={() => setAdding(false)} />}

        {rows.length === 0 && !adding ? (
          <EmptyState
            icon={ShieldCheck}
            title={tr ? 'Kayıtlı karar yok' : 'No orders recorded'}
            description={
              tr
                ? 'Her mahkeme kararını girin, sonra neyi yasakladığını ve neyi emrettiğini yükümlülük olarak ayırın. Kütüğe girmeyen bir yasak, saha işi açılırken kimseyi uyarmaz.'
                : 'Record each order, then separate what it forbids from what it requires as obligations. A prohibition that is not in the register warns nobody when site work is opened.'
            }
          />
        ) : (
          rows.map((order) => {
            const derived = obligationsFrom(order.id);
            return (
              <article key={order.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {order.madeOn}
                      </span>
                      {order.referenceNo && <Pill>{order.referenceNo}</Pill>}
                      {order.madeBy && (
                        <span className="text-xs text-slate-500">{order.madeBy}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">
                      <Bilingual
                        table="legal_orders"
                        id={order.id}
                        base="text"
                        en={order.textEn}
                        tr={order.textTr}
                      />
                    </p>
                  </div>
                  <Pill className={ORDER_STATE_STYLES[order.state]}>
                    {orderStateLabel(order.state, language)}
                  </Pill>
                </div>

                {derived.length > 0 && (
                  <DerivedObligations orderId={order.id} count={derived.length} />
                )}

                <div className="mt-2 flex flex-wrap items-end gap-2">
                  {canWrite && (
                    <Field label={tr ? 'Durum' : 'State'}>
                      <Select
                        value={order.state}
                        disabled={setState.isPending}
                        onChange={(e) =>
                          setState.mutate({
                            id: order.id,
                            state: e.target.value as OrderState,
                          })
                        }
                        className="w-auto"
                      >
                        {ORDER_STATE_VALUES.map((s) => (
                          <option key={s} value={s}>
                            {orderStateLabel(s, language)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {canOblige && convertingId !== order.id && (
                    <ActionButton tone="primary" onClick={() => setConvertingId(order.id)}>
                      <ScrollText className="h-3 w-3" aria-hidden="true" />
                      <span>
                        {tr ? 'Bu karardan yükümlülük çıkar' : 'Turn this into an obligation'}
                      </span>
                    </ActionButton>
                  )}
                </div>

                {convertingId === order.id && (
                  <ConvertForm order={order} onDone={() => setConvertingId(null)} />
                )}
              </article>
            );
          })
        )}
        <WriteError error={setState.error} />
      </div>
    </section>
  );
};

const DerivedObligations: React.FC<{ orderId: string; count: number }> = ({ count }) => {
  const { language } = useApp();
  const navigate = useNavigate();
  const tr = language === 'tr';
  return (
    <button
      type="button"
      onClick={() => navigate('/obligations')}
      className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900"
    >
      <ScrollText className="h-3 w-3" aria-hidden="true" />
      {tr ? `Bu karardan doğan ${count} yükümlülük` : `${count} obligations created by this order`}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </button>
  );
};

/**
 * One clause at a time, because that is how an order reads: this sentence
 * forbids something, that one requires something, and they have different
 * dates and different people answerable for them.
 */
const ConvertForm: React.FC<{ order: LegalOrder; onDone: () => void }> = ({ order, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = useCreateObligation();

  const [title, setTitle] = useState('');
  const [prohibits, setProhibits] = useState(true);
  const [obligorName, setObligorName] = useState('AUTK');
  const [dueOn, setDueOn] = useState('');

  return (
    <form
      className="mt-2 space-y-2.5 rounded-lg border border-amber-300 bg-amber-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !obligorName.trim()) return;
        create.mutate(
          {
            titleEn: language === 'en' ? title.trim() : null,
            titleTr: language === 'tr' ? title.trim() : null,
            detailEn: null,
            source: 'court_order',
            sourceDocumentId: order.documentId,
            sourceLegalOrderId: order.id,
            sourceMeetingId: null,
            obligorName: obligorName.trim(),
            obligorStakeholderId: null,
            beneficiaryName: null,
            dueOn: dueOn || null,
            prohibits,
            confidentiality: order.confidentiality,
          },
          {
            onSuccess: () => {
              setTitle('');
              setDueOn('');
            },
          },
        );
      }}
    >
      <p className="text-xs leading-relaxed text-amber-900">
        {tr
          ? 'Kararın her maddesini ayrı ayrı girin: biri bir şeyi yasaklıyor, diğeri bir şeyi emrediyor olabilir ve tarihleri farklıdır. Yasak olarak işaretlenenler, çakışan bir saha işi açılmadan önce uyarı üretir.'
          : 'Enter each clause on its own: one may forbid something and another require something, on different dates. Anything marked as a prohibition warns before conflicting site work is opened.'}
      </p>

      <Field
        label={
          tr
            ? 'Bu madde neyi gerektiriyor ya da yasaklıyor'
            : 'What this clause requires or forbids'
        }
      >
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label={tr ? 'Yükümlü' : 'Owed by'}>
          <TextInput
            value={obligorName}
            onChange={(e) => setObligorName(e.target.value)}
            required
          />
        </Field>
        <Field label={tr ? 'Son tarih (varsa)' : 'Due by, if any'}>
          <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-amber-900">
          <input
            type="radio"
            checked={prohibits}
            onChange={() => setProhibits(true)}
            className="h-3 w-3 cursor-pointer accent-rose-600"
          />
          {tr ? 'Yasaklıyor' : 'It forbids something'}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-amber-900">
          <input
            type="radio"
            checked={!prohibits}
            onChange={() => setProhibits(false)}
            className="h-3 w-3 cursor-pointer accent-amber-600"
          />
          {tr ? 'Emrediyor' : 'It requires something'}
        </label>
      </div>

      <WriteError error={create.error} />

      <div className="flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={create.isPending}>
          {tr ? 'Bitti' : 'Done'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending}>
          {tr ? 'Kütüğe ekle ve devam et' : 'Add and keep going'}
        </ActionButton>
      </div>
    </form>
  );
};

const NewOrderForm: React.FC<{ caseId: string; onDone: () => void }> = ({ caseId, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = legal.useCreateOrder();

  const [madeOn, setMadeOn] = useState(todayIso);
  const [madeBy, setMadeBy] = useState('');
  const [reference, setReference] = useState('');
  const [text, setText] = useState('');

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        create.mutate(
          {
            legalCaseId: caseId,
            madeOn,
            madeBy: madeBy.trim() || null,
            referenceNo: reference.trim() || null,
            textEn: language === 'en' ? text.trim() : null,
            textTr: language === 'tr' ? text.trim() : null,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Karar tarihi' : 'Made on'}>
          <TextInput
            type="date"
            value={madeOn}
            onChange={(e) => setMadeOn(e.target.value)}
            required
          />
        </Field>
        <Field label={tr ? 'Veren' : 'Made by'}>
          <TextInput
            value={madeBy}
            onChange={(e) => setMadeBy(e.target.value)}
            placeholder={tr ? 'ELC Mombasa, Yargıtay…' : 'ELC Mombasa, Court of Appeal…'}
          />
        </Field>
        <Field label={tr ? 'Karar no' : 'Reference'}>
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <Field label={tr ? 'Karar metni' : 'What the order says'} className="mt-2.5">
        <TextInput value={text} onChange={(e) => setText(e.target.value)} required />
      </Field>

      <WriteError error={create.error} />

      <div className="mt-2 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={create.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending}>
          {tr ? 'Ekle' : 'Add'}
        </ActionButton>
      </div>
    </form>
  );
};
