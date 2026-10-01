/**
 * The calendar as a file (M3-16).
 *
 * The requirement names Google and Outlook, and this is a download rather than
 * a feed those two could subscribe to — a stated limit, not an omission. A
 * live feed needs a URL a calendar program can fetch without signing in, which
 * means a long-lived secret in a link; whoever holds the link holds the
 * calendar. That is a decision for the trust to take knowingly rather than one
 * to slip into a P3, so the panel says what the file is and what it is not.
 *
 * The other half of the honesty is the tier. Everything else in this portal is
 * read under row level security; a file on a laptop, synced to a phone, is read
 * by whoever holds the laptop. So confidential and restricted matters stay out
 * unless the person exporting says otherwise, and the count of what was left
 * out is on the screen rather than implied.
 */
import React, { useState } from 'react';
import { CalendarArrowDown, Download, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { toIcs } from '../../lib/ics';
import { ActionButton, Pill } from '../ui/Controls';
import type { CalendarEntry } from '../../types';

export const IcsExport: React.FC<{ entries: CalendarEntry[] }> = ({ entries }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [includeClosed, setIncludeClosed] = useState(false);
  const [last, setLast] = useState<{ events: number; withheld: number; allDay: number } | null>(
    null,
  );

  const download = () => {
    const result = toIcs(entries, { language, includeClosed });
    const blob = new Blob([result.text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `miu-takvim-${new Date().toISOString().slice(0, 10)}.ics`;
    link.click();
    URL.revokeObjectURL(url);
    setLast({ events: result.events, withheld: result.withheld, allDay: result.allDay });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <CalendarArrowDown
            className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {tr ? 'Takvimi dosya olarak al' : 'Take the calendar as a file'}
            </h2>
            <p className="max-w-2xl text-[11px] text-slate-500">
              {tr
                ? 'Google Takvim, Outlook ve telefonunuzun takvimi bu dosyayı okur. İçe aktarmak bir kopya alır: tarih sonra değişirse dosya eskir, yeniden almanız gerekir. Canlı bir bağlantı değil — canlı bağlantı, takvim programının giriş yapmadan okuyabileceği bir adres ister, yani bağlantıyı elinde tutan takvimi elinde tutar. İsterseniz onu ayrıca konuşalım.'
                : 'Google Calendar, Outlook and your phone will read this file. Importing takes a copy: if a date moves afterwards the file is stale and you take it again. It is not a live feed — a feed needs an address a calendar program can read without signing in, which means whoever holds the link holds the calendar. Worth deciding deliberately rather than by default.'}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300"
          />
          {tr ? 'Gizli ve kısıtlı kayıtları da koy' : 'Include confidential and restricted matters'}
        </label>
        <ActionButton onClick={download} disabled={entries.length === 0}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {tr ? 'İndir (.ics)' : 'Download (.ics)'}
        </ActionButton>
        {last && (
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
            <Pill className="border-emerald-300 bg-emerald-50 text-emerald-900">
              {tr ? `${last.events} kayıt` : `${last.events} events`}
            </Pill>
            {last.allDay > 0 && (
              <span>
                {tr
                  ? `${last.allDay} tanesi tüm gün — kayıtta saat yok`
                  : `${last.allDay} all-day, because the record gives no time`}
              </span>
            )}
            {last.withheld > 0 && (
              <span className="text-amber-800">
                {tr
                  ? `${last.withheld} kayıt dosyaya girmedi`
                  : `${last.withheld} left out of the file`}
              </span>
            )}
          </span>
        )}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-800">
        <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        {tr
          ? 'Bu dosya portalın erişim denetimini geride bırakır. Portalda bir kaydı kimin görebileceğine veritabanı karar veriyor; bir .ics dosyasına ise dizüstünü eline alan herkes bakar.'
          : 'This file leaves the portal’s access control behind. In the portal the database decides who may read a record; an .ics file is read by whoever holds the laptop.'}
      </p>
    </section>
  );
};
