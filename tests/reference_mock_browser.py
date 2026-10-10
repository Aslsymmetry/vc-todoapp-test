from pathlib import Path
import re, json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'public/index.html').read_text(encoding='utf-8')
js=(root/'public/app.js').read_text(encoding='utf-8')
js=re.sub(r'^import .*?;\s*$', '', js, flags=re.M)
assert 'import ' not in js[:100]
mock='''
var __callbacks=[], __memory={}, __next=0, __deny=false, __connection=true, __listeners=[];
function initializeApp(config){return {config}}
function getAuth(){return {}}
function onAuthStateChanged(auth,cb){__callbacks.push(cb); Promise.resolve().then(()=>cb(null))}
async function createUserWithEmailAndPassword(auth,email,password){let user={uid:'u123',email};for(let cb of __callbacks)cb(user);return {user}}
async function signInWithEmailAndPassword(auth,email,password){return createUserWithEmailAndPassword(auth,email,password)}
async function signOut(){for(let cb of __callbacks)cb(null)}
function getDatabase(){return {}}
function ref(db,path){return {path,key:path.split('/').at(-1)}}
function push(r){let key='id'+(++__next);return {path:r.path+'/'+key,key}}
function pathRead(path){if(path==='.info/connected')return __connection;let v=__memory;for(let key of path.split('/'))v=v?.[key];return v??null}
function snapshot(v){return {exists:()=>v!==null&&v!==undefined,val:()=>v??null}}
function fire(){for(let {r,cb} of __listeners)cb(snapshot(pathRead(r.path)))}
function onValue(r,cb,err){let o={r,cb,err};__listeners.push(o);Promise.resolve().then(()=>cb(snapshot(pathRead(r.path))));return ()=>{__listeners=__listeners.filter(x=>x!==o)}}
async function get(r){return snapshot(pathRead(r.path))}
function write(r,value){if(__deny){let e=Error('permission_denied');e.code='PERMISSION_DENIED';throw e}
let parts=r.path.split('/'),v=__memory;for(let p of parts.slice(0,-1)){v[p]??={};v=v[p]}
if(value===null)delete v[parts.at(-1)];else v[parts.at(-1)]=structuredClone(value);fire()}
async function set(r,v){write(r,v)}
async function remove(r){write(r,null)}
async function runTransaction(r,fn){let val=fn(pathRead(r.path));if(val===undefined)return {committed:false};write(r,val);return {committed:true,snapshot:snapshot(val)}}
'''
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None, args=['--no-sandbox'])
  page=browser.new_page()
  page_errors=[]
  page.on('pageerror', lambda err: page_errors.append(str(err)))
  page.set_content(html)
  page.add_script_tag(content=mock+'\n'+js)
  page.wait_for_function('document.querySelector("#auth-title") !== null')
  page.locator('#auth-toggle').click()
  page.locator('#auth-email').fill('test@example.com')
  page.locator('#auth-password').fill('testing123')
  page.locator('#auth-submit').click()
  page.wait_for_function('!document.querySelector("#add-btn").disabled')
  page.locator('#add-btn').click()
  page.locator('#task-title').fill('Firebase 실제 저장 경로 확인')
  page.locator('#task-description').fill('진단 메모')
  page.locator('#save-btn').click()
  page.wait_for_function('document.querySelector("#total-count").textContent === "1"')
  assert page.evaluate("__memory.todos.u123.id1.title")=='Firebase 실제 저장 경로 확인'
  page.locator('button[data-action=edit]').click()
  page.locator('#task-title').fill('수정된 할 일')
  page.locator('#save-btn').click()
  page.wait_for_function('document.querySelector(".task-title").textContent === "수정된 할 일"')
  page.locator('input[data-action=toggle]').check()
  page.wait_for_function('document.querySelector("#done-count").textContent==="1"')
  page.locator('#diagnostics summary').click()
  page.locator('#read-test-btn').click()
  page.wait_for_function('document.querySelector("#diagnostic-result").textContent.includes("읽기 확인 성공")')
  page.once('dialog',lambda dialog:dialog.accept())
  page.locator('#write-test-btn').click()
  page.wait_for_function('document.querySelector("#diagnostic-result").textContent.includes("확인 완료")')
  assert len(page.evaluate('Object.keys(__memory.todos.u123)'))==1
  page.once('dialog',lambda dialog:dialog.accept())
  page.locator('button[data-action=delete]').click()
  page.wait_for_function('document.querySelector("#total-count").textContent === "0"')
  page.locator('#add-btn').click()
  page.locator('#task-title').fill('권한 오류 테스트')
  page.evaluate('__deny=true')
  page.locator('#save-btn').click()
  page.wait_for_function('document.querySelector("#diagnostic-result").textContent.includes("PERMISSION_DENIED")')
  assert page.locator('#task-dialog').evaluate('(d)=>d.open')
  assert not page_errors,page_errors
  print('PASS offline browser DOM + mock Firebase: signup/login, CRUD, read-back, diagnostics, permission failure')
  browser.close()
