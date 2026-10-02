import { invoke } from '@tauri-apps/api/core';
import { exists, readTextFile } from '@tauri-apps/plugin-fs';

/** Tauri boundary for a user document's file and picker operations. */
export function chooseDocumentToOpen(): Promise<string | null> {
  return invoke('choose_document_to_open');
}

/** Tauri boundary for choosing the first save location of an untitled document. */
export function chooseDocumentSavePath(): Promise<string | null> {
  return invoke('choose_document_save_path');
}

export const readDocumentText = readTextFile;
export function writeDocumentText(path: string, content: string, expected: string | null = null): Promise<void> {
  return invoke('save_document_atomic', { path, content, expected });
}
export const documentExists = exists;
