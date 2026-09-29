import React from 'react';
import { useApp } from '../context/AppContext';
import {
  GraduationCap,
  MapPin,
  Award,
  BookOpen,
  ShieldCheck,
  HeartHandshake,
  CheckCircle2,
  Clock,
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';

export const ProjectInfoView: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useApp();

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 uppercase tracking-wider">
              <GraduationCap className="w-4 h-4" />
              <span>
                {language === 'tr'
                  ? 'Üniversite Proje Künyesi & Kurumsal Bilgiler'
                  : 'University Project Profile & Overview'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {language === 'tr' ? 'Proje Künyesi' : 'Project Overview'}
            </h1>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <span className="text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-lg font-semibold">
              {language === 'tr' ? 'Fasıl 164 Tescilli Vakıf' : 'Cap 164 Registered Trust'}
            </span>
          </div>
        </div>
      </div>

      {/* Key Project Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Land */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
            {language === 'tr' ? 'Kampüs Arazisi' : 'Campus Site Area'}
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 mt-1 font-mono">
            {language === 'tr' ? '84 Dönüm' : '84 Acres'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'tr' ? '79 ac yerleşke / 5 ac enklav' : '79 ac campus / 5 ac enclave'}
          </div>
        </div>

        {/* Invested Capital */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
            {language === 'tr' ? 'Kullanılan Yatırım' : 'Capital Invested'}
          </div>
          <div className="text-lg sm:text-xl font-bold text-amber-700 mt-1 font-mono">807.3M</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'tr' ? 'KShs fiili harcama' : 'KShs disbursed to date'}
          </div>
        </div>

        {/* Student Capacity */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
            {language === 'tr' ? 'Öğrenci Kapasitesi' : 'Student Capacity'}
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-700 mt-1 font-mono">5,000</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'tr' ? '1. Aşama (Toplam: 15.000)' : 'Phase 1 (15k total)'}
          </div>
        </div>

        {/* Target Intake */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
            {language === 'tr' ? 'İlk Öğrenci Alımı' : 'First Intake Year'}
          </div>
          <div className="text-lg sm:text-xl font-bold text-blue-700 mt-1 font-mono">2027</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'tr' ? 'CUE Berat Hedefi' : 'CUE Charter Target'}
          </div>
        </div>

        {/* Scholarship Guarantee */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
            {language === 'tr' ? 'Gençlik Bursu' : 'Youth Scholarships'}
          </div>
          <div className="text-lg sm:text-xl font-bold text-purple-700 mt-1 font-mono">
            {language === 'tr' ? '%20 Tam Burs' : '20% Full'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'tr' ? '~1.000 yerel genç' : '~1,000 coastal youth'}
          </div>
        </div>

        {/* Trustees */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
            {language === 'tr' ? 'Mütevelli Heyeti' : 'Registered Trustees'}
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 mt-1 font-mono">
            {language === 'tr' ? '12 Üye' : '12 Members'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'tr' ? '3 Kurumsal Vakıf' : '3 Partner Orgs'}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Land & Campus Info + Academic Faculties */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Land & Campus Geography */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-600" />
              <span>
                {language === 'tr'
                  ? 'Arazi, Tapu ve Konum Bilgileri'
                  : 'Land, Deed & Location Specifications'}
              </span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {language === 'tr' ? 'Parsel Numarası:' : 'Cadastral Plot No:'}
                  </span>
                  <span className="font-mono font-bold text-slate-900">Plot No. MN/I/5141</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {language === 'tr' ? 'Konum / İlçe:' : 'Location / District:'}
                  </span>
                  <span className="text-slate-800 font-medium">
                    Utange / Majaoni, Mombasa County, Kenya
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {language === 'tr' ? 'Tapu Statüsü:' : 'Title Deed Nature:'}
                  </span>
                  <span className="text-emerald-700 font-semibold">
                    {language === 'tr'
                      ? '60 Yıllık Tescilli Kira Tapusu (Leasehold)'
                      : '60-Year Registered Leasehold'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {language === 'tr' ? 'Yasal Dayanak:' : 'Statutory Act:'}
                  </span>
                  <span className="font-mono text-slate-700">Cap 164, Laws of Kenya</span>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
                <div className="font-semibold text-amber-900 text-xs">
                  {language === 'tr'
                    ? 'Arazi Fiili Kullanım Analizi (84 Dönüm):'
                    : 'Land Area Physical Allocation (84 Acres):'}
                </div>
                <ul className="space-y-1 text-slate-700 text-[11px] leading-relaxed">
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-700 font-bold">•</span>
                    <span>
                      <strong className="text-slate-900">
                        {language === 'tr' ? '79 Dönüm:' : '79 Acres:'}
                      </strong>{' '}
                      {language === 'tr'
                        ? 'Üniversite ana yerleşkesi, akademik fakülteler, yurtlar, laboratuvarlar, cami ve spor tesisleri.'
                        : 'Core university campus, faculty blocks, dormitories, research labs, campus mosque, and sports grounds.'}
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-700 font-bold">•</span>
                    <span>
                      <strong className="text-slate-900">
                        {language === 'tr' ? '5 Dönüm:' : '5 Acres:'}
                      </strong>{' '}
                      {language === 'tr'
                        ? 'Moli ailesi yerleşim enklavı. 9 Şubat 2026 tarihli Yargıtay (Court of Appeal) Mevcut Durum emriyle koruma altında olan sınır.'
                        : 'Moli family residential enclave, strictly preserved under the 9 Feb 2026 Court of Appeal Status Quo order.'}
                    </span>
                  </li>
                </ul>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => navigate('/construction')}
                  className="w-full text-center py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                >
                  {language === 'tr'
                    ? 'Şantiye ve İnşaat Bloklarını İncele ➔'
                    : 'Inspect Construction Blocks & Facilities ➔'}
                </button>
              </div>
            </div>
          </div>

          {/* Founding & Partner Foundations */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-purple-600" />
              <span>
                {language === 'tr' ? 'Kurucu ve Ortak Vakıflar' : 'Founding & Partner Foundations'}
              </span>
            </h2>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">
                    Afrika Vakfı (Africa Foundation)
                  </div>
                  <span className="font-mono text-purple-700 text-[11px] font-bold">
                    6 Mütevelli (50%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  {language === 'tr'
                    ? 'Merkezi Ankara ve İstanbul’da bulunan Türk hayırsever vakfı. Akademik koordinasyon ve sermaye finansmanı desteği.'
                    : 'Turkish philanthropic foundation based in Ankara/Istanbul, providing academic steering and capital funding.'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">Universal Education Foundation</div>
                  <span className="font-mono text-blue-700 text-[11px] font-bold">
                    3 Mütevelli (25%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  {language === 'tr'
                    ? 'Mombasa merkezli eğitim vakfı. Yerel paydaş ilişkileri, arazi geliştirme ve toplumsal entegrasyon.'
                    : 'Mombasa-based education trust managing community integration, land development and local coordination.'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">Süleyman Shahbal Foundation</div>
                  <span className="font-mono text-amber-700 text-[11px] font-bold">
                    3 Mütevelli (25%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  {language === 'tr'
                    ? 'Kıyı bölgesi kalkınma ve hayırseverlik kuruluşu. Yerel idare ve düzenleyici kurumlar koordinasyonu.'
                    : 'Coastal region development trust liaising with county administration and regulatory bodies.'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">
                    Zayed Bin Sultan Al Nahyan Foundation
                  </div>
                  <span className="font-mono text-emerald-700 text-[11px] font-bold">
                    Destekçi / Bağışçı
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  {language === 'tr'
                    ? 'BAE merkezli insani yardım vakfı. 807M KShs sermaye hibe sağlayıcısı ve Yargıtay temyiz başvurucusu.'
                    : 'UAE humanitarian foundation providing primary capital grant of KShs 807M and co-appellant before Court of Appeal.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Academic Faculties & Accreditation Roadmap */}
        <div className="lg:col-span-6 space-y-6">
          {/* Academic Faculties */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'tr'
                  ? 'Akademik Yapı ve Planlanan Fakülteler'
                  : 'Academic Structure & Planned Faculties'}
              </span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-900">
                  {language === 'tr' ? 'Mühendislik & Teknoloji' : 'Engineering & Technology'}
                </div>
                <p className="text-[11px] text-slate-500">
                  {language === 'tr'
                    ? 'İnşaat, Makine, Elektrik ve Bilgisayar Mühendisliği'
                    : 'Civil, Mechanical, Electrical & Computer Engineering'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-900">
                  {language === 'tr' ? 'Sağlık Bilimleri & Tıp' : 'Health Sciences & Medicine'}
                </div>
                <p className="text-[11px] text-slate-500">
                  {language === 'tr'
                    ? 'Hemşirelik, Eczacılık ve Halk Sağlığı Bölümleri'
                    : 'Nursing, Pharmacy & Public Health Departments'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-900">
                  {language === 'tr' ? 'İktisadi & İdari Bilimler' : 'Business & Economics'}
                </div>
                <p className="text-[11px] text-slate-500">
                  {language === 'tr'
                    ? 'İşletme, Uluslararası Finans ve Lojistik Yönetimi'
                    : 'Business Admin, Global Finance & Maritime Logistics'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-900">
                  {language === 'tr' ? 'İslami İlimler & Kültür' : 'Islamic Studies & Culture'}
                </div>
                <p className="text-[11px] text-slate-500">
                  {language === 'tr'
                    ? 'İlahiyat, Arap Dili ve Karşılaştırmalı Hukuk'
                    : 'Theology, Arabic Studies & Comparative Jurisprudence'}
                </p>
              </div>
            </div>
          </div>

          {/* Statutory Accreditation & University Charter Roadmap */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600" />
              <span>
                {language === 'tr'
                  ? 'Yasal Akreditasyon ve Üniversite Beratı Yol Haritası'
                  : 'CUE Charter & Accreditation Roadmap'}
              </span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-900">
                    {language === 'tr'
                      ? '1. Aşama: Vakıf Senedi Tescili & Resmî Gazete İlanı'
                      : 'Phase 1: Trust Deed Gazette & Registration'}
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {language === 'tr'
                      ? 'Kenya Yasaları Fasıl 164 uyarınca 27 Mayıs 2025 tarihli tadil edilmiş vakıf senedi tescil edildi ve Resmî Gazete’de ilan edildi (Ağustos 2025).'
                      : 'Amended trust deed under Cap 164 registered and gazetted in August 2025 with 12 institutional trustees.'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg flex items-start gap-3">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-900">
                    {language === 'tr'
                      ? '2. Aşama: CUE Altyapı Denetimi ve Müfredat İncelemesi'
                      : 'Phase 2: CUE Infrastructure & Curriculum Review'}
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {language === 'tr'
                      ? 'Üniversite Eğitim Komisyonu (CUE) gereksinimlerine göre fiziksel karkas tamamlanması ve akademik müfredat uyumu devam etmektedir.'
                      : 'Commission for University Education technical inspections and curriculum validation currently in progress.'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-900">
                    {language === 'tr'
                      ? '3. Aşama: Cumhurbaşkanlığı Üniversite Beratı (Charter)'
                      : 'Phase 3: Presidential Charter Grant'}
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {language === 'tr'
                      ? 'Hedef: 2027 akademik yılına kadar üniversite beratının alınması ve ilk öğrenci alımının başlatılması.'
                      : 'Target: Final Presidential Charter grant conferring full degree-awarding authority ahead of 2027 student intake.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
