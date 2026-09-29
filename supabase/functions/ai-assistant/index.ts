/**
 * Server-side proxy for the contextual AI assistant.
 *
 * The browser used to hold the Gemini API key and call the model directly,
 * which publishes the key to anyone who opens the bundle. The key now lives
 * only here, as a function secret:
 *
 *   supabase secrets set GEMINI_API_KEY=...
 *   supabase functions deploy ai-assistant
 *
 * Then point the client at it with VITE_AI_PROXY_URL.
 *
 * Scope note: this proxy does not yet check who is asking or what they are
 * allowed to see. Requirements M13-02 and M13-03 require retrieval to be
 * filtered by the caller's clearance, and records classified `restricted`
 * to be kept out of the model's reach entirely. Until that lands, the client
 * sends only what is already on the user's screen, and the assistant must not
 * be given access to anything broader.
 */

const MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AssistantRequest {
  systemInstruction?: string;
  contextData?: string;
  question?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return json({ error: 'The assistant is not configured on the server.' }, 503);
  }

  let body: AssistantRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const question = body.question?.trim();
  if (!question) {
    return json({ error: 'A question is required.' }, 400);
  }

  const prompt = [
    body.systemInstruction?.trim(),
    'Answer only from the data below. If it does not contain the answer, say so plainly.',
    '--- DATA ---',
    body.contextData ?? '(none)',
    '--- QUESTION ---',
    question,
  ]
    .filter(Boolean)
    .join('\n\n');

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

  if (!text) {
    return json({ error: 'The model returned no answer.' }, 502);
  }

  return json({ text });
});
