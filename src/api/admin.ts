/**
 * The access-administration surface: people, scope, sharing, delegation and
 * the audit trail.
 *
 * Every call here goes through the same anon key as the rest of the portal,
 * so every one of them is subject to row level security. Nothing in this file
 * grants anything. Where a call would be refused, it is refused by Postgres,
 * and the console's job is to not offer it in the first place — see
 * supabase/migrations/0003 and 0005 for the rules it mirrors.
 *
 * The one exception is inviting, which has to create an auth user and
 * therefore runs in an edge function with the service role.
 */
import { supabase } from '../lib/supabase';
import type {
  Page,
  Assignment,
  Authority,
  AuditEntry,
  Confidentiality,
  Delegation,
  GrantPermission,
  Profile,
  RecordGrant,
  UserRole,
} from '../types';

/** A joined profile, as PostgREST returns an embedded row. */
interface NamedRef {
  full_name: string;
}

/**
 * PostgREST returns an embedded to-one relationship as an object, but types it
 * as an array in some versions. Both are handled rather than cast away.
 */
function name(ref: NamedRef | NamedRef[] | null | undefined): string | null {
  if (!ref) return null;
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.full_name ?? null;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Who the caller is
// ---------------------------------------------------------------------------

/**
 * The authoritative answer to "what may I do", computed by the same functions
 * the policies use. Null means no active profile.
 *
 * An answer that is not recognisably an authority is treated as no authority
 * rather than trusted or patched up. The console then shows what it shows
 * someone with no profile, which is the safe reading and an honest one: the
 * portal genuinely does not know what this person may do.
 */
export async function fetchAuthority(): Promise<Authority | null> {
  const { data, error } = await supabase.rpc('current_authority');
  fail(error);

  const value = data as Partial<Authority> | null;
  if (!value || typeof value.role !== 'string' || !Array.isArray(value.roles)) return null;
  return value as Authority;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  organization: string | null;
  clearance: Confidentiality;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const PROFILE_COLUMNS =
  'id, full_name, email, role, organization, clearance, is_active, expires_at, created_at';

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    organization: row.organization,
    clearance: row.clearance,
    isActive: row.is_active,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** The directory. Readable by anyone with an active profile, by design. */
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('full_name');
  fail(error);
  return ((data ?? []) as ProfileRow[]).map(toProfile);
}

export interface ProfileChanges {
  role?: UserRole;
  clearance?: Confidentiality;
  organization?: string | null;
  isActive?: boolean;
  expiresAt?: string | null;
}

/**
 * Administrators only, enforced by profiles_admin_all. A person editing their
 * own row can change their name and organization but not their authority —
 * profiles_self_update pins role, clearance and is_active to their current
 * values, so an attempt to raise them simply matches no rows.
 */
export async function updateProfile(input: {
  id: string;
  changes: ProfileChanges;
}): Promise<Profile> {
  const { changes } = input;
  const patch: Record<string, unknown> = {};
  if (changes.role !== undefined) patch.role = changes.role;
  if (changes.clearance !== undefined) patch.clearance = changes.clearance;
  if (changes.organization !== undefined) patch.organization = changes.organization;
  if (changes.isActive !== undefined) patch.is_active = changes.isActive;
  if (changes.expiresAt !== undefined) patch.expires_at = changes.expiresAt;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', input.id)
    .select(PROFILE_COLUMNS)
    .maybeSingle<ProfileRow>();
  fail(error);
  if (!data) {
    // An update refused by a policy matches no rows rather than raising, so
    // silence here means "not allowed", not "saved".
    throw new Error('That change was refused: you may not edit this profile.');
  }
  return toProfile(data);
}

export interface InviteInput {
  email: string;
  fullName: string;
  role: UserRole;
  organization: string | null;
  clearance: Confidentiality;
  expiresAt: string | null;
}

/**
 * Creating an account needs the service role, which must never reach the
 * browser, so this is the one operation that goes through an edge function.
 * The function re-asks the database whether the caller is an administrator.
 */
export async function inviteUser(input: InviteInput): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.functions.invoke<{ id: string; email: string }>(
    'invite-user',
    { body: input },
  );

  if (error) {
    // The function's own message is the useful one; it is in the response body
    // rather than the error, which only says the status.
    const context: unknown = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const body: unknown = await context.json().catch(() => null);
      const message = (body as { error?: string } | null)?.error;
      if (message) throw new Error(message);
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error('The invitation function returned nothing.');
  return data;
}

// ---------------------------------------------------------------------------
// Scope: which cases and blocks an outside party is on
// ---------------------------------------------------------------------------

interface AssignmentRow {
  user_id: string;
  assigned_at: string;
  legal_case_id?: string;
  construction_block_id?: string;
  holder: NamedRef | NamedRef[] | null;
  assigner: NamedRef | NamedRef[] | null;
}

function toAssignment(row: AssignmentRow, targetKey: 'legal_case_id' | 'construction_block_id') {
  return {
    userId: row.user_id,
    userName: name(row.holder),
    targetId: row[targetKey] ?? '',
    assignedByName: name(row.assigner),
    assignedAt: row.assigned_at,
  } satisfies Assignment;
}

const CASE_ASSIGNMENT_COLUMNS =
  'user_id, legal_case_id, assigned_at, ' +
  'holder:profiles!case_assignments_user_id_fkey(full_name), ' +
  'assigner:profiles!case_assignments_assigned_by_fkey(full_name)';

const BLOCK_ASSIGNMENT_COLUMNS =
  'user_id, construction_block_id, assigned_at, ' +
  'holder:profiles!block_assignments_user_id_fkey(full_name), ' +
  'assigner:profiles!block_assignments_assigned_by_fkey(full_name)';

export async function fetchCaseAssignments(): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('case_assignments')
    .select(CASE_ASSIGNMENT_COLUMNS)
    .order('assigned_at', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as AssignmentRow[]).map((r) => toAssignment(r, 'legal_case_id'));
}

