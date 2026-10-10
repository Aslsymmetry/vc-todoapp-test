# 하루 — 로그인 없는 공개 공유 할 일 앱

기존 화면 디자인을 유지하며 화면 동작과 Firebase 연결 코드를 새로 작성한 정적 웹앱입니다. 회원가입, 로그인, 익명 계정 생성 없이 모두가 `/sharedTodos` 목록을 공유합니다.

## 기능

할 일 추가·수정·삭제, 완료/미완료, 제목/메모 검색, 진행 중/완료 필터, 중요도, 마감일, 메모, 통계와 진행률을 제공합니다. Firebase 스트림 알림과 3초 간격 재조회로 브라우저 간 변경을 반영합니다. 수정·삭제에는 서버 ETag 조건을 사용하며, 열린 편집 창의 원본이 바뀌었으면 덮어쓰지 않습니다.

연결 실패, 접근 거부, 오프라인, 동시 수정은 화면에 표시합니다. 저장 성공은 Firebase의 쓰기 응답을 받은 후에만 표시합니다. 실패 시 입력 내용은 유지합니다. `localStorage`나 브라우저 메모리를 실제 DB로 대체하지 않습니다.

## Firebase 설정과 현재 상태

사용자가 제공한 설정은 `public/config.js`에 있습니다.

- 프로젝트: `todo-backend-8ac43`
- RTDB: `https://todo-backend-8ac43-default-rtdb.firebaseio.com/`
- 공유 경로: `/sharedTodos/{todoId}`

웹 설정값은 관리자 권한이 아닙니다. REST 요청은 로그인·토큰·쿠키 없이 전송합니다. 앱은 Google/Firebase 관리자 계정에 접근하지 않습니다.

**현재 실제 서버는 공유 경로의 인증 없는 읽기에 HTTP 401을 반환합니다.** 소스 재구현으로 서버 규칙을 우회할 수 없습니다. `database.rules.json`은 공유 경로와 검증에 필요한 규칙 파일이며 아직 서버에 게시되지 않았습니다. 따라서 이 소스를 실행하면 현재는 권한 오류와 재시도 화면이 표시됩니다. 실제 DB CRUD가 정상 동작하는 배포 완료 상태라고 주장하지 않습니다.

이전에 활성화한 Firebase 이메일/비밀번호 인증 제공자도 취소되지 않은 상태입니다. 새 앱에는 해당 제공자를 사용하는 코드가 없습니다. 계정 접근 금지 요청에 따라 관리자 설정은 변경하지 않았습니다.

## 실행 및 배포

로컬: `python3 server.py --no-browser` → `http://127.0.0.1:3000/index.html`.
맥/윈도우 실행기도 제공합니다. Python 3.8 이상과 인터넷 연결이 필요합니다.

Vercel: 저장소를 가져오고 프레임워크는 Other, 출력 디렉터리는 `public`을 사용합니다. 앱에 빌드 과정이나 서버 비밀키는 필요하지 않습니다. Vercel 실제 배포는 수행하지 않았습니다.

## 파일

- `public/index.html`: 반응형 화면과 스타일
- `public/app.js`: 화면 상태, 입력, 필터, CRUD 동작
- `public/store.js`: Firebase REST·조건부 쓰기·스트림·재접속
- `public/config.js`: 사용자가 제공한 공개 연결 설정
- `database.rules.json`: 공유 경로 전용 후보 규칙
- `server.py`, 실행기, `vercel.json`: 로컬 실행 및 정적 배포

## 검증

`npm install` 후 테스트용 Chrome이 있으면 `npm test`를 실행합니다. 다른 Chromium을 사용하는 경우 테스트의 launch 설정을 환경에 맞게 변경해야 합니다.

- `python3 tests/check_static.py`: DOM·Auth 미사용·공유 경로·배포 구조 검사
- `node tests/store.cjs`: 네트워크 없는 데이터 계층·시계·스트림·충돌·복원 테스트
- `node tests/browser.cjs`: 실제 앱 모듈 + 모의 Firebase HTTP 응답으로 브라우저 기능 검사
- `node tests/live_read.cjs`: 실제 Firebase 공유 경로 읽기만 확인, 계정/쓰기 없음. HTTP 401이면 종료 코드 2와 BLOCKED 보고서 생성
- 서버 공유 규칙 게시 후에만 `HARU_LIVE_TEST=1 node tests/live_browser.cjs`: 자기 임시 항목만 생성·정리하는 실제 CRUD 테스트

`VERIFICATION.md`에 이번 버전의 직접 실행 결과를 기록했습니다. 과거 로그인 버전의 테스트는 새 앱의 성공 증거로 사용하지 않습니다.

공개 공유 목록에는 다른 방문자도 항목을 수정·삭제할 수 있습니다. 공개 데이터를 위한 앱이며 민감한 개인 정보를 넣지 마세요. 모든 보안 문제의 부재를 보장하지 않습니다.

REST 구현 근거: [Firebase REST 문서](https://firebase.google.com/docs/reference/rest/database), [조건부 쓰기](https://firebase.google.com/docs/database/rest/save-data).
