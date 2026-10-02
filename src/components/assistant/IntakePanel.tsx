import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Loader2, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchIntakes, intakeFile, type IntakeRecord } from '../../api/intake';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { Explain } from '../ui/Explain';
import { formatDate } from '../../lib/site';
import type { Confidentiality, DocumentCategory } from '../../types';

/**
 * Belge alımı, birinci faz: oku ve ne olduğunu söyle (M13-13).
 *
 * Bu panelde **hiçbir şey yazılamaz.** Kasaya bir belge girer, okunur, ve
 * ekranda ne olduğu ile neden öyle olduğu durur. Hangi kütükleri
 * ilgilendirdiği de bir işarettir, teklif değil: teklifler ikinci fazda
 * gelecek ve her biri onay isteyecek (M13-14).
 *
 * Ekranda görünen üç şeyin her biri bir gereksinimin karşılığı:
 *
 *   - **Neden öyle düşündüğü.** Bir satırın "vakıf senedi" demesi, neden
 *     öyle dediğini söylemiyorsa inanılacak ya da inanılmayacak bir
 *     iddiadır; denetlenebilir değildir. Veritabanı da aynı şeyi söylüyor:
 *     0047'de `ready` olan bir alım gerekçesiz olamaz.
 *   - **Başarısızlığın sebebi.** "Olmadı" bir cevap değil. Taranmış bir PDF
 *     ile okunamayan bir dosya farklı şeylerdir ve ikisi de söylenmeye
 *     değer.
 *   - **Ne kadarının okunduğu.** Sınıflandırma ilk 12.000 karakterden
 *     yapılıyor. Belgenin tamamı okunmadıysa bunu söylemek gerekir, yoksa
 *     ekran okunmamış bir şey hakkında kendinden emin görünür.
 */

const CATEGORIES: DocumentCategory[] = [
  'trust_deed',
  'court_order',
  'pleading',
  'evidence',
  'contract_mou',
  'architectural',
  'boq_financial',
  'accreditation',
  'correspondence',
  'other',
];

const CATEGORY_LABEL: Record<DocumentCategory, { tr: string; en: string }> = {
  trust_deed: { tr: 'Vakıf senedi / tapu', en: 'Trust deed / title' },
  court_order: { tr: 'Mahkeme kararı', en: 'Court order' },
  pleading: { tr: 'Layiha', en: 'Pleading' },
  evidence: { tr: 'Delil', en: 'Evidence' },
  contract_mou: { tr: 'Sözleşme / mutabakat', en: 'Contract / MoU' },
  architectural: { tr: 'Mimarî çizim', en: 'Architectural' },
  boq_financial: { tr: 'Metraj / malî', en: 'BoQ / financial' },
  accreditation: { tr: 'Akreditasyon', en: 'Accreditation' },
  correspondence: { tr: 'Yazışma', en: 'Correspondence' },
  photograph: { tr: 'Fotoğraf', en: 'Photograph' },
  other: { tr: 'Diğer', en: 'Other' },
};

/** Kütük anahtarlarının okunur adları. Faz 4'te veritabanından gelecek. */
const REGISTER_LABEL: Record<string, { tr: string; en: string }> = {
  document_vault: { tr: 'Belge kasası', en: 'Document vault' },
  obligations: { tr: 'Yükümlülükler', en: 'Obligations' },
  legal: { tr: 'Hukuk kaydı', en: 'Legal record' },
  meetings: { tr: 'Toplantılar', en: 'Meetings' },
  actions: { tr: 'Aksiyonlar', en: 'Actions' },
  decisions: { tr: 'Kararlar', en: 'Decisions' },
  stakeholders: { tr: 'Paydaşlar', en: 'Stakeholders' },
  governance: { tr: 'Yönetişim', en: 'Governance' },
  chronology: { tr: 'Kronoloji', en: 'Chronology' },
  milestones: { tr: 'Kilometre taşları', en: 'Milestones' },
  construction: { tr: 'İnşaat', en: 'Construction' },
  procurement: { tr: 'Tedarik', en: 'Procurement' },
  finance: { tr: 'Mali yönetim', en: 'Financials' },
  risks: { tr: 'Riskler', en: 'Risks' },
  readiness: { tr: 'Akademik hazırlık', en: 'Academic readiness' },
  communication: { tr: 'İletişim', en: 'Communication' },
};

const registerName = (key: string, tr: boolean): string =>
  REGISTER_LABEL[key]?.[tr ? 'tr' : 'en'] ?? key;

