import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Loader2, RefreshCw, Search, TriangleAlert, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchQueue,
  fetchQueueCounts,
  reanalyse,
  type IntakeDisposition,
  type QueueEntry,
} from '../../api/intake';
import { declineRemaining, fetchProposals, type Proposal } from '../../api/proposals';
import { ProposalCard } from './ProposalCard';
import { ActionButton, Pill, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import { wordFor } from '../../lib/labels';

/**
 * Alım kuyruğu (M13-20, M13-22).
 *
 * Bu dosya bir yeniden düşünmenin sonucu. Önceki hâli tek düz listeydi: en
 * yeni yirmi okuma, hepsi aynı yerde — okunuyor olan, kararı bekleyen,
 * kararı bitmiş, okunamayan, ve teklif üretemeyen bir sürümle okunmuş olan.
 * Yirmiden sonrası sessizce yoktu. Yüz belge sonra çalışılamaz hâle geleceği
 * söylendi ve doğruydu; aslında yirmide oluyordu.
 *
 * Kusur ekranda değil modeldeydi: **hiçbir şey kuyruktan çıkmıyordu.** Üç
 * şeyin gidecek bir yeri olunca çıkabiliyor:
 *
 *   - Kabul edilen, kaydını kütüğünde açtı; nereden geldiği artık belgenin
 *     yanında yazıyor (`DocumentOrigin`), o yüzden kartının burada kalması
 *     gerekmiyor.
 *   - Reddedilen, kararı `intake_rejections`'a yazılıp kuyruktan çıkıyor ve
 *     aynı cümle bir daha teklif edilmiyor.
 *   - Kararı bitmiş okuma "Tamamlanan"a düşüyor: tek satır, sayılarıyla.
 *
 * Sıralama duruma göre değişiyor ve bu kasıtlı. Karar bekleyenler bir
 * kuyruktur, en eskiden akar — en yeniyi öne almak en uzun bekleyeni en dibe
 * gömer. Tamamlananlar arşivdir, orada en yeni önce gelir.
 */

const TABS: { key: IntakeDisposition; tr: string; en: string }[] = [
  { key: 'awaiting_decision', tr: 'Karar bekleyen', en: 'Awaiting a decision' },
  { key: 'reading', tr: 'Okunuyor', en: 'Being read' },
  { key: 'unreadable', tr: 'Okunamayan', en: 'Could not be read' },
  { key: 'read_before_proposals', tr: 'Eski okuma', en: 'Older reading' },
  { key: 'settled', tr: 'Tamamlanan', en: 'Finished' },
];

const PAGE = 10;

export const IntakeQueue: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [tab, setTab] = React.useState<IntakeDisposition>('awaiting_decision');
  const [search, setSearch] = React.useState('');
  const [size, setSize] = React.useState(PAGE);

  const counts = useQuery({ queryKey: ['intakeQueueCounts'], queryFn: fetchQueueCounts });

  const queue = useQuery({
    queryKey: ['intakeQueue', tab, search, size],
    queryFn: () => fetchQueue({ disposition: tab, search, limit: size }),
  });

  const rows = queue.data?.rows ?? [];
  const total = queue.data?.total ?? 0;

  // Teklifler yalnız karar bekleyen sekmede ve yalnız görünen okumalar için
  // çekiliyor. Bütün tekliflerin her sekmede çekilmesi, ekranın yüz belgede
  // çökmesinin ikinci sebebiydi.
  const intakeIds = tab === 'awaiting_decision' ? rows.map((row) => row.intakeId) : [];
  const proposals = useQuery({
    queryKey: ['intakeProposals', intakeIds],
    queryFn: () => fetchProposals(intakeIds),
    enabled: intakeIds.length > 0,
  });

  const changeTab = (next: IntakeDisposition) => {
    setTab(next);
    setSize(PAGE);
  };

  return (
    <div className="space-y-3">
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {TABS.map((entry) => {
          const n = counts.data?.[entry.key];
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => changeTab(entry.key)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                tab === entry.key
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{tr ? entry.tr : entry.en}</span>
              {/* Sayısı olmayan sekme, tıklanana kadar boş mu dolu mu
                  olduğunu söylemiyor. Sayı gelmediyse yerine bir şey
                  uydurulmuyor. */}
              {n !== undefined && <span className="tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSize(PAGE);
          }}
          placeholder={tr ? 'Belge adında ara' : 'Search the document title'}
          className="min-h-10 w-full bg-transparent py-1.5 text-sm text-slate-900 focus:outline-none md:min-h-8"
        />
      </label>

      {queue.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {tr ? 'Kuyruk yükleniyor…' : 'Loading the queue…'}
        </p>
      ) : rows.length === 0 ? (
        <Empty tab={tab} searching={search.trim() !== ''} />
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((row) =>
              tab === 'settled' ? (
                <SettledRow key={row.intakeId} row={row} />
              ) : (
                <QueueCard
                  key={row.intakeId}
                  row={row}
                  proposals={(proposals.data ?? []).filter((p) => p.intakeId === row.intakeId)}
                />
              ),
            )}
          </ul>

          {/* Kaçının gösterildiği ve kaç tane olduğu. "En yeni 20" diye
              sessizce kesmek, geri kalanın var olmadığını sandırıyordu. */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-500">
              {tr
                ? `${total} okumanın ${rows.length} tanesi gösteriliyor`
                : `showing ${rows.length} of ${total}`}
            </p>
            {rows.length < total && (
              <ActionButton tone="quiet" onClick={() => setSize(size + PAGE)}>
                {tr ? 'Daha fazla' : 'Show more'}
              </ActionButton>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Empty: React.FC<{ tab: IntakeDisposition; searching: boolean }> = ({ tab, searching }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  if (searching) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        {tr ? 'Bu adla bir okuma yok.' : 'No reading matches that title.'}
      </p>
    );
  }

  // Her sekmenin boşluğu başka bir şey söylüyor. Hepsine aynı cümleyi yazmak,
  // bitmiş bir kuyruğu hiç başlamamış bir kuyrukla aynı göstermek olurdu.
  const words: Record<IntakeDisposition, { tr: string; en: string }> = {
    awaiting_decision: {
      tr: 'Karar bekleyen bir şey yok. Okunan her belgenin teklifleri kararını almış.',
      en: 'Nothing is waiting. Every document read has had its proposals decided.',
    },
    reading: {
      tr: 'Şu an okunan bir belge yok.',
      en: 'No document is being read right now.',
    },
    unreadable: {
      tr: 'Okunamayan belge yok.',
      en: 'No document failed to be read.',
    },
    read_before_proposals: {
      tr: 'Teklif üretemeyen bir sürümle okunmuş belge kalmadı.',
      en: 'No document is left that was read before the module could propose records.',
    },
    settled: {
      tr: 'Henüz kararı bitmiş bir okuma yok.',
      en: 'No reading has had all its proposals decided yet.',
    },
  };

  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
      <Inbox className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
      {wordFor(words, tab, language)}
    </p>
  );
};

/** Kararı bitmiş okuma: tek satır, sayılarıyla. Detayı belgenin yanında. */
const SettledRow: React.FC<{ row: QueueEntry }> = ({ row }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-900">{row.documentTitle}</p>
        <p className="text-xs text-slate-500">
          {row.classifiedAs ?? (tr ? 'sınıflandırılmadı' : 'not classified')} ·{' '}
          {formatDate(row.createdAt, language)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.applied > 0 && (
          <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
            {row.applied} {tr ? 'kayıt' : 'recorded'}
          </Pill>
        )}
        {row.rejected > 0 && (
          <Pill>
            {row.rejected} {tr ? 'red' : 'declined'}
          </Pill>
        )}
        {row.applied === 0 && row.rejected === 0 && (
          <span className="text-xs text-slate-500">
            {tr ? 'teklif çıkmadı' : 'nothing was proposed'}
          </span>
        )}
      </div>
    </li>
  );
};

const QueueCard: React.FC<{ row: QueueEntry; proposals: Proposal[] }> = ({ row, proposals }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{row.documentTitle}</p>
          <p className="text-xs text-slate-500">
            {row.disposition === 'reading' ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {tr ? 'okunuyor' : 'being read'}
              </span>
            ) : (
              (row.classifiedAs ?? (tr ? 'sınıflandırılmadı' : 'not classified'))
            )}{' '}
            · {formatDate(row.createdAt, language)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {row.pending > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              {row.pending} {tr ? 'teklif' : 'proposed'}
            </Pill>
          )}
          {row.applied > 0 && (
            <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
              {row.applied} {tr ? 'kayıt' : 'recorded'}
            </Pill>
          )}
          {row.pageCount !== null && (
            <Pill>
              {row.pageCount} {tr ? 'sayfa' : 'pages'}
            </Pill>
          )}
        </div>
      </div>

      {row.classificationWhy && (
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{row.classificationWhy}</p>
      )}

      {row.failureReason && (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm leading-relaxed text-rose-800">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{row.failureReason}</span>
        </p>
      )}

      {row.aboutEn && (
        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm leading-relaxed text-slate-700">
          {row.aboutEn}
        </p>
      )}

      {proposals.length > 0 && (
        <div className="mt-2.5">
          <p className="text-xs font-medium text-slate-600">
            {tr
              ? `${proposals.length} kayıt teklifi — her biri onayınla açılır`
              : `${proposals.length} proposed record${proposals.length === 1 ? '' : 's'} — each is created when you approve`}
          </p>
          <ul className="mt-1.5 space-y-2">
            {proposals.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} />
            ))}
          </ul>
          <DeclineRemaining intakeId={row.intakeId} pending={proposals.length} />
        </div>
      )}

      {row.disposition === 'read_before_proposals' && (
        <ReadAgain
          versionId={row.documentVersionId}
          note={
            tr
              ? 'Bu okuma, modül henüz kayıt teklif edemezken yapıldı. Yeniden okutmak teklifleri üretir.'
              : 'This reading was made before the module could propose records. Reading it again produces them.'
          }
        />
      )}

      {row.disposition === 'unreadable' && (
        <ReadAgain versionId={row.documentVersionId} note={null} />
      )}

      {row.extractedChars !== null && row.extractedChars > 30_000 && (
        <p className="mt-2 text-xs text-slate-500">
          {tr
            ? `${row.extractedChars.toLocaleString('tr-TR')} karakter çıkarıldı; okuma ilk 30.000 karakterden yapıldı.`
            : `${row.extractedChars.toLocaleString('en-GB')} characters extracted; the reading used the first 30,000.`}
        </p>
      )}
    </li>
  );
};

