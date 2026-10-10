// Runs the real ES modules over HTTP. Only Firebase HTTP responses are mocked.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.HARU_PLAYWRIGHT_MODULE || 'playwright');
const publicDir = path.resolve(__dirname, '../public');
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
  if (!['index.html', 'app.js', 'config.js', 'store.js'].includes(name)) { res.writeHead(404); return res.end(); }
  try { res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : 'text/javascript'); res.end(fs.readFileSync(path.join(publicDir, name))); }
  catch { res.writeHead(404); res.end(); }
});
const backend = { records: {}, version: 0, deny: false, conflict: false, requests: [] };
async function intercept(context, denied = false) {
  await context.addInitScript(() => { window.EventSource = undefined; });
  await context.route('https://todo-backend-8ac43-default-rtdb.firebaseio.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    backend.requests.push({ method, url: request.url(), headers: request.headers() });
    const id = url.pathname.match(/^\/sharedTodos\/([^/]+)\.json$/)?.[1];
    const etag = '"v' + backend.version + '"';
    const respond = (status, value) => route.fulfill({ status, headers: {
      'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'ETag', 'ETag': etag
    }, body: JSON.stringify(value) });
    if (denied || (backend.deny && method !== 'GET')) return respond(401, { error: 'Permission denied' });
    if (method === 'GET') return respond(200, id ? backend.records[id] || null : backend.records);
    if (backend.conflict && method === 'PUT' && id && backend.records[id]) {
      backend.conflict = false; backend.records[id].title = '다른 브라우저의 수정'; backend.version++;
      return respond(412, backend.records[id]);
    }
    const condition = request.headers()['if-match'];
    if (condition && condition !== etag && !(condition === 'null_etag' && !backend.records[id])) return respond(412, backend.records[id] || null);
    if (method === 'PUT' && id) { backend.records[id] = request.postDataJSON(); backend.version++; return respond(200, backend.records[id]); }
    if (method === 'DELETE' && id) { delete backend.records[id]; backend.version++; return respond(200, null); }
    return respond(400, { error: 'Unexpected request' });
  });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const c1 = await browser.newContext(); const c2 = await browser.newContext();
    await intercept(c1); await intercept(c2);
    const p = await c1.newPage(); const q = await c2.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message)); q.on('pageerror', e => errors.push(e.message));
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    for (const page of [p, q]) { await page.goto(url); await page.waitForFunction(() => !document.querySelector('#add-btn').disabled); assert.equal(await page.locator('input[type=password], #auth-form').count(), 0); }
    console.log('PASS actual app modules start without login');
    await p.locator('#add-btn').click(); await p.locator('#task-title').fill('밥먹기');
    const malicious = '<img src=x onerror=window.__xss=1>';
    await p.locator('#task-description').fill(malicious); await p.locator('#task-priority').selectOption('high'); await p.locator('#task-due').fill('2026-10-20'); await p.locator('#save-btn').click();
    await p.waitForFunction(() => !document.querySelector('#task-dialog').open);
    const id = Object.keys(backend.records)[0]; assert.equal(backend.records[id].title, '밥먹기');
    assert.equal(await p.locator('.task-desc').textContent(), malicious); assert.equal(await p.locator('.task-desc img').count(), 0); assert.equal(await p.evaluate(() => window.__xss), undefined);
    assert.equal(await p.locator('.pill.high').textContent(), '높음'); assert.match(await p.locator('.due').textContent(), /2026.10.20/);
    await q.getByText('밥먹기', { exact: true }).waitFor();
    console.log('PASS create, metadata, text safety, two independent browser sync');
    await p.screenshot({ path: process.env.HARU_SCREENSHOT || 'tests/preview.png', fullPage: true });
    await p.locator('[data-action=edit]').click(); await p.locator('#task-title').fill('밥 또먹기'); await p.locator('#save-btn').click(); await p.waitForFunction(() => !document.querySelector('#task-dialog').open);
    assert.equal(backend.records[id].title, '밥 또먹기'); await q.getByText('밥 또먹기', { exact: true }).waitFor();
    await p.locator('[data-action=toggle]').check(); await p.waitForFunction(() => document.querySelector('#done-count').textContent === '1'); assert.equal(await p.locator('#percent').textContent(), '100%');
    await p.locator('[data-filter=active]').click(); assert.equal(await p.locator('.task').count(), 0); await p.locator('[data-filter=done]').click(); assert.equal(await p.locator('.task').count(), 1);
    await p.locator('#search').fill('없는 제목'); assert.equal(await p.locator('.task').count(), 0); await p.locator('#search').fill('밥'); assert.equal(await p.locator('.task').count(), 1);
    await p.reload(); await p.getByText('밥 또먹기', { exact: true }).waitFor(); console.log('PASS edit, completion, search, filters, progress and reload persistence');
    await p.locator('[data-action=edit]').click(); await p.locator('#task-title').fill('덮어쓰기 금지'); backend.conflict = true; await p.locator('#save-btn').click();
    await p.waitForFunction(() => document.querySelector('#form-error').textContent.includes('다른')); assert.equal(backend.records[id].title, '다른 브라우저의 수정'); assert.equal(await p.locator('#task-dialog').evaluate(el => el.open), true); await p.locator('#cancel-btn').click();
    console.log('PASS concurrent edit conflict does not overwrite server data');
    await p.locator('[data-action=edit]').click(); await p.locator('#task-title').fill('오래된 편집 내용'); backend.records[id].title = '편집 창을 연 뒤 다른 사람이 수정'; backend.records[id].updatedAt++; backend.version++; await p.locator('#save-btn').click();
    await p.waitForFunction(() => document.querySelector('#form-error').textContent.includes('다른'), null, {timeout: 3000}); assert.equal(backend.records[id].title, '편집 창을 연 뒤 다른 사람이 수정'); await p.locator('#cancel-btn').click(); console.log('PASS stale open form does not overwrite a later edit');
    await p.locator('[data-action=edit]').click(); await p.locator('#task-title').fill('같은 시각의 오래된 내용'); backend.records[id].description = '동일한 updatedAt으로 서버에서 변경'; backend.version++; await p.locator('#save-btn').click();
    await p.waitForFunction(() => document.querySelector('#form-error').textContent.includes('다른'), null, {timeout: 3000}); assert.equal(backend.records[id].title, '편집 창을 연 뒤 다른 사람이 수정'); await p.locator('#cancel-btn').click(); console.log('PASS same timestamp changes cannot be overwritten by stale form');
    await p.locator('#add-btn').click(); await p.locator('#task-title').fill('실패한 저장'); backend.deny = true; await p.locator('#save-btn').click();
    await p.waitForFunction(() => document.querySelector('#form-error').textContent.includes('권한')); assert.equal(Object.keys(backend.records).length, 1); assert.equal(await p.locator('#task-dialog').evaluate(el => el.open), true); backend.deny = false; await p.locator('#cancel-btn').click();
    console.log('PASS failed writes keep draft and never claim success');
    await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))); backend.records[id].title = '뒤로 가기 복원 후 최신 내용'; backend.version++; await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))); await p.getByText('뒤로 가기 복원 후 최신 내용', {exact:true}).waitFor(); console.log('PASS restored page resumes synchronization');
    await c1.setOffline(true); await p.waitForFunction(() => document.querySelector('#add-btn').disabled); await c1.setOffline(false); await p.locator('#retry-btn').click(); await p.waitForFunction(() => !document.querySelector('#add-btn').disabled); console.log('PASS offline and retry');
    await p.locator('[data-filter=all]').click(); await p.locator('#search').fill(''); p.once('dialog', d => d.accept()); await p.locator('[data-action=delete]').click(); await p.waitForFunction(() => document.querySelector('#total-count').textContent === '0'); assert.equal(Object.keys(backend.records).length, 0); await q.waitForFunction(() => document.querySelector('#total-count').textContent === '0'); console.log('PASS deletion and peer sync');
    const denied = await browser.newContext(); await intercept(denied, true); const r = await denied.newPage(); await r.goto(url); await r.waitForFunction(() => document.querySelector('#status').textContent.includes('권한')); assert.equal(await r.locator('#add-btn').isDisabled(), true); assert.match(await r.locator('.empty h3').textContent(), /접근/); console.log('PASS initial denied read stops loading and gives actionable error');
    assert.deepEqual(errors, []); assert.ok(backend.requests.every(r => !r.headers.authorization && !r.headers.cookie && !new URL(r.url).searchParams.has('auth'))); console.log('PASS no account credentials sent and no page exceptions');

    await p.setViewportSize({ width: 390, height: 844 }); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); console.log('PASS mobile layout has no horizontal overflow');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
