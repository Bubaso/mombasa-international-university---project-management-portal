import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import { QueryStatus } from '../components/QueryStatus';
import { Scale, ShieldCheck, Plus, FileCheck, FolderOpen, TriangleAlert } from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import { CaseStrip } from '../components/legal/CaseStrip';
import { HearingList } from '../components/legal/HearingList';
import { FilingList } from '../components/legal/FilingList';
import { OrderList } from '../components/legal/OrderList';
import { EvidenceList } from '../components/legal/EvidenceList';
import { CounselPanel } from '../components/legal/CounselPanel';
import { PartyList } from '../components/legal/PartyList';
import { AppealGrounds } from '../components/legal/AppealGrounds';
import { AuthorityLibrary } from '../components/legal/AuthorityLibrary';
import { HearingBrief, BenchQuestions } from '../components/legal/HearingBrief';
import { CaseActions } from '../components/legal/CaseActions';
import { ChronologyPanel } from '../components/plan/ChronologyPanel';
import { useAuthority } from '../api/adminHooks';
import { ASSESSORS, actsAs } from '../lib/authority';
import { EmptyState } from '../components/EmptyState';

/**
 * Duruşma brifingi artık kayıt (M5-12), 0053.
 *
 * Burada `ContemptDefencePillar` ve `HearingBrief` adlı iki yerel arayüz ile
 * `loadHearingBrief()` adında `null` döndüren bir fonksiyon duruyordu. Üçü de
 * gitti: brifingin üç listesi `defence_pillars`, `bench_questions` ve
 * `legal_authorities` tablolarında, başlığı ise zaten kayıtlı olan yerlerde —
 * heyet `hearings.bench`, dava adı `legal_cases`, avukat `case_counsel`.
 *
 * Yerel arayüzün adı, içe aktarılan bileşenin adıyla aynıydı ve onu
 * gölgeliyordu; bu, tipin kaldırılmasıyla birlikte düzeldi.
 */

/**
 * The legal screen's thirteen tabs, in four sections.
 *
 * Grouped by what somebody is actually doing: following the live case,
 * working the appeal, preparing for a hearing, or looking up who is who and
 * what happened when.
 *
 * Several labels used to carry a fact in parentheses — "(28 Sept 2026)",
 * "(9 Grounds)", "E062/2025", "30-Year" — typed into a tab. A date in a tab
 * label goes stale silently and a count disagrees with the list under it the
 * moment a row is added, so the label names the thing and the screen under
 * it carries the particulars, which come from the record.
 */
const LEGAL_SECTIONS = [
  {
    id: 'case',
    labelTr: 'Dava',
    labelEn: 'The case',
    tabs: [
      { id: 'hearings', labelTr: 'Duruşmalar', labelEn: 'Hearings' },
      { id: 'filings', labelTr: 'Layiha ve süreler', labelEn: 'Filings & deadlines' },
      { id: 'orders', labelTr: 'Mahkeme kararları', labelEn: 'Court orders' },
      { id: 'evidence', labelTr: 'Deliller ve zincir', labelEn: 'Evidence & custody' },
    ],
  },
  {
    id: 'appeal',
    labelTr: 'Temyiz',
    labelEn: 'The appeal',
    tabs: [
      { id: 'overview', labelTr: 'Temyiz dosyası', labelEn: 'Appeal file' },
      { id: 'grounds', labelTr: 'Temyiz itirazları', labelEn: 'Grounds of appeal' },
      { id: 'authorities', labelTr: 'İçtihat ve kararlar', labelEn: 'Authorities & precedents' },
    ],
  },
  {
    id: 'hearing_prep',
    labelTr: 'Duruşma hazırlığı',
    labelEn: 'Hearing preparation',
    tabs: [
      { id: 'hearing_brief', labelTr: 'Duruşma brifingi', labelEn: 'Hearing brief' },
      { id: 'bench_qa', labelTr: 'Heyet soru-cevapları', labelEn: 'Anticipated bench Q&A' },
      { id: 'action_plan', labelTr: 'Kenya ziyaret planı', labelEn: 'Kenya visit plan' },
    ],
  },
  {
    id: 'people',
    labelTr: 'Taraflar ve tarihçe',
    labelEn: 'People & history',
    tabs: [
      { id: 'counsel', labelTr: 'Avukatlar ve görüşler', labelEn: 'Counsel & opinions' },
      { id: 'who_is_who', labelTr: 'Kim kimdir', labelEn: 'Who is who' },
      { id: 'timeline', labelTr: 'Dava tarihçesi', labelEn: 'Case history' },
    ],
  },
] as const;

