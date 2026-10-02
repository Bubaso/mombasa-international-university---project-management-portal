/**
 * The assistant, with its limits on the screen (M13-07, M13-04, M13-08, M13-09).
 *
 * The screen is shaped by the requirement rather than by what a chat window
 * usually looks like, and the differences are the point:
 *
 *   * There is no free chat box. There are five jobs, because M13-07 names
 *     five, and picking one is how you talk to it. A sixth is not reachable
 *     from here and is refused by the server if asked for anyway.
 *
 *   * Every answer arrives labelled a draft needing human approval, and the
 *     label comes from the server, in code — not from the model remembering
 *     to add it.
 *
 *   * Every answer carries the records it rests on, and the citations in the
 *     text are links to them. An answer that cited nothing never reaches this
 *     screen: the function discards it.
 *
 *   * There is no save button, and that is M13-09. The output can be copied;
 *     putting it into a record is a person's act, on the screen that owns
 *     that record, where it will carry their name.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpenText,
  Bot,
  Check,
  CircleAlert,
  ClipboardCopy,
  FileText,
  Languages,
  Loader2,
  ScrollText,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAsk, useAiQueries } from '../api/assistantHooks';
import { assistantConfigured } from '../api/assistant';
import { QueryStatus } from '../components/QueryStatus';
import { TranslationPanel } from '../components/assistant/TranslationPanel';
import { Pill, WriteError } from '../components/ui/Controls';
import { kindLabel, routeFor } from '../lib/search';
import { formatDate } from '../lib/site';
import type { AiAnswer, AiTask, Confidentiality, SearchKind } from '../types';

interface TaskShape {
  icon: React.ElementType;
  titleTr: string;
  titleEn: string;
  whyTr: string;
  whyEn: string;
  /** Does it read the archive, or work on text the person pastes in? */
  needs: 'question' | 'text' | 'window';
  placeholderTr: string;
  placeholderEn: string;
}

const TASKS: Record<AiTask, TaskShape> = {
  archive_question: {
    icon: BookOpenText,
    titleTr: 'Arşive soru sor',
    titleEn: 'Ask the archive',
    whyTr: 'On yıllık kaydın içinde ne yazdığını sorar. Cevap, dayandığı kayıtları gösterir.',
    whyEn: 'Asks what the ten-year record says. The answer shows what it rests on.',
    needs: 'question',
    placeholderTr: 'Ruhsat yenilemesi hakkında ne karar verildi?',
    placeholderEn: 'What was decided about renewing the permit?',
  },
  meeting_minutes: {
    icon: ScrollText,
    titleTr: 'Notları tutanağa çevir',
    titleEn: 'Notes into minutes',
    whyTr: 'Ham notları başlıklara ayırır: görüşülenler, kararlar, aksiyonlar, açık sorular.',
    whyEn: 'Sorts rough notes under headings: discussed, decisions, actions, open questions.',
    needs: 'text',
    placeholderTr: 'Toplantıda aldığınız notları buraya yapıştırın…',
    placeholderEn: 'Paste the notes you took in the meeting…',
  },
  translation: {
    icon: Languages,
    titleTr: 'Çeviri önerisi (TR↔EN)',
    titleEn: 'Translation suggestion (TR↔EN)',
    whyTr: 'Dava numaralarını, parsel numaralarını ve tutarları olduğu gibi bırakır.',
    whyEn: 'Leaves case numbers, plot numbers and figures exactly as written.',
    needs: 'text',
    placeholderTr: 'Çevrilecek metni yapıştırın…',
    placeholderEn: 'Paste the text to translate…',
  },
  weekly_digest: {
    icon: FileText,
    titleTr: 'Haftalık özet taslağı',
    titleEn: 'Weekly digest draft',
    whyTr: 'Seçilen aralıkta vadesi gelenler ve karar bekleyenlerden bir not çıkarır.',
    whyEn: 'Drafts a note from what falls due in the window and what is waiting on a decision.',
    needs: 'window',
    placeholderTr: '',
    placeholderEn: '',
  },
  document_summary: {
    icon: BookOpenText,
    titleTr: 'Uzun belge özeti',
    titleEn: 'Long document summary',
    whyTr: 'Kimden ne istendiği ve hangi tarihe kadar — önce onu söyler.',
    whyEn: 'Leads with what it requires of whom and by when.',
    needs: 'text',
    placeholderTr: 'Belgenin metnini yapıştırın…',
    placeholderEn: 'Paste the text of the document…',
  },
};

const TIER: Record<Confidentiality, string> = {
  public: 'border-slate-300 bg-slate-100 text-slate-700',
  internal: 'border-sky-300 bg-sky-50 text-sky-900',
  confidential: 'border-amber-300 bg-amber-50 text-amber-900',
  restricted: 'border-rose-300 bg-rose-50 text-rose-900',
};

