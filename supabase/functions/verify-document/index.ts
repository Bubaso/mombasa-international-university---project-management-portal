/**
 * Computes a document version's SHA-256 from the bytes that were stored
 * (M9-02).
 *
 * The distinction this function exists for: the digest is computed from what
 * is in the bucket, not from what a browser said it uploaded. A client that
 * sent one file and reported the digest of another would be caught by this,
 * and a client cannot write the column in any case — `authenticated` has no
 * privilege on it, so this function and the service role are the only way a
 * digest ever gets recorded.
 *
 * Until it runs, sha256 is null and the interface says the version is not
 * verified. That is the honest state, and it is the state the old module lied
 * about: it printed "SHA-256 verified" on a screen where no file existed.
 *
 * Deploy:
 *   supabase functions deploy verify-document
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Anything larger is refused rather than read into memory. */
const MAX_BYTES = 50 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    return json({ error: 'The verification function is not configured on the server.' }, 503);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  let body: { versionId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }
  const versionId = body.versionId;
  if (!versionId) return json({ error: 'A version id is required.' }, 400);

  // Who is asking, under row level security and with no elevated key. If the
  // caller cannot see the version, they cannot ask for it to be verified —
  // otherwise this would answer "that document exists" to anybody.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: visible } = await asCaller
    .from('document_versions')
    .select('id, storage_path, sha256')
    .eq('id', versionId)
    .maybeSingle();

  if (!visible) return json({ error: 'No such version, or it is not yours to see.' }, 404);

  // Already computed. A digest is written once and never recomputed into a
  // different answer: if the bytes changed, that is a new version.
  if (visible.sha256) return json({ sha256: visible.sha256, alreadyComputed: true });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: file, error: downloadError } = await admin.storage
    .from('documents')
    .download(visible.storage_path);

  if (downloadError || !file) {
    // The row exists but the bytes do not: the upload failed after the
    // version was registered. Saying so beats leaving it unverified forever
    // with no explanation.
    return json({ error: 'The file for this version is not in storage. Upload it again.' }, 409);
  }

  if (file.size > MAX_BYTES) {
    return json(
      { error: `This file is larger than the ${MAX_BYTES / 1024 / 1024} MB this function reads.` },
      413,
    );
  }

  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = toHex(digest);

  const { error: writeError } = await admin
    .from('document_versions')
    .update({ sha256, digest_computed_at: new Date().toISOString(), byte_size: file.size })
    .eq('id', versionId)
    // Only ever fills in a missing digest. Two calls racing cannot overwrite
    // one another, and nothing can rewrite one that is already recorded.
    .is('sha256', null);

  if (writeError) {
    console.error('Could not record the digest', writeError);
    return json({ error: writeError.message }, 500);
  }

  return json({ sha256, alreadyComputed: false });
});
