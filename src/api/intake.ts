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
import type { Confidentiality, DocumentCategory, Page } from '../types';

export type IntakeState = 'analysing' | 'ready' | 'failed';

/**
 * Kuyruğun tek kelimelik durumu (0050).
 *
 * Sıra anlamlı: bir okuma henüz bitmediyse teklif sayısı bir cevap değil.
 */
export type IntakeDisposition =
  'reading' | 'unreadable' | 'awaiting_decision' | 'read_before_proposals' | 'settled';

/** Kuyrukta bir satır: okuma, kararlarının sayısı, ve durumu. */
export interface QueueEntry {
  intakeId: string;
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  documentCategory: DocumentCategory;
  state: IntakeState;
  classifiedAs: string | null;
  classificationWhy: string | null;
  aboutEn: string | null;
  extractedChars: number | null;
  pageCount: number | null;
  failureReason: string | null;
  createdAt: string;
  finishedAt: string | null;
  proposalsAt: string | null;
  pending: number;
  applied: number;
  rejected: number;
  disposition: IntakeDisposition;
}

interface QueueRow {
  intake_id: string;
  document_id: string;
  document_version_id: string;
  document_title: string;
  document_category: DocumentCategory;
  state: IntakeState;
  classified_as: string | null;
  classification_why: string | null;
  about_en: string | null;
  extracted_chars: number | null;
  page_count: number | null;
  failure_reason: string | null;
  created_at: string;
  finished_at: string | null;
  proposals_at: string | null;
  pending: number;
  applied: number;
  rejected: number;
  disposition: IntakeDisposition;
}

const QUEUE_COLUMNS =
  'intake_id, document_id, document_version_id, document_title, document_category, state, ' +
  'classified_as, classification_why, about_en, extracted_chars, page_count, failure_reason, ' +
  'created_at, finished_at, proposals_at, pending, applied, rejected, disposition';

const toEntry = (row: QueueRow): QueueEntry => ({
  intakeId: row.intake_id,
  documentId: row.document_id,
  documentVersionId: row.document_version_id,
  documentTitle: row.document_title,
  documentCategory: row.document_category,
  state: row.state,
  classifiedAs: row.classified_as,
  classificationWhy: row.classification_why,
  aboutEn: row.about_en,
  extractedChars: row.extracted_chars,
  pageCount: row.page_count,
  failureReason: row.failure_reason,
  createdAt: row.created_at,
  finishedAt: row.finished_at,
  proposalsAt: row.proposals_at,
  pending: row.pending,
  applied: row.applied,
  rejected: row.rejected,
  disposition: row.disposition,
});

/**
 * Kuyruğun bir sayfası.
 *
 * İki şey kasıtlı:
 *
 *   **Sıra duruma göre değişiyor.** Karar bekleyenler bir kuyruktur ve
 *   kuyruk en eskiden akar; en yeniyi öne almak, en uzun bekleyeni en dibe
 *   gömer. Bitmişler ise arşivdir ve orada en yeni önce gelir.
 *
 *   **Toplam sayı isteniyor.** "En yeni 20" diye sessizce kesmek, geri
 *   kalanın var olmadığını sandırıyordu. Sayı bilinmezse sayfalama da
 *   bilinmez.
 */
export async function fetchQueue(input: {
  disposition: IntakeDisposition;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Page<QueueEntry>> {
  const limit = input.limit ?? 10;
  const offset = input.offset ?? 0;
  const oldestFirst = input.disposition === 'awaiting_decision';

  let query = supabase
    .from('intake_queue')
    .select(QUEUE_COLUMNS, { count: 'exact' })
    .eq('disposition', input.disposition);

  const search = (input.search ?? '').trim();
  if (search !== '') query = query.ilike('document_title', `%${search}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: oldestFirst })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { rows: ((data ?? []) as unknown as QueueRow[]).map(toEntry), total: count ?? 0 };
}

/**
 * Her durumda kaç okuma var.
 *
 * Sekme başlıklarındaki sayılar buradan geliyor; sayısı olmayan bir sekme,
 * tıklanana kadar boş mu dolu mu olduğunu söylemiyor.
 */
export async function fetchQueueCounts(): Promise<Record<IntakeDisposition, number>> {
  const { data, error } = await supabase.from('intake_queue').select('disposition');
  if (error) throw new Error(error.message);
  const counts: Record<IntakeDisposition, number> = {
    reading: 0,
    unreadable: 0,
    awaiting_decision: 0,
    read_before_proposals: 0,
    settled: 0,
  };
  for (const row of (data ?? []) as { disposition: IntakeDisposition }[]) {
    // Paketin tanımadığı bir durum sayılmıyor ama ekranı da düşürmüyor:
    // veritabanı bu paketten bir göç önde olabilir.
    if (row.disposition in counts) counts[row.disposition] += 1;
  }
  return counts;
}

export interface IntakeOutcome {
  intakeId: string | null;
  /** Fonksiyonun reddi ya da okuma hatası, kelimesi kelimesine. */
  error: string | null;
  /**
   * Hata olmayan ama söylenmesi gereken şey: kaç teklifin zaten kayıtlı
   * olduğu için üretilmediği. Sessiz kalınsa "bir şey bulamadı" ile "buldu,
   * zaten vardı" ekranda aynı görünür.
   */
  note: string | null;
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

  const { data, error } = await supabase.functions.invoke<{
    intakeId?: string;
    error?: string;
    note?: string;
  }>('document-intake', { body: { versionId: uploaded.versionId } });

  if (error) {
    // Fonksiyonun kendi cümlesi, varsa. Supabase'in sarmaladığı genel
    // "non-2xx" mesajı kullanıcıya hiçbir şey söylemiyor.
    const context: unknown = (error as { context?: unknown }).context;
    let message = error.message;
    if (context instanceof Response) {
      const body: unknown = await context.json().catch(() => null);
      const named = (body as { error?: string; intakeId?: string } | null) ?? null;
      if (named?.error) message = named.error;
      if (named?.intakeId) return { intakeId: named.intakeId, error: message, note: null };
    }
    return { intakeId: null, error: message, note: null };
  }

  return {
    intakeId: data?.intakeId ?? null,
    error: data?.error ?? null,
    note: data?.note ?? null,
  };
}

/** Yeniden okut: aynı sürüm, yeni bir alım. */
export async function reanalyse(versionId: string): Promise<IntakeOutcome> {
  const { data, error } = await supabase.functions.invoke<{
    intakeId?: string;
    error?: string;
    note?: string;
  }>('document-intake', { body: { versionId } });
  if (error) return { intakeId: null, error: error.message, note: null };
  return {
    intakeId: data?.intakeId ?? null,
    error: data?.error ?? null,
    note: data?.note ?? null,
  };
}
