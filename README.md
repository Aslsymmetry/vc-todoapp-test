# 하루 — Firebase Realtime Database 할 일 앱

HTML / CSS / JavaScript로 만든 할 일 앱입니다. **Firebase Realtime Database가 할 일의 기본 저장소**입니다. `localStorage`는 이전 버전의 데이터를 사용자가 명시적으로 가져올 때만 읽습니다.

## 기능

- 이메일/비밀번호 회원가입 및 로그인(Firebase Authentication)
- 할 일 추가, 수정, 완료 상태 변경, 삭제
- 검색, 진행 중/완료 필터, 중요도, 마감일, 메모, 진행률
- 같은 계정의 다른 브라우저에서도 Realtime Database 실시간 동기화
- 사용자별 데이터 경로 `todos/{uid}/{todoId}` 및 계정 간 접근 차단 규칙
- Firebase 읽기 테스트 / 명시적 동의 후 임시 데이터 쓰기→재조회→삭제 진단
- 이전 `localStorage` 데이터의 명시적·중복 방지 가져오기
- Firebase 오류 시 오류 코드 표시(무조건 성공으로 표시하지 않음)

## 처음 사용할 때 Firebase 콘솔에서 해야 할 일

프로젝트: `todo-backend-8ac43`  /  데이터베이스 URL: `https://todo-backend-8ac43-default-rtdb.firebaseio.com/`

1. Firebase 콘솔 > **Authentication** > **Sign-in method** > **이메일/비밀번호** 활성화.
2. Firebase 콘솔 > **Realtime Database** > **규칙**에서 현재 규칙을 먼저 백업한 다음 `database.rules.json` 규칙을 검토·적용·게시하세요. 기존 데이터베이스의 다른 경로가 존재하면 규칙 파일을 무조건 통째로 붙여넣지 말고 병합해야 합니다.
3. Realtime Database의 URL과 프로젝트 ID가 의도한 프로젝트인지 확인하세요.
4. 회원가입 후 할 일 하나를 생성하면 콘솔의 `todos/{가입한 계정의 uid}` 아래에 데이터가 생겨야 합니다. 콘솔 루트에 바로 할 일 제목이 생기지 않습니다.
5. **Firebase 연결 상태·실제 저장 경로 확인**을 열어 읽기/쓰기 진단을 실행하세요. 쓰기 테스트는 버튼을 눌러 확인했을 때만 임시 항목을 만들었다가 삭제합니다. 테스트 중 오류가 나면 임시 항목이 남을 수 있으니 콘솔에서 확인하세요.

보안 규칙을 `.read: true` / `.write: true`로 열어 테스트하지 마세요. 계정 소유자만 자신의 경로에 접근하도록 되어 있습니다.

## 로컬 실행

- macOS: `맥에서-실행.command` 실행 (필요 시 터미널에서 `bash 맥에서-실행.command`)
- Windows: `윈도우에서-실행.bat` 실행
- Python 3.8+ 필요. 실행 주소: http://127.0.0.1:3000/index.html
- 서버 실행 창을 종료하면 로컬 접속도 종료됩니다.
- Firebase 인증과 데이터베이스 사용 시 인터넷이 필요합니다.

## 외부 호스팅

`vercel.json`은 `public` 폴더를 정적 웹사이트로 제공하도록 설정되어 있습니다. 별도 Node/Python 백엔드는 **배포에 필요 없습니다**. 사용자가 Vercel 배포를 직접 진행합니다. 배포 후 OAuth나 이메일 링크 등 다른 인증 수단을 추가한다면 Firebase Authentication 허용 도메인을 확인하세요.

## 프로젝트 구성

- `public/index.html`: 웹 UI 및 스타일
- `public/app.js`: Firebase 연결/인증/할 일 관리
- `database.rules.json`: RTDB 보안 규칙 (GitHub에 업로드만으로 실제 Firebase 규칙이 변경되지는 않음)
- `vercel.json`: 향후 정적 배포용 설정
- `server.py`, `맥에서-실행.command`, `윈도우에서-실행.bat`: 로컬 미리보기 실행기

## 제한 사항 / 검증 범위

- 실제 프로젝트의 **Authentication 활성화 및 Realtime Database 규칙 적용은 Firebase 콘솔에서 별도로 수행**해야 합니다.
- 실제 Firebase 브라우저 회원가입을 시도했으나 `auth/configuration-not-found`로 차단됐습니다. Authentication 설정 활성화가 필요합니다. 실제 CRUD/동기화/권한 격리는 아직 미검증입니다. 자세한 결과는 `VERIFICATION.md`를 확인하세요.
- Firebase 초기화 설정에 포함된 `apiKey`는 웹 클라이언트 설정값입니다. 공개 저장소에 노출되므로 **보안은 Firebase Authentication, Realtime Database 규칙 및 필요한 API 키 제한**으로 유지해야 합니다. 관리자 서비스 계정 키는 코드/저장소에 넣지 마세요.
- 예전 앱과 이 앱은 도메인이 다르면 `localStorage`를 공유하지 않습니다. 같은 오리진에서 실행한 예전 앱에 저장된 자료만 직접 가져올 수 있습니다.

## 문제 진단

- `PERMISSION_DENIED`: Realtime Database 규칙이 해당 계정의 read/write를 허용하는지 확인.
- `auth/operation-not-allowed`: 이메일/비밀번호 로그인을 활성화.
- Firebase SDK import 실패: 인터넷/CDN 접속과 브라우저 콘솔 확인.
- `null`: 아직 해당 데이터베이스에 데이터가 없거나, 다른 프로젝트/경로를 보고 있는지 확인.
- 인증은 되지만 저장이 안 됨: 앱의 진단 패널에서 오류 코드와 `todos/{uid}` 경로를 확인.

### 실제 Firebase 저장 최종 수락 기준

- Firebase 콘솔 Authentication의 **이메일/비밀번호** 로그인을 먼저 활성화하고 이 프로젝트의 보안 규칙을 직접 검토·게시해야 합니다. 이 설정이 없으면 가입·읽기·쓰기가 실패할 수 있습니다.
- 로그인 후 저장/수정/완료/삭제 각각을 수행하고 Firebase 콘솔 `todos/{uid}`에서 결과를 확인하세요. 다른 브라우저에서도 **같은 계정**으로 로그인해 실시간 반영을 확인하세요.
- 진단 버튼의 SDK `get()`은 네트워크를 우선 조회하지만 연결 상황에 따라 로컬 캐시를 반환할 수 있습니다. **진단 통과만으로 콘솔 반영을 단정하지 않습니다.**
- GitHub에 코드를 업로드하는 것만으로 **Firebase 규칙과 Authentication 설정은 변경되지 않습니다.** 이 단계는 Firebase 프로젝트 관리자가 완료해야 합니다.
- 검증 실패 시 화면의 Firebase 오류 코드와 `todos/{uid}` 경로를 복사해 전달하면 원인 분석이 가능합니다.

## 자동 브라우저 검증

Python 서버를 실행한 상태에서 `npm install --no-save playwright` 후 `node tests/browser.cjs`로 모의 기능 검증을 실행합니다. 실제 서버 검증은 `HARU_LIVE_TEST=1 node tests/live_browser.cjs`이며 임시 계정과 테스트 데이터만 생성·정리합니다. Firebase 설정을 먼저 완료해야 합니다.
