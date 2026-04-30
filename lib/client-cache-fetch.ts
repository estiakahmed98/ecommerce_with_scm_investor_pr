"use client";

type CacheEntry<T = unknown> = {
  expiresAt: number;
  data?: T;
  promise?: Promise<T>;
};

type CachedFetchOptions = {
  ttlMs?: number;
  key?: string;
  init?: RequestInit;
};

const DEFAULT_TTL_MS = 60_000;

const globalCache = globalThis as typeof globalThis & {
  __CLIENT_FETCH_CACHE__?: Map<string, CacheEntry>;
};

const cacheStore =
  globalCache.__CLIENT_FETCH_CACHE__ ??
  (globalCache.__CLIENT_FETCH_CACHE__ = new Map<string, CacheEntry>());

function buildCacheKey(url: string, init?: RequestInit, explicitKey?: string) {
  if (explicitKey) return explicitKey;
  const method = (init?.method ?? "GET").toUpperCase();
  return `${method}:${url}`;
}

export async function cachedFetchJson<T = unknown>(
  url: string,
  options: CachedFetchOptions = {}
): Promise<T> {
  const { ttlMs = DEFAULT_TTL_MS, key, init } = options;
  const method = (init?.method ?? "GET").toUpperCase();

  if (method !== "GET") {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return (await res.json()) as T;
  }

  const now = Date.now();
  const cacheKey = buildCacheKey(url, init, key);
  const existing = cacheStore.get(cacheKey);

  if (existing?.data !== undefined && existing.expiresAt > now) {
    return existing.data as T;
  }

  if (existing?.promise) {
    return (await existing.promise) as T;
  }

  const requestPromise = fetch(url, init)
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    })
    .then((data) => {
      cacheStore.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttlMs,
      });
      return data;
    })
    .catch((error) => {
      cacheStore.delete(cacheKey);
      throw error;
    });

  cacheStore.set(cacheKey, {
    expiresAt: now + ttlMs,
    promise: requestPromise,
  });

  return await requestPromise;
}

export function clearCachedFetch(keyPrefix?: string) {
  if (!keyPrefix) {
    cacheStore.clear();
    return;
  }

  for (const key of cacheStore.keys()) {
    if (key.startsWith(keyPrefix)) {
      cacheStore.delete(key);
    }
  }
}

