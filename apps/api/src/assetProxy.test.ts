import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, createTimedAssetProxyStream } from "./app.js";

afterEach(() => vi.unstubAllGlobals());

describe("asset proxy streaming", () => {
  it("infers a PNG content type when Haruki omits it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 })));
    const app = await buildApp({ assetProxyTimeoutMs: 100 });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/assets/proxy?url=${encodeURIComponent("https://storage.sekai.best/haruki/live2d/texture_00.png")}`
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
    } finally {
      await app.close();
    }
  });

  it("replaces a generic PNG content type with the inferred image type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "content-type": "application/octet-stream" }
    })));
    const app = await buildApp({ assetProxyTimeoutMs: 100 });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/assets/proxy?url=${encodeURIComponent("https://storage.sekai.best/haruki/live2d/texture_00.png")}`
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
    } finally {
      await app.close();
    }
  });

  it("fails the real route when the response body stalls and caches that failure", async () => {
    let signal: AbortSignal | undefined;
    const upstream = vi.fn(async (_url: unknown, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode("partial")); }
      }), { headers: { "content-type": "image/png" } });
    });
    vi.stubGlobal("fetch", upstream);
    const app = await buildApp({ assetProxyTimeoutMs: 40 });
    const url = `/api/assets/proxy?url=${encodeURIComponent("https://storage.sekai.best/stalled-route-test.png")}`;
    try {
      await expect(app.inject({ method: "GET", url })).rejects.toThrow(/destroyed|timed out/i);
      expect(signal?.aborted).toBe(true);
      const retry = await app.inject({ method: "GET", url });
      expect(retry.statusCode).toBe(503);
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });

  it("aborts and destroys an upstream body that never ends", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode("partial"));
      }
    });
    const stream = createTimedAssetProxyStream(body, controller, 20);
    const failure = new Promise<Error>((resolve) => stream.once("error", resolve));

    stream.resume();

    await expect(failure).resolves.toMatchObject({ message: "Asset proxy stream timed out" });
    expect(controller.signal.aborted).toBe(true);
    expect(stream.destroyed).toBe(true);
  });

  it("does not relay an encoded upstream content length for a decoded stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("complete image", {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-encoding": "gzip",
        "content-length": "999",
        etag: "\"asset\""
      }
    })));
    const app = await buildApp({ assetProxyTimeoutMs: 100 });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/assets/proxy?url=${encodeURIComponent("https://storage.sekai.best/test.png")}`
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("complete image");
      expect(response.headers["content-length"]).not.toBe("999");
      expect(response.headers.etag).toBe("\"asset\"");
    } finally {
      await app.close();
    }
  });

  it("preserves partial-content range semantics without the upstream length", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("part", {
      status: 206,
      headers: {
        "content-type": "image/png",
        "content-range": "bytes 10-13/100",
        "content-length": "90"
      }
    })));
    const app = await buildApp({ assetProxyTimeoutMs: 100 });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/assets/proxy?url=${encodeURIComponent("https://storage.sekai.best/test.png")}`,
        headers: { range: "bytes=10-13" }
      });

      expect(response.statusCode).toBe(206);
      expect(response.body).toBe("part");
      expect(response.headers["content-range"]).toBe("bytes 10-13/100");
      expect(response.headers["content-length"]).not.toBe("90");
    } finally {
      await app.close();
    }
  });

  it("retries a Haruki CDN 404 through the global mirror while preserving range and ETag headers", async () => {
    const primary = new Response("missing", { status: 404 });
    const cancel = vi.spyOn(primary.body!, "cancel");
    const upstream = vi.fn(async (url: unknown, _options: RequestInit) => {
      if (String(url).includes("cn04-sha01")) return primary;
      if (String(url).includes("sekai-assets-haruki.seiunx.net")) {
        return new Response("part", {
          status: 206,
          headers: {
            "content-type": "image/png",
            "content-range": "bytes 10-13/100",
            etag: "\"global-asset\""
          }
        });
      }
      throw new Error(`Unexpected mirror ${String(url)}`);
    });
    vi.stubGlobal("fetch", upstream);
    const app = await buildApp({ assetProxyTimeoutMs: 100 });
    const target = "https://sekai-assets-cn04-sha01-cdn.haruki.seiunx.com/jp-assets/startapp/comic/one_frame/comic_0022.png";

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/assets/proxy?url=${encodeURIComponent(target)}`,
        headers: { range: "bytes=10-13", "if-none-match": "\"global-asset\"" }
      });

      expect(response.statusCode).toBe(206);
      expect(response.body).toBe("part");
      expect(response.headers["content-range"]).toBe("bytes 10-13/100");
      expect(response.headers.etag).toBe("\"global-asset\"");
      expect(response.headers["x-asset-source"]).toBe("sekai-assets-haruki.seiunx.net");
      expect(cancel).toHaveBeenCalledOnce();
      expect(upstream).toHaveBeenCalledTimes(2);
      expect(upstream.mock.calls[1]?.[1]).toMatchObject({
        headers: { range: "bytes=10-13", "if-none-match": "\"global-asset\"" }
      });
    } finally {
      await app.close();
    }
  });

  it("returns an all-mirror 404 without caching it as a proxy failure", async () => {
    const upstream = vi.fn(async (_url: unknown) => new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", upstream);
    const app = await buildApp({ assetProxyTimeoutMs: 100 });
    const target = "https://sekai-assets-cn04-sha01-cdn.haruki.seiunx.com/jp-assets/startapp/comic/one_frame/comic_0089.png";
    const url = `/api/assets/proxy?url=${encodeURIComponent(target)}`;

    try {
      const first = await app.inject({ method: "GET", url });
      const retry = await app.inject({ method: "GET", url });

      expect(first.statusCode).toBe(404);
      expect(retry.statusCode).toBe(404);
      // Three Haruki CDNs plus the old-source fallbacks (PNG/WebP) are tried
      // on each request; a 404 must remain retryable rather than becoming a
      // temporary 503 cache entry.
      expect(upstream).toHaveBeenCalledTimes(18);
      expect(upstream.mock.calls.map(([source]) => String(source))).not.toContain(expect.stringContaining("cn07-she02"));
    } finally {
      await app.close();
    }
  });

  it("uses an old WebP mirror only after all Haruki CDN paths return 404", async () => {
    const upstream = vi.fn(async (url: unknown) => {
      const source = String(url);
      if (source.includes("storage.exmeaning.com") && source.endsWith("banner_event_story.webp")) {
        return new Response("legacy", { status: 206, headers: { "content-type": "image/webp", "content-range": "bytes 0-5/6" } });
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", upstream);
    const app = await buildApp({ assetProxyTimeoutMs: 100 });
    const target = "https://sekai-assets-cn04-sha01-cdn.haruki.seiunx.com/tw-assets/ondemand/event_story/event_wl_3rd_part1_2026/screen_image/banner_event_story.png";
    try {
      const response = await app.inject({ method: "GET", url: `/api/assets/proxy?url=${encodeURIComponent(target)}` });
      expect(response.statusCode).toBe(206);
      expect(response.headers["content-type"]).toBe("image/webp");
      expect(response.headers["x-asset-source"]).toBe("storage.exmeaning.com");
    } finally { await app.close(); }
  });
});
