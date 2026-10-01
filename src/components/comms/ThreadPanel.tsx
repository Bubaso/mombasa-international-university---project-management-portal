/**
 * Threads and messages (M11-01 … M11-05, M11-11).
 *
 * The screen this replaces could not save a reply. It read a `messages`
 * JSONB column that 0002 removed, appended to the array in the browser and
 * wrote the whole thing back — which loses a message whenever two people
 * reply at once — and signed every one of them 'Current User'. Both are P0
 * rows in the requirement because both were live.
 *
 * Here a message is a row, the sender is the session, and the database
 * refuses anything else. Three things the layout makes visible because they
 * are rules rather than decoration:
 *
 *   a channel you are not in       its threads are simply not there
 *   a thread about a case          visible only to those who may see the case
 *   an announcement                one-way; you acknowledge it, you do not reply
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleCheck,
  Lock,
  Megaphone,
  MessageSquare,
  Paperclip,
  Plus,
  Scale,
  Send,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  useAcknowledgeAnnouncement,
  useCloseThread,
  useMessageAttachments,
  useMessageReactions,
  useMessages,
  usePostMessage,
  useReact,
  useStartThread,
  useThreads,
} from '../../api/commsHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { CHANNELS, channelName } from '../../lib/comms';
import { formatDate } from '../../lib/site';
import { useAuth } from '../../context/AuthContext';
import type { CommChannel, MessageReaction, ThreadKind } from '../../types';

/**
 * The four tokens a reaction may be. Not free text: a reaction that can
 * hold a sentence is a reply with no author line (M11-13).
 */
const REACTION_WORDS: Record<MessageReaction['reaction'], { tr: string; en: string }> = {
  agree: { tr: 'katılıyorum', en: 'agree' },
  disagree: { tr: 'katılmıyorum', en: 'disagree' },
  seen: { tr: 'gördüm', en: 'seen' },
  question: { tr: 'sorum var', en: 'a question' },
};

