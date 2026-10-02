/**
 * Declared interests (M10-11).
 *
 * Anybody may declare their own, and that is the design: making this the
 * board's job to enter is how declarations stop being made. What the board
 * and the auditors get is the reading of it.
 *
 * These rows default to confidential and there is no admin-wide browse: an
 * outside auditor reaches them only through a per-record grant. An audit of
 * what colleagues have disclosed about their own affairs is something somebody
 * decides to hand over, not a standing subscription.
 */
import React, { useState } from 'react';
import { ShieldQuestion, UserRoundCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useConflicts, useDeclareInterest, useOrgans } from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';

export const ConflictPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const conflicts = useConflicts();
  const organs = useOrgans();
  const declare = useDeclareInterest();

  const [declaring, setDeclaring] = useState(false);
  const [interest, setInterest] = useState('');
  const [organId, setOrganId] = useState('');
  const [coversFrom, setCoversFrom] = useState('');

  const rows = conflicts.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Çıkar çatışması beyanları' : 'Declared interests'}
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Herkes kendi beyanını yapar; kütüğü okuyanlar heyet, yönetim ve denetim komitesi. Beyanlar varsayılan olarak gizli.'
                : 'Everybody makes their own; the board, the management and the audit committee read the register. Declarations are confidential by default.'}
            </p>
          </div>
        </div>
        {!declaring && (
          <ActionButton onClick={() => setDeclaring(true)}>
            <UserRoundCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {tr ? 'Beyan ver' : 'Declare an interest'}
          </ActionButton>
        )}
      </header>

      {declaring && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!interest.trim()) return;
            declare.mutate(
              { interestEn: interest, organId: organId || null, coversFrom: coversFrom || null },
              {
                onSuccess: () => {
                  setInterest('');
                  setOrganId('');
                  setCoversFrom('');
                  setDeclaring(false);
                },
              },
            );
          }}
          className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <Field label={tr ? 'Beyan edilen çıkar' : 'The interest'}>
            <TextInput
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder={
                tr
                  ? 'İhaleye giren firmalardan birinde yakınım yönetici…'
                  : 'A relative is a director of one of the tendering firms…'
              }
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={tr ? 'İlgili organ' : 'Organ it touches'}>
              <Select value={organId} onChange={(e) => setOrganId(e.target.value)}>
                <option value="">{tr ? '(belirtilmedi)' : '(not stated)'}</option>
                {(organs.data ?? []).map((organ) => (
                  <option key={organ.id} value={organ.id}>
                    {tr ? organ.nameTr : organ.nameEn}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Ne zamandan beri' : 'In force since'}>
              <TextInput
                type="date"
                value={coversFrom}
                onChange={(e) => setCoversFrom(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <ActionButton type="submit" disabled={declare.isPending}>
              {tr ? 'Beyanı kaydet' : 'Record the declaration'}
            </ActionButton>
            <button
              type="button"
              onClick={() => setDeclaring(false)}
              className="cursor-pointer text-xs text-slate-500 underline"
            >
              {tr ? 'vazgeç' : 'cancel'}
            </button>
          </div>
          <WriteError error={declare.error} />
        </form>
      )}

      <QueryStatus queries={[conflicts]} />

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">
          {tr
            ? 'Görmeye yetkili olduğunuz beyan yok. Kendi beyanlarınızı her zaman görürsünüz, dolayısıyla bu liste boşsa siz de beyan vermemişsiniz.'
            : 'No declaration you are cleared to read. Your own are always visible to you, so an empty list means you have not made one either.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">
                    {(tr ? row.interestTr : row.interestEn) ?? row.interestEn}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[
                      row.personName,
                      `${tr ? 'beyan ' : 'declared '}${formatDate(row.declaredOn, language)}`,
                      row.coversFrom
                        ? `${tr ? 'geçerli ' : 'from '}${formatDate(row.coversFrom, language)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {row.recusedFromDecisionId && (
                  <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
                    {tr ? 'oylamadan çekildi' : 'stood out of a vote'}
                  </Pill>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
