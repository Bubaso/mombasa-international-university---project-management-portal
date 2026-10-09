import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ActionButton } from './Controls';

/**
 * İşi bitmiş kayıtlar: sayılı, kapalı, ve istendiğinde açılan.
 *
 * Asistan sayfasının kusurunun kütük tarafı bu. Bir listede bitmiş iş
 * bekleyen işle aynı ağırlıkta durduğu sürece liste boşalmıyor; yüz kayıttan
 * sonra bakılacak şeyi bulmak, bakılmayacak şeyleri geçmekle aynı işe
 * dönüşüyor. Bitmiş olanı **silmek** cevap değil — kütük kütüktür, kapanmış
 * bir sorun da bir kayıttır. Cevap onu geri çekmek.
 *
 * Üç şey kasıtlı:
 *
 *   **Sayı her zaman görünür.** Kapalı bir bölüm, sayısı yazmazsa boş mu dolu
 *   mu olduğunu söylemiyor. "Tamamlanan" yazıp kaç tane olduğunu söylememek,
 *   listeyi kesip kaç tane kaldığını söylememekle aynı sessizlik.
 *
 *   **Varsayılan kapalı.** Bitmiş iş isteyerek bakılan bir şeydir; açılışta
 *   açık durması, geri çekmenin kendisini iptal eder.
 *
 *   **Açıldığında da sayfalı.** Beş yıllık bir projenin kapanmış kayıtları
 *   bir ekrana sığmaz ve hepsini birden çizmek, geri çekmediğimiz hâliyle
 *   aynı yükü geri getirir.
 *
 * Satırın nasıl çizildiği çağırana ait: her kütüğün satırı kendi kütüğüne
 * benziyor ve burada ortaklaştırılacak bir şey yok. Ortak olan yalnız "geri
 * çekilmiş olanı nasıl sunarız" sorusu.
 */

const PAGE = 10;

export function SettledSection<T>({
  rows,
  children,
  label,
  pageSize = PAGE,
}: {
  rows: readonly T[];
  /** Gösterilecek satırları çizen taraf. */
  children: (shown: readonly T[]) => React.ReactNode;
  /** Varsayılan "Tamamlanan" yerine o kütüğün kendi kelimesi. */
  label?: { tr: string; en: string };
  pageSize?: number;
}) {
  const { language } = useApp();
  const tr = language === 'tr';
  const [open, setOpen] = React.useState(false);
  const [size, setSize] = React.useState(pageSize);

  if (rows.length === 0) return null;

  const word = label ? label[tr ? 'tr' : 'en'] : tr ? 'Tamamlanan' : 'Finished';
  const shown = rows.slice(0, size);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="mt-2 border-t border-slate-200 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      >
        <Chevron className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {rows.length} {word.toLowerCase()}
        </span>
      </button>

      {open && (
        <div className="mt-1.5">
          {children(shown)}
          {shown.length < rows.length && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-500">
                {tr
                  ? `${rows.length} kayıttan ${shown.length} tanesi`
                  : `${shown.length} of ${rows.length}`}
              </p>
              <ActionButton tone="quiet" onClick={() => setSize(size + pageSize)}>
                {tr ? 'Daha fazla' : 'Show more'}
              </ActionButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
