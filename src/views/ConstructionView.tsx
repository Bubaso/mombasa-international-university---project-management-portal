import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import { Building2, AlertTriangle, FileSpreadsheet, Plus, Wrench, Trash2 } from 'lucide-react';

interface BoQItem {
  id: string;
  itemEn: string;
  itemTr: string;
  costKShs: number;
  urgency: 'Critical' | 'High' | 'Medium';
}

import { useNavigate } from 'react-router-dom';
import { ContextualAIAssistant } from '../components/ContextualAIAssistant';

export const ConstructionView: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useApp();
  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();
  const { mutate: updateConstructionBlock } = queries.useUpdateConstructionBlock();
  const [selectedBlockId, setSelectedBlockId] = useState<string>(constructionBlocks[0]?.id || '');
  const [showBoQModal, setShowBoQModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddBoQModal, setShowAddBoQModal] = useState(false);

  // Dynamic BoQ State
  const [boqList, setBoqList] = useState<BoQItem[]>([]);
  const [newBoqItem, setNewBoqItem] = useState('');
  const [newBoqCost, setNewBoqCost] = useState<number>(0);
  const [newBoqUrgency, setNewBoqUrgency] = useState<'Critical' | 'High' | 'Medium'>('Critical');

  // Inspection form
  const [inspectorName, setInspectorName] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [newProgress, setNewProgress] = useState(0);

  // New task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskStatus, setTaskStatus] = useState<
    'in_progress' | 'urgent_preservation' | 'blocked_by_status_quo' | 'completed'
  >('urgent_preservation');

  const selectedBlock =
    constructionBlocks.find((b) => b.id === selectedBlockId) || constructionBlocks[0];

  const handleSaveInspection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlock) return;
    updateConstructionBlock({
      id: selectedBlock.id,
      updates: {
        progressPercent: newProgress,
        lastInspectionDate: new Date().toISOString().split('T')[0],
        leadEngineer: inspectorName || selectedBlock.leadEngineer,
      },
    });
    setShowInspectionModal(false);
    setInspectionNotes('');
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlock || !taskTitle) return;
    const newTask = {
      id: `tsk-${Date.now()}`,
      task: taskTitle,
      status: taskStatus,
      dueDate: taskDueDate || new Date().toISOString().split('T')[0],
    };
    updateConstructionBlock({
      id: selectedBlock.id,
      updates: {
        items: [...(selectedBlock.items || []), newTask],
      },
    });
    setTaskTitle('');
    setTaskDueDate('');
    setShowAddTaskModal(false);
  };

  const handleAddBoQ = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoqItem || !newBoqCost) return;
    const item: BoQItem = {
      id: `boq-${Date.now()}`,
      itemEn: newBoqItem,
      itemTr: newBoqItem,
      costKShs: Number(newBoqCost),
      urgency: newBoqUrgency,
    };
    setBoqList([...boqList, item]);
    setNewBoqItem('');
    setNewBoqCost(0);
    setShowAddBoQModal(false);
  };

  const handleDeleteBoQ = (id: string) => {
    setBoqList(boqList.filter((b) => b.id !== id));
  };

  const totalBoQBudget = boqList.reduce((acc, curr) => acc + curr.costKShs, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>
              {language === 'tr'
                ? '1. Aşama Yerleşke İnşaatı & Yapısal Koruma'
                : 'Phase 1 Campus Infrastructure & Civil Works'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {language === 'tr' ? 'İnşaat İşleri' : 'Construction'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowBoQModal(true)}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600" />
            <span>
              {language === 'tr' ? 'Metraj & Keşif Cetveli (BoQ)' : 'QS Bill of Quantities'}
            </span>
          </button>
          <button
            onClick={() => setShowInspectionModal(true)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'tr' ? 'Saha Denetim Kaydı Ekle' : 'Log Site Inspection'}</span>
          </button>
        </div>
      </div>

      {/* Critical Roof Protection Banner */}
      <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 pb-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce" />
            <span>
              {language === 'tr'
                ? 'Acil Yapısal Koruma Uyarısı: Blok A1 Çatı Kapatma Zorunluluğu'
                : 'Urgent Structural Dilapidation Alert: Block A1 Roof Encapsulation'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-rose-800 bg-rose-100 px-2 py-0.5 rounded border border-rose-300 font-semibold">
            {language === 'tr'
              ? 'Telafisi İmkansız Zarar Doktrini (Substantial Loss)'
              : 'Doctrine of Substantial Loss'}
          </span>
        </div>
        <p className="text-xs text-slate-700 leading-relaxed">
          {language === 'tr'
            ? 'Metraj ve Maliyet Uzmanı (QS) ve yapı denetim mühendislerinin tespitlerine göre; 4 katlı Blok A1 (Bilişim & İktisat Fakültesi) karkasının açıkta kalması, muson yağmurlarında beton dökülmelerine ve çelik donatıların paslanmasına yol açacaktır. 9 Şubat 2026 tarihli mahkeme kararının "koruyucu tedbirleri kapsamadığı" hususunda Yargıtay’a acil başvuru (Certificate of Urgency) yapılarak yatırım heba olmaktan kurtarılacaktır.'
            : 'According to structural surveys, leaving the 4-story reinforced concrete frame of Block A1 exposed during upcoming seasonal rainfall will trigger irreparable spalling and structural carbonation. Counsel is filing an urgent variation motion to distinguish between "new development" and "preservation of the suit property", preventing the appeal from being rendered nugatory.'}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-[11px] text-slate-600">
            {language === 'tr' ? 'Hukuki Dayanak:' : 'Legal Ground:'}{' '}
            <span className="text-slate-900 font-semibold">
              {language === 'tr'
                ? 'Temyiz Konusunun Korunması (Preservation of Substratum)'
                : 'Preservation of Substratum'}
            </span>
          </div>
          <button
            onClick={() => navigate('legal')}
            className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline cursor-pointer"
          >
            {language === 'tr'
              ? 'Yargıtay Başvuru Dilekçesini İncele'
              : 'View Court Variation Motion'}
          </button>
        </div>
      </div>

      {/* Campus Blocks Selector & Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Block Cards */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
            {language === 'tr' ? 'İzlenen Yerleşke Yapıları' : 'Monitored Campus Facilities'}
          </div>
          {constructionBlocks.map((b) => (
            <div
              key={b.id}
              onClick={() => setSelectedBlockId(b.id)}
              className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                selectedBlockId === b.id
                  ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-emerald-700 font-bold">{b.code}</span>
                <span className="font-mono font-bold text-slate-800">{b.progressPercent}%</span>
              </div>
              <h3 className="font-semibold text-slate-900 text-xs mt-1">{b.name}</h3>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${b.progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                <span>
                  {b.floors} {language === 'tr' ? 'Kat' : 'Floors'} ·{' '}
                  {b.totalAreaSqm.toLocaleString()} m²
                </span>
                {b.urgentPreservationNeeded && (
                  <span className="text-rose-700 font-medium text-[10px] flex items-center gap-1 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                    {language === 'tr' ? 'Acil Koruma' : 'Preservation Needed'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Selected Block Deep Dive */}
        {selectedBlock && (
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="font-mono text-emerald-700 text-xs font-bold uppercase">
                  {selectedBlock.code}
                </span>
                <h2 className="text-lg font-bold text-slate-900">{selectedBlock.name}</h2>
                <div className="text-xs text-slate-500 mt-0.5">{selectedBlock.leadEngineer}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddTaskModal(true)}
                  className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{language === 'tr' ? 'Aşama / Görev Ekle' : 'Add Task'}</span>
                </button>
              </div>
            </div>

            {/* Critical Preservation Directive */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <span className="text-amber-800 font-bold uppercase text-[10px] tracking-wider">
                {language === 'tr' ? 'Koruma Tedbiri Açıklaması:' : 'Preservation Directive:'}
              </span>
              <p className="text-slate-700 leading-relaxed text-[11px]">
                {language === 'tr'
                  ? selectedBlock.preservationActionTr
                  : selectedBlock.preservationActionEn}
              </p>
            </div>

            {/* Tasks & Engineering Milestones */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {language === 'tr'
                    ? 'İnşaat Aşamaları ve Hukuki Uyumluluk'
                    : 'Engineering Milestones & Compliance'}
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {selectedBlock.items.length} {language === 'tr' ? 'Aşama' : 'Tasks'}
                </span>
              </div>

              {selectedBlock.items.length === 0 ? (
                <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                  <Wrench className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500">
                    {language === 'tr'
                      ? 'Bu yapı için henüz görev veya aşama kaydı eklenmemiştir.'
                      : 'No specific engineering tasks logged for this block yet.'}
                  </p>
                  <button
                    onClick={() => setShowAddTaskModal(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{language === 'tr' ? 'İlk Aşamayı Kaydet' : 'Log First Task'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {selectedBlock.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-800">{item.task}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {language === 'tr' ? 'Hedef Tarih:' : 'Target Due:'} {item.dueDate}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${
                          item.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : item.status === 'urgent_preservation'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : item.status === 'blocked_by_status_quo'
                                ? 'bg-slate-200 text-slate-700 border-slate-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {language === 'tr'
                          ? item.status === 'urgent_preservation'
                            ? 'Acil Koruma'
                            : item.status === 'completed'
                              ? 'Tamamlandı'
                              : item.status === 'blocked_by_status_quo'
                                ? 'Mevcut Durum Kapsamında'
                                : 'İşlemde'
                          : item.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BoQ Breakdown Modal */}
      {showBoQModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
          <div className="w-full sm:max-w-2xl bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-mono text-amber-800 uppercase font-bold">
                  {language === 'tr'
                    ? 'Metraj ve Maliyet Bilirkişi Modülü (QS)'
                    : 'Quantity Surveying & Bills of Quantities'}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {language === 'tr'
                    ? 'Metraj ve Keşif (BoQ) Kalemleri'
                    : 'Bill of Quantities (BoQ)'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddBoQModal(true)}
                  className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded text-xs font-semibold cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{language === 'tr' ? 'Kalem Ekle' : 'Add Item'}</span>
                </button>
                <button
                  onClick={() => setShowBoQModal(false)}
                  className="text-slate-400 hover:text-slate-700 ml-2 cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs">
              {boqList.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                  <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
                  <h4 className="text-xs font-bold text-slate-700">
                    {language === 'tr'
                      ? 'Kayıtlı BoQ Kalemi Bulunmuyor'
                      : 'No BoQ Items Recorded Yet'}
                  </h4>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    {language === 'tr'
                      ? 'Metraj ve maliyet uzmanı (QS) tarafından hazırlanan resmi keşif kalemlerini yukarıdaki "Kalem Ekle" butonundan sisteme girebilirsiniz.'
                      : 'Add verified Bill of Quantities items prepared by the Quantity Surveyor using the "Add Item" button.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {boqList.map((row) => (
                    <div
                      key={row.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {language === 'tr' ? row.itemTr : row.itemEn}
                        </div>
                        <span className="text-[10px] font-mono text-rose-700 font-medium">
                          {row.urgency}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-amber-800">
                          KShs {row.costKShs.toLocaleString()}
                        </span>
                        <button
                          onClick={() => handleDeleteBoQ(row.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between font-bold text-slate-900">
                    <span>{language === 'tr' ? 'Toplam BoQ Tutarı:' : 'Total BoQ Budget:'}</span>
                    <span className="font-mono text-amber-800">
                      KShs {totalBoQBudget.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowBoQModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                {language === 'tr' ? 'Kapat' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add BoQ Item Modal */}
      {showAddBoQModal && (
        <div className="fixed inset-0 z-55 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
          <div className="w-full sm:max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'tr'
                  ? 'Yeni Metraj/Keşif (BoQ) Kalemi Ekle'
                  : 'Add Bill of Quantities Item'}
              </h3>
              <button
                onClick={() => setShowAddBoQModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddBoQ} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Kalem / İş Tanımı:' : 'Item Description:'}
                </label>
                <input
                  type="text"
                  required
                  value={newBoqItem}
                  onChange={(e) => setNewBoqItem(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Örn: Çatı makasları ve aşık imalatı'
                      : 'e.g. Roof trusses fabrication'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Maliyet (KShs):' : 'Estimated Cost (KShs):'}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newBoqCost || ''}
                  onChange={(e) => setNewBoqCost(Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Aciliyet Seviyesi:' : 'Urgency Level:'}
                </label>
                <select
                  value={newBoqUrgency}
                  onChange={(e) => setNewBoqUrgency(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                >
                  <option value="Critical">
                    {language === 'tr' ? 'Kritik (Critical)' : 'Critical'}
                  </option>
                  <option value="High">{language === 'tr' ? 'Yüksek (High)' : 'High'}</option>
                  <option value="Medium">{language === 'tr' ? 'Orta (Medium)' : 'Medium'}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddBoQModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer font-medium"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Kaydet' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
          <div className="w-full sm:max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'tr'
                  ? 'Yapıya Yeni Aşama / Görev Ekle'
                  : 'Add Structural Milestone / Task'}
              </h3>
              <button
                onClick={() => setShowAddTaskModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddTask} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Aşama / Görev Tanımı:' : 'Task Description:'}
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Örn: Zemin drenaj kanalları açılması'
                      : 'e.g. Foundation drainage channels'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Durum / Statü:' : 'Task Status:'}
                </label>
                <select
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                >
                  <option value="urgent_preservation">
                    {language === 'tr'
                      ? 'Acil Koruma Tedbiri (Urgent Preservation)'
                      : 'Urgent Preservation'}
                  </option>
                  <option value="in_progress">
                    {language === 'tr' ? 'Devam Ediyor / İşlemde (In Progress)' : 'In Progress'}
                  </option>
                  <option value="blocked_by_status_quo">
                    {language === 'tr'
                      ? 'Mevcut Durum Nedeniyle Durduruldu (Blocked by Status Quo)'
                      : 'Blocked by Status Quo'}
                  </option>
                  <option value="completed">
                    {language === 'tr' ? 'Tamamlandı (Completed)' : 'Completed'}
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Hedef Tarih:' : 'Target Due Date:'}
                </label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer font-medium"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Görevi Kaydet' : 'Save Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Inspection Modal */}
      {showInspectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'tr' ? 'Saha Denetim Kaydı Gir' : 'Record Site Inspection'}
              </h3>
              <button
                onClick={() => setShowInspectionModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveInspection} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Denetçi Mühendis / Uzman:' : 'Lead Inspector / QS:'}
                </label>
                <input
                  type="text"
                  required
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  placeholder={
                    language === 'tr' ? 'Mühendis veya Denetçi Adı...' : 'Inspector name...'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr'
                    ? 'Yeni İlerleme Yüzdesi (%):'
                    : 'Updated Progress Percentage (%):'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newProgress}
                  onChange={(e) => setNewProgress(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr'
                    ? 'Saha Gözlemleri & Yapısal Notlar:'
                    : 'Structural Observations & Findings:'}
                </label>
                <textarea
                  rows={3}
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Betonarme durumu, nem kontrolü ve çevre duvarı güvenlik notları...'
                      : 'Concrete frame status, moisture readings, and perimeter boundary observations...'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInspectionModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs cursor-pointer font-medium"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Denetim Kaydını İmzala' : 'Sign & Submit Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ContextualAIAssistant
        contextData={JSON.stringify({ blocks: constructionBlocks })}
        systemInstruction="You are an expert construction project management AI. Analyze block progress, identify bottlenecks, and suggest preservation actions based on the provided context."
        title={language === 'tr' ? 'İnşaat AI Asistanı' : 'Construction AI Assistant'}
      />
    </div>
  );
};
