import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as access from '../api/adminHooks';
import { QueryStatus } from '../components/QueryStatus';
import { AccessSummary } from '../components/admin/AccessSummary';
import { PeopleSection } from '../components/admin/PeopleSection';
import { ScopeSection } from '../components/admin/ScopeSection';
import { SharingSection } from '../components/admin/SharingSection';
import { DelegationSection } from '../components/admin/DelegationSection';
import { AuditSection } from '../components/admin/AuditSection';
import { ACCESS_MANAGERS, AUDIT_READERS, actsAs } from '../lib/authority';

/**
 * Access and administration.
 *
 * Six parts, each shown to the people the policies actually let use it. The
 * rule this follows throughout: never offer a control the database will
 * refuse. A button that fails leaves a person unsure whether the system is
 * broken or they are not allowed, and in a portal where trustees, advocates
 * and contractors share one login screen that ambiguity is the thing to
 * avoid.
 *
 * Nothing here is the boundary. Every query and every write is checked again
 * by a policy in supabase/migrations/0003 and 0005, so a person who edits
 * their way past this view reaches exactly nothing new.
 */
export const AdminConsoleView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  const authorityQuery = access.useAuthority();
  const authority = authorityQuery.data;

  const canAdminister = actsAs(authority, 'admin');
  const canManageAccess = actsAs(authority, ...ACCESS_MANAGERS);
  const canReadAudit = actsAs(authority, ...AUDIT_READERS);
  const isInternal = authority?.isInternal ?? false;

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {tr ? 'Erişim ve Yönetim' : 'Access & Administration'}
          </h1>
          <p className="text-sm text-slate-500">
            {tr
              ? 'Portala kimin girdiği, neyi görebildiği ve bunu kimin değiştirdiği.'
              : 'Who is in the portal, what they can see, and who changed it.'}
          </p>
        </div>
      </header>

      <QueryStatus queries={[authorityQuery]} />

      <AccessSummary authority={authority} />

      <PeopleSection canAdminister={canAdminister} />

      {/* Scope, sharing and delegation are readable by the internal team. An
          external party's own scope and grants are in "Your access" above,
          which is all their policies let them read anyway. */}
      {isInternal && (
        <>
          <ScopeSection canManage={canManageAccess} />
          <SharingSection canManage={canManageAccess} />
          <DelegationSection authority={authority} />
        </>
      )}

      {canReadAudit && <AuditSection />}

      {!isInternal && (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-500">
          {tr
            ? 'Kapsam, paylaşım ve yetki devri bölümleri yalnızca kurum içi ekibe açıktır. Size verilen erişimin tamamı yukarıda görünür; eksik olduğunu düşünüyorsanız proje direktörüne başvurun.'
            : 'Scope, sharing and delegation are for the internal team. Everything you have been given is shown above — if something is missing, the project director is the person to ask.'}
        </p>
      )}
    </div>
  );
};
