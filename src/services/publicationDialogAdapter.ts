import { invoke } from '@tauri-apps/api/core';

interface ExportFileSelection extends Record<string, unknown> {
  defaultPath: string;
  filterName: string;
  extensions: string[];
}

/** Native export pickers grant scope in Rust, so returned paths are safe to write immediately. */
export function chooseExportFile(selection: ExportFileSelection): Promise<string | null> {
  return invoke('choose_export_file', selection);
}

/** Native directory picker for multi-file exports such as Typst source projects. */
export function chooseExportDirectory(): Promise<string | null> {
  return invoke('choose_export_directory');
}
