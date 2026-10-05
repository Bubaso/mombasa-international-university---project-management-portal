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
 */
import React from 'react';
import { MessagesSquare } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ThreadPanel } from '../components/comms/ThreadPanel';
import { NotificationPanel } from '../components/comms/NotificationPanel';
import { ReachPanel } from '../components/comms/ReachPanel';
import { CorrespondencePanel } from '../components/comms/CorrespondencePanel';
import { DigestPanel } from '../components/comms/DigestPanel';
import { DataFreshness } from '../components/DataFreshness';
import { useThreads } from '../api/commsHooks';

export const CommunicationView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
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

      <ThreadPanel />
      <NotificationPanel />
      <ReachPanel />
      <CorrespondencePanel />
      <DigestPanel />
    </div>
  );
};
