/**
 * The one box (M13-05, M13-06).
 *
 * What this replaces: a component that pulled five whole registers into the
 * browser — every case, document, block, trustee and transaction — and
 * filtered them with String.includes. Three things were wrong with that
 * beyond the bandwidth. It covered five registers out of nineteen, so the
 * minutes, the decisions, the obligations and the risk register were simply
 * not searchable. It could never match a Turkish word to its stem, so
 * "duruşma" did not find "duruşmalar". And its suggestion chips offered
 * "807.3M KShs" and "Status Quo" — figures and claims with no query behind
 * them, of the same kind Faz 0 took off the footer.
 *
 * Now every keystroke past two characters asks the database, which stems both
 * languages, matches case numbers literally, and filters by the asker's own
 * policies. The search cannot show anybody anything they could not already
 * open, and the component does nothing to arrange that.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookmarkPlus, Loader2, Search, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  useDeleteSavedSearch,
  useSaveSearch,
  useSavedSearches,
  useSearch,
} from '../api/searchHooks';
import { MIN_QUERY } from '../api/search';
import { QueryStatus } from './QueryStatus';
import { Pill } from './ui/Controls';
import { ALL_KINDS, kindIcon, kindLabel, routeFor } from '../lib/search';
import { formatDate } from '../lib/site';
import type { Confidentiality, SearchKind } from '../types';

/** Debounce, so typing a case number is one query and not eleven. */
function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const TIER: Record<Confidentiality, string> = {
  public: 'border-slate-300 bg-slate-100 text-slate-700',
  internal: 'border-sky-300 bg-sky-50 text-sky-900',
  confidential: 'border-amber-300 bg-amber-50 text-amber-900',
  restricted: 'border-rose-300 bg-rose-50 text-rose-900',
};

const TIER_LABEL: Record<Confidentiality, { tr: string; en: string }> = {
  public: { tr: 'açık', en: 'public' },
  internal: { tr: 'kurum içi', en: 'internal' },
  confidential: { tr: 'gizli', en: 'confidential' },
  restricted: { tr: 'kısıtlı', en: 'restricted' },
};

/**
 * The snippet arrives with the matched words between guillemets, which the
 * database chose over HTML tags precisely so this could stay text. Splitting
 * on them is how the highlight happens without dangerouslySetInnerHTML.
 */
const Snippet: React.FC<{ text: string }> = ({ text }) => (
  <>
    {
      text.split(/([«»])/).reduce<{ out: React.ReactNode[]; on: boolean }>(
        (acc, part, i) => {
          if (part === '«') return { ...acc, on: true };
          if (part === '»') return { ...acc, on: false };
          if (part === '') return acc;
          acc.out.push(
            acc.on ? (
              <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">
                {part}
              </mark>
            ) : (
              <span key={i}>{part}</span>
            ),
          );
          return acc;
        },
        { out: [], on: false },
      ).out
    }
  </>
);

