import React from 'react';
import { useApp } from '../../context/AppContext';
import { ActionButton } from './Controls';

/**
 * Kaç tanesini görüyorsun, kaç tane var.
 *
 * Kütük turunun ikinci sorusunun cevabı. `SettledSection` bitmiş işi geri
 * çekiyor; bu, **kesilmiş olanı söylüyor.** İkisi ayrı şey: biri karara
 * bağlanmış kaydı, biri hiç çekilmemiş kaydı anlatıyor.
 *
 * İki şey kasıtlı:
 *
 *   **Liste tamsa da bir şey yazıyor.** "134 kayıt" demek, listenin bittiğini
 *   söylemenin tek yolu. Sessiz kalmak, okuyanın kesilip kesilmediğini
 *   bilmemesi demek — ve asistan sayfasının kusuru tam olarak buydu.
 *
 *   **Düğme yalnız gizlenmiş satır varken var.** Basacak bir şey kalmadığında
 *   düğmenin durması, olmayan bir şeyi vaat etmek olurdu.
 */
export const MoreRows: React.FC<{
  /** Ekranda çizilen satır sayısı. */
  shown: number;
  /** Kütükteki toplam satır sayısı. */
  total: number;
  /** Daha fazlasını istemek. Yoksa yalnız sayı yazılıyor. */
  onMore?: () => void;
  /** Yükleme sürerken düğme kapalı. */
  busy?: boolean;
}> = ({ shown, total, onMore, busy = false }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  if (total === 0) return null;

  const hidden = total - shown;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
      <p className="text-sm text-slate-500">
        {hidden > 0
          ? tr
            ? `${total} kayıttan ${shown} tanesi`
            : `${shown} of ${total}`
          : tr
            ? `${total} kayıt, hepsi burada`
            : `${total} records, all of them`}
      </p>
      {hidden > 0 && onMore && (
        <ActionButton tone="quiet" onClick={onMore} disabled={busy}>
          {tr ? 'Daha fazla' : 'Show more'}
        </ActionButton>
      )}
    </div>
  );
};
