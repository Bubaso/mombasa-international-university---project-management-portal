/**
 * Scenario and sensitivity analysis (M6-12).
 *
 * The thing a screen like this wants to show is a figure: these three risks
 * together cost fourteen months and three hundred million shillings. It
 * cannot, and the reason is in the data rather than in the arithmetic.
 * Likelihood and impact are ordinal scales from one to five — a 4 is not
 * twice a 2 — so they do not add across risks; and even if they were
 * probabilities, these risks are correlated and nothing records the
 * correlation, so multiplying them would understate every scenario by an
 * unknown amount. The screen says both of those in words, because a missing
 * number that is never explained reads as an oversight.
 *
 * What it shows instead is the thing a scenario is actually for: what these
 * risks have in common. Two resting on one assumption fail together. Two
 * mitigated by one action have one mitigation between them. Two blocking the
 * same work stop the same thing. Two owned by one person compete for the
 * same week. Every one of those is a recorded link, and none of them needs a
 * probability.
 */
import React, { useState } from 'react';
import { Layers, Link2, ShieldQuestion, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as raid from '../../api/raidHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, TextInput, WriteError } from '../ui/Controls';
import { Bilingual } from '../ui/Bilingual';
import { formatDate } from '../../lib/site';
import type { RiskScenario, ScenarioOverlap } from '../../types';

const OVERLAP_WORDS: Record<string, { tr: string; en: string }> = {
  assumption: { tr: 'aynı varsayıma dayanıyor', en: 'rest on the same assumption' },
  legal_case: { tr: 'aynı dosyadan çıkıyor', en: 'come out of the same case' },
  obligation: { tr: 'aynı yükümlülükten çıkıyor', en: 'come out of the same obligation' },
  owner: { tr: 'aynı kişinin üzerinde', en: 'sit with the same person' },
  mitigating_action: { tr: 'aynı aksiyonla azaltılıyor', en: 'are mitigated by the same action' },
  'blocks the same work': { tr: 'aynı işi durduruyor', en: 'block the same work' },
};

/** What the set does not know about itself, in the reader's words. */
function unknowns(scenario: RiskScenario, tr: boolean): string[] {
  const out: string[] = [];
  if (scenario.membersAlreadyMaterialised > 0)
    out.push(
      tr
        ? `${scenario.membersAlreadyMaterialised}'i zaten gerçekleşti — bu senaryo artık varsayım değil`
        : `${scenario.membersAlreadyMaterialised} of them has already happened — this is no longer hypothetical`,
    );
  if (scenario.membersWithoutATrigger > 0)
    out.push(
      tr
        ? `${scenario.membersWithoutATrigger}'inde tetikleyici kayıtlı değil — gerçekleşip gerçekleşmediği söylenemez`
        : `${scenario.membersWithoutATrigger} with no trigger recorded — nobody can tell whether it is happening`,
    );
  if (scenario.membersWithoutAResponse > 0)
    out.push(
      tr
        ? `${scenario.membersWithoutAResponse}'inde tepki kararı yok`
        : `${scenario.membersWithoutAResponse} with no response decided`,
    );
  if (scenario.membersWithoutAnOwner > 0)
    out.push(
      tr
        ? `${scenario.membersWithoutAnOwner}'inin sahibi yok`
        : `${scenario.membersWithoutAnOwner} with no owner`,
    );
  return out;
}

export const ScenarioList: React.FC<{ canKeep: boolean }> = ({ canKeep }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const scenarios = raid.useScenarios();
  const overlaps = raid.useScenarioOverlaps();
  const risks = raid.useRisks();
  const create = raid.useCreateScenario();

  const [nameEn, setNameEn] = useState('');
  const [rationaleEn, setRationaleEn] = useState('');
  const [horizonOn, setHorizonOn] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const rows = scenarios.data ?? [];
  const byScenario = new Map<string, ScenarioOverlap[]>();
  for (const overlap of overlaps.data ?? []) {
    const list = byScenario.get(overlap.scenarioId) ?? [];
    list.push(overlap);
    byScenario.set(overlap.scenarioId, list);
  }

  return (
    <div className="space-y-3">
      {/* Why there is no combined figure. Said once, at the top, because a
          missing number nobody explains reads as an oversight. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {tr
              ? 'Bu ekran birleşik bir skor ya da birleşik bir olasılık vermiyor, ve bu bir eksiklik değil. Olasılık ve etki birden beşe sıralı ölçekler — 4, 2’nin iki katı değil — bu yüzden riskler arasında toplanamazlar. Olasılık olsalardı bile bu riskler birbirinden bağımsız değil (erken muson ile saha güvenliği olayı aynı nedeni paylaşır) ve korelasyonu hiçbir yerde kayıtlı değil, dolayısıyla çarpmak her senaryoyu bilinmeyen bir miktarda eksik gösterirdi. Verilen şey: kümedeki en yüksek gerçek skor, ve risklerin neyi paylaştığı.'
              : 'This screen gives no combined score and no combined likelihood, and that is not an omission. Likelihood and impact are ordinal scales from one to five — a 4 is not twice a 2 — so they do not add across risks. Even as probabilities they would not be independent (an early monsoon and a site security incident share a cause) and the correlation is recorded nowhere, so multiplying would understate every scenario by an unknown amount. What is given instead: the highest real score in the set, and what the risks share.'}
          </span>
        </p>
      </div>

      {canKeep && (
        <form
          className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3"
          aria-label={tr ? 'Senaryo kur' : 'Build a scenario'}
          onSubmit={(event) => {
            event.preventDefault();
            if (nameEn.trim() === '' || rationaleEn.trim() === '') return;
            create.mutate(
              {
                nameEn: nameEn.trim(),
                rationaleEn: rationaleEn.trim(),
                horizonOn: horizonOn === '' ? null : horizonOn,
                riskIds: picked,
              },
              {
                onSuccess: () => {
                  setNameEn('');
                  setRationaleEn('');
                  setHorizonOn('');
                  setPicked([]);
                },
              },
            );
          }}
        >
          <Field label={tr ? 'Senaryo' : 'Scenario'}>
            <TextInput
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              placeholder={
                tr ? 'Yağış mevsiminde temyiz çöker' : 'The appeal collapses in the rains'
              }
              required
            />
          </Field>
          <Field label={tr ? 'Neden birlikte?' : 'Why together?'}>
            <TextInput
              value={rationaleEn}
              onChange={(event) => setRationaleEn(event.target.value)}
              placeholder={tr ? 'Aynı altı haftaya düşüyorlar' : 'They fall in the same six weeks'}
              required
            />
          </Field>
          <Field label={tr ? 'Ufuk (varsa)' : 'Horizon (if any)'}>
            <TextInput
              type="date"
              value={horizonOn}
              onChange={(event) => setHorizonOn(event.target.value)}
            />
          </Field>
          <div className="sm:col-span-3">
            <p className="mb-1 text-sm text-slate-500">
              {tr
                ? 'Birlikte gerçekleşebileceğini düşündüğünüz riskleri seçin. İki riskten azı senaryo değildir — kayıt bunu söyler, engellemez.'
                : 'Pick the risks you think could land together. Fewer than two is not a scenario — the register says so rather than refusing it.'}
            </p>
            <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
              {(risks.data ?? []).map((risk) => (
                <button
                  key={risk.id}
                  type="button"
                  onClick={() =>
                    setPicked((current) =>
                      current.includes(risk.id)
                        ? current.filter((id) => id !== risk.id)
                        : [...current, risk.id],
                    )
                  }
                  className={`cursor-pointer rounded-lg border px-2 py-1 text-xs ${
                    picked.includes(risk.id)
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {risk.titleEn} · {risk.score}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <ActionButton type="submit" disabled={create.isPending}>
                {tr ? 'Senaryoyu kur' : 'Build the scenario'}
              </ActionButton>
            </div>
            <WriteError error={create.error} />
          </div>
        </form>
      )}

      <QueryStatus queries={[scenarios, overlaps]} />

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tr
            ? 'Kayıtlı senaryo yok. Bu, risklerin birlikte gerçekleşmeyeceği anlamına gelmez — kimsenin hangilerinin birlikte geldiğini yazmadığı anlamına gelir.'
            : 'No scenario is recorded. That does not mean the risks will not land together — it means nobody has written down which ones do.'}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={tr ? 'Senaryolar' : 'Scenarios'}>
          {rows.map((scenario) => {
            const list = byScenario.get(scenario.scenarioId) ?? [];
            const gaps = unknowns(scenario, tr);
            return (
              <li
                key={scenario.scenarioId}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Layers className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <span className="text-sm font-semibold text-slate-900">
                    <Bilingual
                      table="risk_scenarios"
                      id={scenario.scenarioId}
                      base="name"
                      en={scenario.nameEn}
                      tr={scenario.nameTr}
                    />
                  </span>
                  {!scenario.isAScenario && (
                    <Pill className="border-slate-300 bg-slate-50 text-slate-600">
                      {tr
                        ? `${scenario.members} risk — iki riskten azı senaryo değil`
                        : `${scenario.members} risk — fewer than two is not a scenario`}
                    </Pill>
                  )}
                  {scenario.state === 'retired' && (
                    <Pill className="border-slate-300 bg-slate-50 text-slate-500">
                      {tr ? 'geri çekildi' : 'retired'}
                    </Pill>
                  )}
                  {scenario.horizonOn != null && (
                    <span className="text-xs text-slate-500">
                      {formatDate(scenario.horizonOn, language)}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  <Bilingual
                    table="risk_scenarios"
                    id={scenario.scenarioId}
                    base="rationale"
                    en={scenario.rationaleEn}
                    tr={scenario.rationaleTr}
                  />
                </p>

                <p className="mt-1.5 font-mono text-sm text-slate-700">
                  {tr ? 'kümedeki en yüksek gerçek skor ' : 'highest real score in the set '}
                  {scenario.worstRecordedScore ?? '—'}
                  {scenario.recordedScores.length > 0 && (
                    <span className="text-slate-500"> ({scenario.recordedScores.join(' · ')})</span>
                  )}
                </p>

                {scenario.membersRescoredUpwardLately > 0 && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-amber-800">
                    <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {tr
                      ? `${scenario.membersRescoredUpwardLately} risk son 180 günde yukarı yeniden puanlandı — duyarlılığın ölçülebilir yarısı bu`
                      : `${scenario.membersRescoredUpwardLately} of them was rescored upward in the last 180 days — this is the measurable half of sensitivity`}
                  </p>
                )}

                {/* The analysis. */}
                <div className="mt-2 border-t border-slate-200 pt-2">
                  <p className="mb-1 text-sm font-semibold tracking-wider text-slate-600 uppercase">
                    {tr ? 'Bu riskleri birlikte getiren şeyler' : 'What brings these together'}
                  </p>
                  {list.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {tr
                        ? 'Kayıtlı bir ortak bağ yok. Bu, bağımsız oldukları anlamına gelmez — portalda kayıtlı bir ortak bağ bulunmadığı anlamına gelir.'
                        : 'No shared link is recorded. That does not mean they are independent — it means no shared link is recorded in the portal.'}
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {list.map((overlap) => (
                        <li
                          key={`${overlap.kind}-${overlap.targetId ?? overlap.targetLabel ?? ''}`}
                          className="flex items-start gap-1.5 text-sm text-slate-700"
                        >
                          <Link2
                            className="mt-0.5 h-3 w-3 shrink-0 text-indigo-600"
                            aria-hidden="true"
                          />
                          <span>
                            <span className="font-medium">{overlap.risksReaching}</span>{' '}
                            {tr
                              ? (OVERLAP_WORDS[overlap.kind]?.tr ?? overlap.kind)
                              : (OVERLAP_WORDS[overlap.kind]?.en ?? overlap.kind)}
                            {overlap.targetLabel != null && (
                              <span className="text-slate-500"> · {overlap.targetLabel}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {gaps.length > 0 && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                    <p className="text-sm font-semibold text-amber-900">
                      {tr
                        ? 'Bu kümenin kendisi hakkında bilmedikleri'
                        : 'What the set does not know about itself'}
                    </p>
                    <ul className="mt-0.5 space-y-0.5 text-sm text-amber-900">
                      {gaps.map((line) => (
                        <li key={line}>· {line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
