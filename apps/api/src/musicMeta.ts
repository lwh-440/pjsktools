import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MusicMeta } from "./types.js";

const sourceUrl = "https://moe.exmeaning.com/data/music_meta/music_metas.json";
const refreshMs = 24 * 60 * 60 * 1000;
let memoryCache: { loadedAt: number; rows: MusicMeta[]; source: string } | undefined;

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

function apiRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? cwd : path.join(cwd, "apps", "api");
}

function cachePath() {
  return path.join(apiRoot(), "data", "music-meta", "music_metas.json");
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

async function readCache() {
  try {
    const raw = JSON.parse(await readFile(cachePath(), "utf-8")) as RawMusicMeta[];
    return normalize(raw, cachePath());
  } catch {
    return undefined;
  }
}

async function fetchRemote() {
  const controller = new AbortController();
  const timeoutMs = process.env.PJSKTOOLS_FAST_MASTER_REFRESH === "true" ? 1_500 : 12_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(sourceUrl, { signal: controller.signal, headers: { "User-Agent": "pjsktools-live-calculator" } });
    if (!response.ok) throw new Error(`Music meta fetch failed: ${response.status}`);
    const text = await response.text();
    const raw = JSON.parse(text) as RawMusicMeta[];
    await mkdir(path.dirname(cachePath()), { recursive: true });
    await writeFile(cachePath(), text, "utf-8");
    return normalize(raw, sourceUrl);
  } finally {
    clearTimeout(timer);
  }
}

export async function getMusicMetas() {
  if (memoryCache && Date.now() - memoryCache.loadedAt < refreshMs) return memoryCache;
  const cached = await readCache();
  if (cached?.length) {
    memoryCache = { loadedAt: Date.now(), rows: cached, source: cachePath() };
    return memoryCache;
  }
  const rows = await fetchRemote();
  memoryCache = { loadedAt: Date.now(), rows, source: sourceUrl };
  return memoryCache;
}

export async function getMusicMeta(musicId?: string, difficulty?: string) {
  if (!musicId || !difficulty) return { meta: undefined, sourceHealth: { status: "missing-data", missingFields: ["musicId", "difficulty"] } };
  try {
    const cache = await getMusicMetas();
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
        source: sourceUrl,
        missingFields: ["music_metas.json"],
        unavailableReason: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export const musicMetaSource = sourceUrl;
