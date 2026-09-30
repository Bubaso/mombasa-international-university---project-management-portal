/**
 * Issues: things that have already happened (M6-04).
 *
 * The column that matters is the one showing which of these were on the risk
 * register first. A project that can point at the risk it recorded before the
 * thing happened is managing risk; one where every issue arrives unheralded
 * is discovering it.
 */
import React, { useState } from 'react';
import { AlertTriangle, Link2, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as raid from '../../api/raidHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { ActionButton, Field, Pill, Section, Select, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import { RISK_CATEGORIES, issueStateLabel, riskCategoryLabel } from '../../lib/raid';
import type { RiskCategory } from '../../types';

export const IssueList: React.FC<{ canKeep: boolean }> = ({ canKeep }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const issues = raid.useIssues();
  const create = raid.useCreateIssue();
  const resolve = raid.useResolveIssue();

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RiskCategory>('legal');
  const [severity, setSeverity] = useState('3');
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');

  const rows = issues.data ?? [];
  const foreseen = rows.filter((i) => i.materialisedFromRiskId != null).length;

  return (
    <Section
      icon={AlertTriangle}
      title={tr ? 'Sorunlar' : 'Issues'}
      subtitle={
        tr
          ? 'Gerçekleşmiş şeyler. Hangilerinin önceden risk kütüğünde olduğu görünür — asıl mesele bu.'
          : 'Things that have happened. Which of them were on the risk register first is the part worth looking at.'
      }
      whoMayUse={tr ? 'Kurum içi.' : 'Inside the organisation.'}
      canUse={canKeep}
    >
      <QueryStatus queries={[issues]} />

      {rows.length > 0 && (
        <p className="mb-3 text-[11px] text-slate-600">
          {tr
            ? `${rows.length} sorunun ${foreseen} tanesi önceden risk olarak kayıtlıydı.`
            : `${foreseen} of ${rows.length} were on the risk register before they happened.`}
        </p>
      )}

      {canKeep && (
        <div className="mb-3">
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(
                  { titleEn: title, category, severity: Number(severity) },
                  { onSuccess: () => setAdding(false) },
                );
              }}
              className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <div className="flex flex-wrap gap-2">
                <Field label={tr ? 'Sorun' : 'Issue'} className="min-w-[180px] flex-1">
                  <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label={tr ? 'Kategori' : 'Category'} className="min-w-[140px]">
                  <Select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as RiskCategory)}
                  >
                    {RISK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {riskCategoryLabel(c, language)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={tr ? 'Şiddet' : 'Severity'} className="w-24">
                  <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex gap-2">
                <ActionButton type="submit" tone="primary" disabled={create.isPending}>
                  {tr ? 'Ekle' : 'Add'}
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
              <span>{tr ? 'Sorun ekle' : 'Add an issue'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={tr ? 'Kayıtlı sorun yok' : 'No issues recorded'}
          description={
            tr
              ? 'Gerçekleşmiş bir şey kaydedilmemiş — ya da bu kayıtlar sizin görebileceğiniz şeyler değil.'
              : 'Nothing recorded as having happened — or these are not yours to see.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((issue) => (
            <li
              key={issue.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-900">
                      {tr ? (issue.titleTr ?? issue.titleEn) : issue.titleEn}
                    </span>
                    <Pill>{riskCategoryLabel(issue.category, language)}</Pill>
                    <Pill>{issueStateLabel(issue.state, language)}</Pill>
                    {/* The trace back. Kept by the database, not by anybody
                        remembering to mention it. */}
                    {issue.materialisedFromRiskId && (
                      <Pill className="border-sky-200 bg-sky-100 text-sky-800">
                        <span className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" aria-hidden="true" />
                          {tr ? 'risk kütüğündeydi' : 'was on the register'}
                        </span>
                      </Pill>
                    )}
                  </div>
                  <div className="mt-0.5 text-slate-500">
                    {issue.ownerName ?? (tr ? 'sahipsiz' : 'unowned')} ·{' '}
                    {formatDate(issue.openedOn, language)}
                    {issue.detailEn && (
                      <span className="block text-slate-600">{issue.detailEn}</span>
                    )}
                    {issue.resolutionEn && (
                      <span className="block text-emerald-700">
                        {tr ? 'Çözüm: ' : 'Resolved: '}
                        {issue.resolutionEn}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-xs font-semibold text-slate-700">
                  {tr ? `şiddet ${issue.severity}` : `severity ${issue.severity}`}
                </span>
              </div>

              {canKeep && issue.resolvedAt == null && (
                <div className="mt-1.5">
                  {resolving === issue.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        resolve.mutate(
                          { id: issue.id, resolutionEn: resolution },
                          { onSuccess: () => setResolving(null) },
                        );
                      }}
                      className="space-y-1.5"
                    >
                      <TextInput
                        required
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        placeholder={tr ? 'Ne yapıldı?' : 'What was done?'}
                      />
                      <div className="flex gap-2">
                        <ActionButton type="submit" tone="primary">
                          {tr ? 'Çözüldü' : 'Resolve'}
                        </ActionButton>
                        <ActionButton type="button" onClick={() => setResolving(null)}>
                          {tr ? 'Vazgeç' : 'Cancel'}
                        </ActionButton>
                      </div>
                    </form>
                  ) : (
                    <ActionButton onClick={() => setResolving(issue.id)}>
                      {tr ? 'Çözüldü olarak işaretle' : 'Mark resolved'}
                    </ActionButton>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <WriteError error={resolve.error} />
    </Section>
  );
};