/** The marker the server told the model to cite with. */
const CITATION = /(\[[a-z_]+:[0-9a-fA-F-]{36}\])/g;

/**
 * The answer, with its citations turned into links.
 *
 * Rendered as text rather than as markdown on purpose. The citation links
 * have to be injected into the model's output, and doing that through a
 * markdown renderer means trusting generated text as markup in a portal whose
 * whole subject is confidential material. Pre-wrapped text and real anchors
 * is the version with nothing to get wrong.
 */
const Answer: React.FC<{
  answer: AiAnswer;
  onOpen: (kind: SearchKind, id: string) => void;
}> = ({ answer, onOpen }) => {
  const byMarker = new Map(answer.sources.map((s) => [s.marker, s]));
  const parts = (answer.text ?? '').split(CITATION);

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
      {parts.map((part, i) => {
        const source = byMarker.get(part);
        if (!source) return <span key={i}>{part}</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpen(source.kind, source.id)}
            title={source.titleEn ?? source.titleTr ?? undefined}
            className="mx-0.5 cursor-pointer rounded border border-indigo-200 bg-indigo-50 px-1 align-baseline font-mono text-xs text-indigo-800 hover:bg-indigo-100"
          >
            {answer.sources.indexOf(source) + 1}
          </button>
        );
      })}
    </p>
  );
};

