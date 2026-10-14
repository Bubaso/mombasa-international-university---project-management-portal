import React from 'react';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * A panel's reasoning, one line by default and all of it on one click.
 *
 * Every panel in this portal opens by saying why it exists and what it will
 * not claim. Those paragraphs are the honesty principle in prose and they are
 * worth keeping — but as permanent furniture they push the records off the
 * screen. Measured on a phone, three routes showed no data at all in the
 * first 844px: the plan at 1747px, the stakeholder register at 1038px, the
 * risk register at 883px.
 *
 * So the text is moved, not deleted (T6-02). Collapsed, the first sentence
 * shows — usually the whole point — and the rest is one tap away. Nothing is
 * summarised, paraphrased or shortened: what expands is exactly what was
 * written.
 *
 * Two deliberate limits:
 *
 *   This is for a panel's REASONING, never for an empty state's reason. "No
 *   milestone is recorded" is the answer to the question the reader came with
 *   and T5-05 requires it stay visible. Hiding it would turn an honest empty
 *   screen into a blank one.
 *
 *   Collapsed is the fallback. T6-03 asked for an unread explanation to
 *   default to open, which reads well until you notice it would put the data
 *   back off the screen in any browser that cannot store a preference — a
 *   private window, cleared site data. Since the full text is always one
 *   interaction away, collapsed costs nothing and keeps T6-01 true
 *   everywhere. localStorage therefore remembers only that a reader wants
 *   this one OPEN.
 */

const KEY = 'miu.explain.open';

/** Which explanations this reader has chosen to keep open. */
function readOpen(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // Private window, blocked storage, or nonsense in the key. Collapsed is
    // the safe answer, so an unreadable preference is simply no preference.
    return new Set();
  }
}

function writeOpen(ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Not being able to remember is not a reason to fail to render.
  }
}

/**
 * Collapsed height is bounded by the line box, not by punctuation.
 *
 * The first version of this took the first sentence instead, which read
 * nicely and did nothing: these paragraphs open with a sentence of about 190
 * characters, past the bound the matcher allowed, so it returned the whole
 * text and the component added a button under it. Measured, the panels got
 * TALLER — 114px where the bare paragraph had been 100. A criterion about
 * vertical space has to be met by something that controls vertical space, so
 * the collapsed state is one clamped line and nothing about the prose decides
 * how tall it is.
 */

/**
 * `warning` is the same mechanism for a caution strip (T6-04): the sentence
 * that says what to watch out for stays on one line, and the paragraph
 * explaining the consequence opens underneath it. One of these ran to four
 * lines on a phone.
 */
type ExplainTone = 'quiet' | 'warning';

interface ExplainProps {
  /**
   * Stable name for this explanation, so a reader's choice survives a
   * reload. Not generated from the text: rewording the paragraph should not
   * silently reopen something somebody closed.
   */
  id: string;
  children: string;
  className?: string;
  tone?: ExplainTone;
}

export const Explain: React.FC<ExplainProps> = ({
  id,
  children,
  className = '',
  tone = 'quiet',
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [open, setOpen] = React.useState(false);

  // Read the stored preference after mount. Reading it during render would
  // make the first paint depend on browser storage, which differs between
  // the server-rendered shell and the client.
  React.useEffect(() => setOpen(readOpen().has(id)), [id]);

  const full = children.trim();
  // Short enough to be one line anyway: no control, nothing to open.
  const hasMore = full.length > 90;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const ids = readOpen();
    if (next) ids.add(id);
    else ids.delete(id);
    writeOpen(ids);
  };

  const warn = tone === 'warning';
  const body = warn ? 'text-amber-900' : 'text-slate-500';
  const link = warn ? 'text-amber-900 hover:text-amber-950' : 'text-amber-700 hover:text-amber-900';

  const control = (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      className={`inline-flex shrink-0 cursor-pointer items-center gap-0.5 self-start rounded text-sm font-medium underline decoration-dotted underline-offset-2 ${link}`}
    >
      {open ? (tr ? 'kısalt' : 'less') : tr ? 'neden?' : 'why?'}
      <ChevronDown
        className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
  );

  const icon = warn ? (
    <TriangleAlert className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${body}`} aria-hidden="true" />
  ) : null;

  const text = (
    // `data-explain` and `data-open` are how the design test finds these and
    // reads their state: the requirement is about how tall a collapsed
    // explanation is and whether its full text is one interaction away, and
    // neither can be measured from the outside without a handle on it.
    <div className="flex items-start gap-1.5" data-explain={id} data-open={open ? 'yes' : 'no'}>
      {icon}
      {/* `line-clamp-1` is what makes the collapsed height one line whatever
          the paragraph says. The button sits beside the line rather than
          after the words, because inside a clamped box it would be the part
          that got clipped. */}
      <p className={`min-w-0 flex-1 text-sm leading-relaxed ${body} ${open ? '' : 'line-clamp-1'}`}>
        {full}
      </p>
      {hasMore && control}
    </div>
  );

  return className ? <div className={className}>{text}</div> : text;
};
