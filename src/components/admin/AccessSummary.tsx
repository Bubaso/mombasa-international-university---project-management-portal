import React from 'react';
import { IdCard, KeyRound, Scale, Building2, UserCog } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as domain from '../../api/hooks';
import * as access from '../../api/adminHooks';
import { roleLabel } from '../../lib/roles';
import { clearanceLabel, clearanceStyle, isExpired } from '../../lib/authority';
import { Pill, Section } from '../ui/Controls';
import type { Authority } from '../../types';

/**
 * What this person can reach, said plainly, to whoever is signed in.
 *
 * Every other section of the console is about someone else's access. This one
 * is the answer an outside advocate or a contractor actually wants: which
 * cases am I on, what has been shared with me, and when does it lapse. It is
 * also the only honest way to show a delegation — a person acting under
 * someone else's authority should never have to guess that they are.
 */
export const AccessSummary: React.FC<{ authority: Authority | null | undefined }> = ({
  authority,
}) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';

  const caseAssignments = access.useCaseAssignments();
  const blockAssignments = access.useBlockAssignments();
  const grants = access.useGrants();
  const cases = domain.useLegalCases();
  const blocks = domain.useConstructionBlocks();

  const mine = <T extends { userId: string }>(rows: T[] | undefined) =>
    (rows ?? []).filter((row) => row.userId === user?.id);

  const myCases = mine(caseAssignments.data);
  const myBlocks = mine(blockAssignments.data);
  const myGrants = mine(grants.data);

  const caseName = (id: string) => {
    const found = (cases.data ?? []).find((c) => c.id === id);
    return found ? `${found.caseNumber} · ${found.title}` : id;
  };
  const blockName = (id: string) => {
    const found = (blocks.data ?? []).find((b) => b.id === id);
    return found ? `${found.code} · ${found.name}` : id;
  };

  const lent = authority?.delegations ?? [];

  return (
    <Section
      icon={IdCard}
      title={tr ? 'Sizin erişiminiz' : 'Your access'}
      subtitle={
        tr
          ? 'Portalın size ne gösterdiğini belirleyen kayıt. Bunu siz değiştiremezsiniz.'
          : 'The record that decides what the portal shows you. You cannot change it yourself.'
      }
      whoMayUse={tr ? 'Herkes kendi kaydını görür' : 'Everyone sees their own'}
      canUse
    >
      {!authority ? (
        <p className="text-sm text-slate-600">
          {tr
            ? 'Etkin bir profiliniz olmadığı için hiçbir kayda erişiminiz yok.'
            : 'You have no active profile, so you can reach nothing.'}
        </p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">{tr ? 'Göreviniz' : 'Your role'}</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {roleLabel(authority.role, language)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">
                {tr ? 'Gizlilik seviyeniz' : 'Your clearance'}
              </dt>
              <dd>
                <Pill className={clearanceStyle(authority.clearance)}>
                  {clearanceLabel(authority.clearance, language)}
                </Pill>
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">{tr ? 'Konumunuz' : 'Standing'}</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {authority.isInternal
                  ? tr
                    ? 'Kurum içi'
                    : 'Internal'
                  : tr
                    ? 'Dış paydaş'
                    : 'External stakeholder'}
              </dd>
            </div>
          </dl>

          {lent.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {tr
                    ? 'Devredilmiş yetkiyle hareket ediyorsunuz'
                    : 'You are acting on a delegation'}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-amber-900/90">
                {lent.map((d) => (
                  <li key={d.lenderId}>
                    {tr
                      ? `${d.lenderName} adına, ${roleLabel(d.role, language)} yetkisiyle.`
                      : `For ${d.lenderName}, with the authority of a ${roleLabel(d.role, 'en').toLowerCase()}.`}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-amber-900/70">
                {tr
                  ? 'Yaptığınız her işlem denetim kaydına kendi adınızla yazılır.'
                  : 'Everything you do is written to the audit trail under your own name.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <ScopeList
              icon={Scale}
              title={tr ? 'Üzerinizdeki davalar' : 'Cases you are on'}
              empty={tr ? 'Atanmış dava yok.' : 'No cases assigned.'}
              items={myCases.map((a) => ({ key: a.targetId, label: caseName(a.targetId) }))}
            />
            <ScopeList
              icon={Building2}
              title={tr ? 'Üzerinizdeki bloklar' : 'Blocks you are on'}
              empty={tr ? 'Atanmış blok yok.' : 'No blocks assigned.'}
              items={myBlocks.map((a) => ({ key: a.targetId, label: blockName(a.targetId) }))}
            />
            <ScopeList
              icon={KeyRound}
              title={tr ? 'Size açılan kayıtlar' : 'Records shared with you'}
              empty={tr ? 'Size özel açılmış kayıt yok.' : 'Nothing shared with you.'}
              items={myGrants.map((g) => ({
                key: g.id,
                label: `${g.entityType} · ${g.entityId.slice(0, 8)}…`,
                note: g.expiresAt
                  ? isExpired(g.expiresAt)
                    ? tr
                      ? 'süresi doldu'
                      : 'lapsed'
                    : `${tr ? 'bitiş' : 'until'} ${g.expiresAt.slice(0, 10)}`
                  : undefined,
              }))}
            />
          </div>
        </div>
      )}
    </Section>
  );
};

const ScopeList: React.FC<{
  icon: React.ElementType;
  title: string;
  empty: string;
  items: { key: string; label: string; note?: string }[];
}> = ({ icon: Icon, title, empty, items }) => (
  <div className="rounded-lg border border-slate-200 px-3 py-2.5">
    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
      <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
      <span>{title}</span>
    </div>
    {items.length === 0 ? (
      <p className="mt-1.5 text-xs text-slate-500">{empty}</p>
    ) : (
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.key} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-slate-700">{item.label}</span>
            {item.note && <span className="shrink-0 text-slate-500">{item.note}</span>}
          </li>
        ))}
      </ul>
    )}
  </div>
);
