import React, { useState } from 'react';
import { Users, UserPlus, Check, X, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as access from '../../api/adminHooks';
import { roleLabel } from '../../lib/roles';
import {
  clearanceLabel,
  clearanceStyle,
  clearancesFor,
  clearanceRank,
  maxClearanceFor,
  isExpired,
} from '../../lib/authority';
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
import { INTERNAL_ROLES, type Confidentiality, type Profile, type UserRole } from '../../types';

const ALL_ROLES: UserRole[] = [
  'admin',
  'project_director',
  'field_team',
  'trustee',
  'board_director',
  'audit_committee',
  'legal_counsel',
  'contractor',
  'quantity_surveyor',
  'external_auditor',
  'donor',
  'observer',
  'consultant',
];

/** A clearance that the role may actually hold, clamped rather than rejected. */
function fit(role: UserRole, wanted: Confidentiality): Confidentiality {
  const ceiling = maxClearanceFor(role);
  return clearanceRank(wanted) > clearanceRank(ceiling) ? ceiling : wanted;
}

interface Draft {
  role: UserRole;
  clearance: Confidentiality;
  organization: string;
  expiresAt: string;
  isActive: boolean;
}

/**
 * The directory, and — for an administrator — the only place a role or a
 * clearance changes.
 *
 * Everyone signed in can read this list. That is deliberate: a portal whose
 * members cannot see who else is in it invites people to guess, and the names
 * and roles of the project's own stakeholders are not the secret. What the
 * list does not show is anything those people can reach.
 */
export const PeopleSection: React.FC<{ canAdminister: boolean }> = ({ canAdminister }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const profiles = access.useProfiles();
  const updateProfile = access.useUpdateProfile();
  const invite = access.useInviteUser();

  const [inviting, setInviting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const beginEdit = (person: Profile) => {
    setEditingId(person.id);
    setDraft({
      role: person.role,
      clearance: person.clearance,
      organization: person.organization ?? '',
      expiresAt: person.expiresAt ? person.expiresAt.slice(0, 10) : '',
      isActive: person.isActive,
    });
    updateProfile.reset();
  };

  const save = (id: string) => {
    if (!draft) return;
    updateProfile.mutate(
      {
        id,
        changes: {
          role: draft.role,
          clearance: draft.clearance,
          organization: draft.organization.trim() || null,
          isActive: draft.isActive,
          expiresAt: draft.expiresAt ? new Date(`${draft.expiresAt}T23:59:59`).toISOString() : null,
        },
      },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const people = profiles.data ?? [];
  const internal = people.filter((p) => (INTERNAL_ROLES as readonly UserRole[]).includes(p.role));
  const external = people.filter((p) => !(INTERNAL_ROLES as readonly UserRole[]).includes(p.role));

  return (
    <Section
      icon={Users}
      title={tr ? 'Kişiler' : 'People'}
      subtitle={
        tr
          ? 'Portala kimin girdiği, hangi sıfatla ve hangi gizlilik seviyesiyle.'
          : 'Who is in the portal, in what capacity, and at what clearance.'
      }
      whoMayUse={
        canAdminister
          ? tr
            ? 'Değişiklik yapabilirsiniz'
            : 'You may make changes'
          : tr
            ? 'Yalnızca sistem yöneticisi değiştirebilir'
            : 'Only an administrator may change these'
      }
      canUse={canAdminister}
    >
      {canAdminister && (
        <div className="mb-4">
          {inviting ? (
            <InviteForm
              onCancel={() => {
                setInviting(false);
                invite.reset();
              }}
              onSubmit={(input) =>
                invite.mutate(input, {
                  onSuccess: () => setInviting(false),
                })
              }
              pending={invite.isPending}
              error={invite.error}
            />
          ) : (
            <ActionButton tone="primary" onClick={() => setInviting(true)}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr ? 'Kişi davet et' : 'Invite someone'}</span>
            </ActionButton>
          )}
        </div>
      )}

      {[
        { label: tr ? 'Kurum içi' : 'Internal', rows: internal },
        { label: tr ? 'Dış paydaşlar' : 'External stakeholders', rows: external },
      ].map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {group.label}
          </h3>
          {group.rows.length === 0 ? (
            <p className="text-xs text-slate-500">{tr ? 'Kayıt yok.' : 'Nobody yet.'}</p>
          ) : (
            <TableFrame
              head={
                <tr>
                  <Th>{tr ? 'Kişi' : 'Person'}</Th>
                  <Th>{tr ? 'Görev' : 'Role'}</Th>
                  <Th>{tr ? 'Gizlilik' : 'Clearance'}</Th>
                  <Th>{tr ? 'Durum' : 'Status'}</Th>
                  <Th className="text-right">{canAdminister ? (tr ? 'İşlem' : 'Action') : ''}</Th>
                </tr>
              }
            >
              {group.rows.map((person) => {
                const editing = editingId === person.id && draft !== null;
                const expired = isExpired(person.expiresAt);
                return (
                  <React.Fragment key={person.id}>
                    <tr className={editing ? 'bg-amber-50/50' : undefined}>
                      <Td>
                        <div className="font-medium text-slate-900">{person.fullName}</div>
                        <div className="text-xs text-slate-500">{person.email}</div>
                        {person.organization && (
                          <div className="text-xs text-slate-400">{person.organization}</div>
                        )}
                      </Td>
                      <Td>{roleLabel(person.role, language)}</Td>
                      <Td>
                        <Pill className={clearanceStyle(person.clearance)}>
                          {clearanceLabel(person.clearance, language)}
                        </Pill>
                      </Td>
                      <Td>
                        {!person.isActive ? (
                          <Pill className="border-slate-300 bg-slate-100 text-slate-600">
                            {tr ? 'Kapalı' : 'Inactive'}
                          </Pill>
                        ) : expired ? (
                          <Pill className="border-rose-300 bg-rose-50 text-rose-700">
                            {tr ? 'Süresi doldu' : 'Expired'}
                          </Pill>
                        ) : (
                          <Pill className="border-emerald-200 bg-emerald-50 text-emerald-800">
                            {person.expiresAt
                              ? `${tr ? 'bitiş' : 'until'} ${person.expiresAt.slice(0, 10)}`
                              : tr
                                ? 'Etkin'
                                : 'Active'}
                          </Pill>
                        )}
                      </Td>
                      <Td className="text-right">
                        {canAdminister && !editing && (
                          <ActionButton onClick={() => beginEdit(person)}>
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            <span>{tr ? 'Düzenle' : 'Edit'}</span>
                          </ActionButton>
                        )}
                      </Td>
                    </tr>
                    {editing && draft && (
                      <tr className="bg-amber-50/50">
                        <td colSpan={5} className="px-2 pb-3">
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                            <Field label={tr ? 'Görev' : 'Role'}>
                              <Select
                                value={draft.role}
                                onChange={(e) => {
                                  const role = e.target.value as UserRole;
                                  setDraft({
                                    ...draft,
                                    role,
                                    clearance: fit(role, draft.clearance),
                                  });
                                }}
                              >
                                {ALL_ROLES.map((role) => (
                                  <option key={role} value={role}>
                                    {roleLabel(role, language)}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label={tr ? 'Gizlilik seviyesi' : 'Clearance'}>
                              <Select
                                value={draft.clearance}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    clearance: e.target.value as Confidentiality,
                                  })
                                }
                              >
                                {clearancesFor(draft.role).map((tier) => (
                                  <option key={tier} value={tier}>
                                    {clearanceLabel(tier, language)}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label={tr ? 'Kurum' : 'Organization'}>
                              <TextInput
                                value={draft.organization}
                                onChange={(e) =>
                                  setDraft({ ...draft, organization: e.target.value })
                                }
                              />
                            </Field>
                            <Field label={tr ? 'Erişim bitişi' : 'Access ends'}>
                              <TextInput
                                type="date"
                                value={draft.expiresAt}
                                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
                              />
                            </Field>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={draft.isActive}
                                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                                className="h-3.5 w-3.5 cursor-pointer accent-amber-600"
                              />
                              <span>
                                {tr
                                  ? 'Hesap etkin (kapatmak erişimi anında keser)'
                                  : 'Account active (unticking cuts access immediately)'}
                              </span>
                            </label>
                            <div className="flex gap-2">
                              <ActionButton
                                onClick={() => setEditingId(null)}
                                disabled={updateProfile.isPending}
                              >
                                <X className="h-3 w-3" aria-hidden="true" />
                                <span>{tr ? 'Vazgeç' : 'Cancel'}</span>
                              </ActionButton>
                              <ActionButton
                                tone="primary"
                                onClick={() => save(person.id)}
                                disabled={updateProfile.isPending}
                              >
                                <Check className="h-3 w-3" aria-hidden="true" />
                                <span>{tr ? 'Kaydet' : 'Save'}</span>
                              </ActionButton>
                            </div>
                          </div>
                          <WriteError error={updateProfile.error} />
                          <p className="mt-2 text-xs text-slate-500">
                            {tr
                              ? 'Kişi silinmez; hesap kapatılır. Böylece bu kişinin geçmişteki işlemleri denetim kaydında kime ait olduğunu göstermeye devam eder.'
                              : 'Nobody is deleted, only deactivated — so that what they did in the past still has a name against it in the audit trail.'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </TableFrame>
          )}
        </div>
      ))}
    </Section>
  );
};

// ---------------------------------------------------------------------------

interface InviteInput {
  email: string;
  fullName: string;
  role: UserRole;
  organization: string | null;
  clearance: Confidentiality;
  expiresAt: string | null;
}

const InviteForm: React.FC<{
  onCancel: () => void;
  onSubmit: (input: InviteInput) => void;
  pending: boolean;
  error: unknown;
}> = ({ onCancel, onSubmit, pending, error }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('observer');
  const [organization, setOrganization] = useState('');
  const [clearance, setClearance] = useState<Confidentiality>('public');
  const [expiresAt, setExpiresAt] = useState('');

  const external = !(INTERNAL_ROLES as readonly UserRole[]).includes(role);

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          email: email.trim(),
          fullName: fullName.trim(),
          role,
          organization: organization.trim() || null,
          clearance,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        });
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Ad soyad' : 'Full name'}>
          <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label={tr ? 'E-posta' : 'Email'}>
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label={tr ? 'Kurum' : 'Organization'}>
          <TextInput
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder={tr ? 'AUTK, hukuk bürosu, müteahhit…' : 'AUTK, law firm, contractor…'}
          />
        </Field>
        <Field label={tr ? 'Görev' : 'Role'}>
          <Select
            value={role}
            onChange={(e) => {
              const next = e.target.value as UserRole;
              setRole(next);
              setClearance(fit(next, clearance));
            }}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Gizlilik seviyesi' : 'Clearance'}>
          <Select
            value={clearance}
            onChange={(e) => setClearance(e.target.value as Confidentiality)}
          >
            {clearancesFor(role).map((tier) => (
              <option key={tier} value={tier}>
                {clearanceLabel(tier, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Erişim bitişi' : 'Access ends'}>
          <TextInput type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {external
          ? tr
            ? 'Dış paydaşlar yalnızca kendilerine atanan dava ve bloklara ulaşır. Davet gönderdikten sonra kapsamı aşağıdaki "Kapsam" bölümünden verin — kapsam verilmeden bu kişi neredeyse hiçbir şey göremez. Süreli erişim vermeniz önerilir.'
            : 'External stakeholders reach only the cases and blocks they are put on. Give them that scope below once the invitation is sent — without it they will see next to nothing. An end date is worth setting.'
          : tr
            ? 'Davet e-postası gönderilir; kişi parolasını kendisi belirler. Gizlilik seviyesi göreve göre sınırlıdır.'
            : 'An invitation email goes out and they set their own password. The clearance list is limited by what the role may hold.'}
      </p>

      <WriteError error={error} />

      <div className="mt-2.5 flex justify-end gap-2">
        <ActionButton type="button" onClick={onCancel} disabled={pending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={pending}>
          {pending ? (tr ? 'Gönderiliyor…' : 'Sending…') : tr ? 'Daveti gönder' : 'Send invitation'}
        </ActionButton>
      </div>
    </form>
  );
};
