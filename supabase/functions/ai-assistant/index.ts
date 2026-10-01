/**
 * The assistant, server side (M13-01 … M13-10).
 *
 * What this replaces. The browser used to hold the Gemini key, send a raw
 * JSON blob of whatever was on screen as "context", and supply its own system
 * instruction. Three separate problems in one call: the key was published to
 * anyone who opened the bundle, the context had no notion of confidentiality,
 * and the instruction was whatever the client said it was — so there was no
 * such thing as a defined use.
 *
 * The shape here is the fix, and the shape is the point:
 *
 *   * The client sends a TASK NAME, not a prompt (M13-07). The five tasks are
 *     the five the requirement allows and there is no sixth. The system
 *     instruction for each lives here.
 *
 *   * The client sends NO CONTEXT. Retrieval happens here, through the
 *     caller's own token, so the policies on nineteen registers decide what
 *     the model may read (M13-02) — and through ai_context / ai_digest_context,
 *     which exclude `restricted` whoever is asking (M13-03).
 *
 *   * NO SOURCES, NO ANSWER (M13-04). A retrieval task with nothing to stand
 *     on is refused before the model is called, and an answer that comes back
 *     without a citation this function can match to a supplied record is
 *     rejected rather than shown.
 *
 *   * NO LEGAL OPINION (M13-08). Asked for one, this refuses and hands back
 *     the opinions actually on record instead.
 *
 *   * Everything generated is labelled a draft needing human approval
 *     (M13-08), by this function, in code — not by asking the model to
 *     remember.
 *
 *   * Nothing here writes to a register (M13-09). The only row it writes is
 *     its own usage log (M13-10).
 *
 * Configuration:
 *   supabase secrets set GEMINI_API_KEY=...
 *   supabase functions deploy ai-assistant
 * and point the client at it with VITE_AI_PROXY_URL.
 */

// The decisions — which five tasks exist, what each is instructed to do, what
// counts as asking for a legal opinion, what counts as a citation — live in
// rules.js next door, imported by this function and by tests/assistant.mjs.
// A rule that decides whether a model is called at all deserves a test, and
// this file cannot have one: it calls Deno.serve on import.
import {
  DRAFT_LABEL_EN,
  DRAFT_LABEL_TR,
  HOUSE_RULES,
  TASKS,
  asksForLegalAdvice,
  citesAnySource,
  labelled,
  marker,
} from './rules.js';

type TaskName = keyof typeof TASKS;

const MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Retrieval, through the caller's own token
// ---------------------------------------------------------------------------

interface SourceRow {
  kind: string;
  id: string;
  title_en: string | null;
  title_tr: string | null;
  subtitle: string | null;
  body?: string | null;
  detail?: string | null;
  occurred_on?: string | null;
  due_on?: string | null;
  state?: string | null;
  needs_attention?: boolean | null;
  confidentiality: string;
  source?: string;
}

/**
 * Calls a database function as the person who made the request.
 *
 * PostgREST applies row level security to the token in the Authorization
 * header, so this cannot read anything the caller could not read themselves —
 * which is M13-02, and it is the database enforcing it rather than this file
 * promising to.
 */
async function callAs<T>(
  authorization: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authorization,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    console.error(`${fn} failed`, res.status, await res.text());
    throw new Error('retrieval failed');
  }
  return (await res.json()) as T[];
}

/** The usage log (M13-10). A failure here never fails the request. */
async function record(
  authorization: string,
  row: { task: string; question: string; source_count: number; refusal?: string },
): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_queries`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: authorization,
        'content-type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...row, model: MODEL }),
    });
    if (!res.ok) console.warn('usage not logged', res.status, await res.text());
  } catch (error) {
    console.warn('usage not logged', error);
  }
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function renderSource(row: SourceRow): string {
  const title = row.title_en ?? row.title_tr ?? '(untitled)';
  const other =
    row.title_en && row.title_tr && row.title_en !== row.title_tr
      ? `\nAlso titled: ${row.title_tr}`
      : '';
  const when = row.occurred_on ?? row.due_on;
  return [
    `--- ${marker(row)}`,
    `Register: ${row.kind}`,
    `Title: ${title}${other}`,
    row.subtitle ? `Context: ${row.subtitle}` : '',
    when ? `Date: ${when}` : '',
    `Classification: ${row.confidentiality}`,
    row.body ? `Text:\n${row.body}` : '',
    row.detail ? `Detail: ${row.detail}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

/** What the client shows under an answer, so it can link each citation. */
function citable(rows: SourceRow[]) {
  return rows.map((row) => ({
    marker: marker(row),
    kind: row.kind,
    id: row.id,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    subtitle: row.subtitle,
    confidentiality: row.confidentiality,
  }));
}

// ---------------------------------------------------------------------------

