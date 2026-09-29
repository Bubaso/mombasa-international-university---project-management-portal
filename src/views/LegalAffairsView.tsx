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
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import { ContextualAIAssistant } from '../components/ContextualAIAssistant';
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

export const LegalAffairsView: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useApp();
  const legalCasesQuery = queries.useLegalCases();
  const legalCases = legalCasesQuery.data ?? [];
  const { mutate: addLegalCase } = queries.useAddLegalCase();
  const [selectedCaseId] = useState<string>('case-appeal-e062');
  const [activeSubTab, setActiveSubTab] = useState<
    | 'overview'
    | 'hearing_brief'
    | 'bench_qa'
    | 'authorities'
    | 'grounds'
    | 'action_plan'
    | 'who_is_who'
    | 'timeline'
  >('hearing_brief');
  const [showNewMotionModal, setShowNewMotionModal] = useState(false);
  const [qSearch, setQSearch] = useState('');

  // New Motion Form State
  const [motionTitle, setMotionTitle] = useState('');
  const [motionCourt, setMotionCourt] = useState('Court of Appeal (Mombasa)');
  const [motionDetail, setMotionDetail] = useState('');

  const activeCase = legalCases.find((c) => c.id === selectedCaseId) ?? legalCases[0] ?? null;
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

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 uppercase tracking-wider">
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
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
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
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>
              {language === 'tr'
                ? 'Yargıtay Heyeti Resmî Kararı — Mevcut Durumun Korunması (Status Quo)'
                : 'Court of Appeal Injunction — Status Quo Order (9 February 2026)'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {language === 'tr'
              ? 'Heyet: Mohammed · Laibuta · Ngenye-Macharia'
              : 'Judges: Mohammed · Laibuta · Ngenye-Macharia'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'tr' ? '1. Sınırların Korunması' : '1. Boundary Protection'}
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              {language === 'tr'
                ? 'Moli ailesi (1.–7. davalılar) sadece fiilen işgal ettikleri 5 dönümlük alanda kalmaya devam edecektir.'
                : 'Claimants strictly confined to the 5-acre enclave they actually occupied during site survey.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'tr' ? '2. Satış ve Devir Yasağı' : '2. Prohibition of Sale'}
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              {language === 'tr'
                ? 'Temyiz sonuçlanıncaya kadar arazinin hiçbir kısmı üçüncü kişilere devredilemez, satılamaz veya bölünemez.'
                : 'No party may sell, subdivide or transfer any portion of the 84-acre parcel to third parties.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'tr' ? '3. Öncelikli Yargılama' : '3. Priority Hearing'}
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              {language === 'tr'
                ? 'Adaletin gecikmemesi amacıyla temyiz davasının sıradan dosyaların önüne alınarak öncelikli görülmesine karar verildi.'
                : 'Expedited calendar granted ahead of standard queue due to magnitude of university investment.'}
            </p>
          </div>

          <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'tr' ? '4. İnşaatların Durdurulması' : '4. Suspension of Works'}
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              {language === 'tr'
                ? 'Yeni inşaat ve çevre duvarı geçici olarak durdurulmuştur (Acil koruma başvurusu hariç).'
                : 'New construction suspended; urgent weatherproofing allowed via variation application.'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none snap-x py-1 -mx-1 px-1 sm:mx-0 sm:px-0">
        {[
          {
            id: 'hearing_brief',
            labelEn: 'Hearing Brief (28 Sept 2026)',
            labelTr: 'Duruşma Brifingi (28 Eylül 2026)',
            badge: language === 'tr' ? 'CANLI' : 'LIVE',
          },
          {
            id: 'bench_qa',
            labelEn: 'Anticipated Bench Q&A',
            labelTr: 'Hâkimler Heyeti Soru-Cevapları',
            badge: language === 'tr' ? 'Bölüm E' : 'Part E',
          },
          {
            id: 'authorities',
            labelEn: 'Legal Authorities & Precedents',
            labelTr: 'Hukuki İçtihatlar & Kararlar',
            badge: language === 'tr' ? 'Bölüm F' : 'Part F',
          },
          { id: 'overview', labelEn: 'Appeal File E062/2025', labelTr: 'Temyiz Dosyası E062/2025' },
          {
            id: 'grounds',
            labelEn: 'Grounds of Appeal (9 Grounds)',
            labelTr: 'Temyiz İtirazları (9 Gerekçe)',
          },
          {
            id: 'action_plan',
            labelEn: 'Kenya Visit Action Plan',
            labelTr: 'Kenya Ziyareti Eylem Planı',
          },
          {
            id: 'who_is_who',
            labelEn: 'Who is Who Directory',
            labelTr: 'Kim Kimdir? (Taraflar & Avukatlar)',
          },
          { id: 'timeline', labelEn: '30-Year Case History', labelTr: '30 Yıllık Dava Tarihçesi' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 snap-start ${
              activeSubTab === tab.id
                ? 'bg-amber-600 text-white font-semibold shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>{language === 'tr' ? tab.labelTr : tab.labelEn}</span>
            {tab.badge && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                  tab.badge === 'LIVE' || tab.badge === 'CANLI'
                    ? 'bg-rose-500 text-white animate-pulse font-bold'
                    : 'bg-slate-100 text-amber-700 border border-slate-200'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Subtab Content: Hearing Brief (28 Sept 2026) */}
      {activeSubTab === 'hearing_brief' && (
        <div className="space-y-6">
          {/* Executive Privileged Summary Banner */}
          <div className="bg-white border-2 border-amber-500/50 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded">
                    {language === 'tr' ? 'RESMİ DURUŞMA BRİFİNGİ' : 'PRIVILEGED HEARING BRIEF'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
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
                <div className="text-xs text-amber-800 font-medium mt-0.5">
                  {language === 'tr' ? 'Savunma Avukatları: ' : 'Counsel on record: '}
                  {hearingBrief?.counselOnRecord ??
                    (language === 'tr' ? 'kayıtlı değil' : 'not recorded')}
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  onClick={() => navigate('/documents')}
                  className="inline-flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    {language === 'tr' ? 'Tam Layihayı Kasadan Aç' : 'Open Full Brief PDF'}
                  </span>
                </button>
              </div>
            </div>

            {/* Two Motions at Play */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 space-y-2">
                <span className="text-[10px] font-mono text-emerald-800 font-bold uppercase">
                  {language === 'tr'
                    ? '1. Başvuru: Yürütmeyi Durdurma (23 Temmuz 2025)'
                    : 'Motion 1: Stay Application (23 July 2025)'}
                </span>
                <h3 className="font-bold text-slate-900">Notice of Motion under Rule 5(2)(b)</h3>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  {language === 'tr'
                    ? 'Pozisyonumuz: Destekliyoruz; ancak bu başvuru 9 Şubat 2026 tarihli mutabakat emri (consent order) ile zaten nihayete erdirilmiştir (compromised). Heyetten bunu kayda geçirmesini ve E218/2025 numaralı asıl temyize öncelikli duruşma günü verilmesini talep ediyoruz.'
                    : 'Our Position: In support, but the motion was already compromised by consent on 9th February 2026 on terms running until hearing and determination of appeal. Nothing remains to be determined on this motion.'}
                </p>
                <div className="text-[10px] text-emerald-800 font-semibold pt-1">
                  {language === 'tr'
                    ? 'Durum: Mutabakat Kararı ile Sonuçlandı'
                    : 'Status: Compromised by Consent Order'}
                </div>
              </div>

              <div className="bg-rose-50/40 p-4 rounded-xl border border-rose-200 space-y-2">
                <span className="text-[10px] font-mono text-rose-800 font-bold uppercase">
                  {language === 'tr'
                    ? '2. Başvuru: İtaatsizlik Talebi (19 Haziran 2026)'
                    : 'Motion 2: Contempt Application (19 June 2026)'}
                </span>
                <h3 className="font-bold text-slate-900">
                  {language === 'tr'
                    ? 'Chogo Ailesinin Başvurusu (Sherman Nyongesa & Mutubia)'
                    : 'Filed by Chogos (Sherman Nyongesa & Mutubia)'}
                </h3>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  {language === 'tr'
                    ? 'Pozisyonumuz: Şiddetle Karşı Çıkıyoruz (Opposing). AUTK hiçbir inşaat yapmamıştır. Küçük çevre duvarı onarımı solely Zayed Vakfı tarafından Yazı İşleri’ne önceden yazılı bildirimle yapılmıştır ve mevcut duvarı onarmak 1(b) ihlali değildir.'
                    : 'Our Position: Opposing. AUTK undertook NO works. The wall repair was announced and carried out solely by the Foundation. Order 1(b) restrains only walls not already in place; repairing an existing standing wall is no breach.'}
                </p>
                <div className="text-[10px] text-rose-800 font-semibold pt-1">
                  {language === 'tr'
                    ? 'Durum: Kusurlu Delil · Masraflarla Reddi Talep Edildi'
                    : 'Status: Defective Evidence · To Be Dismissed With Costs'}
                </div>
              </div>
            </div>
          </div>

          {/* 4 Pillars of Defense Against Contempt */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                {language === 'tr'
                  ? 'İtaatsizlik İddialarına Karşı 4 Temel Savunma Sütunu (Theory of the Case)'
                  : 'Theory of Defense: 4 Pillars Opposing Contempt Committal'}
              </span>
            </h3>

            {hearingBrief && hearingBrief.contemptDefencePillars.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {hearingBrief.contemptDefencePillars.map((pillar) => (
                  <div
                    key={pillar.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                  >
                    <h4 className="font-bold text-amber-800 text-xs">
                      {language === 'tr' ? pillar.titleTr : pillar.titleEn}
                    </h4>
                    <p className="text-slate-700 text-[11px] leading-relaxed">
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
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Gavel className="w-4 h-4 text-purple-600" />
              <span>
                {language === 'tr'
                  ? 'Duruşma Yedek Stratejileri (Part D: Fallback Positions)'
                  : 'Part D: Tactical Fallback Positions'}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'tr'
                ? 'Müvekkillerimiz hiçbir ihlali kabul etmemektedir (no undertaking). Heyet duvar tamiratı konusunda tereddüt ederse:'
                : 'Clients stand on strict compliance. If the bench appears troubled by the wall repair, counsel follows these sequential fallback positions:'}
            </p>
            <div className="space-y-2 text-xs">
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
                    ? 'Hâkimler Heyetinden Beklenen 12 Soru ve Taktik Cevaplar (Part E)'
                    : 'Part E: Anticipated Questions from the Bench & Tactical Answers'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
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
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 w-48 sm:w-60"
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
                    <span className="text-xs font-bold text-amber-800 font-mono flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span>{language === 'tr' ? 'Hâkim Sorusu:' : 'Bench Question:'}</span>
                    </span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                      {qa.category.replace('_', ' ')}
                    </span>
                  </div>

                  <h4 className="text-xs font-semibold text-slate-900">
                    "{language === 'tr' ? qa.questionTr : qa.question}"
                  </h4>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1 shadow-xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                      {language === 'tr'
                        ? 'Önerilen Cevap & Hukuki Not:'
                        : 'Suggested Answer / Note:'}
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-sans">
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
            <p className="text-xs text-slate-500 mt-1">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
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
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold ${
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
                  <h4 className="font-bold text-slate-900 text-xs">{auth.citation}</h4>
                  <div className="text-[11px] text-amber-800 font-mono font-medium">{auth.use}</div>
                  <p className="text-[11px] text-slate-700 leading-relaxed pt-1">
                    {language === 'tr' ? auth.principleTr : auth.principleEn}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Jurisdictional Note */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
            <span className="font-bold text-amber-800 text-[11px] uppercase tracking-wider">
              {language === 'tr'
                ? 'Yargı Yetkisi Notu (Jurisdiction Note):'
                : 'Court Jurisdiction Note:'}
            </span>
            <p className="text-[11px] leading-relaxed">
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
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
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
                  <span className="text-[11px] font-mono text-amber-800 font-bold uppercase">
                    {activeCase.caseNumber}
                  </span>
                  <h2 className="text-base font-bold text-slate-900 mt-0.5">{activeCase.title}</h2>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-50 border border-amber-300 text-amber-800 font-mono">
                  {language === 'tr' ? 'ÖNCELİKLİ DOSYA' : 'PRIORITY LISTING'}
                </span>
              </div>

              <div className="text-xs text-slate-700 space-y-2">
                <p className="leading-relaxed">
                  {language === 'tr' ? activeCase.descriptionTr : activeCase.descriptionEn}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-[11px] font-semibold uppercase">
                    {language === 'tr' ? 'Temyiz Edenler (Appellants)' : 'Appellants'}
                  </div>
                  <div className="text-slate-800 mt-1 font-medium">
                    Zayed Bin Sultan Al Nahyan Charitable & Humanitarian Foundation & African
                    University Trust of Kenya
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-[11px] font-semibold uppercase">
                    {language === 'tr' ? 'Karşı Taraf (Respondents)' : 'Respondents'}
                  </div>
                  <div className="text-slate-800 mt-1 font-medium">
                    Kazungu Moli Chogo and 6 Others (1st-7th Respondents / Moli Family)
                  </div>
                </div>
              </div>

              {/* Five Core Case Files Reference */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <FolderOpen className="w-4 h-4 text-amber-600" />
                  <span>
                    {language === 'tr'
                      ? 'Takip Edilen 5 Dava Dosyası Özeti'
                      : '5 Followed Dispute Files Overview'}
                  </span>
                </h3>
                <div className="space-y-2 text-xs">
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
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-mono">
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
                    <span className="text-[11px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-mono">
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
                    <span className="text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-mono">
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
                    <span className="text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 font-mono">
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
                    <span className="text-[11px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 font-mono">
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
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {language === 'tr' ? 'Duruşma ve Karar Geçmişi' : 'Key Orders & Decrees'}
              </h3>
              <div className="space-y-3 text-xs">
                {activeCase.orders.map((ord, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-amber-800 font-bold">{ord.date}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
                          ord.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900">{ord.title}</div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">{ord.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Link to Documents */}
            <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl space-y-2">
              <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-amber-600" />
                <span>
                  {language === 'tr' ? 'Dava Layihaları ve Evrakları' : 'Case Trial Bundle Files'}
                </span>
              </div>
              <p className="text-[11px] text-slate-700">
                {language === 'tr'
                  ? 'Kadzitu Moli 2012 tahliye makbuzu, 60 yıllık kira senedi ve onaylı tapu itirazlarını inceleyin.'
                  : 'Examine Kadzitu Moli 2012 payment receipt, 60-year lease and title certificates in vault.'}
              </p>
              <button
                onClick={() => navigate('/documents')}
                className="text-xs text-amber-800 font-semibold underline hover:text-amber-950 cursor-pointer"
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
            <p className="text-xs text-slate-500 mt-1">
              Khatib & Company Advocates & Simon Karina Advocates on behalf of Zayed Foundation &
              AUTK
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
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
                  'Hâkimin 9 Şubat 2024 tarihli kendi keşif raporunda Moli ailesinin yalnızca 5 dönümü işgal ettiği sabitken, 84 dönümün tamamı verilmiştir.',
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
                titleTr: 'Beş Dönümlük Sınırın İhlali',
                descEn:
                  'Adverse possession boundary exceeded: claimants could not legally claim adverse possession beyond their 5-acre enclave.',
                descTr:
                  'Olumsuz zilyetlik sınırları aşıldı: Davacılar 5 dönümlük yerleşimlerinin ötesindeki 79 dönümde zilyetlik iddia edemez.',
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
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center font-mono border border-amber-300">
                    {ground.num}
                  </span>
                  <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold">
                    {language === 'tr' ? 'Hukuki ve Maddi Hata' : 'Error in Law & Fact'}
                  </span>
                </div>
                <div className="font-semibold text-slate-900">
                  {language === 'tr' ? ground.titleTr : ground.titleEn}
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
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
            <p className="text-xs text-slate-500 mt-1">
              Converting 9 February 2026 Status Quo & Priority Order into Complete Appellate Victory
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-800 uppercase tracking-wider text-[11px]">
                  {language === 'tr'
                    ? '1. Mevcut Durum Emrinin İnfazı ve Denetimi'
                    : '1. Enforcement of Status Quo Order'}
                </span>
                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded font-semibold">
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
                <span className="font-bold text-rose-700 uppercase tracking-wider text-[11px]">
                  {language === 'tr'
                    ? '2. Mevcut Durum Emrinin Esnetilmesi (Çatı & Hava Koşulları)'
                    : '2. Variation of Status Quo (Weatherproofing Urgency)'}
                </span>
                <span className="text-[10px] font-mono text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded font-semibold">
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
                <span className="font-bold text-blue-700 uppercase tracking-wider text-[11px]">
                  {language === 'tr'
                    ? '3. 807M KShs Delil Denetimi (Trial Bundle Audit)'
                    : '3. KShs 807M Trial Bundle Audit'}
                </span>
                <span className="text-[10px] font-mono text-blue-800 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded font-semibold">
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
                <span className="font-bold text-purple-700 uppercase tracking-wider text-[11px]">
                  {language === 'tr'
                    ? '4. Kıdemli Temyiz Avukatı (Senior Counsel - SC) Takviyesi'
                    : '4. Senior Counsel (SC) Appellate Representation'}
                </span>
                <span className="text-[10px] font-mono text-purple-800 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded font-semibold">
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
            <p className="text-xs text-slate-500 mt-1">
              {language === 'tr'
                ? 'Mombasa ELC ve Temyiz Mahkemesi Resmi Dava Kayıtlarından Çıkarılmıştır'
                : 'Extracted from Mombasa ELC & Court of Appeal Judicial Records'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {/* Legal Counsel */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                {language === 'tr'
                  ? 'Hukuk Müşaviri (Savunma - Defense)'
                  : 'Legal Counsel (Defense)'}
              </span>
              <div className="font-bold text-slate-900 text-sm">Mr. Simon Karina</div>
              <div className="text-slate-500 text-[11px]">Ndegwa Sitonik Karina Advocates</div>
              <p className="text-slate-600 text-[11px]">
                {language === 'tr'
                  ? 'Afrika Üniversitesi Vakfı ve mütevellilerini savunan baş avukat.'
                  : 'Lead advocate defending African University Trust and registered trustees.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                {language === 'tr'
                  ? 'Hukuk Müşaviri (Temyiz Eden - Appellant)'
                  : 'Legal Counsel (Appellant)'}
              </span>
              <div className="font-bold text-slate-900 text-sm">Mr. Mohamed Faki Khatib</div>
              <div className="text-slate-500 text-[11px]">Khatib & Company Advocates</div>
              <p className="text-slate-600 text-[11px]">
                {language === 'tr'
                  ? 'Tapu sahibi Zayed Vakfı’nı (7. Davalı / Temyiz Eden) temsil eden baş avukat.'
                  : 'Lead advocate representing original title holder Zayed Foundation in appeal.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                {language === 'tr'
                  ? 'Mütevelli & Baş Tanık (DW-1)'
                  : 'Trustee & Key Witness (DW-1)'}
              </span>
              <div className="font-bold text-slate-900 text-sm">Lucas Cosmas Fondo</div>
              <div className="text-slate-500 text-[11px]">
                Universal Education Foundation / AUTK
              </div>
              <p className="text-slate-600 text-[11px]">
                {language === 'tr'
                  ? 'Duruşmada arazideki 5 dönüm işgal / 79 dönüm üniversite durumunu kararlılıkla savunan baş tanık.'
                  : 'Main defense witness who confirmed physical 5-acre vs 79-acre campus demarcation.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                {language === 'tr'
                  ? 'Zayed Vakfı Direktörü (DW-2)'
                  : 'Zayed Foundation Director (DW-2)'}
              </span>
              <div className="font-bold text-slate-900 text-sm">Abubakar Hassan Dindia</div>
              <div className="text-slate-500 text-[11px]">
                Zayed Bin Sultan Al Nahyan Foundation
              </div>
              <p className="text-slate-600 text-[11px]">
                {language === 'tr'
                  ? '2002 satın alımını ve 2012 60 yıllık kira devrini mahkemeye tevsik eden direktör.'
                  : 'Foundation director familiar with land purchase and leasehold agreements.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                {language === 'tr'
                  ? 'Kritik Davacı (5. Davacı)'
                  : 'Critical Claimant (5th Claimant)'}
              </span>
              <div className="font-bold text-slate-900 text-sm">Kadzitu Moli Chogo</div>
              <div className="text-slate-500 text-[11px]">5th Claimant (Moli Family)</div>
              <p className="text-slate-600 text-[11px]">
                {language === 'tr'
                  ? '29 Şubat 2012’de üniversiteden 779.980 KShs tahliye tazminatı alıp sözleşme imzalayan kritik isim.'
                  : 'Signed the 2012 vacation agreement accepting KShs 779,980 compensation concealed from court.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                {language === 'tr'
                  ? 'Yargıtay Hâkimler Heyeti (Coram)'
                  : 'Court of Appeal Panel (Coram)'}
              </span>
              <div className="font-bold text-slate-900 text-sm">JJ. Mohammed, Laibuta, Ngenye</div>
              <div className="text-slate-500 text-[11px]">Mombasa Court of Appeal (Yargıtay)</div>
              <p className="text-slate-600 text-[11px]">
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
            <p className="text-xs text-slate-500 mt-1">
              Plot No. MN/I/5141 (84 Acres / Dönüm) Utange/Majaoni, Mombasa
            </p>
          </div>

          <div className="relative border-l border-slate-200 ml-4 space-y-6 pl-6 text-xs">
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
                detailTr: 'Dönemin Bölge Komiseri 84 dönümlük tapuyu üzerine tescil ettirdi.',
              },
              {
                year: '2002',
                titleEn: 'Zayed Foundation Purchases Land',
                titleTr: 'Zayed Vakfı Araziyi Satın Alıyor',
                detailEn:
                  'Purchased for educational charity. Gentlemen’s agreement allocated 5-acre enclave for Moli family.',
                detailTr:
                  'Eğitim kurumu kurmak amacıyla satın alındı. Moli ailesine 5 dönüm ayrılması hususunda mutabakata varıldı.',
              },
              {
                year: '2004 — 2005',
                titleEn: 'Perimeter Wall Demarcates 79 Acres vs 5 Acres',
                titleTr: 'Çevre Duvarı İnşa Ediliyor (79 Dönüm Kampüs / 5 Dönüm Aile)',
                detailEn:
                  'Foundation constructed permanent perimeter wall, isolating 79 acres for university and leaving 5 acres for Moli.',
                detailTr:
                  'Vakıf devasa bir çevre duvarı inşa etti: 79 dönüm üniversiteye ayrıldı, aile 5 dönümde kaldı.',
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
                  'Moli ailesi 40 yıllık kesintisiz zilyetlik iddiasıyla 84 dönümün tamamı için tapu iptal davası açtı.',
              },
              {
                year: '9 Feb 2024',
                titleEn: 'Judge Naikuni Conducts Site Visit (Locus in Quo)',
                titleTr: 'Hâkim L.L. Naikuni Sahaya İniyor (Keşif Yapılıyor)',
                detailEn:
                  'Court minutes officially recorded Moli family living only in 5 acres, while university occupied 79 acres.',
                detailTr:
                  'Tutanakta Moli ailesinin yalnızca 5 dönümlük alanda yaşadığı, diğer kısımda üniversite inşaatının olduğu tespit edildi.',
              },
              {
                year: '27 June 2025',
                titleEn: 'Controversial Lower Court Judgment',
                titleTr: 'İlk Derece Mahkemesinin Tartışmalı Kararı',
                detailEn:
                  'Judge Naikuni disregarded his own 5-acre finding and unlawfully awarded all 84 acres to Moli family.',
                detailTr:
                  'Hâkim Naikuni 5 dönüm sınırını hiçe sayarak 84 dönümün tamamını Moli ailesine devretti.',
              },
              {
                year: '9 Feb 2026',
                titleEn: 'Court of Appeal Status Quo & Priority Order',
                titleTr: 'Yargıtay Mevcut Durum (Status Quo) ve Öncelikli Duruşma Kararı',
                detailEn:
                  'Land sales frozen, Moli restricted to 5 acres, appeal fast-tracked before JJ. Mohammed, Laibuta, Ngenye-Macharia.',
                detailTr:
                  'Yargıtay heyeti arazi satışlarını durdurdu, aileyi 5 dönüme hapsetti ve öncelikli duruşma emri verdi.',
              },
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <span className="absolute -left-9 top-0.5 w-5 h-5 rounded-full bg-white border-2 border-amber-500 flex items-center justify-center text-[10px] text-amber-600 font-mono shadow-xs">
                  •
                </span>
                <span className="font-mono text-amber-800 font-bold text-[11px]">{step.year}</span>
                <h4 className="font-bold text-slate-900 text-xs mt-0.5">
                  {language === 'tr' ? step.titleTr : step.titleEn}
                </h4>
                <p className="text-slate-600 text-[11px] mt-1 leading-relaxed">
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
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-600" />
                <span>
                  {language === 'tr'
                    ? 'Yeni Hukuki Dilekçe / Başvuru Kaydı'
                    : 'Log Legal Motion / Pleading'}
                </span>
              </h3>
              <button
                onClick={() => setShowNewMotionModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMotion} className="space-y-4 text-xs">
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
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs cursor-pointer font-medium"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Kaydet ve Dosyaya Ekle' : 'Save & Bind to File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ContextualAIAssistant
        contextData={JSON.stringify(activeCase)}
        systemInstruction="You are an expert legal AI assistant. Provide concise, legally sound analysis based ONLY on the provided case data."
        title={language === 'tr' ? 'Hukuk Asistanı' : 'Legal AI Assistant'}
      />
    </div>
  );
};
