/**
 * The risk register (M6-01, M6-02, M6-03, M6-05).
 *
 * Two things this screen refuses to let pass quietly.
 *
 * A risk with no trigger is marked. Without one nobody can tell you whether
 * it is happening, so it is not being managed — it is being worried about,
 * and the register exists to tell those apart.
 *
 * An unacknowledged escalation sits on the row in red. Crossing the threshold
 * is an event the database recorded; somebody has to have seen it, and until
 * they do the register says so rather than quietly carrying on.
 */
import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { ArrowUpRight, Bell, ChevronDown, ChevronUp, Plus, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as raid from '../../api/raidHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { ActionButton, Field, Pill, Section, Select, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import {
  ESCALATION_THRESHOLD,
  RISK_CATEGORIES,
  RISK_RESPONSES,
  riskCategoryLabel,
  riskResponseLabel,
  riskStateLabel,
  scoreBand,
} from '../../lib/raid';
import type { Risk, RiskCategory, RiskResponse } from '../../types';

interface Props {
  canKeep: boolean;
  canAcknowledge: boolean;
}

export const RiskList: React.FC<Props> = ({ canKeep, canAcknowledge }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const risks = raid.useRisks();
  const create = raid.useCreateRisk();

  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RiskCategory>('legal');
  const [likelihood, setLikelihood] = useState('3');
  const [impact, setImpact] = useState('3');
  const [trigger, setTrigger] = useState('');

  const rows = risks.data ?? [];
  const live = rows.filter((r) => r.state === 'open' || r.state === 'mitigating');
  const withoutTrigger = live.filter((r) => !r.triggerEn).length;

  return (
    <Section
      icon={ShieldAlert}
      title={tr ? 'Risk kütüğü' : 'Risk register'}
      subtitle={
        tr
          ? `Skor olasılık × etki. ${ESCALATION_THRESHOLD} ve üzeri mütevellilere gider ve bu bir olay olarak kaydedilir.`
          : `The score is likelihood × impact. ${ESCALATION_THRESHOLD} and above goes to the trustees, and that crossing is recorded as an event.`
      }
      whoMayUse={
        tr
          ? 'Kurum içi: yönetim, mütevelliler, saha ekibi.'
          : 'Inside the organisation: management, trustees, the site team.'
      }
      canUse={canKeep}
    >
      <QueryStatus queries={[risks]} />

      {withoutTrigger > 0 && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-amber-900">
            <span className="font-semibold">
              {tr
                ? `${withoutTrigger} riskin tetikleyicisi yazılmamış.`
                : `${withoutTrigger} live risks have no trigger written down.`}
            </span>{' '}
            {tr
              ? 'Tetikleyicisi olmayan bir risk izlenemez: gerçekleşip gerçekleşmediğini kimse söyleyemez. Yönetilen değil, endişe edilen bir şeydir.'
              : 'A risk with no trigger cannot be watched — nobody can tell you whether it is happening. It is something worried about rather than managed.'}
          </p>
        </div>
      )}

      {canKeep && (
        <div className="mb-3">
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(
                  {
                    titleEn: title,
                    category,
                    likelihood: Number(likelihood),
                    impact: Number(impact),
                    triggerEn: trigger.trim() || null,
                  },
                  { onSuccess: () => setAdding(false) },
                );
              }}
              className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <div className="flex flex-wrap gap-2">
                <Field label={tr ? 'Risk' : 'Risk'} className="min-w-[180px] flex-1">
                  <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label={tr ? 'Kategori' : 'Category'} className="min-w-[140px]">
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
                <Field label={tr ? 'Olasılık' : 'Likelihood'} className="w-24">
                  <Select value={likelihood} onChange={(e) => setLikelihood(e.target.value)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={tr ? 'Etki' : 'Impact'} className="w-24">
                  <Select value={impact} onChange={(e) => setImpact(e.target.value)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {/* Asked for on the way in, not as a field somebody might fill
                  later. A register full of untriggered risks is the failure
                  mode this module exists to avoid. */}
              <Field
                label={
                  tr
                    ? 'Tetikleyici — bu olursa risk gerçekleşiyor demektir'
                    : 'Trigger — if this happens, it is materialising'
                }
              >
                <TextInput value={trigger} onChange={(e) => setTrigger(e.target.value)} />
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
              <span>{tr ? 'Risk ekle' : 'Add a risk'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={tr ? 'Risk kütüğü boş' : 'The register is empty'}
          description={
            tr
              ? 'Hiç risk kaydedilmemiş — ya da bu kütük sizin görebileceğiniz bir şey değil. Kütük, ortaklar ve siyaset hakkında da konuştuğu için kurum içidir.'
              : 'Nothing recorded — or this register is not yours to see. It says things about partners and politics, so it stays inside.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((risk) => (
            <RiskRow
              key={risk.id}
              risk={risk}
              open={openId === risk.id}
              onToggle={() => setOpenId(openId === risk.id ? null : risk.id)}
              canKeep={canKeep}
              canAcknowledge={canAcknowledge}
            />
          ))}
        </ul>
      )}
    </Section>
  );
};

