/** In-memory AsyncStorage for unit tests. */
const mem = new Map<string, string>();

/** Lets a test make the next writes fail, to exercise the storage-full path. */
export const control = { failWrites: false, failReads: false };

const guardWrite = () => {
  if (control.failWrites) throw new Error('QuotaExceededError');
};
const guardRead = () => {
  if (control.failReads) throw new Error('Row too big to fit into CursorWindow');
};

export default {
  getItem: async (key: string) => (guardRead(), mem.get(key) ?? null),
  setItem: async (key: string, value: string) => (guardWrite(), void mem.set(key, value)),
  removeItem: async (key: string) => void mem.delete(key),
  getAllKeys: async () => (guardRead(), [...mem.keys()]),
  multiGet: async (keys: string[]) => (guardRead(), keys.map((k) => [k, mem.get(k) ?? null] as [string, string | null])),
  multiSet: async (pairs: [string, string][]) => {
    guardWrite();
    for (const [k, v] of pairs) mem.set(k, v);
  },
  multiRemove: async (keys: string[]) => {
    for (const k of keys) mem.delete(k);
  },
  clear: async () => mem.clear(),
};
