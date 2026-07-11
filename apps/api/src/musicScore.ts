import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RegionId } from "./config.js";

export type MusicScoreNoteBase = { time: number };
export type MusicScoreNote = MusicScoreNoteBase & { type: number; longId?: number };
export type MusicScore = { notes: MusicScoreNote[]; skills: MusicScoreNoteBase[]; fevers: MusicScoreNoteBase[] };

const regionAssetDir: Record<RegionId, string> = {
  jp: "sekai-jp-assets",
  en: "sekai-en-assets",
  tw: "sekai-tc-assets",
  kr: "sekai-kr-assets",
  cn: "sekai-cn-assets"
};
const storageBase = "https://storage.exmeaning.com";
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
  return `${storageBase}/${regionAssetDir[region]}/music/music_score/${padMusicId(musicId)}_01/${normalizeDifficulty(difficulty)}.txt`;
}

function cachePath(region: RegionId, musicId: string, difficulty: string) {
  return path.join(apiRoot(), "data", "music-score", region, `${padMusicId(musicId)}_${normalizeDifficulty(difficulty)}.json`);
}

async function atomicWrite(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await rename(temporary, filePath);
}

function parseBase36Pair(value: string) {
  return Number.parseInt(value, 36);
}

function channelToNoteType(channel: string) {
  const numeric = Number.parseInt(channel, 10);
  if (!Number.isFinite(numeric)) return undefined;
  if (numeric >= 10 && numeric <= 19) return 1;
  if (numeric >= 20 && numeric <= 29) return 2;
  if (numeric >= 30 && numeric <= 39) return 3;
  if (numeric >= 40 && numeric <= 49) return 4;
  if (numeric >= 50 && numeric <= 59) return 5;
  return undefined;
}

function isSkillChannel(channel: string) {
  return ["08", "8"].includes(channel) || channel === "15";
}

function isFeverChannel(channel: string) {
  return channel === "09" || channel === "9" || channel === "16";
}

export function parseSusMusicScore(susText: string): { score?: MusicScore; warnings: string[]; unsupportedReason?: string } {
  const warnings: string[] = [];
  const bpms = new Map<string, number>();
  let baseBpm = 120;
  const measureLengths = new Map<number, number>();
  const events: Array<{ measure: number; channel: string; index: number; slots: number; value: string }> = [];

  for (const rawLine of susText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("#") || line.startsWith("#REQUEST")) continue;
    const bpmDefinition = line.match(/^#BPM([0-9A-Z]{2})\s+([0-9.]+)/i);
    if (bpmDefinition) {
      bpms.set(bpmDefinition[1].toUpperCase(), Number(bpmDefinition[2]));
      continue;
    }
    const baseBpmDefinition = line.match(/^#BPM\s+([0-9.]+)/i);
    if (baseBpmDefinition) {
      const parsed = Number(baseBpmDefinition[1]);
      if (Number.isFinite(parsed) && parsed > 0) baseBpm = parsed;
      continue;
    }
    const measureLength = line.match(/^#([0-9]{3})02:\s*([0-9.]+)/i);
    if (measureLength) {
      const ratio = Number(measureLength[2]);
      if (Number.isFinite(ratio) && ratio > 0) measureLengths.set(Number(measureLength[1]), ratio);
      continue;
    }
    const event = line.match(/^#([0-9]{3})([0-9A-Z]{2}):\s*([0-9A-Z]+)/i);
    if (!event) continue;
    const measure = Number(event[1]);
    const channel = event[2].toUpperCase();
    const payload = event[3].trim().toUpperCase();
    const slots = Math.floor(payload.length / 2);
    for (let index = 0; index < slots; index += 1) {
      const value = payload.slice(index * 2, index * 2 + 2);
      if (value !== "00") events.push({ measure, channel, index, slots, value });
    }
  }

  if (!events.length) return { warnings, unsupportedReason: "SUS contains no parsable timed events" };
  const measures = [...new Set(events.map((event) => event.measure))].sort((a, b) => a - b);
  const measureStart = new Map<number, number>();
  let currentSeconds = 0;
  const lastMeasure = measures[measures.length - 1] ?? 0;
  for (let measure = 0; measure <= lastMeasure; measure += 1) {
    measureStart.set(measure, currentSeconds);
    currentSeconds += 4 * (measureLengths.get(measure) ?? 1) * 60 / baseBpm;
  }

  const timeFor = (event: { measure: number; index: number; slots: number }) =>
    (measureStart.get(event.measure) ?? 0) + (event.index / event.slots) * (4 * (measureLengths.get(event.measure) ?? 1) * 60 / baseBpm);

  const notes: MusicScoreNote[] = [];
  const skills: MusicScoreNoteBase[] = [];
  const fevers: MusicScoreNoteBase[] = [];
  for (const event of events) {
    if (event.channel === "03") {
      const bpm = bpms.get(event.value) ?? parseBase36Pair(event.value);
      if (Number.isFinite(bpm) && bpm > 0 && Math.abs(bpm - baseBpm) > 0.001) warnings.push("mid-chart BPM changes are not applied by this reference parser");
      continue;
    }
    const time = timeFor(event);
    if (isSkillChannel(event.channel)) {
      skills.push({ time });
    } else if (isFeverChannel(event.channel)) {
      fevers.push({ time });
    } else {
      const noteType = channelToNoteType(event.channel);
      if (noteType != null) {
        notes.push({ time, type: noteType, longId: event.value === "00" ? undefined : parseBase36Pair(event.value) });
      }
    }
  }
  notes.sort((a, b) => a.time - b.time);
  skills.sort((a, b) => a.time - b.time);
  fevers.sort((a, b) => a.time - b.time);
  if (!notes.length) return { warnings, unsupportedReason: "SUS contains no parsable playable notes" };
  if (skills.length < 6) warnings.push(`SUS contains ${skills.length} skill markers; exact score will use available markers only`);
  return { score: { notes, skills, fevers }, warnings };
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

export async function getMusicScore(region: RegionId, musicId?: string, difficulty?: string) {
  if (!musicId || !difficulty) {
    return { score: undefined, trace: { status: "missing-data", missingFields: ["musicId", "difficulty"] } };
  }
  const filePath = cachePath(region, musicId, difficulty);
  try {
    const cached = JSON.parse(await readFile(filePath, "utf-8")) as { score: MusicScore; warnings?: string[]; sourceUrl?: string; cachedAt?: string };
    return {
      score: cached.score,
      trace: { status: "cache-stale", source: filePath, sourceUrl: cached.sourceUrl, cachedAt: cached.cachedAt, warnings: cached.warnings ?? [], missingFields: [] as string[] }
    };
  } catch {
    // fetch below
  }
  try {
    const remote = await fetchSus(region, musicId, difficulty);
    if (!remote.text) {
      return { score: undefined, trace: { status: remote.status, source: remote.url, missingFields: [`musicScore:${region}:${musicId}:${difficulty}`] } };
    }
    const parsed = parseSusMusicScore(remote.text);
    if (!parsed.score) {
      return { score: undefined, trace: { status: "unsupported-chart-format", source: remote.url, missingFields: ["parsable musicScore"], unsupportedReason: parsed.unsupportedReason, warnings: parsed.warnings } };
    }
    await atomicWrite(filePath, { score: parsed.score, warnings: parsed.warnings, sourceUrl: remote.url, cachedAt: new Date().toISOString() });
    return { score: parsed.score, trace: { status: "matched", source: remote.url, cachedAt: new Date().toISOString(), warnings: parsed.warnings, missingFields: [] as string[] } };
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
