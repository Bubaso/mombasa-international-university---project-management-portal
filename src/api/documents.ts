/**
 * The document vault (M9).
 *
 * Three things here are deliberately not the client's to do, and the code
 * reflects that rather than working around it:
 *
 *   - the digest is computed by the verify-document function from the stored
 *     bytes, and this file has no way to write it;
 *   - reading a file goes through document-download, which records the
 *     reading before it signs a link, because the bucket has no read policy
 *     for the browser at all;
 *   - a version is never edited or deleted, so there is no such call.
 *
 * Uploading is a client job, because pushing the bytes through a function
 * would cost memory for nothing. The order matters: the version row is
 * written first, because the storage policy authorises an upload only to a
 * path some version already claims.
 */
import { supabase } from '../lib/supabase';
import type {
  Confidentiality,
  DocumentAccessEntry,
  DocumentActionKind,
  DocumentCategory,
  DocumentItem,
  DocumentLink,
  DocumentVersion,
} from '../types';

const BUCKET = 'documents';

interface NamedRef {
  full_name: string;
}

function label(ref: NamedRef | NamedRef[] | null | undefined): string | null {
  if (!ref) return null;
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.full_name ?? null;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

interface DocumentRow {
  id: string;
  title: string;
  category: DocumentCategory;
  status: DocumentItem['status'];
  description_en: string | null;
  description_tr: string | null;
  confidentiality: Confidentiality;
  current_version_id: string | null;
  versions: { count: number }[] | null;
}

const DOCUMENT_COLUMNS =
  'id, title, category, status, description_en, description_tr, confidentiality, ' +
  'current_version_id, ' +
  'versions:document_versions!document_versions_document_id_fkey(count)';

export async function fetchDocuments(): Promise<DocumentItem[]> {
  const { data, error } = await supabase
    .from('document_vault')
    .select(DOCUMENT_COLUMNS)
    .order('title');
  fail(error);
  return ((data ?? []) as unknown as DocumentRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    descriptionEn: row.description_en,
    descriptionTr: row.description_tr,
    confidentiality: row.confidentiality,
    currentVersionId: row.current_version_id,
    versionCount: row.versions?.[0]?.count ?? 0,
  }));
}

export async function createDocument(input: {
  title: string;
  category: DocumentCategory;
  descriptionEn: string | null;
  confidentiality: Confidentiality;
}): Promise<DocumentItem> {
  const { data, error } = await supabase
    .from('document_vault')
    .insert({
      title: input.title,
      category: input.category,
      description_en: input.descriptionEn,
      confidentiality: input.confidentiality,
      status: 'under_review',
    })
    .select(DOCUMENT_COLUMNS)
    .single();
  fail(error);
  const row = data as unknown as DocumentRow;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    descriptionEn: row.description_en,
    descriptionTr: row.description_tr,
    confidentiality: row.confidentiality,
    currentVersionId: row.current_version_id,
    versionCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

interface VersionRow {
  id: string;
  document_id: string;
  version_no: number;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  digest_computed_at: string | null;
  uploaded_at: string;
  note: string | null;
  uploader: NamedRef | NamedRef[] | null;
}

const VERSION_COLUMNS =
  'id, document_id, version_no, storage_path, file_name, content_type, byte_size, ' +
  'sha256, digest_computed_at, uploaded_at, note, ' +
  'uploader:profiles!document_versions_uploaded_by_fkey(full_name)';

function toVersion(row: VersionRow): DocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    versionNo: row.version_no,
    storagePath: row.storage_path,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    digestComputedAt: row.digest_computed_at,
    uploadedByName: label(row.uploader),
    uploadedAt: row.uploaded_at,
    note: row.note,
  };
}

export async function fetchVersions(documentId: string): Promise<DocumentVersion[]> {
  const { data, error } = await supabase
    .from('document_versions')
    .select(VERSION_COLUMNS)
    .eq('document_id', documentId)
    .order('version_no', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as VersionRow[]).map(toVersion);
}

/** Every version in force, for listing documents without a query each. */
export async function fetchCurrentVersions(): Promise<DocumentVersion[]> {
  const { data, error } = await supabase.from('document_versions').select(VERSION_COLUMNS);
  fail(error);
  return ((data ?? []) as unknown as VersionRow[]).map(toVersion);
}

