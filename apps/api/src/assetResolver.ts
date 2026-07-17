import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const NOT_FOUND_TTL = 10 * 60_000;
const TRANSIENT_TTL = 60_000;

type FetchLike = typeof fetch;

type AssetMetadata = {
  url: string;
  contentType: string;
  etag?: string;
  lastModified?: string;
  size: number;
  cachedAt: number;
  accessedAt: number;
};

export type ResolvedAsset = AssetMetadata & { body: Buffer; cacheHit: boolean };

type NegativeEntry = { status: number; expiresAt: number };

export class AssetResolver {
  private readonly inflight = new Map<string, Promise<ResolvedAsset>>();
  private readonly negative = new Map<string, NegativeEntry>();

  constructor(
    private readonly cacheDir = process.env.ASSET_CACHE_DIR ?? path.resolve(".cache/assets"),
    private readonly maxBytes = Number(process.env.ASSET_CACHE_MAX_BYTES) || DEFAULT_MAX_BYTES,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async resolve(urls: string[], candidateTimeoutMs = 4_000, overallTimeoutMs = 6_000): Promise<ResolvedAsset> {
    const candidates = [...new Set(urls)].slice(0, 3);
    if (!candidates.length) throw new AssetResolveError(400, "No asset candidates supplied");

    const controllers = candidates.map(() => new AbortController());
    const overall = setTimeout(() => controllers.forEach((controller) => controller.abort()), overallTimeoutMs);
    try {
      return await new Promise<ResolvedAsset>((resolve, reject) => {
        let failures = 0;
        let settled = false;
        const fail = (error: unknown) => {
          failures += 1;
          if (!settled && failures === candidates.length) {
            settled = true;
            reject(error);
          }
        };
        candidates.forEach((url, index) => {
          setTimeout(() => {
            if (settled) return;
            this.fetchCached(url, candidateTimeoutMs, controllers[index].signal).then((asset) => {
              if (settled) return;
              settled = true;
              controllers.forEach((controller, controllerIndex) => {
                if (controllerIndex !== index) controller.abort();
              });
              resolve(asset);
            }).catch(fail);
          }, index * 400);
        });
      });
    } finally {
      clearTimeout(overall);
    }
  }

  private async fetchCached(url: string, timeoutMs: number, externalSignal: AbortSignal): Promise<ResolvedAsset> {
    const negative = this.negative.get(url);
    if (negative && negative.expiresAt > Date.now()) throw new AssetResolveError(negative.status, "Asset candidate is negatively cached");
    if (negative) this.negative.delete(url);

    const cached = await this.readCache(url);
    if (cached) return cached;
    const existing = this.inflight.get(url);
    if (existing) return existing;

    const pending = this.fetchAndStore(url, timeoutMs, externalSignal).finally(() => this.inflight.delete(url));
    this.inflight.set(url, pending);
    return pending;
  }

  private async fetchAndStore(url: string, timeoutMs: number, externalSignal: AbortSignal): Promise<ResolvedAsset> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { "User-Agent": "pjsktools-android-asset-resolver", Accept: "image/*" }
      });
      if (!response.ok) {
        const ttl = response.status === 404 || response.status === 410 ? NOT_FOUND_TTL : TRANSIENT_TTL;
        this.negative.set(url, { status: response.status, expiresAt: Date.now() + ttl });
        throw new AssetResolveError(response.status, `Upstream asset unavailable: ${response.status}`);
      }
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      if (!contentType.toLowerCase().startsWith("image/")) {
        this.negative.set(url, { status: 415, expiresAt: Date.now() + TRANSIENT_TTL });
        throw new AssetResolveError(415, "Upstream response is not an image");
      }
      const body = Buffer.from(await response.arrayBuffer());
      const now = Date.now();
      const metadata: AssetMetadata = {
        url,
        contentType,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        size: body.byteLength,
        cachedAt: now,
        accessedAt: now
      };
      await this.writeCache(url, body, metadata);
      this.negative.delete(url);
      return { ...metadata, body, cacheHit: false };
    } catch (error) {
      if (!(error instanceof AssetResolveError) && !externalSignal.aborted) {
        this.negative.set(url, { status: 503, expiresAt: Date.now() + TRANSIENT_TTL });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal.removeEventListener("abort", abort);
    }
  }

  private key(url: string) {
    return createHash("sha256").update(url).digest("hex");
  }

  private async readCache(url: string): Promise<ResolvedAsset | undefined> {
    const key = this.key(url);
    try {
      const [body, raw] = await Promise.all([
        readFile(path.join(this.cacheDir, `${key}.bin`)),
        readFile(path.join(this.cacheDir, `${key}.json`), "utf8")
      ]);
      const metadata = JSON.parse(raw) as AssetMetadata;
      if (metadata.url !== url || metadata.size !== body.byteLength) return undefined;
      metadata.accessedAt = Date.now();
      void writeFile(path.join(this.cacheDir, `${key}.json`), JSON.stringify(metadata));
      return { ...metadata, body, cacheHit: true };
    } catch {
      return undefined;
    }
  }

  private async writeCache(url: string, body: Buffer, metadata: AssetMetadata) {
    await mkdir(this.cacheDir, { recursive: true });
    const key = this.key(url);
    await Promise.all([
      writeFile(path.join(this.cacheDir, `${key}.bin`), body),
      writeFile(path.join(this.cacheDir, `${key}.json`), JSON.stringify(metadata))
    ]);
    await this.trimCache();
  }

  private async trimCache() {
    const files = (await readdir(this.cacheDir)).filter((name) => name.endsWith(".json"));
    const entries = await Promise.all(files.map(async (name) => {
      try {
        const metadata = JSON.parse(await readFile(path.join(this.cacheDir, name), "utf8")) as AssetMetadata;
        return { key: name.slice(0, -5), metadata };
      } catch {
        return undefined;
      }
    }));
    const valid = entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    let total = valid.reduce((sum, entry) => sum + entry.metadata.size, 0);
    for (const entry of valid.sort((a, b) => a.metadata.accessedAt - b.metadata.accessedAt)) {
      if (total <= this.maxBytes) break;
      await Promise.all([
        rm(path.join(this.cacheDir, `${entry.key}.bin`), { force: true }),
        rm(path.join(this.cacheDir, `${entry.key}.json`), { force: true })
      ]);
      total -= entry.metadata.size;
    }
  }

  async cacheSize(): Promise<number> {
    try {
      const files = await readdir(this.cacheDir);
      const sizes = await Promise.all(files.filter((name) => name.endsWith(".bin")).map((name) => stat(path.join(this.cacheDir, name)).then((value) => value.size)));
      return sizes.reduce((sum, size) => sum + size, 0);
    } catch {
      return 0;
    }
  }
}

export class AssetResolveError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
