import React from 'react';

/**
 * Catches render crashes in child pages and shows a recovery screen
 * instead of a fully blank page (previously one bad row blanked the app).
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    console.error('Page crashed:', err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-lg mx-auto text-center">
          <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow">
            <h2 className="text-lg font-bold text-slate-900">Something went wrong on this page</h2>
            <p className="text-sm text-slate-500 mt-2">
              The page hit an unexpected error. Your data is safe — try reloading.
            </p>
            {this.state.message && (
              <p className="text-xs font-mono text-rose-600 bg-rose-50 rounded-lg p-2 mt-3 break-words">
                {this.state.message}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-[#0e2c4c] text-white text-sm font-bold rounded-lg"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
