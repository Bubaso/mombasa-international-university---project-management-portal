/**
 * The assumption register (M6-06).
 *
 * "The lease will remain valid." "The partner foundation will continue the
 * appeal." Nobody argues with an assumption nobody has stated, which is
 * exactly why the load-bearing ones go unexamined until they fail.
 *
 * Unverified is grey, not green. A register that showed "nobody has checked"
 * as fine would be defeating itself.
 *
 * Marking one broken raises a risk — and the interface says so before you do
 * it, because a control that quietly creates a second record somewhere else
 * is the kind of surprise that makes people stop trusting a system.
 */
import React, { useState } from 'react';
import { HelpCircle, Plus, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as raid from '../../api/raidHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { ActionButton, Field, Pill, Section, Select, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import {
  ASSUMPTION_STATES_LIST,
  RISK_CATEGORIES,
  assumptionStateLabel,
  assumptionStateStyle,
  riskCategoryLabel,
} from '../../lib/raid';
import type { AssumptionState, RiskCategory } from '../../types';

export const AssumptionList: React.FC<{ canKeep: boolean }> = ({ canKeep }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const assumptions = raid.useAssumptions();
  const create = raid.useCreateAssumption();
  const setState = raid.useSetAssumptionState();

  const [adding, setAdding] = useState(false);
  const [statement, setStatement] = useState('');
  const [category, setCategory] = useState<RiskCategory>('partnership');

  const rows = assumptions.data ?? [];
  const unchecked = rows.filter((a) => a.state === 'unverified').length;

  return (
    <Section
      icon={HelpCircle}
      title={tr ? 'Varsayım kütüğü' : 'Assumption register'}
      subtitle={
        tr
          ? 'Üzerine plan kurulan şeyler. Bir varsayım çöktüğünde veritabanı kendiliğinden risk açar — çünkü o an kimsenin risk kaydetmeye vakti olmaz.'
          : 'The things the plan rests on. When one collapses the database raises a risk by itself, because that is precisely the moment nobody has time to file one.'
      }
      whoMayUse={tr ? 'Kurum içi.' : 'Inside the organisation.'}
      canUse={canKeep}
    >
      <QueryStatus queries={[assumptions]} />

      {unchecked > 0 && (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          {tr
            ? `${unchecked} varsayımı kimse doğrulamamış. Doğrulanmamış bir varsayım yanlış demek değil — sadece kimsenin bakmadığı anlamına gelir.`
            : `${unchecked} have not been checked by anybody. Unverified does not mean wrong; it means nobody has looked.`}
        </p>
      )}

      {canKeep && (
        <div className="mb-3">
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(
                  { statementEn: statement, riskCategory: category },
                  { onSuccess: () => setAdding(false) },
                );
              }}
              className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <Field label={tr ? 'Varsayım' : 'Assumption'}>
                <TextInput
                  required
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  placeholder={
                    tr ? 'Örn: kira sözleşmesi geçerli kalacak' : 'e.g. the lease will remain valid'
                  }
                />
              </Field>
              {/* Asked for now so that the risk it becomes arrives classified
                  rather than as "other". */}
              <Field
                label={
                  tr ? 'Çökerse hangi tür risk doğar?' : 'If it fails, what kind of risk is that?'
                }
                className="w-48"
              >
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as RiskCategory)}
                >
                  {RISK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {riskCategoryLabel(c, language)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex gap-2">
                <ActionButton type="submit" tone="primary" disabled={create.isPending}>
                  {tr ? 'Ekle' : 'Add'}
                </ActionButton>
                <ActionButton type="button" onClick={() => setAdding(false)}>
                  {tr ? 'Vazgeç' : 'Cancel'}
                </ActionButton>
              </div>
              <WriteError error={create.error} />
            </form>
          ) : (
            <ActionButton tone="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Varsayım ekle' : 'Add an assumption'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title={tr ? 'Varsayım kaydedilmemiş' : 'No assumptions recorded'}
          description={
            tr
              ? 'Plan bir şeylerin doğru kalmasına dayanıyor; hangileri olduğunu yazmak, onları tartışılabilir kılmanın tek yolu.'
              : 'The plan rests on things staying true. Writing down which ones is the only way they become arguable.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((assumption) => (
            <li
              key={assumption.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-900">
                      {tr
                        ? (assumption.statementTr ?? assumption.statementEn)
                        : assumption.statementEn}
                    </span>
                    <Pill className={assumptionStateStyle(assumption.state)}>
                      {assumptionStateLabel(assumption.state, language)}
                    </Pill>
                    {assumption.raisedRiskId && (
                      <Pill className="border-rose-200 bg-rose-100 text-rose-800">
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" aria-hidden="true" />
                          {tr ? 'risk açıldı' : 'a risk was raised'}
                        </span>
                      </Pill>
                    )}
                  </div>
                  <div className="mt-0.5 text-slate-500">
                    {riskCategoryLabel(assumption.riskCategory, language)}
                    {assumption.ownerName && ` · ${assumption.ownerName}`}
                    {assumption.lastCheckedOn &&
                      ` · ${tr ? 'son bakılan ' : 'last checked '}${formatDate(assumption.lastCheckedOn, language)}`}
                  </div>
                </div>

                {canKeep && (
                  <Select
                    value={assumption.state}
                    onChange={(e) =>
                      setState.mutate({
                        id: assumption.id,
                        state: e.target.value as AssumptionState,
                        note: assumption.note,
                      })
                    }
                    className="w-auto shrink-0"
                    title={
                      tr
                        ? '"Çöktü" seçmek otomatik olarak bir risk açar.'
                        : 'Choosing "broken" raises a risk automatically.'
                    }
                  >
                    {ASSUMPTION_STATES_LIST.map((s) => (
                      <option key={s} value={s}>
                        {assumptionStateLabel(s, language)}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <WriteError error={setState.error} />
    </Section>
  );
};
