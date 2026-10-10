import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { getDatabase, ref, push, set, remove, onValue, runTransaction, get } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC-hSK4pFaXJUXx1pW-gNBM5rbN95R3pg8',
  authDomain: 'todo-backend-8ac43.firebaseapp.com',
  projectId: 'todo-backend-8ac43',
  databaseURL: 'https://todo-backend-8ac43-default-rtdb.firebaseio.com/',
  storageBucket: 'todo-backend-8ac43.firebasestorage.app',
  messagingSenderId: '922372533680',
  appId: '1:922372533680:web:f363064bb1c8e08dff3a75'
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = (id) => document.getElementById(id);
const list = $('task-list');
const dialog = $('task-dialog');
const form = $('task-form');
const titleInput = $('task-title');
const status = $('status');
let tasks = [];
let user = null;
let tasksRef = null;
let stopTasks = null;
let stopConnection = null;
let filter = 'all';
let keyword = '';
let editingId = null;
let lastFocus = null;
let busy = false;
let loaded = false;
let connected = false;
let signingUp = false;
let toastTimer;
let authGeneration = 0;

const ICON_EDIT = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg>';
const ICON_DELETE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>';
const ICON_EMPTY = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>';

function notify(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}
function describeError(error) {
  const map = {
    'auth/invalid-credential': '이메일이나 비밀번호가 올바르지 않아요.',
    'auth/wrong-password': '비밀번호가 올바르지 않아요.',
    'auth/user-not-found': '등록된 계정이 없어요.',
    'auth/email-already-in-use': '이미 가입된 이메일이에요.',
    'auth/weak-password': '비밀번호는 6자 이상으로 입력해 주세요.',
    'auth/invalid-email': '이메일 주소 형식을 확인해 주세요.',
    'auth/operation-not-allowed': 'Firebase 콘솔에서 이메일/비밀번호 로그인 방식을 먼저 사용 설정해 주세요.',
    'auth/unauthorized-domain': 'Firebase Authentication의 허용 도메인 설정을 확인해 주세요.',
    'auth/configuration-not-found': 'Firebase 콘솔 → Authentication에서 ‘시작하기’를 누른 뒤 이메일/비밀번호 로그인을 활성화해 주세요.',
    'auth/invalid-api-key': 'Firebase 웹 앱 API 키 설정이 유효하지 않아요.',
    'auth/too-many-requests': '요청이 많아 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
    'PERMISSION_DENIED': 'Firebase Realtime Database 보안 규칙을 확인해 주세요.',
    'permission_denied': 'Firebase Realtime Database 보안 규칙을 확인해 주세요.'
  };
  const code = error?.code || '';
  if (map[code]) return map[code];
  if (/permission.denied/i.test(`${code} ${error?.message || ''}`)) return map.PERMISSION_DENIED;
  if (error?.message === '이미 삭제된 할 일이에요.' || /후 Firebase 데이터 재조회/.test(error?.message || '')) return error.message;
  return 'Firebase 요청에 실패했어요. 인터넷 연결과 Firebase 설정을 확인해 주세요.';
}
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDue(iso) {
  if (iso === todayISO()) return '오늘까지';
  const [y,m,d] = iso.split('-').map(Number);
  return `${y}.${String(m).padStart(2,'0')}.${String(d).padStart(2,'0')}`;
}
function normalizeTask(id, raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string') return null;
  return {
    id,
    title: raw.title.slice(0, 120),
    description: String(raw.description || '').slice(0, 1000),
    priority: ['high','medium','low'].includes(raw.priority) ? raw.priority : 'medium',
    due: typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? raw.due : '',
    done: raw.done === true,
    createdAt: Number(raw.createdAt) || 0
  };
}
function readLegacy() {
  try {
    const records = JSON.parse(localStorage.getItem('haru_tasks_v1') || '[]');
    return Array.isArray(records) ? records
      .filter(t => t && typeof t.id === 'string' && typeof t.title === 'string' && t.title.trim())
      .map(t => normalizeTask(t.id, t)).filter(Boolean) : [];
  } catch (_) { return []; }
}
function updateControls() {
  const enabled = Boolean(user && loaded && connected && !busy);
  $('add-btn').disabled = !enabled;
  $('save-btn').disabled = !enabled;
  const legacy = readLegacy();
  $('import-btn').hidden = !user || !loaded || !legacy.length;
  $('import-btn').disabled = !enabled;
  $('read-test-btn').disabled = !Boolean(user && connected && !busy);
  $('write-test-btn').disabled = !enabled;
  $('import-btn').textContent = `이전 할 일 ${legacy.length}개 가져오기`;
  for (const el of list.querySelectorAll('.check, .task-actions button')) el.disabled = !enabled;
}
function render() {
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const percent = total ? Math.round(done / total * 100) : 0;
  $('total-count').textContent = String(total);
  $('active-count').textContent = String(total - done);
  $('done-count').textContent = String(done);
  $('percent').textContent = `${percent}%`;
  $('progress-fill').style.width = `${percent}%`;
  $('progress-track').setAttribute('aria-valuenow', String(percent));
  document.querySelectorAll('[data-filter]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter)));
  const filtered = tasks.filter(t => (filter === 'all' || (filter === 'active' ? !t.done : t.done)) &&
    `${t.title} ${t.description}`.toLocaleLowerCase().includes(keyword));
  filtered.sort((a,b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
  $('list-count').textContent = String(filtered.length);
  list.replaceChildren();
  if (!filtered.length) {
    const empty = node('div', 'empty');
    const symbol = node('div', 'empty-icon'); symbol.innerHTML = ICON_EMPTY;
    const heading = node('h3', '', !loaded ? 'Firebase에서 할 일을 불러오는 중이에요' : tasks.length ? '검색 조건에 맞는 할 일이 없어요' : '아직 등록된 할 일이 없어요');
    const detail = node('p', '', !loaded ? '잠시만 기다려 주세요.' : tasks.length ? '검색어 또는 상태 필터를 바꿔보세요.' : '오른쪽 위의 ‘할 일 추가’를 눌러 시작해 보세요.');
    empty.append(symbol, heading, detail); list.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    for (const task of filtered) {
      const row = node('article', `task${task.done ? ' completed' : ''}`);
      const check = node('input', 'check'); check.type = 'checkbox'; check.checked = task.done;
      check.setAttribute('aria-label', `${task.title} ${task.done ? '완료 취소' : '완료하기'}`);
      check.dataset.id = task.id; check.dataset.action = 'toggle';
      const main = node('div', 'task-main');
      main.append(node('div', 'task-title', task.title));
      if (task.description) main.append(node('div', 'task-desc', task.description));
      const meta = node('div', 'task-meta');
      meta.append(node('span', `pill ${task.priority}`, {high:'높음',medium:'보통',low:'낮음'}[task.priority]));
      if (task.due) {
        const overdue = !task.done && task.due < todayISO();
        meta.append(node('span', `due${overdue ? ' overdue' : ''}`, `${overdue ? '기한 지남 · ' : '마감 · '}${formatDue(task.due)}`));
      }
      main.append(meta);
      const actions = node('div', 'task-actions');
      const edit = node('button', 'icon-btn'); edit.type = 'button'; edit.dataset.action = 'edit'; edit.dataset.id = task.id;
      edit.setAttribute('aria-label', `${task.title} 수정`); edit.title = '수정'; edit.innerHTML = ICON_EDIT;
      const del = node('button', 'icon-btn delete'); del.type = 'button'; del.dataset.action = 'delete'; del.dataset.id = task.id;
      del.setAttribute('aria-label', `${task.title} 삭제`); del.title = '삭제'; del.innerHTML = ICON_DELETE;
      actions.append(edit, del); row.append(check, main, actions); fragment.append(row);
    }
    list.append(fragment);
  }
  updateControls();
}
function dataPath(id = '') { return `todos/${user.uid}${id ? '/' + id : ''}`; }
function diagnosticResult(message, failed = false) {
  const target = $('diagnostic-result');
  target.textContent = message;
  target.classList.toggle('error', failed);
}
function diagnosticsContext() {
  return `프로젝트: ${firebaseConfig.projectId}\nDB: ${firebaseConfig.databaseURL}\n경로: ${user ? dataPath() : '(로그인 전)'}\n연결: ${connected}\n데이터 수신: ${loaded}`;
}
function detailedError(error) {
  const code = String(error?.code || '코드 미확인');
  return `${describeError(error)} [${code}]`;
}
// Firebase SDK의 get()은 서버 조회를 우선하지만 연결 상황에 따라 캐시 결과를 쓸 수 있습니다.
// 따라서 이 검사는 SDK 재조회 검증이며 외부 서버의 독립적인 확증이라고 주장하지 않습니다.
async function verifiedSnapshot(target, check, label) {
  const snapshot = await get(target);
  if (!check(snapshot)) {
    throw new Error(`${label} 후 Firebase 데이터 재조회 결과가 예상과 달라요. 다시 누르기 전에 DB 콘솔에서 해당 항목을 확인해 주세요.`);
  }
  return snapshot;
}
function openDialog(task = null) {
  if (!loaded || !connected || busy) { notify('Firebase 연결 상태를 확인해 주세요.'); return; }
  editingId = task ? task.id : null;
  lastFocus = document.activeElement;
  form.reset();
  $('dialog-heading').textContent = task ? '할 일 수정' : '새 할 일 추가';
  $('save-btn').textContent = task ? '변경 사항 저장' : '할 일 저장';
  if (task) {
    titleInput.value = task.title;
    $('task-description').value = task.description;
    $('task-priority').value = task.priority;
    $('task-due').value = task.due;
  }
  dialog.showModal();
  titleInput.focus();
}
function closeDialog() { dialog.close(); }
async function performWrite(operation, success) {
  if (!user || !loaded || !connected || busy) { notify('Firebase 연결을 확인한 뒤 다시 시도해 주세요.'); return false; }
  busy = true;
  updateControls();
  try {
    await operation();
    notify(typeof success === 'function' ? success() : success);
    return true;
  } catch (error) {
    console.error('Firebase 저장 실패:', error);
    notify(detailedError(error));
    diagnosticResult(`저장 실패\n${diagnosticsContext()}\n원인: ${detailedError(error)}`, true);
    return false;
  } finally {
    busy = false;
    updateControls();
  }
}

// 같은 계정의 각 브라우저는 동일한 /todos/<uid> 목록을 실시간으로 구독합니다.
function startWatching(firebaseUser) {
  const gen = ++authGeneration;
  if (stopTasks) { stopTasks(); stopTasks = null; }
  if (stopConnection) { stopConnection(); stopConnection = null; }
  tasks = [];
  loaded = false;
  connected = false;
  user = firebaseUser;
  $('diagnostic-path').textContent = user ? dataPath() : '로그인 전';
  diagnosticResult(user ? `계정 ${user.email || user.uid} 로그인됨. 데이터 경로: ${dataPath()}\n현재 연결·권한 확인 중` : '로그인한 다음 읽기/쓰기 테스트를 수행할 수 있어요.');
  if (!user) {
    signingUp = false;
    $('auth-title').textContent = 'Firebase 계정 로그인';
    $('auth-submit').textContent = '로그인';
    $('auth-switch-text').textContent = '계정이 없나요?';
    $('auth-toggle').textContent = '회원가입';
    $('auth-password').autocomplete = 'current-password';
    $('auth-password').value = '';
    $('account').classList.remove('visible');
    $('auth-overlay').hidden = false;
    $('auth-error').textContent = '';
    setStatus('로그인하면 Firebase에 저장된 할 일을 불러옵니다.');
    render();
    return;
  }
  $('auth-overlay').hidden = true;
  $('account').classList.add('visible');
  $('account-email').textContent = user.email || '사용자';
  setStatus('Firebase 데이터를 불러오는 중이에요…');
  tasksRef = ref(db, dataPath());
  stopConnection = onValue(ref(db, '.info/connected'), snap => {
    if (gen !== authGeneration) return;
    connected = snap.val() === true;
    if (!connected) setStatus('Firebase 연결이 끊겼어요. 연결되면 다시 저장할 수 있어요.', 'warning');
    else if (loaded) setStatus('Firebase 실시간 동기화 연결됨', 'ready');
    updateControls();
  }, err => { if (gen === authGeneration) setStatus(describeError(err), 'error'); });
  stopTasks = onValue(tasksRef, snap => {
    if (gen !== authGeneration) return;
    const records = snap.val();
    tasks = records && typeof records === 'object' ? Object.entries(records).map(([key,val]) => normalizeTask(key,val)).filter(Boolean) : [];
    loaded = true;
    setStatus(connected ? 'Firebase 실시간 동기화 연결됨' : 'Firebase 데이터를 불러왔어요. 연결 상태를 확인 중이에요.', connected ? 'ready' : 'warning');
    render();
  }, err => {
    if (gen !== authGeneration) return;
    loaded = false;
    tasks = [];
    setStatus(detailedError(err), 'error');
    diagnosticResult(`데이터 구독 실패: ${detailedError(err)}\n${diagnosticsContext()}`, true);
    render();
  });
  render();
}
$('today-label').textContent = new Intl.DateTimeFormat('ko-KR', {year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
$('add-btn').addEventListener('click', () => openDialog());
$('dialog-close').addEventListener('click', closeDialog);
$('cancel-btn').addEventListener('click', closeDialog);
dialog.addEventListener('click', e => { if (e.target === dialog && !busy) closeDialog(); });
dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
dialog.addEventListener('close', () => { if (lastFocus && lastFocus.isConnected) lastFocus.focus(); });
titleInput.addEventListener('input', () => titleInput.setCustomValidity(''));
form.addEventListener('submit', async e => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) { titleInput.setCustomValidity('할 일 제목을 입력해 주세요.'); titleInput.reportValidity(); return; }
  titleInput.setCustomValidity('');
  const values = {
    title, description: $('task-description').value.trim(),
    priority: $('task-priority').value, due: $('task-due').value
  };
  const id = editingId;
  const ok = await performWrite(async () => {
    if (id) {
      const stamp = Date.now();
      const result = await runTransaction(ref(db, dataPath(id)), current => {
        if (!current || typeof current.title !== 'string') return;
        return {...current, ...values, updatedAt: stamp};
      }, {applyLocally:false});
      if (!result.committed) throw new Error('이미 삭제된 할 일이에요.');
      await verifiedSnapshot(ref(db, dataPath(id)), snap => snap.exists() && snap.val()?.title === values.title && snap.val()?.description === values.description && snap.val()?.due === values.due && snap.val()?.priority === values.priority, '수정');
    } else {
      const newRef = push(tasksRef);
      const stamp = Date.now();
      await set(newRef, {...values, done:false, createdAt:stamp, updatedAt:stamp});
      await verifiedSnapshot(newRef, snap => snap.exists() && snap.val()?.title === values.title, '추가');
    }
  }, id ? '할 일을 수정했어요.' : 'Firebase에 할 일을 추가했어요.');
  if (ok) closeDialog();
});
list.addEventListener('change', async e => {
  const target = e.target.closest('input[data-action="toggle"]');
  if (!target) return;
  const id = target.dataset.id;
  const desired = target.checked;
  target.checked = !desired;
  await performWrite(async () => {
    const stamp = Date.now();
    const result = await runTransaction(ref(db, dataPath(id)), current => {
      if (!current || typeof current.title !== 'string') return;
      return {...current, done: desired, updatedAt:stamp};
    }, {applyLocally:false});
    if (!result.committed) throw new Error('이미 삭제된 할 일이에요.');
    await verifiedSnapshot(ref(db, dataPath(id)), snap => snap.exists() && snap.val()?.done === desired, '완료 상태 수정');
  }, desired ? '할 일을 완료했어요! 🎉' : '진행 중으로 변경했어요.');
});
list.addEventListener('click', async e => {
  const target = e.target.closest('button[data-action]');
  if (!target) return;
  const task = tasks.find(t => t.id === target.dataset.id);
  if (!task) { notify('해당 할 일을 찾을 수 없어요.'); return; }
  if (target.dataset.action === 'edit') { openDialog(task); return; }
  if (target.dataset.action === 'delete') {
    if (!window.confirm(`“${task.title}” 할 일을 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return;
    await performWrite(async () => {
      const targetRef = ref(db, dataPath(task.id));
      await remove(targetRef);
      await verifiedSnapshot(targetRef, snap => !snap.exists(), '삭제');
    }, 'Firebase에서 할 일을 삭제했어요.');
  }
});
document.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => { filter = btn.dataset.filter; render(); }));
$('search').addEventListener('input', e => { keyword = e.target.value.trim().toLocaleLowerCase(); render(); });

$('auth-toggle').addEventListener('click', () => {
  signingUp = !signingUp;
  $('auth-title').textContent = signingUp ? 'Firebase 계정 만들기' : 'Firebase 계정 로그인';
  $('auth-submit').textContent = signingUp ? '회원가입' : '로그인';
  $('auth-switch-text').textContent = signingUp ? '이미 계정이 있나요?' : '계정이 없나요?';
  $('auth-toggle').textContent = signingUp ? '로그인' : '회원가입';
  $('auth-password').autocomplete = signingUp ? 'new-password' : 'current-password';
  $('auth-error').textContent = '';
});
$('auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const submit = $('auth-submit');
  submit.disabled = true;
  $('auth-error').textContent = '';
  try {
    if (signingUp) await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
    $('auth-password').value = '';
  } catch (error) {
    console.error('Firebase 인증 실패:', error);
    $('auth-error').textContent = detailedError(error);
  } finally { submit.disabled = false; }
});
$('logout-btn').addEventListener('click', async () => {
  if (busy) { notify('저장이 완료된 뒤 로그아웃해 주세요.'); return; }
  try { await signOut(auth); } catch (err) { notify(describeError(err)); }
});

// 이전 버전의 localStorage는 읽기만 하며, 명시적 클릭 전에는 Firebase에 업로드하지 않습니다.
// UUID 또는 임의 문자열에서 결정적 Firebase key를 생성하여 재시도 시 중복/덮어쓰기를 방지합니다.
async function legacyKey(id) {
  const bytes = new TextEncoder().encode(id);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `legacy_${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('')}`;
}
$('import-btn').addEventListener('click', async () => {
  const legacy = readLegacy();
  if (!legacy.length) return;
  if (!window.confirm(`이 브라우저에 저장된 이전 할 일 ${legacy.length}개를 현재 Firebase 계정으로 가져올까요?\n기존 브라우저 데이터는 삭제하지 않습니다. 이미 가져온 항목은 다시 덮어쓰지 않습니다.`)) return;
  let imported = 0;
  let already = 0;
  const ok = await performWrite(async () => {
    for (const task of legacy) {
      const id = await legacyKey(task.id);
      const {title, description, priority, due, done, createdAt} = task;
      const stamp = Date.now();
      const result = await runTransaction(ref(db, dataPath(id)), current => {
        if (current !== null) return; // 이미 업로드한 항목은 수정하지 않음
        return {title, description, priority, due, done, createdAt:createdAt || stamp, updatedAt:stamp};
      }, {applyLocally:false});
      if (result.committed) imported++;
      else already++;
    }
  }, () => `Firebase 가져오기 완료: 신규 ${imported}개, 기존 ${already}개`);
  // 성공/부분 실패 모두 localStorage 원본은 그대로 유지합니다.
  if (!ok) notify(`가져오기 중 중단됐어요. 성공 ${imported}개, 기존 ${already}개. 재시도해도 중복 생성되지 않아요.`);
});

// Enable authentication only after its submit handler is installed.
$('auth-form').removeAttribute('onsubmit');
$('auth-submit').disabled = false;
$('auth-toggle').disabled = false;
onAuthStateChanged(auth, firebaseUser => startWatching(firebaseUser), error => {
  setStatus(describeError(error), 'error');
  $('auth-error').textContent = detailedError(error);
});
render();

// 진단은 버튼 클릭 시에만 작동합니다. 테스트 항목은 별도 고유 ID로 만들고 삭제합니다.
$('read-test-btn').addEventListener('click', async () => {
  if (!user || !connected || busy) return;
  $('read-test-btn').disabled = true;
  try {
    const snap = await get(ref(db, dataPath()));
    const count = snap.exists() && typeof snap.val() === 'object' ? Object.keys(snap.val()).length : 0;
    diagnosticResult(`Firebase SDK 읽기 확인 성공 (현재 항목 ${count}개)\n${diagnosticsContext()}\n※ 읽기 성공만으로 쓰기 권한이나 실제 서버 반영이 보장되지는 않습니다.`);
  } catch (error) {
    diagnosticResult(`Firebase 읽기 실패: ${detailedError(error)}\n${diagnosticsContext()}`, true);
  } finally { updateControls(); }
});
$('write-test-btn').addEventListener('click', async () => {
  if (!user || !connected || !loaded || busy) return;
  if (!window.confirm('Firebase에 임시 할 일 1개를 생성한 뒤 실제 재조회하고 삭제합니다. 진행할까요?')) return;
  busy = true;
  updateControls();
  const target = push(tasksRef);
  const stamp = Date.now();
  let wrote = false;
  let removed = false;
  let failure = null;
  try {
    await set(target, { title: '[연결 진단] 임시 할 일', description: '', priority: 'low', due: '', done: false, createdAt:stamp, updatedAt:stamp });
    wrote = true;
    await verifiedSnapshot(target, snap => snap.exists() && snap.val()?.title === '[연결 진단] 임시 할 일', '임시 기록');
    await remove(target);
    removed = true;
    await verifiedSnapshot(target, snap => !snap.exists(), '임시 기록 삭제');
    diagnosticResult(`Firebase SDK 쓰기·재조회·삭제 확인 완료 (콘솔에서 최종 확인 필요)\n${diagnosticsContext()}\n임시 항목: ${target.key} (삭제 확인 완료)`);
  } catch (error) {
    failure = error;
    diagnosticResult(`Firebase 테스트 실패: ${detailedError(error)}\n${diagnosticsContext()}\n임시 항목: ${target.key}\n${wrote && !removed ? '임시 항목이 남아 있을 수 있어요. Firebase 콘솔에서 직접 확인해 주세요.' : '쓰기 권한·연결 상태를 확인해 주세요.'}`, true);
  } finally {
    busy = false;
    updateControls();
  }
  if (failure) console.error('Firebase 진단 실패:', failure);
});
$('copy-diagnostic-btn').addEventListener('click', async () => {
  const summary = `${diagnosticsContext()}\n진단: ${$('diagnostic-result').textContent}`;
  try { await navigator.clipboard.writeText(summary); notify('진단 내용을 복사했어요. (비밀번호/토큰은 포함되지 않음)'); }
  catch { notify('복사에 실패했습니다. 진단 내용을 직접 선택해 복사해 주세요.'); }
});
