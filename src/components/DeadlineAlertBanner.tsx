import React from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Calendar, Check, ShieldAlert } from 'lucide-react';

export const DeadlineAlertBanner: React.FC = () => {
  const { language, currentUser } = useApp();
  const { data: deadlines = [] } = queries.useDeadlines();
  const { mutate: dismissDeadline } = queries.useDismissDeadline();
  const navigate = useNavigate();

  // Filter deadlines relevant to current user role or general
  const relevantDeadlines = deadlines.filter(
    (d) => d.targetRole.includes(currentUser.role) || currentUser.role === 'trustee' || currentUser.role === 'executive'
  );

  if (relevantDeadlines.length === 0) return null;

  return (
    <div className="bg-amber-50/90 border-b border-amber-200 px-3 sm:px-4 py-1.5 sm:py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-900 font-semibold uppercase tracking-wider shrink-0 text-[11px] sm:text-xs">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
            <span>{language === 'tr' ? 'Önemli Takvim' : 'Critical Deadlines'}</span>
          </div>

          {/* Mobile view single top item indicator */}
          <div className="sm:hidden text-[10px] font-mono text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
            {relevantDeadlines[0]?.daysRemaining} {language === 'tr' ? 'gün kaldı' : 'days left'}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
          {relevantDeadlines.slice(0, 2).map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border shadow-xs text-xs whitespace-nowrap ${
                item.urgency === 'critical'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-amber-100/70 border-amber-300 text-amber-900'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${item.urgency === 'critical' ? 'text-rose-600' : 'text-amber-600'}`} />
              <span className="font-medium truncate max-w-[160px] sm:max-w-xs md:max-w-md text-[11px] sm:text-xs">
                {language === 'tr' ? item.titleTr : item.titleEn}
              </span>
              <span className="hidden sm:flex items-center gap-1 font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-800 shadow-xs">
                <Clock className="w-3 h-3 text-amber-600" />
                {item.daysRemaining} {language === 'tr' ? 'gün' : 'days'}
              </span>
              <button
                onClick={() => {
                  if (item.category === 'legal') navigate('legal');
                  else if (item.category === 'construction') navigate('construction');
                  else if (item.category === 'finance') navigate('finance');
                  else navigate('governance');
                }}
                className="text-[11px] font-semibold underline text-amber-800 hover:text-amber-950 cursor-pointer ml-1"
              >
                {language === 'tr' ? 'İncele' : 'View'}
              </button>
              <button
                onClick={() => dismissDeadline(item.id)}
                title={language === 'tr' ? 'Kapat' : 'Dismiss'}
                className="opacity-60 hover:opacity-100 hover:text-slate-900 ml-1 cursor-pointer p-0.5"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
