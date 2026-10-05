// Minimal IndexedDB key-value stores for the uploads library and user templates.

const DB_NAME = 'kamva';
const VERSION = 2;
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of ['uploads', 'templates']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const idb = {
  put: <T extends { id: string }>(store: string, value: T) => tx(store, 'readwrite', (s) => s.put(value)),
  get: <T>(store: string, id: string) => tx<T>(store, 'readonly', (s) => s.get(id) as IDBRequest<T>),
  all: <T>(store: string) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  del: (store: string, id: string) => tx(store, 'readwrite', (s) => s.delete(id)),
};

export interface UploadRecord {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'audio' | 'svg' | 'font';
  mime: string;
  blob: Blob;
  thumb?: string;
  width?: number;
  height?: number;
  duration?: number;
  created: number;
}
