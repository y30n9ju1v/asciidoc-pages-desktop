# iPad 출시 가이드

AsciiDoc Studio는 Tauri v2의 iOS 타깃을 사용해 iPad 앱으로 빌드할 수 있도록 준비되어 있다. 이 문서는 네이티브 iOS 프로젝트를 생성하고 App Store 배포까지 진행하는 체크리스트다.

## 현재 코드 상태

- 작업 공간은 iPad 가로 폭에서 Explorer·편집기·PDF 미리보기 어느 한쪽도 지나치게 좁아지지 않도록 각 글쓰기 패널에 최소 320px 규칙을 적용한다.
- 패널 크기 조절은 Pointer Events를 사용하므로 마우스뿐 아니라 손가락과 Apple Pencil으로 동작한다. iPad에서는 조절바의 터치 영역을 16px로 넓히되, 시각적 구분선은 얇게 유지한다.
- 거친 포인터 환경에서는 헤더·편집기·PDF 컨트롤의 조작 영역을 최소 40px로 확장하고 safe area inset을 반영한다.
- Rust 시작점에는 이미 `#[cfg_attr(mobile, tauri::mobile_entry_point)]`가 적용돼 있어 Tauri 모바일 런타임 진입점을 사용한다.

이 작업은 반응형 UI와 공유 Rust/TypeScript 코드를 준비한 것이다. `src-tauri/gen/apple` Xcode 프로젝트는 개발 환경에서 생성하는 산출물이므로 저장소에 임의로 만들어 넣지 않는다.

## 1. 개발 환경 준비

iOS 개발은 macOS에서만 가능하다. 전체 Xcode를 설치·한 번 실행한 뒤 다음을 준비한다.

```bash
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
brew install cocoapods

cd desktop-app
npm run ios:doctor
```

`ios:doctor`가 Xcode, Simulator, CocoaPods, Rust target과 생성된 Xcode 프로젝트를 검사한다. 첫 실행에서 마지막 항목이 없다는 오류는 정상이며 다음 단계에서 만든다.

## 2. iOS 프로젝트 생성과 실행

```bash
cd desktop-app
npm run ios:init
npm run ios:doctor
npm run ios:dev
```

`ios:init`은 `src-tauri/gen/apple`에 Xcode 프로젝트를 만든다. 생성 후 Xcode에서 iPad Simulator를 선택해 가로 모드와 Split View를 점검한다.

## 3. iPad 제품 설정

Xcode의 생성된 앱 target에서 다음을 확정한다.

1. Bundle Identifier를 App Store Connect에 등록한 실제 값으로 설정한다. 현재 기본 식별자는 `com.asciidoc.studio`다.
2. Apple Developer Team, iOS Distribution 인증서, App Store provisioning profile을 지정한다.
3. Deployment Target을 제품 지원 정책에 맞게 정한다. iPadOS 16 이상을 권장 기준으로 삼는다.
4. iPad 방향을 가로 우선으로 설정한다. 제품 정책이 가로 전용이면 `UIInterfaceOrientationLandscapeLeft`와 `UIInterfaceOrientationLandscapeRight`만 허용하고, 세로도 지원할 계획이면 별도 세로 UX 검증 뒤에 추가한다.
5. Assets.xcassets에 App Store용 1024×1024 아이콘과 필요한 iPad 아이콘 변형을 제공한다.
6. 사용자 파일은 반드시 시스템 문서 선택기로 선택하게 유지한다. 전체 파일 접근, 사진 보관함 접근, 불필요한 iCloud entitlement를 추가하지 않는다.

## 4. iPad 필수 QA

- 11인치·13인치 iPad Simulator와 실제 기기에서 가로 전체 화면 및 1/2 Split View를 검사한다.
- Explorer 토글, 두 개의 패널 조절바, Monaco 입력·선택·스크롤을 손가락과 Apple Pencil으로 검사한다.
- 긴 문서, Mermaid, 수식, 로컬 이미지, PDF 미리보기의 메모리·복귀 동작을 실제 기기에서 확인한다.
- iOS 문서 선택기로 Vault를 열고, include·이미지의 상대 경로가 선택한 폴더 밖으로 나가지 않는지 확인한다.
- 백그라운드 전환, 화면 회전, 저전력 모드에서 자동 복구와 SQLite 검색 인덱스가 안전하게 동작하는지 확인한다.
- PDF/EPUB/HTML 내보내기와 공유 시트 저장 경로를 실제 기기에서 검증한다. 특히 Typst·폰트·PDF 라이브러리는 iOS 실기기 아키텍처에서 컴파일과 출력 테스트가 필요하다.

## 5. 배포

```bash
cd desktop-app
npm run build
npm run ios:build
```

Archive는 Xcode Organizer에서 Validate App을 거쳐 App Store Connect로 올린다. TestFlight에서 iPad 실제 기기 검증을 마친 뒤 심사 제출한다. iOS 배포에는 등록된 Bundle ID, 배포 인증서, provisioning profile이 필요하다.

## 출시 전 보안 원칙

- 현재의 SafeDocument, 자산 경로 검증, 사용자 선택 파일 범위를 iOS에서도 약화하지 않는다.
- PDF 컴파일러가 읽는 로컬 자산은 사용자 선택 폴더 또는 앱 cache 아래에 있는지 재검증한다.
- 진단 로그에는 문서 본문·개인 경로·비밀 값을 넣지 않는다. 고객이 로그를 공유하기 전 검토할 수 있게 한다.
- 새 iOS capability 또는 Info.plist privacy usage description은 실제 기능 요구가 생길 때만 추가하고, App Store Privacy Nutrition Label도 그 구현과 일치시킨다.
