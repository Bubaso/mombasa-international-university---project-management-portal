/**
 * The four figures, kept apart (M8-02).
 *
 * The old summary added commitments into spend, which flatters every number
 * it touches: money promised to somebody looks like money already gone, so
 * the remaining figure is right by accident and the spent figure is wrong on
 * purpose. Here they are four columns, computed by a view, and the one that
 * matters most — what is left — subtracts both.
 *
 * The distribution below comes from the same rows rather than a constant,
 * which is why it changes when the budget does (M8-09).
 */
import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { PieChart, Plus, Wallet } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as money from '../../api/moneyHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import {
  ActionButton,
  Field,
  Section,
  Select,
  TableFrame,
  Td,
  TextInput,
  Th,
  WriteError,
} from '../ui/Controls';
import { CURRENCIES, money as fmt } from '../../lib/site';
import { share } from '../../lib/money';
import type { CurrencyCode } from '../../types';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

export const BudgetPanel: React.FC<{ canSpend: boolean }> = ({ canSpend }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const categories = money.useBudgetCategories();
  const positions = money.useBudgetPositions();
  const spend = money.useCategorySpend();
  const createLine = money.useCreateBudgetLine();
  const createCategory = money.useCreateCategory();

  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('KES');
  const [rate, setRate] = useState('1');
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryName, setCategoryName] = useState('');

  const rows = positions.data ?? [];
  // Bu ekranın bütün satırlarının kökeni, tek okumada (M13-21).
  const origins = useRecordOrigins(rows.map((r) => r.budgetLineId));
  const totals = rows.reduce(
    (acc, row) => ({
      budget: acc.budget + row.budgetKes,
      committed: acc.committed + row.committedKes,
      spent: acc.spent + row.spentKes,
      remaining: acc.remaining + row.remainingKes,
    }),
    { budget: 0, committed: 0, spent: 0, remaining: 0 },
  );

  return (
    <div className="space-y-4">
      <Section
        icon={Wallet}
        title={tr ? 'Bütçe' : 'Budget'}
        subtitle={
          tr
            ? 'Dört rakam ayrı tutulur: bütçe, taahhüt edilen, harcanan, kalan. Onaylanmış bir ödeme henüz harcanmamıştır ama kalandan düşer.'
            : 'Four figures kept apart: budget, committed, spent, remaining. An approved payment is not yet spent, but it comes off what is left.'
        }
        whoMayUse={tr ? 'Direktör ve kurul.' : 'The director and the board.'}
        canUse={canSpend}
      >
        <QueryStatus queries={[positions, categories]} />

        {canSpend && (
          <div className="mb-3">
            {adding ? (
              (categories.data ?? []).length === 0 ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createCategory.mutate(
                      { code: categoryCode, nameEn: categoryName },
                      { onSuccess: () => setCategoryCode('') },
                    );
                  }}
                  className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
                >
                  <p className="text-xs text-slate-600">
                    {tr
                      ? 'Henüz kategori yok. Harcama dağılımı kategorilerden hesaplandığı için önce bir tane açın.'
                      : 'No categories yet. The spend distribution is computed from them, so open one first.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Field label={tr ? 'Kod' : 'Code'} className="w-28">
                      <TextInput
                        required
                        value={categoryCode}
                        onChange={(e) => setCategoryCode(e.target.value)}
                      />
                    </Field>
                    <Field label={tr ? 'Ad' : 'Name'} className="min-w-[160px] flex-1">
                      <TextInput
                        required
                        value={categoryName}
                        onChange={(e) => setCategoryName(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <ActionButton type="submit" tone="primary">
                      {tr ? 'Kategori aç' : 'Add category'}
                    </ActionButton>
                    <ActionButton type="button" onClick={() => setAdding(false)}>
                      {tr ? 'Vazgeç' : 'Cancel'}
                    </ActionButton>
                  </div>
                  <WriteError error={createCategory.error} />
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createLine.mutate(
                      {
                        budgetCategoryId: categoryId || (categories.data ?? [])[0]?.id || '',
                        titleEn: title,
                        amount: Number(amount),
                        currency,
                        fxRateToKes: currency === 'KES' ? 1 : Number(rate),
                        constructionBlockId: null,
                      },
                      { onSuccess: () => setAdding(false) },
                    );
                  }}
                  className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
                >
                  <div className="flex flex-wrap gap-2">
                    <Field label={tr ? 'Kategori' : 'Category'} className="min-w-[140px]">
                      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                        {(categories.data ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {tr ? (c.nameTr ?? c.nameEn) : c.nameEn}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={tr ? 'Kalem' : 'Line'} className="min-w-[160px] flex-1">
                      <TextInput
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </Field>
                    <Field label={tr ? 'Tutar' : 'Amount'} className="w-36">
                      <TextInput
                        type="number"
                        step="0.01"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </Field>
                    <Field label={tr ? 'Para birimi' : 'Currency'} className="w-24">
                      <Select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {/* Only asked for when it applies. The base currency has a
                        rate of one, and the database refuses anything else. */}
                    {currency !== 'KES' && (
                      <Field label={tr ? 'Kur (→ KES)' : 'Rate (→ KES)'} className="w-32">
                        <TextInput
                          type="number"
                          step="0.000001"
                          required
                          value={rate}
                          onChange={(e) => setRate(e.target.value)}
                        />
                      </Field>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <ActionButton type="submit" tone="primary" disabled={createLine.isPending}>
                      {tr ? 'Ekle' : 'Add'}
                    </ActionButton>
                    <ActionButton type="button" onClick={() => setAdding(false)}>
                      {tr ? 'Vazgeç' : 'Cancel'}
                    </ActionButton>
                  </div>
                  <WriteError error={createLine.error} />
                </form>
              )
            ) : (
              <ActionButton tone="primary" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr ? 'Bütçe kalemi ekle' : 'Add a budget line'}</span>
              </ActionButton>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={tr ? 'Bütçe kalemi yok' : 'No budget lines'}
            description={
              tr
                ? 'Bütçe tanımlanmamış, ya da mali kayıtlar sizin görebileceğiniz şeyler değil.'
                : 'No budget is defined, or the financial records are not yours to see.'
            }
          />
        ) : (
          <TableFrame
            head={
              <tr>
                <Th>{tr ? 'Kalem' : 'Line'}</Th>
                <Th className="text-right">{tr ? 'Bütçe' : 'Budget'}</Th>
                <Th className="text-right">{tr ? 'Taahhüt' : 'Committed'}</Th>
                <Th className="text-right">{tr ? 'Harcanan' : 'Spent'}</Th>
                <Th className="text-right">{tr ? 'Kalan' : 'Remaining'}</Th>
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.budgetLineId} className="border-t border-slate-100">
                <Td>
                  <Bilingual
                    table="budget_lines"
                    id={row.budgetLineId}
                    base="title"
                    en={row.titleEn}
                    tr={row.titleTr}
                  />
                  <RecordOrigin origin={origins.of(row.budgetLineId)} />
                </Td>
                <Td className="text-right font-mono">{fmt(row.budgetKes, 'KES')}</Td>
                <Td className="text-right font-mono text-sky-800">
                  {fmt(row.committedKes, 'KES')}
                </Td>
                <Td className="text-right font-mono">{fmt(row.spentKes, 'KES')}</Td>
                <Td
                  className={`text-right font-mono font-semibold ${
                    row.remainingKes < 0 ? 'text-rose-700' : 'text-slate-900'
                  }`}
                >
                  {fmt(row.remainingKes, 'KES')}
                </Td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-semibold">
              <Td>{tr ? 'Toplam' : 'Total'}</Td>
              <Td className="text-right font-mono">{fmt(totals.budget, 'KES')}</Td>
              <Td className="text-right font-mono text-sky-800">{fmt(totals.committed, 'KES')}</Td>
              <Td className="text-right font-mono">{fmt(totals.spent, 'KES')}</Td>
              <Td
                className={`text-right font-mono ${
                  totals.remaining < 0 ? 'text-rose-700' : 'text-slate-900'
                }`}
              >
                {fmt(totals.remaining, 'KES')}
              </Td>
            </tr>
          </TableFrame>
        )}
      </Section>

      <Section
        icon={PieChart}
        title={tr ? 'Kategori dağılımı' : 'Where it goes'}
        subtitle={
          tr
            ? 'Kalemlerden hesaplanır. Eski panoda bu bir sabitti, o yüzden hiç değişmiyordu.'
            : 'Computed from the lines. The old dashboard had this in a constant, which is why it never changed.'
        }
        whoMayUse={
          tr ? 'Mali kayıtları görebilen herkes.' : 'Anybody who can see the financial records.'
        }
        canUse
      >
        <QueryStatus queries={[spend]} />
        {(spend.data ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr ? 'Gösterilecek kategori yok.' : 'No categories to show.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {(spend.data ?? []).map((category) => {
              const pct = share(category.spentKes, totals.budget);
              return (
                <li key={category.budgetCategoryId}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800">
                      {tr ? (category.nameTr ?? category.nameEn) : category.nameEn}
                    </span>
                    <span className="font-mono text-slate-600">
                      {fmt(category.spentKes, 'KES')}
                      {pct != null && <span className="ml-1.5 text-slate-500">{pct}%</span>}
                    </span>
                  </div>
                  {pct != null && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
};
