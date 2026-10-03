import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Quote, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProfiles } from '../../api/adminHooks';
import { useLegalCases } from '../../api/hooks';
import { useMeetings } from '../../api/meetingHooks';
import { useStakeholders } from '../../api/stakeholderHooks';
import { useBlocks } from '../../api/siteHooks';
import { useBudgetCategories } from '../../api/moneyHooks';
import { applyProposal, declineProposal, type Proposal } from '../../api/proposals';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import { targetFor, type TargetField } from '../../../supabase/functions/ai-assistant/targets.js';

/**
 * Bir teklif ve onayı (M13-14, M13-15).
 *
 * Üç şey ekranda, üçü de kasıtlı:
 *
 *   **Alıntı.** Teklifin dayanağı belgeden kelimesi kelimesine alınmış bir
 *   parçadır ve onayın yanında durur. Onaylayan kişi "model böyle dedi"ye
 *   değil, belgenin kendi cümlesine bakarak karar verir. Alıntı metinde
 *   bulunamazsa teklif zaten hiç oluşmuyor; burada görünen her alıntı
 *   belgede geçiyor.
 *
 *   **Düzenlenebilir alanlar.** Kütüğe giren, modelin yazdığı değil senin
 *   bıraktığın hâldir. Teklifin kendisi değişmeden kalıyor (0048'de sütun
 *   bazlı grant), yani "model ne dedi, biz ne yazdık" sorusu sonradan
 *   cevaplanabiliyor.
 *
 *   **Modelin dolduramadığı alan.** Bir mektup "sorumlusu Ahmet" diyebilir
 *   ama portaldaki hangi profil olduğunu söyleyemez. O alanlar boş geliyor
 *   ve onay, onlar doldurulmadan verilemiyor — kütüğün kendi kuralı zaten
 *   bunu istiyor, ekran onu önceden söylüyor.
 */

const TEXTAREA =
  'min-h-20 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 ' +
  'focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';

/** Enum değerlerinin okunur hâli. `court_order` bir etiket değil, bir anahtar. */
const humanise = (value: string): string =>
  value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const ProposalCard: React.FC<{ proposal: Proposal }> = ({ proposal }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const queryClient = useQueryClient();
  const target = targetFor(proposal.register);
  // Modelin dolduramadığı alanların seçenekleri. Hepsi aynı anda çekiliyor;
  // bir teklif kartı bunlardan en fazla birini kullanıyor ama hangisi
  // olduğunu hedefin alanları söylüyor ve hook sayısı sabit kalmak zorunda.
  const profiles = useProfiles();
  const cases = useLegalCases();
  const meetings = useMeetings();
  const stakeholders = useStakeholders();
  const blocks = useBlocks();
  const budgetCategories = useBudgetCategories();

  /** Bir seçici alanın seçenekleri: kimlik ve ekranda görünecek ad. */
  const optionsFor = (type: TargetField['type']): { id: string; label: string }[] => {
    if (type === 'profile')
      return (profiles.data ?? []).map((x) => ({ id: x.id, label: x.fullName }));
    if (type === 'stakeholder')
      return (stakeholders.data ?? []).map((x) => ({ id: x.id, label: x.fullName }));
    if (type === 'legalCase')
      return (cases.data ?? []).map((x) => ({ id: x.id, label: `${x.caseNumber} — ${x.title}` }));
    if (type === 'meeting')
      return (meetings.data ?? []).map((x) => ({ id: x.id, label: `${x.title} (${x.heldAt})` }));
    if (type === 'constructionBlock')
      return (blocks.data ?? []).map((x) => ({ id: x.id, label: `${x.code} — ${x.name}` }));
    if (type === 'budgetCategory')
      return (budgetCategories.data ?? []).map((x) => ({
        id: x.id,
        label: `${x.code} — ${x.nameEn}`,
      }));
    return [];
  };

  const [values, setValues] = React.useState<Record<string, unknown>>(() => ({
    ...proposal.values,
  }));

  const apply = useMutation({
    mutationFn: () =>
      applyProposal({
        proposalId: proposal.id,
        register: proposal.register,
        documentId: proposal.documentId,
        values,
      }),
    onSuccess: () => {
      // Teklif listesi ve açılan kaydın kütüğü, ikisi de tazelenmeli.
      void queryClient.invalidateQueries({ queryKey: ['intakeProposals'] });
      void queryClient.invalidateQueries();
    },
  });

  const decline = useMutation({
    mutationFn: () => declineProposal(proposal.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['intakeProposals'] }),
  });

  if (!target) {
    // Teklif bilinmeyen bir kütüğe işaret ediyor: bu portalda onu yazacak bir
    // yol yok. Gizlemek yerine söylenir — gizlenen teklif, hiç üretilmemiş
    // teklifle aynı görünür.
    return (
      <li className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        {tr
          ? `Bu teklif "${proposal.register}" kütüğüne işaret ediyor ve bu portalda oraya kayıt açacak bir yol yok.`
          : `This proposal points at the "${proposal.register}" register, and this portal has no way to record one.`}
      </li>
    );
  }

  const label = target.label[tr ? 'tr' : 'en'];
  const settled = proposal.state !== 'proposed';

  const missing = target.fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = values[field.name];
      return value === undefined || value === null || String(value).trim() === '';
    });

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{proposal.why}</p>
        </div>
        {proposal.state === 'applied' && (
          <Pill className="border-emerald-300 bg-emerald-50 text-emerald-800">
            {tr ? 'kaydedildi' : 'recorded'}
          </Pill>
        )}
        {proposal.state === 'declined' && (
          <Pill className="border-slate-300 bg-slate-100 text-slate-600">
            {tr ? 'reddedildi' : 'declined'}
          </Pill>
        )}
      </div>

      {/* Belgenin kendi cümlesi. Kararın dayandığı şey bu. */}
      <blockquote className="mt-2 flex gap-2 rounded-lg border-l-2 border-amber-400 bg-amber-50/60 px-2.5 py-1.5">
        <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
        <span className="text-sm leading-relaxed text-slate-700 italic">{proposal.quote}</span>
      </blockquote>

      {settled ? (
        <p className="mt-2 text-xs text-slate-500">
          {proposal.state === 'applied'
            ? tr
              ? `Bu teklif kayda dönüştü${proposal.decidedAt ? ` — ${formatDate(proposal.decidedAt, language)}` : ''}.`
              : `This proposal became a record${proposal.decidedAt ? ` on ${formatDate(proposal.decidedAt, language)}` : ''}.`
            : tr
              ? 'Bu teklif reddedildi ve kütüğe hiçbir şey yazılmadı.'
              : 'This proposal was declined and nothing was written.'}
        </p>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {target.fields.map((field) => (
              <ProposalField
                key={field.name}
                field={field}
                tr={tr}
                value={values[field.name]}
                options={optionsFor(field.type)}
                onChange={(next) => setValues((current) => ({ ...current, [field.name]: next }))}
              />
            ))}
          </div>

          {missing.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {tr
                ? `Kaydetmeden önce doldurulması gereken: ${missing.map((f) => f.label.tr).join(', ')}.`
                : `Still needed before this can be recorded: ${missing.map((f) => f.label.en).join(', ')}.`}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <ActionButton
              tone="primary"
              disabled={missing.length > 0 || apply.isPending}
              onClick={() => apply.mutate()}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {apply.isPending
                ? tr
                  ? 'Kaydediliyor…'
                  : 'Recording…'
                : tr
                  ? 'Onayla ve kaydet'
                  : 'Approve and record'}
            </ActionButton>
            <ActionButton
              tone="quiet"
              disabled={decline.isPending}
              onClick={() => decline.mutate()}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Reddet' : 'Decline'}
            </ActionButton>
          </div>

          <WriteError error={apply.error} />
          <WriteError error={decline.error} />
        </>
      )}
    </li>
  );
};