export const LegalAffairsView: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useApp();
  const tr = language === 'tr';
  const legalCasesQuery = queries.useLegalCases();
  const legalCases = legalCasesQuery.data ?? [];
  const { mutate: addLegalCase } = queries.useAddLegalCase();
  // A real choice now, rather than an identifier written into the source.
  // M5-01: there are at least five files and new applications keep being made.
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<
    | 'overview'
    | 'hearings'
    | 'filings'
    | 'orders'
    | 'evidence'
    | 'counsel'
    | 'hearing_brief'
    | 'bench_qa'
    | 'authorities'
    | 'grounds'
    | 'action_plan'
    | 'who_is_who'
    | 'timeline'
  >('hearings');

  // Derived, never stored: the section is wherever the active tab lives.
  const activeSection =
    LEGAL_SECTIONS.find((sec) => sec.tabs.some((t) => t.id === activeSubTab)) ?? LEGAL_SECTIONS[0];
  const [showNewMotionModal, setShowNewMotionModal] = useState(false);

  // New Motion Form State
  const [motionTitle, setMotionTitle] = useState('');
  const [motionCourt, setMotionCourt] = useState('Court of Appeal (Mombasa)');
  const [motionDetail, setMotionDetail] = useState('');

  const activeCase = legalCases.find((c) => c.id === selectedCaseId) ?? legalCases[0] ?? null;
  const authority = useAuthority();
  // Advocates write on their own files; that is the point of them having
  // accounts at all. app.can_keep_legal_record in 0009 is the rule this
  // mirrors, and the one that refuses if this gets it wrong.
  const canKeepRecord =
    actsAs(authority.data, ...ASSESSORS) || actsAs(authority.data, 'legal_counsel');
  const canManageCounsel = actsAs(authority.data, 'admin', 'project_director');
  // Orders are their own records now: a court order carries a state, the
  // document behind it, and the obligations it creates, none of which fitted
  // in the JSON array that used to sit on the case row.
  const caseOrders = queries.useCaseOrders(activeCase?.id).data ?? [];

  const handleCreateMotion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motionTitle) return;
    addLegalCase({
      title: motionTitle,
      court: motionCourt,
      caseNumber: `Motion/App-${Date.now().toString().slice(-4)}/2026`,
      caseType: 'Notice of Motion under Certificate of Urgency',
      currentStatus: 'Filed & Awaiting Mention',
      descriptionEn: motionDetail,
      descriptionTr: motionDetail,
    });
    setMotionTitle('');
    setMotionDetail('');
    setShowNewMotionModal(false);
  };

  return (
    <div className="space-y-6">
      <QueryStatus queries={[legalCasesQuery]} />

      {/* Most of the legal narrative below — the status quo summary, the
          grounds, the chronology, the directory — is hard-coded in this file
          and traces to no record in the system. Some of it is also known to be
          out of step with the project's own meeting minutes. Until each claim
          hangs off a document, say plainly that it is unverified. */}
      <div
        className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
        role="note"
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1">
          <div className="font-semibold text-amber-900">
            {tr ? 'Doğrulanmamış içerik' : 'Unverified content'}
          </div>
          <p className="leading-relaxed text-amber-900/80">
            {tr
              ? 'Bu sayfadaki dava özeti, gerekçeler, kronoloji ve taraf listesi koda gömülü sabit metinlerdir; hiçbiri sistemdeki bir belgeye veya karara bağlı değildir ve güncelliği doğrulanmamıştır. Hukuki bir karara dayanak yapmadan önce asıl evrakla teyit edin.'
              : 'The case summary, grounds, chronology and party list on this page are static text held in the code. None of it is linked to a document or record in the system, and none of it has been checked for currency. Verify against the primary filings before relying on any of it.'}
          </p>
        </div>
      </div>

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 uppercase tracking-wider">
            <Scale className="w-4 h-4" />
            <span>
              {tr ? 'Hukuk Müşavirliği & Temyiz Portföyü' : 'Appellate Defense & Legal Affairs'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {tr ? 'Hukuk İşleri' : 'Legal Affairs'}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowNewMotionModal(true)}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{tr ? 'Acil Dilekçe / Layiha Kaydet' : 'File Motion / Pleading'}</span>
          </button>
        </div>
      </div>

      {/* Status Quo Official Ruling Box (9 Feb 2026) */}
      <div className="bg-white border-2 border-emerald-500/50 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm uppercase tracking-wider">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>
              {tr
                ? 'Yargıtay Heyeti Resmî Kararı — Mevcut Durumun Korunması (Status Quo)'
                : 'Court of Appeal Injunction — Status Quo Order (9 February 2026)'}
            </span>
          </div>
          <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {tr
              ? 'Heyet: Mohammed · Laibuta · Ngenye-Macharia'
              : 'Judges: Mohammed · Laibuta · Ngenye-Macharia'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {tr ? '1. Sınırların Korunması' : '1. Boundary Protection'}
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              {tr
                ? 'Moli ailesi (1.–7. davalılar) sadece fiilen işgal ettikleri 20 dönümlük (5 acre) alanda kalmaya devam edecektir.'
                : 'Claimants strictly confined to the 5-acre enclave they actually occupied during site survey.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {tr ? '2. Satış ve Devir Yasağı' : '2. Prohibition of Sale'}
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              {tr
                ? 'Temyiz sonuçlanıncaya kadar arazinin hiçbir kısmı üçüncü kişilere devredilemez, satılamaz veya bölünemez.'
                : 'No party may sell, subdivide or transfer any portion of the 84-acre parcel to third parties.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {tr ? '3. Öncelikli Yargılama' : '3. Priority Hearing'}
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              {tr
                ? 'Adaletin gecikmemesi amacıyla temyiz davasının sıradan dosyaların önüne alınarak öncelikli görülmesine karar verildi.'
                : 'Expedited calendar granted ahead of standard queue due to magnitude of university investment.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {tr ? '4. İnşaatların Durdurulması' : '4. Suspension of Works'}
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              {tr
                ? 'Yeni inşaat ve çevre duvarı geçici olarak durdurulmuştur (Acil koruma başvurusu hariç).'
                : 'New construction suspended; urgent weatherproofing allowed via variation application.'}
            </p>
          </div>
        </div>
      </div>

      {/* Which file. M5-01: multiple files are the normal case here. */}
      <CaseStrip
        cases={legalCases}
        selectedId={activeCase?.id ?? null}
        onSelect={setSelectedCaseId}
      />

      {/* Sub-tabs, in two levels.
          There were thirteen of them in one strip, all the same size and all
          equally loud, so finding the chronology or the bench questions meant
          reading every label. They are four sections now, and choosing a
          section shows only its own two to four tabs.

          The section is DERIVED from the active tab rather than held in its
          own state. Two states would have to be kept in step, and the one
          that drifts is always the second — the same reason the sidebar and
          the phone menu now read a single list. */}
      <div className="space-y-2 border-b border-slate-200 pb-2">
        <div
          role="tablist"
          aria-label={tr ? 'Hukuk bölümleri' : 'Legal sections'}
          className="flex flex-wrap items-center gap-1.5"
        >
          {LEGAL_SECTIONS.map((section) => {
            const isActive = section.id === activeSection.id;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveSubTab(section.tabs[0].id as typeof activeSubTab)}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {tr ? section.labelTr : section.labelEn}
              </button>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label={tr ? 'Hukuk sekmeleri' : 'Legal sub-tabs'}
          className="flex flex-wrap items-center gap-1.5"
        >
          {activeSection.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeSubTab === tab.id}
              onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeSubTab === tab.id
                  ? 'bg-amber-600 font-semibold text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>{tr ? tab.labelTr : tab.labelEn}</span>
            </button>
          ))}
        </div>
      </div>

      {/* The record tabs. Everything below them is narrative held in this
          file; everything here is a row somebody entered. */}
      {activeCase && activeSubTab === 'hearings' && (
        <HearingList caseId={activeCase.id} canWrite={canKeepRecord} />
      )}
      {activeCase && activeSubTab === 'filings' && (
        <FilingList caseId={activeCase.id} canWrite={canKeepRecord} />
      )}
      {activeCase && activeSubTab === 'orders' && (
        <OrderList
          caseId={activeCase.id}
          canWrite={canKeepRecord}
          canOblige={actsAs(authority.data, ...ASSESSORS)}
        />
      )}
      {activeCase && activeSubTab === 'evidence' && (
        <EvidenceList caseId={activeCase.id} canWrite={canKeepRecord} />
      )}
      {activeCase && activeSubTab === 'counsel' && (
        <CounselPanel caseId={activeCase.id} canManage={canManageCounsel} />
      )}

      {!activeCase &&
        ['hearings', 'filings', 'orders', 'evidence', 'counsel'].includes(activeSubTab) && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            {tr
              ? 'Henüz kayıtlı dava dosyası yok. Duruşma, layiha ve karar kayıtları bir dosyaya bağlıdır.'
              : 'No case file is recorded yet. Hearings, filings and orders all hang off one.'}
          </div>
        )}

      {/* Subtab Content: Hearing Brief (28 Sept 2026) */}
      {/* M5-12 bunu kelimesi kelimesine istiyordu: "beklenen sorular, cevaplar,
          içtihat, savunma sütunları — veri olarak, koda gömülü değil". 200
          satır gömülüydü, ve `loadHearingBrief()` null döndüren bir fonksiyon
          olarak duruyordu. Brifingin başlığı için tablo yok: heyet
          `hearings.bench`, dava adı `legal_cases`, avukat `case_counsel`. */}
      {activeCase && activeSubTab === 'hearing_brief' && <HearingBrief caseId={activeCase.id} />}

      {/* Subtab Content: Bench Q&A (Part E) */}
      {/* Cevabı yazılmamış soru gizlenmiyor, sayılıyor: hazırlıkta eksik olan
          şey listede olmayan değil, cevabı olmayandır. */}
      {activeCase && activeSubTab === 'bench_qa' && <BenchQuestions caseId={activeCase.id} />}

      {/* Subtab Content: Legal Authorities (Part F) */}
      {/* İçtihat kütüphanesi (M5-13): atıf, kullanım amacı, lehimize/aleyhimize,
          ilke özeti — gereksinimin istediği dört şey. Aleyhe olanlar aynı
          listede ve ayrı rozetle: yalnızca lehe olanı tutan bir kütüphane,
          karşı tarafın kararını duruşmada ilk kez gösterir. */}
      {activeCase && activeSubTab === 'authorities' && <AuthorityLibrary caseId={activeCase.id} />}

      {/* Subtab Content: Overview */}
      {activeSubTab === 'overview' && !activeCase && (
        <EmptyState
          icon={FolderOpen}
          title={tr ? 'Kayıtlı dava dosyası yok' : 'No case files on record'}
          description={
            tr
              ? 'Henüz dava dosyası kaydedilmemiş. Yukarıdaki düğmeyle ilk dosyayı ekleyin.'
              : 'No case file recorded yet. Use the button above to add the first one.'
          }
          action={
            <button
              onClick={() => setShowNewMotionModal(true)}
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tr ? 'İlk Dosyayı Kaydet' : 'Log First Filing'}</span>
            </button>
          }
        />
      )}

      {activeSubTab === 'overview' && activeCase && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-xs font-mono text-amber-800 font-bold uppercase">
                    {activeCase.caseNumber}
                  </span>
                  <h2 className="text-base font-bold text-slate-900 mt-0.5">{activeCase.title}</h2>
                </div>
                <span className="text-sm font-semibold px-2.5 py-1 rounded bg-amber-50 border border-amber-300 text-amber-800 font-mono">
                  {tr ? 'ÖNCELİKLİ DOSYA' : 'PRIORITY LISTING'}
                </span>
              </div>

              <div className="text-sm text-slate-700 space-y-2">
                <p className="leading-relaxed">
                  {tr ? activeCase.descriptionTr : activeCase.descriptionEn}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-xs font-semibold uppercase">
                    {tr ? 'Temyiz Edenler (Appellants)' : 'Appellants'}
                  </div>
                  <div className="text-slate-800 mt-1 font-medium">
                    Zayed Bin Sultan Al Nahyan Charitable & Humanitarian Foundation & African
                    University Trust of Kenya
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-xs font-semibold uppercase">
                    {tr ? 'Karşı Taraf (Respondents)' : 'Respondents'}
                  </div>
                  <div className="text-slate-800 mt-1 font-medium">
                    Kazungu Moli Chogo and 6 Others (1st-7th Respondents / Moli Family)
                  </div>
                </div>
              </div>

              {/* Five Core Case Files Reference */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <FolderOpen className="w-4 h-4 text-amber-600" />
                  <span>
                    {tr ? 'Takip Edilen 5 Dava Dosyası Özeti' : '5 Followed Dispute Files Overview'}
                  </span>
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-amber-800">
                        1. Civil Appeal No. E062 of 2025
                      </span>
                      <span className="text-slate-500 ml-2">
                        Court of Appeal — {tr ? 'ASIL DAVA / Derdest' : 'MAIN APPEAL / Ongoing'}
                      </span>
                    </div>
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-mono">
                      Status Quo Active
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">2. MISC No. 134 of 2013</span>
                      <span className="text-slate-500 ml-2">
                        Mombasa ELC —{' '}
                        {tr
                          ? 'Olumsuz Zilyetlik & Tapu İptali'
                          : 'Adverse Possession & Title Cancellation'}
                      </span>
                    </div>
                    <span className="text-xs text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-mono">
                      {tr ? 'Temyiz Edilen Karar' : 'Challenged Ruling'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">3. ELC No. 52 of 2022</span>
                      <span className="text-slate-500 ml-2">
                        {tr
                          ? 'NLC Başkanına Karşı Yargısal Denetim'
                          : 'Judicial Review vs NLC Chairman'}
                      </span>
                    </div>
                    <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-mono">
                      {tr ? '134/2013 ile Birleştirildi' : 'Consolidated into 134/2013'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">4. MIC No. 103 of 2012</span>
                      <span className="text-slate-500 ml-2">
                        Ex Parte Bronson Hare Chogo —{' '}
                        {tr ? 'Tahliye Tebligatları' : 'Eviction Notices'}
                      </span>
                    </div>
                    <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 font-mono">
                      {tr ? 'Delil Gizleme İspatı' : 'Material Non-Disclosure Weapon'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">5. NLC Utange Majaoni</span>
                      <span className="text-slate-500 ml-2">
                        {tr
                          ? 'Milli Arazi Komisyonu Tarihsel Haksızlık İddiası'
                          : 'National Land Commission Historical Injustice Claim'}
                      </span>
                    </div>
                    <span className="text-xs text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 font-mono">
                      {tr ? '2019 Raporu Dava Konusu' : 'Challenged 2019 Finding'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Case Orders & Actions */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                {tr ? 'Duruşma ve Karar Geçmişi' : 'Key Orders & Decrees'}
              </h3>
              <div className="space-y-3 text-sm">
                {caseOrders.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {tr
                      ? 'Bu dosya için kayıtlı mahkeme kararı yok.'
                      : 'No court order recorded on this file.'}
                  </p>
                ) : (
                  caseOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-amber-800 font-bold">{ord.madeOn}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs uppercase font-mono ${
                            ord.state === 'in_force'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {ord.state.replace('_', ' ')}
                        </span>
                      </div>
                      {ord.referenceNo && (
                        <div className="font-semibold text-slate-900">{ord.referenceNo}</div>
                      )}
                      <p className="text-slate-600 text-sm leading-relaxed">
                        {(tr ? ord.textTr : ord.textEn) ?? ord.textEn ?? ord.textTr}
                      </p>
                      {ord.madeBy && <p className="text-slate-500 text-sm">{ord.madeBy}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Link to Documents */}
            <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl space-y-2">
              <div className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-amber-600" />
                <span>{tr ? 'Dava Layihaları ve Evrakları' : 'Case Trial Bundle Files'}</span>
              </div>
              <p className="text-sm text-slate-700">
                {tr
                  ? 'Kadzitu Moli 2012 tahliye makbuzu, 60 yıllık kira senedi ve onaylı tapu itirazlarını inceleyin.'
                  : 'Examine Kadzitu Moli 2012 payment receipt, 60-year lease and title certificates in vault.'}
              </p>
              <button
                onClick={() => navigate('/documents')}
                className="text-sm text-amber-800 font-semibold underline hover:text-amber-950 cursor-pointer"
              >
                {tr ? 'Belge Kasasını Aç' : 'Access Vault'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtab Content: Grounds of Appeal */}
      {/* İtirazlar kayıttan (M5-17). Dokuzu koda gömülü bir dizideydi ve hiçbir
          gereksinim satırı onları istemiyordu — satır bu turda yazıldı. */}
      {activeCase && activeSubTab === 'grounds' && <AppealGrounds caseId={activeCase.id} />}

      {/* Subtab Content: Action Plan */}
      {/* Ziyaret planı numaralı bir strateji metniydi ve her adımı aslında bir
          aksiyon. Aksiyonun kütüğü sorumlu ile tarihi zorunlu tutuyor (M3-02);
          gömülü plan ikisini de taşımıyordu. 0053 `action_items`'a
          `legal_case_id` ekledi, yani dosyadan doğan aksiyon dosyada görünüyor
          — kronolojide aynı bağ 0024'ten beri var. */}
      {activeCase && activeSubTab === 'action_plan' && <CaseActions legalCaseId={activeCase.id} />}

      {/* Subtab Content: Who is Who */}
      {/* Taraflar artık kayıttan geliyor (M5-02). Burada altı kart koda gömülü
          duruyordu — iki avukat, iki tanık, bir davacı ve heyet — isimleriyle,
          bürolarıyla ve haklarındaki değerlendirmelerle. `case_parties` tablosu
          0009'dan beri vardı ve hiçbir yerden okunmuyordu, yani veri kaynak
          kodda tutuluyordu (CLAUDE.md §4).

          Avukatlar burada değil: `case_counsel` onları tutuyor ve yan sekmedeki
          `CounselPanel` okuyor. Gömülü liste ikisini de gösteriyordu, yani aynı
          iki avukat aynı bölümün iki sekmesinde biri kayıttan biri sabit
          metinden geliyordu; sapan kopya her zaman ikincisidir. */}
      {activeCase && activeSubTab === 'who_is_who' && <PartyList caseId={activeCase.id} />}

      {/* Subtab Content: Timeline */}
      {/* Tarihçe de kayıttan (M5-13). Dokuz kayıtlık 30 yıllık kronoloji koda
          gömülü bir dizideydi: hiçbiri bir belgeye bağlı değildi ve üçünde
          İngilizce ile Türkçe esaslı olarak farklı şey söylüyordu — biri
          "void ab initio", biri bir gizleme iddiası, biri heyetin adları.
          Hangisinin doğru olduğu bu ekrandan bilinemiyordu.

          `chronology_entries` aynı şeyi tutuyor ve fazlasını istiyor: her kayıt
          ya bir belgeye ya yazılı bir kaynak notuna bağlı olmak zorunda. Panel
          `/plan`'da zaten bu kütüğü okuyor; davaya göre süzülüyor. */}
      {activeCase && activeSubTab === 'timeline' && <ChronologyPanel caseId={activeCase.id} />}

      {/* New Motion Modal */}
      {showNewMotionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-600" />
                <span>
                  {tr ? 'Yeni Hukuki Dilekçe / Başvuru Kaydı' : 'Log Legal Motion / Pleading'}
                </span>
              </h3>
              <button
                onClick={() => setShowNewMotionModal(false)}
                className="text-slate-500 hover:text-slate-700 text-base cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMotion} className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {tr ? 'Dilekçe / Başvuru Başlığı:' : 'Motion / Pleading Title:'}
                </label>
                <input
                  type="text"
                  required
                  value={motionTitle}
                  onChange={(e) => setMotionTitle(e.target.value)}
                  placeholder={
                    tr
                      ? 'Örn: Notice of Motion under Certificate of Urgency (Weatherproofing)'
                      : 'e.g. Urgent Certificate of Motion for Weatherproofing Variation'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {tr ? 'İlgili Mahkeme / Merci:' : 'Target Court / Registry:'}
                </label>
                <select
                  value={motionCourt}
                  onChange={(e) => setMotionCourt(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                >
                  <option value="Court of Appeal (Mombasa)">
                    Court of Appeal (Mombasa Yargıtay)
                  </option>
                  <option value="Environment and Land Court (ELC)">
                    Environment and Land Court (ELC)
                  </option>
                  <option value="National Land Commission (NLC)">
                    National Land Commission (NLC)
                  </option>
                  <option value="High Court of Kenya">High Court of Kenya</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {tr ? 'Hukuki Gerekçe & Açıklama:' : 'Legal Grounds & Summary:'}
                </label>
                <textarea
                  rows={3}
                  value={motionDetail}
                  onChange={(e) => setMotionDetail(e.target.value)}
                  placeholder={
                    tr
                      ? 'Dilekçenin temel dayanağı, eklenen deliller ve beklenen karar...'
                      : 'Grounds for motion, expert affidavits attached, and specific reliefs sought...'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewMotionModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm cursor-pointer font-medium"
                >
                  {tr ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors cursor-pointer shadow-xs"
                >
                  {tr ? 'Kaydet ve Dosyaya Ekle' : 'Save & Bind to File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* The embedded assistant is gone from here, and the instruction it
          carried is why: it asked a model for "concise, legally sound
          analysis", which is a legal opinion, and M13-08 says the assistant
          does not produce one. It also handed over JSON.stringify(activeCase)
          as context, with no notion of who was asking or what tier the case
          sat at. Both are fixed on the Assistant screen, where retrieval runs
          under the reader's own token and restricted material never reaches
          the model at all. */}
    </div>
  );
};
