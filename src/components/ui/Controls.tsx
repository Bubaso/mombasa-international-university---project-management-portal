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
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  icon: Icon,
  title,
  subtitle,
  whoMayUse,
  canUse,
  children,
}) => (
  <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
    <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-[11px] leading-relaxed text-slate-500">{subtitle}</p>
        </div>
      </div>
      <p
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
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
    <span className="text-[11px] font-medium text-slate-600">{label}</span>
    {children}
  </label>
);

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 ' +
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
      `px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ` +
      `disabled:opacity-50 ${TONES[tone]} ${className}`
    }
  />
);

export const Pill: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = 'border-slate-300 bg-slate-100 text-slate-700',
}) => (
  <span
    className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${className}`}
  >
    {children}
  </span>
);

/** A horizontally scrollable table, because these are wide and phones are not. */
export const TableFrame: React.FC<{ head: React.ReactNode; children: React.ReactNode }> = ({
  head,
  children,
}) => (
  <div className="-mx-4 overflow-x-auto px-4">
    <table className="w-full min-w-[640px] text-left text-xs">
      <thead className="text-[11px] uppercase tracking-wide text-slate-500">{head}</thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
  </div>
);

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
    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800">
      {message}
    </p>
  );
};
