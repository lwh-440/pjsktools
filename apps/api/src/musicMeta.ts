import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { RegionId } from "./config.js";
import type { MusicMeta } from "./types.js";

const defaultHarukiMasterBase = "https://sekai-api-cdn.haruki.seiunx.com";
const refreshMs = 24 * 60 * 60 * 1000;
const memoryCache = new Map<RegionId, { loadedAt: number; rows: MusicMeta[]; source: string }>();

type RawMusicMeta = {
  music_id: number;
  difficulty: string;
  music_time: number;
  event_rate: number;
  base_score: number;
  base_score_auto: number;
  skill_score_solo: number[];
  skill_score_auto: number[];
  skill_score_multi: number[];
  fever_score: number;
  fever_end_time: number;
  tap_count: number;
};

type CachedMusicMeta = {
  source: string;
  fetchedAt: number;
  rows: RawMusicMeta[];
};

function apiRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? cwd : path.join(cwd, "apps", "api");
}

function cachePath(region: RegionId) {
  return path.join(apiRoot(), "data", "music-meta", `music_metas.${region}.json`);
}

function normalize(rows: RawMusicMeta[], source: string): MusicMeta[] {
  return rows.map((row) => ({
    musicId: String(row.music_id),
    difficulty: row.difficulty,
    musicTime: row.music_time,
    eventRate: row.event_rate,
    baseScore: row.base_score,
    baseScoreAuto: row.base_score_auto,
    skillScoreSolo: row.skill_score_solo,
    skillScoreAuto: row.skill_score_auto,
    skillScoreMulti: row.skill_score_multi,
    feverScore: row.fever_score,
    feverEndTime: row.fever_end_time,
    tapCount: row.tap_count,
    source
  }));
}

async function readCache(region: RegionId) {
  try {
    const cached = JSON.parse(await readFile(cachePath(region), "utf-8")) as CachedMusicMeta;
    if (cached.source !== musicMetaSource(region) || !Number.isFinite(cached.fetchedAt) || !Array.isArray(cached.rows)) return undefined;
    return { rows: normalize(cached.rows, cached.source), fetchedAt: cached.fetchedAt };
  } catch {
    return undefined;
  }
}

async function fetchRemote(region: RegionId) {
  const source = musicMetaSource(region);
  const controller = new AbortController();
  const timeoutMs = process.env.PJSKTOOLS_FAST_MASTER_REFRESH === "true" ? 1_500 : 12_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source, { signal: controller.signal, headers: { "User-Agent": "pjsktools-live-calculator" } });
    if (!response.ok) throw new Error(`Music meta fetch failed: ${response.status}`);
    const rows = JSON.parse(await response.text()) as RawMusicMeta[];
    if (!Array.isArray(rows)) throw new Error("Music meta response is not an array");
    const cached: CachedMusicMeta = { source, fetchedAt: Date.now(), rows };
    await mkdir(path.dirname(cachePath(region)), { recursive: true });
    await writeFile(cachePath(region), JSON.stringify(cached), "utf-8");
    return { rows: normalize(rows, source), source };
  } finally {
    clearTimeout(timer);
  }
}

export function musicMetaSource(region: RegionId = "jp") {
  const base = (process.env.HARUKI_MASTER_BASE_URL?.trim() || config.harukiMasterBaseUrl.trim() || defaultHarukiMasterBase).replace(/\/+$/, "");
  return `${base}/v1/metas/${region}/music_metas.json`;
}

export async function getMusicMetas(region: RegionId = "jp") {
  const memory = memoryCache.get(region);
  if (memory && Date.now() - memory.loadedAt < refreshMs) return memory;
  const cached = await readCache(region);
  if (cached && Date.now() - cached.fetchedAt < refreshMs) {
    const result = { loadedAt: Date.now(), rows: cached.rows, source: musicMetaSource(region) };
    memoryCache.set(region, result);
    return result;
  }
  try {
    const remote = await fetchRemote(region);
    const result = { loadedAt: Date.now(), rows: remote.rows, source: remote.source };
    memoryCache.set(region, result);
    return result;
  } catch (error) {
    if (cached) {
      const result = { loadedAt: cached.fetchedAt, rows: cached.rows, source: musicMetaSource(region) };
      memoryCache.set(region, result);
      return result;
    }
    throw error;
  }
}

export function resetMusicMetaMemoryCacheForTest() {
  memoryCache.clear();
}

export async function getMusicMeta(region: RegionId, musicId?: string, difficulty?: string) {
  if (!musicId || !difficulty) return { meta: undefined, sourceHealth: { status: "missing-data", missingFields: ["musicId", "difficulty"] } };
  try {
    const cache = await getMusicMetas(region);
    const meta = cache.rows.find((row) => row.musicId === String(musicId) && row.difficulty.toLowerCase() === difficulty.toLowerCase());
    return {
      meta,
      sourceHealth: {
        status: meta ? "matched" : "missing-data",
        source: cache.source,
        rowCount: cache.rows.length,
        missingFields: meta ? [] : [`musicMeta:${musicId}:${difficulty}`]
      }
    };
  } catch (error) {
    return {
      meta: undefined,
      sourceHealth: {
        status: "missing-data",
        source: musicMetaSource(region),
        missingFields: ["music_metas.json"],
        unavailableReason: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
