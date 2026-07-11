import { API_BASE_URL } from "./api";

type CacheEntry<T> = { key: string; data: T; etag?: string; cachedAt: number };

const databaseName = "pjsktools-cache";
const storeName = "catalogs";
const memoryCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache<T>(key: string): Promise<CacheEntry<T> | undefined> {
  const memory = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memory) return memory;
  if (typeof indexedDB === "undefined") return undefined;
  try {
    const database = await openDatabase();
    const entry = await new Promise<CacheEntry<T> | undefined>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (entry) memoryCache.set(key, entry);
    return entry;
  } catch {
    return undefined;
  }
}

async function writeCache<T>(entry: CacheEntry<T>) {
  memoryCache.set(entry.key, entry);
  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Browser storage is an optimization; network data remains authoritative.
  }
}

export async function loadCachedCatalog<T>(
  path: string,
  options: { signal?: AbortSignal; onCached?: (data: T) => void } = {}
): Promise<T> {
  const key = path;
  const cached = await readCache<T>(key);
  if (cached) options.onCached?.(cached.data);
  const existing = pendingRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = (async () => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      signal: options.signal,
      headers: cached?.etag ? { "If-None-Match": cached.etag } : undefined
    });
    if (response.status === 304 && cached) return cached.data;
    if (!response.ok) throw new Error((await response.text()) || `Catalog request failed: ${response.status}`);
    const data = await response.json() as T;
    void writeCache({ key, data, etag: response.headers.get("etag") ?? undefined, cachedAt: Date.now() });
    return data;
  })().finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, request);
  return request;
}
