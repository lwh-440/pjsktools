import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, createTimedAssetProxyStream } from "./app.js";

afterEach(() => vi.unstubAllGlobals());

describe("asset proxy streaming", () => {
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
});
