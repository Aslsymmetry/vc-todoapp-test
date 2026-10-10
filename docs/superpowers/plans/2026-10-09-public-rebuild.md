# HARU Public Rebuild Implementation Plan

> Execution: implement in this session with executing-plans; user requests direct completion and no repeated approval steps.

**Goal:** Rebuild the requested login-free shared todo app using the existing Firebase URL and upload the complete source.
**Architecture:** Native browser modules; config.js contains public configuration; store.js owns REST, conditional writes and live refresh; app.js owns the UI.
**Tech Stack:** HTML/CSS/JavaScript, Firebase RTDB REST, Python local static server, Playwright.
**Spec:** ../specs/2026-10-09-public-rebuild.md

## Global Constraints
No Auth/account creation/admin console access; no local database substitution; no Vercel deploy; use existing GitHub main; report actual-server 401 honestly.

## Review Focus
Initial permission denial, failed writes, concurrent deletion/edit, user HTML, offline/reconnect.

### Task 1: Data layer and browser regression tests
- [x] Replace mock injection with actual app served over HTTP and intercepted Firebase REST requests; test CRUD, two browsers, persistence, errors, XSS, conflicts.
- [x] Implement config.js and store.js: GET, conditional PUT/DELETE, watch/retry, no credentials.
- [x] Verify local tests and denied writes do not report success.

### Task 2: UI rewrite and deployable source
- [x] Rewrite app.js with explicit loading/ready/offline/error state, shared CRUD and filters.
- [x] Add retry button and inline form error; adapt local server file allowlist and static checks.
- [x] Verify desktop/mobile layout and app syntax.

### Task 3: Evidence and delivery
- [x] Run anonymous real-server read check without accounts; never claim mocked CRUD as real server success.
- [x] Update README and verification; preserve prior security record as history.
- [x] Commit/push complete source and verify remote SHA.

Execution note: source tasks verified against simulated REST; actual-server read is blocked by 401 and actual CRUD is NOT RUN. Fresh read-only review found revision and restored-page defects; reproduced failures, then fixed with full passing suite. No administrator access performed.
