#!/usr/bin/env bash
# Verifies a PDF/A file actually conforms, using veraPDF (https://verapdf.org/) -
# the open-source PDF/A validator most commonly used for this. Typst's own
# PdfStandards::new([PdfStandard::A_2b]) enforcement (see
# src-tauri/src/typst_compiler.rs) and the "%PDF-" magic-byte check in
# cargo test are necessary but not sufficient: real PDF/A conformance also
# depends on font embedding, color profiles, and metadata that only an
# external validator actually checks end to end.
#
# veraPDF is a JVM tool, not a Rust/Node dependency of this project, so this
# is a required *release-time* check (see MACOS_RELEASE_GUIDE.md §7), not
# part of `cargo test` or CI on every commit - the same treatment EPUBCheck
# gets for EPUB output.
#
# Usage:
#   scripts/verify-pdfa.sh path/to/exported.pdf [profile]
#   profile defaults to 2b (matches PdfStandard::A_2b in typst_compiler.rs)
#
# Install veraPDF: https://docs.verapdf.org/install/

set -euo pipefail

PDF_PATH="${1:-}"
PROFILE="${2:-2b}"

if [[ -z "$PDF_PATH" ]]; then
  echo "Usage: $0 path/to/exported.pdf [profile]" >&2
  exit 1
fi

if [[ ! -f "$PDF_PATH" ]]; then
  echo "error: no such file: $PDF_PATH" >&2
  exit 1
fi

if ! command -v verapdf >/dev/null 2>&1; then
  echo "error: verapdf not found on PATH. Install it from https://docs.verapdf.org/install/ first." >&2
  exit 1
fi

echo "Validating $PDF_PATH against PDF/A-$PROFILE..."
verapdf --flavour "$PROFILE" --format text "$PDF_PATH"
