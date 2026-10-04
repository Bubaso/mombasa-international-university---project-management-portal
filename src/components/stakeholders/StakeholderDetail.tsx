import React, { useState } from 'react';
import {
  X,
  Building2,
  MapPin,
  Mail,
  Phone,
  History,
  Handshake,
  MessagesSquare,
  Lock,
  Network,
  Plus,
  Pencil,
  Check,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as register from '../../api/stakeholderHooks';
import { useCommitmentRecords } from '../../api/obligationHooks';
import { useProfiles } from '../../api/adminHooks';
import { todayIso } from '../../lib/date';
import { clearanceLabel, clearanceStyle } from '../../lib/authority';
import {
  CONTACT_CHANNELS,
  STAKEHOLDER_CATEGORIES,
  STANCES,
  categoryLabel,
  channelLabel,
  daysSince,
  quadrantLabel,
  quadrantOf,
  relationshipLabel,
  stanceLabel,
  stanceStyle,
} from '../../lib/stakeholders';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';
import type {
  Confidentiality,
  ContactChannel,
  Stakeholder,
  StakeholderCategory,
  Stance,
} from '../../types';

interface Props {
  stakeholder: Stakeholder;
  canEdit: boolean;
  canAssess: boolean;
  onClose: () => void;
}

/**
 * One person, in the two halves the schema keeps apart: the profile that can
 * be shared, and the assessment that cannot.
 *
 * Showing them in one panel but under separate headings is deliberate. They
 * are different tables with different classifications, and whoever is writing
 * needs to know, at the moment they write, which of the two they are adding
 * to.
 */
export const StakeholderDetail: React.FC<Props> = ({
  stakeholder,
  canEdit,
  canAssess,
  onClose,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const history = register.useStanceHistory(stakeholder.id);
  const interactions = register.useInteractions(stakeholder.id);
  // Temasların kökeni, tek okumada (M13-21).
  const origins = useRecordOrigins((interactions.data ?? []).map((i) => i.id));
  const assessments = register.useAssessments(stakeholder.id);
  const relationships = register.useRelationships();
  const commitments = useCommitmentRecords();
  const profiles = useProfiles();
  const update = register.useUpdateStakeholder();

  const [editing, setEditing] = useState(false);

  const edges = (relationships.data ?? []).filter(
    (r) => r.fromStakeholderId === stakeholder.id || r.toStakeholderId === stakeholder.id,
  );

  return (
    <aside className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-900">{stakeholder.fullName}</h2>
          <p className="truncate text-xs text-slate-500">
            {[stakeholder.title, stakeholder.organizationName].filter(Boolean).join(' · ') ||
              categoryLabel(stakeholder.category, language)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canEdit && !editing && (
            <ActionButton onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" aria-hidden="true" />
              <span>{tr ? 'Düzenle' : 'Edit'}</span>
            </ActionButton>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={tr ? 'Kapat' : 'Close'}
            className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="space-y-4 p-4">
        {editing ? (
          <EditForm
            stakeholder={stakeholder}
            owners={(profiles.data ?? []).filter((p) => p.isActive)}
            pending={update.isPending}
            error={update.error}
            onCancel={() => {
              setEditing(false);
              update.reset();
            }}
            onSave={(changes) =>
              update.mutate({ id: stakeholder.id, changes }, { onSuccess: () => setEditing(false) })
            }
          />
        ) : (
          <>
            {/* ---- the shareable half ------------------------------------ */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill className={stanceStyle(stakeholder.stance)}>
                {stanceLabel(stakeholder.stance, language)}
              </Pill>
              <Pill>{quadrantLabel(quadrantOf(stakeholder), language)}</Pill>
              <Pill>{categoryLabel(stakeholder.category, language)}</Pill>
              <Pill className={clearanceStyle(stakeholder.confidentiality)}>
                {clearanceLabel(stakeholder.confidentiality, language)}
              </Pill>
            </div>

            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
              <Detail
                icon={Building2}
                label={tr ? 'Kurum' : 'Organization'}
                value={stakeholder.organizationName}
              />
              <Detail
                icon={MapPin}
                label={tr ? 'Konum' : 'Location'}
                value={stakeholder.location}
              />
              <Detail icon={Mail} label={tr ? 'E-posta' : 'Email'} value={stakeholder.email} />
              <Detail icon={Phone} label={tr ? 'Telefon' : 'Phone'} value={stakeholder.phone} />
            </dl>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500">
                  {tr ? 'İlişki sorumlusu' : 'Relationship owner'}
                </span>
                <span
                  className={
                    stakeholder.relationshipOwnerName
                      ? 'font-medium text-slate-900'
                      : 'font-medium text-amber-800'
                  }
                >
                  {stakeholder.relationshipOwnerName ??
                    (tr ? 'atanmamış — bu bir eksiklik' : 'nobody — this is a gap')}
                </span>
              </div>
              {stakeholder.interestTopic && (
                <p className="mt-1 text-slate-600">{stakeholder.interestTopic}</p>
              )}
            </div>
          </>
        )}

        {/* ---- how the stance moved ------------------------------------- */}
        <Block icon={History} title={tr ? 'Tutum geçmişi' : 'How this moved'}>
          {(history.data ?? []).length === 0 ? (
            <Empty>{tr ? 'Kayıt yok.' : 'Nothing recorded.'}</Empty>
          ) : (
            <ol className="space-y-1">
              {(history.data ?? []).map((change) => (
                <li key={change.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-mono text-slate-500">
                    {change.changedAt.slice(0, 10)}
                  </span>
                  <span className="min-w-0 text-slate-700">
                    {change.fromStance
                      ? `${stanceLabel(change.fromStance, language)} → ${stanceLabel(change.toStance, language)}`
                      : `${stanceLabel(change.toStance, language)} ${tr ? '(ilk kayıt)' : '(first recorded)'}`}
                    {change.changedByName && (
                      <span className="ml-1.5 text-slate-500">{change.changedByName}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Block>

        {/* ---- the contact log ------------------------------------------ */}
        <Block
          icon={MessagesSquare}
          title={tr ? 'Temas günlüğü' : 'Contact log'}
          note={(() => {
            const last = (interactions.data ?? [])[0];
            const since = daysSince(last?.occurredAt ?? null);
            if (since == null) return tr ? 'Hiç temas kaydı yok' : 'No contact recorded';
            return tr ? `Son temas ${since} gün önce` : `Last spoken ${since} days ago`;
          })()}
        >
          {canEdit && <LogForm stakeholderId={stakeholder.id} />}
          {(interactions.data ?? []).length === 0 ? (
            <Empty>{tr ? 'Henüz konuşulmamış.' : 'Nobody has logged a conversation.'}</Empty>
          ) : (
            <ul className="mt-2 space-y-2">
              {(interactions.data ?? []).map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-900">
                      {channelLabel(entry.channel, language)}
                    </span>
                    <span className="font-mono text-slate-500">
                      {entry.occurredAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{entry.summary}</p>
                  <RecordOrigin origin={origins.of(entry.id)} />
                  {entry.outcome && (
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-medium">{tr ? 'Sonuç: ' : 'Outcome: '}</span>
                      {entry.outcome}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Block>

        {/* ---- of what they undertook, how much they did (M2-08) -------- */}
        {(() => {
          const record = (commitments.data ?? []).find((c) => c.stakeholderId === stakeholder.id);
          if (!record) return null;
          return (
            <Block icon={Handshake} title={tr ? 'Verilen sözler' : 'What they undertook'}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-slate-700">
                  <span className="font-semibold text-slate-900">{record.undertaken}</span>{' '}
                  {tr ? 'taahhüt' : 'undertaken'}
                </span>
                <span className="text-emerald-700">
                  {record.kept} {tr ? 'tutuldu' : 'kept'}
                </span>
                <span className="text-rose-700">
                  {record.broken} {tr ? 'tutulmadı' : 'broken'}
                </span>
                <span className="text-slate-500">
                  {record.outstanding} {tr ? 'açık' : 'outstanding'}
                </span>
                {record.overdue > 0 && (
                  <span className="font-medium text-rose-700">
                    {record.overdue} {tr ? 'gecikmiş' : 'overdue'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {record.keptPercent == null
                  ? tr
                    ? 'Henüz kapanmış bir taahhüdü yok — bu sıfır demek değil, ölçülecek bir şey olmaması demek.'
                    : 'Nothing of theirs is settled yet, which is not zero but nothing to measure.'
                  : tr
                    ? `Kapanmış taahhütlerin %${record.keptPercent}'i yerine getirildi.`
                    : `${record.keptPercent}% of what has been settled was kept.`}
              </p>
            </Block>
          );
        })()}

        {/* ---- who they know -------------------------------------------- */}
        <Block icon={Network} title={tr ? 'İlişki ağı' : 'Who they know'}>
          {edges.length === 0 ? (
            <Empty>{tr ? 'Bağ kaydedilmemiş.' : 'No links recorded.'}</Empty>
          ) : (
            <ul className="space-y-1">
              {edges.map((edge) => {
                const outgoing = edge.fromStakeholderId === stakeholder.id;
                const other = outgoing ? edge.toName : edge.fromName;
                return (
                  <li key={edge.id} className="text-xs text-slate-700">
                    {outgoing ? (
                      <>
                        <span className="text-slate-500">
                          {relationshipLabel(edge.kind, language)}
                        </span>{' '}
                        <span className="font-medium">{other}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">{other}</span>{' '}
                        <span className="text-slate-500">
                          {relationshipLabel(edge.kind, language)}
                        </span>
                      </>
                    )}
                    <span className="ml-1.5 font-mono text-xs text-slate-500">
                      {edge.strength}/5
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Block>

        {/* ---- the half that is not for sharing -------------------------- */}
        <div className="rounded-lg border border-rose-200 bg-rose-50/50">
          <div className="flex items-center gap-1.5 border-b border-rose-200 px-3 py-2">
            <Lock className="h-3.5 w-3.5 shrink-0 text-rose-700" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-rose-900">
              {tr ? 'Gizli değerlendirme' : 'Private assessment'}
            </h3>
            <span className="ml-auto text-xs text-rose-800/70">
              {tr ? 'dış paydaşlara hiçbir şekilde açılmaz' : 'never reaches anyone outside'}
            </span>
          </div>
          <div className="px-3 py-2">
            {canAssess && <AssessmentForm stakeholderId={stakeholder.id} />}
            {(assessments.data ?? []).length === 0 ? (
              <p className="text-xs text-rose-900/60">
                {tr ? 'Değerlendirme yazılmamış.' : 'No assessment written.'}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(assessments.data ?? []).map((note) => (
                  <li key={note.id} className="text-xs">
                    <p className="leading-relaxed text-rose-950">{note.body}</p>
                    <p className="mt-0.5 text-xs text-rose-800/60">
                      {note.authorName ?? (tr ? 'bilinmiyor' : 'unknown')} ·{' '}
                      {note.assessedAt.slice(0, 10)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

// ---------------------------------------------------------------------------

const Detail: React.FC<{ icon: React.ElementType; label: string; value: string | null }> = ({
  icon: Icon,
  label,
  value,
}) => (
  <div className="flex items-baseline gap-1.5">
    <Icon className="h-3 w-3 shrink-0 translate-y-0.5 text-slate-500" aria-hidden="true" />
    <dt className="shrink-0 text-slate-500">{label}</dt>
    <dd className="min-w-0 truncate text-slate-800">{value ?? '—'}</dd>
  </div>
);

const Block: React.FC<{
  icon: React.ElementType;
  title: string;
  note?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, note, children }) => (
  <section>
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        {title}
      </h3>
      {note && <span className="shrink-0 text-xs text-slate-500">{note}</span>}
    </div>
    {children}
  </section>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs text-slate-500">{children}</p>
);

// ---------------------------------------------------------------------------

const EditForm: React.FC<{
  stakeholder: Stakeholder;
  owners: { id: string; fullName: string }[];
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (changes: Record<string, unknown>) => void;
}> = ({ stakeholder, owners, pending, error, onCancel, onSave }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [stance, setStance] = useState<Stance>(stakeholder.stance);
  const [category, setCategory] = useState<StakeholderCategory>(stakeholder.category);
  const [influence, setInfluence] = useState(stakeholder.influence);
  const [interest, setInterest] = useState(stakeholder.interest);
  const [owner, setOwner] = useState(stakeholder.relationshipOwner ?? '');
  const [topic, setTopic] = useState(stakeholder.interestTopic ?? '');
  const [email, setEmail] = useState(stakeholder.email ?? '');
  const [phone, setPhone] = useState(stakeholder.phone ?? '');

  return (
    <form
      className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          stance,
          category,
          influence,
          interest,
          relationshipOwner: owner || null,
          interestTopic: topic.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={tr ? 'Tutum' : 'Stance'}>
          <Select value={stance} onChange={(e) => setStance(e.target.value as Stance)}>
            {STANCES.map((s) => (
              <option key={s} value={s}>
                {stanceLabel(s, language)}
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
      </div>
      <Field label={tr ? 'İlişki sorumlusu' : 'Relationship owner'}>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">{tr ? 'Atanmamış' : 'Nobody'}</option>
          {owners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={tr ? 'İlişki konusu' : 'What this relationship is about'}>
        <TextInput value={topic} onChange={(e) => setTopic(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={tr ? 'E-posta' : 'Email'}>
          <TextInput value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={tr ? 'Telefon' : 'Phone'}>
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        {tr
          ? 'Tutumu değiştirmek geçmişe bir satır ekler; o satır sonradan düzeltilemez.'
          : 'Changing the stance appends a line to the history, and that line cannot be corrected later.'}
      </p>

      <WriteError error={error} />

      <div className="flex justify-end gap-2">
        <ActionButton type="button" onClick={onCancel} disabled={pending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={pending}>
          <Check className="h-3 w-3" aria-hidden="true" />
          <span>{tr ? 'Kaydet' : 'Save'}</span>
        </ActionButton>
      </div>
    </form>
  );
};

const LogForm: React.FC<{ stakeholderId: string }> = ({ stakeholderId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const log = register.useLogInteraction();
  const [open, setOpen] = useState(false);
  const [occurredOn, setOccurredOn] = useState(todayIso);
  const [channel, setChannel] = useState<ContactChannel>('in_person');
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState('');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('internal');

  if (!open) {
    return (
      <ActionButton onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" aria-hidden="true" />
        <span>{tr ? 'Temas kaydet' : 'Log a conversation'}</span>
      </ActionButton>
    );
  }

  return (
    <form
      className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        log.mutate(
          {
            stakeholderId,
            occurredAt: new Date(`${occurredOn}T12:00:00`).toISOString(),
            channel,
            summary: summary.trim(),
            outcome: outcome.trim() || null,
            confidentiality,
          },
          {
            onSuccess: () => {
              setSummary('');
              setOutcome('');
              setOpen(false);
            },
          },
        );
      }}
    >
      <div className="grid grid-cols-3 gap-2.5">
        <Field label={tr ? 'Tarih' : 'Date'}>
          <TextInput
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
          />
        </Field>
        <Field label={tr ? 'Kanal' : 'Channel'}>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)}>
            {CONTACT_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {channelLabel(c, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Gizlilik' : 'Tier'}>
          <Select
            value={confidentiality}
            onChange={(e) => setConfidentiality(e.target.value as Confidentiality)}
          >
            <option value="internal">{tr ? 'Kuruma özel' : 'Internal'}</option>
            <option value="confidential">{tr ? 'Gizli' : 'Confidential'}</option>
            <option value="restricted">{tr ? 'Kısıtlı' : 'Restricted'}</option>
          </Select>
        </Field>
      </div>
      <Field label={tr ? 'Ne konuşuldu' : 'What was said'}>
        <TextInput value={summary} onChange={(e) => setSummary(e.target.value)} required />
      </Field>
      <Field label={tr ? 'Sonuç / verilen söz' : 'Outcome or what was promised'}>
        <TextInput value={outcome} onChange={(e) => setOutcome(e.target.value)} />
      </Field>

      <WriteError error={log.error} />

      <div className="flex justify-end gap-2">
        <ActionButton type="button" onClick={() => setOpen(false)} disabled={log.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={log.isPending}>
          {tr ? 'Kaydet' : 'Save'}
        </ActionButton>
      </div>
    </form>
  );
};

const AssessmentForm: React.FC<{ stakeholderId: string }> = ({ stakeholderId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const add = register.useAddAssessment();
  const [body, setBody] = useState('');

  return (
    <form
      className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        add.mutate({ stakeholderId, body: body.trim() }, { onSuccess: () => setBody('') });
      }}
    >
      <Field label={tr ? 'Değerlendirme ekle' : 'Add an assessment'} className="flex-1">
        <TextInput
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            tr ? 'Bu kişiyle ilgili açık söylenmeyecek olan…' : 'What would not be said out loud…'
          }
        />
      </Field>
      <ActionButton type="submit" tone="primary" disabled={add.isPending}>
        {tr ? 'Ekle' : 'Add'}
      </ActionButton>
      <WriteError error={add.error} />
    </form>
  );
};
