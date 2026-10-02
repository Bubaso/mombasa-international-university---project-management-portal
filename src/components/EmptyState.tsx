import React from 'react';
import { FileQuestion } from 'lucide-react';

export type EmptyStateTone =
  /** Nothing has been entered yet, but the feature works. */
  | 'empty'
  /** The screen has no data source behind it at all — do not imply otherwise. */
  | 'unsourced';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  tone?: EmptyStateTone;
  action?: React.ReactNode;
  className?: string;
}

const TONE_STYLES: Record<EmptyStateTone, { wrap: string; badge: string; icon: string }> = {
  empty: {
    wrap: 'bg-slate-50 border-slate-200',
    badge: 'bg-white text-slate-600 border-slate-200',
    icon: 'text-slate-400',
  },
  unsourced: {
    wrap: 'bg-amber-50/50 border-amber-200',
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: 'text-amber-600',
  },
};

/**
 * A single, honest empty state. The `unsourced` tone exists because several
 * screens render layout for content the system does not actually hold; saying
 * so is better than showing a convincing but hollow panel.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = FileQuestion,
  title,
  description,
  tone = 'empty',
  action,
  className = '',
}) => {
  const styles = TONE_STYLES[tone];

  return (
    <div
      className={`p-8 text-center rounded-xl border border-dashed space-y-3 ${styles.wrap} ${className}`}
    >
      <Icon className={`w-8 h-8 mx-auto ${styles.icon}`} aria-hidden="true" />
      <div className="space-y-1.5 max-w-md mx-auto">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        {description && (
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
};
