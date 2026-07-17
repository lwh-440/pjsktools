import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetResolver } from "./assetResolver.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function cacheDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "pjsk-assets-"));
  directories.push(directory);
  return directory;
}

function image(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "image/webp", etag: `"${body}"` } });
}

describe("AssetResolver", () => {
  it("races candidates and returns the first successful image", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("first")) return new Response("missing", { status: 404 });
      return image("winner");
    }) as typeof fetch;
    const resolver = new AssetResolver(await cacheDirectory(), 1024 * 1024, fetcher);

    const result = await resolver.resolve(["https://example.test/first", "https://example.test/second"], 1_000, 2_000);

    expect(result.body.toString()).toBe("winner");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests and serves later requests from disk", async () => {
    let requests = 0;
    const fetcher = vi.fn(async () => {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return image("cached");
    }) as typeof fetch;
    const directory = await cacheDirectory();
    const resolver = new AssetResolver(directory, 1024 * 1024, fetcher);

    const [first, second] = await Promise.all([
      resolver.resolve(["https://example.test/image"]),
      resolver.resolve(["https://example.test/image"])
    ]);
    const disk = await resolver.resolve(["https://example.test/image"]);

    expect(first.body.toString()).toBe("cached");
    expect(second.body.toString()).toBe("cached");
    expect(disk.cacheHit).toBe(true);
    expect(requests).toBe(1);
    expect(JSON.parse(await readFile(path.join(directory, `${await import("node:crypto").then(({ createHash }) => createHash("sha256").update("https://example.test/image").digest("hex"))}.json`), "utf8")).contentType).toBe("image/webp");
  });

  it("negatively caches missing candidates", async () => {
    const fetcher = vi.fn(async () => new Response("missing", { status: 404 })) as typeof fetch;
    const resolver = new AssetResolver(await cacheDirectory(), 1024 * 1024, fetcher);

    await expect(resolver.resolve(["https://example.test/missing"])).rejects.toThrow();
    await expect(resolver.resolve(["https://example.test/missing"])).rejects.toThrow();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("removes least recently used files when the cache exceeds its limit", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => image(String(url).repeat(4))) as typeof fetch;
    const resolver = new AssetResolver(await cacheDirectory(), 80, fetcher);

    await resolver.resolve(["https://example.test/a"]);
    await resolver.resolve(["https://example.test/b"]);

    expect(await resolver.cacheSize()).toBeLessThanOrEqual(80);
  });
});
