/**
 * Site inspection reports (M7-04).
 *
 * A report is open until it is signed, and fixed afterwards. The one thing
 * that still moves on a signed report is what was done about a finding,
 * because closing a finding out is not editing the report — the finding
 * stands, and what is added is the answer to it.
 *
 * The signature button is one-way and says so. There is no unsign; the
 * database refuses it, and offering a control that would be refused is the
 * habit this project is trying to break.
 */
import React, { useState } from 'react';
import { ClipboardCheck, Plus, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as site from '../../api/siteHooks';
import { EmptyState } from '../EmptyState';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Section, Select, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import type { SiteInspection } from '../../types';

export const InspectionList: React.FC<{ blockId: string; canInspect: boolean }> = ({
  blockId,
  canInspect,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const inspections = site.useInspections(blockId);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = inspections.data ?? [];

  return (
    <Section
      icon={ClipboardCheck}
      title={tr ? 'Saha denetim raporları' : 'Site inspection reports'}
      subtitle={
        tr
          ? 'İmzalandığı anda sabitlenir. Sonradan yalnızca bulgunun ne yapıldığı eklenebilir.'
          : 'Fixed the moment it is signed. Only what was done about a finding can be added after.'
      }
      whoMayUse={
        tr
          ? 'Saha ekibi, QS ve dış denetçi.'
          : 'The site team, the surveyor and an external auditor.'
      }
      canUse={canInspect}
    >
      <QueryStatus queries={[inspections]} />

      {canInspect && (
        <div className="mb-3">
          {adding ? (
            <NewInspectionForm blockId={blockId} onDone={() => setAdding(false)} />
          ) : (
            <ActionButton tone="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Denetim aç' : 'Open an inspection'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={tr ? 'Denetim kaydı yok' : 'No inspections'}
          description={
            tr
              ? 'Bu blok hiç denetlenmemiş. Denetim raporu hem saha hem hukukî delil değeri taşır.'
              : 'This block has never been inspected. An inspection report carries both site and evidential value.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((inspection) => (
            <InspectionRow
              key={inspection.id}
              inspection={inspection}
              open={openId === inspection.id}
              onToggle={() => setOpenId(openId === inspection.id ? null : inspection.id)}
              canInspect={canInspect}
            />
          ))}
        </ul>
      )}
    </Section>
  );
};

const InspectionRow: React.FC<{
  inspection: SiteInspection;
  open: boolean;
  onToggle: () => void;
  canInspect: boolean;
}> = ({ inspection, open, onToggle, canInspect }) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';
  const findings = site.useFindings(open ? inspection.id : null);
  const addFinding = site.useAddFinding();
  const resolveFinding = site.useResolveFinding();
  const sign = site.useSignInspection();

  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('3');
  const [isNonconformity, setIsNonconformity] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');

  const signed = inspection.signedOffAt != null;

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-slate-900">
              {formatDate(inspection.inspectedOn, language)}
            </span>
            {signed ? (
              <Pill className="border-emerald-200 bg-emerald-100 text-emerald-800">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  {tr ? 'imzalı' : 'signed'}
                </span>
              </Pill>
            ) : (
              <Pill className="border-amber-300 bg-amber-100 text-amber-900">
                {tr ? 'açık' : 'open'}
              </Pill>
            )}
            {inspection.nonconformityCount > 0 && (
              <Pill className="border-rose-200 bg-rose-100 text-rose-800">
                <span className="flex items-center gap-1">
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  {tr
                    ? `${inspection.nonconformityCount} açık uygunsuzluk`
                    : `${inspection.nonconformityCount} open non-conformity`}
                </span>
              </Pill>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {inspection.inspectorName ?? '—'}
            {inspection.summaryEn && ` · ${inspection.summaryEn}`}
          </div>
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          {tr ? `${inspection.findingCount} bulgu` : `${inspection.findingCount} findings`}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-3 py-3">
          <QueryStatus queries={[findings]} />

          {(findings.data ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">
              {tr ? 'Bulgu kaydedilmemiş.' : 'No findings recorded.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {(findings.data ?? []).map((finding) => (
                <li
                  key={finding.id}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {finding.isNonconformity && (
                      <Pill className="border-rose-200 bg-rose-100 text-rose-800">
                        {tr ? 'uygunsuzluk' : 'non-conformity'}
                      </Pill>
                    )}
                    {finding.severity != null && (
                      <Pill>
                        {tr ? `şiddet ${finding.severity}` : `severity ${finding.severity}`}
                      </Pill>
                    )}
                    {finding.resolvedAt && (
                      <Pill className="border-emerald-200 bg-emerald-100 text-emerald-800">
                        {tr ? 'kapatıldı' : 'closed out'}
                      </Pill>
                    )}
                  </div>
                  <p className="mt-0.5 text-slate-800">{finding.descriptionEn}</p>
                  {finding.resolutionNote && (
                    <p className="mt-0.5 text-slate-600">
                      {tr ? 'Yapılan: ' : 'Done: '}
                      {finding.resolutionNote}
                    </p>
                  )}

                  {canInspect && !finding.resolvedAt && (
                    <div className="mt-1">
                      {resolving === finding.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            resolveFinding.mutate(
                              { id: finding.id, note: resolution },
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
                              {tr ? 'Kapat' : 'Close out'}
                            </ActionButton>
                            <ActionButton type="button" onClick={() => setResolving(null)}>
                              {tr ? 'Vazgeç' : 'Cancel'}
                            </ActionButton>
                          </div>
                        </form>
                      ) : (
                        <ActionButton onClick={() => setResolving(finding.id)}>
                          {tr ? 'Kapat' : 'Close out'}
                        </ActionButton>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <WriteError error={resolveFinding.error} />

          {canInspect && !signed && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addFinding.mutate(
                  {
                    siteInspectionId: inspection.id,
                    descriptionEn: description,
                    isNonconformity,
                    severity: Number(severity),
                  },
                  { onSuccess: () => setDescription('') },
                );
              }}
              className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
            >
              <div className="flex flex-wrap gap-2">
                <Field label={tr ? 'Bulgu' : 'Finding'} className="min-w-[180px] flex-1">
                  <TextInput
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
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
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={isNonconformity}
                  onChange={(e) => setIsNonconformity(e.target.checked)}
                  className="cursor-pointer"
                />
                {tr ? 'Uygunsuzluk' : 'This is a non-conformity'}
              </label>
              <div className="flex flex-wrap gap-2">
                <ActionButton type="submit" tone="primary" disabled={addFinding.isPending}>
                  {tr ? 'Bulgu ekle' : 'Add finding'}
                </ActionButton>
                {user && (
                  <ActionButton
                    type="button"
                    tone="danger"
                    onClick={() => sign.mutate({ id: inspection.id, profileId: user.id })}
                    disabled={sign.isPending}
                    title={
                      tr ? 'İmzalandıktan sonra geri alınamaz.' : 'Cannot be undone once signed.'
                    }
                  >
                    {tr ? 'İmzala (geri alınamaz)' : 'Sign (cannot be undone)'}
                  </ActionButton>
                )}
              </div>
              <WriteError error={addFinding.error} />
              <WriteError error={sign.error} />
            </form>
          )}

          {signed && (
            <p className="text-xs text-slate-500">
              {tr ? 'İmzalayan: ' : 'Signed by '}
              {inspection.signedOffByName ?? '—'} · {formatDate(inspection.signedOffAt, language)}
            </p>
          )}
        </div>
      )}
    </li>
  );
};

const NewInspectionForm: React.FC<{ blockId: string; onDone: () => void }> = ({
  blockId,
  onDone,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = site.useCreateInspection();
  const [inspectedOn, setInspectedOn] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            constructionBlockId: blockId,
            inspectedOn,
            summaryEn: summary.trim() || null,
          },
          { onSuccess: onDone },
        );
      }}
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5"
    >
      <div className="flex flex-wrap gap-2">
        <Field label={tr ? 'Denetim tarihi' : 'Inspected on'} className="w-44">
          <TextInput
            type="date"
            required
            value={inspectedOn}
            onChange={(e) => setInspectedOn(e.target.value)}
          />
        </Field>
        <Field label={tr ? 'Özet' : 'Summary'} className="min-w-[180px] flex-1">
          <TextInput value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <ActionButton type="submit" tone="primary" disabled={create.isPending}>
          {tr ? 'Aç' : 'Open'}
        </ActionButton>
        <ActionButton type="button" onClick={onDone}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
      </div>
      <WriteError error={create.error} />
    </form>
  );
};
