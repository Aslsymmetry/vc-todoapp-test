import { TodoStore, newTaskId } from './store.js';
import { firebaseConfig, TODO_PATH } from './config.js';

const $ = id => document.getElementById(id);
const dialog = $('task-dialog');
const state = { tasks: [], phase: 'loading', error: null, busy: false, filter: 'all', query: '' };
let draftId = null;
let draftCreatedAt = 0;
let editing = false;
let editingSnapshot;
let focusBeforeDialog;
let toastTimer;
const store = new TodoStore(next => { Object.assign(state, next); render(); });
const messages = {
  loading: '공유 할 일을 불러오고 있어요…',
  ready: 'Firebase에 연결됨 · 모두의 공유 목록',
  offline: '연결이 끊겼어요. 다시 연결되면 공유 목록을 불러옵니다.'
};
function element(tag, className = '', text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notify(message) {
  $('toast').textContent = message; $('toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000);
}
function today() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function controls() {
  const disabled = state.phase !== 'ready' || state.busy;
  for (const id of ['add-btn', 'save-btn', 'write-test-btn']) $(id).disabled = disabled;
  $('read-test-btn').disabled = state.busy || state.phase === 'loading';
  $('retry-btn').disabled = state.busy || state.phase === 'loading';
  for (const button of document.querySelectorAll('.task-actions button, .check')) button.disabled = disabled;
  for (const id of ['cancel-btn', 'dialog-close']) $(id).disabled = state.busy;
}
function render() {
  const tasks = state.tasks;
  const completed = tasks.filter(task => task.done).length;
  const percentage = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  $('total-count').textContent = tasks.length;
  $('active-count').textContent = tasks.length - completed;
  $('done-count').textContent = completed;
  $('percent').textContent = `${percentage}%`;
  $('progress-fill').style.width = `${percentage}%`;
  $('progress-track').setAttribute('aria-valuenow', percentage);
  $('status').textContent = state.busy ? '서버에서 저장 결과를 확인하고 있어요…' : state.error?.message || messages[state.phase];
  $('status').className = `status ${state.phase === 'ready' ? 'ready' : state.phase === 'error' ? 'error' : 'warning'}`;
  for (const button of document.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', button.dataset.filter === state.filter);
  const shown = tasks.filter(task => (state.filter === 'all' || (state.filter === 'done' ? task.done : !task.done)) &&
    `${task.title} ${task.description}`.toLocaleLowerCase().includes(state.query))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  $('list-count').textContent = shown.length;
  const fragment = document.createDocumentFragment();
  for (const task of shown) {
    const row = element('article', `task${task.done ? ' completed' : ''}`);
    const check = element('input', 'check'); check.type = 'checkbox'; check.checked = task.done;
    check.dataset.action = 'toggle'; check.dataset.id = task.id;
    check.setAttribute('aria-label', `${task.title} ${task.done ? '완료 취소' : '완료하기'}`);
    const main = element('div', 'task-main'); main.append(element('div', 'task-title', task.title));
    if (task.description) main.append(element('div', 'task-desc', task.description));
    const metadata = element('div', 'task-meta');
    metadata.append(element('span', `pill ${task.priority}`, { high: '높음', medium: '보통', low: '낮음' }[task.priority]));
    if (task.due) {
      const overdue = !task.done && task.due < today();
      metadata.append(element('span', `due${overdue ? ' overdue' : ''}`, `${overdue ? '기한 지남 · ' : '마감 · '}${task.due.replaceAll('-', '.')}`));
    }
    main.append(metadata);
    const actions = element('div', 'task-actions');
    for (const [action, title, symbol] of [['edit', '수정', '✎'], ['delete', '삭제', '×']]) {
      const button = element('button', `icon-btn${action === 'delete' ? ' delete' : ''}`, symbol);
      button.type = 'button'; button.dataset.action = action; button.dataset.id = task.id; button.title = title;
      button.setAttribute('aria-label', `${task.title} ${title}`); actions.append(button);
    }
    row.append(check, main, actions); fragment.append(row);
  }
  if (!shown.length) {
    const empty = element('div', 'empty');
    const heading = state.phase === 'error' ? '공유 목록에 접근할 수 없어요' : state.phase === 'loading' ? '공유 목록을 불러오는 중이에요' : state.phase === 'offline' ? '공유 목록 연결이 끊겼어요' : tasks.length ? '검색 조건에 맞는 할 일이 없어요' : '아직 등록된 할 일이 없어요';
    const detail = state.phase === 'error' ? '연결 상태를 확인한 뒤 다시 불러오기를 눌러 주세요.' : state.phase === 'offline' ? '저장되지 않은 내용을 저장됐다고 표시하지 않습니다.' : tasks.length ? '검색어 또는 상태 필터를 바꿔보세요.' : '할 일 추가 버튼으로 시작해 보세요.';
    empty.append(element('div', 'empty-icon', '✓'), element('h3', '', heading), element('p', '', detail)); fragment.append(empty);
  }
  $('task-list').replaceChildren(fragment); controls();
}
function closeDialog() { if (!state.busy) dialog.close(); }
function openDialog(task = null) {
  if (state.phase !== 'ready' || state.busy) return;
  editingSnapshot = task ? { ...task } : null;
  editing = Boolean(task); draftId = task?.id || newTaskId(); draftCreatedAt = task?.createdAt || Date.now();
  focusBeforeDialog = document.activeElement;
  $('task-form').reset(); $('form-error').textContent = '';
  $('dialog-heading').textContent = task ? '할 일 수정' : '새 할 일 추가';
  $('save-btn').textContent = task ? '변경 사항 저장' : '할 일 저장';
  if (task) for (const field of ['title', 'description', 'priority', 'due']) $('task-' + field).value = task[field];
  dialog.showModal(); $('task-title').focus();
}
async function write(operation, success) {
  if (state.phase !== 'ready' || state.busy) return false;
  state.busy = true; $('form-error').textContent = ''; render();
  try {
    await operation(); notify(success); return true;
  } catch (error) {
    $('form-error').textContent = error.message;
    $('diagnostic-result').textContent = `저장 실패 [${error.code || 'UNKNOWN'}]\n${error.message}`;
    $('diagnostic-result').classList.add('error'); notify(error.message);
    if (error.code === 'CONFLICT' || error.code === 'MISSING') await store.refresh();
    return false;
  } finally { state.busy = false; render(); }
}
$('add-btn').addEventListener('click', () => openDialog());
for (const id of ['cancel-btn', 'dialog-close']) $(id).addEventListener('click', closeDialog);
dialog.addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
dialog.addEventListener('close', () => focusBeforeDialog?.focus());
dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(); } });
$('task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = Object.fromEntries(['title', 'description', 'priority', 'due'].map(key => [key, $('task-' + key).value]));
  const ok = await write(() => editing ? store.update(draftId, fields, editingSnapshot) : store.create(draftId, fields, draftCreatedAt), editing ? '변경 사항을 저장했어요.' : '할 일을 저장했어요.');
  if (ok) dialog.close();
});
$('task-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || state.busy || state.phase !== 'ready') return;
  const task = state.tasks.find(task => task.id === button.dataset.id);
  if (!task) return;
  if (button.dataset.action === 'edit') return openDialog(task);
  if (button.dataset.action === 'toggle') {
    const done = button.checked;
    const ok = await write(() => store.update(task.id, { done }), done ? '완료했어요.' : '완료를 취소했어요.');
    if (!ok) render();
  }
  if (button.dataset.action === 'delete' && confirm(`“${task.title}”을 공유 목록에서 삭제할까요?`)) await write(() => store.remove(task.id), '할 일을 삭제했어요.');
});
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => { state.filter = button.dataset.filter; render(); });
$('search').addEventListener('input', event => { state.query = event.target.value.trim().toLocaleLowerCase(); render(); });
$('retry-btn').addEventListener('click', () => store.retry());
window.addEventListener('offline', () => { state.phase = 'offline'; state.error = null; render(); });
window.addEventListener('online', () => store.retry());
window.addEventListener('pagehide', () => store.stop());
window.addEventListener('pageshow', event => { if (event.persisted) store.resume(); });
$('diagnostic-project').textContent = firebaseConfig.projectId;
$('diagnostic-url').textContent = firebaseConfig.databaseURL;
$('diagnostic-path').textContent = TODO_PATH;
$('read-test-btn').addEventListener('click', async () => {
  try { await store.checkRead(); $('diagnostic-result').textContent = '읽기 확인 성공 · 인증정보 없이 서버 응답 확인'; $('diagnostic-result').classList.remove('error'); }
  catch (error) { $('diagnostic-result').textContent = `${error.message} [${error.code}]`; $('diagnostic-result').classList.add('error'); }
});
$('write-test-btn').addEventListener('click', async () => {
  if (!confirm('공유 목록에 임시 항목 1개를 만들고 삭제해 저장 권한을 확인할까요?')) return;
  const id = newTaskId(); let created = false;
  await write(async () => {
    try {
      await store.create(id, { title: '임시 저장 권한 확인', description: '', priority: 'low', due: '' }); created = true;
      await store.remove(id); created = false;
      $('diagnostic-result').textContent = '쓰기·삭제 확인 완료'; $('diagnostic-result').classList.remove('error');
    } catch (error) { if (created) error.message += ` 임시 항목이 남을 수 있어요: ${id}`; throw error; }
  }, '임시 항목 저장·삭제를 확인했어요.');
});
$('copy-diagnostic-btn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`프로젝트: ${firebaseConfig.projectId}\nDB: ${firebaseConfig.databaseURL}\n경로: ${TODO_PATH}\n상태: ${state.phase}\n${$('diagnostic-result').textContent}`); notify('연결 상태를 복사했어요.'); }
  catch { notify('복사하지 못했어요. 화면의 연결 상태를 직접 선택해 복사해 주세요.'); }
});
$('today-label').textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
render(); store.watch();
