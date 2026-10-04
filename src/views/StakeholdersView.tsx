import React, { useMemo, useState } from 'react';
import { Users2, Search, LayoutGrid, List, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as register from '../api/stakeholderHooks';
import { useAuthority, useProfiles } from '../api/adminHooks';
import { QueryStatus } from '../components/QueryStatus';
import { EmptyState } from '../components/EmptyState';
import { AttentionStrip } from '../components/stakeholders/AttentionStrip';
import { ContactsExchange } from '../components/stakeholders/ContactsExchange';
import { PowerInterestGrid } from '../components/stakeholders/PowerInterestGrid';
import { StakeholderDetail } from '../components/stakeholders/StakeholderDetail';
import { ASSESSORS, MINUTE_KEEPERS, actsAs } from '../lib/authority';
import {
  STAKEHOLDER_CATEGORIES,
  STANCES,
  categoryLabel,
  quadrantLabel,
  quadrantOf,
  stanceLabel,
  stanceStyle,
} from '../lib/stakeholders';
import {
  ActionButton,
  Field,
  Pill,
  Select,
  TableFrame,
  Td,
  TextInput,
  Th,
  WriteError,
} from '../components/ui/Controls';
import type { Confidentiality, StakeholderCategory, Stance } from '../types';
import { useRecordOrigins } from '../api/proposalHooks';
import { RecordOrigin } from '../components/ui/RecordOrigin';

/**
 * The stakeholder register (M4).
 *
 * The point of this screen is not that the project can look up a phone
 * number. It is that the project can answer four questions it currently
 * cannot: is this person with us, who do they reach, when did we last speak,
 * and whose job is it to keep them.
 */
export const StakeholdersView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const stakeholders = register.useStakeholders();
  const organizations = register.useOrganizations();
  const authority = useAuthority();

  const canEdit = actsAs(authority.data, ...MINUTE_KEEPERS);
  const canAssess = actsAs(authority.data, ...ASSESSORS);

  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<StakeholderCategory | ''>('');
  const [stance, setStance] = useState<Stance | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = stakeholders.data ?? [];
  // Bu ekranın bütün satırlarının kökeni, tek okumada (M13-21).
  const origins = useRecordOrigins(rows.map((s) => s.id));

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((s) => {
      if (category && s.category !== category) return false;
      if (stance && s.stance !== stance) return false;
      if (!needle) return true;
      return [s.fullName, s.title, s.organizationName, s.location, s.interestTopic]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(needle));
    });
  }, [rows, query, category, stance]);

  const selected = rows.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Users2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Paydaşlar ve İlişkiler' : 'Stakeholders & Relationships'}
            </h1>
            <p className="text-sm text-slate-500">
              {tr
                ? 'Kim bizden yana, kimi etkiliyor, en son ne zaman konuştuk, sorumlusu kim.'
                : 'Who is with us, who they reach, when we last spoke, and whose job they are.'}
            </p>
          </div>
        </div>
        {canEdit && !adding && (
          <ActionButton tone="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Paydaş ekle' : 'Add a stakeholder'}</span>
          </ActionButton>
        )}
      </header>

      <QueryStatus queries={[stakeholders]} />

      <AttentionStrip onOpen={setSelectedId} />

      {adding && (
        <AddStakeholderForm
          organizations={(organizations.data ?? []).map((o) => ({ id: o.id, name: o.name }))}
          onDone={(id) => {
            setAdding(false);
            if (id) setSelectedId(id);
          }}
        />
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field label={tr ? 'Ara' : 'Search'} className="min-w-[180px] flex-1">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr ? 'İsim, kurum, konu…' : 'Name, organization, topic…'}
              className="pl-8"
            />
          </div>
        </Field>
        <Field label={tr ? 'Kategori' : 'Category'}>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as StakeholderCategory | '')}
          >
            <option value="">{tr ? 'Hepsi' : 'All'}</option>
            {STAKEHOLDER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Tutum' : 'Stance'}>
          <Select value={stance} onChange={(e) => setStance(e.target.value as Stance | '')}>
            <option value="">{tr ? 'Hepsi' : 'All'}</option>
            {STANCES.map((s) => (
              <option key={s} value={s}>
                {stanceLabel(s, language)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-1">
          <ActionButton
            onClick={() => setLayout('list')}
            className={layout === 'list' ? 'border-amber-400 bg-amber-50 text-amber-900' : ''}
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{tr ? 'Liste' : 'List'}</span>
          </ActionButton>
          <ActionButton
            onClick={() => setLayout('grid')}
            className={layout === 'grid' ? 'border-amber-400 bg-amber-50 text-amber-900' : ''}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{tr ? 'Matris' : 'Grid'}</span>
          </ActionButton>
        </div>
      </div>

      <div className={selected ? 'grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]' : ''}>
        <div className="min-w-0">
          {shown.length === 0 ? (
            <EmptyState
              icon={Users2}
              title={tr ? 'Kayıt yok' : 'Nobody here'}
              description={
                rows.length === 0
                  ? tr
                    ? 'Paydaş kütüğü henüz boş. İlk kaydı ekleyerek başlayın — ya da Notion göçünü bekleyin.'
                    : 'The register is empty. Add the first record, or wait for the Notion migration.'
                  : tr
                    ? 'Bu filtrelerle eşleşen paydaş yok.'
                    : 'No stakeholder matches those filters.'
              }
            />
          ) : layout === 'grid' ? (
            <PowerInterestGrid stakeholders={shown} onOpen={setSelectedId} />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <TableFrame
                head={
                  <tr>
                    <Th>{tr ? 'Kişi' : 'Person'}</Th>
                    <Th>{tr ? 'Tutum' : 'Stance'}</Th>
                    <Th>{tr ? 'Nüfuz · İlgi' : 'Influence · Interest'}</Th>
                    <Th>{tr ? 'Sorumlu' : 'Owner'}</Th>
                  </tr>
                }
              >
                {shown.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`cursor-pointer hover:bg-slate-50 ${
                      s.id === selectedId ? 'bg-amber-50' : ''
                    }`}
                  >
                    <Td>
                      <div className="font-medium text-slate-900">{s.fullName}</div>
                      <div className="text-xs text-slate-500">
                        {[s.title, s.organizationName].filter(Boolean).join(' · ') ||
                          categoryLabel(s.category, language)}
                      </div>
                      <RecordOrigin origin={origins.of(s.id)} />
                    </Td>
                    <Td>
                      <Pill className={stanceStyle(s.stance)}>
                        {stanceLabel(s.stance, language)}
                      </Pill>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs">
                        {s.influence} · {s.interest}
                      </span>
                      <div className="text-xs text-slate-500">
                        {quadrantLabel(quadrantOf(s), language)}
                      </div>
                    </Td>
                    <Td>
                      {s.relationshipOwnerName ?? (
                        <span className="text-amber-700">{tr ? 'atanmamış' : 'nobody'}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </TableFrame>
            </div>
          )}
        </div>

        {selected && (
          <StakeholderDetail
            stakeholder={selected}
            canEdit={canEdit}
            canAssess={canAssess}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {/* Taking contacts out, below the register rather than above it.
          It used to sit between the attention strip and the register, and on
          a phone that put the first stakeholder at 1038px: three screenfuls
          of export guidance before a single name. Somebody comes to this
          screen to read the register; exporting it is something they do after
          finding what they were looking for. */}
      <ContactsExchange people={rows} />
    </div>
  );
};

// ---------------------------------------------------------------------------

const AddStakeholderForm: React.FC<{
  organizations: { id: string; name: string }[];
  onDone: (id: string | null) => void;
}> = ({ organizations, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = register.useCreateStakeholder();
  const profiles = useProfiles();

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [category, setCategory] = useState<StakeholderCategory>('other');
  const [stance, setStance] = useState<Stance>('unknown');
  const [influence, setInfluence] = useState(3);
  const [interest, setInterest] = useState(3);
  const [owner, setOwner] = useState('');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('internal');

  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            fullName: fullName.trim(),
            title: title.trim() || null,
            organizationId: organizationId || null,
            category,
            email: null,
            phone: null,
            location: null,
            interestTopic: null,
            stance,
            influence,
            interest,
            relationshipOwner: owner || null,
            confidentiality,
          },
          { onSuccess: (created) => onDone(created.id) },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Ad soyad' : 'Full name'}>
          <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label={tr ? 'Unvan' : 'Title'}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={tr ? 'Kurum' : 'Organization'}>
          <Select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            <option value="">{tr ? 'Yok' : 'None'}</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Kategori' : 'Category'}>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as StakeholderCategory)}
          >
            {STAKEHOLDER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Tutum' : 'Stance'}>
          <Select value={stance} onChange={(e) => setStance(e.target.value as Stance)}>
            {STANCES.map((s) => (
              <option key={s} value={s}>
                {stanceLabel(s, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'İlişki sorumlusu' : 'Relationship owner'}>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{tr ? 'Atanmamış' : 'Nobody'}</option>
            {(profiles.data ?? [])
              .filter((p) => p.isActive)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={tr ? 'Nüfuz (1-5)' : 'Influence (1-5)'}>
          <Select value={influence} onChange={(e) => setInfluence(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'İlgi (1-5)' : 'Interest (1-5)'}>
          <Select value={interest} onChange={(e) => setInterest(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Gizlilik' : 'Tier'}>
          <Select
            value={confidentiality}
            onChange={(e) => setConfidentiality(e.target.value as Confidentiality)}
          >
            <option value="public">{tr ? 'Açık' : 'Public'}</option>
            <option value="internal">{tr ? 'Kuruma özel' : 'Internal'}</option>
            <option value="confidential">{tr ? 'Gizli' : 'Confidential'}</option>
          </Select>
        </Field>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {tr
          ? 'Sorumlusu olmayan paydaş, dikkat listesinde uyarı olarak görünür. Nüfuz puanı aynı zamanda ne kadar sessizlikten sonra hatırlatma çıkacağını belirler.'
          : 'A stakeholder with nobody keeping them shows up on the attention list. The influence score also sets how long a silence has to run before the portal says something.'}
      </p>

      <WriteError error={create.error} />

      <div className="mt-2.5 flex justify-end gap-2">
        <ActionButton type="button" onClick={() => onDone(null)} disabled={create.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending}>
          {tr ? 'Ekle' : 'Add'}
        </ActionButton>
      </div>
    </form>
  );
};
