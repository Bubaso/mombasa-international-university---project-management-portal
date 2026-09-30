import React from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import * as siteQueries from '../api/siteHooks';
import { progressLabel } from '../lib/site';
import * as money from '../api/moneyHooks';
import { share } from '../lib/money';
import { QueryStatus } from '../components/QueryStatus';
import { Scale, Building2, Receipt, Flame, Server, Compass, ArrowUpRight } from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import { ContextualAIAssistant } from '../components/ContextualAIAssistant';
import { AgendaPanel } from '../components/meetings/AgendaPanel';

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useApp();
  const deadlinesQuery = queries.useDeadlines();
  const deadlines = deadlinesQuery.data ?? [];
  const constructionBlocksQuery = queries.useConstructionBlocks();
  const constructionBlocks = constructionBlocksQuery.data ?? [];
  const legalCasesQuery = queries.useLegalCases();
  const legalCases = legalCasesQuery.data ?? [];
  const transactionsQuery = queries.useTransactions();
  const transactions = transactionsQuery.data ?? [];
  const categorySpendQuery = money.useCategorySpend();
  const categorySpend = categorySpendQuery.data ?? [];
  const spendTotal = categorySpend.reduce((acc, c) => acc + c.spentKes, 0);

  // Overall construction progress, averaged over the blocks somebody has
  // actually reported on (M7-03). Two things this deliberately does not do:
  // count an unreported block as nought, which would make the project look
  // worse the less anybody looked; and fall back to a figure when there is
  // nothing to average, which is what the old `: 52` did.
  const blockProgress = siteQueries.useBlockProgress();
  const reported = (blockProgress.data ?? []).filter((b) => b.percentComplete != null);
  const totalBlocks = constructionBlocks.length;
  const avgProgress =
    reported.length > 0
      ? Math.round(reported.reduce((acc, b) => acc + (b.percentComplete ?? 0), 0) / reported.length)
      : null;
  const progressById = new Map(
    (blockProgress.data ?? []).map((b) => [b.constructionBlockId, b.percentComplete]),
  );

  return (
    <div className="space-y-6">
      <QueryStatus
        queries={[deadlinesQuery, constructionBlocksQuery, legalCasesQuery, transactionsQuery]}
      />

      {/* What the project owes itself, before what it owns. Progress bars and
          balances describe a state; this is the only part of the dashboard
          that asks somebody to do something (M12-02). */}
      <AgendaPanel limit={6} compact />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 uppercase tracking-wider">
            <Compass className="w-4 h-4 text-amber-600" />
            <span>{language === 'tr' ? 'Yönetici Gösterge Paneli' : 'Executive Overview'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {language === 'tr' ? 'Yönetici Gösterge Paneli' : 'Executive Dashboard'}
          </h1>
        </div>
      </div>

      {/* 1. GÜNDEMDEKİLER (CURRENT AGENDA & PRIORITY TOPICS) */}
      <div className="bg-white border-2 border-amber-300/80 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
              <Flame className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {language === 'tr'
                  ? 'Gündemdekiler & Öncelikli Mevzular'
                  : 'Current Agenda & Priority Matters'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {language === 'tr'
                  ? 'Mütevelli Heyeti, Avukatlar ve Şantiye Yönetiminin Takibindeki Sıcak Konular'
                  : 'Critical Action Items Monitored by Trustees, Legal Counsel & Site Directorate'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-amber-900 bg-amber-100/80 border border-amber-300 px-2 py-0.5 rounded font-semibold self-start sm:self-center">
            {language === 'tr' ? 'SABİT GÜNDEM · DOĞRULANMADI' : 'STATIC AGENDA · UNVERIFIED'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Agenda Item 1: Court of Appeal Hearing */}
          <div className="p-3.5 rounded-lg bg-rose-50/50 border border-rose-200 hover:border-rose-300 transition-colors flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-rose-800 bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded font-bold uppercase">
                  {language === 'tr' ? 'YARGITAY DURUŞMASI' : 'COURT HEARING'}
                </span>
                <span className="font-mono text-rose-700 font-bold">28 Eylül 2026</span>
              </div>
              <h3 className="font-bold text-slate-900 text-xs leading-snug">
                {language === 'tr'
                  ? 'E062/2025 Yargıtay Sözlü Duruşması'
                  : 'E062/2025 Court of Appeal Hearing'}
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {language === 'tr'
                  ? 'Yürütmeyi durdurma mutabakatla sonuçlandı. Chogo ailesinin asılsız itaatsizlik (contempt) iddiasına karşı savunma heyeti hazır.'
                  : 'Stay motion compromised by consent. Defense counsel ready to dismiss Chogos contempt application with costs.'}
              </p>
            </div>
            <button
              onClick={() => navigate('/legal')}
              className="inline-flex items-center justify-between w-full text-[11px] font-semibold text-rose-800 hover:text-rose-950 pt-1 cursor-pointer"
            >
              <span>{language === 'tr' ? 'Duruşma Brifingini Aç' : 'Review Brief'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Agenda Item 2: Block A1 Weatherproofing */}
          <div className="p-3.5 rounded-lg bg-amber-50/50 border border-amber-200 hover:border-amber-300 transition-colors flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded font-bold uppercase">
                  {language === 'tr' ? 'ACİL KORUMA' : 'PRESERVATION'}
                </span>
                <span className="font-mono text-amber-700 font-bold">6 Ekim 2026</span>
              </div>
              <h3 className="font-bold text-slate-900 text-xs leading-snug">
                {language === 'tr'
                  ? 'Blok A1 Çatı Kaplama Tedbir Esnetmesi'
                  : 'Block A1 Weatherproofing Exemption'}
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {language === 'tr'
                  ? 'Açıkta kalan betonarme kolonların muson yağmurlarından korunması için mahkemeye acil tedbir esnetme dilekçesi hazırlanıyor.'
                  : 'Filing Certificate of Urgency to allow roof truss encapsulation before rains to prevent KShs 34M concrete spalling.'}
              </p>
            </div>
            <button
              onClick={() => navigate('/construction')}
              className="inline-flex items-center justify-between w-full text-[11px] font-semibold text-amber-800 hover:text-amber-950 pt-1 cursor-pointer"
            >
              <span>{language === 'tr' ? 'Hasar & Metraj Dosyası' : 'Review Damage Report'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Agenda Item 3: KRA Tax & CUE Accreditation */}
          <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200 hover:border-emerald-300 transition-colors flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
                  {language === 'tr' ? 'VERGİ & BERAT' : 'TAX & CHARTER'}
                </span>
                <span className="font-mono text-emerald-700 font-bold">2026-2027</span>
              </div>
              <h3 className="font-bold text-slate-900 text-xs leading-snug">
                {language === 'tr'
                  ? 'KRA Vergi Muafiyeti & CUE Beratı'
                  : 'KRA Tax Exemption & CUE Charter'}
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {language === 'tr'
                  ? 'Bağışçı katkılarının vergiden düşülmesi için KRA muafiyet belgesi ve Üniversite Komisyonu (CUE) müfredat denetimi.'
                  : 'Finalizing KRA charitable tax exemption and progressing CUE curriculum alignment toward 2027 student intake.'}
              </p>
            </div>
            <button
              onClick={() => navigate('/governance')}
              className="inline-flex items-center justify-between w-full text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 pt-1 cursor-pointer"
            >
              <span>{language === 'tr' ? 'Yönetişim & Berat Yol Haritası' : 'Review Roadmap'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Agenda Item 4: Accounting API Gateway & Audit */}
          <div className="p-3.5 rounded-lg bg-blue-50/50 border border-blue-200 hover:border-blue-300 transition-colors flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-blue-800 bg-blue-100 border border-blue-300 px-1.5 py-0.5 rounded font-bold uppercase">
                  {language === 'tr' ? 'MALİ DENETİM' : 'FINANCIAL AUDIT'}
                </span>
                <span className="font-mono text-blue-700 font-bold">807.3M KShs</span>
              </div>
              <h3 className="font-bold text-slate-900 text-xs leading-snug">
                {language === 'tr'
                  ? 'Muhasebe API Senkronizasyonu'
                  : 'Accounting Software API Gateway'}
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {language === 'tr'
                  ? 'Kullanılan 807.3M KShs sermaye harcamasının canlı QuickBooks / ERP entegrasyonu ve bağışçı raporlaması.'
                  : 'Reconciling KShs 807.3M audited disbursements with live ERP/accounting software webhook integration.'}
              </p>
            </div>
            <button
              onClick={() => navigate('/finance')}
              className="inline-flex items-center justify-between w-full text-[11px] font-semibold text-blue-800 hover:text-blue-950 pt-1 cursor-pointer"
            >
              <span>{language === 'tr' ? 'Mali Paneli Aç' : 'Open Financial Hub'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. ANA DURUM PANOSU: 3 TEMEL ALAN (İNŞAAT, HUKUK, MALİ) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* KART 1: İNŞAAT DURUMU (CONSTRUCTION STATUS) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {language === 'tr' ? 'İnşaat Durumu' : 'Construction Status'}
                  </h2>
                  <span className="text-[10px] text-slate-500">
                    {language === 'tr'
                      ? '1. Aşama Karkas & Yapısal Koruma'
                      : 'Phase 1 Structural Preservation'}
                  </span>
                </div>
              </div>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                  avgProgress == null
                    ? 'text-slate-500 bg-slate-50 border-slate-300'
                    : 'text-emerald-800 bg-emerald-50 border-emerald-300'
                }`}
              >
                {progressLabel(avgProgress, language)}
              </span>
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  {language === 'tr' ? '1. Aşama Genel İlerleme' : 'Phase 1 Overall Progress'}
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {progressLabel(avgProgress, language)}
                </span>
              </div>
              {/* No bar when nothing has been reported. A bar at zero reads as
                  "nothing has been built", which is a different claim from
                  "nobody has been to look". */}
              {avgProgress == null ? (
                <p className="text-[11px] text-slate-500">
                  {language === 'tr'
                    ? `${totalBlocks} blok için kanıta bağlı ilerleme raporu yok.`
                    : `No evidence-backed progress has been reported for ${totalBlocks} block(s).`}
                </p>
              ) : (
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                    style={{ width: `${avgProgress}%` }}
                  />
                </div>
              )}
            </div>

            {/* Status Quo Legal Compliance Tag */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-800">
                  {language === 'tr' ? 'Yasal Statü:' : 'Legal Compliance:'}
                </span>
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium">
                  {language === 'tr' ? 'KORUMA ALTINDA' : 'STATUS QUO ACTIVE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {language === 'tr'
                  ? 'Yeni inşaat durdurulmuş, mevcut yatırımı koruyucu tedbirler (çatı & su yalıtımı) sürdürülmektedir.'
                  : 'New works paused under 9 Feb 2026 order; urgent weatherproofing allowed via variation.'}
              </p>
            </div>

            {/* Facilities Snapshot */}
            <div className="space-y-2 text-xs">
              <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
                {language === 'tr' ? 'Önemli Yapı Blokları:' : 'Monitored Blocks:'}
              </div>
              {constructionBlocks.slice(0, 4).map((b) => {
                const percent = progressById.get(b.id) ?? null;
                return (
                  <div
                    key={b.id}
                    className="p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800 truncate max-w-[170px]">
                      {b.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-mono font-bold ${
                          percent == null ? 'text-slate-400' : 'text-amber-700'
                        }`}
                      >
                        {progressLabel(percent, language)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => navigate('/construction')}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span>
              {language === 'tr' ? 'İnşaat ve Metraj Modülü ➔' : 'Open Construction Hub ➔'}
            </span>
          </button>
        </div>

        {/* KART 2: HUKUKİ DURUM (LEGAL STATUS) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {language === 'tr' ? 'Hukuki Durum' : 'Legal Status'}
                  </h2>
                  <span className="text-[10px] text-slate-500">
                    {language === 'tr'
                      ? 'Yargıtay Temyizi E062/2025'
                      : 'Appellate Defense E062/2025'}
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded">
                STATUS QUO
              </span>
            </div>

            {/* Active Appeal Summary */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-amber-800 font-bold text-[11px]">
                  CA No. E062 / 2025
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Mombasa Court of Appeal
                </span>
              </div>
              <div className="font-semibold text-slate-800 text-xs">
                The Zayed Foundation & AUTK vs Kazungu Moli Chogo & 11 Others
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {language === 'tr'
                  ? '9 Şubat 2026 Mutabakat Kararı: Sınırlar koruma altında, satış yasağı aktif, dava öncelikli sıraya alınmıştır.'
                  : '9 Feb 2026 Consent Order: Boundaries preserved, sales prohibited, priority hearing granted.'}
              </p>
            </div>

            {/* Key Defense Points */}
            <div className="space-y-2 text-xs">
              <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
                {language === 'tr' ? 'Hukuki Güvenceler & Savunma:' : 'Key Defense Pillars:'}
              </div>
              <div className="p-2 rounded bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                <div className="font-semibold text-slate-800">
                  {language === 'tr'
                    ? '1. 20 Dönüm Sınır Koruması:'
                    : '1. 5-Acre Boundary Restriction:'}
                </div>
                <p className="text-slate-600">
                  {language === 'tr'
                    ? 'Davacılar sahada fiilen oturdukları 20 dönümle kesin olarak sınırlandırılmıştır.'
                    : 'Claimants strictly confined to the 5 acres actually occupied during locus site visit.'}
                </p>
              </div>

              <div className="p-2 rounded bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                <div className="font-semibold text-slate-800">
                  {language === 'tr'
                    ? '2. Asılsız İtaatsizlik Reddi:'
                    : '2. Contempt Motion Defense:'}
                </div>
                <p className="text-slate-600">
                  {language === 'tr'
                    ? 'Vakfımız hiçbir inşaat yapmamıştır; duvar tamiratı Zayed Vakfı tarafından resmi bildirimle yapılmıştır.'
                    : 'AUTK undertook NO works; perimeter repair was notified openly by Zayed Foundation.'}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/legal')}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span>{language === 'tr' ? 'Hukuk ve Dava Portföyü ➔' : 'Open Legal Portfolio ➔'}</span>
          </button>
        </div>

        {/* KART 3: MALİ DURUM (FINANCIAL STATUS) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {language === 'tr' ? 'Mali Durum' : 'Financial Status'}
                  </h2>
                  <span className="text-[10px] text-slate-500">
                    {language === 'tr' ? 'Denetlenmiş Sermaye Yatırımı' : 'Audited Capital Outlay'}
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-blue-800 bg-blue-50 border border-blue-300 px-2 py-0.5 rounded">
                807.3M KShs
              </span>
            </div>

            {/* Financial Overview Metrics */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">
                  {language === 'tr' ? 'Toplam Yatırım:' : 'Total Invested:'}
                </div>
                <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">807.3M KShs</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">
                  {language === 'tr' ? 'Taahhüt Fonu:' : 'Committed Fund:'}
                </div>
                <div className="font-mono font-bold text-emerald-700 text-sm mt-0.5">
                  980.0M KShs
                </div>
              </div>
            </div>

            {/* Capital Allocation Breakdown */}
            <div className="space-y-2 text-xs">
              {/* M8-09. The heading used to name a figure — "KShs 807M" —
                  that no query produced, over a breakdown that was an empty
                  stub. Both come from category_spend now, so the total is
                  whatever the budget actually says and the bars move when it
                  does. */}
              <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
                {language === 'tr' ? 'Harcama Dağılımı:' : 'Capital Allocation:'}
              </div>
              <div className="space-y-1.5">
                {categorySpend.slice(0, 3).map((item) => (
                  <div key={item.budgetCategoryId} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-700 truncate max-w-[180px]">
                        {language === 'tr' ? (item.nameTr ?? item.nameEn) : item.nameEn}
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {(item.spentKes / 1000000).toFixed(1)}M
                      </span>
                    </div>
                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${share(item.spentKes, spendTotal) ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* No accounting system is connected. This used to read "LIVE
                SYNC" from a hard-coded state object with nothing behind it. */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] text-slate-600 font-medium">
                  {language === 'tr' ? 'Muhasebe entegrasyonu' : 'Accounting integration'}
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-slate-200 text-slate-600 border border-slate-300">
                {language === 'tr' ? 'KURULMADI' : 'NOT SET UP'}
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate('/finance')}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span>
              {language === 'tr' ? 'Mali Yönetim ve Harcamalar ➔' : 'Open Financial Hub ➔'}
            </span>
          </button>
        </div>
      </div>

      <ContextualAIAssistant
        contextData={JSON.stringify({ deadlines, legalCases, constructionBlocks, transactions })}
        systemInstruction="You are a Master Project Manager AI for the Mombasa International University Project Management Portal. Provide high-level executive summaries, prioritize upcoming deadlines, and identify overarching project risks based on the provided aggregated context."
        title={language === 'tr' ? 'Genel Yönetici AI (Executive)' : 'Executive AI Assistant'}
      />
    </div>
  );
};
