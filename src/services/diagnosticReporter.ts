import {
  createReactDiagnostic,
  createUnhandledRejectionDiagnostic,
  createWindowErrorDiagnostic,
  type ClientDiagnostic,
} from './diagnosticService';
import { persistClientDiagnostic } from './diagnosticLogAdapter';

function reportDiagnostic(diagnostic: ClientDiagnostic): void {
  void persistClientDiagnostic(diagnostic).catch((error: unknown) => {
    console.error('Could not write diagnostic log:', error);
  });
}

export function reportReactError(error: Error, componentStack: string): void {
  reportDiagnostic(createReactDiagnostic(error, componentStack));
}

export function installGlobalDiagnosticHandlers(): () => void {
  const handleError = (event: ErrorEvent) => {
    reportDiagnostic(createWindowErrorDiagnostic(event));
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportDiagnostic(createUnhandledRejectionDiagnostic(event.reason));
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}
