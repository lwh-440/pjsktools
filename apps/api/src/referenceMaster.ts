import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RegionId } from "./config.js";

export const formulaMasterKeys = [
  "cards",
  "skills",
  "cardEpisodes",
  "masterLessons",
  "areas",
  "areaItems",
  "areaItemLevels",
  "shopItems",
  "ingameNotes",
  "ingameCombos",
  "characterRanks",
  "cardMysekaiCanvasBonuses",
  "honors",
  "mysekaiGates",
  "mysekaiGateLevels",
  "eventMysekaiFixtureGameCharacterPerformanceBonusLimits",
  "eventCards",
  "eventDeckBonuses",
  "eventRarityBonusRates",
  "gameCharacters",
  "eventSkillScoreUpLimits",
  "eventHonorBonuses",
  "eventCardBonusLimits",
  "worldBlooms",
  "worldBloomDifferentAttributeBonuses",
  "worldBloomSupportDeckBonuses",
  "worldBloomSupportDeckUnitEventLimitedBonuses"
] as const;

export type FormulaMasterKey = (typeof formulaMasterKeys)[number];
export type ReferenceCollectionStatus = "available" | "available-empty" | "not-released" | "source-unavailable" | "cache-stale";

type ReferenceCollectionHealth = {
  status: ReferenceCollectionStatus;
  count: number;
  sourceUrl: string;
  syncedAt?: string;
  error?: string;
};

type ReferenceManifest = {
  schemaVersion: 1;
  region: RegionId;
  syncedAt: string;
  collections: Record<FormulaMasterKey, ReferenceCollectionHealth>;
};

const memory = new Map<string, unknown[]>();
const manifestMemory = new Map<RegionId, ReferenceManifest>();
const metadataBase = "https://metadata.exmeaning.com";
const fastRefresh = process.env.PJSKTOOLS_FAST_MASTER_REFRESH === "true";

function apiRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? cwd : path.join(cwd, "apps", "api");
}

function runtimeRoot() {
  return path.join(apiRoot(), "data", "reference-cache");
}

function legacyRoot() {
  return path.join(apiRoot(), "data", "reference-master");
}

function runtimePath(region: RegionId, key: FormulaMasterKey) {
  return path.join(runtimeRoot(), region, `${key}.json`);
}

function legacyPath(region: RegionId, key: FormulaMasterKey) {
  return path.join(legacyRoot(), region, `${key}.json`);
}

function manifestPath(region: RegionId) {
  return path.join(runtimeRoot(), region, "manifest.json");
}

function sourceUrl(region: RegionId, key: FormulaMasterKey) {
  return `${metadataBase}/${region}/master/${key}.json`;
}

async function readArray(filePath: string) {
  const parsed = JSON.parse(await readFile(filePath, "utf-8"));
  if (!Array.isArray(parsed)) throw new Error(`Reference master is not an array: ${filePath}`);
  return parsed as unknown[];
}

async function readCachedArray(region: RegionId, key: FormulaMasterKey) {
  try {
    return { rows: await readArray(runtimePath(region, key)), source: "runtime-cache" as const };
  } catch {
    try {
      return { rows: await readArray(legacyPath(region, key)), source: "legacy-cache" as const };
    } catch {
      return undefined;
    }
  }
}

async function atomicWrite(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await rename(temporary, filePath);
}

