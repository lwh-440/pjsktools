import path from "node:path";
import { config, type RegionId } from "./config.js";

type HarukiMasterManifestFile = {
  name?: unknown;
  sha256?: unknown;
  size?: unknown;
};

type HarukiMasterManifest = {
  server?: unknown;
  dataVersion?: unknown;
  assetVersion?: unknown;
  generatedAt?: unknown;
  files?: unknown;
};

export type HarukiMasterFetchResult<T> = {
  value: T;
  sourceUrl: string;
  fileName: string;
  digest?: string;
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

const manifestCache = new Map<RegionId, { expiresAt: number; value: HarukiMasterManifest }>();
const pendingManifests = new Map<RegionId, Promise<HarukiMasterManifest>>();

function normalizedBaseUrl() {
  return config.harukiMasterBaseUrl.trim().replace(/\/+$/, "");
}

function requestTimeoutMs() {
  const configured = Number(process.env.HARUKI_MASTER_TIMEOUT_MS ?? 15_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 15_000;
}

function manifestTtlMs() {
  const configured = Number(process.env.HARUKI_MASTER_MANIFEST_TTL_MS ?? 5 * 60_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 5 * 60_000;
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

async function fetchJson<T>(url: string, operation: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(url, { headers: requestHeaders(), signal: controller.signal });
    if (!response.ok) {
      const kind = response.status === 404 ? "not-found" : "upstream-error";
      throw new HarukiMasterError(kind, `${operation} failed at ${url}: HTTP ${response.status}`, response.status);
    }
    const text = await response.text();
    if (!text.trim()) return [] as T;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof HarukiMasterError) throw error;
    throw new HarukiMasterError("network-error", `${operation} failed at ${url}: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
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
  return base === "musicmetas" || base === "musicmeta";
}

export function harukiMasterFileUrl(region: RegionId, name: string) {
  const base = normalizedBaseUrl();
  if (!base) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  return `${base}/v1/master/${region}/files/${encodeURIComponent(name)}`;
}

export function harukiMasterBlobUrl(region: RegionId, sha256: string) {
  const base = normalizedBaseUrl();
  if (!base) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  return `${base}/v1/master/${region}/blob/${encodeURIComponent(sha256)}`;
}

export function harukiMusicMetasUrl(region: RegionId) {
  const base = normalizedBaseUrl();
  if (!base) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  return `${base}/v1/metas/${region}/music_metas.json`;
}

export function harukiMasterConfigured() {
  return Boolean(normalizedBaseUrl());
}

async function fetchManifest(region: RegionId): Promise<HarukiMasterManifest> {
  if (!harukiMasterConfigured()) throw new HarukiMasterError("not-configured", "HARUKI_MASTER_BASE_URL is not configured");
  const cached = manifestCache.get(region);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingManifests.get(region);
  if (pending) return pending;
  const load = fetchJson<HarukiMasterManifest>(`${normalizedBaseUrl()}/v1/master/${region}/current`, "master manifest")
    .then((manifest) => {
      manifestCache.set(region, { expiresAt: Date.now() + manifestTtlMs(), value: manifest });
      return manifest;
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
  const digest = typeof manifestEntry?.sha256 === "string" && /^[a-f0-9]{64}$/i.test(manifestEntry.sha256)
    ? manifestEntry.sha256.toLowerCase()
    : undefined;
  if (digest) {
    const sourceUrl = harukiMasterBlobUrl(region, digest);
    return {
      value: await fetchJson<T>(sourceUrl, `master blob ${name}`),
      sourceUrl,
      fileName: name,
      digest,
      manifestDataVersion: typeof manifest?.dataVersion === "string" ? manifest.dataVersion : undefined
    };
  }
  const sourceUrl = harukiMasterFileUrl(region, name);
  return {
    value: await fetchJson<T>(sourceUrl, `master file ${name}`),
    sourceUrl,
    fileName: name,
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
    if (isHarukiMusicMetasName(name)) {
      const sourceUrl = harukiMusicMetasUrl(region);
      try {
        return {
          value: await fetchJson<T>(sourceUrl, `music metas ${name}`),
          sourceUrl,
          fileName: name,
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
}
