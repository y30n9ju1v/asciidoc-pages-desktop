# macOS 출시 가이드

이 문서는 AsciiDoc Studio를 macOS에서 유료로 배포하기 위한 출시 기준이다. 기본 경로는 **Mac App Store**이며, 직접 판매·배포는 별도 경로로 취급한다. 출시 직전에는 반드시 최신 [Apple 심사 지침](https://developer.apple.com/app-store/review/guidelines/)과 App Store Connect의 현재 요구 사항을 다시 확인한다.

## 1. 배포 경로를 먼저 결정한다

| 경로          | 용도                        | 필수 보안 기준                                                 |
| ------------- | --------------------------- | -------------------------------------------------------------- |
| Mac App Store | 이 앱의 기본 판매 경로      | App Sandbox, App Store 배포용 서명·프로비저닝, App Review 통과 |
| 직접 배포     | 자체 판매 사이트, 체험판 등 | Developer ID 서명, Hardened Runtime, Apple notarization        |

- Mac App Store 제출 앱에는 App Sandbox가 필요하다. 직접 배포용 공증은 App Store 제출을 대체하지 않는다.
- 두 경로는 서로 다른 서명·업데이트·지원 흐름으로 관리한다. 동일 사용자의 로컬 데이터와 컨테이너를 경로 간에 암묵적으로 공유한다고 가정하지 않는다.
- 외부 브라우저 실행, 임의 셸 실행, 설치 프로그램 생성 같은 기능은 기본 제품에 넣지 않는다. 출시 후 필요해져도 샌드박스 호환성과 심사를 먼저 검토한다.

Apple 참고: [Mac App Sandbox 구성](https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox), [직접 배포 공증](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## 2. 이 앱의 권한 원칙

AsciiDoc Studio는 사용자가 고른 Vault와 저장 위치에서만 파일을 읽고 쓴다. 이는 제품 기능이자 보안 경계다.

- `src-tauri/entitlements.plist`에서 `com.apple.security.app-sandbox`를 활성화한다.
- 파일 접근은 `com.apple.security.files.user-selected.read-write`만 기본으로 요청한다. `Downloads`, `Documents`, `Desktop` 등 위치별 광범위 권한은 추가하지 않는다.
- Tauri의 폴더·파일 선택 다이얼로그가 부여한 런타임 범위 안에서만 작업한다. capability에 `$HOME/**` 같은 정적 광역 경로를 추가하지 않는다.
- macOS의 재귀 경로 패턴은 숨김 폴더를 자동으로 포함하지 않는다. Vault 선택 시 그 루트의 `.asciidoc-studio`만 별도 런타임 범위로 허용해 책 정보·이력·스타일을 저장한다. 이 설정 폴더가 심볼릭 링크이면 거부하며, 숨김 폴더 전체 허용으로 우회하지 않는다.
- 파일 명령 권한은 명령 자체만 활성화하는 bare permission으로 선언하고, 정적 경로 범위는 `fs:scope`의 `$TEMP/**`로 제한한다. 선택한 Vault 경로는 네이티브 다이얼로그 뒤에 런타임으로만 추가한다. bare permission은 임의 경로 접근을 허용하지 않는다.
- 현재 앱은 Vault 경로를 재실행 후 복원하지 않는다. 나중에 최근 Vault 기능을 추가한다면 보안 범위 URL bookmark를 사용하고, 접근 직후 해제·갱신·실패 처리를 구현한다. 단순 경로 문자열 저장으로 권한을 우회하지 않는다.
- 현재 원격 이미지는 미리보기에서 허용될 수 있어 `com.apple.security.network.client`를 포함한다. Privacy·심사 설명과 Preflight 경고를 이 동작과 일치시킨다. 원격 자원을 제품에서 금지한다면 CSP와 렌더러를 함께 막고 이 entitlement도 제거한다.
- 사용자가 선택한 위치에 실행 파일을 쓰는 기능은 제공하지 않는다. `user-selected.executable` entitlement를 요청하지 않는다.

폴더를 선택하면 그 하위 항목에 대한 접근 범위가 확장되며, 재시작 뒤에도 접근해야 할 때는 security-scoped bookmark가 필요하다. [Apple의 파일 샌드박스 설명](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox?language=objc)을 기준으로 구현·테스트한다.

## 3. 출시 설정과 식별자

출시 브랜치마다 다음 항목을 확인한다.

- `src-tauri/tauri.conf.json`의 `identifier`는 App Store Connect에 등록한 고유 Bundle ID와 정확히 같아야 한다. 현재 값 `com.asciidoc.studio`는 등록·소유 여부를 배포 전에 확인한다.
- 표시 이름, 번들 이름, 아이콘, 저작권 표기, 지원 URL은 실제 판매 정보와 일치해야 한다.
- 사용자가 받는 버전과 빌드 번호는 매 업로드마다 증가해야 한다. 생성된 `.app`의 `CFBundleShortVersionString`과 `CFBundleVersion`을 확인한다.
- `src-tauri/icons/icon.icns`를 실제 앱 아이콘으로 검수한다. Finder, Dock, 다크/라이트 배경, 여러 해상도에서 식별 가능하고 제3자 상표를 침해하지 않아야 한다.
- CPU 대상은 Apple Silicon, Intel 개별 빌드 또는 universal binary 중 하나를 릴리스 정책으로 정하고, 실제 배포 산출물에서 확인한다.

## 4. 서명·entitlement·공증

### Mac App Store

1. Apple Developer 계정과 App ID를 준비하고, 배포용 인증서·프로비저닝 프로필을 CI 또는 로컬 보안 키체인에서만 관리한다.
2. `src-tauri/entitlements.plist`의 App Sandbox entitlement가 위의 최소 권한만 포함하는지 확인한다.
3. 서명된 앱을 샌드박스 환경에서 실제 실행한다. Vault 열기, 중첩 폴더, `include::`, 이미지, 저장, HTML/EPUB 내보내기, SQLite 검색을 모두 검증한다.
4. 서명과 entitlements를 검사한 패키지만 App Store Connect에 업로드한다.

### 직접 배포

- Developer ID Application 인증서로 서명하고 Hardened Runtime을 활성화한다.
- ZIP 또는 DMG를 Apple notarization에 제출하고, 결과 로그의 경고까지 검토한다.
- 공증된 최종 산출물을 Gatekeeper가 켜진 깨끗한 macOS 계정에서 설치·실행한다.

인증서, Team ID, private key, `.p12`, provisioning profile, notarization 비밀번호는 Git·소스·로그에 절대 넣지 않는다. 배포 준비와 버전 증가 원칙은 [Apple 배포 준비 문서](https://developer.apple.com/documentation/Xcode/preparing-your-app-for-distribution)를 따른다.

## 5. 개인정보와 데이터 고지

- 이 앱의 원고, Vault 인덱스, Book Project 메타데이터, 복구 데이터가 어디에 저장되고 언제 삭제되는지 개인정보 처리방침에 평이한 언어로 쓴다.
- 현재 제품이 분석·계정·원격 동기화를 제공하지 않는다면, App Store Connect의 App Privacy 선언도 실제로 “수집하지 않음”인지 의존성·네트워크 요청까지 포함해 확인한다. 추측으로 선택하지 않는다.
- 분석, 충돌 보고, 로그인, 결제 SDK, 원격 폰트·이미지·업데이트 서비스를 추가할 때마다 App Privacy, privacy policy, 심사 노트를 함께 갱신한다.
- 앱과 포함된 SDK의 `PrivacyInfo.xcprivacy` 필요 여부 및 required-reason API 사용을 출시마다 감사한다. 플랫폼별 요구 사항과 허용 사유는 [Apple privacy manifest 문서](https://developer.apple.com/documentation/BundleResources/privacy-manifest-files)와 [required-reason API 문서](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)를 기준으로 한다.
- 원격 이미지가 가능하다는 사실, 오프라인 HTML/EPUB은 자산을 번들하려 한다는 사실, SQLite 색인은 앱 데이터 영역의 폐기 가능한 로컬 색인이라는 사실을 지원 문서와 심사 노트에 명시한다.

## 6. App Review에 제출할 정보

- 판매명, 부제, 설명, 키워드, 카테고리, 연령 등급, 지원 URL, 개인정보 처리방침 URL, 저작권을 준비한다.
- 실제 앱 화면을 보여 주는 macOS 스크린샷을 제공한다. 편집기·미리보기·Vault·Book Project·HTML/EPUB 내보내기의 핵심 흐름이 드러나야 한다.
- 심사 노트에 “사용자가 선택한 폴더만 읽고 쓴다”, “계정이 필요 없다”, “원격 이미지는 선택적이며 Preflight가 경고한다”를 적고, 재현 순서를 제공한다.
- 로그인, 결제, 잠긴 콘텐츠, 외부 서비스가 생기면 심사용 테스트 계정·데모 데이터·해제 절차를 함께 제공한다.
- 암호화 수출 규정 질문은 실제 사용하는 암호화와 배포 경로를 기준으로 답한다. 모르면 법률·Apple 안내를 확인하고 임의로 면제 처리하지 않는다.

## 7. 릴리스 품질 게이트

다음은 버전 태그를 만들기 전에 통과해야 한다.

```bash
cd desktop-app
npm run lint
npm test -- --run
npm run build
npm run tauri build -- --bundles app
npm run release:macos:verify

cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

PDF 출력을 PDF/A로 내보낸 적이 있다면, veraPDF([설치 안내](https://docs.verapdf.org/install/))로 실제 산출물을 검증한다 - `PdfStandards::new([PdfStandard::A_2b])` 강제와 `cargo test`의 매직 바이트 검사만으로는 폰트 임베딩·색상 프로파일·메타데이터까지 포함한 실제 PDF/A 준수를 보장하지 못한다. EPUBCheck와 마찬가지로 매 커밋이 아니라 릴리스 시점의 필수 체크다.

```bash
desktop-app/scripts/verify-pdfa.sh path/to/exported.pdf
```

그 다음 실제 Release 모드 Tauri 산출물을 만들고 다음을 수동으로 확인한다.

1. 새 macOS 사용자 계정 또는 깨끗한 테스트 Mac에서 앱을 설치한다.
2. 선택한 Vault의 생성·이름 변경·이동·삭제·다시 열기, 하위 폴더와 `include::`를 확인한다.
3. 허용되지 않은 경로, `file:` URL, 경로 탈출 이미지·include가 거부되는지 확인한다.
4. HTML, EPUB, PDF가 외부 브라우저·외부 실행 파일 없이 생성되는지 확인한다. PDF는 Noto Serif/Sans KR이 번들되어 있어 한글 본문이 실제 글리프로 렌더링된다(`src-tauri/assets/fonts/`, 라이선스는 `THIRD_PARTY_NOTICES.md`) — 표·목록·수식·이미지·Mermaid 다이어그램, 표지·목차·이미지 캡션·상호참조·머리말/꼬리말·쪽번호가 실제로 포함되는지 육안으로 확인한다.
5. 앱을 종료·재실행해 검색 인덱스, 복구 데이터, Vault 권한, Book Project 동작을 확인한다.
6. Apple Silicon 및 지원하는 Intel 환경에서 각각 실행한다.
7. 서명·entitlements·App Sandbox 상태를 검사하고, 직접 배포라면 공증·Gatekeeper도 검사한다.

## 8. 현재 저장소의 출시 전 차이

현재 `src-tauri/tauri.conf.json`에는 제품명, Bundle ID, Productivity 카테고리, `.icns` 아이콘, macOS 11.0 최소 버전, AsciiDoc Finder 파일 연결이 있으며, 파일 선택 기반 기능과 일치하는 Tauri capability가 있다. `src-tauri/entitlements.plist`는 App Sandbox, 사용자 선택 파일 읽기/쓰기, 원격 이미지용 outbound network를 선언한다. 그러나 다음은 아직 별도로 준비해야 한다.

- Mac App Store 서명/프로비저닝 구성과 실제 Apple Team 서명 검증
- App Store Connect 앱 등록, 가격·세금·은행·계약 정보, 스토어 메타데이터와 지원/개인정보 처리방침 URL
- `PrivacyInfo.xcprivacy` 및 의존성 개인정보 감사 결과
- Release 모드 실기기 샌드박스 테스트와 서명 검증 자동화
- 배포 CPU 정책과 Apple Silicon·Intel 테스트 기록

이 항목들이 완료되기 전에는 “Mac App Store 출시 가능”으로 표시하지 않는다.
