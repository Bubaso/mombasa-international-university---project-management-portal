import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  quadrantLabel,
  quadrantOf,
  quadrantStyle,
  stanceStyle,
  type Quadrant,
} from '../../lib/stakeholders';
import { Pill } from '../ui/Controls';
import type { Stakeholder } from '../../types';

/**
 * The power/interest grid, which is what the two scores are for.
 *
 * The quadrant names are instructions rather than descriptions: they say how
 * much of a relationship owner's week this person is worth. A register that
 * lists two hundred contacts alphabetically tells nobody where to spend
 * Tuesday.
 */
const LAYOUT: { quadrant: Quadrant; hint: { tr: string; en: string } }[] = [
  {
    quadrant: 'manage_closely',
    hint: { tr: 'Yüksek nüfuz · yüksek ilgi', en: 'High influence · high interest' },
  },
  {
    quadrant: 'keep_satisfied',
    hint: { tr: 'Yüksek nüfuz · düşük ilgi', en: 'High influence · low interest' },
  },
  {
    quadrant: 'keep_informed',
    hint: { tr: 'Düşük nüfuz · yüksek ilgi', en: 'Low influence · high interest' },
  },
  {
    quadrant: 'monitor',
    hint: { tr: 'Düşük nüfuz · düşük ilgi', en: 'Low influence · low interest' },
  },
];

export const PowerInterestGrid: React.FC<{
  stakeholders: Stakeholder[];
  onOpen: (id: string) => void;
}> = ({ stakeholders, onOpen }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {LAYOUT.map(({ quadrant, hint }) => {
        const members = stakeholders.filter((s) => quadrantOf(s) === quadrant);
        return (
          <div key={quadrant} className={`rounded-xl border p-3 ${quadrantStyle(quadrant)}`}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {quadrantLabel(quadrant, language)}
              </h3>
              <span className="text-xs text-slate-500">{hint[language]}</span>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-slate-500">{tr ? 'Kimse yok.' : 'Nobody here.'}</p>
            ) : (
              <ul className="space-y-1">
                {members.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(s.id)}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-left text-xs hover:bg-white"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-slate-900">{s.fullName}</span>
                        {s.organizationName && (
                          <span className="ml-1.5 text-slate-500">{s.organizationName}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Pill className={stanceStyle(s.stance)}>
                          {s.influence}·{s.interest}
                        </Pill>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
};
