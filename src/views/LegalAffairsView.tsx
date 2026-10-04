import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import { QueryStatus } from '../components/QueryStatus';
import {
  Scale,
  ShieldCheck,
  FileText,
  Plus,
  Clock,
  UserCheck,
  FileCheck,
  FolderOpen,
  BookOpen,
  HelpCircle,
  Gavel,
  TriangleAlert,
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import { CaseStrip } from '../components/legal/CaseStrip';
import { HearingList } from '../components/legal/HearingList';
import { FilingList } from '../components/legal/FilingList';
import { OrderList } from '../components/legal/OrderList';
import { EvidenceList } from '../components/legal/EvidenceList';
import { CounselPanel } from '../components/legal/CounselPanel';
import { useAuthority } from '../api/adminHooks';
import { ASSESSORS, actsAs } from '../lib/authority';
import { EmptyState } from '../components/EmptyState';
import type { BenchQuestion, LegalAuthority } from '../types';

interface ContemptDefencePillar {
  id: string;
  titleEn: string;
  titleTr: string;
  detailEn: string;
  detailTr: string;
}

interface HearingBrief {
  bench: string;
  caseTitle: string;
  counselOnRecord: string;
  contemptDefencePillars: ContemptDefencePillar[];
  benchQuestions: BenchQuestion[];
  authorities: LegalAuthority[];
}

/**
 * No hearing brief is stored anywhere yet. It used to be read off an untyped
 * stub whose fields were mostly missing, which crashed the Bench Q&A tab the
 * moment it was opened. This stays a function so the call sites already have
 * the shape they will need once briefs are fetched like any other record.
 */
function loadHearingBrief(): HearingBrief | null {
  return null;
}

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
  const [qSearch, setQSearch] = useState('');

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
  const hearingBrief = loadHearingBrief();
  const benchQuestions = hearingBrief?.benchQuestions ?? [];
  const authorities = hearingBrief?.authorities ?? [];

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
            {language === 'tr' ? 'Doğrulanmamış içerik' : 'Unverified content'}
          </div>
          <p className="leading-relaxed text-amber-900/80">
            {language === 'tr'
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
              {language === 'tr'
                ? 'Hukuk Müşavirliği & Temyiz Portföyü'
                : 'Appellate Defense & Legal Affairs'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {language === 'tr' ? 'Hukuk İşleri' : 'Legal Affairs'}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowNewMotionModal(true)}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {language === 'tr' ? 'Acil Dilekçe / Layiha Kaydet' : 'File Motion / Pleading'}
            </span>
          </button>
        </div>
      </div>

      {/* Status Quo Official Ruling Box (9 Feb 2026) */}
      <div className="bg-white border-2 border-emerald-500/50 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm uppercase tracking-wider">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>
              {language === 'tr'
                ? 'Yargıtay Heyeti Resmî Kararı — Mevcut Durumun Korunması (Status Quo)'
                : 'Court of Appeal Injunction — Status Quo Order (9 February 2026)'}
            </span>
          </div>
          <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {language === 'tr'
              ? 'Heyet: Mohammed · Laibuta · Ngenye-Macharia'
              : 'Judges: Mohammed · Laibuta · Ngenye-Macharia'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'tr' ? '1. Sınırların Korunması' : '1. Boundary Protection'}
            </div>
            <p className="text-slate-600 text-xs leading-relaxed">
              {language === 'tr'
                ? 'Moli ailesi (1.–7. davalılar) sadece fiilen işgal ettikleri 20 dönümlük (5 acre) alanda kalmaya devam edecektir.'
                : 'Claimants strictly confined to the 5-acre enclave they actually occupied during site survey.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'tr' ? '2. Satış ve Devir Yasağı' : '2. Prohibition of Sale'}
            </div>
            <p className="text-slate-600 text-xs leading-relaxed">
              {language === 'tr'
                ? 'Temyiz sonuçlanıncaya kadar arazinin hiçbir kısmı üçüncü kişilere devredilemez, satılamaz veya bölünemez.'
                : 'No party may sell, subdivide or transfer any portion of the 84-acre parcel to third parties.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'tr' ? '3. Öncelikli Yargılama' : '3. Priority Hearing'}
            </div>
            <p className="text-slate-600 text-xs leading-relaxed">
              {language === 'tr'
                ? 'Adaletin gecikmemesi amacıyla temyiz davasının sıradan dosyaların önüne alınarak öncelikli görülmesine karar verildi.'
                : 'Expedited calendar granted ahead of standard queue due to magnitude of university investment.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'tr' ? '4. İnşaatların Durdurulması' : '4. Suspension of Works'}
            </div>
            <p className="text-slate-600 text-xs leading-relaxed">
              {language === 'tr'
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
          aria-label={language === 'tr' ? 'Hukuk bölümleri' : 'Legal sections'}
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
                {language === 'tr' ? section.labelTr : section.labelEn}
              </button>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label={language === 'tr' ? 'Hukuk sekmeleri' : 'Legal sub-tabs'}
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
              <span>{language === 'tr' ? tab.labelTr : tab.labelEn}</span>
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
            {language === 'tr'
              ? 'Henüz kayıtlı dava dosyası yok. Duruşma, layiha ve karar kayıtları bir dosyaya bağlıdır.'
              : 'No case file is recorded yet. Hearings, filings and orders all hang off one.'}
          </div>
        )}

      {/* Subtab Content: Hearing Brief (28 Sept 2026) */}
      {activeSubTab === 'hearing_brief' && (
        <div className="space-y-6">
          {/* Executive Privileged Summary Banner */}
          <div className="bg-white border-2 border-amber-500/50 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded">
                    {language === 'tr' ? 'RESMİ DURUŞMA BRİFİNGİ' : 'PRIVILEGED HEARING BRIEF'}
                  </span>
                  <span className="text-sm text-slate-500 font-mono">
                    {language === 'tr' ? 'Heyet: ' : 'Coram: '}
                    {hearingBrief?.bench ?? (language === 'tr' ? 'kayıtlı değil' : 'not recorded')}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-1">
                  {hearingBrief?.caseTitle ??
                    (language === 'tr'
                      ? 'Sisteme kayıtlı duruşma brifingi yok'
                      : 'No hearing brief on record')}
                </h2>
                <div className="text-sm text-amber-800 font-medium mt-0.5">
                  {language === 'tr' ? 'Savunma Avukatları: ' : 'Counsel on record: '}
                  {hearingBrief?.counselOnRecord ??
                    (language === 'tr' ? 'kayıtlı değil' : 'not recorded')}
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  onClick={() => navigate('/documents')}
                  className="inline-flex items-center gap-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    {language === 'tr' ? 'Tam Layihayı Kasadan Aç' : 'Open Full Brief PDF'}
                  </span>
                </button>
              </div>
            </div>

            {/* Two Motions at Play */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 space-y-2">
                <span className="text-xs font-mono text-emerald-800 font-bold uppercase">
                  {language === 'tr'
                    ? '1. Başvuru: Yürütmeyi Durdurma (23 Temmuz 2025)'
                    : 'Motion 1: Stay Application (23 July 2025)'}
                </span>
                <h3 className="font-bold text-slate-900">Notice of Motion under Rule 5(2)(b)</h3>
                <p className="text-slate-700 leading-relaxed text-xs">
                  {language === 'tr'
                    ? 'Pozisyonumuz: Destekliyoruz; ancak bu başvuru 9 Şubat 2026 tarihli mutabakat emri (consent order) ile zaten nihayete erdirilmiştir (compromised). Heyetten bunu kayda geçirmesini ve E218/2025 numaralı asıl temyize öncelikli duruşma günü verilmesini talep ediyoruz.'
                    : 'Our Position: In support, but the motion was already compromised by consent on 9th February 2026 on terms running until hearing and determination of appeal. Nothing remains to be determined on this motion.'}
                </p>
                <div className="text-xs text-emerald-800 font-semibold pt-1">
                  {language === 'tr'
                    ? 'Durum: Mutabakat Kararı ile Sonuçlandı'
                    : 'Status: Compromised by Consent Order'}
                </div>
              </div>

              <div className="bg-rose-50/40 p-4 rounded-xl border border-rose-200 space-y-2">
                <span className="text-xs font-mono text-rose-800 font-bold uppercase">
                  {language === 'tr'
                    ? '2. Başvuru: İtaatsizlik Talebi (19 Haziran 2026)'
                    : 'Motion 2: Contempt Application (19 June 2026)'}
                </span>
                <h3 className="font-bold text-slate-900">
                  {language === 'tr'
                    ? 'Chogo Ailesinin Başvurusu (Sherman Nyongesa & Mutubia)'
                    : 'Filed by Chogos (Sherman Nyongesa & Mutubia)'}
                </h3>
                <p className="text-slate-700 leading-relaxed text-xs">
                  {language === 'tr'
                    ? 'Pozisyonumuz: Şiddetle Karşı Çıkıyoruz (Opposing). AUTK hiçbir inşaat yapmamıştır. Küçük çevre duvarı onarımı solely Zayed Vakfı tarafından Yazı İşleri’ne önceden yazılı bildirimle yapılmıştır ve mevcut duvarı onarmak 1(b) ihlali değildir.'
                    : 'Our Position: Opposing. AUTK undertook NO works. The wall repair was announced and carried out solely by the Foundation. Order 1(b) restrains only walls not already in place; repairing an existing standing wall is no breach.'}
                </p>
                <div className="text-xs text-rose-800 font-semibold pt-1">
                  {language === 'tr'
                    ? 'Durum: Kusurlu Delil · Masraflarla Reddi Talep Edildi'
                    : 'Status: Defective Evidence · To Be Dismissed With Costs'}
                </div>
              </div>
            </div>
          </div>

          {/* 4 Pillars of Defense Against Contempt */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                {language === 'tr'
                  ? 'İtaatsizlik İddialarına Karşı 4 Temel Savunma Sütunu (Theory of the Case)'
                  : 'Theory of Defense: 4 Pillars Opposing Contempt Committal'}
              </span>
            </h3>

            {hearingBrief && hearingBrief.contemptDefencePillars.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {hearingBrief.contemptDefencePillars.map((pillar) => (
                  <div
                    key={pillar.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                  >
                    <h4 className="font-bold text-amber-800 text-sm">
                      {language === 'tr' ? pillar.titleTr : pillar.titleEn}
                    </h4>
                    <p className="text-slate-700 text-xs leading-relaxed">
                      {language === 'tr' ? pillar.detailTr : pillar.detailEn}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                tone="unsourced"
                title={
                  language === 'tr'
                    ? 'Savunma sütunları henüz kayıtlı değil'
                    : 'No defence pillars on record'
                }
                description={
                  language === 'tr'
                    ? 'Bu bölüm sistemde tutulan bir duruşma brifingine bağlanacak. Şu anda böyle bir kayıt yok.'
                    : 'This section will read from a hearing brief held in the system. No such record exists yet.'
                }
              />
            )}
          </div>

          {/* Fallback Positions & Tactical Scripts */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Gavel className="w-4 h-4 text-purple-600" />
              <span>
                {language === 'tr'
                  ? 'Duruşma Yedek Stratejileri (Part D: Fallback Positions)'
                  : 'Part D: Tactical Fallback Positions'}
              </span>
            </h3>
            <p className="text-sm text-slate-500">
              {language === 'tr'
                ? 'Müvekkillerimiz hiçbir ihlali kabul etmemektedir (no undertaking). Heyet duvar tamiratı konusunda tereddüt ederse:'
                : 'Clients stand on strict compliance. If the bench appears troubled by the wall repair, counsel follows these sequential fallback positions:'}
            </p>
            <div className="space-y-2 text-sm">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-semibold text-slate-900">
                  {language === 'tr'
                    ? '1. Yalnızca Zayed Vakfı’nın Eylemi:'
                    : '1. Foundation’s Act Alone:'}
                </span>
                <span className="text-slate-700 ml-1.5">
                  {language === 'tr'
                    ? 'Küçük duvar onarımı solely Zayed Vakfı tarafından yapılmıştır. Afrika Üniversitesi hiçbir inşaat yapmamıştır; heyetin bir tereddüdü varsa bu yalnızca mahkeme ile Zayed Vakfı arasındadır.'
                    : 'The repair was solely the Zayed Foundation’s undertaking. Any concern is strictly between the Court and the Foundation.'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-semibold text-slate-900">
                  {language === 'tr'
                    ? '2. Kasıt ve Kötü Niyetin Olmadığı (Mala Fides Yokluğu):'
                    : '2. Negation of Wilful / Mala Fides Breach:'}
                </span>
                <span className="text-slate-700 ml-1.5">
                  {language === 'tr'
                    ? '11 Mayıs 2026 tarihinde Yargıtay Yazı İşleri Müdürlüğü’ne yazılı bildirim yapılmış olması, kasıtlı ve kötü niyetli ihlal iddiasını tamamen ortadan kaldırır (Consolidated Fish v Zive).'
                    : 'The written notice of 11th May 2026 copied to the Deputy Registrar completely negates wilfulness and mala fides (Consolidated Fish v Zive).'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-semibold text-slate-900">
                  {language === 'tr'
                    ? '3. İleriye Dönük Açıklık Getirilmesi:'
                    : '3. Prospective Clarification:'}
                </span>
                <span className="text-slate-700 ml-1.5">
                  {language === 'tr'
                    ? 'Heyet 1(b) emrini geleceğe dönük açıklığa kavuşturmak isterse, müvekkillerimiz mahkemenin vereceği her türlü talimata uyacaktır (geçmişe dair bir ihlal kabul edilmeksizin).'
                    : 'If minded to clarify Order 1(b) for the future, state that clients will abide by any directions (without making an undertaking or conceding past acts).'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-semibold text-slate-900">
                  {language === 'tr'
                    ? '4. Şahsi Sorumluluk Güvencesi:'
                    : '4. Individual Protection:'}
                </span>
                <span className="text-slate-700 ml-1.5">
                  {language === 'tr'
                    ? 'Mütevelli heyetinin yenilenmesinden sonra eski şahsi mütevellilerin hiçbir kişisel eylemi veya tasarrufu olmadığı için hiç kimse hapse sevk edilemez (committal to civil jail).'
                    : 'No individual can be committed without proof of personal participation, especially after board reconstitution.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab Content: Bench Q&A (Part E) */}
      {activeSubTab === 'bench_qa' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-600" />
                <span>
                  {language === 'tr'
                    ? 'Hâkimler Heyetinden Beklenen Sorular ve Taktik Cevaplar (Part E)'
                    : 'Part E: Anticipated Questions from the Bench & Tactical Answers'}
                </span>
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {language === 'tr'
                  ? '28 Eylül 2026 Pazartesi Duruşması İçin Avukatlarca Hazırlanan Taktik Rehber'
                  : 'Prepared by Nzamsa Sankale & Co for Monday, 28th September 2026 Hearing'}
              </p>
            </div>

            {/* Filter and Search */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
                placeholder={
                  language === 'tr' ? 'Soru veya cevap ara...' : 'Search question or response...'
                }
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 w-48 sm:w-60"
              />
            </div>
          </div>

          {benchQuestions.length === 0 && (
            <EmptyState
              icon={HelpCircle}
              tone="unsourced"
              title={
                language === 'tr'
                  ? 'Hâkim soru-cevapları henüz kayıtlı değil'
                  : 'No anticipated bench questions on record'
              }
              description={
                language === 'tr'
                  ? 'Bu bölüm sistemde tutulan bir duruşma brifingine bağlanacak. Şu anda böyle bir kayıt yok.'
                  : 'This section will read from a hearing brief held in the system. No such record exists yet.'
              }
            />
          )}

          <div className="space-y-4">
            {benchQuestions
              .filter((item) => {
                if (!qSearch) return true;
                const q = qSearch.toLowerCase();
                return (
                  item.question.toLowerCase().includes(q) ||
                  item.answer.toLowerCase().includes(q) ||
                  item.questionTr.toLowerCase().includes(q) ||
                  item.answerTr.toLowerCase().includes(q)
                );
              })
              .map((qa, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-amber-800 font-mono flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs">
                        {idx + 1}
                      </span>
                      <span>{language === 'tr' ? 'Hâkim Sorusu:' : 'Bench Question:'}</span>
                    </span>
                    <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                      {qa.category.replace('_', ' ')}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-slate-900">
                    "{language === 'tr' ? qa.questionTr : qa.question}"
                  </h4>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1 shadow-xs">
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      {language === 'tr'
                        ? 'Önerilen Cevap & Hukuki Not:'
                        : 'Suggested Answer / Note:'}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed font-sans">
                      {language === 'tr' ? qa.answerTr : qa.answer}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Subtab Content: Legal Authorities (Part F) */}
      {activeSubTab === 'authorities' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <span>
                {language === 'tr'
                  ? 'Hukuki Dayanaklar ve Emsal Kararlar (Part F: Authorities - Status & Use)'
                  : 'Part F: Legal Authorities, Case Law & Judicial Precedents'}
              </span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {language === 'tr'
                ? 'İtaatsizlik, Yürütmeyi Durdurma ve Olumsuz Zilyetlik Konusundaki Bağlayıcı Yargıtay İçtihatları'
                : 'Binding Court of Appeal Precedents on Contempt, Stay of Execution, and Adverse Possession'}
            </p>
          </div>

          {authorities.length === 0 && (
            <EmptyState
              icon={BookOpen}
              tone="unsourced"
              title={
                language === 'tr'
                  ? 'İçtihat listesi henüz kayıtlı değil'
                  : 'No legal authorities on record'
              }
              description={
                language === 'tr'
                  ? 'Bu bölüm sistemde tutulan bir duruşma brifingine bağlanacak. Şu anda böyle bir kayıt yok.'
                  : 'This section will read from a hearing brief held in the system. No such record exists yet.'
              }
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {authorities.map((auth, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 ${
                  auth.party === 'ours'
                    ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
                    : 'bg-rose-50/40 border-rose-200 hover:border-rose-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`px-2 py-0.5 rounded text-xs uppercase font-mono font-bold ${
                        auth.party === 'ours'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {auth.party === 'ours'
                        ? language === 'tr'
                          ? 'Bizim İçtihadımız'
                          : 'Our Authority'
                        : language === 'tr'
                          ? 'Karşı Tarafın İçtihadı'
                          : 'Their Authority (Distinguishable)'}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">{auth.citation}</h4>
                  <div className="text-xs text-amber-800 font-mono font-medium">{auth.use}</div>
                  <p className="text-xs text-slate-700 leading-relaxed pt-1">
                    {language === 'tr' ? auth.principleTr : auth.principleEn}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Jurisdictional Note */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 space-y-1">
            <span className="font-bold text-amber-800 text-xs uppercase tracking-wider">
              {language === 'tr'
                ? 'Yargı Yetkisi Notu (Jurisdiction Note):'
                : 'Court Jurisdiction Note:'}
            </span>
            <p className="text-xs leading-relaxed">
              {language === 'tr'
                ? "Karşı tarafın itaatsizlik başvurusu sehven Yargıtay Yasası'nın mülga 35. maddesine dayanmaktadır. Mukuha davasında (paragraf 13) belirtildiği üzere 35. madde 2016 yılında yürürlükten kaldırılmıştır; itaatsizlik yetkisi Yargı Teşkilatı Yasası s.5 maddesinden kaynaklanmaktadır. Avukatlarımız bunu usuli bir itiraz olarak öne sürmeyecek, doğrudan esasa ve hiçbir ihlalin bulunmadığı gerçeğine dayanacaktır."
                : 'The contempt motion mistakenly cites s.35 of the Court of Appeal (Organization and Administration) Act. As noted in Mukuha (para 13), s.35 was deleted in 2016; contempt jurisdiction stems from s.5 of the Judicature Act. Counsel will not take this as a technical objection, standing rather on substantive innocence and complete lack of breach.'}
            </p>
          </div>
        </div>
      )}

      {/* Subtab Content: Overview */}
      {activeSubTab === 'overview' && !activeCase && (
        <EmptyState
          icon={FolderOpen}
          title={language === 'tr' ? 'Kayıtlı dava dosyası yok' : 'No case files on record'}
          description={
            language === 'tr'
              ? 'Henüz hiçbir dava dosyası kaydedilmemiş. Yukarıdaki "Acil Dilekçe / Layiha Kaydet" düğmesiyle ilk dosyayı ekleyebilirsiniz.'
              : 'No case file has been recorded yet. Use "File Motion / Pleading" above to add the first one.'
          }
          action={
            <button
              onClick={() => setShowNewMotionModal(true)}
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'tr' ? 'İlk Dosyayı Kaydet' : 'Log First Filing'}</span>
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
                  {language === 'tr' ? 'ÖNCELİKLİ DOSYA' : 'PRIORITY LISTING'}
                </span>
              </div>

              <div className="text-sm text-slate-700 space-y-2">
                <p className="leading-relaxed">
                  {language === 'tr' ? activeCase.descriptionTr : activeCase.descriptionEn}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-xs font-semibold uppercase">
                    {language === 'tr' ? 'Temyiz Edenler (Appellants)' : 'Appellants'}
                  </div>
                  <div className="text-slate-800 mt-1 font-medium">
                    Zayed Bin Sultan Al Nahyan Charitable & Humanitarian Foundation & African
                    University Trust of Kenya
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-xs font-semibold uppercase">
                    {language === 'tr' ? 'Karşı Taraf (Respondents)' : 'Respondents'}
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
                    {language === 'tr'
                      ? 'Takip Edilen 5 Dava Dosyası Özeti'
                      : '5 Followed Dispute Files Overview'}
                  </span>
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-amber-800">
                        1. Civil Appeal No. E062 of 2025
                      </span>
                      <span className="text-slate-500 ml-2">
                        Court of Appeal —{' '}
                        {language === 'tr' ? 'ASIL DAVA / Derdest' : 'MAIN APPEAL / Ongoing'}
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
                        {language === 'tr'
                          ? 'Olumsuz Zilyetlik & Tapu İptali'
                          : 'Adverse Possession & Title Cancellation'}
                      </span>
                    </div>
                    <span className="text-xs text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-mono">
                      {language === 'tr' ? 'Temyiz Edilen Karar' : 'Challenged Ruling'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">3. ELC No. 52 of 2022</span>
                      <span className="text-slate-500 ml-2">
                        {language === 'tr'
                          ? 'NLC Başkanına Karşı Yargısal Denetim'
                          : 'Judicial Review vs NLC Chairman'}
                      </span>
                    </div>
                    <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-mono">
                      {language === 'tr'
                        ? '134/2013 ile Birleştirildi'
                        : 'Consolidated into 134/2013'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">4. MIC No. 103 of 2012</span>
                      <span className="text-slate-500 ml-2">
                        Ex Parte Bronson Hare Chogo —{' '}
                        {language === 'tr' ? 'Tahliye Tebligatları' : 'Eviction Notices'}
                      </span>
                    </div>
                    <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 font-mono">
                      {language === 'tr'
                        ? 'Delil Gizleme İspatı'
                        : 'Material Non-Disclosure Weapon'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">5. NLC Utange Majaoni</span>
                      <span className="text-slate-500 ml-2">
                        {language === 'tr'
                          ? 'Milli Arazi Komisyonu Tarihsel Haksızlık İddiası'
                          : 'National Land Commission Historical Injustice Claim'}
                      </span>
                    </div>
                    <span className="text-xs text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 font-mono">
                      {language === 'tr' ? '2019 Raporu Dava Konusu' : 'Challenged 2019 Finding'}
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
                {language === 'tr' ? 'Duruşma ve Karar Geçmişi' : 'Key Orders & Decrees'}
              </h3>
              <div className="space-y-3 text-sm">
                {caseOrders.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {language === 'tr'
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
                      <p className="text-slate-600 text-xs leading-relaxed">
                        {(language === 'tr' ? ord.textTr : ord.textEn) ?? ord.textEn ?? ord.textTr}
                      </p>
                      {ord.madeBy && <p className="text-slate-500 text-xs">{ord.madeBy}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Link to Documents */}
            <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl space-y-2">
              <div className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-amber-600" />
                <span>
                  {language === 'tr' ? 'Dava Layihaları ve Evrakları' : 'Case Trial Bundle Files'}
                </span>
              </div>
              <p className="text-xs text-slate-700">
                {language === 'tr'
                  ? 'Kadzitu Moli 2012 tahliye makbuzu, 60 yıllık kira senedi ve onaylı tapu itirazlarını inceleyin.'
                  : 'Examine Kadzitu Moli 2012 payment receipt, 60-year lease and title certificates in vault.'}
              </p>
              <button
                onClick={() => navigate('/documents')}
                className="text-sm text-amber-800 font-semibold underline hover:text-amber-950 cursor-pointer"
              >
                {language === 'tr' ? 'Belge Kasasını Aç' : 'Access Vault'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtab Content: Grounds of Appeal */}
      {activeSubTab === 'grounds' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-amber-600" />
              <span>
                {language === 'tr'
                  ? 'Temyiz İtiraznamesindeki 9 Temel Hukuki ve Maddi Hata (4 Aralık 2025)'
                  : 'Memorandum of Appeal: 9 Grounds of Law & Fact (4 December 2025)'}
              </span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Khatib & Company Advocates & Simon Karina Advocates on behalf of Zayed Foundation &
              AUTK
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            {[
              {
                num: '1',
                titleEn: 'Disregard of Right to Defence',
                titleTr: 'Savunma Hakkının Yok Sayılması',
                descEn:
                  'Judge misdirected himself in paragraph 142 by claiming the case was "undefended", when defendants mounted vigorous defense.',
                descTr:
                  'Hâkim 142. paragrafta davanın savunmasız bırakıldığını iddia etmiştir; oysa davalılar kararlı ve belgeli savunma yapmıştır.',
              },
              {
                num: '2',
                titleEn: 'Contradiction with Site Visit Report',
                titleTr: 'Saha Keşfi Raporu ile Kararın Çelişmesi',
                descEn:
                  'Court’s own locus in quo on 9 Feb 2024 established Moli family occupied ONLY 5 ACRES, yet judge unlawfully awarded all 84 acres.',
                descTr:
                  'Hâkimin 9 Şubat 2024 tarihli kendi keşif raporunda Moli ailesinin yalnızca 20 dönümü (5 acre) işgal ettiği sabitken, 340 dönümün tamamı verilmiştir.',
              },
              {
                num: '3',
                titleEn: 'Error as to Duration of Occupation',
                titleTr: 'Kesintisiz İşgal Süresi Hatası',
                descEn:
                  'Court wrongly held occupation was uninterrupted for 12 years, causing severe miscarriage of justice.',
                descTr:
                  'Mahkemenin zilyetliğin 12 yıl kesintisiz sürdüğü kabulü ağır adalet zafiyetine yol açmıştır.',
              },
              {
                num: '4',
                titleEn: 'Breach of the Five-Acre Boundary',
                titleTr: 'Yirmi Dönümlük (5 Acre) Sınırın İhlali',
                descEn:
                  'Adverse possession boundary exceeded: claimants could not legally claim adverse possession beyond their 5-acre enclave.',
                descTr:
                  'Olumsuz zilyetlik sınırları aşıldı: Davacılar 20 dönümlük yerleşimlerinin ötesindeki 320 dönümde zilyetlik iddia edemez.',
              },
              {
                num: '5',
                titleEn: 'Permissive vs Adverse Occupation',
                titleTr: 'Rızaya Dayalı Yerleşimin Hasmane Sayılması',
                descEn:
                  'Moli family entered the 5 acres with consent/permission of the owner. Permissive occupation cannot ripen into adverse possession (nec precario).',
                descTr:
                  'Moli ailesi araziye rıza ve izinle yerleşmiştir. İzinli yerleşim hukuken hasmane işgal (adverse possession) teşkil etmez.',
              },
              {
                num: '6',
                titleEn: 'Fatal Procedural Defect (Order 37 Rule 7)',
                titleTr: 'Ölümcül Usul Hatası (Onaylı Tapu Sureti)',
                descEn:
                  'Claimants violated mandatory statutory rules by failing to attach a certified extract of title to the Originating Summons.',
                descTr:
                  'Davacılar asıl dava celbine onaylı tapu suretini eklemeyerek emredici usul kuralını (Order 37 Rule 7) ihlal etmiştir.',
              },
              {
                num: '7',
                titleEn: 'Material Non-Disclosure Concealment',
                titleTr: 'Maddi Delil Gizleme (779.980 KShs Ödemesi)',
                descEn:
                  'Claimant Kadzitu Moli signed vacation agreement in Feb 2012 accepting KShs 779,980 compensation, concealed in bad faith.',
                descTr:
                  '5. Davacı Kadzitu Moli 2012’de 779.980 KShs tazminat alarak tahliye sözleşmesi imzalamış, bunu mahkemeden kötü niyetle gizlemiştir.',
              },
              {
                num: '8',
                titleEn: 'Disregard of Defendants’ Evidence',
                titleTr: 'Davalıların Delillerinin Göz Ardı Edilmesi',
                descEn:
                  'Judge rendered decision without analyzing trial bundle exhibits submitted by the university and Zayed Foundation.',
                descTr:
                  'Hâkim, üniversite ve Zayed Vakfı tarafından dosyaya sunulan onlarca yazılı delili incelemeden hüküm kurmuştur.',
              },
              {
                num: '9',
                titleEn: 'Unjust Award of Costs of Suit',
                titleTr: 'Yargılama Giderlerinin Haksız Yükletilmesi',
                descEn:
                  'Erred in imposing entire litigation costs on the appellant when foundation acted in good faith with millions invested.',
                descTr:
                  'Yüz milyonlarca şilin kamu yararına yatırım yapan vakfa yargılama giderlerinin yükletilmesi hukuka aykırıdır.',
              },
            ].map((ground) => (
              <div
                key={ground.num}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-amber-400 transition-colors space-y-2 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold text-sm flex items-center justify-center font-mono border border-amber-300">
                    {ground.num}
                  </span>
                  <span className="text-xs uppercase font-mono text-slate-500 font-semibold">
                    {language === 'tr' ? 'Hukuki ve Maddi Hata' : 'Error in Law & Fact'}
                  </span>
                </div>
                <div className="font-semibold text-slate-900">
                  {language === 'tr' ? ground.titleTr : ground.titleEn}
                </div>
                <p className="text-slate-600 leading-relaxed text-xs">
                  {language === 'tr' ? ground.descTr : ground.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtab Content: Action Plan */}
      {activeSubTab === 'action_plan' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>
                {language === 'tr'
                  ? 'Kenya Ziyareti Eylem Planı (Taarruz & Koruma Stratejisi)'
                  : 'Kenya Delegation Strategic Action Plan'}
              </span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Converting 9 February 2026 Status Quo & Priority Order into Complete Appellate Victory
            </p>
          </div>

          <div className="space-y-4 text-sm">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-800 uppercase tracking-wider text-xs">
                  {language === 'tr'
                    ? '1. Mevcut Durum Emrinin İnfazı ve Denetimi'
                    : '1. Enforcement of Status Quo Order'}
                </span>
                <span className="text-xs font-mono text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded font-semibold">
                  {language === 'tr' ? 'Aktif Devriye' : 'Active Patrol'}
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                {language === 'tr'
                  ? 'Davacılar ve yerel emlak komisyoncularının araziyi bölme (subdivision) veya satma girişimlerine karşı anında Mahkemeye İtaatsizlik (Contempt of Court) davası açılması. Harrison Mkala nöbetçi kulesi kayıtları ve koordinat tutanakları hazır tutulmaktadır.'
                  : 'Ensuring claimants remain strictly in the 5-acre enclave. Immediate Contempt of Court filings prepared if illicit subdivision brokers place boundary beacons on the remaining 79 acres.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-700 uppercase tracking-wider text-xs">
                  {language === 'tr'
                    ? '2. Mevcut Durum Emrinin Esnetilmesi (Çatı & Hava Koşulları)'
                    : '2. Variation of Status Quo (Weatherproofing Urgency)'}
                </span>
                <span className="text-xs font-mono text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded font-semibold">
                  {language === 'tr' ? '8 Gün İçinde Başvuru' : 'Filing in 8 Days'}
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                {language === 'tr'
                  ? 'Yargıtay Heyeti’ne acil başvuru (Certificate of Urgency): Blok A1 çatı kaplaması ve yalıtımının "yeni inşaat" değil, "mevcut dava konusunu koruma" (preservation of the suit property) olduğu; aksi halde yağmurlarla temyizin konusuz kalacağı (rendering appeal nugatory) Metraj Uzmanı Stephen Ndibui Kamau raporuyla sunulacaktır.'
                  : 'Filing Notice of Motion under Certificate of Urgency. Works such as roofing and waterproofing are not advancing new development but are preservatory measures. Exposed reinforced concrete left to monsoon rains will cause catastrophic decay, destroying the subject matter.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-700 uppercase tracking-wider text-xs">
                  {language === 'tr'
                    ? '3. 807M KShs Delil Denetimi (Trial Bundle Audit)'
                    : '3. KShs 807M Trial Bundle Audit'}
                </span>
                <span className="text-xs font-mono text-blue-800 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded font-semibold">
                  {language === 'tr' ? 'Denetlendi & Hazır' : 'Audited'}
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                {language === 'tr'
                  ? 'Üniversite ve Türk hayırseverler tarafından bugüne kadar yapılan 807.322.110 KShs tutarındaki tüm fatura, hakediş ve mimari planların tasdikli delil dosyası halinde Yargıtay’a ibrazı.'
                  : 'Complete binding of all civil works invoices, architectural plans, and 60-year lease encumbrances into the official Record of Appeal.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-700 uppercase tracking-wider text-xs">
                  {language === 'tr'
                    ? '4. Kıdemli Temyiz Avukatı (Senior Counsel - SC) Takviyesi'
                    : '4. Senior Counsel (SC) Appellate Representation'}
                </span>
                <span className="text-xs font-mono text-purple-800 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded font-semibold">
                  {language === 'tr' ? 'Görüşmeler Sürüyor' : 'Scouting Underway'}
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                {language === 'tr'
                  ? 'İlk derece mahkemesindeki usul zafiyetleri göz önüne alınarak, Yargıtay duruşmalarında Simon Karina ve Mohamed Faki Khatib ile koordineli çalışacak kıdemli bir Senior Counsel (SC) ile ikinci bir hukuki mütalaa alınması.'
                  : 'Engaging top-tier Kenyan appellate litigation counsel with Senior Counsel designation to bolster legal arguments and coordinate unified strategy with Khatib & Company.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Subtab Content: Who is Who */}
      {activeSubTab === 'who_is_who' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-600" />
              <span>
                {language === 'tr'
                  ? 'Kim Kimdir? — Taraflar, Avukatlar, Tanıklar ve Hâkimler'
                  : 'Who is Who: Parties, Witnesses, Counsel & Judges'}
              </span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {language === 'tr'
                ? 'Mombasa ELC ve Temyiz Mahkemesi Resmi Dava Kayıtlarından Çıkarılmıştır'
                : 'Extracted from Mombasa ELC & Court of Appeal Judicial Records'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            {/* Legal Counsel */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                {language === 'tr'
                  ? 'Hukuk Müşaviri (Savunma - Defense)'
                  : 'Legal Counsel (Defense)'}
              </span>
              <div className="font-bold text-slate-900 text-base">Mr. Simon Karina</div>
              <div className="text-slate-500 text-xs">Ndegwa Sitonik Karina Advocates</div>
              <p className="text-slate-600 text-xs">
                {language === 'tr'
                  ? 'Afrika Üniversitesi Vakfı ve mütevellilerini savunan baş avukat.'
                  : 'Lead advocate defending African University Trust and registered trustees.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                {language === 'tr'
                  ? 'Hukuk Müşaviri (Temyiz Eden - Appellant)'
                  : 'Legal Counsel (Appellant)'}
              </span>
              <div className="font-bold text-slate-900 text-base">Mr. Mohamed Faki Khatib</div>
              <div className="text-slate-500 text-xs">Khatib & Company Advocates</div>
              <p className="text-slate-600 text-xs">
                {language === 'tr'
                  ? 'Tapu sahibi Zayed Vakfı’nı (7. Davalı / Temyiz Eden) temsil eden baş avukat.'
                  : 'Lead advocate representing original title holder Zayed Foundation in appeal.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                {language === 'tr'
                  ? 'Mütevelli & Baş Tanık (DW-1)'
                  : 'Trustee & Key Witness (DW-1)'}
              </span>
              <div className="font-bold text-slate-900 text-base">Lucas Cosmas Fondo</div>
              <div className="text-slate-500 text-xs">Universal Education Foundation / AUTK</div>
              <p className="text-slate-600 text-xs">
                {language === 'tr'
                  ? 'Duruşmada arazideki 20 dönüm işgal / 320 dönüm üniversite durumunu kararlılıkla savunan baş tanık.'
                  : 'Main defense witness who confirmed physical 5-acre vs 79-acre campus demarcation.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                {language === 'tr'
                  ? 'Zayed Vakfı Direktörü (DW-2)'
                  : 'Zayed Foundation Director (DW-2)'}
              </span>
              <div className="font-bold text-slate-900 text-base">Abubakar Hassan Dindia</div>
              <div className="text-slate-500 text-xs">Zayed Bin Sultan Al Nahyan Foundation</div>
              <p className="text-slate-600 text-xs">
                {language === 'tr'
                  ? '2002 satın alımını ve 2012 60 yıllık kira devrini mahkemeye tevsik eden direktör.'
                  : 'Foundation director familiar with land purchase and leasehold agreements.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                {language === 'tr'
                  ? 'Kritik Davacı (5. Davacı)'
                  : 'Critical Claimant (5th Claimant)'}
              </span>
              <div className="font-bold text-slate-900 text-base">Kadzitu Moli Chogo</div>
              <div className="text-slate-500 text-xs">5th Claimant (Moli Family)</div>
              <p className="text-slate-600 text-xs">
                {language === 'tr'
                  ? '29 Şubat 2012’de üniversiteden 779.980 KShs tahliye tazminatı alıp sözleşme imzalayan kritik isim.'
                  : 'Signed the 2012 vacation agreement accepting KShs 779,980 compensation concealed from court.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                {language === 'tr'
                  ? 'Yargıtay Hâkimler Heyeti (Coram)'
                  : 'Court of Appeal Panel (Coram)'}
              </span>
              <div className="font-bold text-slate-900 text-base">
                JJ. Mohammed, Laibuta, Ngenye
              </div>
              <div className="text-slate-500 text-xs">Mombasa Court of Appeal (Yargıtay)</div>
              <p className="text-slate-600 text-xs">
                {language === 'tr'
                  ? '9 Şubat 2026’da Status Quo emrini veren ve öncelikli yargılama kararı alan kıdemli heyet.'
                  : 'Issued 9 Feb 2026 Status Quo order halting land sales and directing priority hearing.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Subtab Content: Timeline */}
      {activeSubTab === 'timeline' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <span>
                {language === 'tr'
                  ? '30 Yıllık Dava ve Mülkiyet Kronolojisi'
                  : '30-Year Property & Legal Chronicle'}
              </span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Plot No. MN/I/5141 (84 Acres / Dönüm) Utange/Majaoni, Mombasa
            </p>
          </div>

          <div className="relative border-l border-slate-200 ml-4 space-y-6 pl-6 text-sm">
            {[
              {
                year: '1993',
                titleEn: 'Patriarch Mzee Moli Chogo Passes Away',
                titleTr: 'Aile Atası Mzee Moli Chogo Vefat Ediyor',
                detailEn:
                  'Buried on ancestral portion of the land. Claimants allege multi-generational residence.',
                detailTr:
                  'Arazideki aile kabristanına defnedildi. Davacılar nesiller boyu burada yaşadıklarını iddia ediyor.',
              },
              {
                year: '1996',
                titleEn: 'Mohamed Yusuf Haji Registers Root Title',
                titleTr: 'Mohamed Yusuf Haji Kök Tapuyu Üzerine Çıkarıyor',
                detailEn:
                  'Former powerful Provincial Commissioner registered 84 acres; NLC later claimed root title was void ab initio.',
                detailTr: 'Dönemin Bölge Komiseri 340 dönümlük tapuyu üzerine tescil ettirdi.',
              },
              {
                year: '2002',
                titleEn: 'Zayed Foundation Purchases Land',
                titleTr: 'Zayed Vakfı Araziyi Satın Alıyor',
                detailEn:
                  'Purchased for educational charity. Gentlemen’s agreement allocated 5-acre enclave for Moli family.',
                detailTr:
                  'Eğitim kurumu kurmak amacıyla satın alındı. Moli ailesine 20 dönüm ayrılması hususunda mutabakata varıldı.',
              },
              {
                year: '2004 — 2005',
                titleEn: 'Perimeter Wall Demarcates 79 Acres vs 5 Acres',
                titleTr: 'Çevre Duvarı İnşa Ediliyor (320 dönüm kampüs / 20 dönüm aile)',
                detailEn:
                  'Foundation constructed permanent perimeter wall, isolating 79 acres for university and leaving 5 acres for Moli.',
                detailTr:
                  'Vakıf devasa bir çevre duvarı inşa etti: 320 dönüm üniversiteye ayrıldı, aile 20 dönümde kaldı.',
              },
              {
                year: '29 Feb 2012',
                titleEn: 'Critical Vacation Agreement & KShs 779,980 Payment',
                titleTr: 'Kritik Tahliye Anlaşması ve 779.980 KShs Tazminat Ödemesi',
                detailEn:
                  '5th Claimant Kadzitu Moli signed vacation contract acknowledging university ownership, receiving KShs 779,980 ex-gratia.',
                detailTr:
                  '5. Davacı Kadzitu Moli tazminat aldı ve üniversite mülkiyetini kabul ederek tahliye taahhüdü imzaladı.',
              },
              {
                year: '27 June 2013',
                titleEn: 'Originating Summons Filed (ELC 134/2013)',
                titleTr: 'Moli Ailesi Asıl Davayı Açıyor (ELC 134/2013)',
                detailEn:
                  'Moli family filed adverse possession claim concealing the 2012 agreement and 2012 eviction proceedings.',
                detailTr:
                  'Moli ailesi 40 yıllık kesintisiz zilyetlik iddiasıyla 340 dönümün tamamı için tapu iptal davası açtı.',
              },
              {
                year: '9 Feb 2024',
                titleEn: 'Judge Naikuni Conducts Site Visit (Locus in Quo)',
                titleTr: 'Hâkim L.L. Naikuni Sahaya İniyor (Keşif Yapılıyor)',
                detailEn:
                  'Court minutes officially recorded Moli family living only in 5 acres, while university occupied 79 acres.',
                detailTr:
                  'Tutanakta Moli ailesinin yalnızca 20 dönümlük alanda yaşadığı, diğer kısımda üniversite inşaatının olduğu tespit edildi.',
              },
              {
                year: '27 June 2025',
                titleEn: 'Controversial Lower Court Judgment',
                titleTr: 'İlk Derece Mahkemesinin Tartışmalı Kararı',
                detailEn:
                  'Judge Naikuni disregarded his own 5-acre finding and unlawfully awarded all 84 acres to Moli family.',
                detailTr:
                  'Hâkim Naikuni 20 dönüm sınırını hiçe sayarak 340 dönümün tamamını Moli ailesine devretti.',
              },
              {
                year: '9 Feb 2026',
                titleEn: 'Court of Appeal Status Quo & Priority Order',
                titleTr: 'Yargıtay Mevcut Durum (Status Quo) ve Öncelikli Duruşma Kararı',
                detailEn:
                  'Land sales frozen, Moli restricted to 5 acres, appeal fast-tracked before JJ. Mohammed, Laibuta, Ngenye-Macharia.',
                detailTr:
                  'Yargıtay heyeti arazi satışlarını durdurdu, aileyi 20 dönüme hapsetti ve öncelikli duruşma emri verdi.',
              },
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <span className="absolute -left-9 top-0.5 w-5 h-5 rounded-full bg-white border-2 border-amber-500 flex items-center justify-center text-xs text-amber-600 font-mono shadow-xs">
                  •
                </span>
                <span className="font-mono text-amber-800 font-bold text-xs">{step.year}</span>
                <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                  {language === 'tr' ? step.titleTr : step.titleEn}
                </h4>
                <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                  {language === 'tr' ? step.detailTr : step.detailEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Motion Modal */}
      {showNewMotionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-600" />
                <span>
                  {language === 'tr'
                    ? 'Yeni Hukuki Dilekçe / Başvuru Kaydı'
                    : 'Log Legal Motion / Pleading'}
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
                  {language === 'tr' ? 'Dilekçe / Başvuru Başlığı:' : 'Motion / Pleading Title:'}
                </label>
                <input
                  type="text"
                  required
                  value={motionTitle}
                  onChange={(e) => setMotionTitle(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Örn: Notice of Motion under Certificate of Urgency (Weatherproofing)'
                      : 'e.g. Urgent Certificate of Motion for Weatherproofing Variation'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'İlgili Mahkeme / Merci:' : 'Target Court / Registry:'}
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
                  {language === 'tr' ? 'Hukuki Gerekçe & Açıklama:' : 'Legal Grounds & Summary:'}
                </label>
                <textarea
                  rows={3}
                  value={motionDetail}
                  onChange={(e) => setMotionDetail(e.target.value)}
                  placeholder={
                    language === 'tr'
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
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Kaydet ve Dosyaya Ekle' : 'Save & Bind to File'}
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