export async function fetchBlockAssignments(): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('block_assignments')
    .select(BLOCK_ASSIGNMENT_COLUMNS)
    .order('assigned_at', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as AssignmentRow[]).map((r) =>
    toAssignment(r, 'construction_block_id'),
  );
}

export type ScopeKind = 'case' | 'block';

const SCOPE_TABLE: Record<ScopeKind, { table: string; column: string }> = {
  case: { table: 'case_assignments', column: 'legal_case_id' },
  block: { table: 'block_assignments', column: 'construction_block_id' },
};

export async function assign(input: {
  kind: ScopeKind;
  userId: string;
  targetId: string;
  assignedBy: string;
}): Promise<void> {
  const { table, column } = SCOPE_TABLE[input.kind];
  const { error } = await supabase.from(table).insert({
    user_id: input.userId,
    [column]: input.targetId,
    assigned_by: input.assignedBy,
  });
  fail(error);
}

export async function unassign(input: {
  kind: ScopeKind;
  userId: string;
  targetId: string;
}): Promise<void> {
  const { table, column } = SCOPE_TABLE[input.kind];
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('user_id', input.userId)
    .eq(column, input.targetId);
  fail(error);
}

// ---------------------------------------------------------------------------
// Sharing: one record, one person
// ---------------------------------------------------------------------------

interface GrantRow {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  permission: GrantPermission;
  granted_at: string;
  expires_at: string | null;
  reason: string | null;
  holder: NamedRef | NamedRef[] | null;
  granter: NamedRef | NamedRef[] | null;
}

const GRANT_COLUMNS =
  'id, user_id, entity_type, entity_id, permission, granted_at, expires_at, reason, ' +
  'holder:profiles!record_grants_user_id_fkey(full_name), ' +
  'granter:profiles!record_grants_granted_by_fkey(full_name)';

/**
 * Internal roles see every grant; everyone else sees only their own. That is
 * record_grants_read, not a filter added here.
 */
export async function fetchGrants(): Promise<RecordGrant[]> {
  const { data, error } = await supabase
    .from('record_grants')
    .select(GRANT_COLUMNS)
    .order('granted_at', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as GrantRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: name(row.holder),
    entityType: row.entity_type,
    entityId: row.entity_id,
    permission: row.permission,
    grantedByName: name(row.granter),
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    reason: row.reason,
  }));
}

export async function createGrant(input: {
  userId: string;
  entityType: string;
  entityId: string;
  permission: GrantPermission;
  grantedBy: string;
  expiresAt: string | null;
  reason: string | null;
}): Promise<void> {
  const { error } = await supabase.from('record_grants').insert({
    user_id: input.userId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    permission: input.permission,
    granted_by: input.grantedBy,
    expires_at: input.expiresAt,
    reason: input.reason,
  });
  fail(error);
}

