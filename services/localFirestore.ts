/** Device-only document storage. The familiar API keeps existing project/version logic intact. */
export const LOCAL_USER_ID = 'local';
export const LOCAL_PROFILE = { uid: LOCAL_USER_ID, email: 'local@device.invalid', displayName: '本机', isAnonymous: false, emailVerified: true };
export const db = { kind: 'indexeddb' };
export const getFirestore = (..._args: unknown[]) => db;
export class Timestamp {
    constructor(public seconds: number, public nanoseconds: number = 0) {}
    static now() { return Timestamp.fromMillis(Date.now()); }
    static fromDate(date: Date) { return Timestamp.fromMillis(date.getTime()); }
    static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), Math.floor((ms % 1000) * 1e6)); }
    toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
    toDate() { return new Date(this.toMillis()); }
    isEqual(other: Timestamp) { return this.toMillis() === other.toMillis(); }
}
export const serverTimestamp = () => Timestamp.now();
type Ref = { path: string; id: string; kind: 'doc' | 'collection'; constraints?: Constraint[] };
type Constraint = { kind: string; field?: string; op?: string; value?: any; direction?: string };
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
    if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('toolkit-local-documents', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'path' });
        request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('本地数据库被旧窗口占用，请关闭旧窗口重试'));
    }).catch(error => { database = undefined; throw error; });
    return database;
}
function encode(value: any): any {
    if (value instanceof Timestamp || (value && typeof value.toMillis === 'function')) return { __localTimestamp: value.toMillis() };
    if (value instanceof Date) return { __localTimestamp: value.getTime() };
    if (Array.isArray(value)) return value.map(v => v === undefined ? null : encode(v));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined && typeof v !== 'function').map(([k,v]) => [k,encode(v)]));
    return value;
}
function decode(value: any): any {
    if (value && typeof value === 'object' && Object.keys(value).length === 1 && typeof value.__localTimestamp === 'number') return Timestamp.fromMillis(value.__localTimestamp);
    if (Array.isArray(value)) return value.map(decode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,decode(v)]));
    return value;
}
function makeRef(kind: Ref['kind'], parent: any, segments: string[]): Ref {
    const parts = [parent?.path || '', ...segments].filter(Boolean);
    const path = parts.join('/');
    if (!path || path.split('/').some(p => !p)) throw new Error('本地记录路径无效');
    return { path, id: path.split('/').pop()!, kind };
}
export const collection = (parent: any, ...segments: string[]) => makeRef('collection', parent, segments);
export const doc = (parent: any, ...segments: string[]) => makeRef('doc', parent, segments.length ? segments : [crypto.randomUUID()]);
function snapshot(ref: Ref, value: any) {
    return { id: ref.id, ref, exists: () => value !== undefined, data: () => decode(value), get: (field: string) => fieldValue(decode(value), field) };
}
export async function getDoc(ref: Ref) {
    const database = await openDatabase();
    return new Promise<ReturnType<typeof snapshot>>((resolve, reject) => {
        const request = database.transaction('documents').objectStore('documents').get(ref.path);
        request.onsuccess = () => resolve(snapshot(ref, request.result?.value));
        request.onerror = () => reject(request.error);
    });
}
export const getDocFromServer = getDoc; // Compatibility name; always reads this device.
const listeners = new Set<() => void>();
const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('toolkit-local-documents') : null;
if (channel) channel.onmessage = () => listeners.forEach(listener => listener());
function changed() { listeners.forEach(listener => listener()); channel?.postMessage('changed'); }
function mergeData(current: any, incoming: any): any {
    const result = { ...(current || {}) };
    for (const [key, value] of Object.entries(incoming || {})) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('无效的记录字段');
        result[key] = value && typeof value === 'object' && !Array.isArray(value) && !('__localTimestamp' in value)
            ? mergeData(result[key], value) : value;
    }
    return result;
}
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
/** Firestore update 语义：顶层字段整体替换；带点号的键（如 'preview.title'）按嵌套字段路径写入。 */
function applyUpdate(current: any, incoming: any): any {
    const result = { ...(current || {}) };
    for (const [key, value] of Object.entries(incoming || {})) {
        const parts = key.split('.');
        if (parts.some(part => !part || FORBIDDEN_KEYS.includes(part))) throw new Error('无效的记录字段');
        let target = result;
        for (const part of parts.slice(0, -1)) {
            const next = target[part];
            target[part] = next && typeof next === 'object' && !Array.isArray(next) ? { ...next } : {};
            target = target[part];
        }
        target[parts[parts.length - 1]] = value;
    }
    return result;
}
type Operation = { ref: Ref; action: 'set' | 'update' | 'delete'; data?: any; merge?: boolean };
async function commit(operations: Operation[]) {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('documents', 'readwrite');
        const store = transaction.objectStore('documents');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('本地保存失败'));
        // 同一批次内按顺序处理，后续操作能看到前面操作写入的值。
        const pending = new Map<string, any>();
        const apply = (operation: Operation, existing: any) => {
            if (operation.action === 'delete') { pending.set(operation.ref.path, undefined); store.delete(operation.ref.path); return; }
            if (operation.action === 'update' && existing === undefined) throw new Error('本地记录不存在');
            const data = encode(operation.data);
            const value = operation.action === 'update' ? applyUpdate(existing, data)
                : operation.merge ? mergeData(existing, data) : data;
            pending.set(operation.ref.path, value);
            store.put({ path: operation.ref.path, value });
        };
        const step = (index: number) => {
            if (index >= operations.length) return;
            const operation = operations[index];
            const run = (existing: any) => {
                try { apply(operation, existing); step(index + 1); }
                catch (error) { reject(error); transaction.abort(); }
            };
            if (pending.has(operation.ref.path) || operation.action === 'delete') { run(pending.get(operation.ref.path)); return; }
            const request = store.get(operation.ref.path);
            request.onsuccess = () => run(request.result?.value);
        };
        step(0);
    });
    changed();
}
export const setDoc = (ref: Ref, data: any, options?: { merge?: boolean }) => commit([{ ref, data, action: 'set', merge: options?.merge }]);
export const updateDoc = (ref: Ref, data: any) => commit([{ ref, data, action: 'update' }]);
export const deleteDoc = (ref: Ref) => commit([{ ref, action: 'delete' }]);
export async function addDoc(parent: Ref, data: any) { const ref = doc(parent); await setDoc(ref, data); return ref; }
export function writeBatch(_db: unknown) {
    const operations: Operation[] = [];
    return { set(ref: Ref, data: any, options?: { merge?: boolean }) { operations.push({ ref, data, action: 'set', merge: options?.merge }); }, update(ref: Ref, data: any) { operations.push({ ref, data, action: 'update' }); }, delete(ref: Ref) { operations.push({ ref, action: 'delete' }); }, commit: () => commit(operations) };
}
export const where = (field: string, op: string, value: any): Constraint => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, direction = 'asc'): Constraint => ({ kind: 'orderBy', field, direction });
export const limit = (value: number): Constraint => ({ kind: 'limit', value });
export const query = (parent: Ref, ...constraints: Constraint[]): Ref => ({ ...parent, constraints: [...(parent.constraints || []), ...constraints] });
function fieldValue(value: any, field: string) { return field.split('.').reduce((item, part) => item?.[part], value); }
function comparable(value: any) { return typeof value?.toMillis === 'function' ? value.toMillis() : value; }
export async function getDocs(ref: Ref) {
    const database = await openDatabase();
    const rows: any[] = await new Promise((resolve, reject) => {
        const request = database.transaction('documents').objectStore('documents').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    let docs = rows.filter(row => row.path.startsWith(ref.path + '/') && !row.path.slice(ref.path.length + 1).includes('/')).map(row => snapshot(makeRef('doc', { path: row.path }, []), row.value));
    const constraints = ref.constraints || [];
    for (const c of constraints.filter(c => c.kind === 'where')) docs = docs.filter(document => {
        const a = comparable(document.get(c.field!)), b = comparable(c.value);
        switch(c.op) {
            case '==': return a === b;
            case '!=': return a !== b;
            case '<': return a < b;
            case '<=': return a <= b;
            case '>': return a > b;
            case '>=': return a >= b;
            case 'in': return Array.isArray(b) && b.includes(a);
            case 'array-contains': return Array.isArray(a) && a.includes(b);
            default: throw new Error('不支持的本地查询条件');
        }
    });
    const sorting = constraints.filter(c => c.kind === 'orderBy');
    docs.sort((a,b) => {
        for (const c of sorting) { const av = comparable(a.get(c.field!)), bv = comparable(b.get(c.field!)); const compare = av === bv ? 0 : av < bv ? -1 : 1; if (compare) return c.direction === 'desc' ? -compare : compare; }
        return a.id.localeCompare(b.id);
    });
    const maximum = constraints.find(c => c.kind === 'limit'); if (maximum) docs = docs.slice(0, maximum.value);
    return { docs, empty: !docs.length, size: docs.length, forEach: (callback: (document: typeof docs[number]) => void) => docs.forEach(callback) };
}
export function onSnapshot(ref: Ref, next: (snapshot: any) => void, error?: (reason: unknown) => void): () => void {
    let active = true;
    const update = () => { void (ref.kind === 'collection' ? getDocs(ref) : getDoc(ref)).then(result => { if (active) next(result); }).catch(reason => { if (active) error?.(reason); }); };
    listeners.add(update); update();
    return () => { active = false; listeners.delete(update); };
}
