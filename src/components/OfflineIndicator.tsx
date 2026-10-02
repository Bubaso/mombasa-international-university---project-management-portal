import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useApp } from '../context/AppContext';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { language } = useApp();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-lg bg-amber-600/95 border border-amber-400/40 px-3.5 py-2 text-sm font-medium text-white shadow-xl backdrop-blur-md animate-bounce">
      <WifiOff className="w-4 h-4 text-white" />
      <span>
        {language === 'tr'
          ? 'Çevrimdışı Mod — Yerel önbelleğe alınan proje verileri gösteriliyor.'
          : 'Offline Mode — Serving cached project records and court files.'}
      </span>
    </div>
  );
};
