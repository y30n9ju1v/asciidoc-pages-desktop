const MAX_FIELD_LENGTH = 4_000;

export interface ClientDiagnostic {
  source: 'react-error-boundary' | 'window-error' | 'unhandled-rejection';
  message: string;
  stack?: string;
  componentStack?: string;
}

interface ErrorLike {
  message?: unknown;
  stack?: unknown;
}

const userPathPattern = /(?:file:\/\/)?\/(?:Users|home)\/[^\s)\]}]+/g;

export function sanitizeDiagnosticText(value: unknown): string {
  const text = String(value ?? 'Unknown error').replace(userPathPattern, '<local-path>');
  return [...text].slice(0, MAX_FIELD_LENGTH).join('');
}

function normalizeError(value: unknown): Pick<ClientDiagnostic, 'message' | 'stack'> {
  if (value instanceof Error) {
    return {
      message: sanitizeDiagnosticText(value.message),
      stack: value.stack ? sanitizeDiagnosticText(value.stack) : undefined,
    };
  }

  const error = value as ErrorLike | null;
  return {
    message: sanitizeDiagnosticText(error?.message ?? value),
    stack: error?.stack ? sanitizeDiagnosticText(error.stack) : undefined,
  };
}

export function sanitizeDiagnostic(diagnostic: ClientDiagnostic): ClientDiagnostic {
  return {
    ...diagnostic,
    message: sanitizeDiagnosticText(diagnostic.message),
    stack: diagnostic.stack ? sanitizeDiagnosticText(diagnostic.stack) : undefined,
    componentStack: diagnostic.componentStack ? sanitizeDiagnosticText(diagnostic.componentStack) : undefined,
  };
}

export function createReactDiagnostic(error: Error, componentStack: string): ClientDiagnostic {
  return sanitizeDiagnostic({
    source: 'react-error-boundary',
    ...normalizeError(error),
    componentStack,
  });
}

export function createWindowErrorDiagnostic(event: ErrorEvent): ClientDiagnostic {
  return sanitizeDiagnostic({ source: 'window-error', ...normalizeError(event.error ?? event.message) });
}

export function createUnhandledRejectionDiagnostic(reason: unknown): ClientDiagnostic {
  return sanitizeDiagnostic({ source: 'unhandled-rejection', ...normalizeError(reason) });
}
