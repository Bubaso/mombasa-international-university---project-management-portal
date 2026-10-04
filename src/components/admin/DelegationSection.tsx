import React, { useState } from 'react';
import { LifeBuoy, ShieldCheck, Ban } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as access from '../../api/adminHooks';
import { roleLabel } from '../../lib/roles';
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
import type { Authority, Delegation } from '../../types';
import { wordFor } from '../../lib/labels';

type State = 'awaiting' | 'in_force' | 'expired' | 'revoked';

function stateOf(d: Delegation): State {
  if (d.revokedAt) return 'revoked';
  if (new Date(d.expiresAt) <= new Date()) return 'expired';
  return d.approvals.length >= 2 ? 'in_force' : 'awaiting';
}

const STATE_STYLES: Record<State, string> = {
  awaiting: 'border-amber-300 bg-amber-50 text-amber-800',
  in_force: 'border-rose-300 bg-rose-50 text-rose-800',
  expired: 'border-slate-300 bg-slate-100 text-slate-600',
  revoked: 'border-slate-300 bg-slate-100 text-slate-600',
};

const STATE_LABELS: Record<State, { tr: string; en: string }> = {
  awaiting: { tr: 'Onay bekliyor', en: 'Awaiting approval' },
  in_force: { tr: 'Yürürlükte', en: 'In force' },
  expired: { tr: 'Süresi doldu', en: 'Expired' },
  revoked: { tr: 'Geri alındı', en: 'Revoked' },
};

