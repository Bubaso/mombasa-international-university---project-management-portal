/**
 * The five-by-five (M6-08).
 *
 * Banded rather than shaded continuously: a gradient invites reading a
 * twelve as meaningfully worse than an eleven, and the bands are where the
 * decisions actually change — carried, watched, or the trustees are told.
 *
 * Empty cells are drawn. A grid with holes in it reads as missing data; one
 * with zeros reads as a project nobody has put a risk in that corner of,
 * which is a different and more useful thing to notice.
 */
import React from 'react';
import { Grid3x3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useRiskMatrix } from '../../api/raidHooks';
import { QueryStatus } from '../QueryStatus';
import { scoreBand, scoreBandLabel } from '../../lib/raid';

export const RiskMatrix: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const matrix = useRiskMatrix();

  const cells = matrix.data ?? [];
  if (cells.length === 0) {
    return <QueryStatus queries={[matrix]} />;
  }

  const at = (likelihood: number, impact: number) =>
    cells.find((c) => c.likelihood === likelihood && c.impact === impact)?.riskCount ?? 0;

  const total = cells.reduce((acc, c) => acc + c.riskCount, 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <Grid3x3 className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Risk matrisi' : 'Risk matrix'}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {(['low', 'medium', 'high'] as const).map((key) => (
            <span key={key} className="flex items-center gap-1">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-sm ${
                  scoreBand(key === 'high' ? 20 : key === 'medium' ? 10 : 4).className
                }`}
              />
              {scoreBandLabel(key, language)}
            </span>
          ))}
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="text-center text-[11px]">
          <caption className="sr-only">
            {tr ? 'Olasılığa ve etkiye göre açık riskler' : 'Open risks by likelihood and impact'}
          </caption>
          <thead>
            <tr>
              <th className="p-1 text-right font-medium text-slate-500">
                {tr ? 'Olasılık ↓' : 'Likelihood ↓'}
              </th>
              {[1, 2, 3, 4, 5].map((impact) => (
                <th key={impact} className="w-14 p-1 font-medium text-slate-500">
                  {impact}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[5, 4, 3, 2, 1].map((likelihood) => (
              <tr key={likelihood}>
                <th className="p-1 text-right font-medium text-slate-500">{likelihood}</th>
                {[1, 2, 3, 4, 5].map((impact) => {
                  const count = at(likelihood, impact);
                  const band = scoreBand(likelihood * impact);
                  return (
                    <td key={impact} className="p-0.5">
                      <div
                        className={`flex h-9 items-center justify-center rounded font-mono font-semibold ${band.className} ${
                          count === 0 ? 'opacity-40' : ''
                        }`}
                        title={
                          tr
                            ? `Olasılık ${likelihood}, etki ${impact} — skor ${likelihood * impact}`
                            : `Likelihood ${likelihood}, impact ${impact} — score ${likelihood * impact}`
                        }
                      >
                        {count}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        {tr
          ? `${total} açık risk. Yatay eksen etki, dikey eksen olasılık; skor ikisinin çarpımı.`
          : `${total} open risks. Impact across, likelihood down; the score is the product.`}
      </p>
    </section>
  );
};
