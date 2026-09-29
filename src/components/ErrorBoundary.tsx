import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Shown above the message, e.g. the name of the section that failed. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one failing section from blanking the whole portal.
 *
 * React unmounts the entire tree on an uncaught render error, so before this
 * a single bad record anywhere took the app down to a white page with no
 * indication of what happened.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept on the console until an error reporter is wired up (N-33).
    console.error('Unhandled render error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="m-4 space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm"
      >
        <div className="space-y-1">
          <h2 className="font-bold text-rose-900">
            {this.props.label ?? 'Bu bölüm açılamadı · This section failed to load'}
          </h2>
          <p className="text-xs leading-relaxed text-rose-900/80">
            Beklenmeyen bir hata oluştu. Portalın geri kalanı çalışmaya devam ediyor.
            <br />
            An unexpected error occurred. The rest of the portal is still usable.
          </p>
        </div>

        <pre className="overflow-x-auto rounded-lg border border-rose-200 bg-white p-3 font-mono text-[11px] text-rose-800">
          {error.message}
        </pre>

        <button
          type="button"
          onClick={this.reset}
          className="cursor-pointer rounded-lg bg-rose-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
        >
          Yeniden dene · Try again
        </button>
      </div>
    );
  }
}
