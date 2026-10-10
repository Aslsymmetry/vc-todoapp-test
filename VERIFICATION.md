# 검증 결과 — 2026-10-09 (America/Los_Angeles)

## 완료된 검사
- 내장 소스 ZIP SHA256 확인 및 원본 10개 파일 복원
- Firebase 13.0.0 CDN: 실제 HTTP 200
- HTML/DOM/규칙/정적 호스팅 검사 PASS
- JavaScript 및 Python 구문 검사 PASS
- 로컬 HTTP index.html/app.js/없는 경로: 200/200/404
- 모의 브라우저: CRUD, 중요도/기한/메모, 검색/필터/진행률, 권한 오류 시 실패 안내, 오프라인 저장 차단 PASS
- 실제 브라우저 SDK 로딩 및 로그인 화면 확인
- GitHub CLI 계정 Aslsymmetry 인증 성공, 원격 저장소 빈 상태 확인

## 발견 및 수정
- Authentication 설정 누락 오류를 일반 네트워크 오류로 안내하던 문제: `auth/configuration-not-found` 전용 해결 안내 추가. 회귀 테스트 수정 전 FAIL, 수정 후 PASS.
- SDK 로딩 전 로그인 기본 폼 제출 가능: 초기 로그인/회원가입 버튼 비활성화, 폼 기본 제출 방지. 준비 완료 후 활성화. 회귀 테스트 수정 전 FAIL, 수정 후 PASS.

## 실제 Firebase 차단 원인
실제 인증 API `accounts:createAuthUri` 응답은 HTTP 400 `CONFIGURATION_NOT_FOUND`.
실제 브라우저 회원가입도 `auth/configuration-not-found`로 실패.
실계정 생성이 되지 않아 CRUD/영속성/두 클라이언트 동기화/다른 UID 격리는 NOT RUN.
테스트 계정 및 데이터는 생성되지 않았음.
미로그인 DB 루트 shallow 조회는 HTTP 200 `null`: 읽기 거부가 적용되어 있지 않음을 확인. 전체 게시 규칙이나 쓰기 허용 여부는 아직 확인하지 못함.
컴퓨터 제어 권한이 없어 Firebase 콘솔 접근 불가. 관리자 인증 정보 없음.

## 필요한 Firebase 조치
1. https://console.firebase.google.com/project/todo-backend-8ac43/authentication 에서 Authentication 시작, 이메일/비밀번호 활성화.
2. Realtime Database Rules 현재 내용을 먼저 백업/확인. 다른 기능이 없으면 `database.rules.json`을 검토해 게시. 다른 경로가 있으면 기존 규칙과 병합. 상위 `.read:true`/`.write:true`는 하위 소유자 규칙으로 취소되지 않으므로 제거/수정 필요.
3. 실제 검증 실행: 로컬 서버 실행 후 `HARU_LIVE_TEST=1 node tests/live_browser.cjs`. 테스트는 임시 계정과 자기 경로만 만들고 정리. 오류/토큰/비밀번호를 공개 문서에 포함하지 않음.

소스 업로드 자체로 Firebase 설정은 바뀌지 않음. 위 실서버 검증 전까지 앱 전체 완성으로 판정하지 않음. Vercel 배포 미수행.