export const IntakePanel: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const queryClient = useQueryClient();
  const intakes = useQuery({ queryKey: ['documentIntake'], queryFn: () => fetchIntakes(20) });

  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<DocumentCategory>('other');
  // Gizlilik varsayılanı kapalı taraf (CLAUDE.md §4). Bir belgenin ne olduğu
  // okunmadan bilinmiyorsa, kime açık olacağı da bilinmiyor.
  const [confidentiality, setConfidentiality] = React.useState<Confidentiality>('confidential');

  const run = useMutation({
    mutationFn: () => {
      if (!file) throw new Error(tr ? 'Bir dosya seçin.' : 'Choose a file.');
      return intakeFile({
        file,
        title: title.trim() || file.name,
        category,
        confidentiality,
      });
    },
    onSuccess: () => {
      setFile(null);
      setTitle('');
      void queryClient.invalidateQueries({ queryKey: ['documentIntake'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {tr ? 'Belge oku' : 'Read a document'}
            </h2>
            <Explain id="intake.what">
              {tr
                ? 'Yüklenen belge kasaya girer, okunur, ve ne olduğu hakkında bir kanaat kaydedilir. Bu kanaat bir kayıt değildir: bu fazda hiçbir şey kütüklere yazılmaz, yalnızca belgenin ne olduğu ve hangi kütükleri ilgilendirdiği söylenir. Teklifler ve onay bir sonraki fazda gelir.'
                : 'An uploaded document goes into the vault, is read, and a reading of what it is gets recorded. That reading is not a record: nothing is written to any register in this phase. It says what the document is and which registers it could touch. Proposals and approval come next.'}
            </Explain>
          </div>
        </div>
        <Pill className="border-slate-300 bg-slate-100 text-slate-700">
          {tr ? 'yazma yok' : 'writes nothing'}
        </Pill>
      </header>

      <div className="space-y-3 p-4">
        {canWrite ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={tr ? 'Dosya (.pdf, .docx, .txt)' : 'File (.pdf, .docx, .txt)'}>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null;
                  setFile(chosen);
                  if (chosen && !title.trim()) setTitle(chosen.name.replace(/\.[^.]+$/, ''));
                }}
                className="min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 md:min-h-8"
              />
            </Field>
            <Field label={tr ? 'Kasadaki adı' : 'Title in the vault'}>
              <TextInput
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={file?.name ?? ''}
              />
            </Field>
            <Field label={tr ? 'Kategori' : 'Category'}>
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value as DocumentCategory)}
              >
                {CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {CATEGORY_LABEL[key][tr ? 'tr' : 'en']}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Gizlilik' : 'Confidentiality'}>
              <Select
                value={confidentiality}
                onChange={(event) => setConfidentiality(event.target.value as Confidentiality)}
              >
                <option value="confidential">{tr ? 'Gizli (varsayılan)' : 'Confidential'}</option>
                <option value="internal">{tr ? 'Kurum içi' : 'Internal'}</option>
                <option value="restricted">{tr ? 'Kısıtlı' : 'Restricted'}</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <ActionButton
                tone="primary"
                disabled={!file || run.isPending}
                onClick={() => run.mutate()}
              >
                {run.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {tr ? 'Okunuyor…' : 'Reading…'}
                  </>
                ) : (
                  <>{tr ? 'Kasaya koy ve oku' : 'File it and read it'}</>
                )}
              </ActionButton>
              <WriteError error={run.error} />
              {/* Fonksiyonun reddi bir hata değil, bir cevaptır: alım kaydı
                  oluştu ve sebebini taşıyor. Kelimesi kelimesine gösterilir. */}
              {run.data?.error && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{run.data.error}</span>
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            {tr
              ? 'Belge okutmak, kasaya yazma yetkisi ister: okunan belge kasaya girer.'
              : 'Having a document read needs permission to write to the vault, because the document goes into it.'}
          </p>
        )}

        <IntakeList rows={intakes.data ?? []} loading={intakes.isLoading} />
      </div>
    </section>
  );
};

const IntakeList: React.FC<{ rows: IntakeRecord[]; loading: boolean }> = ({ rows, loading }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {tr ? 'Okumalar yükleniyor…' : 'Loading readings…'}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        {tr
          ? 'Henüz okunmuş belge yok. Bir dosya yükleyince ne olduğu burada görünür.'
          : 'No document has been read yet. Upload one and what it is will appear here.'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {row.state === 'ready' && (
                <p className="text-sm font-semibold text-slate-900">{row.classifiedAs}</p>
              )}
              {row.state === 'analysing' && (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {tr ? 'Okunuyor' : 'Being read'}
                </p>
              )}
              {row.state === 'failed' && (
                <p className="text-sm font-semibold text-rose-800">
                  {tr ? 'Okunamadı' : 'Could not be read'}
                </p>
              )}
              <p className="text-xs text-slate-500">{formatDate(row.createdAt, language)}</p>
            </div>
            {row.state === 'ready' && row.pageCount !== null && (
              <Pill>
                {row.pageCount} {tr ? 'sayfa' : 'pages'}
              </Pill>
            )}
          </div>

          {/* Gerekçe. Onsuz sınıflandırma denetlenemez. */}
          {row.classificationWhy && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{row.classificationWhy}</p>
          )}

          {/* Sebep. "Olmadı" bir cevap değil. */}
          {row.failureReason && (
            <p className="mt-1.5 text-sm leading-relaxed text-rose-800">{row.failureReason}</p>
          )}

          {row.touches.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">
                {tr ? 'İlgilendirebileceği kütükler:' : 'Registers it could touch:'}
              </span>
              {row.touches.map((key) => (
                <Pill key={key} className="border-amber-300 bg-amber-50 text-amber-900">
                  {registerName(key, tr)}
                </Pill>
              ))}
            </div>
          )}

          {/* Hiçbir kütüğe işaret etmemek bir cevaptır ve söylenir: aksi
              hâlde ekran "henüz bakmadım" ile "baktım, bir şey yok"u
              birbirine karıştırır. */}
          {row.state === 'ready' && row.touches.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {tr
                ? 'Bu belgenin metni hiçbir kütüğe kayıt açmayı desteklemiyor.'
                : 'Nothing in this document’s text supports adding a record to any register.'}
            </p>
          )}

          {row.state === 'ready' && row.extractedChars !== null && (
            <p className="mt-2 text-xs text-slate-500">
              {row.extractedChars > 12_000
                ? tr
                  ? `${row.extractedChars.toLocaleString('tr-TR')} karakter çıkarıldı; sınıflandırma ilk 12.000 karakterden yapıldı.`
                  : `${row.extractedChars.toLocaleString('en-GB')} characters extracted; the reading used the first 12,000.`
                : tr
                  ? `${row.extractedChars.toLocaleString('tr-TR')} karakterin tamamı okundu.`
                  : `All ${row.extractedChars.toLocaleString('en-GB')} characters were read.`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
};
