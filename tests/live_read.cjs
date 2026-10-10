// Read-only real-server check: no login, credentials, account creation or writes.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.HARU_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
  const name = req.url === '/' ? 'index.html' : req.url.slice(1);
  if (!['index.html','app.js','config.js','store.js'].includes(name)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type',name.endsWith('.html')?'text/html':'text/javascript');
  res.end(fs.readFileSync(path.join(root,'public',name)));
});
(async()=>{
 let browser;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext(); const page=await context.newPage();
  const requests=[];
  page.on('request',r=>{if(r.url().includes('firebaseio.com')){requests.push({method:r.method(),url:r.url(),hasCredential:Boolean(r.headers().authorization||r.headers().cookie)});if(r.method()!=='GET')throw Error('Read-only check unexpectedly attempted a write');}});
  const responsePromise=page.waitForResponse(r=>r.url().includes('/sharedTodos.json'),{timeout:20000});
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const response=await responsePromise;
  await page.waitForFunction(()=>document.querySelector('#status').classList.contains('ready')||document.querySelector('#status').classList.contains('error'),null,{timeout:20000});
  const report={time:new Date().toISOString(),httpStatus:response.status(),requests,uiStatus:await page.locator('#status').textContent(),addDisabled:await page.locator('#add-btn').isDisabled(),writesPerformed:0,accountsCreated:0,adminAccess:false,actualCrud:'NOT RUN'};
  fs.mkdirSync(path.join(root,'verification'),{recursive:true});
  fs.writeFileSync(path.join(root,'verification/live-read.json'),JSON.stringify(report,null,2)+'\n');
  if(process.env.HARU_LIVE_SCREENSHOT)await page.screenshot({path:process.env.HARU_LIVE_SCREENSHOT,fullPage:true});
  console.log(JSON.stringify(report,null,2));
  if(!requests.every(r=>r.method==='GET'&&!r.hasCredential))throw Error('Unexpected credentials or writes');
  if(response.status()!==200){console.log('BLOCKED: Firebase server rules reject account-free access; no write attempted.');process.exitCode=2;}
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
