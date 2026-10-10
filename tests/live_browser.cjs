// Uses no account or authentication. Creates and removes only its own shared test task.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.HARU_PLAYWRIGHT_MODULE || 'playwright');
const base = 'https://todo-backend-8ac43-default-rtdb.firebaseio.com';
if (process.env.HARU_LIVE_TEST !== '1') throw Error('Set HARU_LIVE_TEST=1 for disposable shared test data');
const results = [];
let testId;
function record(test, status, detail = '') {
  results.push({ test, status, detail });
  console.log(status, test, detail);
}
async function rest(path, method = 'GET', body) {
  const response = await fetch(`${base}/${path}.json`, {
    method, signal: AbortSignal.timeout(20000),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, value: await response.json() };
}
(async () => {
  let browser;
  try {
    const access = await rest('sharedTodos');
    assert.equal(access.status, 200, 'sharedTodos rules must be published before this test');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const c1 = await browser.newContext();
    const c2 = await browser.newContext();
    const p = await c1.newPage();
    const q = await c2.newPage();
    for (const page of [p, q]) {
      await page.goto('http://127.0.0.1:3000/index.html');
      await page.waitForFunction(() => !document.querySelector('#add-btn').disabled);
      assert.equal(await page.locator('#auth-overlay, #auth-form').count(), 0);
    }
    record('two browsers start without accounts', 'PASS');
    const title = `[HARU disposable ${Date.now()}]`;
    await p.locator('#add-btn').click();
    await p.locator('#task-title').fill(title);
    await p.locator('#task-description').fill('<img src=x onerror=alert(1)>');
    await p.locator('#task-priority').selectOption('high');
    await p.locator('#task-due').fill('2026-10-20');
    await p.locator('#save-btn').click();
    await p.waitForFunction(() => !document.querySelector('#task-dialog').open);
    const tasks = (await rest('sharedTodos')).value;
    testId = Object.keys(tasks).find(id => tasks[id].title === title);
    assert.ok(testId);
    const path = `sharedTodos/${testId}`;
    record('create and independent REST read', 'PASS', path);
    await q.getByText(title, { exact: true }).waitFor();
    assert.equal(await p.locator('.task-desc img').count(), 0);
    record('realtime sharing and HTML rendered as text', 'PASS');
    await p.locator('#search').fill(title);
    await p.locator('[data-action=edit]').click();
    const edited = title + ' edited';
    await p.locator('#task-title').fill(edited);
    await p.locator('#save-btn').click();
    await p.waitForFunction(() => !document.querySelector('#task-dialog').open);
    assert.equal((await rest(path)).value.title, edited);
    await q.getByText(edited, { exact: true }).waitFor();
    record('edit and realtime sync', 'PASS');
    await p.locator('[data-action=toggle]').click();
    await p.waitForFunction(() => !document.querySelector('#add-btn').disabled);
    assert.equal((await rest(path)).value.done, true);
    await p.locator('[data-filter=active]').click();
    assert.equal(await p.locator('.task').count(), 0);
    await p.locator('[data-filter=done]').click();
    assert.equal(await p.locator('.task').count(), 1);
    record('complete, search and filters', 'PASS');
    await p.reload();
    await p.waitForFunction(() => !document.querySelector('#add-btn').disabled);
    await p.getByText(edited, { exact: true }).waitFor();
    record('reload persistence without accounts', 'PASS');
    const current = (await rest(path)).value;
    for (const [name, invalid] of [
      ['blank title', { ...current, title: '' }],
      ['oversized title', { ...current, title: 'x'.repeat(121) }],
      ['extra field', { ...current, unexpected: 'blocked' }],
      ['changed creation time', { ...current, createdAt: current.createdAt + 1 }],
      ['wrong completion type', { ...current, done: 'true' }]
    ]) {
      const result = await rest(path, 'PUT', invalid);
      assert.ok([401, 403].includes(result.status), name);
      record(`server rejects ${name}`, 'PASS', `HTTP ${result.status}`);
    }
    const root = await fetch(`${base}/.json?shallow=true`, {
      method: 'GET', credentials: 'omit', signal: AbortSignal.timeout(20000)
    });
    // Check permission status without retaining any root data. HEAD is unsupported.
    if (root.body) await root.body.cancel();
    assert.ok([401, 403].includes(root.status));
    record('root access denied', 'PASS', `HTTP ${root.status}`);
    await p.locator('#search').fill(title);
    await c1.setOffline(true);
    await p.waitForFunction(() => document.querySelector('#add-btn').disabled);
    await c1.setOffline(false);
    await p.waitForFunction(() => !document.querySelector('#add-btn').disabled);
    record('offline writes disabled and reconnect', 'PASS');
    p.once('dialog', d => d.accept());
    await p.locator('[data-action=delete]').click();
    await p.waitForFunction(() => !document.querySelector('#add-btn').disabled);
    assert.equal((await rest(path)).value, null);
    await q.getByText(edited, { exact: true }).waitFor({ state: 'detached' });
    record('delete and independent REST + sync', 'PASS');
  } catch (error) {
    record('live shared test', 'FAIL', error.message);
    process.exitCode = 1;
  } finally {
    if (testId) {
      const cleanup = await rest(`sharedTodos/${testId}`, 'DELETE');
      record('only disposable task cleanup', cleanup.status === 200 ? 'PASS' : 'FAIL', testId);
    }
    if (browser) await browser.close();
    fs.writeFileSync(process.env.HARU_REPORT || 'tests/live-results.json',
      JSON.stringify({ time: new Date().toISOString(), results }, null, 2));
  }
})();
