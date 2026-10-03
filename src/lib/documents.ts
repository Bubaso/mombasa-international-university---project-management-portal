import type { DocumentCategory, Language } from '../types';
import { wordFor } from './labels';

type Bilingual = { tr: string; en: string };

const CATEGORIES: Record<DocumentCategory, Bilingual> = {
  trust_deed: { tr: 'Vakıf senedi', en: 'Trust deed' },
  court_order: { tr: 'Mahkeme kararı', en: 'Court order' },
  pleading: { tr: 'Layiha', en: 'Pleading' },
  evidence: { tr: 'Delil', en: 'Evidence' },
  contract_mou: { tr: 'Sözleşme / MoU', en: 'Contract or MoU' },
  architectural: { tr: 'Mimari', en: 'Architectural' },
  boq_financial: { tr: 'Metraj / mali', en: 'BoQ or financial' },
  accreditation: { tr: 'Akreditasyon', en: 'Accreditation' },
  correspondence: { tr: 'Yazışma', en: 'Correspondence' },
  photograph: { tr: 'Fotoğraf', en: 'Photograph' },
  other: { tr: 'Diğer', en: 'Other' },
};

export const DOCUMENT_CATEGORIES = Object.keys(CATEGORIES) as DocumentCategory[];
export const categoryLabel = (c: DocumentCategory, l: Language) => wordFor(CATEGORIES, c, l);

/** Bytes, in the roughest terms that are still useful. */
export function fileSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Enough of a digest to compare by eye, which is all anyone does with one.
 * The full value is available to copy where it matters.
 */
export function shortDigest(sha256: string | null): string | null {
  if (!sha256) return null;
  return `${sha256.slice(0, 8)}…${sha256.slice(-8)}`;
}
