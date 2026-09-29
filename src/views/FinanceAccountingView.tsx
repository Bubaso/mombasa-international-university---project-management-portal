import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import {
  Receipt,
  CheckCircle2,
  Plus,
  ShieldCheck,
  TrendingUp,
  CreditCard
} from 'lucide-react';
import { ContextualAIAssistant } from '../components/ContextualAIAssistant';

export const FinanceAccountingView: React.FC = () => {
  const { language } = useApp();
  const { data: transactions = [] } = queries.useTransactions();
  const { mutate: addTransaction } = queries.useAddTransaction();
  const FINANCIAL_SUMMARY: any = { breakdown: [] };

  const [showNewVoucherModal, setShowNewVoucherModal] = useState(false);
  const [payee, setPayee] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState<'civil_construction' | 'architectural_qs' | 'legal_defence' | 'site_security'>('civil_construction');

  const handleCreateVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payee || !amount) return;
    addTransaction({
      payee,
      description,
      amountKShs: Number(amount),
      category
    });
    setPayee('');
    setDescription('');
    setAmount(0);
    setShowNewVoucherModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider">
            <Receipt className="w-4 h-4 text-emerald-600" />
            <span>{language === 'tr' ? 'Mali Denetim & Muhasebe Entegrasyonu' : 'Capital Expenditure & Accounting API Sync'}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {language === 'tr' ? 'Finans ve Muhasebe' : 'Finance & Accounting'}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowNewVoucherModal(true)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'tr' ? 'Yeni Ödeme Fişi (PV) Gir' : 'Log Payment Voucher'}</span>
          </button>
        </div>
      </div>


      {/* Capital Expenditure Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <span>{language === 'tr' ? '807.3M KShs Sermaye Harcama Dağılımı' : 'KShs 807.3M Capital Expenditure'}</span>
            </h2>
            <span className="text-[11px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {language === 'tr' ? 'Resmi Kayıtlı Veri' : 'Verified Official Data'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {FINANCIAL_SUMMARY.breakdown.map((item: any, idx: number) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 font-medium">
                    {language === 'tr' ? item.categoryTr : item.categoryEn}
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    KShs {(item.amountKShs / 1000000).toFixed(1)}M
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Donor Tranches & Endowment Target */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-600" />
              <span>{language === 'tr' ? 'Bağışçı Fonu ve 1. Aşama Bütçesi' : 'Donor Tranches & 1st Phase Budget'}</span>
            </h2>
            <span className="text-[11px] font-mono text-purple-700 font-medium bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              {language === 'tr' ? 'Türk & Kenyalı Hayırseverler' : 'Turkish & Kenyan Donors'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[11px]">{language === 'tr' ? '1. Aşama Toplam Bütçe' : 'Phase 1 Total Budget'}</span>
              <div className="font-mono text-lg font-bold text-slate-900 mt-1">KShs 1.25B</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[11px]">{language === 'tr' ? 'Taahhüt Edilen Bağış' : 'Committed Funds'}</span>
              <div className="font-mono text-lg font-bold text-purple-700 mt-1">KShs 980M</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[11px]">{language === 'tr' ? 'Fiili Kullanılan (Hakediş)' : 'Disbursed to Date'}</span>
              <div className="font-mono text-lg font-bold text-emerald-700 mt-1">KShs 807.3M</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[11px]">{language === 'tr' ? 'Kalan Taahhüt' : 'Remaining Commitment'}</span>
              <div className="font-mono text-lg font-bold text-amber-800 mt-1">KShs 172.6M</div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">
              {language === 'tr' ? 'Vergi Muafiyet Avantajı (KRA Tax Status):' : 'Tax-Exempt Donor Advantage:'}
            </div>
            <p className="text-[11px] leading-relaxed">
              {language === 'tr'
                ? 'Kenya Gelirler İdaresi (KRA) nezdinde tamamlanmakta olan resmi vergi muafiyeti ile kurumsal bağışçıların katkıları vergiden düşülebilir hale gelecektir.'
                : 'Corporate and individual donors will be able to deduct charitable contributions once KRA formalizes the tax-exemption certificate for AUTK.'}
            </p>
          </div>
        </div>
      </div>

      {/* Audited Transaction Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>{language === 'tr' ? 'Denetlenmiş Sermaye Ödeme Fişleri (Payment Vouchers - PV)' : 'Audited Payment Vouchers Ledger'}</span>
          </h2>
          <span className="text-[11px] font-mono text-slate-500">
            {transactions.length} {language === 'tr' ? 'Kayıt' : 'Records'}
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-slate-400">
              <Receipt className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-sm font-bold text-slate-800">
                {language === 'tr' ? 'Senkronize Edilmiş Ödeme Fişi Bulunmuyor' : 'No Payment Vouchers Synchronized Yet'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {language === 'tr'
                  ? 'Muhasebe sisteminizden (QuickBooks, SAP vb.) canlı senkronizasyon yaparak veya yukarıdaki "Yeni Ödeme Fişi (PV) Gir" butonundan işlem ekleyerek kayıt oluşturabilirsiniz.'
                  : 'Connect your accounting software API gateway above or click "Log Payment Voucher" to record audited project disbursements.'}
              </p>
            </div>
            <button
              onClick={() => setShowNewVoucherModal(true)}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'tr' ? 'İlk Ödeme Fişini Gir' : 'Log First Payment Voucher'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            {transactions.map((tx: any) => (
              <div
                key={tx.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-amber-800 font-bold">{tx.referenceNo}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">{tx.date}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-purple-700 font-semibold">{tx.payee}</span>
                  </div>
                  <div className="font-semibold text-slate-800">{tx.description}</div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <div className="font-mono font-bold text-emerald-700 text-sm">
                    KShs {tx.amountKShs.toLocaleString()}
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 font-mono font-medium">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    {language === 'tr' ? 'DENETLENDİ' : 'AUDITED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Payment Voucher Modal */}
      {showNewVoucherModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
          <div className="w-full sm:max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'tr' ? 'Yeni Ödeme Fişi (Payment Voucher - PV) Düzenle' : 'Create Payment Voucher (PV)'}
              </h3>
              <button
                onClick={() => setShowNewVoucherModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVoucher} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Alıcı / Müteahhit / Firma:' : 'Payee / Contractor:'}
                </label>
                <input
                  type="text"
                  required
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder={language === 'tr' ? 'Örn: Yapı Mühendisliği Ltd.' : 'e.g. Coast Engineering Ltd'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Harcama Kategorisi:' : 'Disbursement Category:'}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                >
                  <option value="civil_construction">
                    {language === 'tr' ? 'İnşaat & Karkas İşleri (Civil Construction)' : 'Civil & Structural Works'}
                  </option>
                  <option value="architectural_qs">
                    {language === 'tr' ? 'Mimari, Mühendislik & Metraj (QS)' : 'Architectural, Engineering & QS'}
                  </option>
                  <option value="legal_defence">
                    {language === 'tr' ? 'Hukuki Savunma & Dava Giderleri (Legal Defense)' : 'Legal Defense & Filings'}
                  </option>
                  <option value="site_security">
                    {language === 'tr' ? 'Saha Güvenliği & Çevre Koruma (Site Security)' : 'Site Security & Perimeter Watch'}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Tutar (KShs):' : 'Amount (KShs):'}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Açıklama / Fatura Referansı:' : 'Description / Invoice Ref:'}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={language === 'tr' ? 'Hakediş detayı veya iş açıklaması...' : 'Work detail or payment rationale...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewVoucherModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs cursor-pointer font-medium"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Ödeme Fişini Kaydet' : 'Record Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    
      <ContextualAIAssistant 
        contextData={JSON.stringify({ transactions })}
        systemInstruction="You are an expert financial auditor AI. Analyze transactions, calculate totals, and identify suspicious spending or trends based ONLY on the provided financial data."
        title={language === 'tr' ? 'Finans AI Asistanı' : 'Finance AI Assistant'}
      />
    
</div>
  );
};
