/**
 * The panels a role-specific home screen is assembled from (M12-01).
 *
 * The requirement's own reasoning is the design: a trustee asks "what do I
 * have to decide", the site asks "what am I doing today", a donor asks "where
 * did my money go", and no single dashboard answers all three. What the old
 * screen did instead was answer none of them, at length, from hand-written
 * copy.
 *
 * Every figure here is computed (M12-03). Where there is nothing to show, the
 * panel says which of the two nothings it is: no records, or none this person
 * may see. Those are different facts and a dashboard that conflates them
 * teaches people to distrust it.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  Camera,
  Gavel,
  HandCoins,
  PieChart,
  Scale,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import * as siteQueries from '../../api/siteHooks';
import * as moneyQueries from '../../api/moneyHooks';
import * as raidQueries from '../../api/raidHooks';
import { useObligations } from '../../api/obligationHooks';
import { fetchCalendar } from '../../api/calendar';
import { money as fmt, progressLabel, formatDate, daysUntil } from '../../lib/site';
import { share } from '../../lib/money';
import { ESCALATION_THRESHOLD, riskCategoryLabel } from '../../lib/raid';

const Card: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  to?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, to, children }) => {
  const navigate = useNavigate();
  const { language } = useApp();
  const tr = language === 'tr';
  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </header>
      <div className="flex-1">{children}</div>
      {to && (
        <button
          type="button"
          onClick={() => navigate(to)}
          className="mt-3 inline-flex w-full cursor-pointer items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-200"
        >
          <span>{tr ? 'Aç' : 'Open'}</span>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </section>
  );
};

/** "Nothing here" and "nothing you may see" are different things to say. */
const Nothing: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm leading-relaxed text-slate-500">{children}</p>
);

// ---------------------------------------------------------------------------
// The site, today
// ---------------------------------------------------------------------------