export async function revokeGrant(id: string): Promise<void> {
  const { error } = await supabase.from('record_grants').delete().eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Emergency delegation
// ---------------------------------------------------------------------------

interface ApprovalRow {
  approver_id: string;
  approved_at: string;
  approver: NamedRef | NamedRef[] | null;
}

interface DelegationRow {
  id: string;
  from_user: string;
  to_user: string;
  reason: string;
  requested_at: string;
  expires_at: string;
  revoked_at: string | null;
  lender: NamedRef | NamedRef[] | null;
  recipient: NamedRef | NamedRef[] | null;
  requester: NamedRef | NamedRef[] | null;
  revoker: NamedRef | NamedRef[] | null;
  emergency_delegation_approvals: ApprovalRow[] | null;
}

const DELEGATION_COLUMNS =
  'id, from_user, to_user, reason, requested_at, expires_at, revoked_at, ' +
  'lender:profiles!emergency_delegations_from_user_fkey(full_name), ' +
  'recipient:profiles!emergency_delegations_to_user_fkey(full_name), ' +
  'requester:profiles!emergency_delegations_requested_by_fkey(full_name), ' +
  'revoker:profiles!emergency_delegations_revoked_by_fkey(full_name), ' +
  'emergency_delegation_approvals(approver_id, approved_at, ' +
  'approver:profiles!emergency_delegation_approvals_approver_id_fkey(full_name))';

export async function fetchDelegations(): Promise<Delegation[]> {
  const { data, error } = await supabase
    .from('emergency_delegations')
    .select(DELEGATION_COLUMNS)
    .order('requested_at', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as DelegationRow[]).map((row) => ({
    id: row.id,
    fromUserId: row.from_user,
    fromUserName: name(row.lender),
    toUserId: row.to_user,
    toUserName: name(row.recipient),
    reason: row.reason,
    requestedByName: name(row.requester),
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedByName: name(row.revoker),
    approvals: (row.emergency_delegation_approvals ?? []).map((a) => ({
      approverId: a.approver_id,
      approverName: name(a.approver),
      approvedAt: a.approved_at,
    })),
  }));
}

export async function requestDelegation(input: {
  fromUserId: string;
  toUserId: string;
  reason: string;
  requestedBy: string;
  expiresAt: string;
}): Promise<void> {
  const { error } = await supabase.from('emergency_delegations').insert({
    from_user: input.fromUserId,
    to_user: input.toUserId,
    reason: input.reason,
    requested_by: input.requestedBy,
    expires_at: input.expiresAt,
  });
  fail(error);
}

/**
 * Recording an approval is the whole of approving. The trigger checks that the
 * caller is the approver, that they are an active trustee and that they are not
 * the recipient; the primary key stops the same trustee approving twice.
 */
export async function approveDelegation(input: {
  delegationId: string;
  approverId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('emergency_delegation_approvals')
    .insert({ delegation_id: input.delegationId, approver_id: input.approverId });
  fail(error);
}

export async function revokeDelegation(input: { id: string; revokedBy: string }): Promise<void> {
  const { error } = await supabase
    .from('emergency_delegations')
    .update({ revoked_by: input.revokedBy, revoked_at: new Date().toISOString() })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  at: string;
  actor: NamedRef | NamedRef[] | null;
}

/**
 * Append-only and read-only: no policy grants insert, update or delete to
 * anyone, and two triggers refuse the last two outright.
 */
export async function fetchAuditLog(
  limit = 50,
  offset = 0,
  entityType?: string,
): Promise<Page<AuditEntry>> {
  let query = supabase
    .from('audit_log')
    .select('id, actor_id, action, entity_type, entity_id, at, actor:profiles(full_name)', {
      count: 'exact',
    });
  // Süzgeç burada, istemcide değil. Önce çekilen dilimin içinde süzülüyordu:
  // "sözleşme" seçen biri, kütükte sözleşme kaydı olduğu hâlde boş bir liste
  // görebiliyordu — çünkü aranan yer son 200 satırdı. Kesilmiş bir veri
  // üzerinde arama yapmak, aramanın kendisi hakkında yanlış bir şey söyler.
  if (entityType) query = query.eq('entity_type', entityType);

  const { data, error, count } = await query
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  fail(error);
  return {
    rows: ((data ?? []) as unknown as AuditRow[]).map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorName: name(row.actor),
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      at: row.at,
    })),
    total: count ?? 0,
  };
}
