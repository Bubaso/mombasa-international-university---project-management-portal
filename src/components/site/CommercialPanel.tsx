/**
 * Bills of quantities and interim valuations (M7-07, M7-08).
 *
 * These are the commercial papers, and M7-10 draws its line here: the firm on
 * a block reports progress and reads its own work, while what the job was
 * priced at and what is being paid for it are the surveyor's to read. That
 * split is enforced by the policies — a contractor's query returns nothing —
 * so this panel simply renders what came back, which for them is nothing.
 *
 * Two things the old screen did that this does not. Its bill of quantities
 * lived in component state and was gone on reload, which it admitted in an
 * amber box. And it computed line totals in the browser; here the amount is a
 * generated column, so a total cannot disagree with its own parts.
 */
import React, { useState } from 'react';
import { Calculator, Plus, Receipt } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as site from '../../api/siteHooks';
import { EmptyState } from '../EmptyState';
import { QueryStatus } from '../QueryStatus';
import {
  ActionButton,
  Field,
  Pill,
  Section,
  Select,
  TableFrame,
  Td,
  TextInput,
  Th,
  WriteError,
} from '../ui/Controls';
import {
  CURRENCIES,
  boqStateLabel,
  formatDate,
  money,
  valuationStateLabel,
  valuationStateStyle,
} from '../../lib/site';
import type { CurrencyCode } from '../../types';

interface Props {
  blockId: string;
  canPrice: boolean;
  canApprove: boolean;
}

export const CommercialPanel: React.FC<Props> = ({ blockId, canPrice, canApprove }) => (
  <div className="space-y-4">
    <BoqSection blockId={blockId} canPrice={canPrice} />
    <ValuationSection blockId={blockId} canPrice={canPrice} canApprove={canApprove} />
  </div>
);

