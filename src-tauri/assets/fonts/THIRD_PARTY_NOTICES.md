# Third-party notices — bundled fonts and Typst-related crates

This file lists the license terms for fonts and libraries embedded into the
compiled app binary by the PDF publishing pipeline (`typst_compiler.rs`).
Text below was copied verbatim from each project's own distributed license
file at the pinned version this app actually ships, not written from memory
or assumed by license family name.

## Fonts we bundle directly (`src-tauri/assets/fonts/*.otf`)

- `NotoSerifKR-Regular.otf`, `NotoSerifKR-Bold.otf` — from
  [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) release
  `Serif2.003`, `13_NotoSerifKR.zip`. Internal font family name (confirmed
  via `fc-scan`): **Noto Serif KR**. Copyright string embedded in the font:
  "Copyright 2017-2024 Adobe (http://www.adobe.com/). Noto is a trademark
  of Google Inc."
- `NotoSansKR-Regular.otf`, `NotoSansKR-Bold.otf` — from the same
  repository, release `Sans2.004`, `17_NotoSansKR.zip`. Internal font
  family name: **Noto Sans KR**. Copyright string: "Copyright 2014-2021
  Adobe (http://www.adobe.com/). Noto is a trademark of Google Inc."

Both are licensed under the **SIL Open Font License, Version 1.1** (full
text below, copied from the `LICENSE` file inside each release archive —
both archives ship byte-identical license text).

```
This Font Software is licensed under the SIL Open Font License,
Version 1.1.

This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font
creation efforts of academic and linguistic communities, and to
provide a free and open framework in which fonts may be shared and
improved in partnership with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply to
any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software
components as distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to,
deleting, or substituting -- in part or in whole -- any of the
components of the Original Version, by changing formats or by porting
the Font Software to a new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed,
modify, redistribute, and sell modified and unmodified copies of the
Font Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components, in
Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the
corresponding Copyright Holder. This restriction only applies to the
primary font name as presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created using
the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Fonts bundled transitively via `typst-kit`'s `embedded-fonts` feature

`typst_compiler.rs` also enables `TypstKitFontOptions::include_embedded_fonts(true)`,
which bundles **all** of `typst_kit::fonts::embedded()` — every font file in
the pinned `typst-assets = "=0.15.1"` crate's `files/fonts/` directory (no
way to select a subset; it's all-or-nothing via that API). Per that crate's
own doc comment, this is: Libertinus Serif and New Computer Modern (text),
New Computer Modern Math (math), DejaVu Sans Mono (code), plus the Foxit
PDF standard-14 fallback fonts. **These are not licensed uniformly** — the
authoritative, complete text for all of them is the `NOTICE` file inside
the pinned `typst-assets` crate itself
(`~/.cargo/registry/src/*/typst-assets-0.15.1/NOTICE` once fetched, or
<https://github.com/typst/typst-assets/blob/main/NOTICE> for the same
version). Summary, confirmed by reading that file directly:

| Font(s) | License |
| --- | --- |
| Libertinus Serif (all styles) | SIL Open Font License 1.1 |
| New Computer Modern (all styles except `NewCM10-Regular`), New Computer Modern Math | GUST Font License 1.0 (LPPL-based) |
| **`NewCM10-Regular` specifically** | **GNU GPL v3 or later, plus a Font Exception and a Distribution Exception** — the Font Exception is the standard font-GPL carve-out permitting embedding in documents/software without the GPL extending to the rest of the work; see the `typst-assets` NOTICE file for the exact exception text |
| DejaVu Sans Mono | Bitstream Vera Fonts license (permissive, renaming-on-modification clause) + Arev Fonts license (same family, for imported glyphs) |
| Foxit standard-14 fallback fonts (`Foxit*.pfb`) | BSD-3-Clause-style (PDFium Authors, 2014) |

## Rust crates (code, not fonts)

**`typst-as-lib` (MIT)** — third-party wrapper around the Typst compiler
this app's `typst_compiler.rs` builds on; not part of the official Typst
project. License copied verbatim from the crate's own `LICENSE` file at the
pinned version (`=0.16.0`):

```
MIT License

Copyright (c) 2024 Reinhard Bronner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**`mitex` (Apache-2.0)** — LaTeX-to-Typst math conversion, pinned at
`=0.2.4`. The crate's `Cargo.toml` declares `license = "Apache-2.0"` but its
crates.io package does not ship its own `LICENSE` file to copy verbatim, so
this notice cites the SPDX identifier and the standard, canonical license
text rather than asserting a copy this project doesn't actually have:
<https://www.apache.org/licenses/LICENSE-2.0>.
