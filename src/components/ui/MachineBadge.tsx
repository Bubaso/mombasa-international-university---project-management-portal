/**
 * The mark on a sentence a machine wrote (M3-10, M13-09).
 *
 * Small on purpose, and present on purpose. The review queue on the assistant
 * screen is where this work is managed; this is where the warning belongs,
 * because the warning is only any use to somebody reading the sentence. A
 * machine translation a reader cannot tell from the record IS the record to
 * them, and that is the one thing this portal is built not to allow.
 *
 * It says "a suggestion" rather than "machine translation" alone, because the
 * reader's question is not where the words came from but whether they can be
 * relied on. Once a person has read it and stood behind it the badge goes — it
 * is their wording then, and the mark would have stopped being true.
 */
import React from 'react';
import { Languages } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const MachineBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  return (
    <span
      title={
        tr
          ? 'Bu metni bir dil modeli çevirdi ve henüz kimse onaylamadı. Asistan ekranındaki kuyrukta onaylanabilir ya da düzeltilebilir.'
          : 'A language model translated this and nobody has approved it yet. It can be approved or rewritten in the queue on the assistant screen.'
      }
      className={`inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1 py-px align-middle text-xs font-medium text-amber-900 ${className}`}
    >
      <Languages className="h-2.5 w-2.5" aria-hidden="true" />
      {tr ? 'makine çevirisi — onaylanmadı' : 'machine translation, not approved'}
    </span>
  );
};
