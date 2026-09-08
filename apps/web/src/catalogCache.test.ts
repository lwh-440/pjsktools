import { describe, expect, it, vi } from "vitest";
import { loadCachedCatalog } from "./catalogCache";

function abortError() {
  const error = new Error("cancelled");
  error.name = "AbortError";
  return error;
}

describe("loadCachedCatalog", () => {
  it("starts an independent same-key request after the prior owner is cancelled", async () => {
    let fetchCalls = 0;
    let firstFetchStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => { firstFetchStarted = resolve; });
    let resolveSecond!: (response: Response) => void;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        firstFetchStarted();
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => queueMicrotask(() => reject(abortError())));
        });
      }
      return new Promise<Response>((resolve) => { resolveSecond = resolve; });
    }));

    try {
      const ownerA = new AbortController();
      const ownerB = new AbortController();
      const requestA = loadCachedCatalog<{ owner: string }>("/catalog-cache-abort-regression", { signal: ownerA.signal });
      await firstStarted;
      ownerA.abort();

      const requestB = loadCachedCatalog<{ owner: string }>("/catalog-cache-abort-regression", { signal: ownerB.signal });
      await expect(requestA).rejects.toMatchObject({ name: "AbortError" });

      const requestBSubscriber = loadCachedCatalog<{ owner: string }>("/catalog-cache-abort-regression", { signal: ownerB.signal });
      expect(fetchCalls).toBe(2);

      resolveSecond(new Response(JSON.stringify({ owner: "B" }), { status: 200 }));
      await expect(requestB).resolves.toEqual({ owner: "B" });
      await expect(requestBSubscriber).resolves.toEqual({ owner: "B" });
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});