/**
 * Kalanları tek kararla reddet.
 *
 * Toplu **kabul** karşılığı yok ve olmayacak (M13-24): bir kaydın açılması, o
 * kaydı birinin görmüş olmasını ister. Toplu red bir kayıt açmıyor, açmamaya
 * karar veriyor — ve o kararın tek gerekçesi olabilir.
 */
const DeclineRemaining: React.FC<{ intakeId: string; pending: number }> = ({
  intakeId,
  pending,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');

  const decline = useMutation({
    mutationFn: () => declineRemaining(intakeId, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intakeProposals'] });
      void queryClient.invalidateQueries({ queryKey: ['intakeQueue'] });
      void queryClient.invalidateQueries({ queryKey: ['intakeQueueCounts'] });
      void queryClient.invalidateQueries({ queryKey: ['intakeRejections'] });
      setOpen(false);
      setNote('');
    },
  });

  if (pending < 2) return null;

  return (
    <div className="mt-2">
      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            className="w-56"
            value={note}
            placeholder={tr ? 'Gerekçe (isteğe bağlı)' : 'Reason (optional)'}
            onChange={(event) => setNote(event.target.value)}
          />
          <ActionButton tone="danger" disabled={decline.isPending} onClick={() => decline.mutate()}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {decline.isPending
              ? tr
                ? 'Reddediliyor…'
                : 'Declining…'
              : tr
                ? `${pending} teklifi reddet`
                : `Decline all ${pending}`}
          </ActionButton>
          <ActionButton tone="quiet" onClick={() => setOpen(false)}>
            {tr ? 'Vazgeç' : 'Cancel'}
          </ActionButton>
        </div>
      ) : (
        <ActionButton tone="quiet" onClick={() => setOpen(true)}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          {tr ? 'Kalanları reddet' : 'Decline the rest'}
        </ActionButton>
      )}
      <WriteError error={decline.error} />
    </div>
  );
};

