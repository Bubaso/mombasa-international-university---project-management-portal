import React, { useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as domain from '../../api/hooks';
import * as access from '../../api/adminHooks';
import * as vault from '../../api/documentHooks';
import * as ledger from '../../api/moneyHooks';
import { roleLabel } from '../../lib/roles';
import { isExpired } from '../../lib/authority';
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
import type { GrantPermission } from '../../types';
import { wordFor } from '../../lib/labels';

/**
 * The record types a grant can name here.
 *
 * The column is free text in the database, so this list is a choice, not a
 * limit: these are the tables whose records the console can enumerate, which
 * is what keeps the picker honest. A grant pointing at something nobody can
 * name would be a grant nobody could audit.
 */
const ENTITY_TYPES = [
  'legal_cases',
  'construction_blocks',
  'document_vault',
  'financial_transactions',
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

const ENTITY_LABELS: Record<EntityType, { tr: string; en: string }> = {
  legal_cases: { tr: 'Dava', en: 'Legal case' },
  construction_blocks: { tr: 'İnşaat bloğu', en: 'Construction block' },
  document_vault: { tr: 'Belge', en: 'Document' },
  financial_transactions: { tr: 'Mali kayıt', en: 'Financial record' },
};

/**
 * Handing one record to one person.
 *
 * A grant lifts its holder above their clearance for that record alone, and
 * clears scope with it — sharing a file with an outside adviser is routine and
 * should not require making them internal. What it can never do is reach a
 * restricted record for an external role: app.can_read refuses that outright,
 * so raising one here would be a grant that quietly does nothing.
 */
export const SharingSection: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';

  const grants = access.useGrants();
  const profiles = access.useProfiles();
  const createGrant = access.useCreateGrant();
  const revokeGrant = access.useRevokeGrant();

  const cases = domain.useLegalCases();
  const blocks = domain.useConstructionBlocks();
  // Seçici okumaları: bu ekran kayıt başına yetki veriyor, yani listelenen her
  // kaydın seçilebilir olması gerekiyor. Kasa ve defter listesinin kendi
  // ekranları dilimli; buradaki seçici kesilemez, çünkü kesilen kayıt var
  // olduğu hâlde paylaşılamaz hâle gelir ve ekran sebebini söylemez.
  const documents = vault.useDocumentOptions();
  const transactions = ledger.useTransactionOptions();

  const [entityType, setEntityType] = useState<EntityType>('legal_cases');
  const [entityId, setEntityId] = useState('');
  const [userId, setUserId] = useState('');
  const [permission, setPermission] = useState<GrantPermission>('read');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');

  const optionsFor = (type: EntityType): { id: string; label: string }[] => {
    switch (type) {
      case 'legal_cases':
        return (cases.data ?? []).map((c) => ({ id: c.id, label: `${c.caseNumber} · ${c.title}` }));
      case 'construction_blocks':
        return (blocks.data ?? []).map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }));
      case 'document_vault':
        return (documents.data ?? []).map((d) => ({ id: d.id, label: d.title }));
      case 'financial_transactions':
        return (transactions.data ?? []).map((t) => ({
          id: t.id,
          label: `${t.referenceNo} · ${t.description}`,
        }));
    }
  };

  const describe = (type: string, id: string) => {
    const known = ENTITY_TYPES.includes(type as EntityType)
      ? optionsFor(type as EntityType).find((o) => o.id === id)
      : undefined;
    return known?.label ?? `${id.slice(0, 8)}…`;
  };

  const rows = grants.data ?? [];

  return (
    <Section
      icon={KeyRound}
      title={tr ? 'Kayda özel paylaşım' : 'Sharing'}
      subtitle={
        tr
          ? 'Tek bir kaydı tek bir kişiye açar. Gizlilik seviyesini o kayıt için aşar, kapsamı da geçer.'
          : 'One record handed to one person. It lifts them above their clearance for that record, and clears scope with it.'
      }
      whoMayUse={
        canManage
          ? tr
            ? 'Paylaşım açabilirsiniz'
            : 'You may share records'
          : tr
            ? 'Yalnızca yönetici ve proje direktörü paylaşır'
            : 'Only an administrator or the project director shares'
      }
      canUse={canManage}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tr ? 'Kayda özel açılmış erişim yok.' : 'Nothing has been shared record by record.'}
        </p>
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>{tr ? 'Kişi' : 'Person'}</Th>
              <Th>{tr ? 'Kayıt' : 'Record'}</Th>
              <Th>{tr ? 'İzin' : 'Permission'}</Th>
              <Th>{tr ? 'Süre' : 'Lapses'}</Th>
              <Th>{tr ? 'Gerekçe' : 'Reason'}</Th>
              <Th className="text-right">{canManage ? (tr ? 'İşlem' : 'Action') : ''}</Th>
            </tr>
          }
        >
          {rows.map((grant) => {
            const lapsed = isExpired(grant.expiresAt);
            return (
              <tr key={grant.id} className={lapsed ? 'text-slate-500' : undefined}>
                <Td className="font-medium text-slate-900">{grant.userName ?? grant.userId}</Td>
                <Td>
                  <div>{describe(grant.entityType, grant.entityId)}</div>
                  <div className="text-xs text-slate-500">
                    {ENTITY_TYPES.includes(grant.entityType as EntityType)
                      ? ENTITY_LABELS[grant.entityType as EntityType][language]
                      : grant.entityType}
                  </div>
                </Td>
                <Td>
                  <Pill
                    className={
                      grant.permission === 'write'
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                    }
                  >
                    {grant.permission === 'write'
                      ? tr
                        ? 'Yazma'
                        : 'Write'
                      : tr
                        ? 'Okuma'
                        : 'Read'}
                  </Pill>
                </Td>
                <Td>
                  {grant.expiresAt ? (
                    lapsed ? (
                      <Pill className="border-slate-300 bg-slate-100 text-slate-500">
                        {tr ? 'Doldu' : 'Lapsed'}
                      </Pill>
                    ) : (
                      grant.expiresAt.slice(0, 10)
                    )
                  ) : (
                    <span className="text-slate-500">{tr ? 'Süresiz' : 'Open-ended'}</span>
                  )}
                </Td>
                <Td className="max-w-[220px] truncate text-slate-500">{grant.reason ?? '—'}</Td>
                <Td className="text-right">
                  {canManage && (
                    <ActionButton
                      tone="danger"
                      disabled={revokeGrant.isPending}
                      onClick={() => revokeGrant.mutate(grant.id)}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      <span>{tr ? 'Geri al' : 'Revoke'}</span>
                    </ActionButton>
                  )}
                </Td>
              </tr>
            );
          })}
        </TableFrame>
      )}

      {canManage && (
        <form
          className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!user || !userId || !entityId) return;
            createGrant.mutate(
              {
                userId,
                entityType,
                entityId,
                permission,
                grantedBy: user.id,
                expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
                reason: reason.trim() || null,
              },
              {
                onSuccess: () => {
                  setEntityId('');
                  setUserId('');
                  setReason('');
                  setExpiresAt('');
                },
              },
            );
          }}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Field label={tr ? 'Kişi' : 'Person'}>
              <Select value={userId} onChange={(e) => setUserId(e.target.value)} required>
                <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
                {(profiles.data ?? [])
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} — {roleLabel(p.role, language)}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={tr ? 'Kayıt türü' : 'Record type'}>
              <Select
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value as EntityType);
                  setEntityId('');
                }}
              >
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {wordFor(ENTITY_LABELS, type, language)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Kayıt' : 'Record'}>
              <Select value={entityId} onChange={(e) => setEntityId(e.target.value)} required>
                <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
                {optionsFor(entityType).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'İzin' : 'Permission'}>
              <Select
                value={permission}
                onChange={(e) => setPermission(e.target.value as GrantPermission)}
              >
                <option value="read">{tr ? 'Okuma' : 'Read'}</option>
                <option value="write">{tr ? 'Okuma ve yazma' : 'Read and write'}</option>
              </Select>
            </Field>
            <Field label={tr ? 'Bitiş (boş: süresiz)' : 'Lapses on (blank: open-ended)'}>
              <TextInput
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
            <Field label={tr ? 'Gerekçe' : 'Reason'}>
              <TextInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={tr ? 'Neden açılıyor?' : 'Why is this being shared?'}
              />
            </Field>
          </div>

          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {tr
              ? 'Kısıtlı sınıftaki bir kayıt dış paydaşa bu yolla açılamaz — bunun için kaydın sınıfının bilinçli olarak düşürülmesi gerekir. Bir bitiş tarihi vermek, unutulan erişimin en yaygın kaynağını kapatır.'
              : 'A restricted record cannot be handed to an external party this way; that needs a deliberate reclassification instead. Setting an end date closes off the commonest source of access nobody remembers granting.'}
          </p>

          <WriteError error={createGrant.error ?? revokeGrant.error} />

          <div className="mt-2.5 flex justify-end">
            <ActionButton type="submit" tone="primary" disabled={createGrant.isPending}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Paylaş' : 'Share'}</span>
            </ActionButton>
          </div>
        </form>
      )}
    </Section>
  );
};