export const AssistantView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();

  const [task, setTask] = useState<AiTask>('archive_question');
  const [question, setQuestion] = useState('');
  const [text, setText] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(weekAhead);
  const [copied, setCopied] = useState(false);

  const askIt = useAsk();
  const log = useAiQueries(12);
  const shape = TASKS[task];
  const answer = askIt.data ?? null;

  const ready =
    shape.needs === 'question'
      ? question.trim().length >= 3
      : shape.needs === 'text'
        ? text.trim().length >= 20
        : true;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setCopied(false);
    askIt.mutate({
      task,
      question: shape.needs === 'question' ? question.trim() : undefined,
      text: shape.needs === 'text' ? text.trim() : undefined,
      from: shape.needs === 'window' ? from : undefined,
      to: shape.needs === 'window' ? to : undefined,
    });
  };

  const copy = async () => {
    if (!answer?.text) return;
    try {
      await navigator.clipboard.writeText(answer.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2.5">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">{tr ? 'Asistan' : 'Assistant'}</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            {tr
              ? 'Beş tanımlı iş, fazlası yok. Her cevap dayandığı kayıtları gösterir ve taslak olarak çıkar. Kısıtlı kayıtlar hiçbir koşulda modele gitmez.'
              : 'Five defined jobs and no more. Every answer shows the records it rests on and comes out as a draft. Restricted records never reach the model, under any circumstances.'}
          </p>
        </div>
      </header>

      {!assistantConfigured && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {tr
              ? 'Asistan bu kurulumda yapılandırılmamış. Sunucu tarafı fonksiyon dağıtılıp VITE_AI_PROXY_URL ayarlanmadan çalışmaz — anahtar tarayıcıya hiçbir zaman konmaz (M13-01).'
              : 'The assistant is not configured in this deployment. It does nothing until the server-side function is deployed and VITE_AI_PROXY_URL is set — the key is never put in the browser (M13-01).'}
          </p>
        </div>
      )}

      {/* The five, as a choice rather than a prompt. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(TASKS) as AiTask[]).map((name) => {
          const option = TASKS[name];
          const Icon = option.icon;
          const on = name === task;
          return (
            <button
              key={name}
              type="button"
              onClick={() => {
                setTask(name);
                askIt.reset();
              }}
              aria-pressed={on}
              className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                on
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-4 w-4 shrink-0 ${on ? 'text-indigo-600' : 'text-slate-500'}`}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-slate-900">
                  {tr ? option.titleTr : option.titleEn}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{tr ? option.whyTr : option.whyEn}</p>
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        {shape.needs === 'question' && (
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={tr ? shape.placeholderTr : shape.placeholderEn}
            aria-label={tr ? 'Soru' : 'Question'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        )}

        {shape.needs === 'text' && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={tr ? shape.placeholderTr : shape.placeholderEn}
            aria-label={tr ? 'Metin' : 'Text'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        )}

        {shape.needs === 'window' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">
              {tr ? 'Başlangıç' : 'From'}
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              {tr ? 'Bitiş' : 'To'}
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <p className="text-xs text-slate-500">
              {tr ? `bugün ${formatDate(today, language)}` : `today ${formatDate(today, language)}`}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {tr
              ? 'Sorduğunuz kaydedilir: kim ne sordu, kaç kayda dayandı (M13-10).'
              : 'What you ask is logged: who asked what, and how many records it rested on (M13-10).'}
          </p>
          <button
            type="submit"
            disabled={!ready || askIt.isPending || !assistantConfigured}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {askIt.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {tr ? 'Sor' : 'Ask'}
          </button>
        </div>

        <WriteError error={askIt.error} />
      </form>

      {/* A refusal, which is the assistant working rather than failing. */}
      {answer?.refused && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-amber-900">
                {answer.refused === 'legal_advice'
                  ? tr
                    ? 'Bu soruyu asistan cevaplamaz'
                    : 'Not a question for the assistant'
                  : answer.refused === 'no_sources'
                    ? tr
                      ? 'Dayanacak kayıt yok'
                      : 'Nothing to answer from'
                    : tr
                      ? 'Kaynaksız cevap atıldı'
                      : 'An uncited answer was discarded'}
              </h2>
              <p className="mt-1 text-sm text-amber-900">
                {(tr ? answer.messageTr : answer.messageEn) ?? ''}
              </p>
            </div>
          </div>

          {answer.sources.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {answer.sources.map((source) => (
                <li key={source.marker}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(routeFor({ kind: source.kind, id: source.id, parentId: null }))
                    }
                    className="flex w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-left hover:bg-amber-50"
                  >
                    <span className="text-sm font-medium text-slate-900">
                      {(tr ? source.titleTr : source.titleEn) ?? source.titleEn ?? source.titleTr}
                    </span>
                    <Pill>{kindLabel(source.kind, language)}</Pill>
                    <Pill className={TIER[source.confidentiality]}>{source.confidentiality}</Pill>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {answer?.text && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          {/* M13-08. The server puts this label in the text as well; it is
              repeated here as a banner because a banner is what somebody
              about to paste it into an email will actually see. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-sm font-semibold text-rose-900">
              {tr
                ? 'TASLAK — insan onayı gerekir. Bu metin hiçbir kayda yazılmadı.'
                : 'DRAFT — needs human approval. This text has not been written to any record.'}
            </p>
            <button
              type="button"
              onClick={copy}
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copied ? (tr ? 'kopyalandı' : 'copied') : tr ? 'kopyala' : 'copy'}
            </button>
          </div>

          <Answer
            answer={answer}
            onOpen={(kind, id) => navigate(routeFor({ kind, id, parentId: null }))}
          />

          {answer.sources.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-1.5 text-xs font-semibold tracking-wider text-slate-600 uppercase">
                {tr ? 'Dayandığı kayıtlar' : 'What it rests on'}
              </p>
              <ol className="space-y-1">
                {answer.sources.map((source, i) => (
                  <li key={source.marker} className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-xs text-slate-500">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(routeFor({ kind: source.kind, id: source.id, parentId: null }))
                      }
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <span className="text-sm text-slate-900 hover:underline">
                        {(tr ? source.titleTr : source.titleEn) ??
                          source.titleEn ??
                          source.titleTr ??
                          source.id}
                      </span>
                      <span className="ml-1.5 inline-flex items-center gap-1">
                        <Pill>{kindLabel(source.kind, language)}</Pill>
                        <Pill className={TIER[source.confidentiality]}>
                          {source.confidentiality}
                        </Pill>
                      </span>
                      {source.subtitle && (
                        <span className="block truncate text-xs text-slate-500">
                          {source.subtitle}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            {tr
              ? 'Kaydetme düğmesi yok. Bu metni bir kayda eklemek isteyen kişi ilgili ekranda kendi adıyla ekler (M13-09).'
              : 'There is no save button. Putting this into a record is done on that record’s own screen, under the name of whoever does it (M13-09).'}
          </p>
        </section>
      )}

      {/* The other thing a model produces here, and the one that reaches the
          records rather than the screen. It belongs beside the log for the
          same reason the log exists: generated text that nobody can tell from
          the record is the risk, and both of these are how it is managed. */}
      <TranslationPanel />

      {/* M13-10, shown rather than merely stored. */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-slate-900">
          {tr ? 'Son sorulanlar' : 'Recently asked'}
        </h2>
        <p className="mb-2 text-xs text-slate-500">
          {tr
            ? 'Kendi sorularınız. Yönetici ve denetçiler herkesin sorularını görür — kayıt zaten bunun için var.'
            : 'Your own questions. An administrator and the auditors see everybody’s — that is what the log is for.'}
        </p>
        <QueryStatus queries={[log]} />
        {(log.data ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr ? 'Henüz bir şey sorulmadı.' : 'Nothing has been asked yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(log.data ?? []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-900">{row.question}</p>
                  <p className="text-xs text-slate-500">
                    {[
                      row.askerName,
                      tr ? TASKS[row.task]?.titleTr : TASKS[row.task]?.titleEn,
                      row.refusal
                        ? tr
                          ? 'reddedildi'
                          : 'refused'
                        : tr
                          ? `${row.sourceCount} kayıt`
                          : `${row.sourceCount} records`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-slate-500">
                  {formatDate(row.askedAt, language)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
