/** In-memory AsyncStorage for unit tests. */
const mem = new Map<string, string>();

export default {
  getItem: async (key: string) => mem.get(key) ?? null,
  setItem: async (key: string, value: string) => void mem.set(key, value),
  removeItem: async (key: string) => void mem.delete(key),
  clear: async () => mem.clear(),
};
