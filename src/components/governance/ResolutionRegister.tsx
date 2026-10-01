/**
 * The formal resolution register, and whether anybody carried them out
 * (M10-03, M10-04).
 *
 * The screen this replaces held three resolutions in a React useState — typed
 * into the component, one of them allocating "34.3M KShs" — with a status of
 * "Enacted" that nothing computed. So the column that matters most here is
 * the one that was impossible before: whether the resolution actually
 * happened, read off its action items.
 *
 * And the state worth looking at is "not turned into an action". A resolution
 * nobody has written an action against is not implemented, and it is not
 * outstanding either: nobody has said what carrying it out would consist of.
 * That is how a board decision quietly becomes a decision not to act, and it
 * is coloured amber rather than grey for exactly that reason.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, PenLine, Signature } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useResolutions, useSignResolution } from '../../api/governanceHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill, WriteError } from '../ui/Controls';
import { GOVERNANCE_KEEPERS, actsAs } from '../../lib/authority';
import { IMPLEMENTATION_TONE, implementationLabel, organLabel } from '../../lib/governance';
import { formatDate } from '../../lib/site';

export const ResolutionRegister: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const resolutions = useResolutions(true);
  const authority = useAuthority();
  const sign = useSignResolution();

  const maySign = actsAs(authority.data, ...GOVERNANCE_KEEPERS);
  const rows = resolutions.data ?? [];
  const unactioned = rows.filter((r) => r.implementation === 'no_actions_recorded').length;
  const unsigned = rows.filter((r) => r.signedAt == null).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {tr ? 'Resmî karar kütüğü' : 'Formal resolution register'}
            </h2>
            <p className="text-[11px] text-slate-500">
              {tr
                ? 'Organların kararları, numaralı ve imzalı. İmzalandıktan sonra metni değiştirilemez — geri alınabilir, üstüne karar alınabilir, ama yeniden yazılamaz.'
                : 'The organs’ resolutions, numbered and signed. Once signed the text is closed: a resolution can be rescinded or superseded, not rewritten.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {unactioned > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              {tr ? `${unactioned} tanesi aksiyona bağlanmamış` : `${unactioned} not actioned`}
            </Pill>
          )}
          {unsigned > 0 && (
            <Pill className="border-slate-300 bg-slate-100 text-slate-700">
              {tr ? `${unsigned} imzasız` : `${unsigned} unsigned`}
            </Pill>
          )}
        </div>
      </header>

      <QueryStatus queries={[resolutions]} />
      <WriteError error={sign.error} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {tr
            ? 'Hiçbir organa bağlı karar yok. Toplantı ekranında bir kararı organa bağlayınca resmî kütüğe burada girer.'
            : 'No resolution belongs to an organ yet. Attach a decision to an organ on the meetings screen and it enters the formal register here.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.decisionId} className="py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.referenceNo && (
                      <span className="font-mono text-[11px] font-semibold text-indigo-800">
                        {row.referenceNo}
                      </span>
                    )}
                    <span className="text-xs font-medium text-slate-900">
                      {(tr ? row.textTr : row.textEn) ?? row.textEn ?? row.textTr}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                    {row.organKind && <span>{organLabel(row.organKind, language)}</span>}
                    {row.decidedOn && <span>{formatDate(row.decidedOn, language)}</span>}
                    {row.signedAt ? (
                      <span className="flex items-center gap-1 text-emerald-800">
                        <Signature className="h-3 w-3" aria-hidden="true" />
                        {tr ? 'imzalı' : 'signed'} {formatDate(row.signedAt, language)}
                      </span>
                    ) : (
                      <span className="text-amber-800">{tr ? 'imzasız' : 'unsigned'}</span>
                    )}
                    <span>
                      {row.actions === 0
                        ? tr
                          ? 'aksiyon yok'
                          : 'no actions'
                        : tr
                          ? `${row.done}/${row.actions - row.cancelled} aksiyon tamam`
                          : `${row.done}/${row.actions - row.cancelled} actions done`}
                    </span>
                    {row.overdue > 0 && (
                      <span className="font-semibold text-rose-700">
                        {tr ? `${row.overdue} gecikmiş` : `${row.overdue} overdue`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Pill className={IMPLEMENTATION_TONE[row.implementation]}>
                    {implementationLabel(row.implementation, language)}
                  </Pill>
                  {row.daysSince != null && (
                    <span className="font-mono text-[11px] text-slate-400">
                      {tr ? `${row.daysSince} gün önce` : `${row.daysSince}d ago`}
                    </span>
                  )}
                  {maySign && row.signedAt == null && (
                    <button
                      type="button"
                      onClick={() => sign.mutate({ decisionId: row.decisionId })}
                      disabled={sign.isPending}
                      className="flex cursor-pointer items-center gap-1 text-[11px] text-indigo-700 hover:underline disabled:opacity-50"
                    >
                      <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'kütüğe imzala' : 'sign into the register'}
                    </button>
                  )}
                  {/* The minute, not the resolution: the resolution is here,
                      the record of the sitting is on the meetings screen. */}
                  <button
                    type="button"
                    onClick={() => navigate('/meetings')}
                    className="cursor-pointer text-[11px] text-slate-500 hover:underline"
                  >
                    {tr ? 'tutanağa git' : 'open the minute'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {unactioned > 0 && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          {tr
            ? '“Aksiyona bağlanmamış”, “başlanmadı” değildir: bu kararın ne yapılarak uygulanacağını kimse yazmamış. Bir karar sessizce uygulanmamaya işte böyle dönüşüyor.'
            : '“Not turned into an action” is not “not started”: nobody has written down what carrying this resolution out would consist of. That is how a decision quietly becomes a decision not to act.'}
        </p>
      )}
    </section>
  );
};
