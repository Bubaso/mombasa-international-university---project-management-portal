import React, { useState } from 'react';
import { Target, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as domain from '../../api/hooks';
import * as access from '../../api/adminHooks';
import type { ScopeKind } from '../../api/admin';
import { roleLabel } from '../../lib/roles';
import {
  ActionButton,
  Field,
  Section,
  Select,
  TableFrame,
  Td,
  Th,
  WriteError,
} from '../ui/Controls';
import type { Assignment, UserRole } from '../../types';

/**
 * The roles for whom scope is the thing that decides what they see.
 *
 * Everyone else reaches records by clearance, so putting an internal person on
 * a case would change nothing — offering it would only invite the belief that
 * it had. External roles without a scope rule (a donor, an observer, an
 * auditor) are not narrowed by assignment either.
 */
const SCOPED_ROLES: Record<ScopeKind, UserRole[]> = {
  case: ['legal_counsel'],
  block: ['contractor', 'quantity_surveyor'],
};

/**
 * Which cases an outside advocate is on, and which blocks a contractor is on.
 *
 * This is the whole of what an external stakeholder can reach above the
 * published tier: app.can_see_case and app.can_see_block narrow those roles to
 * their assignments, so an empty scope here means an almost empty portal for
 * them.
 */
export const ScopeSection: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const caseAssignments = access.useCaseAssignments();
  const blockAssignments = access.useBlockAssignments();
  const cases = domain.useLegalCases();
  const blocks = domain.useConstructionBlocks();

  return (
    <Section
      icon={Target}
      title={tr ? 'Kapsam' : 'Scope'}
      subtitle={
        tr
          ? 'Dış paydaşların hangi dava ve bloklara erişeceği. Kapsam dışı kayıtlar onlara hiç görünmez.'
          : 'Which cases and blocks an outside party is on. Anything outside it is invisible to them.'
      }
      whoMayUse={
        canManage
          ? tr
            ? 'Atama yapabilirsiniz'
            : 'You may assign'
          : tr
            ? 'Yalnızca yönetici ve proje direktörü atar'
            : 'Only an administrator or the project director assigns'
      }
      canUse={canManage}
    >
      <div className="space-y-5">
        <ScopeTable
          kind="case"
          heading={tr ? 'Davalar' : 'Legal cases'}
          canManage={canManage}
          assignments={caseAssignments.data ?? []}
          targets={(cases.data ?? []).map((c) => ({
            id: c.id,
            label: `${c.caseNumber} · ${c.title}`,
          }))}
        />
        <ScopeTable
          kind="block"
          heading={tr ? 'İnşaat blokları' : 'Construction blocks'}
          canManage={canManage}
          assignments={blockAssignments.data ?? []}
          targets={(blocks.data ?? []).map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))}
        />
      </div>
    </Section>
  );
};

const ScopeTable: React.FC<{
  kind: ScopeKind;
  heading: string;
  canManage: boolean;
  assignments: Assignment[];
  targets: { id: string; label: string }[];
}> = ({ kind, heading, canManage, assignments, targets }) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';
  const profiles = access.useProfiles();
  const assign = access.useAssign();
  const unassign = access.useUnassign();

  const [userId, setUserId] = useState('');
  const [targetId, setTargetId] = useState('');

  const candidates = (profiles.data ?? []).filter(
    (p) => p.isActive && SCOPED_ROLES[kind].includes(p.role),
  );
  const label = (id: string) => targets.find((t) => t.id === id)?.label ?? id;

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {heading}
      </h3>

      {assignments.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tr ? 'Henüz atama yok.' : 'Nothing assigned yet.'}
        </p>
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>{tr ? 'Kişi' : 'Person'}</Th>
              <Th>{tr ? 'Kayıt' : 'Record'}</Th>
              <Th>{tr ? 'Atayan' : 'Assigned by'}</Th>
              <Th className="text-right">{canManage ? (tr ? 'İşlem' : 'Action') : ''}</Th>
            </tr>
          }
        >
          {assignments.map((row) => (
            <tr key={`${row.userId}-${row.targetId}`}>
              <Td className="font-medium text-slate-900">{row.userName ?? row.userId}</Td>
              <Td>{label(row.targetId)}</Td>
              <Td className="text-slate-500">
                {row.assignedByName ?? '—'}
                <span className="ml-1.5 text-slate-500">{row.assignedAt.slice(0, 10)}</span>
              </Td>
              <Td className="text-right">
                {canManage && (
                  <ActionButton
                    tone="danger"
                    disabled={unassign.isPending}
                    onClick={() =>
                      unassign.mutate({ kind, userId: row.userId, targetId: row.targetId })
                    }
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>{tr ? 'Kaldır' : 'Remove'}</span>
                  </ActionButton>
                )}
              </Td>
            </tr>
          ))}
        </TableFrame>
      )}

      {canManage && (
        <form
          className="mt-2.5 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!userId || !targetId || !user) return;
            assign.mutate(
              { kind, userId, targetId, assignedBy: user.id },
              {
                onSuccess: () => {
                  setUserId('');
                  setTargetId('');
                },
              },
            );
          }}
        >
          <Field label={tr ? 'Kişi' : 'Person'} className="flex-1">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} — {roleLabel(p.role, language)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Kayıt' : 'Record'} className="flex-1">
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
              <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <ActionButton type="submit" tone="primary" disabled={assign.isPending}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Ata' : 'Assign'}</span>
          </ActionButton>
        </form>
      )}

      {canManage && candidates.length === 0 && (
        <p className="mt-1.5 text-sm text-slate-500">
          {tr
            ? 'Bu listede yalnızca kapsamla sınırlanan görevler yer alır. Kurum içi ekip zaten gizlilik seviyesiyle erişir; onlara atama yapmak bir şeyi değiştirmez.'
            : 'Only the roles that scope actually narrows appear here. Internal people reach records by clearance already, so assigning them would change nothing.'}
        </p>
      )}

      <WriteError error={assign.error ?? unassign.error} />
    </div>
  );
};
