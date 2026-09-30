/**
 * Budget, finance and donor transparency (M8).
 *
 * The evaluation called budget management one of two things the old portal
 * did well, and that was half right: the discipline was there, the
 * verifiability was not. This screen reported a live QuickBooks connection
 * that was a `setTimeout`, printed figures with no stated source, and showed
 * an "audited" badge sitting on a boolean anybody could set.
 *
 * What replaces the integration is not a smaller version of it. It is a CSV
 * file, on the ledger tab, with every amount in the currency it was recorded
 * in, the rate beside it, and the base figure — so nothing about the
 * conversion has to be taken on trust (M8-10).
 *
 * What replaces the badge is a function the browser cannot get around: only
 * the audit committee and the external auditor can produce one, and the
 * spender never can.
 */
import React, { useState } from 'react';
import { BadgeCheck, HandCoins, Receipt, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuthority } from '../api/adminHooks';
import { BudgetPanel } from '../components/money/BudgetPanel';
import { VoucherPanel } from '../components/money/VoucherPanel';
import { LedgerPanel } from '../components/money/LedgerPanel';
import { DonationPanel } from '../components/money/DonationPanel';

type Tab = 'budget' | 'vouchers' | 'ledger' | 'donations';

const acts = (roles: string[] | undefined, ...wanted: string[]) =>
  roles != null && wanted.some((role) => roles.includes(role));

export const FinanceAccountingView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const authority = useAuthority();
  const [tab, setTab] = useState<Tab>('budget');

  const roles = authority.data?.roles;
  const canSpend = acts(roles, 'admin', 'project_director', 'board_director');
  // Ruling on a voucher is not one permission: which roles may sign depends
  // on the amount, and the database decides from a table of thresholds. This
  // only asks whether the person is ever in any of those bands.
  const canRule = acts(roles, 'admin', 'project_director', 'board_director', 'trustee');
  const canAudit = acts(roles, 'audit_committee', 'external_auditor');

  const TABS: { key: Tab; icon: React.ElementType; label: string }[] = [
    { key: 'budget', icon: Wallet, label: tr ? 'Bütçe' : 'Budget' },
    { key: 'vouchers', icon: Receipt, label: tr ? 'Ödeme fişleri' : 'Vouchers' },
    { key: 'ledger', icon: BadgeCheck, label: tr ? 'Kasa defteri' : 'Ledger' },
    { key: 'donations', icon: HandCoins, label: tr ? 'Bağışlar' : 'Donations' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2.5">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {tr ? 'Bütçe ve Finans' : 'Budget and Finance'}
          </h1>
          <p className="max-w-2xl text-xs text-slate-500">
            {tr
              ? 'Bağışçılar Türkiye’de, harcama Kenya’da, denetim üçüncü bir yerde. Her tutar kendi para biriminde ve kullanılan kurla birlikte durur; "denetlendi" rozetini yalnızca denetçi koyabilir.'
              : 'Donors are in Türkiye, the spending is in Kenya, the audit is somewhere else. Every amount keeps its own currency and the rate used, and only an auditor can produce the audited badge.'}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              tab === key
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'budget' && <BudgetPanel canSpend={canSpend} />}
      {tab === 'vouchers' && <VoucherPanel canRule={canRule} />}
      {tab === 'ledger' && <LedgerPanel canSpend={canSpend} canAudit={canAudit} />}
      {tab === 'donations' && <DonationPanel canSpend={canSpend} />}
    </div>
  );
};
