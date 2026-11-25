/**
 * Where the kept meal photos live in a browser: the browser's own database for this site (IndexedDB,
 * `healthcal-meal-photos`), one record per photo holding its JPEG as base64. Never uploaded, never synced,
 * and not in the export. Where the database cannot be opened (some private windows, a sandboxed frame),
 * `photosAvailable` answers false: no photo is kept and the journal says so. The phones' copy is ./files.ts.
 */
const DB = 'healthcal-meal-photos';
const STORE = 'photos';

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (!opening) {
    opening = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return opening;
}

/** One request in its own transaction; null when the database or the request fails. */
async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = act(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function photosAvailable(): Promise<boolean> {
  return (await open()) !== null;
}

export async function writePhoto(id: string, base64: string): Promise<boolean> {
  return (await run('readwrite', (s) => s.put(base64, id))) !== null;
}

export async function photoUri(id: string): Promise<string | null> {
  const data = await run<unknown>('readonly', (s) => s.get(id));
  return typeof data === 'string' && data ? `data:image/jpeg;base64,${data}` : null;
}

export async function removePhoto(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

export async function removeAllPhotos(): Promise<void> {
  await run('readwrite', (s) => s.clear());
}
