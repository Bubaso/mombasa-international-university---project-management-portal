/**
 * Obligations with a number attached (M10-09, M10-10).
 *
 * The twenty per cent full-scholarship undertaking and the campus mosque are
 * both lease-derived duties with a quantity, so they use one mechanism rather
 * than two bespoke screens — and so will whatever the next lease clause turns
 * out to require.
 *
 * Two nulls to respect on the way through. A target nobody has set shows as
 * "no target recorded" rather than nought per cent, because nought per cent
 * is a judgement about performance and "not established" is a gap in the
 * record. And every figure here rests on an evidenced entry: the database
 * will not accept an achievement without a document, for the same reason M7
 * will not accept site progress without one.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins, Target } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useObligationProgress } from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { formatDate } from '../../lib/site';

export const TargetPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const progress = useObligationProgress();
  const rows = progress.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {tr ? 'Sayılı yükümlülükler' : 'Obligations with a number'}
          </h2>
          <p className="text-xs text-slate-500">
            {tr
              ? 'Burs taahhüdü, cami yükümlülüğü ve kira sözleşmesinden doğan diğerleri. Her rakam kasadaki bir belgeye dayanıyor — belgesiz kayıt kabul edilmiyor.'
              : 'The scholarship undertaking, the mosque, and whatever else the lease requires. Every figure rests on a document in the vault; an unevidenced entry is refused.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[progress]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Sayılı bir yükümlülük kaydedilmemiş. Kira sözleşmesindeki %20 tam burs ve kampüs camisi bu şekilde takip edilir.'
            : 'No quantified obligation is recorded. The lease’s twenty per cent full-scholarship share and the campus mosque are tracked this way.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const share = row.percentOfTarget;
            return (
              <li key={row.targetId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-900">
                        {(tr ? row.obligationTitleTr : row.obligationTitleEn) ??
                          row.obligationTitleEn}
                      </span>
                      <Pill>{row.source}</Pill>
                      {row.periodLabel && <Pill>{row.periodLabel}</Pill>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {(tr ? row.basisTr : row.basisEn) ?? row.basisEn}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      {row.dueOn && (
                        <span>
                          {tr ? 'vade ' : 'due '}
                          {formatDate(row.dueOn, language)}
                        </span>
                      )}
                      <span>
                        {row.records}{' '}
                        {tr
                          ? 'kanıtlı kayıt'
                          : row.records === 1
                            ? 'evidenced entry'
                            : 'evidenced entries'}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {row.targetValue == null ? (
                      <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                        {tr ? 'hedef kayıtlı değil' : 'no target recorded'}
                      </Pill>
                    ) : (
                      <>
                        <p className="font-mono text-base font-bold text-slate-900">
                          {row.achieved ?? 0}
                          <span className="text-slate-500">/{row.targetValue}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {row.unit}
                          {share != null && ` · ${share}%`}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {row.targetValue != null && (
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
                    role="img"
                    aria-label={`${row.achieved ?? 0} / ${row.targetValue} ${row.unit}`}
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(Number(share ?? 0), 100)}%` }}
                    />
                  </div>
                )}

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  {row.shortfall != null && row.shortfall > 0 && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                      <HandCoins className="h-3 w-3" aria-hidden="true" />
                      {tr
                        ? `${row.shortfall} ${row.unit} eksik`
                        : `${row.shortfall} ${row.unit} short`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate('/obligations')}
                    className="cursor-pointer text-xs text-indigo-700 hover:underline"
                  >
                    {tr ? 'yükümlülüğe git' : 'open the obligation'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
