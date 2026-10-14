import React, { useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as register from '../../api/stakeholderHooks';
import { useProfiles } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { stanceLabel, stanceStyle } from '../../lib/stakeholders';
import {
  ENGAGEMENT_OUTCOMES,
  ENGAGEMENT_STEP_STATES,
  planStatusLabel,
  stepStateLabel,
  stepStateNote,
  stepStateStyle,
} from '../../lib/engagement';
import type { EngagementBoardRow, EngagementPlanStatus } from '../../types';

/**
 * Etkileşim planı panosu (M4-12).
 *
 * PANONUN EN ÖNEMLİ SATIRI, PLANI OLMAYAN SATIR. Görünüm paydaştan
 * başlıyor, plandan değil: plan tablosundan okunan bir pano "yapılacak
 * işler" listesi olurdu ve hiç plan yazılmamış bir bakan o listede hiç
 * görünmezdi — oysa asıl bulgu tam olarak o.
 *
 * ÜÇ PARÇA BİRLİKTE. Sıradaki adımın metni, sorumlusu ve tarihi bir bütün;
 * biri eksikse veritabanı kaydı reddediyor
 * (`engagement_plans_step_is_whole`). Ekran o kuralı tekrarlamıyor, kuralın
 * cevabını gösteriyor: üç alan bir arada duruyor ve hata mesajı
 * veritabanından geliyor.
 *
 * SONUCU BİLİNMEYEN KAPANIŞ BİR SEÇENEK, ve kasıtlı: bir plan çoğu zaman
 * bir kararla değil ilgisizlikle kapanır. Beş sonuçtan birini seçmeye
 * zorlamak, olmayan bir cevabı icat etmek olurdu (CLAUDE.md §2).
 *
 * "PLAN YAZ" DÜĞMESİ SATIR BAŞINA, ve bu bir ayrıntı değil: planı ilişki
 * SAHİBİ de yazabiliyor (M4-05), yani yetki role göre değil kişiye göre
 * değişiyor. Düğmeyi panel seviyesinde `canAssess`'e bağlamak, kendi
 * paydaşının planını yazabilen bir saha ekibi üyesinden o yetkiyi
 * saklardı. Cevap görünümden geliyor — politikanın çağırdığı fonksiyonun
 * aynısı, satır başına (`can_plan`).
 */
export const PlanBoard: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const board = register.useEngagementBoard();
  const profiles = useProfiles();
  const save = register.useSaveEngagementPlan();
  const close = register.useCloseEngagementPlan();

  const [writingFor, setWritingFor] = useState<string | null>(null);
  const [closing, setClosing] = useState<EngagementBoardRow | null>(null);

  const rows = board.data ?? [];

  const byState = useMemo(() => {
    const out = new Map<string, EngagementBoardRow[]>();
    for (const row of rows) {
      const list = out.get(row.stepState);
      if (list) list.push(row);
      else out.set(row.stepState, [row]);
    }
    return out;
  }, [rows]);

  // Görünümün verdiği ama bu paketin tanımadığı bir durum kendi adıyla
  // gösteriliyor — bölümü kaybetmekten iyidir (0047'nin dersi).
  const states = [
    ...ENGAGEMENT_STEP_STATES.filter((s) => byState.has(s)),
    ...[...byState.keys()].filter((s) => !(ENGAGEMENT_STEP_STATES as string[]).includes(s)),
  ];

  const planless = rows.filter((r) => r.planId === null);
  // Nüfuzu yüksek olup planı olmayanlar ayrı sayılıyor: eşik `stakeholder_attention`
  // ile aynı mantık, ama orada eşik ilişkinin soğumasına bakıyor. Burada
  // ölçülen şey hiç düşünülmemiş olmak.
  const planlessWithWeight = planless.filter((r) => r.influence >= 4);

  return (
    <section data-plan-board className="space-y-4">
      <QueryStatus queries={[board]} />

      <div
        data-plan-gaps={planless.length}
        className={`rounded-xl border p-3 ${
          planlessWithWeight.length > 0
            ? 'border-rose-300 bg-rose-50 text-rose-900'
            : planless.length > 0
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        <p className="text-sm font-medium">
          {planless.length === 0
            ? tr
              ? 'Görebildiğiniz her paydaş için bir plan yazılı.'
              : 'Every stakeholder you can see has a plan.'
            : tr
              ? `${planless.length} paydaş için plan yazılmamış — ${planlessWithWeight.length} tanesinin nüfuzu 4 ya da 5.`
              : `${planless.length} stakeholders have no plan — ${planlessWithWeight.length} of them score 4 or 5 on influence.`}
        </p>
        {/* İKİNCİ CÜMLE KESİLDİ: `stepStateNote('no_plan_recorded')` aynı
            şeyi aşağıda, tam o grubun başlığında söylüyor. */}
      </div>

      {states.map((state) => {
        const group = byState.get(state) ?? [];
        return (
          <div key={state} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <Target className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <h3 className="text-base font-semibold text-slate-900">
                {stepStateLabel(state, language)}
              </h3>
              <Pill>{group.length}</Pill>
              <p className="w-full text-sm text-slate-500">{stepStateNote(state, language)}</p>
            </header>

            <ul className="divide-y divide-slate-100">
              {group.map((row) => (
                <li key={row.stakeholderId} data-plan-state={row.stepState} className="py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(row.stakeholderId)}
                        className="text-left text-sm font-medium text-slate-900 hover:underline"
                      >
                        {row.fullName}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                        <Pill className={stanceStyle(row.stance)}>
                          {stanceLabel(row.stance, language)}
                        </Pill>
                        <span className="font-mono">
                          {row.influence} · {row.interest}
                        </span>
                      </div>
                    </div>
                    <Pill className={stepStateStyle(row.stepState)}>
                      {row.daysToStep === null
                        ? stepStateLabel(row.stepState, language)
                        : tr
                          ? `${row.daysToStep} gün`
                          : `${row.daysToStep} days`}
                    </Pill>
                  </div>

                  {row.objective !== null && (
                    <p className="mt-1 text-sm text-slate-700">{row.objective}</p>
                  )}
                  {row.planId !== null && row.message === null && (
                    <p className="mt-1 text-sm text-amber-700">
                      {tr ? 'Mesaj kayıtlı değil.' : 'No message recorded.'}
                    </p>
                  )}
                  {row.message !== null && (
                    <p className="mt-1 text-sm text-slate-500">“{row.message}”</p>
                  )}
                  {row.nextStep !== null && (
                    <p className="mt-1 text-sm text-slate-700">
                      {row.nextStep}
                      {' — '}
                      {row.nextStepOwnerName ??
                        (tr ? 'sorumlusu görülemiyor' : 'owner not visible')}
                      {', '}
                      {row.nextStepDue}
                    </p>
                  )}

                  {row.canPlan && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {row.planId === null ? (
                        <ActionButton onClick={() => setWritingFor(row.stakeholderId)}>
                          {tr ? 'Plan yaz' : 'Write a plan'}
                        </ActionButton>
                      ) : (
                        <ActionButton onClick={() => setClosing(row)}>
                          {tr ? 'Planı kapat' : 'Close the plan'}
                        </ActionButton>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {writingFor !== null && (
        <PlanForm
          stakeholderId={writingFor}
          people={(profiles.data ?? []).map((p) => ({ id: p.id, name: p.fullName }))}
          pending={save.isPending}
          error={save.error}
          onCancel={() => setWritingFor(null)}
          onSave={(input) => {
            save.mutate(
              { stakeholderId: writingFor, ...input },
              { onSuccess: () => setWritingFor(null) },
            );
          }}
        />
      )}

      {closing !== null && closing.planId !== null && (
        <CloseForm
          name={closing.fullName}
          pending={close.isPending}
          error={close.error}
          onCancel={() => setClosing(null)}
          onClose={(status, note) => {
            close.mutate(
              { id: closing.planId as string, status, closedNote: note },
              { onSuccess: () => setClosing(null) },
            );
          }}
        />
      )}
    </section>
  );
};

/**
 * Plan formu.
 *
 * Sıradaki adımın üç alanı bir arada, ve BOŞ BIRAKILABİLİR: amacı yazılmış
 * ama hamlesi kararlaşmamış bir plan gerçek bir hâl. Üçünden birini
 * doldurup ötekileri bırakmak ise reddediliyor — ve reddi veritabanı
 * veriyor, bu form değil.
 */
const PlanForm: React.FC<{
  stakeholderId: string;
  people: { id: string; name: string }[];
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (input: {
    objective: string;
    message: string | null;
    nextStep: string | null;
    nextStepOwner: string | null;
    nextStepDue: string | null;
  }) => void;
}> = ({ people, pending, error, onCancel, onSave }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [objective, setObjective] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');

  const blank = (s: string) => (s.trim() === '' ? null : s.trim());

  return (
    <form
      className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          objective: objective.trim(),
          message: blank(message),
          nextStep: blank(step),
          nextStepOwner: blank(owner),
          nextStepDue: blank(due),
        });
      }}
    >
      <Field label={tr ? 'Ne istiyoruz' : 'What we want'}>
        <TextInput value={objective} onChange={(e) => setObjective(e.target.value)} required />
      </Field>
      <Field label={tr ? 'Hangi mesajı veriyoruz' : 'The message we give'}>
        <TextInput value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <p className="text-sm text-slate-600">
        {tr
          ? 'Sıradaki adım üç parça birlikte kaydedilir: metin, sorumlu ve tarih. Üçü de boş bırakılabilir; biri eksik bırakılamaz.'
          : 'A next step is recorded as three parts together: the step, an owner and a date. All three may be left empty; one of them cannot.'}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label={tr ? 'Sıradaki adım' : 'Next step'}>
          <TextInput value={step} onChange={(e) => setStep(e.target.value)} />
        </Field>
        <Field label={tr ? 'Sorumlu' : 'Owner'}>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{tr ? 'Seçin…' : 'Pick someone…'}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Tarih' : 'Date'}>
          <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <WriteError error={error} />
      <div className="flex flex-wrap gap-1">
        <ActionButton tone="primary" type="submit" disabled={pending}>
          {tr ? 'Planı kaydet' : 'Save the plan'}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
      </div>
    </form>
  );
};

/** Kapanış: bir sonuç ve bir not, ikisi birlikte. */
const CloseForm: React.FC<{
  name: string;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onClose: (status: EngagementPlanStatus, note: string) => void;
}> = ({ name, pending, error, onCancel, onClose }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [status, setStatus] = useState<EngagementPlanStatus>('achieved');
  const [note, setNote] = useState('');

  return (
    <form
      className="space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onClose(status, note.trim());
      }}
    >
      <p className="text-sm font-medium text-slate-900">
        {tr ? `${name} için planı kapat` : `Close the plan for ${name}`}
      </p>
      <Field label={tr ? 'Sonuç' : 'Outcome'}>
        <Select value={status} onChange={(e) => setStatus(e.target.value as EngagementPlanStatus)}>
          {ENGAGEMENT_OUTCOMES.map((s) => (
            <option key={s} value={s}>
              {planStatusLabel(s, language)}
            </option>
          ))}
        </Select>
      </Field>
      {/* "Sonucu kayıtlı değil"in NEDEN bir seçenek olduğunu anlatan cümle
          KESİLDİ: seçeneğin kendi adı onu söylüyor. Gerekçesi göçün
          yorumunda duruyor, ekranda durmasına gerek yok. */}
      <Field label={tr ? 'Not (zorunlu)' : 'Note (required)'}>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} required />
      </Field>
      <WriteError error={error} />
      <div className="flex flex-wrap gap-1">
        <ActionButton tone="primary" type="submit" disabled={pending}>
          {tr ? 'Kapat' : 'Close it'}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
      </div>
    </form>
  );
};