export interface UploadOutcome {
  versionId: string;
  /** Null when the digest could not be computed; the version is then unverified. */
  sha256: string | null;
  verificationError: string | null;
}

/**
 * Registers the version, pushes the bytes, then asks the server to read them
 * back and record what it found.
 *
 * If the last step fails the version still exists and still has no digest,
 * which reads as unverified — the correct answer, and one the caller is told
 * about rather than left to discover.
 */
export async function uploadVersion(input: {
  documentId: string;
  file: File;
  note: string | null;
}): Promise<UploadOutcome> {
  const versionId = crypto.randomUUID();
  const storagePath = `${input.documentId}/${versionId}`;

  // First, so the storage policy has a path to authorise against.
  const { error: rowError } = await supabase.from('document_versions').insert({
    id: versionId,
    document_id: input.documentId,
    storage_path: storagePath,
    file_name: input.file.name,
    content_type: input.file.type || null,
    byte_size: input.file.size,
    note: input.note,
  });
  fail(rowError);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file, { contentType: input.file.type || undefined });

  if (uploadError) {
    // The row stays. It has no digest, so it shows as unverified, and
    // verify-document will say the bytes are missing if anyone asks again.
    throw new Error(`The file did not reach storage: ${uploadError.message}`);
  }

  const { data, error } = await supabase.functions.invoke<{ sha256: string }>('verify-document', {
    body: { versionId },
  });

  if (error) {
    const context: unknown = (error as { context?: unknown }).context;
    let message = error.message;
    if (context instanceof Response) {
      const body: unknown = await context.json().catch(() => null);
      message = (body as { error?: string } | null)?.error ?? message;
    }
    return { versionId, sha256: null, verificationError: message };
  }

  return { versionId, sha256: data?.sha256 ?? null, verificationError: null };
}

// ---------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------

export interface DownloadLink {
  url: string;
  fileName: string;
  sha256: string | null;
  expiresInSeconds: number;
}

/**
 * The only way to the bytes. The bucket has no read policy for the browser,
 * so this is not a convenience wrapper — it is the route, and it records the
 * reading before it hands anything over.
 */
export async function requestDownload(input: {
  versionId: string;
  action: DocumentActionKind;
}): Promise<DownloadLink> {
  const { data, error } = await supabase.functions.invoke<DownloadLink>('document-download', {
    body: { versionId: input.versionId, action: input.action },
  });

  if (error) {
    const context: unknown = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const body: unknown = await context.json().catch(() => null);
      const message = (body as { error?: string } | null)?.error;
      if (message) throw new Error(message);
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error('No link was returned.');
  return data;
}

// ---------------------------------------------------------------------------
// Who read it, and what it is attached to
// ---------------------------------------------------------------------------

interface AccessRow {
  id: number;
  document_id: string;
  version_id: string | null;
  profile_id: string;
  action: DocumentActionKind;
  at: string;
  reader: NamedRef | NamedRef[] | null;
}

export async function fetchAccessLog(documentId: string): Promise<DocumentAccessEntry[]> {
  const { data, error } = await supabase
    .from('document_access')
    .select(
      'id, document_id, version_id, profile_id, action, at, ' +
        'reader:profiles!document_access_profile_id_fkey(full_name)',
    )
    .eq('document_id', documentId)
    .order('at', { ascending: false })
    .limit(100);
  fail(error);
  return ((data ?? []) as unknown as AccessRow[]).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    versionId: row.version_id,
    profileId: row.profile_id,
    readerName: label(row.reader),
    action: row.action,
    at: row.at,
  }));
}

export async function fetchLinks(documentId: string): Promise<DocumentLink[]> {
  const { data, error } = await supabase
    .from('document_links')
    .select('id, document_id, entity_type, entity_id, note')
    .eq('document_id', documentId);
  fail(error);
  return (
    (data ?? []) as {
      id: string;
      document_id: string;
      entity_type: string;
      entity_id: string;
      note: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    note: row.note,
  }));
}

export async function linkDocument(input: {
  documentId: string;
  entityType: string;
  entityId: string;
}): Promise<void> {
  const { error } = await supabase.from('document_links').insert({
    document_id: input.documentId,
    entity_type: input.entityType,
    entity_id: input.entityId,
  });
  fail(error);
}

export async function unlinkDocument(id: string): Promise<void> {
  const { error } = await supabase.from('document_links').delete().eq('id', id);
  fail(error);
}
