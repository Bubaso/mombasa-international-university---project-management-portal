/**
 * The statutory compliance calendar (M10-05).
 *
 * The requirement says each item lives as an obligation in M2, and that is
 * what the button on each row does. The reason it is a button rather than
 * something automatic is that raising an obligation puts a name and a due
 * date on somebody's screen, and that should be an act, not a cron job
 * nobody remembers configuring.
 *
 * The column that makes the screen worth opening is "not yet raised": a
 * statutory duty with no obligation behind it is a duty nobody has taken on.
 * Cap 164 registration, the KRA exemption and the CUE submissions are all of
 * this kind — they fall due whether or not anybody wrote them down.
 */
import React from 'react';
import { Bilingual } from '../ui/Bilingual';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CircleAlert, Scale } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useComplianceCalendar, useRaiseCompliance } from '../../api/governanceHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Pill, WriteError } from '../ui/Controls';
import { READINESS_KEEPERS, actsAs } from '../../lib/authority';
import { regimeLabel } from '../../lib/governance';
import { formatDate } from '../../lib/site';

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export const CompliancePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const calendar = useComplianceCalendar();
  const authority = useAuthority();
  const raise = useRaiseCompliance();

  const mayRaise = actsAs(authority.data, ...READINESS_KEEPERS);
  const rows = calendar.data ?? [];
  const unraised = rows.filter((r) => r.notYetRaised).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Mevzuat uyum takvimi' : 'Statutory compliance calendar'}
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Fasıl 164, KRA, CUE ve valilik yükümlülüklerinin takvimi.'
                : 'The calendar of Cap 164, KRA, CUE and county obligations.'}
            </p>
          </div>
        </div>
        {unraised > 0 && (
          <Pill className="border-amber-300 bg-amber-50 text-amber-900">
            {tr ? `${unraised} tanesi henüz açılmamış` : `${unraised} not yet raised`}
          </Pill>
        )}
      </header>

      <QueryStatus queries={[calendar]} />
      <WriteError error={raise.error} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Takvimde kayıtlı mevzuat yükümlülüğü yok. Bu, yükümlülük olmadığı anlamına gelmiyor — Fasıl 164 beyanı ve KRA muafiyeti kimse yazmasa da vadesi geliyor.'
            : 'No statutory duty is on the calendar. That does not mean there are none: the Cap 164 return and the KRA exemption fall due whether or not anybody wrote them down.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const left = daysUntil(row.nextDueOn);
            const soon = left != null && left <= 45;
            const past = left != null && left < 0;
            return (
              <li key={row.requirementId} className="flex flex-wrap items-start gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill>{regimeLabel(row.regime, language)}</Pill>
                    <span className="text-sm font-medium text-slate-900">
                      <Bilingual
                        table="compliance_requirements"
                        id={row.requirementId}
                        base="title"
                        en={row.titleEn}
                        tr={row.titleTr}
                      />
                    </span>
                    {row.reference && (
                      <span className="font-mono text-xs text-slate-500">{row.reference}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {row.nextDueOn && (
                      <span
                        className={
                          past
                            ? 'font-semibold text-rose-700'
                            : soon
                              ? 'font-semibold text-amber-800'
                              : undefined
                        }
                      >
                        {tr ? 'vade ' : 'due '}
                        {formatDate(row.nextDueOn, language)}
                        {left != null && (tr ? ` (${left} gün)` : ` (${left}d)`)}
                      </span>
                    )}
                    {row.responsibleName && <span>{row.responsibleName}</span>}
                    {row.obligationState && (
                      <span>
                        {tr ? 'yükümlülük: ' : 'obligation: '}
                        {row.obligationState}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {row.notYetRaised ? (
                    mayRaise ? (
                      <ActionButton
                        onClick={() => raise.mutate(row.requirementId)}
                        disabled={raise.isPending}
                      >
                        <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr ? 'Yükümlülük olarak aç' : 'Raise as an obligation'}
                      </ActionButton>
                    ) : (
                      <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                        <CircleAlert className="mr-1 inline h-3 w-3" aria-hidden="true" />
                        {tr ? 'henüz açılmamış' : 'not yet raised'}
                      </Pill>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/obligations')}
                      className="cursor-pointer text-xs text-indigo-700 hover:underline"
                    >
                      {tr ? 'yükümlülüğe git' : 'open the obligation'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
