import React from 'react';
import { saveDiagnosticLog } from '../services/diagnosticLogAdapter';
import { reportReactError } from '../services/diagnosticReporter';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  error: Error | null;
  logSaveError: string | null;
  savingLog: boolean;
}

/**
 * Top-level safety net. Individual services already try/catch their own
 * failure modes, but that's optimistic coverage, not a guarantee - one
 * uncaught exception anywhere in the tree (a third-party library throwing
 * synchronously during render, corrupted editor state, etc.) would otherwise
 * take the whole app down to a blank white screen with no way to recover.
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, logSaveError: null, savingLog: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, logSaveError: null, savingLog: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled error in AsciiDoc Studio:', error, info.componentStack);
    reportReactError(error, info.componentStack ?? 'No React component stack available.');
  }

  private saveDiagnosticLog = async (): Promise<void> => {
    this.setState({ savingLog: true, logSaveError: null });
    try {
      await saveDiagnosticLog();
    } catch (error) {
      this.setState({
        logSaveError: 'Could not save the diagnostic log. Please restart the app and try again.',
      });
      console.error('Could not save diagnostic log:', error);
    } finally {
      this.setState({ savingLog: false });
    }
  };

  render() {
    const { error, logSaveError, savingLog } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <main className="w-full max-w-2xl space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-destructive">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            AsciiDoc Studio hit an unexpected error. Reloading should recover the editor state from autosave.
          </p>
          <p className="text-sm text-muted-foreground">
            Diagnostic details were saved locally, with local file paths automatically removed. Some errors from
            third-party libraries may quote a snippet of your document - skim <code>diagnostics.log</code> before
            attaching it when reporting this issue.
          </p>
          <pre className="max-h-52 overflow-auto rounded-md bg-muted p-4 text-sm text-muted-foreground whitespace-pre-wrap">
            {error.message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button type="button" variant="outline" onClick={() => void this.saveDiagnosticLog()} disabled={savingLog}>
              {savingLog ? 'Saving log…' : 'Save diagnostic log'}
            </Button>
          </div>
          {logSaveError && <p className="text-sm text-destructive">{logSaveError}</p>}
        </main>
      </div>
    );
  }
}
