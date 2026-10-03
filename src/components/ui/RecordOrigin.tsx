import React from 'react';
import { Quote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import type { Provenance } from '../../api/proposals';

/**
 * Bu kayıt nereden geldi (M13-21).
 *
 * Asistan bir belgeyi okuyup bir kütüğe kayıt açtığında, o kaydın dayanağı
 * belgedeki bir cümledir. O cümle teklif kuyruğunda duruyordu ve kuyruk
 * boşaldığında gidecekti — yani kaydın neden var olduğunu söyleyen tek şey
 * kaybolacaktı. Bu satır onu kaydın yanına koyuyor: hangi belge, hangi alıntı,
 * kim ne zaman karar verdi.
 *
 * **Kökeni olmayan kayıtta hiç çizilmiyor.** Elle girilmiş bir kaydın kökeni
 * yoktur; "kökeni yok" yazmak, boş bir alanı bilgi gibi göstermek olurdu. Satır
 * yalnızca söyleyecek bir şeyi olduğunda var.
 *
 * Alıntı **kısaltılmıyor.** Dayanağın yarısı, dayanak değildir — ve bu satırın
 * bütün işi dayanağı göstermek. Uzun bir alıntı uzun görünür; bu, doğru bir
 * görüntüdür.
 */
export const RecordOrigin: React.FC<{ origin: Provenance | undefined }> = ({ origin }) => {
  const { language } = useApp();
  const navigate = useNavigate();
  const tr = language === 'tr';
  if (!origin) return null;

  return (
    <div className="mt-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-2">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-indigo-900">
        <Quote className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="font-medium">{tr ? 'Kaynağı:' : 'Came from:'}</span>
        <button
          type="button"
          onClick={() => navigate('/documents')}
          className="cursor-pointer font-medium underline hover:text-indigo-700"
        >
          {origin.documentTitle}
        </button>
        {origin.decidedByName && (
          <span className="text-indigo-700">
            · {origin.decidedByName}
            {origin.decidedAt ? ` · ${origin.decidedAt.slice(0, 10)}` : ''}
          </span>
        )}
      </p>
      <blockquote className="mt-1 border-l-2 border-indigo-300 pl-2 text-xs leading-relaxed text-slate-700 italic">
        {origin.quote}
      </blockquote>
      {origin.why.trim() !== '' && (
        <p className="mt-1 text-xs text-indigo-800">
          {tr ? 'Asistanın gerekçesi: ' : "The assistant's reason: "}
          {origin.why}
        </p>
      )}
    </div>
  );
};
