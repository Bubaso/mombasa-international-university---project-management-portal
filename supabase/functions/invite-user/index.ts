/**
 * Invites someone into the portal and creates their profile (M1-08).
 *
 * This has to run on the server. Creating an auth user needs the service role
 * key, which bypasses row level security entirely — putting it in the browser
 * would hand every visitor the keys to the whole database.
 *
 * Two clients are used on purpose:
 *   - one carrying the caller's own token, to ask the database who is asking.
 *     Their authority comes from public.current_authority(), which runs the
 *     same functions the policies do — never from the JWT body, which the
 *     browser controls.
 *   - one with the service role, used only after that check passes.
 *
 * Deploy:
 *   supabase functions deploy invite-user
 * It reads SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY,
 * which Supabase injects.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = [
  'admin',
  'project_director',
  'field_team',
  'trustee',
  'board_director',
  'audit_committee',
  'legal_counsel',
  'contractor',
  'quantity_surveyor',
  'external_auditor',
  'donor',
  'observer',
  'consultant',
] as const;

const TIERS = ['public', 'internal', 'confidential', 'restricted'] as const;

type Role = (typeof ROLES)[number];
type Tier = (typeof TIERS)[number];

interface InviteRequest {
  email?: string;
  fullName?: string;
  role?: Role;
  organization?: string | null;
  clearance?: Tier;
  expiresAt?: string | null;
}

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
    return json({ error: 'The invite function is not configured on the server.' }, 503);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  // Who is asking, under row level security and with no elevated key.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: caller } = await asCaller.auth.getUser();
  if (!caller?.user) return json({ error: 'Not signed in.' }, 401);

  // Asked of the database rather than worked out here, so this answer and the
  // profiles_admin_all policy can never drift apart — including when the
  // caller is acting on a delegation, which the profile row does not mention.
  const { data: authority } = await asCaller.rpc('current_authority');

  if (!authority?.isAdmin) {
    // Inviting decides who gets to see what, so it stays with administrators.
    return json({ error: 'Only an administrator may invite people.' }, 403);
  }

  let body: InviteRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const fullName = body.fullName?.trim();
  const role = body.role;
  const clearance: Tier = body.clearance ?? 'internal';

  if (!email || !fullName) return json({ error: 'An email and a name are required.' }, 400);
  if (!role || !ROLES.includes(role)) return json({ error: 'Unknown role.' }, 400);
  if (!TIERS.includes(clearance)) return json({ error: 'Unknown clearance.' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invited?.user) {
    console.error('Invite failed', inviteError);
    return json({ error: inviteError?.message ?? 'Could not send the invitation.' }, 400);
  }

  // The profile is what actually grants access, so a failure here must not
  // leave an auth user behind with no record of who they are.
  const { error: profileError } = await admin.from('profiles').insert({
    id: invited.user.id,
    full_name: fullName,
    email,
    role,
    organization: body.organization ?? null,
    clearance,
    expires_at: body.expiresAt ?? null,
    created_by: caller.user.id,
  });

  if (profileError) {
    console.error('Profile insert failed, rolling the invitation back', profileError);
    await admin.auth.admin.deleteUser(invited.user.id);
    // The clearance check constraint is the likely cause and is worth naming.
    return json({ error: profileError.message }, 400);
  }

  return json({ id: invited.user.id, email });
});
