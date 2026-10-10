# 검증 결과 — 2026-10-09 (America/Los_Angeles)

## 최종 결과
Firebase 프로젝트 `todo-backend-8ac43`의 실제 인증·DB CRUD·영속성·동기화·계정 격리 검증 PASS.
세부 실행 결과: `verification/live-results.json`. 토큰과 비밀번호는 포함하지 않음.

## 서버 설정
- Firebase 콘솔에서 Authentication 초기화, 이메일/비밀번호 제공자 활성화 후 `사용 설정됨` 확인.
- 기존 DB 루트는 `null`; 게시된 규칙은 2026-11-09까지 모든 사용자에게 읽기/쓰기를 허용하는 테스트 모드였음.
- 기존 규칙 백업 후 `database.rules.json`의 UID 소유자 제한 및 데이터 검증 규칙 게시 완료.
- 게시 전 Rules Playground에서 미로그인 읽기 거부/소유자 읽기 허용 확인.
- 다른 DB 경로나 기존 사용자 데이터는 없었음. 테스트 계정과 테스트 경로만 생성·정리.

## 실제 서버 검사 — 모두 PASS
- 실제 Firebase 13.0.0 CDN HTTP 200 및 브라우저 SDK 로딩
- 회원가입/로그인, 두 독립 브라우저에서 같은 계정 로그인
- 추가/수정/완료: 브라우저 UI와 인증된 독립 REST 응답의 필드 대조
- 브라우저 간 추가/수정 실시간 반영
- 로그아웃/재로그인/페이지 새로고침 후 같은 항목 유지
- 미로그인 및 다른 UID의 데이터 읽기/쓰기 모두 HTTP 401
- 소유자가 잘못된 스키마(빈 제목)를 쓰면 HTTP 401
- 실제 읽기 진단, 임시 항목 쓰기/조회/삭제 진단
- 오프라인 저장 버튼 비활성화 및 재접속
- 삭제: 서버 승인 완료 후 독립 REST 값 `null`, 두 번째 브라우저 목록에서 제거 확인
- 테스트 경로 삭제 및 테스트 계정 삭제 HTTP 200

마지막 실서버 테스트 경로: `todos/zoYPxt9htMPCVu0a45pRxcFbMBi1/-P3YRHOxlAOv1vJS3Gcz`.
확인한 값: title `밥 또먹기`, description `HARU E2E temporary`, priority `high`, due `2026-10-20`, done `true`. 검증 후 삭제됨.

## 앱 수정과 회귀 검사
- `auth/configuration-not-found`에 Authentication 초기화 방법을 안내.
- Firebase 모듈 준비 전 로그인 기본 폼 제출을 차단하고 준비 완료 후 활성화.
- 회원가입 후 로그아웃하면 로그인 모드로 전환하고 비밀번호 입력을 비움.
- 각 회귀 테스트 수정 전 FAIL, 수정 후 PASS.
- 모의 브라우저 CRUD/메모/기한/중요도/검색/필터/진행률/권한 오류/오프라인 검사 PASS.
- Python 정적 검사, JavaScript 및 Python 구문 검사 PASS.
- 로컬 HTTP index.html/app.js/없는 경로: 200/200/404.

## 검증 범위
실제 Firebase를 검증했으며 RTDB emulator 별도 실행과 원본 Python Playwright 참조 테스트는 미실행. Node Playwright 모의 브라우저 및 실서버 테스트 사용.
Vercel 배포는 사용자 범위에 따라 미수행. 별도 사용자 Firebase 조치 없음.

## 재실행
Python 서버 실행 후 Playwright를 설치한 Node 환경에서:
- `node tests/browser.cjs` — 모의 브라우저 기능 및 회귀 검사
- `HARU_LIVE_TEST=1 node tests/live_browser.cjs` — 임시 계정/데이터만 사용하는 실제 Firebase 검사