export const SiteToday: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const progress = siteQueries.useBlockProgress();
  const conflicts = siteQueries.useConflicts(null);

  const blocks = progress.data ?? [];
  const unacknowledged = (conflicts.data ?? []).filter((c) => !c.acknowledged);
  // The number worth putting on a home screen: how much of the work has
  // anybody actually been to look at.
  const tasks = blocks.reduce((acc, b) => acc + b.constructionTasks, 0);
  const evidenced = blocks.reduce((acc, b) => acc + b.tasksWithEvidence, 0);

  return (
    <Card
      icon={Building2}
      title={tr ? 'Saha, bugün' : 'The site, today'}
      subtitle={
        tr
          ? 'Kanıtı olan iş ile olmayan iş. Rapor edilmemiş bir görev, yapılmamış demek değil — kimsenin bakmadığı demek.'
          : 'Work with evidence behind it, and work without. An unreported task is not undone; it is unlooked-at.'
      }
      to="/construction"
    >
      <QueryStatus queries={[progress, conflicts]} />

      {blocks.length === 0 ? (
        <Nothing>
          {tr
            ? 'Görebileceğiniz blok yok. Dış firmalar yalnızca kendilerine atanan blokları görür.'
            : 'No blocks you can see. An outside firm sees only the blocks it is assigned to.'}
        </Nothing>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-600">
              <Camera className="h-3 w-3" aria-hidden="true" />
              {tr ? 'Kanıtlı görev' : 'Tasks with evidence'}
            </span>
            <span className="font-mono font-semibold text-slate-900">
              {evidenced}/{tasks}
            </span>
          </div>

          {unacknowledged.length > 0 && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900">
              <span className="flex items-center gap-1.5 font-semibold">
                <Gavel className="h-3 w-3 shrink-0" aria-hidden="true" />
                {tr
                  ? `${unacknowledged.length} iş yürürlükteki bir yasağın kapsamında`
                  : `${unacknowledged.length} task(s) under a live prohibition`}
              </span>
              <span className="block">
                {tr
                  ? 'İş engellenmiyor — ama gerekçe kaydedilene kadar bu, verilmeden alınmış bir karar.'
                  : 'The work is not blocked — but until a reason is recorded it is a decision taken without being made.'}
              </span>
            </div>
          )}

          <ul className="space-y-1">
            {blocks.slice(0, 5).map((block) => (
              <li
                key={block.constructionBlockId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate text-slate-700">
                  {block.tasksWithEvidence}/{block.constructionTasks} {tr ? 'kanıtlı' : 'evidenced'}
                  {block.preservationTasks > 0 && (
                    <span className="ml-1.5 text-orange-700">
                      {tr
                        ? `+${block.preservationTasks} koruma`
                        : `+${block.preservationTasks} preservation`}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 font-mono ${
                    block.percentComplete == null ? 'text-amber-700' : 'text-slate-800'
                  }`}
                >
                  {progressLabel(block.percentComplete, language)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// What is next in court
// ---------------------------------------------------------------------------

export const LegalNext: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  // The calendar view already unions hearings and filings behind each table's
  // own policy, so an advocate's read comes back as their own dates and
  // nobody else's without this panel doing anything about it.
  const calendar = useQuery({ queryKey: ['projectCalendar'], queryFn: fetchCalendar });

  const dated = (calendar.data ?? [])
    .filter((e) => e.kind === 'hearing' || e.kind === 'filing')
    .filter((e) => e.dueOn != null)
    .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''))
    .slice(0, 6);

  return (
    <Card
      icon={Scale}
      title={tr ? 'Mahkemede sırada' : 'Next in court'}
      subtitle={tr ? 'Duruşmalar ve layiha süreleri.' : 'Hearings and filing deadlines.'}
      to="/legal"
    >
      <QueryStatus queries={[calendar]} />
      {dated.length === 0 ? (
        <Nothing>
          {tr
            ? 'Kayıtlı bir duruşma veya süre yok — ya da atanmış olduğunuz bir dosya yok.'
            : 'No hearings or deadlines recorded — or no file is assigned to you.'}
        </Nothing>
      ) : (
        <ul className="space-y-1.5">
          {dated.map((entry) => {
            const days = daysUntil(entry.dueOn);
            return (
              <li key={`${entry.kind}-${entry.id}`} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-slate-800">
                    {tr ? (entry.titleTr ?? entry.titleEn) : entry.titleEn}
                  </span>
                  <span
                    className={`shrink-0 font-mono ${
                      days != null && days < 0
                        ? 'font-semibold text-rose-700'
                        : days != null && days <= 7
                          ? 'font-semibold text-amber-800'
                          : 'text-slate-500'
                    }`}
                  >
                    {days != null && days < 0
                      ? tr
                        ? `${-days} gün geçti`
                        : `${-days}d late`
                      : formatDate(entry.dueOn, language)}
                  </span>
                </div>
                {entry.detail && <span className="text-slate-500">{entry.detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Use of funds
// ---------------------------------------------------------------------------
//
// Named "use of funds" and not "where the money went". The second reads as an
// accusation — somebody asking a trust to account for itself — and this panel
// is the trust's own statement of how it spent what it was given. The words a
// donor screen uses are part of the relationship it is for.

export const MoneyWhere: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const spend = moneyQueries.useCategorySpend();
  const donations = moneyQueries.useDonations();

  const categories = spend.data ?? [];
  const total = categories.reduce((acc, c) => acc + c.spentKes, 0);
  const pledged = (donations.data ?? []).reduce((acc, d) => acc + d.pledgedAmountKes, 0);
  const received = (donations.data ?? []).reduce((acc, d) => acc + d.receivedKes, 0);

  return (
    <Card
      icon={PieChart}
      title={tr ? 'Kaynakların kullanımı' : 'Use of funds'}
      subtitle={
        tr
          ? 'Kalemlerden hesaplanır. Taahhüt ile tahsilat ayrı durur, çünkü aynı şey değiller.'
          : 'Computed from the lines. A pledge and a receipt are kept apart, because they are not the same thing.'
      }
      to="/finance"
    >
      <QueryStatus queries={[spend, donations]} />

      {(donations.data ?? []).length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 px-2 py-1.5">
            <div className="text-slate-500">{tr ? 'Taahhüt' : 'Pledged'}</div>
            <div className="font-mono font-semibold text-slate-900">{fmt(pledged, 'KES')}</div>
          </div>
          <div className="rounded-lg border border-slate-200 px-2 py-1.5">
            <div className="text-slate-500">{tr ? 'Gelen' : 'Received'}</div>
            <div className="font-mono font-semibold text-emerald-700">{fmt(received, 'KES')}</div>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <Nothing>
          {tr
            ? 'Bütçe kalemi yok — ya da mali kayıtlar sizin görebileceğiniz şeyler değil.'
            : 'No budget lines — or the financial records are not yours to see.'}
        </Nothing>
      ) : (
        <ul className="space-y-1.5">
          {categories.slice(0, 5).map((category) => {
            const pct = share(category.spentKes, total);
            return (
              <li key={category.budgetCategoryId}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700">
                    {tr ? (category.nameTr ?? category.nameEn) : category.nameEn}
                  </span>
                  <span className="shrink-0 font-mono text-slate-800">
                    {fmt(category.spentKes, 'KES')}
                  </span>
                </div>
                {pct != null && (
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// The project, in the round
// ---------------------------------------------------------------------------

export const ProjectPulse: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const progress = siteQueries.useBlockProgress();
  const risks = raidQueries.useRisks();
  const obligations = useObligations();

  const reported = (progress.data ?? []).filter((b) => b.percentComplete != null);
  const average =
    reported.length > 0
      ? Math.round(reported.reduce((a, b) => a + (b.percentComplete ?? 0), 0) / reported.length)
      : null;

  const live = (risks.data ?? []).filter((r) => r.state === 'open' || r.state === 'mitigating');
  const overLine = live.filter((r) => r.score >= ESCALATION_THRESHOLD);
  const untriggered = live.filter((r) => !r.triggerEn);
  const unverified = (obligations.data ?? []).filter((o) => !o.verified);

  return (
    <Card
      icon={TriangleAlert}
      title={tr ? 'Projenin nabzı' : 'The project, in the round'}
      /* Alt başlık kaldırıldı (8 Ekim 2026). "Hiç rapor edilmemişse rakam yok
         — sıfır yazmıyor" diyordu, ve dürüstlüğü taşıyan şey o cümle değil
         hücredeki DEĞER: `progressLabel` null yüzde için "raporlanmadı"
         basıyor, ve o dizge `tests/design-rows.mjs`'in koruduğu kümede.
         Cümle, verinin zaten söylediğini prozada tekrar ediyordu — T6-01 ve
         T13-02 turlarının 54 paragrafta kaldırdığı tür, bu panelde gözden
         kaçmış. Telefonda kurguyu 2.552 → ölçülen değere indirdi. */
    >
      <QueryStatus queries={[progress, risks, obligations]} />
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-slate-600">{tr ? 'Kanıtlı ilerleme' : 'Evidenced progress'}</dt>
          <dd
            className={`font-mono font-semibold ${
              average == null ? 'text-slate-500' : 'text-slate-900'
            }`}
          >
            {progressLabel(average, language)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-600">{tr ? 'Açık risk' : 'Open risks'}</dt>
          <dd className="flex items-center gap-1.5">
            <span className="font-mono font-semibold text-slate-900">{live.length}</span>
            {overLine.length > 0 && (
              <Pill className="border-rose-300 bg-rose-100 text-rose-800">
                {tr ? `${overLine.length} eşik üstü` : `${overLine.length} over the line`}
              </Pill>
            )}
          </dd>
        </div>
        {untriggered.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-900">
            {tr
              ? `${untriggered.length} riskin tetikleyicisi yazılmamış: gerçekleşip gerçekleşmediğini kimse söyleyemez.`
              : `${untriggered.length} risks have no trigger: nobody can say whether they are happening.`}
          </div>
        )}
        <div className="flex items-center justify-between">
          <dt className="text-slate-600">{tr ? 'Belgesiz yükümlülük' : 'Unsourced obligations'}</dt>
          <dd className="font-mono font-semibold text-slate-900">
            {unverified.length}/{(obligations.data ?? []).length}
          </dd>
        </div>
        {overLine.length > 0 && (
          <ul className="space-y-0.5 border-t border-slate-100 pt-2">
            {overLine.slice(0, 3).map((risk) => (
              <li key={risk.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3 shrink-0 text-rose-600" aria-hidden="true" />
                  <span className="truncate text-slate-800">
                    {tr ? (risk.titleTr ?? risk.titleEn) : risk.titleEn}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-rose-700">
                  {risk.score}
                  <span className="ml-1 text-slate-500">
                    {riskCategoryLabel(risk.category, language)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </dl>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// What is dated and close
// ---------------------------------------------------------------------------

export const ComingUp: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const calendar = useQuery({ queryKey: ['projectCalendar'], queryFn: fetchCalendar });

  const soon = (calendar.data ?? [])
    .filter((e) => e.dueOn != null)
    .map((e) => ({ entry: e, days: daysUntil(e.dueOn) }))
    .filter((x) => x.days != null && x.days <= 30)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 7);

  return (
    <Card
      icon={CalendarClock}
      title={tr ? 'Yaklaşanlar' : 'Coming up'}
      subtitle={
        tr
          ? 'Altı kütükten tarihi olan her şey, otuz gün içinde.'
          : 'Everything dated from six registers, inside thirty days.'
      }
      to="/calendar"
    >
      <QueryStatus queries={[calendar]} />
      {soon.length === 0 ? (
        <Nothing>
          {tr
            ? 'Önümüzdeki otuz günde tarihli bir şey yok.'
            : 'Nothing dated in the next thirty days.'}
        </Nothing>
      ) : (
        <ul className="space-y-1.5">
          {soon.map(({ entry, days }) => (
            <li
              key={`${entry.kind}-${entry.id}`}
              className="flex items-start justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate text-slate-800">
                {tr ? (entry.titleTr ?? entry.titleEn) : entry.titleEn}
              </span>
              <span
                className={`shrink-0 font-mono ${
                  (days ?? 0) < 0
                    ? 'font-semibold text-rose-700'
                    : (days ?? 0) <= 7
                      ? 'font-semibold text-amber-800'
                      : 'text-slate-500'
                }`}
              >
                {(days ?? 0) < 0
                  ? tr
                    ? `${-(days ?? 0)} gün geçti`
                    : `${-(days ?? 0)}d late`
                  : tr
                    ? `${days} gün`
                    : `${days}d`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Money nobody has signed off
// ---------------------------------------------------------------------------

export const AuditQueue: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const ledger = moneyQueries.useLedger();

  const rows = ledger.data?.rows ?? [];
  // İki sayı da kütüğün tamamından. Panoda dilimin içinden sayılmış bir sayı,
  // tam olarak panonun işe yaramaz olma şekli: küçük ve yanlış.
  const gaps = moneyQueries.useLedgerGaps();
  const unaudited = gaps.data?.unaudited ?? 0;
  const undocumented = gaps.data?.undocumented ?? 0;
  // Payda da kütüğün tamamı: dilimin boyu bir oranın altına yazılamaz.
  const ledgerTotal = ledger.data?.total ?? 0;

  return (
    <Card
      icon={HandCoins}
      title={tr ? 'Denetim kuyruğu' : 'Waiting on audit'}
      subtitle={
        tr
          ? 'Rozeti yalnızca denetim komitesi ve dış denetçi koyabilir. Harcayan koyamaz.'
          : 'Only the audit committee and the external auditor can produce the badge. Never whoever spent it.'
      }
      to="/finance"
    >
      <QueryStatus queries={[ledger]} />
      {rows.length === 0 ? (
        <Nothing>
          {tr
            ? 'Kasa defteri boş — ya da mali kayıtlar sizin görebileceğiniz şeyler değil.'
            : 'The ledger is empty — or the financial records are not yours to see.'}
        </Nothing>
      ) : (
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">{tr ? 'Denetlenmemiş' : 'Not audited'}</dt>
            <dd className="font-mono font-semibold text-slate-900">
              {unaudited}/{ledgerTotal}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">{tr ? 'Belgesiz' : 'No document attached'}</dt>
            <dd
              className={`font-mono font-semibold ${
                undocumented > 0 ? 'text-amber-800' : 'text-slate-900'
              }`}
            >
              {undocumented}/{ledgerTotal}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <dt className="text-slate-600">{tr ? 'Denetlenmiş toplam' : 'Audited value'}</dt>
            <dd className="font-mono font-semibold text-emerald-700">
              {fmt(gaps.data?.auditedKes ?? 0, 'KES')}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
};
