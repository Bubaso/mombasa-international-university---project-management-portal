/**
 * Communication and notification (M11).
 *
 * The requirement opens by saying what this is not: "Portal içi mesajlaşma
 * WhatsApp'ın yerini almaz. Almaya çalışmak başarısızlığın garantisidir."
 * The portal is the formal record, WhatsApp stays the daily conversation, and
 * the portal notifies WhatsApp rather than competing with it. Everything on
 * this screen follows from that: messages that cannot be edited, an
 * announcement that records who saw it, a letter register with delivery
 * confirmation — and no presence, no typing indicator, no read receipt on an
 * ordinary message.
 *
 * The screen this replaces could not save a reply at all. It wrote to a JSONB
 * column removed in 0002 and signed every message 'Current User'; both are P0
 * rows in the requirement (M11-02, M11-03) and both were live until now.
 *
 * ---
 *
 * Sekmeler, 5 Ekim 2026 (T14-04). Beş panel alt alta duruyordu ve ekran
 * uygulamanın EN KALABALIĞIYDI: 107 düğme, 3.050 piksel. Düğmelerin çoğu
 * `ThreadPanel`'den geliyor — her mesajın kendi tepki ve alıntı düğmeleri var
 * (M11-13) — yani kalabalığı yaratan panel sayısı değil, dört panelin bir
 * mesaj listesiyle aynı ekranda durmasıydı.
 *
 * Mesajlar varsayılan sekme: bu ekranın işi yazışma, gerisi onun çevresi.
 */
import React, { useState } from 'react';
import { Bell, FileSignature, MessagesSquare, Newspaper, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ThreadPanel } from '../components/comms/ThreadPanel';
import { NotificationPanel } from '../components/comms/NotificationPanel';
import { ReachPanel } from '../components/comms/ReachPanel';
import { CorrespondencePanel } from '../components/comms/CorrespondencePanel';
import { DigestPanel } from '../components/comms/DigestPanel';
import { DataFreshness } from '../components/DataFreshness';
import { useThreads } from '../api/commsHooks';

type Tab = 'threads' | 'notifications' | 'reach' | 'letters' | 'digest';

export const CommunicationView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [tab, setTab] = useState<Tab>('threads');
  const threads = useThreads();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <MessagesSquare className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'İletişim ve bildirim' : 'Communication and notification'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Portal kaydı ve WhatsApp bildirimleri.'
                : 'The portal record and WhatsApp notifications.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[threads]} />
      </header>

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {(
          [
            { key: 'threads', icon: MessagesSquare, label: tr ? 'Mesajlar' : 'Messages' },
            { key: 'notifications', icon: Bell, label: tr ? 'Bildirimler' : 'Notifications' },
            { key: 'reach', icon: Share2, label: tr ? 'Erişim' : 'Reach' },
            { key: 'letters', icon: FileSignature, label: tr ? 'Resmî yazışma' : 'Correspondence' },
            { key: 'digest', icon: Newspaper, label: tr ? 'Özet' : 'Digest' },
          ] as { key: Tab; icon: React.ElementType; label: string }[]
        ).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'threads' && <ThreadPanel />}
      {tab === 'notifications' && <NotificationPanel />}
      {tab === 'reach' && <ReachPanel />}
      {tab === 'letters' && <CorrespondencePanel />}
      {tab === 'digest' && <DigestPanel />}
    </div>
  );
};
