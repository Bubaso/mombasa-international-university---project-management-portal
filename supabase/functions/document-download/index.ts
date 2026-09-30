/**
 * Hands out a short-lived link to a document, and records that it did (M9-07).
 *
 * This exists so the access log cannot be declined. The documents bucket has
 * no select policy for `authenticated`, so a browser cannot reach the bytes
 * on its own; the only route is through here, and every route through here
 * writes a row in document_access — which `authenticated` cannot write, edit
 * or delete.
 *
 * The requirement makes the log mandatory for confidential material and
 * above. It is written for everything: a rule that applies sometimes is a
 * rule somebody has to remember, and the cost of always is a row.
 *
 * Authorisation is not this function's opinion. It asks for the version with
 * the caller's own token first, under row level security; if the policies do
 * not return it, there is nothing to sign.
 *
 * Deploy:
 *   supabase functions deploy document-download
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Long enough to fetch, short enough that a copied link is not a back door. */
const LINK_SECONDS = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    return json({ error: 'The download function is not configured on the server.' }, 503);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  let body: { versionId?: string; action?: 'viewed' | 'downloaded' };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const versionId = body.versionId;
  const action = body.action === 'viewed' ? 'viewed' : 'downloaded';
  if (!versionId) return json({ error: 'A version id is required.' }, 400);

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: caller } = await asCaller.auth.getUser();
  if (!caller?.user) return json({ error: 'Not signed in.' }, 401);

  // The policies decide. If this returns nothing, either the version does not
  // exist or it is not theirs — and the answer is the same either way, so the
  // function does not say which.
  const { data: version } = await asCaller
    .from('document_versions')
    .select('id, document_id, storage_path, file_name, sha256')
    .eq('id', versionId)
    .maybeSingle();

  if (!version) return json({ error: 'No such version, or it is not yours to see.' }, 404);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Logged before the link is issued. If the signing fails afterwards the log
  // has an extra row, which is the harmless direction to be wrong in; the
  // other order can hand out a file that nothing recorded.
  const { error: logError } = await admin.from('document_access').insert({
    document_id: version.document_id,
    version_id: version.id,
    profile_id: caller.user.id,
    action,
  });

  if (logError) {
    console.error('Could not record the access', logError);
    return json({ error: 'Could not record this access, so the file was not released.' }, 500);
  }

  const { data: signed, error: signError } = await admin.storage
    .from('documents')
    .createSignedUrl(version.storage_path, LINK_SECONDS, {
      download: action === 'downloaded' ? version.file_name : undefined,
    });

  if (signError || !signed) {
    console.error('Could not sign the URL', signError);
    return json({ error: signError?.message ?? 'Could not produce a link.' }, 500);
  }

  return json({
    url: signed.signedUrl,
    expiresInSeconds: LINK_SECONDS,
    fileName: version.file_name,
    // Passed back so the reader can check what they received against what the
    // server computed, rather than being told it matches.
    sha256: version.sha256,
  });
});
