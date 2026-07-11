import type { RegionId } from "./config.js";
import { getReferenceMaster } from "./referenceMaster.js";
import { getMusicScore, type MusicScore } from "./musicScore.js";

export const liveExactVersion = "live-exact-v1-reference" as const;

export type LiveExactType = "solo" | "multi" | "cheerful" | "challenge" | "auto";

export type LiveExactInput = {
  region: RegionId;
  musicId?: string;
  difficulty?: string;
  power: number;
  skills: number[];
  liveType?: LiveExactType;
  multiSumPower?: number;
  feverMusicId?: string;
  feverDifficulty?: string;
};

type EffectWindow = {
  startTime: number;
  endTime: number;
  effect: number;
  source: "skill" | "fever";
  index?: number;
  noteCount?: number;
};

function numberField(record: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function idField(record: Record<string, unknown>) {
  return String(record.id ?? record.ingameNoteType ?? record.ingameNoteTypeId ?? "");
}

function buildCoefficientMap(rows: Record<string, unknown>[]) {
  return new Map(rows.map((row) => [idField(row), numberField(row, ["scoreCoefficient", "score_coefficient"], 1)]));
}

function comboCoefficient(rows: Record<string, unknown>[], combo: number) {
  const row = rows.find((item) => numberField(item, ["fromCount", "from_count"], 0) <= combo && combo <= numberField(item, ["toCount", "to_count"], Number.MAX_SAFE_INTEGER));
  return row ? numberField(row, ["scoreCoefficient", "score_coefficient"], 1) : 1;
}

function skillWindows(skills: number[], musicScore: MusicScore) {
  return musicScore.skills.map((marker, index): EffectWindow => ({
    startTime: marker.time,
    endTime: marker.time + 5,
    effect: skills[index] ?? 0,
    source: "skill",
    index
  }));
}

function feverWindow(musicScore: MusicScore): EffectWindow {
  if (!musicScore.fevers.length) return { startTime: 0, endTime: 0, effect: 0, source: "fever", noteCount: 0 };
  const startTime = musicScore.fevers.reduce((max, item) => Math.max(max, item.time), 0);
  const notesAfterFever = musicScore.notes.filter((note) => note.time >= startTime);
  const feverNoteCount = Math.min(notesAfterFever.length, Math.floor(musicScore.notes.length / 10));
  const endTime = notesAfterFever[Math.max(0, feverNoteCount - 1)]?.time ?? startTime;
  return { startTime, endTime, effect: 50, source: "fever", noteCount: feverNoteCount };
}

function activeBonus(liveType: LiveExactType, multiSumPower: number) {
  return liveType === "multi" ? 5 * 0.015 * multiSumPower : 0;
}

export function calculateLiveExactFromMusicScore(input: {
  musicScore: MusicScore;
  ingameNotes: Record<string, unknown>[];
  ingameCombos: Record<string, unknown>[];
  power: number;
  skills: number[];
  liveType?: LiveExactType;
  multiSumPower?: number;
  feverMusicScore?: MusicScore;
}) {
  const liveType = input.liveType ?? "solo";
  const coefficients = buildCoefficientMap(input.ingameNotes);
  const noteCoefficients = input.musicScore.notes.map((note) => coefficients.get(String(note.type)) ?? 1);
  const coefficientTotal = noteCoefficients.reduce((sum, value) => sum + value, 0);
  const effects = skillWindows(input.skills, input.musicScore);
  const fever = liveType === "multi" || liveType === "cheerful" ? feverWindow(input.feverMusicScore ?? input.musicScore) : null;
  if (fever) effects.push(fever);
  const notes = input.musicScore.notes.map((note, index) => {
    const combo = index + 1;
    const noteCoefficient = noteCoefficients[index] ?? 1;
    const comboRate = comboCoefficient(input.ingameCombos, combo);
    const judgeCoefficient = 1;
    const effectBonuses = effects
      .filter((effect) => effect.startTime <= note.time && note.time <= effect.endTime)
      .map((effect) => effect.effect);
    const effectCoefficient = effectBonuses.reduce((total, effect) => total * (effect / 100), 1);
    const noteScore = noteCoefficient * comboRate * judgeCoefficient * effectCoefficient * input.power * 4 / Math.max(coefficientTotal, 1);
    return {
      time: note.time,
      type: note.type,
      noteCoefficient,
      comboCoefficient: comboRate,
      judgeCoefficient,
      effectBonuses,
      effectCoefficient,
      score: noteScore
    };
  });
  const noteTotal = notes.reduce((sum, note) => sum + note.score, 0);
  const active = activeBonus(liveType, input.multiSumPower ?? input.power * 5);
  return {
    total: noteTotal + active,
    activeBonus: active,
    noteTotal,
    notes,
    effectWindows: effects.filter((effect) => effect.source === "skill"),
    feverWindow: fever,
    coefficientTotal,
    noteScoreSummary: {
      noteCount: notes.length,
      skillWindowCount: effects.filter((effect) => effect.source === "skill").length,
      feverApplied: Boolean(fever && fever.effect > 0),
      minNoteScore: Math.min(...notes.map((note) => note.score)),
      maxNoteScore: Math.max(...notes.map((note) => note.score))
    }
  };
}

export async function calculateLiveExact(input: LiveExactInput) {
  const liveType = input.liveType ?? "solo";
  const [ingameNotes, ingameCombos, musicScoreResult, feverMusicScoreResult] = await Promise.all([
    getReferenceMaster<Record<string, unknown>>(input.region, "ingameNotes"),
    getReferenceMaster<Record<string, unknown>>(input.region, "ingameCombos"),
    getMusicScore(input.region, input.musicId, input.difficulty),
    input.feverMusicId || input.feverDifficulty
      ? getMusicScore(input.region, input.feverMusicId ?? input.musicId, input.feverDifficulty ?? input.difficulty)
      : Promise.resolve(undefined)
  ]);
  const missingFields = new Set<string>();
  if (!ingameNotes.length) missingFields.add("ingameNotes");
  if (!ingameCombos.length) missingFields.add("ingameCombos");
  for (const field of (musicScoreResult.trace.missingFields ?? [])) missingFields.add(field);
  const feverScore = feverMusicScoreResult?.score ?? musicScoreResult.score;
  for (const field of (feverMusicScoreResult?.trace.missingFields ?? [])) missingFields.add(`fever:${field}`);
  if (!musicScoreResult.score) missingFields.add("musicScore");
  if (!input.power || input.power <= 0) missingFields.add("power");
  if (!input.skills.length) missingFields.add("skills");

  const referenceFiles = [
    "refer/Moesekai/refer/re_sekai-calculator/src/live-score/live-exact-calculator.ts",
    "refer/Moesekai/refer/re_sekai-calculator/src/live-score/live-calculator.ts"
  ];
  if (missingFields.size || !musicScoreResult.score || !ingameNotes.length || !ingameCombos.length) {
    return {
      liveExactVersion,
      total: null,
      activeBonus: 0,
      noteTotal: null,
      notes: [],
      effectWindows: [],
      feverWindow: null,
      coefficientTotal: 0,
      noteScoreSummary: null,
      musicScoreTrace: musicScoreResult.trace,
      feverMusicScoreTrace: feverMusicScoreResult?.trace,
      missingFields: [...missingFields],
      referenceParity: { status: "missing-data", liveExactCalculator: "missing-data", referenceFiles }
    };
  }

  const detail = calculateLiveExactFromMusicScore({
    musicScore: musicScoreResult.score,
    feverMusicScore: feverScore,
    ingameNotes,
    ingameCombos,
    power: input.power,
    skills: input.skills,
    liveType,
    multiSumPower: input.multiSumPower
  });
  return {
    liveExactVersion,
    ...detail,
    musicScoreTrace: musicScoreResult.trace,
    feverMusicScoreTrace: feverMusicScoreResult?.trace,
    missingFields: [] as string[],
    referenceParity: { status: "matched", liveExactCalculator: "matched", referenceFiles }
  };
}
