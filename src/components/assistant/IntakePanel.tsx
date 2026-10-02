import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Loader2, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchIntakes, intakeFile, type IntakeRecord } from '../../api/intake';
import { fetchProposals, type Proposal } from '../../api/proposals';
import { ProposalCard } from './ProposalCard';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { Explain } from '../ui/Explain';
import { formatDate } from '../../lib/site';
import type { Confidentiality, DocumentCategory } from '../../types';

/**
 * Belge alımı: oku, ne dediğini söyle, ne kaydedileceğini teklif et
 * (M13-13, M13-14, M13-15).
 *
 * Ekranda dört şey var ve dördü de bir ölçümün sonucu.
 *
 *   - **Ne olduğu ve neden.** Gerekçesiz bir kanaat denetlenemez; 0047'de
 *     `ready` olan bir alım gerekçesiz olamıyor.
 *   - **Ne dediği.** Ölçüm, 2 Ekim 2026: gerçek bir mektup için kanaat "bu
 *     bir mektuptur, göndereni ve konu satırı vardır" oldu. Doğruydu ve
 *     işe yaramazdı — belgenin biçimini anlatıp içeriğini anlatmıyordu.
 *     Artık ne dediği ayrı bir alan ve belgeyi açmamış birine ne olduğunu
 *     söylüyor.
 *   - **Teklifler.** Aynı ölçümde dokuz kütük "ilgilendirebilir" diye
 *     işaretlenmişti; dokuz kütük işaret etmek hiçbir şey işaret
 *     etmemektir. Artık bir kütük ancak alanları doldurulmuş somut bir
 *     teklifi varsa görünüyor, ve her teklif belgeden bir alıntı taşıyor.
 *   - **Ne kadarının okunduğu.** Belgenin tamamı okunmadıysa söylenir,
 *     yoksa ekran okumadığı bir şey hakkında kendinden emin görünür.
 *
 * Onay, kaydı kütüğün kendi normal yazma yolundan açıyor — yani o kütüğün
 * bütün politikaları ve kısıtları aynen işliyor ve kayıt, onaylayan kişinin
 * kendi oturumuyla giriyor.
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

// Kütük adlarının ikinci bir listesi burada duruyordu. Kalktı: teklifin
// kütük adı artık `targets.js`'deki hedef tanımından geliyor ve o tanım aynı
// zamanda alanları ve yazıcıyı besliyor. İki yerde tutulan isim listesi,
// birinde eskir (CLAUDE.md §4).

export const IntakePanel: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const queryClient = useQueryClient();
  const intakes = useQuery({ queryKey: ['documentIntake'], queryFn: () => fetchIntakes(20) });
  const intakeIds = (intakes.data ?? []).map((row) => row.id);
  const proposals = useQuery({
    queryKey: ['intakeProposals', intakeIds],
    queryFn: () => fetchProposals(intakeIds),
    enabled: intakeIds.length > 0,
  });

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
                ? 'Yüklenen belge kasaya girer, okunur, ve ne olduğu, ne dediği ve hangi kayıtların açılması gerektiği söylenir. Teklifler kayıt değildir: her biri belgeden bir alıntı taşır, onay verilmeden hiçbir şey yazılmaz, ve onayladığında kaydı senin kendi oturumun açar — kütüğün bütün kuralları aynen işler.'
                : 'An uploaded document goes into the vault, is read, and what it is, what it says and which records should be created are reported. A proposal is not a record: each carries a quote from the document, nothing is written until you approve, and on approval the record is created by your own session, under every rule that register has.'}
            </Explain>
          </div>
        </div>
        {/* Eski rozet "yazma yok" diyordu ve 1. fazda doğruydu. Artık
            değil: onaylanan teklif kütüğe kayıt açıyor. Doğru olmayan bir
            rozet, hiç rozet olmamasından kötüdür. */}
        <Pill className="border-slate-300 bg-slate-100 text-slate-700">
          {tr ? 'onayla yazar' : 'writes on approval'}
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

        <IntakeList
          rows={intakes.data ?? []}
          proposals={proposals.data ?? []}
          loading={intakes.isLoading}
        />
      </div>
    </section>
  );
};

const IntakeList: React.FC<{
  rows: IntakeRecord[];
  proposals: Proposal[];
  loading: boolean;
}> = ({ rows, proposals, loading }) => {
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
      {rows.map((row) => {
        const mine = proposals.filter((proposal) => proposal.intakeId === row.id);
        return (
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
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {row.classificationWhy}
              </p>
            )}

            {/* Sebep. "Olmadı" bir cevap değil. */}
            {row.failureReason && (
              <p className="mt-1.5 text-sm leading-relaxed text-rose-800">{row.failureReason}</p>
            )}

            {/* Belgenin ne dediği. Ne olduğu türünü, bu içeriğini söyler. */}
            {row.aboutEn && (
              <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm leading-relaxed text-slate-700">
                {row.aboutEn}
              </p>
            )}

            {mine.length > 0 && (
              <div className="mt-2.5">
                <p className="text-xs font-medium text-slate-600">
                  {tr
                    ? `${mine.length} kayıt teklifi — her biri onayınla açılır`
                    : `${mine.length} proposed record${mine.length === 1 ? '' : 's'} — each is created when you approve`}
                </p>
                <ul className="mt-1.5 space-y-2">
                  {mine.map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))}
                </ul>
              </div>
            )}

            {/* Hiç teklif çıkmaması bir cevaptır ve söylenir: aksi hâlde ekran
              "henüz bakmadım" ile "baktım, açılacak kayıt yok"u birbirine
              karıştırır. */}
            {row.state === 'ready' && mine.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {tr
                  ? 'Bu belgenin metni hiçbir kütüğe kayıt açmayı desteklemiyor.'
                  : 'Nothing in this document’s text supports adding a record to any register.'}
              </p>
            )}

            {row.state === 'ready' && row.extractedChars !== null && (
              <p className="mt-2 text-xs text-slate-500">
                {row.extractedChars > 30_000
                  ? tr
                    ? `${row.extractedChars.toLocaleString('tr-TR')} karakter çıkarıldı; okuma ilk 30.000 karakterden yapıldı.`
                    : `${row.extractedChars.toLocaleString('en-GB')} characters extracted; the reading used the first 30,000.`
                  : tr
                    ? `${row.extractedChars.toLocaleString('tr-TR')} karakterin tamamı okundu.`
                    : `All ${row.extractedChars.toLocaleString('en-GB')} characters were read.`}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};
