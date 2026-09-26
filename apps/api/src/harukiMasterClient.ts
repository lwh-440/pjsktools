import path from "node:path";
import { config, type RegionId } from "./config.js";

type HarukiMasterManifestFile = {
  name?: unknown;
  sha256?: unknown;
  contentHash?: unknown;
  size?: unknown;
};

type HarukiMasterManifest = {
  server?: unknown;
  dataVersion?: unknown;
  assetVersion?: unknown;
  generatedAt?: unknown;
  contentHash?: unknown;
  files?: unknown;
};

export type HarukiMasterFetchResult<T> = {
  value: T;
  sourceUrl: string;
  fileName: string;
  digest?: string;
  contentHash?: string;
  manifestDataVersion?: string;
};

export class HarukiMasterError extends Error {
  constructor(
    readonly kind: "not-configured" | "not-found" | "upstream-error" | "network-error" | "invalid-response",
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "HarukiMasterError";
  }
}

const manifestCache = new Map<RegionId, { value: HarukiMasterManifest; etag?: string }>();
const pendingManifests = new Map<RegionId, Promise<HarukiMasterManifest>>();
const musicMetasCache = new Map<RegionId, { value: unknown; etag?: string }>();
const pendingMusicMetas = new Map<RegionId, Promise<unknown>>();
const blobCache = new Map<string, Promise<unknown>>();

function blobCacheMaxEntries() {
  const configured = Number(process.env.HARUKI_MASTER_BLOB_CACHE_MAX ?? 16);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 16;
}

function normalizedBaseUrl() {
  return config.harukiMasterBaseUrl.trim().replace(/\/+$/, "");
}

const harukiMasterRepositories: Record<RegionId, string> = {
  jp: "haruki-sekai-master",
  en: "haruki-sekai-en-master",
  tw: "haruki-sekai-tc-master",
  kr: "haruki-sekai-kr-master",
  cn: "haruki-sekai-sc-master"
};

function rawHarukiUrl(region: RegionId, name: string) {
  return `${normalizedBaseUrl()}/Team-Haruki/${harukiMasterRepositories[region]}/main/master/${encodeURIComponent(name)}`;
}

