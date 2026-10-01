/**
 * The trustee register (M10-01).
 *
 * Two things this does that the screen it replaces did not. It records who
 * appointed each trustee and when their term ends, so a seat about to fall
 * vacant is visible before it does. And the identity document is a reference
 * into the vault rather than a number in a column — the old register kept a
 * national identity number as plain text, readable by every internal role and
 * searchable from the old search box, which is a liability with no use. What
 * a registrar asks for is the document, and the vault logs who opens it.
 *
 * Standing somebody down asks for the date, because the database insists on
 * it: an undated vacancy quietly changes every quorum computed over the
 * register.
 */
import React, { useState } from 'react';
import { CalendarClock, FileBadge, Plus, UserMinus, Users2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAddTrustee, useStandDownTrustee, useTrusteeRegister } from '../../api/governanceHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, TextInput, WriteError } from '../ui/Controls';
import { GOVERNANCE_KEEPERS, actsAs } from '../../lib/authority';
import { formatDate } from '../../lib/site';
import { todayIso } from '../../lib/date';

/** How close to the end of a term counts as worth flagging. */
const TERM_WARNING_DAYS = 120;

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export const TrusteeRegister: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const register = useTrusteeRegister();
  const authority = useAuthority();
  const add = useAddTrustee();
  const standDown = useStandDownTrustee();

  const mayKeep = actsAs(authority.data, ...GOVERNANCE_KEEPERS);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    appointingBody: '',
    appointedOn: '',
    termEndsOn: '',
    seatEn: '',
    email: '',
  });
  const [standingDown, setStandingDown] = useState<string | null>(null);
  const [standDownOn, setStandDownOn] = useState(todayIso());

  const rows = register.data ?? [];
  const serving = rows.filter((t) => t.active);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.appointingBody.trim()) return;
    add.mutate(form, {
      onSuccess: () => {
        setForm({
          fullName: '',
          appointingBody: '',
          appointedOn: '',
          termEndsOn: '',
          seatEn: '',
          email: '',
        });
        setAdding(false);
      },
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Users2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {tr ? 'Mütevelli kütüğü' : 'Trustee register'}
            </h2>
            <p className="text-[11px] text-slate-500">
              {tr
                ? 'Kim, kim tarafından atandı, görev süresi ne zaman doluyor. Kimlik belgesi kasada tutuluyor — numarası hiçbir yerde yazılı değil.'
                : 'Who, appointed by whom, and when the term runs out. The identity document lives in the vault; the number is written down nowhere.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill>
            {serving.length} {tr ? 'görevde' : 'serving'}
          </Pill>
          {mayKeep && !adding && (
            <ActionButton onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Mütevelli ekle' : 'Add a trustee'}
            </ActionButton>
          )}
        </div>
      </header>

      {adding && (
        <form
          onSubmit={submit}
          className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
        >
          <Field label={tr ? 'Ad soyad' : 'Full name'}>
            <TextInput
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Atayan kurum' : 'Appointing body'}>
            <TextInput
              value={form.appointingBody}
              onChange={(e) => setForm({ ...form, appointingBody: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Atama tarihi' : 'Appointed on'}>
            <TextInput
              type="date"
              value={form.appointedOn}
              onChange={(e) => setForm({ ...form, appointedOn: e.target.value })}
            />
          </Field>
          <Field label={tr ? 'Görev süresi sonu' : 'Term ends'}>
            <TextInput
              type="date"
              value={form.termEndsOn}
              onChange={(e) => setForm({ ...form, termEndsOn: e.target.value })}
            />
          </Field>
          <Field label={tr ? 'Görev' : 'Seat'}>
            <TextInput
              value={form.seatEn}
              onChange={(e) => setForm({ ...form, seatEn: e.target.value })}
              placeholder={tr ? 'Başkan, üye…' : 'Chair, member…'}
            />
          </Field>
          <Field label={tr ? 'E-posta' : 'Email'}>
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <ActionButton type="submit" disabled={add.isPending}>
              {tr ? 'Kütüğe ekle' : 'Add to the register'}
            </ActionButton>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="cursor-pointer text-[11px] text-slate-500 underline"
            >
              {tr ? 'vazgeç' : 'cancel'}
            </button>
          </div>
          <div className="sm:col-span-2">
            <WriteError error={add.error} />
          </div>
        </form>
      )}

      <QueryStatus queries={[register]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {tr
            ? 'Kütük boş. Bu, mütevelli olmadığı anlamına gelmiyor — kimse girmemiş anlamına geliyor, ki nisap hesabı da bu yüzden yapılamıyor.'
            : 'The register is empty. That does not mean there are no trustees; it means nobody has entered them, which is also why no quorum can be computed.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((trustee) => {
            const left = daysUntil(trustee.termEndsOn);
            const ending = trustee.active && left != null && left <= TERM_WARNING_DAYS;
            return (
              <li key={trustee.id} className="py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-xs font-medium ${
                          trustee.active ? 'text-slate-900' : 'text-slate-400 line-through'
                        }`}
                      >
                        {trustee.fullName}
                      </span>
                      {(tr ? trustee.seatTr : trustee.seatEn) && (
                        <Pill>{tr ? trustee.seatTr : trustee.seatEn}</Pill>
                      )}
                      {trustee.identityDocumentId ? (
                        <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
                          <FileBadge className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                          {tr ? 'kimlik kasada' : 'ID on file'}
                        </Pill>
                      ) : (
                        <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                          {tr ? 'kimlik belgesi yok' : 'no ID document'}
                        </Pill>
                      )}
                      {!trustee.active && (
                        <Pill className="border-slate-300 bg-slate-100 text-slate-600">
                          {tr ? 'ayrıldı ' : 'stood down '}
                          {trustee.stoodDownOn && formatDate(trustee.stoodDownOn, language)}
                        </Pill>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {trustee.appointingBody}
                      {trustee.appointedOn
                        ? ` · ${tr ? 'atandı ' : 'from '}${formatDate(trustee.appointedOn, language)}`
                        : ''}
                      {trustee.termEndsOn
                        ? ` → ${formatDate(trustee.termEndsOn, language)}`
                        : ` · ${tr ? 'süre kayıtlı değil' : 'no term recorded'}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {ending && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? `${left} gün kaldı` : `${left}d left`}
                      </span>
                    )}
                    {mayKeep && trustee.active && standingDown !== trustee.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setStandingDown(trustee.id);
                          setStandDownOn(todayIso());
                        }}
                        className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-500 hover:text-rose-700"
                      >
                        <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? 'görevden ayır' : 'stand down'}
                      </button>
                    )}
                  </div>
                </div>

                {standingDown === trustee.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      standDown.mutate(
                        { id: trustee.id, on: standDownOn },
                        { onSuccess: () => setStandingDown(null) },
                      );
                    }}
                    className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2"
                  >
                    {/* The date is not optional in the database. An undated
                        vacancy changes the quorum on every past sitting
                        without saying when it changed. */}
                    <Field label={tr ? 'Ayrılma tarihi' : 'Stood down on'}>
                      <TextInput
                        type="date"
                        value={standDownOn}
                        onChange={(e) => setStandDownOn(e.target.value)}
                        required
                      />
                    </Field>
                    <ActionButton type="submit" disabled={standDown.isPending}>
                      {tr ? 'Kaydet' : 'Record it'}
                    </ActionButton>
                    <button
                      type="button"
                      onClick={() => setStandingDown(null)}
                      className="cursor-pointer pb-1 text-[11px] text-slate-500 underline"
                    >
                      {tr ? 'vazgeç' : 'cancel'}
                    </button>
                    <div className="w-full">
                      <WriteError error={standDown.error} />
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