/** Two weeks out, as a starting point that is short enough to be noticed. */
function defaultExpiry(): string {
  const when = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(
    when.getHours(),
  )}:${pad(when.getMinutes())}`;
}

/**
 * Handing one person's authority to another for a bounded window.
 *
 * The project's own evaluation names a single-person dependency as its main
 * structural weakness, and access control makes that worse before it makes it
 * better: locking the portal down means that if the director is unreachable,
 * nobody can act. Two trustees acting together can lift that — two, because
 * one person quietly granting themselves the director's authority is exactly
 * the hole this would otherwise open.
 *
 * Raising and revoking read the caller's own role and never a lent one, so a
 * delegation cannot be used to mint another.
 */
export const DelegationSection: React.FC<{ authority: Authority | null | undefined }> = ({
  authority,
}) => {
  const { language } = useApp();
  const { user } = useAuth();
  const tr = language === 'tr';

  const delegations = access.useDelegations();
  const profiles = access.useProfiles();
  const request = access.useRequestDelegation();
  const approve = access.useApproveDelegation();
  const revoke = access.useRevokeDelegation();

  // Their own role, deliberately — this mirrors the policy, which does not
  // look at delegated roles for these two operations.
  const ownRole = authority?.role;
  const mayRaise = ownRole === 'trustee' || ownRole === 'admin';
  const mayApprove = ownRole === 'trustee';

  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);

  const active = (profiles.data ?? []).filter((p) => p.isActive);
  const rows = delegations.data ?? [];

  return (
    <Section
      icon={LifeBuoy}
      title={tr ? 'Olağanüstü yetki devri' : 'Emergency delegation'}
      subtitle={
        tr
          ? 'Bir kişinin yetkisini, süreli olarak bir başkasına taşır. İki mütevellinin birlikte onayı gerekir.'
          : "Carries one person's authority to another for a bounded window. Two trustees must approve together."
      }
      whoMayUse={
        mayRaise
          ? tr
            ? 'Talep açabilirsiniz'
            : 'You may raise one'
          : tr
            ? 'Yalnızca mütevelli ve yönetici talep açar'
            : 'Only a trustee or an administrator raises one'
      }
      canUse={mayRaise}
    >
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">
          {tr ? 'Hiç yetki devri talebi açılmamış.' : 'No delegation has ever been raised.'}
        </p>
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>{tr ? 'Devir' : 'Delegation'}</Th>
              <Th>{tr ? 'Gerekçe' : 'Reason'}</Th>
              <Th>{tr ? 'Onaylar' : 'Approvals'}</Th>
              <Th>{tr ? 'Durum' : 'State'}</Th>
              <Th className="text-right" />
            </tr>
          }
        >
          {rows.map((d) => {
            const state = stateOf(d);
            const alreadyApproved = d.approvals.some((a) => a.approverId === user?.id);
            const canApprove =
              mayApprove &&
              state === 'awaiting' &&
              !alreadyApproved &&
              d.toUserId !== user?.id &&
              d.approvals.length < 2;
            const canRevoke = mayRaise && (state === 'awaiting' || state === 'in_force');

            return (
              <tr key={d.id}>
                <Td>
                  <div className="font-medium text-slate-900">
                    {d.fromUserName ?? d.fromUserId} → {d.toUserName ?? d.toUserId}
                  </div>
                  <div className="text-xs text-slate-500">
                    {tr ? 'Bitiş' : 'Until'} {d.expiresAt.slice(0, 16).replace('T', ' ')}
                    {' · '}
                    {tr ? 'talep' : 'raised by'} {d.requestedByName ?? '—'}
                  </div>
                </Td>
                <Td className="max-w-[240px] text-slate-600">{d.reason}</Td>
                <Td>
                  <div className="font-mono text-xs">{d.approvals.length} / 2</div>
                  {d.approvals.length > 0 && (
                    <div className="text-xs text-slate-500">
                      {d.approvals.map((a) => a.approverName ?? '—').join(', ')}
                    </div>
                  )}
                </Td>
                <Td>
                  <Pill className={STATE_STYLES[state]}>
                    {wordFor(STATE_LABELS, state, language)}
                  </Pill>
                  {state === 'revoked' && d.revokedByName && (
                    <div className="mt-0.5 text-xs text-slate-500">{d.revokedByName}</div>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {canApprove && (
                      <ActionButton
                        tone="primary"
                        disabled={approve.isPending}
                        onClick={() =>
                          user && approve.mutate({ delegationId: d.id, approverId: user.id })
                        }
                      >
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        <span>{tr ? 'Onayla' : 'Approve'}</span>
                      </ActionButton>
                    )}
                    {canRevoke && (
                      <ActionButton
                        tone="danger"
                        disabled={revoke.isPending}
                        onClick={() => user && revoke.mutate({ id: d.id, revokedBy: user.id })}
                      >
                        <Ban className="h-3 w-3" aria-hidden="true" />
                        <span>{tr ? 'Geri al' : 'Revoke'}</span>
                      </ActionButton>
                    )}
                    {mayApprove && alreadyApproved && state === 'awaiting' && (
                      <span className="self-center text-xs text-slate-500">
                        {tr ? 'Onayınız kayıtlı' : 'Your approval is in'}
                      </span>
                    )}
                    {d.toUserId === user?.id && state === 'awaiting' && (
                      <span className="self-center text-xs text-slate-500">
                        {tr ? 'Kendi devrinizi onaylayamazsınız' : 'You cannot approve your own'}
                      </span>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </TableFrame>
      )}

      <WriteError error={approve.error ?? revoke.error} />

      {mayRaise && (
        <form
          className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!user || !fromUserId || !toUserId) return;
            request.mutate(
              {
                fromUserId,
                toUserId,
                reason: reason.trim(),
                requestedBy: user.id,
                expiresAt: new Date(expiresAt).toISOString(),
              },
              {
                onSuccess: () => {
                  setFromUserId('');
                  setToUserId('');
                  setReason('');
                  setExpiresAt(defaultExpiry());
                },
              },
            );
          }}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label={tr ? 'Yetkisi devredilen' : 'Whose authority'}>
              <Select value={fromUserId} onChange={(e) => setFromUserId(e.target.value)} required>
                <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} — {roleLabel(p.role, language)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Yerine hareket edecek' : 'Who acts in their place'}>
              <Select value={toUserId} onChange={(e) => setToUserId(e.target.value)} required>
                <option value="">{tr ? 'Seçin…' : 'Choose…'}</option>
                {active
                  .filter((p) => p.id !== fromUserId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} — {roleLabel(p.role, language)}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={tr ? 'Gerekçe' : 'Reason'}>
              <TextInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder={
                  tr ? 'Neden gerekli? Denetim kaydına yazılır.' : 'Why? This goes on the record.'
                }
              />
            </Field>
            <Field label={tr ? 'Bitiş anı' : 'Ends at'}>
              <TextInput
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                required
              />
            </Field>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {tr
              ? 'Devir, kişinin kendi yetkisini ortadan kaldırmaz; üzerine ekler. Yürürlüğe girmesi için iki ayrı mütevellinin onayı gerekir ve yetkiyi alan kişi kendi devrini onaylayamaz. Devralınan yetkiyle yeni bir devir açılamaz.'
              : 'A delegation adds to what someone already holds, it never replaces it. Two separate trustees must approve, and the recipient cannot approve their own. Borrowed authority cannot raise a further delegation.'}
          </p>

          <WriteError error={request.error} />

          <div className="mt-2.5 flex justify-end">
            <ActionButton type="submit" tone="primary" disabled={request.isPending}>
              {tr ? 'Talebi aç' : 'Raise the request'}
            </ActionButton>
          </div>
        </form>
      )}
    </Section>
  );
};
