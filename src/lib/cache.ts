type Entry<T> = { value: T; expiresAt: number };

export class LRUCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(
    private ttlMs: number,
    private maxSize: number = 1000,
  ) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Refresh LRU order: delete and re-add to end
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T): void {
    // Delete existing to refresh position
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // Evict oldest if at capacity
    while (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
      else break;
    }

    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

// Backwards compat alias
export { LRUCache as MemoryCache };
