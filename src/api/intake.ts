/**
 * Belge alımı, istemci tarafı (M13-13, M13-14).
 *
 * Sıra kasanın sırasıdır ve kısaltılamaz: bir kasa kaydı açılır, sürüm
 * yüklenir (özeti sunucu hesaplar), sonra alım o sürüm üzerinde çalışır.
 * Analiz için ayrı bir geçici dosya alanı yoktur — olsaydı, kasanın bütün
 * kurallarının dışında ikinci bir depo olurdu.
 *
 * Burada hiçbir kütüğe yazma yok. Alım satırını açan `document-intake`
 * fonksiyonudur ve onu çağıranın kendi token'ıyla açar, ki 0047'nin insert
 * politikası uygulanabilsin; sınıflandırmayı yazan taraf servis anahtarıdır,
 * çünkü bitmiş bir alımı istemcinin iddia etmesi, sınıflandırmayı
 * istemcinin uydurabilmesi demek olurdu.
 */
import { supabase } from '../lib/supabase';
import { createDocument, uploadVersion } from './documents';
import type { Confidentiality, DocumentCategory } from '../types';

export type IntakeState = 'analysing' | 'ready' | 'failed';

export interface IntakeRecord {
  id: string;
  documentId: string;
  documentVersionId: string;
  state: IntakeState;
  classifiedAs: string | null;
  classificationWhy: string | null;
  /** Belgenin ne dediği. Ne olduğu ile ne dediği ayrı şeyler. */
  aboutEn: string | null;
  /** Hangi kütükleri ilgilendirdiği. Teklif değil, işaret. */
  touches: string[];
  extractedChars: number | null;
  pageCount: number | null;
  failureReason: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  finishedAt: string | null;
}

interface IntakeRow {
  id: string;
  document_id: string;
  document_version_id: string;
  state: IntakeState;
  classified_as: string | null;
  classification_why: string | null;
  about_en: string | null;
  touches: string[] | null;
  extracted_chars: number | null;
  page_count: number | null;
  failure_reason: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  finished_at: string | null;
}

const COLUMNS =
  'id, document_id, document_version_id, state, classified_as, classification_why, about_en, touches, ' +
  'extracted_chars, page_count, failure_reason, model, input_tokens, output_tokens, created_at, ' +
  'finished_at';

const toRecord = (row: IntakeRow): IntakeRecord => ({
  id: row.id,
  documentId: row.document_id,
  documentVersionId: row.document_version_id,
  state: row.state,
  classifiedAs: row.classified_as,
  classificationWhy: row.classification_why,
  aboutEn: row.about_en,
  touches: row.touches ?? [],
  extractedChars: row.extracted_chars,
  pageCount: row.page_count,
  failureReason: row.failure_reason,
  model: row.model,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  createdAt: row.created_at,
  finishedAt: row.finished_at,
});

export async function fetchIntakes(limit = 20): Promise<IntakeRecord[]> {
  const { data, error } = await supabase
    .from('document_intake')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as IntakeRow[]).map(toRecord);
}

export interface IntakeOutcome {
  intakeId: string | null;
  /** Fonksiyonun reddi ya da okuma hatası, kelimesi kelimesine. */
  error: string | null;
}

/**
 * Bir dosyayı kasaya koy ve okut.
 *
 * Hata hâlinde kasa kaydı ve sürüm yerinde kalır. Bu kasıtlı: baytlar
 * yüklendiyse belge arşivdedir ve okunamamış olması onu arşivden çıkarmaz.
 * Alım `failed` olarak kalır, sebebiyle, ve yeniden denenebilir.
 */
export async function intakeFile(input: {
  file: File;
  title: string;
  category: DocumentCategory;
  confidentiality: Confidentiality;
}): Promise<IntakeOutcome> {
  const document = await createDocument({
    title: input.title,
    category: input.category,
    descriptionEn: null,
    confidentiality: input.confidentiality,
  });

  const uploaded = await uploadVersion({
    documentId: document.id,
    file: input.file,
    note: null,
  });

  const { data, error } = await supabase.functions.invoke<{ intakeId?: string; error?: string }>(
    'document-intake',
    { body: { versionId: uploaded.versionId } },
  );

  if (error) {
    // Fonksiyonun kendi cümlesi, varsa. Supabase'in sarmaladığı genel
    // "non-2xx" mesajı kullanıcıya hiçbir şey söylemiyor.
    const context: unknown = (error as { context?: unknown }).context;
    let message = error.message;
    if (context instanceof Response) {
      const body: unknown = await context.json().catch(() => null);
      const named = (body as { error?: string; intakeId?: string } | null) ?? null;
      if (named?.error) message = named.error;
      if (named?.intakeId) return { intakeId: named.intakeId, error: message };
    }
    return { intakeId: null, error: message };
  }

  return { intakeId: data?.intakeId ?? null, error: data?.error ?? null };
}

/** Yeniden okut: aynı sürüm, yeni bir alım. */
export async function reanalyse(versionId: string): Promise<IntakeOutcome> {
  const { data, error } = await supabase.functions.invoke<{ intakeId?: string; error?: string }>(
    'document-intake',
    { body: { versionId } },
  );
  if (error) return { intakeId: null, error: error.message };
  return { intakeId: data?.intakeId ?? null, error: data?.error ?? null };
}
