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
import { CalendarClock, FileBadge, Plus, Trash2, UserMinus, Users2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useAddTrustee,
  useDeleteTrustee,
  useStandDownTrustee,
  useTrusteeRegister,
} from '../../api/governanceHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, TextInput, WriteError } from '../ui/Controls';
import { GOVERNANCE_KEEPERS, actsAs } from '../../lib/authority';
import { formatDate } from '../../lib/site';
import { bilingual } from '../../lib/meetings';
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
  const remove = useDeleteTrustee();

  const mayKeep = actsAs(authority.data, ...GOVERNANCE_KEEPERS);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    appointingBody: '',
    appointedOn: '',
    termEndsOn: '',
    seat: '',
    email: '',
  });
  const [standingDown, setStandingDown] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [standDownOn, setStandDownOn] = useState(todayIso());

  const rows = register.data ?? [];
  const serving = rows.filter((t) => t.active);
  // Görevde kayıtlı olup süresi dolmuş olanlar. Başlıkta duruyor çünkü nisap
  // bu koltuklardan hesaplanıyor; sayı sıfır değilse kurulun geçerliliği
  // hakkında sorulacak bir soru var.
  const lapsed = serving.filter((t) => {
    const left = daysUntil(t.termEndsOn);
    return left != null && left < 0;
  }).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.appointingBody.trim()) return;
    // The language matters: the seat lands in the column it is actually
    // written in, so the list can show it instead of reading an empty
    // seat_tr and printing nothing.
    add.mutate(
      { ...form, seatLanguage: language },
      {
        onSuccess: () => {
          setForm({
            fullName: '',
            appointingBody: '',
            appointedOn: '',
            termEndsOn: '',
            seat: '',
            email: '',
          });
          setAdding(false);
        },
      },
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Users2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Mütevelli kütüğü' : 'Trustee register'}
            </h2>
            <p className="text-sm text-slate-500">
              {tr
                ? 'Kim, kim tarafından atandı, görev süresi ne zaman doluyor.'
                : 'Who, appointed by whom, and when the term runs out.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill>
            {serving.length} {tr ? 'görevde' : 'serving'}
          </Pill>
          {lapsed > 0 && (
            <Pill className="border-rose-300 bg-rose-50 text-rose-900">
              {tr ? `${lapsed} süresi dolmuş` : `${lapsed} with a lapsed term`}
            </Pill>
          )}
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
              value={form.seat}
              onChange={(e) => setForm({ ...form, seat: e.target.value })}
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
              className="cursor-pointer text-xs text-slate-500 underline"
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
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {tr
            ? 'Kütük boş. Bu, mütevelli olmadığı anlamına gelmiyor — kimse girmemiş anlamına geliyor, ki nisap hesabı da bu yüzden yapılamıyor.'
            : 'The register is empty. That does not mean there are no trustees; it means nobody has entered them, which is also why no quorum can be computed.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((trustee) => {
            const left = daysUntil(trustee.termEndsOn);
            // İşaretin kendisi kusurdu: süresi dolmuş bir mütevelli için
            // `left` negatif ve ekran "−200 gün kaldı" yazıyordu — hem
            // anlamsız hem de **zaman varmış gibi** okunuyor. Kilometre taşı
            // panelinin yorumunun söylediği şey: işaretli bir sayı yanlış
            // okunur, "200 gün önce doldu" okunmaz.
            const expired = trustee.active && left != null && left < 0;
            const ending = trustee.active && left != null && left >= 0 && left <= TERM_WARNING_DAYS;
            return (
              <li key={trustee.id} className="py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-sm font-medium ${
                          trustee.active ? 'text-slate-900' : 'text-slate-500 line-through'
                        }`}
                      >
                        {trustee.fullName}
                      </span>
                      {/* bilingual() prefers the reader's language and falls
                          back to the other rather than showing nothing. Read
                          directly as `tr ? seatTr : seatEn` this printed no
                          seat at all for a seat typed in the other language,
                          which is how a recorded fact looked like a missing
                          one. */}
                      {bilingual(trustee.seatEn, trustee.seatTr, language) && (
                        <Pill>{bilingual(trustee.seatEn, trustee.seatTr, language)}</Pill>
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
                    <p className="mt-0.5 text-sm text-slate-500">
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
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? `${left} gün kaldı` : `${left}d left`}
                      </span>
                    )}
                    {/* Süresi dolmuş ama hâlâ görevde kayıtlı. Bu bir kusur
                        değil, birinin önüne konması gereken bir soru: nisap
                        tutulan koltuklardan hesaplanıyor, ve süresi dolmuş bir
                        koltuk en azından sorulmayı hak ediyor (CLAUDE.md §2). */}
                    {expired && left != null && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-rose-700">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr
                          ? `görev süresi ${-left} gün önce doldu, hâlâ görevde kayıtlı`
                          : `term ended ${-left} days ago, still recorded as serving`}
                      </span>
                    )}
                    {mayKeep && trustee.active && standingDown !== trustee.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setStandingDown(trustee.id);
                          setStandDownOn(todayIso());
                        }}
                        className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:text-rose-700"
                      >
                        <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? 'görevden ayır' : 'stand down'}
                      </button>
                    )}
                    {/* A different act, and labelled as one. Standing somebody
                        down says a person served and left; a record entered by
                        mistake needs the opposite statement. The database
                        decides who may and which rows can (0046), and
                        `mayDelete` is that answer rather than this screen's
                        guess. */}
                    {trustee.mayDelete && removing !== trustee.id && (
                      <button
                        type="button"
                        onClick={() => setRemoving(trustee.id)}
                        className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? 'kaydı sil' : 'delete the record'}
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
                      className="cursor-pointer pb-1 text-xs text-slate-500 underline"
                    >
                      {tr ? 'vazgeç' : 'cancel'}
                    </button>
                    <div className="w-full">
                      <WriteError error={standDown.error} />
                    </div>
                  </form>
                )}

                {removing === trustee.id && (
                  <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2">
                    <p className="text-sm text-rose-900">
                      {tr
                        ? 'Bu kaydı tamamen siler. Görevden ayırmaktan farklı: ayırmak, bir kişinin görev yapıp ayrıldığını söyler. Silmek, kaydın hiç olmaması gerektiğini söyler — yanlış girilmiş bir satır için doğru olan budur.'
                        : 'This removes the record outright. Not the same as standing somebody down, which says a person served and left; deleting says the record should never have existed, which is the true statement about a mistaken entry.'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {tr
                        ? 'Denetim kaydı kalır: bu portalda denetim izi silinmez.'
                        : 'The audit trail keeps it: an audit trail is not something this portal deletes.'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ActionButton
                        onClick={() =>
                          remove.mutate(trustee.id, { onSuccess: () => setRemoving(null) })
                        }
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? `${trustee.fullName} kaydını sil` : `Delete ${trustee.fullName}`}
                      </ActionButton>
                      <button
                        type="button"
                        onClick={() => setRemoving(null)}
                        className="cursor-pointer text-xs text-slate-500 underline"
                      >
                        {tr ? 'vazgeç' : 'cancel'}
                      </button>
                    </div>
                    <WriteError error={remove.error} />
                  </div>
                )}

                {/* Why the control is absent, for the case where it is absent
                    because of the record rather than because of the reader.
                    "No delete button" with no reason is the dead end that sent
                    somebody to stand down a trustee who never served. */}
                {/* Not gated on the reader's authority. "This trustee
                    appears in the record" is a fact about the trustee, useful
                    to anybody reading the register, and it is also the answer
                    to the dead end that sent somebody to stand down a trustee
                    who never served. Gated on mayKeep it was invisible to the
                    reader most likely to be looking for it. */}
                {trustee.onTheRecord && (
                  <p className="mt-1 text-sm text-slate-500">
                    {tr
                      ? 'Bu mütevelli kayıtlarda geçiyor (organ koltuğu, çıkar beyanı ya da senet atfı), o yüzden silinemez — geçmiş bir oturumun nisabını da götürürdü. Görevden ayırmak doğru olan.'
                      : 'This trustee appears in the record — a seat, a declared interest or a deed citation — so they cannot be deleted: it would take a past sitting’s quorum with them. Standing them down is the right act.'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