const ProposalField: React.FC<{
  field: TargetField;
  tr: boolean;
  value: unknown;
  options: { id: string; label: string }[];
  onChange: (next: unknown) => void;
}> = ({ field, tr, value, options, onChange }) => {
  const label = field.label[tr ? 'tr' : 'en'] + (field.required ? ' *' : '');
  const asText = value === undefined || value === null ? '' : String(value);

  if (field.type === 'enum') {
    return (
      <Field label={label}>
        <Select value={asText} onChange={(e) => onChange(e.target.value)}>
          <option value="">{tr ? '— seçilmedi —' : '— not set —'}</option>
          {(field.values ?? []).map((option) => (
            <option key={option} value={option}>
              {humanise(option)}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  // Portaldaki bir kaydı seçtiren alanlar. Hepsi aynı biçimde çiziliyor:
  // belge bir ad yazabilir, portaldaki hangi kayıt olduğunu söyleyemez.
  if (
    [
      'profile',
      'stakeholder',
      'legalCase',
      'meeting',
      'constructionBlock',
      'budgetCategory',
    ].includes(field.type)
  ) {
    return (
      <Field label={label}>
        <Select value={asText} onChange={(e) => onChange(e.target.value)}>
          <option value="">{tr ? '— seçilmedi —' : '— not set —'}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === 'boolean') {
    return (
      <Field label={label}>
        <Select
          value={value === true ? 'true' : 'false'}
          onChange={(e) => onChange(e.target.value === 'true')}
        >
          <option value="false">{tr ? 'Hayır' : 'No'}</option>
          <option value="true">{tr ? 'Evet' : 'Yes'}</option>
        </Select>
      </Field>
    );
  }

  if (field.type === 'longtext') {
    return (
      <Field label={label} className="sm:col-span-2">
        <textarea className={TEXTAREA} value={asText} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }

  return (
    <Field label={label}>
      <TextInput
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
        min={field.min}
        max={field.max}
        value={asText}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
};
