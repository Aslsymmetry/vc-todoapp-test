// Executes store module with controlled HTTP, clocks and stream events; no network.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const id = 'a'.repeat(20);
const original = {title:'원본',description:'',priority:'medium',due:'',done:false,createdAt:100,updatedAt:100};
let records, version, requests, conflictDelete = false;
Object.defineProperty(globalThis, 'navigator', {value:{onLine:true},configurable:true});
class Stream {
  static instances = [];
  constructor() { this.events = {}; this.closed = false; Stream.instances.push(this); }
  addEventListener(name, fn) { this.events[name] = fn; }
  close() { this.closed = true; }
  emit(name) { this.events[name]?.(); }
}
globalThis.EventSource = Stream;
globalThis.fetch = async (url, options) => {
  requests.push(options);
  const taskId = new URL(url).pathname.split('/')[2]?.replace('.json','');
  if (options.method === 'GET') return new Response(JSON.stringify(taskId ? records[taskId] || null : records), {headers:{ETag:'"'+version+'"'}});
  if (options.method === 'DELETE' && conflictDelete) { records[taskId].title='다른 사람의 변경';version++;return new Response('{}',{status:412}); }
  if (options.headers['if-match'] !== '"'+version+'"') return new Response('{}',{status:412});
  if (options.method === 'PUT') records[taskId]=JSON.parse(options.body);
  if (options.method === 'DELETE') delete records[taskId];
  version++;
  return new Response(JSON.stringify(records[taskId]||null), {headers:{ETag:'"'+version+'"'}});
};
function reset() { records = {[id]:{...original}}; version=1; requests=[]; conflictDelete=false; Stream.instances=[]; }
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/store.js'),'utf8').replace(/^import .*?;$/m,"const firebaseConfig={databaseURL:'https://example.invalid/'};const TODO_PATH='sharedTodos';");
 const {TodoStore}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const tests = [
 ['behind clock still advances revision',async()=>{reset();const store=new TodoStore(()=>{});const realNow=Date.now;Date.now=()=>50;try{await store.update(id,{title:'새 내용',description:'',priority:'medium',due:''});assert.ok(records[id].updatedAt>original.updatedAt);}finally{Date.now=realNow;store.stop();}}],
 ['conditional delete conflict preserves newer task',async()=>{reset();const store=new TodoStore(()=>{});conflictDelete=true;await assert.rejects(store.remove(id),e=>e.code==='CONFLICT');assert.equal(records[id].title,'다른 사람의 변경');store.stop();}],
 ['missing task never resurrected',async()=>{reset();delete records[id];const store=new TodoStore(()=>{});await assert.rejects(store.update(id,{done:true}),e=>e.code==='MISSING');assert.equal(requests.filter(r=>r.method==='PUT').length,0);store.stop();}],
 ['stream put/patch refresh, cancel stops retries, retry reconnects',async()=>{
  reset();const timers=new Map();let counter=0;const realSet=setTimeout,realClear=clearTimeout;
  globalThis.setTimeout=fn=>{const token=++counter;timers.set(token,fn);return token;};globalThis.clearTimeout=token=>timers.delete(token);
  const states=[];const store=new TodoStore(s=>states.push(s));
  try {await store.watch();assert.equal(Stream.instances.length,1);const stream=Stream.instances[0];
   records[id].title='스트림 put';stream.emit('put');await store.refresh();assert.equal(store.records[0].title,'스트림 put');
   records[id].description='스트림 patch';stream.emit('patch');await store.refresh();assert.equal(store.records[0].description,'스트림 patch');
   stream.emit('cancel');assert.equal(store.phase,'error');assert.equal(stream.closed,true);assert.equal(timers.size,0);
   await store.retry();assert.equal(Stream.instances.length,2);Stream.instances[1].onerror();assert.equal(Stream.instances[1].closed,true);
   await store.retry();assert.equal(Stream.instances.length,3);store.stop();assert.equal(Stream.instances[2].closed,true);assert.equal(timers.size,0);
  }finally{store.stop();globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear;}
 }],
 ['restored page resumes a stopped store',async()=>{reset();const store=new TodoStore(()=>{});await store.watch();store.stop();records[id].title='돌아온 화면';try{await store.resume();assert.equal(store.phase,'ready');assert.equal(store.records[0].title,'돌아온 화면');}finally{store.stop();}}]
 ];
 let failed=0;
 for(const [name,test] of tests){try{await test();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
