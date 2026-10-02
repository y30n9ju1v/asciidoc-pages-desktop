import { invoke } from '@tauri-apps/api/core';
import type { PdfPublicationRequest } from './pdfPublicationRequest';

/** Native boundary for the only command that compiles an in-app PDF preview. */
export function compileTypstPreviewPdf(request: PdfPublicationRequest): Promise<string> {
  return invoke<string>('compile_typst_pdf', { requestJson: JSON.stringify(request) });
}
