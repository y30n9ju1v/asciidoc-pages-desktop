# AsciiDoc Studio

Tauri v2 + React + Monaco Editor + Asciidoctor.js로 만든 macOS 중심 AsciiDoc 저작/출판 앱입니다. 평소에는 파일 기반 보관함에서 위키링크·백링크·검색으로 노트를 관리하고, 필요할 때만 같은 보관함을 Book Project로 설정해 HTML·EPUB3·PDF를 출판합니다.

## 주요 기능

- Tailwind CSS + shadcn/ui 기반 UI, 옵시디언 스타일 레이아웃 — 아이콘 전용 툴바(호버 시 툴팁), 왼쪽 리본(파일 탐색기/아웃라인/백링크 아이콘 전환), 채도를 낮춘 단색 트리(활성 파일에만 강조색)
- Monaco Editor + Shiki(공식 Asciidoctor VS Code 확장과 동일한 TextMate 문법) 기반 신택스 하이라이팅
- Vim 모드 (한글 입력 상태에서도 정상 동작 — Normal 모드에서는 IME를 꺼서 조합 입력이 명령을 가로채지 않도록 처리)
- Web Worker로 분리된 비동기 렌더링 (타이핑 반응성 유지, 실패 시 메인 스레드로 자동 폴백)
- Asciidoctor AST를 `SafeDocument` allow-list 모델(설명 목록·체크리스트·인라인 이미지·위/아래 첨자·강조 표시 포함)로 정규화하고 Safe HTML로 렌더링 — 이미지·자산 경로는 `SafeAssetRef`로 검증하고, raw passthrough·안전하지 않은 자산 경로·지원하지 않는 출판 블록을 위치 정보와 함께 Preflight에 보고
- 파일 탐색기 + 문서 아웃라인(헤딩 트리, 클릭 시 해당 줄로 이동) + 백링크 탭 전환
- 파일 탐색기 우클릭 컨텍스트 메뉴로 새 노트/새 폴더 생성(즉시 이름 편집 모드로 진입), 이름 바꾸기, 삭제, 드래그 앤 드롭으로 다른 폴더에 이동 — 지금 열려 있는 문서가 대상이면 편집 중인 경로도 함께 갱신
- `/` 슬래시 명령어(표, admonition, Mermaid, 수식, 코드블록 등 스니펫 삽입) + 문법 치트시트(Help 버튼)
- 옵시디언 스타일 `[[위키링크]]`/`[[위키링크|표시 텍스트]]` — 클릭 시 해당 노트로 이동, 존재하지 않는 노트는 클릭해서 즉시 생성. 폴더(볼트)를 열면 그 안의 모든 노트를 대상으로 링크가 해석되고, 백링크 탭에서 현재 노트를 참조하는 다른 노트 목록을 확인 가능
- Graph view — 링크 관계를 Canvas로 탐색하고, Vault/Book Project 범위·태그·폴더·문서 유형·검색으로 필터링. 고립 문서와 깨진 링크를 구분해 보여 주며, 노드를 클릭해 문서를 열 수 있음. 큰 Vault는 렌더링 노드를 250개로 제한하고 화면 밖 노드를 그리지 않음
- `#태그`/`#중첩/태그` — 사이드바 Tags 탭에서 보관함 전체의 태그 목록과 노트 수를 보고, 태그를 클릭해 해당 노트 목록으로 드릴다운
- 노트 템플릿 — 보관함의 `.asciidoc-studio/templates/`에 일반 `.adoc` 파일로 저장, `{{title}}`/`{{date}}` 치환을 지원. 템플릿으로 새 노트를 만들거나 현재 문서를 새 템플릿으로 저장
- `include::`(다중 챕터 병합) / `image::`(로컬 이미지) 지시어 지원 — 두 경로 모두 문서가 열려 있는 폴더 밖으로 못 벗어나도록 검증
- Mermaid 다이어그램, highlight.js 코드 하이라이팅, 도형/표/코드블록 자동 번호 매기기 + 상호 참조
- 각주·미주 — `footnote:[내용]`은 페이지 주석으로, `endnote:[내용]`은 문서 끝 Notes 섹션의 별도 번호로 출력. HTML·EPUB·PDF에서 안전한 `SafeDocument` 인라인 노드로 동일하게 처리
- 인용/참고문헌 — `cite:[key]` 표기가 등장 순서대로 번호 매겨진 각주 스타일 참조로 렌더링되고 문서 끝에 References 섹션이 자동 생성됨(같은 키를 여러 번 인용해도 번호 재사용). 참고문헌 항목은 별도 다이얼로그에서 관리하며 `.bib` 파일을 가져와 새 키를 추가할 수 있음(기존 항목은 덮어쓰지 않음). 미등록 키는 "Unresolved citation"으로 표시되고 Preflight가 경고. 라이브 프리뷰·HTML·EPUB·PDF 네 출력 모두 동일하게 반영
- 15초 간격 미저장 편집 내용의 복구 스냅샷 및 비정상 종료 후 복구(원본 파일 저장은 Save로 실행)
- 선택적 Book Project — 제목·부제·저자·언어·ISBN/식별자·출판사·설명·권리·주제, 원고 순서·챕터 상태·단어 목표를 원고와 분리해 보관함의 `.asciidoc-studio/book.json`에 저장
- Explorer의 Book outline — 책 프로젝트가 있는 폴더에서 노트를 선택·정렬하고 초안/검토/완료 진행률과 전체 단어 수를 확인. 비문학·기술서·에세이집 AsciiDoc 스타터도 기존 파일을 덮어쓰지 않고 생성
- 편집기 하단 단어 수를 클릭하면 Writing tools — 현재 문서의 단어/문자/문단/읽기 시간, Book 단어 목표, 로컬 집중 타이머 제공
- Version history — Vault 안에서 바뀐 문서를 저장하기 직전 최대 30개의 스냅샷을 `.asciidoc-studio/history`에 보관하고, 명시적으로 편집기에 복원
- Publish Preflight — 저장되지 않은 원고, 렌더 오류, 필수 메타데이터, 원격 이미지, alt 텍스트 누락을 오류·경고·안내로 분류하고 저장·메타데이터·편집 위치 해결 흐름으로 연결. 별도 Print proof 검사는 작은 본문 글자·빽빽한 행간·빈 섹션·긴 표·캡션 없는 이미지·마지막 빈 페이지 같은 인쇄 레이아웃 위험을 출판 전에 알려 줌
- EPUB3 내보내기 — 챕터 분할은 DOM 파싱 없이 `SafeDocument` 구조를 직접 순회(최상위 섹션마다 챕터 분할 + 첫 섹션 이전 콘텐츠는 별도 Front Matter 챕터로 보존), 챕터 본문은 `safeHtmlRenderer.ts`로 렌더링한 뒤 DOM 왕복으로 XHTML 정합성을 검증, 로컬 이미지 번들링
- HTML 내보내기 — 테마·Mermaid·문법 강조·로컬 이미지가 포함된 독립 HTML 파일을 저장. 외부 네트워크와 `file:` URL은 차단
- PDF 내보내기 — Rust에 내장한 네이티브 Typst 컴파일러로 직접 컴파일(외부 브라우저 실행 없음). `SafeDocument`는 변형 없이 그대로 Rust로 전달되고, Typst 소스 생성·이스케이프는 전부 Rust(`typst_writer.rs`)가 담당 — WebView는 실행 가능한 마크업을 만들지 않는다. 수식은 `mitex`로 LaTeX→Typst 변환, Mermaid는 프런트엔드에서 SVG로 미리 렌더링 후 자산으로 번들, 한글은 Noto Serif/Sans KR을 번들해 실제 글리프로 렌더링(라이선스는 `src-tauri/assets/fonts/THIRD_PARTY_NOTICES.md`). PDF/A(A-2b) 내보내기와 veraPDF 검증 지원, 원격 이미지가 있으면 Preflight가 PDF 발행을 차단하고 로컬 이미지가 있는데 Vault가 열려 있지 않으면 "폴더 열기" 안내와 함께 발행을 막는다. 문서 헤더의 앞·뒤 표지 이미지, 목차 깊이, 그림·표·예시 캡션을 반영하고, 목차·이미지 캡션·상호 참조·머리말/꼬리말/쪽번호와 판형별 여백을 지원한다. 컴파일된 PDF는 Rust 캐시의 임시 파일 → 저장 위치로 원자적 이동(rename, 다른 볼륨이면 copyFile로 대체)해 WebView가 큰 파일을 메모리에 들고 있지 않는다.
- 고급 Typst 소스 내보내기 — Publish 창의 **Advanced outputs**에서 PDF와 같은 `write_document`(Rust)를 거쳐 완성된 Typst 소스와 참조 자산(이미지·Mermaid SVG)을 프로젝트 폴더로 저장. 자신의 Typst 툴체인으로 직접 `typst compile`하고 싶은 사용자만 쓰는 경로이며, 앱에서 컴파일하지 않는다
- 발행 스타일 3종(Book Serif, Literary, Reference)과 사용자 정의 Publication style editor + 라이트/다크 모드, 책 판형(B5/A4/A5/Letter) 선택 — 사용자 스타일은 글꼴·크기·행간·강조색·제목 번호뿐 아니라 본문 양쪽 정렬과 장의 새 페이지 시작을 안전한 데이터 설정으로 저장하며, 프리뷰·HTML·EPUB·PDF에 일관되게 반영