interface AssistantRequest {
  task?: string;
  question?: string;
  /** The material to work on, for the three tasks that transform text. */
  text?: string;
  from?: string;
  to?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // No token, no assistant. Everything the model is shown is read with this
  // header, so without it there is nothing to show and nobody to log.
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Sign in again — the request carried no credentials.' }, 401);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'The assistant is not configured on the server.' }, 503);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'The assistant is not configured on the server.' }, 503);
  }

  let body: AssistantRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  // The closed list, enforced. An unknown task is not a bad prompt to be
  // sanitised; it is a use nobody agreed to.
  const taskName = body.task as TaskName;
  const task = TASKS[taskName];
  if (!task) {
    return json({ error: 'Unknown task.', allowed: Object.keys(TASKS) }, 400);
  }

  const question = (body.question ?? '').trim();
  const supplied = (body.text ?? '').trim();

  if (task.takesText && supplied.length < 20) {
    return json({ error: 'Paste the text to work on first.' }, 400);
  }
  if (!task.takesText && question.length < 3) {
    return json({ error: 'A question is required.' }, 400);
  }

  // Keep a lid on the prompt. 40,000 characters is a long document and well
  // inside the model's window; beyond that somebody is pasting a file.
  if (supplied.length > 40000) {
    return json({ error: 'That text is too long. Send it in sections.' }, 413);
  }

  // --- M13-08. The refusal happens before the model is reached. ------------
  if (asksForLegalAdvice(question)) {
    let opinions: SourceRow[] = [];
    try {
      opinions = await callAs<SourceRow>(authorization, 'search_records', {
        p_query: question,
        p_kinds: ['legal_opinion'],
        p_limit: 5,
      });
    } catch {
      opinions = [];
    }
    const refusal =
      'The assistant does not give legal opinions. Asked for one, it points at ' +
      'the opinions on record instead.';
    await record(authorization, {
      task: taskName,
      question,
      source_count: opinions.length,
      refusal,
    });
    return json({
      refused: 'legal_advice',
      messageEn:
        'This is a question for the project advocate, not for the assistant. ' +
        (opinions.length
          ? 'The opinions on record that mention it are listed below.'
          : 'No recorded opinion mentions it, so there is nothing to point you at.'),
      messageTr:
        'Bu, asistanın değil proje avukatının cevaplayacağı bir soru. ' +
        (opinions.length
          ? 'Konuyla ilgili kayıtlı görüşler aşağıda.'
          : 'Konuyla ilgili kayıtlı bir görüş yok, dolayısıyla yönlendirebileceğim bir kayıt da yok.'),
      sources: citable(opinions),
    });
  }

  // --- Retrieval (M13-02, M13-03) ------------------------------------------
  let sources: SourceRow[] = [];
  if (task.retrieval === 'question') {
    try {
      sources = await callAs<SourceRow>(authorization, 'ai_context', {
        p_query: question,
        p_limit: 10,
      });
    } catch {
      return json({ error: 'Could not read the archive. Sign in again.' }, 502);
    }
  } else if (task.retrieval === 'digest') {
    try {
      sources = await callAs<SourceRow>(authorization, 'ai_digest_context', {
        p_from: body.from ?? null,
        p_to: body.to ?? null,
      });
    } catch {
      return json({ error: 'Could not read the archive. Sign in again.' }, 502);
    }
  }

  // --- M13-04. No sources, no answer. --------------------------------------
  if (task.retrieval !== 'none' && sources.length === 0) {
    const refusal = 'Nothing in the archive that this caller may read matches.';
    await record(authorization, {
      task: taskName,
      question,
      source_count: 0,
      refusal,
    });
    return json({
      refused: 'no_sources',
      messageEn:
        'Nothing in the archive that you can read matches that, so there is ' +
        'nothing to answer from. An answer without sources is not produced.',
      messageTr:
        'Görmeye yetkili olduğunuz kayıtlar arasında buna uyan bir şey yok, ' +
        'dolayısıyla dayanacak bir kaynak da yok. Kaynaksız cevap üretilmiyor.',
      sources: [],
    });
  }

  const prompt = [
    HOUSE_RULES,
    '',
    task.instruction,
    '',
    sources.length ? '--- RECORDS ---' : '',
    sources.length ? sources.map(renderSource).join('\n\n') : '',
    supplied ? '--- TEXT ---' : '',
    supplied,
    question ? '--- QUESTION ---' : '',
    question,
  ]
    .filter((part) => part !== '')
    .join('\n');

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
  } catch (error) {
    console.error('Upstream request failed', error);
    return json({ error: 'Could not reach the model provider.' }, 502);
  }

  if (!upstream.ok) {
    // Never pass the upstream body through: it can echo key or quota detail.
    console.error('Model provider returned', upstream.status, await upstream.text());
    return json({ error: 'The model provider rejected the request.' }, 502);
  }

  const data = await upstream.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || !text.trim()) {
    return json({ error: 'The model returned no answer.' }, 502);
  }

  // --- M13-04, enforced rather than requested ------------------------------
  //
  // The instruction says cite everything. This checks. An answer about
  // retrieved records that cites none of them is not a worse answer, it is an
  // answer that is no longer connected to the archive, and showing it is how
  // a portal starts quoting itself.
  if (task.retrieval !== 'none') {
    if (!citesAnySource(text, sources)) {
      const refusal = 'The model answered without citing any supplied record.';
      await record(authorization, {
        task: taskName,
        question,
        source_count: sources.length,
        refusal,
      });
      return json({
        refused: 'uncited',
        messageEn:
          'The assistant produced an answer that did not cite any record, so ' +
          'it has been discarded. Try asking more narrowly.',
        messageTr:
          'Asistan hiçbir kayda dayanmayan bir cevap üretti ve bu cevap ' +
          'atıldı. Soruyu daha dar sormayı deneyin.',
        sources: citable(sources),
      });
    }
  }

  await record(authorization, {
    task: taskName,
    question: question || `(${taskName})`,
    source_count: sources.length,
  });

  return json({
    // M13-08: the label is added here, not asked for.
    text: labelled(text),
    draft: true,
    labelEn: DRAFT_LABEL_EN,
    labelTr: DRAFT_LABEL_TR,
    // M13-04: what the answer stands on, for the client to render as links.
    sources: citable(sources),
    task: taskName,
  });
});
