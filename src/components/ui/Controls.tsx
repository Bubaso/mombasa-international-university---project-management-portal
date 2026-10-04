import React from 'react';
import { Lock } from 'lucide-react';

/**
 * The shell every part of the console sits in.
 *
 * Each section says in one line who may use it. That line is not decoration:
 * the console deliberately does not offer a control the database will refuse,
 * because a button that fails is worse than no button — it leaves the person
 * unsure whether the system is broken or they are not allowed.
 */
interface SectionProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  /** Who may use the controls, in the reader's own words. */
  whoMayUse: string;
  /** Whether this reader is one of them. */
  canUse: boolean;
  /**
   * Kaç kayıt **bekliyor**.
   *
   * Toplam değil, ve adı bu yüzden `waiting`: bitmiş işi de sayan bir başlık,
   * kuyruğun boşalıp boşalmadığını söylemiyor. Asistan sayfasının kusuru tam
   * olarak buydu (kütük turu, 3 Ekim 2026).
   */
  waiting?: number;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  icon: Icon,
  title,
  subtitle,
  whoMayUse,
  canUse,
  waiting,
  children,
}) => (
  <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
    <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-1.5 text-base font-semibold text-slate-900">
            {title}
            {waiting != null && <Pill>{waiting}</Pill>}
          </h2>
          <p className="text-xs leading-relaxed text-slate-500">{subtitle}</p>
        </div>
      </div>
      <p
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
          canUse
            ? 'border-slate-200 bg-slate-50 text-slate-600'
            : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}
      >
        {!canUse && <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />}
        <span>{whoMayUse}</span>
      </p>
    </header>
    <div className="p-4">{children}</div>
  </section>
);

// ---------------------------------------------------------------------------
// Form and table pieces, so each section reads as its own logic rather than
// as a wall of class names.
// ---------------------------------------------------------------------------

export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className = '',
}) => (
  <label className={`flex flex-col gap-1 ${className}`}>
    <span className="text-xs font-medium text-slate-600">{label}</span>
    {children}
  </label>
);

// 44px on a phone, 32px from tablet up. The touch minimum is the phone
// number; a mouse is precise enough that 32px is comfortable, and forcing 44
// everywhere would make a dense desktop register taller for no one's benefit.
const CONTROL =
  'min-h-11 md:min-h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 ' +
  'focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} className={`${CONTROL} cursor-pointer ${props.className ?? ''}`} />
);

type ButtonTone = 'primary' | 'quiet' | 'danger';

const TONES: Record<ButtonTone, string> = {
  primary: 'bg-amber-600 text-white hover:bg-amber-700 border-amber-600',
  quiet: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
  danger: 'bg-white text-rose-700 hover:bg-rose-50 border-rose-300',
};

export const ActionButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }
> = ({ tone = 'quiet', className = '', ...props }) => (
  <button
    {...props}
    className={
      'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border ' +
      // See CONTROL: 44px of tap target on a phone, 32px once there is a mouse.
      `min-h-11 md:min-h-8 px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ` +
      `disabled:opacity-50 ${TONES[tone]} ${className}`
    }
  />
);

export const Pill: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = 'border-slate-300 bg-slate-100 text-slate-700',
}) => (
  <span
    className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${className}`}
  >
    {children}
  </span>
);

/** The visible text inside a header cell, however it was nested. */
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/**
 * A register, as a table on a screen with room and as cards on one without.
 *
 * It used to carry an unconditional `min-w-[640px]`, and it is used in 43
 * places: every register in the portal scrolled sideways on a 390px phone,
 * showing about three fifths of itself with the status and the date — the
 * columns people came for — off the right edge.
 *
 * Below `sm` the header is hidden and each row becomes a card whose cells
 * stack, each labelled with its own column heading. The labels are not asked
 * of the 43 call sites: the headings are already in `head`, so they are read
 * from there and published as custom properties that `td::before` picks up by
 * position. Nothing at a call site changes, and a table that gains a column
 * gains its label too.
 */
export const TableFrame: React.FC<{ head: React.ReactNode; children: React.ReactNode }> = ({
  head,
  children,
}) => {
  const labels = React.useMemo(() => {
    const row = React.Children.toArray(head)[0];
    if (!React.isValidElement(row)) return [];
    const cells = (row.props as { children?: React.ReactNode }).children;
    return React.Children.toArray(cells).map((cell) =>
      React.isValidElement(cell)
        ? textOf((cell.props as { children?: React.ReactNode }).children)
        : '',
    );
  }, [head]);

  const columnLabels = Object.fromEntries(
    labels.map((label, i) => [`--col-${i + 1}`, label ? `'${label.replace(/'/g, '')}'` : "''"]),
  ) as React.CSSProperties;

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table style={columnLabels} className="register w-full text-left text-sm sm:min-w-[640px]">
        <thead className="text-xs uppercase tracking-wide text-slate-500">{head}</thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
};

export const Th: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <th className={`px-2 pb-2 font-medium ${className}`}>{children}</th>;

export const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <td className={`px-2 py-2 align-middle text-slate-700 ${className}`}>{children}</td>;

/** Why a write was refused, in the words the database used. */
export const WriteError: React.FC<{ error: unknown }> = ({ error }) => {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">
      {message}
    </p>
  );
};