사용한 오픈소스 스택과 각 기술을 선택한 이유는 [TECH_STACK.md](./TECH_STACK.md)에 정리되어 있습니다.
새 기능과 리팩터링의 기준은 [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md)를 따릅니다.
렌더·출판 경계의 문서 모델은 [SAFE_DOCUMENT_SPEC.md](./SAFE_DOCUMENT_SPEC.md)에 명세되어 있습니다.
macOS 출시 준비는 [MACOS_RELEASE_GUIDE.md](./MACOS_RELEASE_GUIDE.md)를 따릅니다.
iPad/iOS 출시 준비와 실기기 검증은 [IOS_IPAD_RELEASE_GUIDE.md](./IOS_IPAD_RELEASE_GUIDE.md)를 따릅니다.
새로 추가한 UI 의존성의 라이선스 고지는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)에서 확인할 수 있습니다.

## 개발 환경

`packages/asciidoc-typst`는 별도 저장소([y30n9ju1v/asciidoc-typst](https://github.com/y30n9ju1v/asciidoc-typst))를 가리키는 git submodule입니다. 새로 clone했다면 `git submodule update --init`을 먼저 실행하세요(`git clone --recurse-submodules`로 한 번에 받아도 됩니다). 이 파이프라인을 수정할 때는 submodule 안에서 커밋·푸시한 뒤, 이 저장소에서 `git add desktop-app/packages/asciidoc-typst`로 가리키는 커밋을 갱신합니다.

저장·복구 실패, 비동기 경합, 샘플 북의 실제 PDF 생성 검증은 [RELIABILITY_TESTING.md](./RELIABILITY_TESTING.md)를 참고하세요. 네이티브 출판 통합 검사는 `npm run test:publication`으로 실행합니다(Rust 및 `pdftotext` 필요).

```bash
git submodule update --init
npm install
npm run tauri dev    # Tauri 데스크톱 앱으로 실행
npm run dev           # 프론트엔드만 브라우저에서 확인 (Tauri API는 동작하지 않음)
```

`vite.config.ts`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/*.json`을 바꾼 뒤에는 Vite의 핫리로드로 반영되지 않으므로 `tauri dev`를 완전히 재시작해야 합니다.

## 원고 보호와 노트 재사용

- 저장은 디스크의 기존 내용과 비교한 뒤 같은 폴더의 임시 파일을 통해 교체합니다. 외부 변경이 발견되면 덮어쓰지 않습니다. **More → Save a copy…**로 편집 내용을 새 파일에 보관하고 비교할 수 있습니다. 이미 존재하는 파일을 복사 대상으로 선택하면 덮어쓰지 않고 거부합니다.
- Explorer 삭제는 운영체제 휴지통 대신 원래 부모 폴더의 `.asciidoc-trash/`로 이동합니다. 알림의 **Undo**로 복구하거나 Finder에서 숨김 파일을 표시해 수동 복구할 수 있습니다. 이 폴더는 자동 비우기하지 않습니다.
- 이동·이름 변경은 위키링크와 직접 경로로 지정한 include/image/xref/link 및 Book Project 장 경로를 갱신합니다. 수정 원본은 `.asciidoc-studio/relocations/`에 남습니다. 속성을 이용한 동적 경로는 자동 갱신 대상이 아니므로 Preflight와 출력 검토가 필요합니다. 미저장 원고가 있으면 먼저 저장해야 합니다.
- 독립된 한 줄의 `[[id]]`는 AsciiDoc 앵커입니다. 한 줄짜리 노트 링크는 `[[note|표시 이름]]`을 사용합니다. 같은 제목의 노트는 자동 선택하지 않으며 `[[folder/note.adoc|표시 이름]]`처럼 경로로 구분합니다. 코드·리터럴 블록과 인라인 코드의 예제 문법은 보존합니다.
- 편집기에서 문단 선택 → 우클릭 → **Extract selection to linked note**로 독립 노트를 만듭니다. 원문 선택은 새 노트 링크로 바뀌고, 새 노트에는 원문 링크가 남습니다. 원문의 변경은 저장 전까지 편집기 Undo로 되돌릴 수 있습니다.
- Vault 갱신은 수정 시각·크기를 비교해 바뀐 파일만 다시 읽고, 검색에는 변경된 노트 본문과 전체 경로 목록을 전달합니다. 앱으로 돌아왔을 때도 갱신합니다. 전체 노트 본문은 백링크·태그 용도로 메모리에 유지하므로 대형 Vault의 메모리 사용은 별도로 검증해야 합니다.

## 책 조립과 Markdown 가져오기

폴더를 연 뒤 **상단 더 보기 → New book…**으로 책을 시작합니다. 책 프로젝트가 있는 폴더에서만 Explorer에 접을 수 있는 **Book outline** 패널이 나타납니다. 장을 선택·정렬하고 **Save outline**으로 구성을 저장합니다. **Assemble book…**을 누르면 폴더 루트에 새 `book-proof-*.adoc` 스냅샷을 생성해 엽니다. 이 문서를 검토한 다음 **Publish**에서 출력합니다. 원본 노트가 바뀌면 다시 조립해야 하며, 기존 `main.adoc`는 자동 수정하지 않습니다. 누락된 장이나 폴더 밖 경로는 조립을 중단합니다. `include::`로 직접 구성한 책은 계속 원고에서 순서를 관리해도 됩니다.

### 집필과 교정 화면

상단의 **현재 스타일 · 용지 크기** 버튼을 누르면 한 줄 교정 도구 막대가 열립니다. **스타일·용지·본문 크기·줄간격**만 표시하며, 큰 설정 패널과 Advanced 영역은 없습니다. 좁은 창에서는 조절 항목만 가로 스크롤되고 저장·초기화·닫기는 오른쪽에 유지됩니다. 문단 간격·자간·단어 간격·들여쓰기·양쪽 정렬·장 나누기는 **조판 도구 막대의 Style → Manage styles…**에서 사용자 스타일로 설정할 수 있습니다. PDF 미리보기와 출판 창은 동일한 설정을 사용합니다. 집필 모드에서 설정을 열면 교정 모드로 전환됩니다.

Vault에서는 변경이 있을 때만 나타나는 **Save layout**으로 선택한 스타일·용지·현재 스타일의 조판 값을 책에 함께 저장합니다. 기존 책에 이 설정이 없으면 Book Serif/B5로 시작하며, 다른 책의 설정을 가져오지 않습니다. 미저장 설정은 세션 중 Vault별로 분리하고 재실행하면 사라집니다. Vault가 없는 단일 문서의 스타일·용지는 앱 기본값에 저장됩니다. 원고 저장과 출판 설정 저장은 별개이며, 저장 대상은 저장 버튼 툴팁으로 확인할 수 있습니다.

상단 **Write / Preview**로 집필 전용 화면과 PDF 미리보기 화면을 전환합니다. 기존 Proof 모드의 저장된 선택은 그대로 유지됩니다. 조판 버튼은 집필 화면에서도 미리보기 화면을 열 수 있습니다. **Save**는 원고 저장이며, 아직 파일로 저장하지 않은 문서는 **Not saved**로 표시됩니다. 책 구성은 별도 창 없이 Explorer의 **Book outline**에서 관리하며, 더 보기 메뉴에는 문서 보조 작업·책/출판·도움말만 남깁니다. 새 문서 템플릿은 **New → From template…**, Vim·다크 모드는 **Editor settings**, 그래프는 Explorer의 **Graph view**에서 엽니다. 작은 화면에서는 New·Open·템플릿 메뉴가 더 보기에 표시됩니다.

Write 모드에서는 PDF 미리보기 예약 작업을 취소합니다. 이미 실행 중인 네이티브 컴파일은 강제 종료하지 않으며, 완료 결과를 폐기한 뒤 Preview 모드의 최신 문서만 처리합니다. AsciiDoc 변환과 명시적 Publish 내보내기는 계속 사용할 수 있습니다. 긴 문서에서도 단일 미리보기 작업 보장을 유지하기 위해 30초 후 대기만 중단하던 타임아웃은 사용하지 않습니다.

개발 실행(`npm run tauri dev`)의 `[preview-performance]` 로그로 병목을 측정할 수 있습니다. WebView 콘솔에는 `asciidoc-pipeline`(include·변환·HTML 자산 포함), `preview-assets`(Mermaid 등 준비), `native-pdf-roundtrip`(IPC·네이티브 생성·저장 포함), `pdf-first-page`(PDF 읽기부터 첫 페이지 표시까지)가 표시됩니다. Rust 실행 터미널에는 `native-assets`, `typst-source`, `engine-and-fonts`, `typst-layout`, `pdf-encode`가 개별 측정됩니다. 밀리초 단위의 구간 시간이며 서로 중첩되므로 전부 더하지 않습니다. 디바운스 대기 시간은 제외됩니다. 로그에는 원고·경로를 넣지 않으며 Release 빌드에서는 출력하지 않습니다. 같은 문서로 최초 실행과 재편집을 나누어 비교하세요.

조판 수치는 숫자 입력(Enter나 포커스 이동으로 적용)으로 변경합니다. 반복되는 슬라이더는 두지 않으며, 항목별 기본값 복원 버튼은 마우스를 올리거나 포커스할 때 표시됩니다. 전체 조판 초기화 버튼은 조판을 변경한 경우에만 도구 막대 오른쪽에 표시됩니다. PDF 상태는 도구 막대 툴팁으로 확인할 수 있고, 상태 변화는 스크린 리더에도 전달됩니다. 패널 분할선은 Tab으로 선택한 뒤 좌우 방향키로 크기를 조절할 수 있습니다. Preflight의 **Review in editor**는 출판 창을 닫고 해당 원문으로 이동합니다.

**More → Import Markdown folder…**는 선택한 폴더를 새로운 `Imported-*/` 폴더로 가져옵니다. 기본 제목·코드 블록·링크·굵게·목록을 변환하고 이미지 파일을 복사합니다. 원본 Markdown은 가져온 폴더의 `.asciidoc-studio/import-originals/`에 보존합니다. YAML 속성, 플러그인 문법, 임베드, 복잡한 표·각주는 완전 변환 대상이 아니며 `IMPORT-REPORT.adoc`를 확인해야 합니다. 자동 변환 결과는 출판 전 반드시 검토하세요.

Print proof는 원고와 조판 설정을 대상으로 하는 편집 검토입니다. PDF/X, 재단 여백, CMYK/ICC, 실제 출력 이미지 DPI의 인쇄소 적합성 인증은 제공하지 않습니다. 출시 전 EPUBCheck·veraPDF 및 실제 출력물 검수는 별도 단계입니다.

## 샘플 북 열기

`sample-book/`에 다중 챕터·Mermaid 다이어그램·코드 블록·로컬 이미지가 들어간 예시 AsciiDoc 프로젝트가 있습니다. `npm run tauri dev`로 앱을 띄운 뒤 Explorer의 **Open folder**로 `sample-book/`을 열고 `main.adoc`을 선택하세요. 폴더를 통해 열어야 포함 문서와 로컬 이미지에 필요한 런타임 접근 권한이 부여됩니다. Chapter 1의 삽화는 이미지 캡션·상대 경로 해석·HTML/EPUB/PDF 내보내기를, Chapter 4는 PDF의 수식 번호·코드 callout·자동/명시적 교차참조를 함께 점검합니다.

## 스크립트

| 명령                                      | 설명                                              |
| ----------------------------------------- | ------------------------------------------------- |
| `npm run tauri dev`                       | 데스크톱 앱 개발 모드로 실행                      |
| `npm run tauri build`                     | 배포용 데스크톱 바이너리 빌드                     |
| `npm run release:macos:verify`            | Apple 서명·Sandbox entitlement·앱 메타데이터 검증 |
| `npm run build`                           | 프론트엔드 타입체크 + 빌드                        |
| `npm run lint` / `npm run lint:fix`       | ESLint 검사 / 자동 수정                           |
| `npm run format` / `npm run format:check` | Prettier 포맷 적용 / 검사                         |

## 진단 로그

예기치 못한 오류와 Rust 패닉은 JSON Lines 형식으로 기록됩니다. 프런트엔드 오류의 사용자 홈 경로(`/Users/...`, `/home/...`)는
자동으로 제거되지만, 이는 알려진 경로 패턴만 걸러내는 방어적 조치입니다 — 일부 서드파티 라이브러리(Asciidoctor.js, Mermaid 등)의
파싱 오류 메시지는 문서 내용의 일부를 그대로 포함할 수 있으니, 지원 요청에 첨부하기 전에 `diagnostics.log` 내용을 확인하세요.
오류 화면의 **Save diagnostic log**는 네이티브 저장 패널로 고객 지원용 사본을 저장합니다. Finder나 외부 프로세스를 실행하지 않아
App Sandbox에서도 동작합니다. 로그는 1 MiB를 넘으면 이전 로그 한 개만 보관하는 방식으로 회전합니다.

## 권장 IDE 설정

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
