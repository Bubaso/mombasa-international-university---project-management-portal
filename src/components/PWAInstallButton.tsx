import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useApp } from '../context/AppContext';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { language, showToast } = useApp();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running in standalone mode, hide
  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-medium bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-md">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        {language === 'tr' ? 'PWA Yüklü' : 'PWA Installed'}
      </span>
    );
  }

  // Chromium / Android flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        title={language === 'tr' ? 'Cihaza yükle' : 'Install to home screen'}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{language === 'tr' ? 'Uygulamayı Yükle (PWA)' : 'Install PWA App'}</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs font-medium"
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-600" />
          <span>{language === 'tr' ? 'iOS’a Ekle' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl text-slate-800">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-600" />
                  {language === 'tr' ? 'iPhone / iPad’e Yükleme' : 'Install on iPhone / iPad'}
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600">
                <li className="flex gap-2.5">
                  <span className="font-bold text-amber-600">1.</span>
                  <span>
                    {language === 'tr'
                      ? 'Safari alt çubuğundaki Paylaş (Share) simgesine dokunun.'
                      : 'Tap the Share icon at the bottom of Safari.'}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bold text-amber-600">2.</span>
                  <span>
                    {language === 'tr'
                      ? 'Aşağı kaydırıp "Ana Ekrana Ekle" (Add to Home Screen) seçeneğini seçin.'
                      : 'Scroll down and tap "Add to Home Screen".'}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bold text-amber-600">3.</span>
                  <span>
                    {language === 'tr'
                      ? 'Sağ üst köşedeki "Ekle" düğmesine basın. Uygulama bağımsız ekranında çalışacaktır.'
                      : 'Tap "Add" in top-right. The portal will launch in full standalone mode.'}
                  </span>
                </li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-100 hover:bg-slate-200 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                {language === 'tr' ? 'Anladım, Kapat' : 'Got it, Close'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback direct button for desktop Chrome/Edge or manual check
  return (
    <button
      onClick={() => {
        showToast(
          language === 'tr'
            ? 'Tarayıcı adres çubuğunun sağındaki "Yükle" simgesine tıklayarak uygulamayı kurabilirsiniz.'
            : 'Click the install icon in your browser address bar to install this applet.',
        );
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs font-medium"
      title={language === 'tr' ? 'PWA Yükleme Rehberi' : 'PWA Ready'}
    >
      <Download className="w-3.5 h-3.5 text-amber-600" />
      <span>{language === 'tr' ? 'PWA Yükle' : 'Install PWA'}</span>
    </button>
  );
};
