import React from 'react';
import { AlertTriangle, Loader2, PlugZap, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isSupabaseConfigured } from '../lib/supabase';

/** The slice of a react-query result this component needs. */
export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface QueryStatusProps {
  queries: QueryLike[];
  className?: string;
}

/**
 * Says which of four states a screen is actually in: backend not configured,
 * still loading, failed, or fine. Renders nothing in the last case, so a view
 * that has loaded cleanly is left alone and its own empty state — meaning
 * "genuinely no records" — is not confused with a failure.
 */
export const QueryStatus: React.FC<QueryStatusProps> = ({ queries, className = '' }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  if (!isSupabaseConfigured) {
    return (
      <div
        className={`flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs ${className}`}
        role="status"
      >
        <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1">
          <div className="font-semibold text-amber-900">
            {tr ? 'Veri kaynağı bağlı değil' : 'No data source connected'}
          </div>
          <p className="leading-relaxed text-amber-900/80">
            {tr
              ? 'Bu kurulumda Supabase yapılandırılmamış. Aşağıda görünen boş listeler "kayıt yok" anlamına gelmez — hiçbir veri yüklenemiyor.'
              : 'Supabase is not configured in this build. The empty lists below do not mean "no records" — no data can be loaded at all.'}
          </p>
        </div>
      </div>
    );
  }

  const isPending = queries.some((q) => q.isPending);
  const failed = queries.filter((q) => q.isError);

  if (isPending) {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 ${className}`}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" aria-hidden="true" />
        <span>{tr ? 'Veriler yükleniyor…' : 'Loading records…'}</span>
      </div>
    );
  }

  if (failed.length > 0) {
    const first = failed[0];
    const detail = first?.error instanceof Error ? first.error.message : null;

    return (
      <div
        className={`flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs ${className}`}
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
        <div className="flex-1 space-y-1">
          <div className="font-semibold text-rose-900">
            {tr ? 'Veriler yüklenemedi' : 'Could not load records'}
          </div>
          <p className="leading-relaxed text-rose-900/80">
            {tr
              ? 'Aşağıda eksik veya boş görünen her şey bu hatadan kaynaklanıyor olabilir.'
              : 'Anything missing or empty below may be a result of this failure.'}
          </p>
          {detail && <p className="pt-0.5 font-mono text-[11px] text-rose-800/70">{detail}</p>}
        </div>
        <button
          type="button"
          onClick={() => failed.forEach((q) => q.refetch())}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 py-1 font-semibold text-rose-800 hover:bg-rose-100"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          <span>{tr ? 'Yeniden dene' : 'Retry'}</span>
        </button>
      </div>
    );
  }

  return null;
};