export const GlobalSearchModal: React.FC = () => {
  const { language, isSearchOpen, setIsSearchOpen, searchQuery, setSearchQuery } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [kinds, setKinds] = useState<SearchKind[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const debounced = useDebounced(searchQuery, 250);
  const results = useSearch(debounced, kinds, 40);
  const saved = useSavedSearches();
  const keep = useSaveSearch();
  const forget = useDeleteSavedSearch();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(!isSearchOpen);
      }
      if (e.key === 'Escape' && isSearchOpen) setIsSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSearchOpen, setIsSearchOpen]);

  useEffect(() => {
    if (isSearchOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isSearchOpen]);

  const rows = results.data ?? [];

  /** Which registers the current results actually came from, for the filters. */
  const present = useMemo(() => {
    const seen = new Set<SearchKind>();
    for (const row of rows) seen.add(row.kind);
    return ALL_KINDS.filter((k) => seen.has(k));
  }, [rows]);

  if (!isSearchOpen) return null;

  const typed = searchQuery.trim();
  const tooShort = typed.length > 0 && typed.length < MIN_QUERY;

  const open = (hit: (typeof rows)[number]) => {
    navigate(routeFor(hit));
    setIsSearchOpen(false);
  };

  const toggleKind = (kind: SearchKind) =>
    setKinds((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    );

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16 backdrop-blur-xs sm:pt-24">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3.5">
          {results.isFetching ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-600" aria-hidden="true" />
          ) : (
            <Search className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              tr
                ? 'Dava no, tutanak, yükümlülük, paydaş, ödeme — hepsi tek kutudan'
                : 'Case number, minute, obligation, stakeholder, payment — one box'
            }
            aria-label={tr ? 'Kayıtlarda ara' : 'Search the records'}
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={tr ? 'Temizle' : 'Clear'}
              className="cursor-pointer p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 shadow-xs sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Narrowing by register. Only the registers that actually produced a
            hit are offered, because a filter that can only ever return
            nothing is noise. */}
        {present.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2">
            {present.map((kind) => {
              const on = kinds.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  aria-pressed={on}
                  className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                    on
                      ? 'border-amber-300 bg-amber-100 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {kindLabel(kind, language)}
                </button>
              );
            })}
            {kinds.length > 0 && (
              <button
                type="button"
                onClick={() => setKinds([])}
                className="cursor-pointer px-2 py-0.5 text-[11px] text-slate-500 underline hover:text-slate-800"
              >
                {tr ? 'tümü' : 'all'}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <QueryStatus queries={[results]} />

          {typed.length === 0 && (
            <div className="space-y-4 py-6 text-center">
              <p className="text-xs text-slate-500">
                {tr
                  ? 'On dokuz kütüğün tamamında arar: davalar, kararlar, tutanaklar, belgeler, paydaşlar, yükümlülükler, riskler, saha işleri, ödemeler.'
                  : 'Searches all nineteen registers: cases, orders, minutes, documents, stakeholders, obligations, risks, site work, payments.'}
              </p>
              <p className="text-[11px] text-slate-400">
                {tr
                  ? 'Türkçe sorgu İngilizce kaydı bulur, çünkü kayıtlar iki dilli tutuluyor. Dava numarası yazarsanız harfi harfine eşleşir.'
                  : 'A Turkish query finds an English record, because the records are kept in both. Type a case number and it matches literally.'}
              </p>

              {/* Somebody's own kept searches, which is the only list of
                  suggestions this box has any business showing (M13-11). */}
              {(saved.data ?? []).length > 0 && (
                <div className="mx-auto max-w-md space-y-1.5 text-left">
                  <p className="text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    {tr ? 'Kayıtlı aramalarınız' : 'Your saved searches'}
                  </p>
                  {(saved.data ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery(item.query);
                          setKinds(item.kinds ?? []);
                        }}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                      >
                        <span className="text-xs font-medium text-slate-900">{item.name}</span>
                        <span className="ml-2 font-mono text-[11px] text-slate-500">
                          {item.query}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => forget.mutate(item.id)}
                        aria-label={tr ? 'Aramayı sil' : 'Delete saved search'}
                        className="cursor-pointer p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tooShort && (
            <p className="py-6 text-center text-xs text-slate-500">
              {tr
                ? 'En az iki harf yazın — tek harf bütün arşivle eşleşirdi.'
                : 'Two characters at least — one would match the whole archive.'}
            </p>
          )}

          {!tooShort && typed.length >= MIN_QUERY && results.isSuccess && rows.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500">
              {tr
                ? 'Görmeye yetkili olduğunuz kayıtlar arasında eşleşme yok. Başka bir kayıt olabilir ama o zaman görmeye yetkiniz yok demektir.'
                : 'Nothing you are cleared to see matches. There may be a record; if so, you are not cleared for it.'}
            </p>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500">
                  {tr ? `${rows.length} sonuç` : `${rows.length} results`}
                </p>
                {!naming ? (
                  <button
                    type="button"
                    onClick={() => {
                      setName(typed);
                      setNaming(true);
                    }}
                    className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    {tr ? 'Bu aramayı kaydet' : 'Save this search'}
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!name.trim()) return;
                      keep.mutate(
                        { name, query: typed, kinds },
                        { onSuccess: () => setNaming(false) },
                      );
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={tr ? 'Arama adı' : 'Name this search'}
                      aria-label={tr ? 'Arama adı' : 'Name this search'}
                      className="w-36 rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
                    />
                    <button
                      type="submit"
                      disabled={keep.isPending}
                      className="cursor-pointer rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 disabled:opacity-50"
                    >
                      {tr ? 'kaydet' : 'save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNaming(false)}
                      className="cursor-pointer px-1 text-[11px] text-slate-500"
                    >
                      {tr ? 'vazgeç' : 'cancel'}
                    </button>
                  </form>
                )}
              </div>

              <ul className="divide-y divide-slate-100">
                {rows.map((hit) => {
                  const Icon = kindIcon(hit.kind);
                  const title = tr ? (hit.titleTr ?? hit.titleEn) : (hit.titleEn ?? hit.titleTr);
                  return (
                    <li key={`${hit.kind}-${hit.id}`}>
                      <button
                        type="button"
                        onClick={() => open(hit)}
                        className="flex w-full cursor-pointer items-start gap-2.5 py-2 text-left hover:bg-slate-50"
                      >
                        <Icon
                          className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-slate-900">
                              {title ?? (tr ? '(başlıksız)' : '(untitled)')}
                            </span>
                            <Pill>{kindLabel(hit.kind, language)}</Pill>
                            {/* The tier, named. Somebody about to forward a
                                search result should be able to see from the
                                result that they must not. */}
                            <Pill className={TIER[hit.confidentiality]}>
                              {tr
                                ? TIER_LABEL[hit.confidentiality].tr
                                : TIER_LABEL[hit.confidentiality].en}
                            </Pill>
                            {hit.occurredOn && (
                              <span className="font-mono text-[11px] text-slate-500">
                                {formatDate(hit.occurredOn, language)}
                              </span>
                            )}
                          </div>
                          {hit.subtitle && (
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {hit.subtitle}
                            </p>
                          )}
                          {hit.snippet && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">
                              <Snippet text={hit.snippet} />
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