/**
 * Aynı sürümü yeniden okut.
 *
 * Belge kasada; yeniden yüklemek ikinci bir sürüm yaratır ve kasada aynı
 * belgenin iki kopyası durur. Okuma yeni bir alım satırı açıyor, eskisini
 * silmiyor: bir kanaatin ne zaman verildiği de kayıttır.
 */
const ReadAgain: React.FC<{ versionId: string; note: string | null }> = ({ versionId, note }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const queryClient = useQueryClient();
  const again = useMutation({
    mutationFn: () => reanalyse(versionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intakeQueue'] });
      void queryClient.invalidateQueries({ queryKey: ['intakeQueueCounts'] });
      void queryClient.invalidateQueries({ queryKey: ['intakeProposals'] });
    },
  });

  return (
    <div className="mt-2">
      {note && <p className="text-xs text-slate-500">{note}</p>}
      <ActionButton
        tone="quiet"
        className="mt-1.5"
        disabled={again.isPending}
        onClick={() => again.mutate()}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${again.isPending ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        {again.isPending ? (tr ? 'Okunuyor…' : 'Reading…') : tr ? 'Yeniden oku' : 'Read again'}
      </ActionButton>
      {again.data?.note && <p className="mt-1.5 text-xs text-slate-500">{again.data.note}</p>}
      {again.data?.error && <p className="mt-1.5 text-sm text-amber-900">{again.data.error}</p>}
      <WriteError error={again.error} />
    </div>
  );
};