const RiskRow: React.FC<{
  risk: Risk;
  open: boolean;
  onToggle: () => void;
  canKeep: boolean;
  canAcknowledge: boolean;
}> = ({ risk, open, onToggle, canKeep, canAcknowledge }) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';

  const history = raid.useScoreHistory(open ? risk.id : null);
  const escalations = raid.useEscalations(open ? risk.id : null);
  const rescore = raid.useRescoreRisk();
  const setResponse = raid.useSetResponse();
  const materialise = raid.useMaterialiseRisk();
  const acknowledge = raid.useAcknowledgeEscalation();

  const [response, setResponseValue] = useState<RiskResponse | ''>(risk.response ?? '');
  const [plan, setPlan] = useState(risk.responsePlanEn ?? '');
  const [happened, setHappened] = useState('');
  const [showMaterialise, setShowMaterialise] = useState(false);

  const band = scoreBand(risk.score);

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-900">
              <Bilingual
                table="risks"
                id={risk.id}
                base="title"
                en={risk.titleEn}
                tr={risk.titleTr}
              />
            </span>
            <Pill>{riskCategoryLabel(risk.category, language)}</Pill>
            <Pill>{riskStateLabel(risk.state, language)}</Pill>
            {risk.openEscalations > 0 && (
              <Pill className="border-rose-300 bg-rose-100 text-rose-800">
                <span className="flex items-center gap-1">
                  <Bell className="h-3 w-3" aria-hidden="true" />
                  {tr ? 'görülmedi' : 'unacknowledged'}
                </span>
              </Pill>
            )}
            {!risk.triggerEn && (
              <Pill className="border-amber-300 bg-amber-100 text-amber-900">
                {tr ? 'tetikleyici yok' : 'no trigger'}
              </Pill>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
            {risk.ownerName ? (
              <span>{risk.ownerName}</span>
            ) : (
              <span className="text-amber-700">{tr ? 'sahipsiz' : 'unowned'}</span>
            )}
            {risk.response && <span>{riskResponseLabel(risk.response, language)}</span>}
            {risk.sourceAssumptionId && (
              <span>{tr ? 'çöken bir varsayımdan' : 'from a broken assumption'}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold ${band.className}`}
            title={
              tr ? `${risk.likelihood} × ${risk.impact}` : `${risk.likelihood} × ${risk.impact}`
            }
          >
            {risk.score}
          </span>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3 text-[11px]">
          {risk.triggerEn && (
            <p className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
              <span className="font-semibold">{tr ? 'Tetikleyici: ' : 'Trigger: '}</span>
              {risk.triggerEn}
            </p>
          )}

          <QueryStatus queries={[escalations]} />
          {(escalations.data ?? []).map((escalation) => (
            <div
              key={escalation.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${
                escalation.acknowledgedAt
                  ? 'border-slate-200 bg-white text-slate-600'
                  : 'border-rose-300 bg-rose-50 text-rose-900'
              }`}
            >
              <span>
                {tr
                  ? `Eşik aşıldı — skor ${escalation.score}, ${formatDate(escalation.escalatedAt, language)}`
                  : `Crossed the line at ${escalation.score}, ${formatDate(escalation.escalatedAt, language)}`}
                {escalation.acknowledgedAt && (
                  <span className="ml-1.5">
                    {tr ? '· görüldü: ' : '· seen by '}
                    {escalation.acknowledgedByName ?? '—'}
                  </span>
                )}
              </span>
              {canAcknowledge && !escalation.acknowledgedAt && user && (
                <ActionButton
                  onClick={() => acknowledge.mutate({ id: escalation.id, profileId: user.id })}
                  disabled={acknowledge.isPending}
                >
                  {tr ? 'Gördüm' : 'Acknowledge'}
                </ActionButton>
              )}
            </div>
          ))}
          <WriteError error={acknowledge.error} />

          {/* M6-09. The only question worth asking of a register. */}
          <QueryStatus queries={[history]} />
          {(history.data ?? []).length > 1 && (
            <div>
              <div className="mb-1 font-semibold text-slate-700">
                {tr ? 'Skorun seyri' : 'How the score moved'}
              </div>
              <ul className="space-y-0.5">
                {(history.data ?? []).slice(0, 5).map((change) => (
                  <li
                    key={change.id}
                    className="flex flex-wrap items-center gap-1.5 text-slate-600"
                  >
                    <span className="font-mono">
                      {change.fromScore != null ? `${change.fromScore} → ` : ''}
                      {change.toScore}
                    </span>
                    {change.fromScore != null && change.toScore > change.fromScore && (
                      <ArrowUpRight className="h-3 w-3 text-rose-600" aria-hidden="true" />
                    )}
                    <span className="text-slate-400">
                      {formatDate(change.changedAt, language)}
                      {change.changedByName && ` · ${change.changedByName}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canKeep && risk.state !== 'materialised' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <Field label={tr ? 'Olasılık' : 'Likelihood'} className="w-24">
                  <Select
                    value={String(risk.likelihood)}
                    onChange={(e) =>
                      rescore.mutate({
                        id: risk.id,
                        likelihood: Number(e.target.value),
                        impact: risk.impact,
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={tr ? 'Etki' : 'Impact'} className="w-24">
                  <Select
                    value={String(risk.impact)}
                    onChange={(e) =>
                      rescore.mutate({
                        id: risk.id,
                        likelihood: risk.likelihood,
                        impact: Number(e.target.value),
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <WriteError error={rescore.error} />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setResponse.mutate({
                    id: risk.id,
                    response: response === '' ? null : response,
                    planEn: plan.trim() || null,
                  });
                }}
                className="space-y-1.5"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={tr ? 'Tepki' : 'Response'} className="w-36">
                    <Select
                      value={response}
                      onChange={(e) => setResponseValue(e.target.value as RiskResponse | '')}
                    >
                      <option value="">{tr ? 'Seçilmedi' : 'Not chosen'}</option>
                      {RISK_RESPONSES.map((r) => (
                        <option key={r} value={r}>
                          {riskResponseLabel(r, language)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={tr ? 'Plan' : 'Plan'} className="min-w-[180px] flex-1">
                    <TextInput
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      placeholder={
                        response === 'accept'
                          ? tr
                            ? 'Kabul ediyorsanız neden? (zorunlu)'
                            : 'If you are accepting it, why? (required)'
                          : undefined
                      }
                    />
                  </Field>
                  <ActionButton type="submit" tone="primary" disabled={setResponse.isPending}>
                    {tr ? 'Kaydet' : 'Save'}
                  </ActionButton>
                </div>
                <WriteError error={setResponse.error} />
              </form>

              {/* M6-05. One click, and the trace is kept by the database. */}
              {showMaterialise ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    materialise.mutate(
                      { riskId: risk.id, detailEn: happened.trim() || null },
                      { onSuccess: () => setShowMaterialise(false) },
                    );
                  }}
                  className="space-y-1.5 rounded-md border border-rose-200 bg-white p-2"
                >
                  <Field label={tr ? 'Ne oldu?' : 'What happened?'}>
                    <TextInput value={happened} onChange={(e) => setHappened(e.target.value)} />
                  </Field>
                  <div className="flex gap-2">
                    <ActionButton type="submit" tone="danger" disabled={materialise.isPending}>
                      {tr ? 'Sorun olarak kaydet' : 'Record it as an issue'}
                    </ActionButton>
                    <ActionButton type="button" onClick={() => setShowMaterialise(false)}>
                      {tr ? 'Vazgeç' : 'Cancel'}
                    </ActionButton>
                  </div>
                  <WriteError error={materialise.error} />
                </form>
              ) : (
                <ActionButton onClick={() => setShowMaterialise(true)}>
                  {tr ? 'Bu gerçekleşti' : 'This has happened'}
                </ActionButton>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
};
