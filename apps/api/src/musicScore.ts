import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { RegionId } from "./config.js";
import { buildHarukiMusicScoreUrl } from "./chartRenderer.js";
import { musicScoreParserVersion, parseSusMusicScore, type MusicScore } from "./musicScoreParser.js";
export { musicScoreParserVersion, parseSusMusicScore, type MusicScore, type MusicScoreNote, type MusicScoreNoteBase } from "./musicScoreParser.js";

export type MusicScoreTrace = {
  status: "missing-data" | "cache-hit" | "not-released" | "unsupported-chart-format" | "matched" | "source-unavailable";
  source?: string;
  sourceUrl?: string;
  cachedAt?: string;
  warnings?: string[];
  missingFields: string[];
  unsupportedReason?: string;
  unavailableReason?: string;
};
export type MusicScoreResult = { score?: MusicScore; trace: MusicScoreTrace };

const harukiAssetBase = "https://sekai-assets.haruki.seiunx.com";
const fastRefresh = process.env.PJSKTOOLS_FAST_MASTER_REFRESH === "true";

function apiRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? cwd : path.join(cwd, "apps", "api");
}

function padMusicId(musicId: string | number) {
  return String(musicId).padStart(4, "0");
}

function normalizeDifficulty(difficulty: string) {
  return difficulty.trim().toLowerCase();
}

export function musicScoreUrl(region: RegionId, musicId: string, difficulty: string) {
  return buildHarukiMusicScoreUrl(region, musicId, difficulty)
    ?? `${harukiAssetBase}/${region}-assets/startapp/music/music_score/${padMusicId(musicId)}_01/${normalizeDifficulty(difficulty)}.txt?v=2`;
}

let musicScoreCacheRootForTest: string | undefined;
const pendingMusicScores = new Map<string, Promise<MusicScoreResult>>();

function cachePath(region: RegionId, musicId: string, difficulty: string) {
  return path.join(musicScoreCacheRootForTest ?? apiRoot(), "data", "music-score", region, `${padMusicId(musicId)}_${normalizeDifficulty(difficulty)}.json`);
}

function musicScoreKey(region: RegionId, musicId: string, difficulty: string) {
  return `${region}:${padMusicId(musicId)}:${normalizeDifficulty(difficulty)}`;
}

export function setMusicScoreCacheRootForTest(directory?: string) {
  musicScoreCacheRootForTest = directory;
  pendingMusicScores.clear();
}

export function resetMusicScoreStateForTest() {
  musicScoreCacheRootForTest = undefined;
  pendingMusicScores.clear();
}

async function atomicWrite(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function fetchSus(region: RegionId, musicId: string, difficulty: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fastRefresh ? 1_500 : 12_000);
  try {
    const url = musicScoreUrl(region, musicId, difficulty);
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "pjsktools-live-exact" } });
    if (response.status === 404) return { status: "not-released" as const, url, text: undefined };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { status: "available" as const, url, text: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadMusicScore(region: RegionId, musicId: string, difficulty: string): Promise<MusicScoreResult> {
  const filePath = cachePath(region, musicId, difficulty);
  try {
    const cached = JSON.parse(await readFile(filePath, "utf-8")) as { score: MusicScore; warnings?: string[]; sourceUrl?: string; cachedAt?: string; parserVersion?: string };
    if (cached.sourceUrl === musicScoreUrl(region, musicId, difficulty) && cached.parserVersion === musicScoreParserVersion) {
      return {
        score: cached.score,
        trace: { status: "cache-hit", source: filePath, sourceUrl: cached.sourceUrl, cachedAt: cached.cachedAt, warnings: cached.warnings ?? [], missingFields: [] }
      };
    }
  } catch {
    // fetch below
  }
  try {
    const remote = await fetchSus(region, musicId, difficulty);
    if (!remote.text) {
      return { score: undefined, trace: { status: "not-released", source: remote.url, missingFields: [`musicScore:${region}:${musicId}:${difficulty}`] } };
    }
    const parsed = parseSusMusicScore(remote.text);
    if (!parsed.score) {
      return { score: undefined, trace: { status: "unsupported-chart-format", source: remote.url, missingFields: ["parsable musicScore"], unsupportedReason: parsed.unsupportedReason, warnings: parsed.warnings } };
    }
    const cachedAt = new Date().toISOString();
    const warnings = [...parsed.warnings];
    try {
      await atomicWrite(filePath, { score: parsed.score, warnings, sourceUrl: remote.url, parserVersion: musicScoreParserVersion, cachedAt });
    } catch (error) {
      warnings.push(`music score cache write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { score: parsed.score, trace: { status: "matched", source: remote.url, cachedAt, warnings, missingFields: [] } };
  } catch (error) {
    return {
      score: undefined,
      trace: {
        status: "source-unavailable",
        source: musicScoreUrl(region, musicId, difficulty),
        missingFields: [`musicScore:${region}:${musicId}:${difficulty}`],
        unavailableReason: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function getMusicScore(region: RegionId, musicId?: string, difficulty?: string): Promise<MusicScoreResult> {
  if (!musicId || !difficulty) {
    return { score: undefined, trace: { status: "missing-data", missingFields: ["musicId", "difficulty"] } };
  }
  const key = musicScoreKey(region, musicId, difficulty);
  const pending = pendingMusicScores.get(key);
  if (pending) return pending;
  const load = loadMusicScore(region, musicId, difficulty).finally(() => pendingMusicScores.delete(key));
  pendingMusicScores.set(key, load);
  return load;
}
