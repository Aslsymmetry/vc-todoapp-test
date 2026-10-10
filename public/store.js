import { firebaseConfig, TODO_PATH } from './config.js';

export class StoreError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const base = firebaseConfig.databaseURL.replace(/\/$/, '');
const alphabet = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
export function newTaskId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), n => alphabet[n & 63]).join('');
}
export function validTask(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) &&
    typeof raw.title === 'string' && raw.title.trim().length > 0 && raw.title.length <= 120 &&
    typeof raw.description === 'string' && raw.description.length <= 1000 &&
    ['high', 'medium', 'low'].includes(raw.priority) && typeof raw.done === 'boolean' &&
    typeof raw.due === 'string' && (raw.due === '' || /^\d{4}-\d{2}-\d{2}$/.test(raw.due)) &&
    Number.isFinite(raw.createdAt) && Number.isFinite(raw.updatedAt) && raw.createdAt >= 0 && raw.updatedAt >= raw.createdAt;
}
export function inputFields(values) {
  const result = { title: values.title.trim(), description: values.description.trim(), priority: values.priority, due: values.due };
  if (!validTask({ ...result, done: false, createdAt: 0, updatedAt: 0 })) throw new StoreError('INVALID', '제목, 메모 길이, 중요도와 마감일을 확인해 주세요.');
  return result;
}
function taskUrl(id = '') {
  if (id && !/^[-0-9A-Z_a-z]{20}$/.test(id) && !/^legacy_[0-9a-f]{64}$/.test(id)) throw new StoreError('INVALID', '할 일 ID가 올바르지 않아요.');
  return `${base}/${TODO_PATH}${id ? '/' + id : ''}.json`;
}
async function request(id = '', method = 'GET', value, etag) {
  const headers = { 'X-Firebase-ETag': 'true' };
  if (value !== undefined) headers['Content-Type'] = 'application/json';
  if (etag) headers['if-match'] = etag;
  let response;
  try {
    response = await fetch(taskUrl(id), { method, credentials: 'omit', cache: 'no-store',
      headers, body: value === undefined ? undefined : JSON.stringify(value), signal: AbortSignal.timeout(12000) });
  } catch {
    throw new StoreError('NETWORK', method === 'GET' ? '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' : '서버 응답을 확인하지 못했어요. 저장 여부를 다시 불러와 확인한 뒤 재시도해 주세요.');
  }
  if (response.status === 401 || response.status === 403) throw new StoreError('PERMISSION_DENIED', 'Firebase에서 접근 권한을 거부했어요. 공개 공유 경로의 DB 규칙 적용이 필요해요.');
  if (response.status === 412) throw new StoreError('CONFLICT', '다른 브라우저에서 변경된 할 일이에요. 목록을 다시 확인한 뒤 수정해 주세요.');
  if (!response.ok) throw new StoreError('HTTP_' + response.status, `서버 요청이 실패했어요. [HTTP ${response.status}]`);
  return { value: await response.json(), etag: response.headers.get('ETag') };
}
export class TodoStore {
  constructor(onState) {
    this.onState = onState; this.records = []; this.stopped = false;
    this.timer = null; this.stream = null; this.refreshing = null; this.phase = 'loading';
  }
  emit(phase, error = null) {
    this.phase = phase;
    this.onState({ phase, error, tasks: this.records });
  }
  async refresh() {
    if (this.stopped) return;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.readList().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async readList() {
    if (!navigator.onLine) { this.emit('offline'); return; }
    try {
      const { value } = await request();
      if (this.stopped) return;
      this.records = Object.entries(value || {}).filter(([id, task]) => validTask(task) && /^([-0-9A-Z_a-z]{20}|legacy_[0-9a-f]{64})$/.test(id))
        .map(([id, task]) => ({ ...task, id }));
      this.emit('ready');
    } catch (error) { if (!this.stopped) this.emit(error.code === 'NETWORK' ? 'offline' : 'error', error); }
  }
  connectStream() {
    if (this.stopped || this.stream || typeof EventSource !== 'function') return;
    this.stream = new EventSource(taskUrl(), { withCredentials: false });
    for (const event of ['put', 'patch']) this.stream.addEventListener(event, () => this.refresh());
    this.stream.addEventListener('cancel', () => {
      this.stream?.close(); this.stream = null; clearTimeout(this.timer);
      this.emit('error', new StoreError('PERMISSION_DENIED', 'Firebase에서 공유 목록 접근 권한을 거부했어요.'));
    });
    this.stream.onerror = () => { this.stream?.close(); this.stream = null; };
  }
  async watch() {
    await this.refresh();
    if (this.stopped) return;
    if (this.phase === 'ready') this.connectStream();
    clearTimeout(this.timer);
    // Permission errors require explicit retry; transient failures are retried.
    if (this.phase !== 'error') this.timer = setTimeout(() => this.watch(), 3000);
  }
  async retry() { clearTimeout(this.timer); this.emit('loading'); await this.watch(); }
  stop() { this.stopped = true; clearTimeout(this.timer); this.stream?.close(); this.stream = null; }
  async resume() { this.stopped = false; await this.retry(); }
  async create(id, fields, createdAt = Date.now()) {
    const task = { ...inputFields(fields), done: false, createdAt, updatedAt: createdAt };
    await request(id, 'PUT', task, 'null_etag');
    await this.refresh();
  }
  async update(id, fields, expectedTask) {
    const { value: current, etag } = await request(id);
    if (!current) throw new StoreError('MISSING', '이미 삭제된 할 일이에요. 목록을 다시 불러와 주세요.');
    if (!validTask(current) || !etag) throw new StoreError('INVALID', '서버 데이터 상태를 확인할 수 없어 수정을 중단했어요.');
    if (expectedTask && ['title', 'description', 'priority', 'due', 'done', 'createdAt', 'updatedAt'].some(field => current[field] !== expectedTask[field])) throw new StoreError('CONFLICT', '다른 브라우저에서 변경된 할 일이에요. 편집 창을 닫고 다시 열어 주세요.');
    const changes = 'done' in fields ? { done: fields.done } : inputFields(fields);
    if ('done' in changes && typeof changes.done !== 'boolean') throw new StoreError('INVALID', '완료 상태가 올바르지 않아요.');
    await request(id, 'PUT', { ...current, ...changes, updatedAt: Math.max(Date.now(), current.updatedAt + 1) }, etag);
    await this.refresh();
  }
  async remove(id) {
    const { value, etag } = await request(id);
    if (value !== null) {
      if (!etag) throw new StoreError('INVALID', '서버 데이터 상태를 확인할 수 없어 삭제를 중단했어요.');
      await request(id, 'DELETE', undefined, etag);
    }
    await this.refresh();
  }
  async checkRead() { await request(); }
}
