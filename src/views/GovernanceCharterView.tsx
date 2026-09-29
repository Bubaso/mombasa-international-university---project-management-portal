import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import { QueryStatus } from '../components/QueryStatus';
import { todayIso } from '../lib/date';
import {
  Users2,
  FileCheck2,
  Landmark,
  CheckCircle,
  MapPin,
  Plus,
  TriangleAlert,
} from 'lucide-react';

export const GovernanceCharterView: React.FC = () => {
  const { language } = useApp();
  const trusteesQuery = queries.useTrustees();
  const trustees = trusteesQuery.data ?? [];
  const [filterFoundation, setFilterFoundation] = useState<string>('all');
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [resolutionTitle, setResolutionTitle] = useState('');
  const [resolutionDetail, setResolutionDetail] = useState('');
  const [resolutions, setResolutions] = useState([
    {
      id: 'res-1',
      date: '2026-02-15',
      organ: 'Board of Trustees',
      titleEn: 'Approval of Appeal Litigation Strategy & Status Quo Enforcement Protocol',
      titleTr: 'Temyiz Dava Stratejisi ve Mevcut Durum Protokolünün Onaylanması',
      status: 'Enacted',
    },
    {
      id: 'res-2',
      date: '2026-01-20',
      organ: 'Board of Trustees',
      titleEn: 'Allocation of KShs 34.3M Emergency Weatherproofing Preservation Fund',
      titleTr: '34.3M KShs Acil Çatı ve Yalıtım Koruma Fonunun Tahsis Edilmesi',
      status: 'Enacted',
    },
    {
      id: 'res-3',
      date: '2025-05-27',
      organ: 'General Meeting of Trustees',
      titleEn: 'Execution of Amended Trust Deed under Cap 164 with 12 Institutional Trustees',
      titleTr: '12 Kurumsal Mütevelli ile Fasıl 164 Kapsamında Tadil Edilmiş Vakıf Senedi İmzası',
      status: 'Registered',
    },
  ]);

  const filteredTrustees = trustees.filter((t) => {
    if (filterFoundation === 'all') return true;
    if (filterFoundation === 'shahbal') return t.appointedBy.includes('Shahbal');
    if (filterFoundation === 'uef') return t.appointedBy.includes('Universal Education');
    if (filterFoundation === 'afrika') return t.appointedBy.includes('Africa Foundation');
    return true;
  });

  const handleAddResolution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionTitle) return;
    setResolutions([
      {
        id: `res-${Date.now()}`,
        date: todayIso(),
        organ: 'Board of Trustees',
        titleEn: resolutionTitle,
        titleTr: resolutionTitle,
        status: 'Enacted',
      },
      ...resolutions,
    ]);
    setResolutionTitle('');
    setResolutionDetail('');
    setShowResolutionModal(false);
  };

  return (
    <div className="space-y-6">
      <QueryStatus queries={[trusteesQuery]} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 uppercase tracking-wider">
            <Landmark className="w-4 h-4 text-purple-600" />
            <span>
              {language === 'tr'
                ? 'Vakıf Yönetişimi & Yükseköğretim Beratı'
                : 'Trust Governance & University Charter'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {language === 'tr' ? 'Yönetişim' : 'Governance'}
          </h1>
        </div>

        <button
          onClick={() => setShowResolutionModal(true)}
          className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer self-start md:self-auto shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{language === 'tr' ? 'Mütevelli Kararı Kaydet' : 'Record Trustee Resolution'}</span>
        </button>
      </div>

      {/* Trust Constitution & Charter Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Organs */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-purple-700 font-bold uppercase text-[11px]">
            <span>{language === 'tr' ? 'Vakfın 3 Temel Organı' : 'Three Organs of the Trust'}</span>
            <span className="font-mono text-slate-400">Clause 9</span>
          </div>
          <ul className="space-y-1.5 text-slate-700">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="font-medium">
                {language === 'tr'
                  ? 'a) Mütevelli Heyeti (En Yüksek Karar Organı)'
                  : 'a) Board of Trustees (Highest Decision Body)'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span>
                {language === 'tr'
                  ? 'b) Yönetim Kurulu (İcra Organı)'
                  : 'b) Board of Directors (Executive Body)'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>
                {language === 'tr'
                  ? 'c) Denetim Komitesi (Mali Denetim Organı)'
                  : 'c) Audit Committee (Financial Review)'}
              </span>
            </li>
          </ul>
        </div>

        {/* CUE Charter Roadmap */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-emerald-700 font-bold uppercase text-[11px]">
            <span>{language === 'tr' ? 'CUE Berat Yol Haritası' : 'CUE Charter Roadmap'}</span>
            <span className="font-mono text-slate-400">2027 Intake</span>
          </div>
          <div className="space-y-1 text-slate-700">
            <div className="flex items-center gap-2 text-emerald-700 font-medium">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>
                {language === 'tr'
                  ? 'Vakıf Senedi Tescili & Resmî Gazete İlanı (2025)'
                  : 'Trust Deed Gazetted & Registered (2025)'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-amber-700 font-medium">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-500 shrink-0" />
              <span>
                {language === 'tr'
                  ? 'Müfredat ve Tesis İncelemesi (Devam Ediyor)'
                  : 'Curriculum & Facility Review (Ongoing)'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0" />
              <span>
                {language === 'tr'
                  ? 'Cumhurbaşkanlığı Üniversite Beratı (2027 Hedefi)'
                  : 'Presidential Charter Grant (Target 2027)'}
              </span>
            </div>
          </div>
        </div>

        {/* 20% Scholarship Guarantee */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-amber-800 font-bold uppercase text-[11px]">
            <span>
              {language === 'tr' ? '%20 Gençlik Bursu Taahhüdü' : '20% Scholarship Guarantee'}
            </span>
            <span className="font-mono text-purple-700">~1,000 Seats</span>
          </div>
          <p className="text-slate-600 leading-relaxed text-[11px]">
            {language === 'tr'
              ? 'Mombasa ve kıyı şeridindeki imkânı kısıtlı en az 1.000 yerel gence tam eğitim bursu sağlanması vakıf senedinde ve kamuoyu brifinginde garanti altına alınmıştır.'
              : 'Mandated in the founding strategic note: at least 20% of enrolled students in Phase 1 (~1,000 underprivileged youth from coastal communities) receive 100% full tuition scholarships.'}
          </p>
        </div>
      </div>

      {/* Board of Registered Trustees Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users2 className="w-4 h-4 text-purple-600" />
              <span>
                {language === 'tr'
                  ? 'Tescilli Mütevelli Heyeti (12 Üye)'
                  : 'Board of Registered Trustees (12 Members)'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === 'tr'
                ? '27 Mayıs 2025 Tarihli Tadil Edilmiş Vakıf Senedi Hükümlerine Göre Atanmış Kurumsal Üyeler'
                : 'Formally appointed pursuant to Clause 10 of the Amended Trust Deed dated 27 May 2025'}
            </p>
          </div>

          {/* Interactive Filter Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setFilterFoundation('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterFoundation === 'all'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {language === 'tr' ? 'Tümü (12)' : 'All (12)'}
            </button>
            <button
              onClick={() => setFilterFoundation('shahbal')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterFoundation === 'shahbal'
                  ? 'bg-white text-amber-800 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Shahbal (3)
            </button>
            <button
              onClick={() => setFilterFoundation('uef')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterFoundation === 'uef'
                  ? 'bg-white text-blue-800 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Universal (3)
            </button>
            <button
              onClick={() => setFilterFoundation('afrika')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterFoundation === 'afrika'
                  ? 'bg-white text-purple-800 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Afrika Vakfı (6)
            </button>
          </div>
        </div>

        {/* Trustees Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {filteredTrustees.map((t) => (
            <div
              key={t.id}
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-purple-700 font-bold text-[11px]">
                  {t.nationalId}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                  {language === 'tr' ? 'Aktif' : 'Active'}
                </span>
              </div>
              <div className="font-bold text-slate-900 text-sm">{t.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{t.appointedBy}</div>
              <div className="pt-2 flex items-center justify-between text-[11px] border-t border-slate-200 text-slate-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-amber-600" />
                  <span>{t.origin}</span>
                </span>
                <span className="font-medium text-slate-700">{t.roleInTrust}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resolutions Register */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-emerald-600" />
          <span>
            {language === 'tr'
              ? 'Mütevelli Heyeti Resmî Kararlar Kütüğü'
              : 'Trustee Resolutions & Minute Book'}
          </span>
        </h2>

        {/* These rows live in component state only (S-6). Say so rather than
            letting someone believe a board resolution has been filed. */}
        <div
          className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px]"
          role="note"
        >
          <TriangleAlert
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <p className="leading-relaxed text-amber-900">
            {language === 'tr'
              ? 'Bu bölümdeki kayıtlar henüz veritabanına yazılmıyor; sayfayı yenilediğinizde eklediğiniz satırlar kaybolur.'
              : 'Records in this section are not written to the database yet; anything you add is lost when the page reloads.'}
          </p>
        </div>

        <div className="space-y-2 text-xs">
          {resolutions.map((res) => (
            <div
              key={res.id}
              className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-amber-800 font-bold">{res.date}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">
                    {language === 'tr' ? 'Mütevelli Heyeti' : res.organ}
                  </span>
                </div>
                <div className="font-semibold text-slate-800">
                  {language === 'tr' ? res.titleTr : res.titleEn}
                </div>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 shrink-0 self-start sm:self-center font-medium">
                {res.status === 'Registered'
                  ? language === 'tr'
                    ? 'Tescil Edildi'
                    : 'Registered'
                  : language === 'tr'
                    ? 'Yürürlükte'
                    : 'Enacted'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Resolution Modal */}
      {showResolutionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'tr' ? 'Yeni Mütevelli Kararı Ekle' : 'Log New Board Resolution'}
              </h3>
              <button
                onClick={() => setShowResolutionModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddResolution} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Karar Başlığı:' : 'Resolution Title:'}
                </label>
                <input
                  type="text"
                  required
                  value={resolutionTitle}
                  onChange={(e) => setResolutionTitle(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Örn: Yargıtay Duruşması Hazırlık Yetkilendirmesi'
                      : 'e.g. Authorization of Senior Counsel Engagement'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Karar Metni ve Gerekçe:' : 'Resolution Text:'}
                </label>
                <textarea
                  rows={3}
                  value={resolutionDetail}
                  onChange={(e) => setResolutionDetail(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Resmi karar metni ve gerekçesi...'
                      : 'Official resolution body...'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResolutionModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer font-medium"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Kararı Kaydet' : 'Record Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