async function readManifest(region: RegionId) {
  const cached = manifestMemory.get(region);
  if (cached) return cached;
  try {
    const parsed = JSON.parse(await readFile(manifestPath(region), "utf-8")) as ReferenceManifest;
    manifestMemory.set(region, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function fetchOptions() {
  return fastRefresh ? { attempts: 1, timeoutMs: 1_500 } : { attempts: 3, timeoutMs: 12_000 };
}

async function fetchReference(region: RegionId, key: FormulaMasterKey) {
  const options = fetchOptions();
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(sourceUrl(region, key), { signal: controller.signal, headers: { "User-Agent": "pjsktools-reference-sync" } });
      if (response.status === 404) return { status: "not-released" as const, rows: [] as unknown[] };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = JSON.parse(await response.text());
      if (!Array.isArray(rows)) throw new Error("response is not an array");
      return { status: rows.length ? "available" as const : "available-empty" as const, rows };
    } catch (error) {
      lastError = error;
      if (attempt < options.attempts && !fastRefresh) await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  return { status: "source-unavailable" as const, rows: [] as unknown[], error: lastError instanceof Error ? lastError.message : String(lastError) };
}

export async function syncReferenceMasterRegion(region: RegionId) {
  const syncedAt = new Date().toISOString();
  const previousManifest = await readManifest(region);
  const collections = {} as Record<FormulaMasterKey, ReferenceCollectionHealth>;
  const results = await Promise.all(formulaMasterKeys.map(async (key) => [key, await fetchReference(region, key)] as const));
  for (const [key, result] of results) {
    if (result.status === "available" || result.status === "available-empty") {
      await atomicWrite(runtimePath(region, key), result.rows);
      memory.set(`${region}:${key}`, result.rows);
      collections[key] = { status: result.status, count: result.rows.length, sourceUrl: sourceUrl(region, key), syncedAt };
      continue;
    }
    const cached = await readCachedArray(region, key);
    if (cached) {
      memory.set(`${region}:${key}`, cached.rows);
      collections[key] = {
        status: "cache-stale",
        count: cached.rows.length,
        sourceUrl: sourceUrl(region, key),
        syncedAt: previousManifest?.collections[key]?.syncedAt,
        error: result.status === "not-released" ? "upstream returned 404; retained region-local cache" : result.error
      };
    } else {
      collections[key] = { status: result.status, count: 0, sourceUrl: sourceUrl(region, key), error: result.error };
    }
  }
  const manifest: ReferenceManifest = { schemaVersion: 1, region, syncedAt, collections };
  await atomicWrite(manifestPath(region), manifest);
  manifestMemory.set(region, manifest);
  return manifest;
}

export async function getReferenceMaster<T extends Record<string, unknown>>(region: RegionId, key: FormulaMasterKey): Promise<T[]> {
  const cacheKey = `${region}:${key}`;
  const cached = memory.get(cacheKey);
  if (cached) return cached as T[];
  const local = await readCachedArray(region, key);
  if (!local) return [];
  memory.set(cacheKey, local.rows);
  return local.rows as T[];
}

export function isFormulaMasterKey(value: string): value is FormulaMasterKey {
  return formulaMasterKeys.includes(value as FormulaMasterKey);
}

export async function getReferenceMasterHealth(region: RegionId) {
  const manifest = await readManifest(region);
  const entries = await Promise.all(formulaMasterKeys.map(async (key) => {
    const manifestCount = manifest?.collections[key]?.count;
    return [key, manifestCount == null ? (await getReferenceMaster(region, key)).length : manifestCount] as const;
  }));
  const counts = Object.fromEntries(entries) as Record<FormulaMasterKey, number>;
  const collections = Object.fromEntries(formulaMasterKeys.map((key) => [key, manifest?.collections[key] ?? {
    status: counts[key] > 0 ? "cache-stale" : "source-unavailable",
    count: counts[key],
    sourceUrl: sourceUrl(region, key),
    error: manifest ? undefined : "runtime manifest not generated"
  }])) as Record<FormulaMasterKey, ReferenceCollectionHealth>;
  const missingFields = formulaMasterKeys.filter((key) => counts[key] === 0 && collections[key].status !== "available-empty");
  const unavailableCollections = formulaMasterKeys.filter((key) => ["not-released", "source-unavailable"].includes(collections[key].status));
  const staleCollections = formulaMasterKeys.filter((key) => collections[key].status === "cache-stale");
  return {
    status: missingFields.length ? "missing-data" : staleCollections.length ? "cache-stale" : "matched",
    source: runtimeRoot(),
    syncedAt: manifest?.syncedAt,
    counts,
    collections,
    missingFields,
    unavailableCollections,
    staleCollections
  };
}