const BoqSection: React.FC<{ blockId: string; canPrice: boolean }> = ({ blockId, canPrice }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const versions = site.useBoqVersions(blockId);
  const createVersion = site.useCreateBoqVersion();
  const [openId, setOpenId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('KES');

  const rows = versions.data ?? [];

  return (
    <Section
      icon={Calculator}
      title={tr ? 'Metraj ve keşif (BoQ)' : 'Bill of quantities'}
      subtitle={
        tr
          ? 'Sürümlenir; yayımlanan sürüm değişmez, yerine yenisi çıkarılır. Tutarlar veritabanında hesaplanır.'
          : 'Versioned; an issued version does not change, a new one is raised instead. Amounts are computed in the database.'
      }
      whoMayUse={tr ? 'Metraj mühendisi ve direktör.' : 'The quantity surveyor and the director.'}
      canUse={canPrice}
    >
      <QueryStatus queries={[versions]} />

      {canPrice && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label={tr ? 'Para birimi' : 'Currency'} className="w-28">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <ActionButton
            tone="primary"
            onClick={() =>
              createVersion.mutate({ constructionBlockId: blockId, currency, note: null })
            }
            disabled={createVersion.isPending}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Yeni sürüm' : 'New version'}</span>
          </ActionButton>
        </div>
      )}
      <WriteError error={createVersion.error} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title={tr ? 'Metraj yok' : 'No bill of quantities'}
          description={
            tr
              ? 'Bu blok için hazırlanmış bir metraj sürümü yok — ya da mali kayıtları görme yetkiniz yok.'
              : 'No priced version exists for this block — or the commercial papers are not yours to read.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((version) => (
            <li key={version.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setOpenId(openId === version.id ? null : version.id)}
                className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-900">
                    {tr ? `Sürüm ${version.versionNo}` : `Version ${version.versionNo}`}
                  </span>
                  <Pill
                    className={
                      version.state === 'issued'
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                    }
                  >
                    {boqStateLabel(version.state, language)}
                  </Pill>
                  <span className="text-xs text-slate-500">
                    {version.preparedByName ?? '—'} · {formatDate(version.preparedOn, language)}
                  </span>
                </div>
                <span className="font-mono text-sm font-semibold text-slate-900">
                  {money(version.total, version.currency)}
                </span>
              </button>

              {openId === version.id && (
                <BoqItems
                  versionId={version.id}
                  currency={version.currency}
                  editable={canPrice && version.state === 'draft'}
                  canIssue={canPrice && version.state === 'draft'}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

const BoqItems: React.FC<{
  versionId: string;
  currency: CurrencyCode;
  editable: boolean;
  canIssue: boolean;
}> = ({ versionId, currency, editable, canIssue }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const items = site.useBoqItems(versionId);
  const addItem = site.useAddBoqItem();
  const issue = site.useIssueBoqVersion();

  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');

  return (
    <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-3 py-3">
      <QueryStatus queries={[items]} />

      {(items.data ?? []).length === 0 ? (
        <p className="text-xs text-slate-500">
          {tr ? 'Bu sürümde kalem yok.' : 'No lines in this version.'}
        </p>
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>{tr ? 'Kalem' : 'Item'}</Th>
              <Th>{tr ? 'Birim' : 'Unit'}</Th>
              <Th className="text-right">{tr ? 'Miktar' : 'Quantity'}</Th>
              <Th className="text-right">{tr ? 'Birim fiyat' : 'Rate'}</Th>
              <Th className="text-right">{tr ? 'Tutar' : 'Amount'}</Th>
            </tr>
          }
        >
          {(items.data ?? []).map((item) => (
            <tr key={item.id} className="border-t border-slate-100">
              <Td>{item.descriptionEn}</Td>
              <Td>{item.unit}</Td>
              <Td className="text-right font-mono">{item.quantity}</Td>
              <Td className="text-right font-mono">{money(item.unitRate, currency)}</Td>
              {/* Generated by the database from the two columns to its left. */}
              <Td className="text-right font-mono font-semibold">{money(item.amount, currency)}</Td>
            </tr>
          ))}
        </TableFrame>
      )}

      {editable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addItem.mutate(
              {
                boqVersionId: versionId,
                itemCode: null,
                descriptionEn: description,
                unit,
                quantity: Number(quantity),
                unitRate: Number(rate),
              },
              {
                onSuccess: () => {
                  setDescription('');
                  setQuantity('');
                  setRate('');
                },
              },
            );
          }}
          className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
        >
          <div className="flex flex-wrap gap-2">
            <Field label={tr ? 'Tanım' : 'Description'} className="min-w-[160px] flex-1">
              <TextInput
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label={tr ? 'Birim' : 'Unit'} className="w-24">
              <TextInput required value={unit} onChange={(e) => setUnit(e.target.value)} />
            </Field>
            <Field label={tr ? 'Miktar' : 'Quantity'} className="w-28">
              <TextInput
                type="number"
                step="0.001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field label={tr ? 'Birim fiyat' : 'Rate'} className="w-32">
              <TextInput
                type="number"
                step="0.01"
                required
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton type="submit" tone="primary" disabled={addItem.isPending}>
              {tr ? 'Kalem ekle' : 'Add line'}
            </ActionButton>
            {canIssue && (
              <ActionButton
                type="button"
                onClick={() => issue.mutate(versionId)}
                disabled={issue.isPending}
                title={
                  tr
                    ? 'Yayımlandıktan sonra kalemler değişmez.'
                    : 'Lines cannot change once issued.'
                }
              >
                {tr ? 'Yayımla' : 'Issue'}
              </ActionButton>
            )}
          </div>
          <WriteError error={addItem.error} />
          <WriteError error={issue.error} />
        </form>
      )}
    </div>
  );
};

const ValuationSection: React.FC<{
  blockId: string;
  canPrice: boolean;
  canApprove: boolean;
}> = ({ blockId, canPrice, canApprove }) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';
  const valuations = site.useValuations(blockId);
  const contractors = site.useContractors();
  const create = site.useCreateValuation();
  const certify = site.useCertifyValuation();
  const approve = site.useApproveValuation();
  const [adding, setAdding] = useState(false);

  const [contractorId, setContractorId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('KES');

  const rows = valuations.data ?? [];

  return (
    <Section
      icon={Receipt}
      title={tr ? 'Hakedişler' : 'Interim valuations'}
      subtitle={
        tr
          ? 'İki imza, sırayla ve iki ayrı kişiden: önce metraj mühendisi onaylar, sonra direktör.'
          : 'Two signatures, in order, from two people: the surveyor certifies, then the director approves.'
      }
      whoMayUse={
        tr
          ? 'QS onaylar, direktör karara bağlar.'
          : 'The surveyor certifies, the director approves.'
      }
      canUse={canPrice || canApprove}
    >
      <QueryStatus queries={[valuations]} />

      {canPrice && (
        <div className="mb-3">
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(
                  {
                    constructionBlockId: blockId,
                    contractorId: contractorId || null,
                    periodStart,
                    periodEnd,
                    amount: Number(amount),
                    currency,
                    summary: null,
                  },
                  { onSuccess: () => setAdding(false) },
                );
              }}
              className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <div className="flex flex-wrap gap-2">
                <Field label={tr ? 'Müteahhit' : 'Contractor'} className="min-w-[150px]">
                  <Select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
                    <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
                    {(contractors.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={tr ? 'Dönem başı' : 'Period from'} className="w-40">
                  <TextInput
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </Field>
                <Field label={tr ? 'Dönem sonu' : 'Period to'} className="w-40">
                  <TextInput
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
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
              </div>
              <div className="flex gap-2">
                <ActionButton type="submit" tone="primary" disabled={create.isPending}>
                  {tr ? 'Hakediş aç' : 'Raise valuation'}
                </ActionButton>
                <ActionButton type="button" onClick={() => setAdding(false)}>
                  {tr ? 'Vazgeç' : 'Cancel'}
                </ActionButton>
              </div>
              <WriteError error={create.error} />
            </form>
          ) : (
            <ActionButton tone="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Hakediş aç' : 'Raise a valuation'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={tr ? 'Hakediş yok' : 'No valuations'}
          description={
            tr
              ? 'Bu blok için hakediş düzenlenmemiş — ya da mali kayıtları görme yetkiniz yok.'
              : 'None raised for this block — or the commercial papers are not yours to read.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((valuation) => (
            <li
              key={valuation.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-900">
                      {formatDate(valuation.periodStart, language)} –{' '}
                      {formatDate(valuation.periodEnd, language)}
                    </span>
                    <Pill className={valuationStateStyle(valuation.state)}>
                      {valuationStateLabel(valuation.state, language)}
                    </Pill>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {valuation.contractorName ?? '—'}
                  </div>
                  {/* Both signatures, named. An approval chain is only worth
                      something if you can see whose it is. */}
                  <div className="mt-0.5 space-y-0.5 text-xs text-slate-500">
                    <div>
                      {tr ? 'QS: ' : 'Certified: '}
                      {valuation.qsCertifiedByName
                        ? `${valuation.qsCertifiedByName} · ${formatDate(valuation.qsCertifiedAt, language)}`
                        : tr
                          ? 'bekliyor'
                          : 'pending'}
                    </div>
                    <div>
                      {tr ? 'Direktör: ' : 'Approved: '}
                      {valuation.directorApprovedByName
                        ? `${valuation.directorApprovedByName} · ${formatDate(valuation.directorApprovedAt, language)}`
                        : tr
                          ? 'bekliyor'
                          : 'pending'}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold text-slate-900">
                  {money(valuation.amount, valuation.currency)}
                </span>
              </div>

              {user && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {canPrice && valuation.qsCertifiedAt == null && (
                    <ActionButton
                      onClick={() => certify.mutate({ id: valuation.id, profileId: user.id })}
                      disabled={certify.isPending}
                    >
                      {tr ? 'Ölçtüm, onaylıyorum' : 'Certify as measured'}
                    </ActionButton>
                  )}
                  {canApprove && valuation.directorApprovedAt == null && (
                    <ActionButton
                      tone="primary"
                      onClick={() => approve.mutate({ id: valuation.id, profileId: user.id })}
                      disabled={approve.isPending}
                      title={
                        valuation.qsCertifiedAt == null
                          ? tr
                            ? 'Veritabanı QS onayı olmadan kabul etmez.'
                            : 'The database will refuse this without the surveyor first.'
                          : undefined
                      }
                    >
                      {tr ? 'Onayla' : 'Approve'}
                    </ActionButton>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <WriteError error={certify.error} />
      <WriteError error={approve.error} />
    </Section>
  );
};
