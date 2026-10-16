/**
 * queryCache — tiny TTL cache for heavy Firestore collection reads.
 *
 * Problem: list/dashboard pages call getDocs() on whole collections on EVERY
 * visit (no limit, no pagination, no cache). As data grows the app gets slower
 * every day. This cache makes repeat navigation instant.
 *
 * Rules:
 * - 90 second TTL per key. Reads within TTL return instantly, no network.
 * - Every write function in the services calls bust()/bustPrefix() for its
 *   collection, so a fresh save is NEVER hidden behind stale cache.
 * - In-memory only (per tab). No persistence, no cross-tab staleness logic —
 *   TTL expiry handles it.
 */
const TTL_MS = 90_000;

type Entry = { at: number; data: unknown };
const store = new Map<string, Entry>();

export function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Promise.resolve(hit.data as T);
  }
  return fetcher().then((data) => {
    store.set(key, { at: Date.now(), data });
    return data;
  });
}

/** Drop exact keys (call after writes). */
export function bust(...keys: string[]): void {
  for (const k of keys) store.delete(k);
}

/** Drop every key starting with prefix (e.g. agent-scoped keys). */
export function bustPrefix(prefix: string): void {
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
