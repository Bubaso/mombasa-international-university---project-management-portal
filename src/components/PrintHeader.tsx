/**
 * What a printed sheet says about itself (M12-12).
 *
 * Invisible on screen and first on paper. A print is the one output that
 * leaves this system completely: the database decides who may read a record,
 * and a sheet on a table is read by whoever is at the table. An unmarked print
 * of a confidential register is the paper version of an unmarked machine
 * translation — it looks like the record and carries none of its conditions.
 *
 * So the header states the four things a reader of the paper cannot otherwise
 * know: which screen it came from, when, who printed it, and that the sheet
 * carries no access control of its own. The time is the moment of printing
 * rather than of loading, because a page left open for an hour and then
 * printed would otherwise be dated an hour early.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

const SCREENS: Record<string, { tr: string; en: string }> = {
  '/': { tr: 'Ana sayfa', en: 'Dashboard' },
  '/meetings': { tr: 'Toplantılar ve Kararlar', en: 'Meetings & Decisions' },
  '/obligations': { tr: 'Yükümlülükler', en: 'Obligations' },
  '/legal': { tr: 'Hukuk İşleri', en: 'Legal Affairs' },
  '/stakeholders': { tr: 'Paydaş Kütüğü', en: 'Stakeholder Register' },
  '/documents': { tr: 'Belge Kasası', en: 'Document Vault' },
  '/construction': { tr: 'Saha ve İnşaat', en: 'Site & Construction' },
  '/finance': { tr: 'Mali İşler', en: 'Finance' },
  '/risks': { tr: 'Risk ve Sorunlar', en: 'Risks & Issues' },
  '/governance': { tr: 'Yönetişim', en: 'Governance' },
  '/communication': { tr: 'İletişim ve Bildirim', en: 'Communication' },
  '/reports': { tr: 'Raporlar', en: 'Reports' },
  '/plan': { tr: 'Plan ve Takvim', en: 'Plan & Schedule' },
  '/calendar': { tr: 'Takvim', en: 'Calendar' },
  '/procurement': { tr: 'Satın Alma', en: 'Procurement' },
  '/assistant': { tr: 'Asistan', en: 'Assistant' },
  '/readiness': { tr: 'Açılış Hazırlığı', en: 'Intake Readiness' },
  '/admin': { tr: 'Yönetim', en: 'Administration' },
  '/project': { tr: 'Proje Künyesi', en: 'Project Information' },
};

export const PrintHeader: React.FC = () => {
  const { language } = useApp();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const tr = language === 'tr';

  const screen = SCREENS[pathname] ??
    SCREENS[`/${pathname.split('/')[1] ?? ''}`] ?? { tr: pathname, en: pathname };

  return (
    <header className="mb-3 hidden border-b-2 border-black pb-2 print:block">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm font-bold">
            Mombasa International University — {tr ? 'Proje Portalı' : 'Project Portal'}
          </p>
          <p className="text-xs">{tr ? screen.tr : screen.en}</p>
        </div>
        <div className="text-right text-xs">
          {/* Printed-at rather than loaded-at: a page left open and printed an
              hour later would otherwise carry the wrong moment. */}
          <p>{new Date().toLocaleString(tr ? 'tr-TR' : 'en-GB')}</p>
          <p>
            {tr ? 'Yazdıran: ' : 'Printed by: '}
            {user?.name ?? (tr ? 'bilinmiyor' : 'unknown')}
          </p>
          {user && (
            <p>
              {tr ? 'Yetki seviyesi: ' : 'Clearance: '}
              {user.clearance}
            </p>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs leading-snug">
        {tr
          ? 'Bu çıktı portalın erişim denetiminin dışındadır. Portalda bir kaydı kimin görebileceğine veritabanı karar veriyor; bu sayfayı masada kim varsa okur. Ekranda görülenler yazdıran kişinin yetkisine göre süzülmüştür — başkası için daha fazlası ya da daha azı olabilir.'
          : 'This sheet is outside the portal’s access control. In the portal the database decides who may read a record; this page is read by whoever is at the table. What it shows was filtered by the clearance of the person who printed it, and would be more or less for somebody else.'}
      </p>
    </header>
  );
};
