import React from 'react';
import { ChevronDown, Table2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TableFrame, Th, Td } from './Controls';

/**
 * Bir grafiğin yanındaki veri tablosu (T10-06).
 *
 * Ölçüm, 6 Ekim 2026: dört `role="img"` ögesinin hiçbirinin tablo görünümü
 * yoktu. Grafiklerin kendisi dürüsttü — `CurvePanel` çizemediğinde hangi
 * sayının eksik olduğunu söylüyor, `GanttPanel` tarihi olmayan bir planı
 * çizmiyor — ama çizebildiğinde okunan tek şey piksel oluyordu.
 *
 * Bir grafik veriyi **yaklaştırır**: bir noktanın yüksekliğinden 412 ile 418'i
 * ayırt edemezsiniz, ve bu grafiğin kusuru değil işidir. Kusur, yaklaşık
 * değerin tek sürüm olması. Rakamı isteyen biri — bir mütevelli, bir denetçi —
 * grafiğe bakıp tahmin etmek zorunda kalıyordu.
 *
 * Üç karar, üçü de ölçüme bağlı:
 *
 *   **Kapalı açılıyor.** T14 turu en uzun ekranı 3.924'ten 2.351 piksele
 *   indirdi; her grafiğin altına kalıcı bir tablo koymak o kazancı geri
 *   verirdi. T10-06 \"erişilebilir\" diyor, \"görünür\" demiyor.
 *
 *   **`null` boşluk değil.** Kaydı olmayan bir hücre \"kayıtlı değil\" der.
 *   Boş bir hücre sıfır gibi okunur, sıfır da bir ölçüm iddiasıdır
 *   (CLAUDE.md §2).
 *
 *   **Tablo `TableFrame`'i kullanıyor.** Kendi `overflow-x` kutusu ve kolon
 *   etiketleri zaten orada; ikinci bir kopya yazmak sapan kopyayı yazmak
 *   olurdu (CLAUDE.md §4).
 */
export const ChartTable: React.FC<{
  /** Grafiğin adı — tablonun da adı, çünkü aynı şeyin iki sürümü. */
  label: string;
  columns: string[];
  rows: (string | number | null)[][];
}> = ({ label, columns, rows }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [open, setOpen] = React.useState(false);

  if (rows.length === 0) return null;

  const cell = (value: string | number | null) => {
    if (value === null)
      return <span className="text-slate-400">{tr ? 'kayıtlı değil' : 'not recorded'}</span>;
    return typeof value === 'number' ? value.toLocaleString(tr ? 'tr-TR' : 'en-GB') : value;
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        data-chart-table={label}
        className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
      >
        <Table2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {tr ? 'Veri tablosu' : 'Data table'} · {rows.length}
        </span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="mt-1.5">
          <TableFrame
            head={
              <tr>
                {columns.map((column) => (
                  <Th key={column}>{column}</Th>
                ))}
              </tr>
            }
          >
            {rows.map((row, i) => (
              <tr key={`${label}-${i}`} className="border-t border-slate-100">
                {row.map((value, j) => (
                  <Td key={`${label}-${i}-${j}`}>{cell(value)}</Td>
                ))}
              </tr>
            ))}
          </TableFrame>
        </div>
      )}
    </div>
  );
};
