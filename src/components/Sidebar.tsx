import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NAV_GROUPS } from '../lib/navigation';

/**
 * The desktop navigation: nineteen routes under six headings.
 *
 * It was nineteen flat items in one scrolling column, all of the same visual
 * weight, so finding a screen meant reading the whole list. The groups come
 * from `lib/navigation.ts` because the phone's menu reads the same ones —
 * a grouping kept in two places drifts, and the copy that drifts is always
 * the second one.
 *
 * Two things that used to be here are gone. The badges ("Temyiz E062",
 * "Koruma Tedbiri", "API Hazır", "v2.1") were typed-in strings read as
 * current fact on every page, which is the defect Faz 0 cleared off the
 * screen. And the labels no longer truncate: five of them used to end in an
 * ellipsis at any width, which cost precisely the words that told one screen
 * from another, so navigation now carries short names and the full ones live
 * in the page heading.
 *
 * ---
 *
 * Katlanan gruplar, 5 Ekim 2026 (T14-05). On dokuz giriş ve altı başlık aynı
 * anda duruyordu: bir ekran bulmak hâlâ listenin tamamını okumak demekti,
 * yalnızca artık gruplanmış hâlde.
 *
 * Açık olan grup, İÇİNDE BULUNULAN ekranın grubu. "Genel bakış" her zaman
 * açık, çünkü portala girilen yer orası. Geri kalan bir tık uzakta — ve
 * hiçbir rota kaybolmuyor.
 *
 * TELEFON MENÜSÜ DEĞİŞMEDİ ve bu kasıtlı: T1-05 "her rota telefondan
 * erişilebilir" diye ölçülüyor ve ölçüm telefon sayfasından yapılıyor. Orayı
 * katlamak, bir kabul kriterini ölçen şeyi değiştirmek olurdu.
 */
export const Sidebar: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const location = useLocation();
  const navigate = useNavigate();

  const groupOf = (path: string) =>
    NAV_GROUPS.find((g) => g.routes.some((r) => r.path === path))?.id;
  const [open, setOpen] = useState<string | null>(groupOf(location.pathname) ?? null);

  // Başka bir ekrana geçildiğinde o ekranın grubu açılır: kullanıcı grubu
  // kendisi açmadıysa da, bulunduğu yerin komşularını görmesi gerekir.
  useEffect(() => {
    const id = groupOf(location.pathname);
    if (id) setOpen(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <aside
      data-print="hide"
      className="hidden md:flex md:sticky top-16 z-30 h-[calc(100vh-4rem)] w-64 bg-white border-r border-slate-200 flex-col justify-between shrink-0 shadow-xs"
    >
      <nav
        className="flex-1 overflow-y-auto p-3"
        aria-label={tr ? 'Ana gezinme' : 'Main navigation'}
      >
        {NAV_GROUPS.map((group, index) => {
          const always = group.id === 'overview';
          const expanded = always || open === group.id;
          return (
            <div key={group.id} className={index > 0 ? 'mt-3' : ''}>
              {always ? (
                <h2 className="px-3 pb-1.5 text-xs font-semibold text-slate-500">
                  {group.heading[language]}
                </h2>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : group.id)}
                  aria-expanded={expanded}
                  data-group={group.id}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >
                  <span>{group.heading[language]}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
                    aria-hidden="true"
                  />
                </button>
              )}
              <ul className={`space-y-0.5 ${expanded ? '' : 'hidden'}`}>
                {group.routes.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <li key={item.tab}>
                      <button
                        onClick={() => navigate(item.path)}
                        aria-current={isActive ? 'page' : undefined}
                        // Which route this goes to, readable from the outside.
                        // These are buttons rather than links, so there is no
                        // href for a test — or a reader — to inspect, and
                        // "every route is reachable on a phone" is a claim that
                        // has to be measurable. (Making them real links is a
                        // T9 question and a larger change.)
                        data-path={item.path}
                        className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                          isActive
                            ? 'border-l-2 border-amber-600 bg-amber-50 font-semibold text-amber-900'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive
                              ? 'text-amber-600'
                              : 'text-slate-500 group-hover:text-slate-700'
                          }`}
                          aria-hidden="true"
                        />
                        {/* No `truncate`. A label that does not fit is a label
                          to shorten in lib/navigation.ts, not one to hide the
                          end of — and without this class a regression shows
                          up on the screen and in the design test instead of
                          disappearing quietly behind an ellipsis. */}
                        <span>{item.label[language]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/*
        What used to be here: a card asserting the appeal's current standing
        and the capital invested, both typed in. It said "STATUS QUO" and
        "9 Feb 2026: priority hearing granted" on every page of the portal,
        in the present tense, from a string — so it would have gone on saying
        that whatever happened in court. A hardcoded legal status is worse
        than a missing one: it is read as current by everybody who sees it,
        and nobody thinks to check a thing the interface states plainly.

        The court's standing is in the legal register, the invested total in
        the ledger, and both say where they came from and when. What stays
        here is the identity of the project, which does not change (M12-03).
      */}
      {/*
        Parsel numarası ve kanun faslı BURADAN kaldırıldı (T14-02). İkisi de
        doğru ve ikisi de `/project_info`'da duruyor — orası künyenin yeri.
        Her ekranın kenarında tekrar etmeleri kimseye bir şey söylemiyordu:
        portalı açan kişi hangi projede olduğunu biliyor, ve bir tapu
        numarası günlük işin parçası değil. Kalan satır projenin kimliği,
        ki o değişmiyor (M12-03).
      */}
      <div className="border-t border-slate-200 bg-slate-50 p-3">
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-600 shadow-xs">
          <div className="font-semibold text-slate-700">MIU · Utange/Majaoni</div>
        </div>
      </div>
    </aside>
  );
};
