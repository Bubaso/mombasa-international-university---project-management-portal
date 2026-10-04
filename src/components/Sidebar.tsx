import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
 */
export const Sidebar: React.FC = () => {
  const { language } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside
      data-print="hide"
      className="hidden md:flex md:sticky top-16 z-30 h-[calc(100vh-4rem)] w-64 bg-white border-r border-slate-200 flex-col justify-between shrink-0 shadow-xs"
    >
      <nav
        className="flex-1 overflow-y-auto p-3"
        aria-label={language === 'tr' ? 'Ana gezinme' : 'Main navigation'}
      >
        {NAV_GROUPS.map((group, index) => (
          <div key={group.id} className={index > 0 ? 'mt-4' : ''}>
            <h2 className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {group.heading[language]}
            </h2>
            <ul className="space-y-0.5">
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
                          isActive ? 'text-amber-600' : 'text-slate-500 group-hover:text-slate-700'
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
        ))}
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
      <div className="border-t border-slate-200 bg-slate-50 p-3">
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-600 shadow-xs">
          <div className="font-semibold text-slate-700">MIU · Utange/Majaoni</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {language === 'tr' ? 'Parsel MN/I/5141 · Fasıl 164' : 'Plot MN/I/5141 · Cap 164'}
          </div>
        </div>
      </div>
    </aside>
  );
};
