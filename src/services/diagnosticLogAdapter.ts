import { invoke } from '@tauri-apps/api/core';
import { ClientDiagnostic, sanitizeDiagnostic } from './diagnosticService';

export function persistClientDiagnostic(diagnostic: ClientDiagnostic): Promise<void> {
  return invoke('record_client_diagnostic', { diagnostic: sanitizeDiagnostic(diagnostic) });
}

/** Saves a user-selected copy without relying on Finder or an external process. */
export function saveDiagnosticLog(): Promise<string | null> {
  return invoke('save_diagnostic_log');
}
