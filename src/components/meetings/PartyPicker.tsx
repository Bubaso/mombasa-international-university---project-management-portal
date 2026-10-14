import React from 'react';
import { useApp } from '../../context/AppContext';
import { useProfiles } from '../../api/adminHooks';
import { useStakeholders } from '../../api/stakeholderHooks';
import { Select } from '../ui/Controls';

export interface PartyValue {
  profileId: string | null;
  stakeholderId: string | null;
}

export const NO_PARTY: PartyValue = { profileId: null, stakeholderId: null };

/**
 * Picks one person, from either side of the line the schema draws: somebody
 * who signs in, or somebody in the stakeholder register.
 *
 * It is one control rather than two because the question is "who", not "which
 * table". The encoding — a prefixed value split back apart on change — keeps
 * the caller from having to know that either.
 */
export const PartyPicker: React.FC<{
  value: PartyValue;
  onChange: (value: PartyValue) => void;
  /** Shown as the empty option; omit to require a choice. */
  emptyLabel?: string;
  required?: boolean;
}> = ({ value, onChange, emptyLabel, required }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const profiles = useProfiles();
  const stakeholders = useStakeholders();

  const encoded = value.profileId
    ? `profile:${value.profileId}`
    : value.stakeholderId
      ? `stakeholder:${value.stakeholderId}`
      : '';

  return (
    <Select
      value={encoded}
      required={required}
      onChange={(e) => {
        const raw = e.target.value;
        if (!raw) return onChange(NO_PARTY);
        const [kind, id] = raw.split(':');
        onChange(
          kind === 'profile'
            ? { profileId: id ?? null, stakeholderId: null }
            : { profileId: null, stakeholderId: id ?? null },
        );
      }}
    >
      <option value="">{emptyLabel ?? (tr ? 'Seçin…' : 'Choose…')}</option>
      <optgroup label={tr ? 'Portal kullanıcıları' : 'Portal users'}>
        {(profiles.data ?? [])
          .filter((p) => p.isActive)
          .map((p) => (
            <option key={p.id} value={`profile:${p.id}`}>
              {p.fullName}
            </option>
          ))}
      </optgroup>
      <optgroup label={tr ? 'Paydaş kütüğü' : 'Stakeholder register'}>
        {(stakeholders.data ?? []).map((s) => (
          <option key={s.id} value={`stakeholder:${s.id}`}>
            {s.fullName}
            {s.organizationName ? ` — ${s.organizationName}` : ''}
          </option>
        ))}
      </optgroup>
    </Select>
  );
};
