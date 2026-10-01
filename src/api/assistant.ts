/**
 * Talking to the assistant (M13-01, M13-04, M13-07, M13-09).
 *
 * Note what this file does not send. There is no system instruction and no
 * context: the old client supplied both, which meant the "defined uses" of
 * M13-07 were whatever the browser felt like asking for, and the model's
 * context was a JSON dump of the screen with no notion of who was allowed to
 * see it.
 *
 * It sends a task name and, for the three tasks that transform text, the text
 * itself. Retrieval happens on the server under the access token below, so
 * the policies decide what the model reads (M13-02) and `restricted` never
 * reaches it at all (M13-03).
 *
 * It also has no write path, and that is M13-09: nothing here can put a
 * generated answer into a register. The screen offers it for copying.
 */
import { supabase } from '../lib/supabase';
import type { AiAnswer, AiSource, AiTask, Confidentiality, SearchKind } from '../types';

const AI_PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL as string | undefined) ?? '';

/** Whether an assistant exists to talk to. Without the proxy, no key, no AI. */
export const assistantConfigured = AI_PROXY_URL.length > 0;

interface ProxyResponse {
  text?: string;
  draft?: boolean;
  refused?: 'legal_advice' | 'no_sources' | 'uncited';
  messageEn?: string;
  messageTr?: string;
  sources?: {
    marker: string;
    kind: SearchKind;
    id: string;
    titleEn: string | null;
    titleTr: string | null;
    subtitle: string | null;
    confidentiality: Confidentiality;
  }[];
  task?: AiTask;
  error?: string;
}

export interface AskInput {
  task: AiTask;
  question?: string;
  /** The material to work on, for minutes, translation and summaries. */
  text?: string;
  from?: string;
  to?: string;
}

export async function ask(input: AskInput): Promise<AiAnswer> {
  if (!assistantConfigured) {
    throw new Error(
      'The assistant is not configured. Set VITE_AI_PROXY_URL to the deployed function.',
    );
  }

  // The caller's own token. This is the whole of M13-02 from the client's
  // side: the server reads the archive with it, so it cannot read anything
  // this person could not read themselves.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again — your session has expired.');

  const response = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

  const payload: ProxyResponse = await response.json().catch(() => ({}) as ProxyResponse);

  // A refusal is not a failure. Being told that nothing in the archive
  // answers the question, or that a legal question belongs with the advocate,
  // is the assistant doing its job and has to reach the screen intact.
  if (payload.refused) {
    return {
      text: null,
      draft: false,
      refused: payload.refused,
      messageEn: payload.messageEn ?? null,
      messageTr: payload.messageTr ?? null,
      sources: (payload.sources ?? []) as AiSource[],
      task: payload.task ?? input.task,
    };
  }

  if (!response.ok || !payload.text) {
    throw new Error(payload.error ?? 'The assistant could not answer.');
  }

  return {
    text: payload.text,
    draft: payload.draft ?? true,
    refused: null,
    messageEn: null,
    messageTr: null,
    sources: (payload.sources ?? []) as AiSource[],
    task: payload.task ?? input.task,
  };
}

// ---------------------------------------------------------------------------
// The usage log (M13-10)
// ---------------------------------------------------------------------------

export interface AiQuery {
  id: string;
  askedBy: string;
  task: AiTask;
  question: string;
  sourceCount: number;
  refusal: string | null;
  model: string | null;
  askedAt: string;
  askerName: string | null;
}

/**
 * Who asked what. Everybody sees their own; an administrator and the auditors
 * see everybody's, which is what the requirement asks the log for. The policy
 * decides that, so this reads the same table either way.
 */
export async function fetchAiQueries(limit = 25): Promise<AiQuery[]> {
  const { data, error } = await supabase
    .from('ai_queries')
    .select(
      'id, asked_by, task, question, source_count, refusal, model, asked_at, ' +
        'asker:profiles!ai_queries_asked_by_fkey(full_name)',
    )
    .order('asked_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (
    (data ?? []) as unknown as {
      id: string;
      asked_by: string;
      task: AiTask;
      question: string;
      source_count: number;
      refusal: string | null;
      model: string | null;
      asked_at: string;
      asker: { full_name: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    askedBy: row.asked_by,
    task: row.task,
    question: row.question,
    sourceCount: row.source_count,
    refusal: row.refusal,
    model: row.model,
    askedAt: row.asked_at,
    askerName: row.asker?.full_name ?? null,
  }));
}
