// Explicit live test: creates temporary accounts and only deletes its own data/accounts.
// npm install --no-save playwright; HARU_LIVE_TEST=1 node tests/live_browser.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.HARU_PLAYWRIGHT_MODULE || 'playwright');
const BASE='https://todo-backend-8ac43-default-rtdb.firebaseio.com';
const KEY='AIzaSyC-hSK4pFaXJUXx1pW-gNBM5rbN95R3pg8';
if(process.env.HARU_LIVE_TEST!=='1')throw Error('Set HARU_LIVE_TEST=1 to authorize temporary test data');
const results=[];const identities=[];
function record(test,status,detail=''){results.push({test,status,detail});console.log(status,test,detail)}
async function identity(page){return page.evaluate(async()=>{const {getAuth}=await import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js');const u=getAuth().currentUser;return {uid:u.uid,token:await u.getIdToken()}})}
async function rest(path,token,method='GET',body){const r=await fetch(`${BASE}/${path}.json${token?'?auth='+encodeURIComponent(token):''}`,{method,body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,value:await r.json()}}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const c1=await browser.newContext(), c2=await browser.newContext(), c3=await browser.newContext();
 const p=await c1.newPage(), q=await c2.newPage(), other=await c3.newPage();
 const email=`haru-e2e-${Date.now()}@example.com`,password=require('node:crypto').randomBytes(20).toString('hex');
 async function login(page,signup,emailValue=email){await page.goto('http://127.0.0.1:3000/index.html');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('로그인하면'));if(signup)await page.locator('#auth-toggle').click();await page.locator('#auth-email').fill(emailValue);await page.locator('#auth-password').fill(password);await page.locator('#auth-submit').click();await page.waitForFunction(()=>!document.querySelector('#auth-overlay').hidden || !document.querySelector('#add-btn').disabled);try{await page.waitForFunction(()=>!document.querySelector('#add-btn').disabled,{},{timeout:20000})}catch(e){throw Error(await page.locator('#auth-error').textContent() || e.message)}}
 await login(p,true);const a=await identity(p);identities.push(a);record('real Firebase signup/initial read','PASS',`todos/${a.uid}`);
 await login(q,false);record('second independent browser login','PASS');
 await p.locator('#add-btn').click();await p.locator('#task-title').fill('밥먹기');await p.locator('#task-description').fill('HARU E2E temporary');await p.locator('#task-priority').selectOption('high');await p.locator('#task-due').fill('2026-10-20');await p.locator('#save-btn').click();await p.waitForFunction(()=>!document.querySelector('#task-dialog').open);
 let remote=await rest(`todos/${a.uid}`,a.token);assert.equal(remote.status,200);const id=Object.keys(remote.value)[0];assert.equal(remote.value[id].title,'밥먹기');assert.equal(remote.value[id].priority,'high');record('create + independent REST read','PASS',`todos/${a.uid}/${id}`);
 await q.waitForFunction(()=>document.querySelector('.task-title')?.textContent==='밥먹기');record('two browser realtime create sync','PASS');
 await p.locator('[data-action=edit]').click();await p.locator('#task-title').fill('밥 또먹기');await p.locator('#save-btn').click();await p.waitForFunction(()=>!document.querySelector('#task-dialog').open);assert.equal((await rest(`todos/${a.uid}/${id}`,a.token)).value.title,'밥 또먹기');await q.waitForFunction(()=>document.querySelector('.task-title')?.textContent==='밥 또먹기');record('edit + REST + realtime sync','PASS');
 await p.locator('[data-action=toggle]').check();await p.waitForFunction(()=>document.querySelector('#done-count').textContent==='1');assert.equal((await rest(`todos/${a.uid}/${id}`,a.token)).value.done,true);record('complete + REST','PASS');
 await p.locator('[data-filter=active]').click();assert.equal(await p.locator('.task').count(),0);await p.locator('[data-filter=done]').click();assert.equal(await p.locator('.task').count(),1);await p.locator('#search').fill('없는 항목');assert.equal(await p.locator('.task').count(),0);await p.locator('#search').fill('밥');assert.equal(await p.locator('.task').count(),1);record('filters/search/progress/metadata','PASS');
 await p.locator('#logout-btn').click();await login(p,false);assert.equal(await p.locator('.task-title').textContent(),'밥 또먹기');await p.reload();await p.waitForFunction(()=>!document.querySelector('#add-btn').disabled);assert.equal(await p.locator('.task-title').textContent(),'밥 또먹기');record('logout/login/reload persistence','PASS');
 await login(other,true,`haru-e2e-other-${Date.now()}@example.com`);const b=await identity(other);identities.push(b);
 for(const [name,token] of [['anonymous',null],['other account',b.token]]){const read=await rest(`todos/${a.uid}/${id}`,token);record(`${name} read isolation`,read.status===401||read.status===403?'PASS':'FAIL',`HTTP ${read.status}`);const w=await rest(`todos/${a.uid}/isolation_probe`,token,'PUT',{title:'test only'});record(`${name} write isolation`,w.status===401||w.status===403?'PASS':'FAIL',`HTTP ${w.status}`);if(w.status===200)await rest(`todos/${a.uid}/isolation_probe`,a.token,'DELETE')}
 await c1.setOffline(true);await p.waitForFunction(()=>document.querySelector('#add-btn').disabled);record('offline writes disabled','PASS');await c1.setOffline(false);await p.waitForFunction(()=>!document.querySelector('#add-btn').disabled);
 p.once('dialog',d=>d.accept());await p.locator('[data-action=delete]').click();await p.waitForFunction(()=>document.querySelector('#total-count').textContent==='0');assert.equal((await rest(`todos/${a.uid}/${id}`,a.token)).value,null);await q.waitForFunction(()=>document.querySelector('#total-count').textContent==='0');record('delete + independent REST + sync','PASS');
 await p.screenshot({path:process.env.HARU_SCREENSHOT||'tests/live-screen.png',fullPage:true});
 }catch(e){record('live test execution','FAIL',String(e.message));process.exitCode=1}
 finally{for(const a of identities){const clean=await rest(`todos/${a.uid}`,a.token,'DELETE');record('temporary test data cleanup',clean.status===200?'PASS':'FAIL',a.uid);const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:a.token})});record('temporary account cleanup',r.ok?'PASS':'FAIL',`HTTP ${r.status}`)}await browser.close();fs.writeFileSync(process.env.HARU_REPORT||'tests/live-results.json',JSON.stringify({time:new Date().toISOString(),results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1}
})();