function requestTimeoutMs() {
  const configured = Number(process.env.HARUKI_MASTER_TIMEOUT_MS ?? 15_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 15_000;
}

function requestHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "pjsktools-haruki-master"
  };
  if (config.harukiMasterToken.trim()) {
    headers.Authorization = `Bearer ${config.harukiMasterToken.trim()}`;
  }
  return headers;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchJsonResponse<T>(url: string, operation: string, extraHeaders?: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(url, { headers: { ...requestHeaders(), ...extraHeaders }, signal: controller.signal });
    if (response.status === 304) {
      return { notModified: true as const, value: undefined, etag: response.headers.get("etag") ?? undefined };
    }
    if (!response.ok) {
      const kind = response.status === 404 ? "not-found" : "upstream-error";
      throw new HarukiMasterError(kind, `${operation} failed at ${url}: HTTP ${response.status}`, response.status);
    }
    const text = await response.text();
    if (!text.trim()) return { notModified: false as const, value: [] as T, etag: response.headers.get("etag") ?? undefined };
    return { notModified: false as const, value: JSON.parse(text) as T, etag: response.headers.get("etag") ?? undefined };
  } catch (error) {
    if (error instanceof HarukiMasterError) throw error;
    throw new HarukiMasterError("network-error", `${operation} failed at ${url}: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string, operation: string, extraHeaders?: Record<string, string>): Promise<T> {
  const result = await fetchJsonResponse<T>(url, operation, extraHeaders);
  if (result.notModified) throw new HarukiMasterError("invalid-response", `${operation} returned 304 without a cached value`);
  return result.value;
}

export function normalizeHarukiMasterFileNames(filePaths: Array<string | undefined>) {
  return [...new Set(filePaths
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => {
      const normalized = value.trim().replace(/\\/g, "/").replace(/^master\//, "");
      const base = path.posix.basename(normalized);
      return base.endsWith(".json") ? base : `${base}.json`;
    })
    .filter(Boolean))];
}

export function isHarukiMusicMetasName(name: string) {
  const base = path.posix.basename(name, ".json").toLowerCase();
  return base === "musicmetas" || base === "musicmeta" || base === "music_metas" || base === "music_meta";
}

export function harukiMasterFileUrl(region: RegionId, name: string) {
  const base = normalizedBaseUrl();
  if (!base) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  return base === "https://raw.githubusercontent.com"
    ? rawHarukiUrl(region, name)
    : `${base}/v1/master/${region}/files/${encodeURIComponent(name)}`;
}

export function harukiMasterBlobUrl(region: RegionId, sha256: string) {
  const base = normalizedBaseUrl();
  if (!base) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  return `${base}/v1/master/${region}/blob/${encodeURIComponent(sha256)}`;
}

export function harukiMusicMetasUrl(region: RegionId) {
  const base = normalizedBaseUrl();
  if (!base) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  return base === "https://raw.githubusercontent.com"
    ? rawHarukiUrl(region, "music_metas.json")
    : `${base}/v1/metas/${region}/music_metas.json`;
}

export function harukiMasterConfigured() {
  return Boolean(normalizedBaseUrl());
}

async function fetchManifest(region: RegionId): Promise<HarukiMasterManifest> {
  if (!harukiMasterConfigured()) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  const cached = manifestCache.get(region);
  const pending = pendingManifests.get(region);
  if (pending) return pending;
  const headers = cached?.etag ? { "If-None-Match": cached.etag } : undefined;
  const load = fetchJsonResponse<HarukiMasterManifest>(`${normalizedBaseUrl()}/v1/master/${region}/current`, "master manifest", headers)
    .then((result) => {
      if (result.notModified) {
        if (!cached) throw new HarukiMasterError("invalid-response", "master manifest returned 304 without a cached value");
        return cached.value;
      }
      manifestCache.set(region, { value: result.value, etag: result.etag });
      return result.value;
    })
    .finally(() => pendingManifests.delete(region));
  pendingManifests.set(region, load);
  return load;
}

function manifestFile(manifest: HarukiMasterManifest, name: string) {
  if (!Array.isArray(manifest.files)) return undefined;
  return manifest.files.find((entry): entry is HarukiMasterManifestFile => {
    if (!entry || typeof entry !== "object") return false;
    return String((entry as HarukiMasterManifestFile).name ?? "") === name;
  });
}

async function fetchNamedFile<T>(region: RegionId, name: string, manifest?: HarukiMasterManifest): Promise<HarukiMasterFetchResult<T>> {
  const manifestEntry = manifest ? manifestFile(manifest, name) : undefined;
  const manifestHash = typeof manifestEntry?.sha256 === "string"
    ? manifestEntry.sha256
    : typeof manifestEntry?.contentHash === "string" ? manifestEntry.contentHash : undefined;
  const digest = manifestHash && /^[a-f0-9]{64}$/i.test(manifestHash) ? manifestHash.toLowerCase() : undefined;
  if (digest) {
    const sourceUrl = harukiMasterBlobUrl(region, digest);
    let value: T;
    const pending = blobCache.get(digest);
    const load = pending ?? fetchJson<T>(sourceUrl, `master blob ${name}`);
    if (!pending) {
      while (blobCache.size >= blobCacheMaxEntries()) blobCache.delete(blobCache.keys().next().value as string);
      blobCache.set(digest, load as Promise<unknown>);
    }
    try { value = await load as T; }
    catch (error) { blobCache.delete(digest); if (!(error instanceof HarukiMasterError && error.kind === "not-found")) throw error; return fetchNamedFileWithoutDigest<T>(region, name, manifest, digest); }
    return {
      value,
      sourceUrl,
      fileName: name,
      digest,
      contentHash: typeof manifest?.contentHash === "string" ? manifest.contentHash : undefined,
      manifestDataVersion: typeof manifest?.dataVersion === "string" ? manifest.dataVersion : undefined
    };
  }
  return fetchNamedFileWithoutDigest<T>(region, name, manifest);
}

async function fetchNamedFileWithoutDigest<T>(region: RegionId, name: string, manifest: HarukiMasterManifest | undefined, contentHash?: string): Promise<HarukiMasterFetchResult<T>> {
  const sourceUrl = harukiMasterFileUrl(region, name);
  return {
    value: await fetchJson<T>(sourceUrl, `master file ${name}`),
    sourceUrl,
    fileName: name,
    ...(contentHash ? { digest: contentHash } : {}),
    ...(typeof manifest?.contentHash === "string" ? { contentHash: manifest.contentHash } : {}),
    manifestDataVersion: typeof manifest?.dataVersion === "string" ? manifest.dataVersion : undefined
  };
}

export async function fetchHarukiMasterJson<T>(region: RegionId, filePaths: Array<string | undefined>): Promise<HarukiMasterFetchResult<T>> {
  if (!harukiMasterConfigured()) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  const names = normalizeHarukiMasterFileNames(filePaths);
  if (!names.length) throw new HarukiMasterError("not-found", "No master file candidates were supplied");

  let manifest: HarukiMasterManifest | undefined;
  let manifestError: unknown;
  try {
    manifest = await fetchManifest(region);
  } catch (error) {
    manifestError = error;
  }

  let lastError: unknown;
  for (const name of names) {
    if (isHarukiMusicMetasName(name) && normalizedBaseUrl() !== "https://raw.githubusercontent.com") {
      const sourceUrl = harukiMusicMetasUrl(region);
      try {
        const cached = musicMetasCache.get(region);
        const pending = pendingMusicMetas.get(region);
        const valuePromise = pending ?? (async () => {
          const result = await fetchJsonResponse<T>(sourceUrl, `music metas ${name}`, cached?.etag ? { "If-None-Match": cached.etag } : undefined);
          if (result.notModified) {
            if (!cached) throw new HarukiMasterError("invalid-response", `music metas ${name} returned 304 without a cached value`);
            return cached.value as T;
          }
          musicMetasCache.set(region, { value: result.value, etag: result.etag });
          return result.value;
        })();
        if (!pending) pendingMusicMetas.set(region, valuePromise as Promise<unknown>);
        let value: T;
        try { value = await valuePromise as T; } finally { if (!pending) pendingMusicMetas.delete(region); }
        return {
          value,
          sourceUrl,
          fileName: name,
          ...(typeof manifest?.contentHash === "string" ? { contentHash: manifest.contentHash } : {}),
          manifestDataVersion: typeof manifest?.dataVersion === "string" ? manifest.dataVersion : undefined
        };
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    try {
      return await fetchNamedFile<T>(region, name, manifest);
    } catch (error) {
      lastError = error;
      if (error instanceof HarukiMasterError && error.kind === "network-error") break;
    }
  }
  if (lastError instanceof HarukiMasterError) throw lastError;
  if (manifestError instanceof HarukiMasterError) throw manifestError;
  throw new HarukiMasterError(
    "not-found",
    `Haruki master has none of these files for ${region}: ${names.join(", ")}${manifestError ? `; manifest=${errorMessage(manifestError)}` : ""}`
  );
}

export function resetHarukiMasterClientStateForTests() {
  manifestCache.clear();
  pendingManifests.clear();
  musicMetasCache.clear();
  pendingMusicMetas.clear();
  blobCache.clear();
}
