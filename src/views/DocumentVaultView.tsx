import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import { type DocumentItem } from '../types';
import { Lock, ShieldCheck, Download, Upload, Search, Key } from 'lucide-react';
import { ContextualAIAssistant } from '../components/ContextualAIAssistant';

export const DocumentVaultView: React.FC = () => {
  const { language, showToast } = useApp();
  const { data: documentVault = [] } = queries.useDocumentVault();
  const { mutate: addDocument } = queries.useAddDocument();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchDocQuery, setSearchDocQuery] = useState<string>('');
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);

  // Upload modal form
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<DocumentItem['category']>('legal_pleadings');
  const [docVersion, setDocVersion] = useState('v1.0');
  const [docDescription, setDocDescription] = useState('');

  const filteredDocs = documentVault.filter((doc) => {
    if (selectedCategory !== 'all' && doc.category !== selectedCategory) return false;
    if (searchDocQuery.trim()) {
      const q = searchDocQuery.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.sha256Hash.toLowerCase().includes(q) ||
        doc.descriptionEn.toLowerCase().includes(q) ||
        doc.descriptionTr.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle) return;
    addDocument({
      title: docTitle,
      category: docCategory,
      version: docVersion,
      descriptionEn: docDescription || 'Official document archived in encrypted repository.',
      descriptionTr: docDescription || 'Şifreli kasada arşivlenen resmi belge.',
    });
    setDocTitle('');
    setDocDescription('');
    setShowUploadModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wider">
            <Lock className="w-4 h-4 text-blue-600" />
            <span>
              {language === 'tr'
                ? 'Şifreli Belge Kasası & Versiyon Kontrolü'
                : 'Encrypted Document Vault & Version Control'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {language === 'tr' ? 'Belge Kasası' : 'Document Vault'}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>
              {language === 'tr' ? 'Yeni Belge / Versiyon Yükle' : 'Upload Document / Version'}
            </span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200 p-3 rounded-xl shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 text-xs scrollbar-none snap-x">
          {[
            { id: 'all', labelEn: 'All Files', labelTr: 'Tüm Belgeler' },
            { id: 'trust_deed', labelEn: 'Trust Deed', labelTr: 'Vakıf Senedi' },
            { id: 'court_order', labelEn: 'Court Orders', labelTr: 'Mahkeme Kararları' },
            { id: 'legal_pleadings', labelEn: 'Legal Pleadings', labelTr: 'Dava Layihaları' },
            { id: 'boq_finance', labelEn: 'QS BoQ & Audit', labelTr: 'Metraj & Denetim' },
            { id: 'architectural', labelEn: 'Architectural', labelTr: 'Mimari Çizimler' },
            { id: 'accreditation_cue', labelEn: 'CUE Charter', labelTr: 'CUE Akreditasyon' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer shrink-0 snap-start ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {language === 'tr' ? cat.labelTr : cat.labelEn}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchDocQuery}
            onChange={(e) => setSearchDocQuery(e.target.value)}
            placeholder={
              language === 'tr' ? 'Belge adı veya SHA özeti...' : 'Search document or hash...'
            }
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Documents Grid */}
      {filteredDocs.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-200 shadow-xs space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {language === 'tr'
              ? 'Seçili Kriterde Belge Bulunamadı'
              : 'No Documents Found for Selected Filter'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {language === 'tr'
              ? 'Aradığınız kritere uygun belge bulunamadı. Yeni bir belge yüklemek için yukarıdaki butonu kullanabilirsiniz.'
              : 'No documents match your query or selected category. Click "Upload Document / Version" above to store new files.'}
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{language === 'tr' ? 'Belge Yükle' : 'Upload File'}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => {
            const categoryLabel = (() => {
              const map: Record<string, { en: string; tr: string }> = {
                trust_deed: { en: 'Trust Deed', tr: 'Vakıf Senedi' },
                court_order: { en: 'Court Order', tr: 'Mahkeme Kararı' },
                legal_pleadings: { en: 'Legal Pleadings', tr: 'Dava Layihası' },
                boq_finance: { en: 'QS BoQ & Audit', tr: 'Metraj & Denetim' },
                architectural: { en: 'Architectural / Photos', tr: 'Mimari / Fotoğraflar' },
                accreditation_cue: { en: 'CUE Charter', tr: 'CUE Akreditasyon' },
              };
              return language === 'tr'
                ? map[doc.category]?.tr || doc.category
                : map[doc.category]?.en || doc.category.replace('_', ' ');
            })();

            return (
              <div
                key={doc.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-blue-700 font-bold uppercase">
                      {categoryLabel}
                    </span>
                    <span className="text-emerald-800 font-mono font-bold bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded">
                      {doc.version}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-xs leading-snug line-clamp-2">
                    {doc.title}
                  </h3>

                  <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                    {language === 'tr' ? doc.descriptionTr : doc.descriptionEn}
                  </p>
                </div>

                {/* Cryptographic Hash & Metadata */}
                <div className="space-y-2 pt-2 border-t border-slate-100 text-[11px]">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="flex items-center gap-1">
                      <Key className="w-3 h-3 text-amber-600" />
                      <span>{language === 'tr' ? 'Doğrulama Kodu:' : 'Verification Code:'}</span>
                    </span>
                    <span
                      className="font-mono text-slate-700 truncate max-w-[150px]"
                      title={doc.sha256Hash}
                    >
                      {doc.sha256Hash.slice(0, 16)}...
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-500 text-[10px]">
                    <span>{doc.uploadedBy}</span>
                    <span>
                      {doc.fileSize} · {doc.fileFormat}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="inline-flex items-center gap-1 text-emerald-700 text-[10px] font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>{language === 'tr' ? 'Güvenli Belge' : 'Secure Document'}</span>
                    </span>

                    <button
                      onClick={() => {
                        showToast(
                          language === 'tr'
                            ? `"${doc.title}" indirildi ve doğrulaması sağlandı.`
                            : `"${doc.title}" downloaded and verified.`,
                        );
                      }}
                      className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold cursor-pointer py-1 px-2 rounded-lg hover:bg-blue-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{language === 'tr' ? 'İndir' : 'Download'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
          <div className="w-full sm:max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>{language === 'tr' ? 'Kasaya Belge Yükle' : 'Upload Document to Vault'}</span>
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Belge Başlığı:' : 'Document Title:'}
                </label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Court of Appeal Additional Affidavit of DW-1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Kategori:' : 'Category:'}
                </label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                >
                  <option value="legal_pleadings">
                    {language === 'tr'
                      ? 'Dava Layihaları ve Savunmalar'
                      : 'Legal Pleadings & Briefs'}
                  </option>
                  <option value="court_order">
                    {language === 'tr'
                      ? 'Mahkeme Kararları ve Tedbirler'
                      : 'Court Orders & Injunctions'}
                  </option>
                  <option value="trust_deed">
                    {language === 'tr' ? 'Vakıf Senedi ve Tüzük' : 'Trust Deed & Constitution'}
                  </option>
                  <option value="boq_finance">
                    {language === 'tr'
                      ? 'Metraj, BoQ ve Fatura Evrakları'
                      : 'Quantity Surveyor BoQ & Invoices'}
                  </option>
                  <option value="architectural">
                    {language === 'tr'
                      ? 'Mimari Planlar ve Şantiye Görselleri'
                      : 'Architectural Plans & Site Renders'}
                  </option>
                  <option value="accreditation_cue">
                    {language === 'tr' ? 'CUE Akreditasyon Dosyası' : 'CUE Accreditation Dossier'}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Versiyon Numarası:' : 'Version Tag:'}
                </label>
                <input
                  type="text"
                  value={docVersion}
                  onChange={(e) => setDocVersion(e.target.value)}
                  placeholder="v1.0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Açıklama / Özet:' : 'Description:'}
                </label>
                <textarea
                  rows={3}
                  value={docDescription}
                  onChange={(e) => setDocDescription(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Belge içeriği ve özet bilgisi...'
                      : 'Description of the record...'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer font-medium"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Şifrele ve Yükle' : 'Encrypt & Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ContextualAIAssistant
        contextData={JSON.stringify(documentVault)}
        systemInstruction="You are an expert document archivist AI. Help the user find specific document versions, clarify access roles, and summarize document categories based ONLY on the provided context."
        title={language === 'tr' ? 'Döküman AI Asistanı' : 'Document Vault AI'}
      />
    </div>
  );
};
