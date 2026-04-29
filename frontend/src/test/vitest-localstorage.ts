/** jsdom + 部分 Node 版本下 localStorage 不完整，供 zustand persist 单测使用 */
const mem = new Map<string, string>()
const mock: Storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k, v) => {
    mem.set(k, String(v))
  },
  removeItem: (k) => {
    mem.delete(k)
  },
  clear: () => {
    mem.clear()
  },
  key: (i) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size
  },
}
Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true })
