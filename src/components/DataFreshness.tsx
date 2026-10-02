/**
 * When what you are looking at was last fetched (M12-05).
 *
 * The requirement asks for it because a dashboard is the one screen people
 * leave open. A figure that was true forty minutes ago looks exactly like one
 * that was true a second ago, and somebody makes a decision on the older of
 * the two without ever knowing there was a choice.
 *
 * It reports the oldest of the queries it is given, not the newest: a panel
 * is only as current as its stalest part, and averaging would hide that.
 */
import React, { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface Freshenable {
  dataUpdatedAt: number;
  isFetching: boolean;
  refetch: () => unknown;
}

function ago(ms: number, tr: boolean): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 45) return tr ? 'şimdi' : 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return tr ? `${minutes} dk önce` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr ? `${hours} saat önce` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return tr ? `${days} gün önce` : `${days} d ago`;
}

export const DataFreshness: React.FC<{ queries: Freshenable[]; className?: string }> = ({
  queries,
  className = '',
}) => {
  const { language } = useApp();
  const tr = language === 'tr';

  // Re-renders on a timer, because otherwise "just now" stays on screen for
  // an hour and the indicator becomes the thing it was meant to prevent.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const stamps = queries.map((q) => q.dataUpdatedAt).filter((t) => t > 0);
  if (stamps.length === 0) return null;

  const oldest = Math.min(...stamps);
  const fetching = queries.some((q) => q.isFetching);

  return (
    <div className={`flex items-center gap-1.5 text-xs text-slate-500 ${className}`}>
      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {tr ? 'Son güncelleme: ' : 'Last updated '}
        {fetching ? (tr ? 'yenileniyor…' : 'refreshing…') : ago(Date.now() - oldest, tr)}
      </span>
      <button
        type="button"
        onClick={() => queries.forEach((q) => q.refetch())}
        className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 font-medium text-slate-600 hover:bg-slate-100"
        title={tr ? 'Şimdi yenile' : 'Refresh now'}
      >
        <RefreshCw className={`h-3 w-3 ${fetching ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span>{tr ? 'Yenile' : 'Refresh'}</span>
      </button>
    </div>
  );
};