export const ThreadPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const threads = useThreads();
  const start = useStartThread();
  const post = usePostMessage();
  const close = useCloseThread();
  const acknowledge = useAcknowledgeAnnouncement();

  const [channel, setChannel] = useState<CommChannel | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    channel: CommChannel;
    kind: ThreadKind;
    urgent: boolean;
    firstMessage: string;
  }>({
    title: '',
    channel: 'general',
    kind: 'discussion',
    urgent: false,
    firstMessage: '',
  });

  const all = threads.data ?? [];
  const shown = channel === 'all' ? all : all.filter((t) => t.channel === channel);
  const open = all.find((t) => t.id === openId) ?? shown[0] ?? null;
  const { user } = useAuth();
  const messages = useMessages(open?.id ?? null);
  const reactions = useMessageReactions(open?.id ?? null);
  const attachments = useMessageAttachments(open?.id ?? null);
  const react = useReact();
  const reactionsFor = (id: string) =>
    (reactions.data ?? []).filter((r) => r.threadMessageId === id);
  const attachmentsFor = (id: string) =>
    (attachments.data ?? []).filter((a) => a.threadMessageId === id);

  // The channels this person is actually in. A channel with no threads they
  // can see is indistinguishable from a channel they are not in, which is
  // deliberate: the portal does not advertise rooms you cannot enter.
  const present = new Set(all.map((t) => t.channel));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {tr ? 'Konular ve duyurular' : 'Threads and announcements'}
            </h2>
            <p className="max-w-2xl text-[11px] text-slate-500">
              {tr
                ? 'Portal resmî kayıt, WhatsApp günlük konuşma. Burada yazılan değiştirilemez ve kimin yazdığı oturumdan gelir — adı elle girilmez.'
                : 'The portal is the record and WhatsApp is the conversation. What is written here cannot be edited, and who wrote it comes from the session rather than from a name typed in.'}
            </p>
          </div>
        </div>
        {!starting && (
          <ActionButton onClick={() => setStarting(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {tr ? 'Konu aç' : 'Start a thread'}
          </ActionButton>
        )}
      </header>

      {starting && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.title.trim()) return;
            start.mutate(
              {
                title: form.title,
                channel: form.channel,
                kind: form.kind,
                urgent: form.urgent,
                firstMessage: form.firstMessage,
              },
              {
                onSuccess: (id) => {
                  setOpenId(id);
                  setStarting(false);
                  setForm({
                    title: '',
                    channel: 'general',
                    kind: 'discussion',
                    urgent: false,
                    firstMessage: '',
                  });
                },
              },
            );
          }}
          className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3"
        >
          <Field label={tr ? 'Başlık' : 'Title'} className="sm:col-span-2">
            <TextInput
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Kanal' : 'Channel'}>
            <Select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value as CommChannel })}
            >
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {tr ? c.tr : c.en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Türü' : 'Kind'}>
            <Select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as ThreadKind })}
            >
              <option value="discussion">
                {tr ? 'Tartışma (çift yönlü)' : 'Discussion (two-way)'}
              </option>
              <option value="announcement">
                {tr ? 'Duyuru (tek yönlü)' : 'Announcement (one-way)'}
              </option>
            </Select>
          </Field>
          <Field label={tr ? 'İlk mesaj' : 'First message'} className="sm:col-span-2">
            <TextInput
              value={form.firstMessage}
              onChange={(e) => setForm({ ...form, firstMessage: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <label className="flex items-center gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={form.urgent}
                onChange={(e) => setForm({ ...form, urgent: e.target.checked })}
              />
              {tr ? 'Acil — kimin gördüğü kaydedilsin' : 'Urgent — record who has seen it'}
            </label>
            <ActionButton type="submit" disabled={start.isPending}>
              {tr ? 'Aç' : 'Start it'}
            </ActionButton>
            <button
              type="button"
              onClick={() => setStarting(false)}
              className="cursor-pointer text-[11px] text-slate-500 underline"
            >
              {tr ? 'vazgeç' : 'cancel'}
            </button>
            <div className="flex-1">
              <WriteError error={start.error} />
            </div>
          </div>
          {form.kind === 'announcement' && (
            <p className="sm:col-span-3 text-[11px] text-amber-800">
              {tr
                ? 'Duyuruya cevap yazılamaz — tek yönlüdür. Okuyanlar “gördüm” der ve bu kayda geçer.'
                : 'An announcement cannot be replied to; it is one-way. Readers acknowledge it, and that is recorded.'}
            </p>
          )}
        </form>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setChannel('all')}
          className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] ${
            channel === 'all'
              ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {tr ? 'Hepsi' : 'All'}
        </button>
        {CHANNELS.filter((c) => present.has(c.key)).map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChannel(c.key)}
            className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] ${
              channel === c.key
                ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {tr ? c.tr : c.en}
          </button>
        ))}
      </div>

      <QueryStatus queries={[threads]} />

      {all.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {tr
            ? 'Görebildiğiniz bir konu yok. Kanal üyeliği rolünüzden gelir; bir kanaldaki konuşmaya katılmanız gerekiyorsa sizi adınızla eklemek gerekir.'
            : 'There is no thread you can see. Channel membership follows your role; if you need to be in one of these conversations, somebody has to add you by name.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
            {shown.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className={`w-full cursor-pointer rounded-lg border p-2 text-left ${
                    open?.id === t.id
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {t.kind === 'announcement' ? (
                      <Megaphone
                        className="h-3.5 w-3.5 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <MessageSquare
                        className="h-3.5 w-3.5 shrink-0 text-slate-400"
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900">
                      {t.title}
                    </span>
                    {t.urgent && (
                      <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                        {tr ? 'acil' : 'urgent'}
                      </Pill>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <span>{channelName(t.channel, tr)}</span>
                    <span>·</span>
                    <span>
                      {t.messages} {tr ? 'mesaj' : t.messages === 1 ? 'message' : 'messages'}
                    </span>
                    {t.lastSpeaker && (
                      <>
                        <span>·</span>
                        <span className="truncate">{t.lastSpeaker}</span>
                      </>
                    )}
                    {t.closedAt && (
                      <Pill className="border-slate-300 bg-slate-100 text-slate-600">
                        {tr ? 'kapandı' : 'closed'}
                      </Pill>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {open && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-900">{open.title}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" aria-hidden="true" />
                      {channelName(open.channel, tr)}
                    </span>
                    {open.startedBy && <span>{open.startedBy}</span>}
                    <span>{formatDate(open.createdAt, language)}</span>
                    {open.confidentiality !== 'internal' && (
                      <span className="flex items-center gap-1">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        {open.confidentiality}
                      </span>
                    )}
                    {/* M11-05: the register this conversation hangs on. */}
                    {open.legalCaseId && (
                      <Link
                        to="/legal"
                        className="flex items-center gap-1 text-indigo-700 hover:underline"
                      >
                        <Scale className="h-3 w-3" aria-hidden="true" />
                        {tr ? 'bağlı dava' : 'on a case file'}
                      </Link>
                    )}
                  </div>
                </div>
                {!open.closedAt && open.kind === 'discussion' && (
                  <button
                    type="button"
                    onClick={() => close.mutate(open.id)}
                    className="cursor-pointer text-[11px] text-slate-500 underline"
                  >
                    {tr ? 'konuyu kapat' : 'close the thread'}
                  </button>
                )}
              </header>

              <QueryStatus queries={[messages]} />

              <ul className="mb-2 max-h-72 space-y-2 overflow-y-auto">
                {(messages.data ?? []).map((m) => (
                  <li key={m.id} className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[11px] font-semibold text-slate-800">
                        {/* Never a typed-in name: this comes from the row's
                            sender, which the database pins to the caller. */}
                        {m.senderName ?? (tr ? '(bilinmeyen kişi)' : '(unknown)')}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {formatDate(m.createdAt, language)}
                      </span>
                    </div>
                    {/* M11-13. The quotation is read from the original row,
                        under this reader's own clearance, so it cannot
                        misquote and cannot carry words out of the tier they
                        were written at. */}
                    {m.quotedMessageId != null && (
                      <p className="mt-0.5 border-l-2 border-slate-300 pl-2 text-[11px] text-slate-600">
                        {m.quotedMessageNotReadable ? (
                          <span className="italic">
                            {tr
                              ? 'Alıntılanan mesajı okuma yetkiniz yok — metni gösterilmiyor.'
                              : 'You may not read the quoted message — its words are not shown.'}
                          </span>
                        ) : (
                          <>
                            <span className="font-medium">{m.quotedSenderName ?? '—'}: </span>
                            {m.quotedBody}
                          </>
                        )}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs whitespace-pre-wrap text-slate-800">{m.body}</p>

                    {/* The files on it are vault documents, so what a reader
                        is shown here is what the vault lets them read. */}
                    {attachmentsFor(m.id).length > 0 && (
                      <ul className="mt-0.5 space-y-0.5">
                        {attachmentsFor(m.id).map((a) => (
                          <li
                            key={a.documentId}
                            className="flex items-center gap-1.5 text-[11px] text-slate-600"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {a.documentTitle ?? (tr ? '(kasadaki belge)' : '(a vault document)')}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* A reaction count comes with the names: an anonymous
                        count on a thread where decisions get taken is a vote
                        nobody can audit. */}
                    {reactionsFor(m.id).length > 0 && (
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-600">
                        {reactionsFor(m.id).map((r) => (
                          <span key={r.reaction}>
                            {REACTION_WORDS[r.reaction][tr ? 'tr' : 'en']} {r.people} ·{' '}
                            <span className="text-slate-500">{r.who.join(', ')}</span>
                          </span>
                        ))}
                      </p>
                    )}
                    {user != null && open.kind === 'discussion' && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(Object.keys(REACTION_WORDS) as MessageReaction['reaction'][]).map(
                          (option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() =>
                                react.mutate({
                                  threadMessageId: m.id,
                                  profileId: user.id,
                                  reaction: option,
                                })
                              }
                              className="cursor-pointer rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                            >
                              {REACTION_WORDS[option][tr ? 'tr' : 'en']}
                            </button>
                          ),
                        )}
                        <span className="text-[10px] text-slate-400">
                          {tr
                            ? '— tepki bir tutum kaydı değil; tutum paydaş kütüğünde durur'
                            : '— a reaction is not a recorded position; stance lives in the stakeholder register'}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
                {(messages.data ?? []).length === 0 && (
                  <li className="text-[11px] text-slate-500">
                    {tr ? 'Henüz mesaj yok.' : 'Nothing has been said yet.'}
                  </li>
                )}
              </ul>

              {open.kind === 'announcement' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <p className="text-[11px] text-amber-900">
                    {tr
                      ? 'Bu bir duyuru — cevap yazılamaz. Gördüğünüzü işaretlemek kayda geçer ve duyuruyu yapan kimin gördüğünü görür.'
                      : 'This is an announcement; it cannot be replied to. Marking it seen is recorded, and whoever made it can see who has.'}
                  </p>
                  {open.seenByMe ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr ? 'gördüm olarak işaretlendi' : 'marked as seen'}
                    </p>
                  ) : (
                    <ActionButton
                      onClick={() => acknowledge.mutate(open.id)}
                      disabled={acknowledge.isPending}
                      className="mt-1"
                    >
                      {tr ? 'Gördüm' : 'I have seen this'}
                    </ActionButton>
                  )}
                  <WriteError error={acknowledge.error} />
                </div>
              ) : open.closedAt ? (
                <p className="text-[11px] text-slate-500">
                  {tr
                    ? 'Konu kapatıldı. Kapatılan bir konu silinmez — yazılanlar kayıtta kalır.'
                    : 'The thread is closed. Closing is not deleting: what was said stays on the record.'}
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!reply.trim()) return;
                    post.mutate(
                      { threadId: open.id, body: reply },
                      { onSuccess: () => setReply('') },
                    );
                  }}
                  className="flex flex-wrap items-end gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <TextInput
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={tr ? 'Cevabınız…' : 'Your reply…'}
                    />
                  </div>
                  <ActionButton type="submit" disabled={post.isPending}>
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr ? 'Gönder' : 'Send'}
                  </ActionButton>
                  <div className="w-full">
                    <WriteError error={post.error} />
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
