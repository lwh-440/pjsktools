import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMusicScore,
  musicScoreParserVersion,
  musicScoreUrl,
  parseSusMusicScore,
  resetMusicScoreStateForTest,
  setMusicScoreCacheRootForTest
} from "./musicScore.js";

const temporaryRoots: string[] = [];
const parsableSus = [
  "#BPM 120",
  "#00012:13",
  "#00010:13"
].join("\n");

async function temporaryCacheRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "pjsktools-music-score-"));
  temporaryRoots.push(root);
  return root;
}

function parsedScore(sus: string) {
  const result = parseSusMusicScore(sus);
  expect(result.unsupportedReason).toBeUndefined();
  expect(result.warnings).toEqual([]);
  expect(result.score).toBeDefined();
  return result.score!;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  resetMusicScoreStateForTest();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Haruki Exact-score SUS source", () => {
  it("uses the same verified Haruki score paths as the chart renderer", () => {
    expect(musicScoreUrl("jp", "1", "EXPERT")).toBe("https://sekai-assets.haruki.seiunx.com/jp-assets/startapp/music/music_score/0001_01/expert.txt?v=2");
    expect(musicScoreUrl("tw", "11012", "master")).toBe("https://sekai-assets.haruki.seiunx.com/tw-assets/startapp/music/music_score/11012_01/master.txt?v=2");
  });

  it("single-flights a cold score load and leaves every concurrent Exact caller with the parsed score", async () => {
    const root = await temporaryCacheRoot();
    setMusicScoreCacheRootForTest(root);
    const fetchMock = vi.fn(async () => new Response(parsableSus, { status: 200, headers: { "Content-Type": "text/plain" } }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all(Array.from({ length: 5 }, () => getMusicScore("tw", "1", "EXPERT")));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result.trace.status).toBe("matched");
      expect(result.score?.notes).toHaveLength(1);
      expect(result.score?.skills).toHaveLength(1);
    }
    const persisted = JSON.parse(await readFile(path.join(root, "data", "music-score", "tw", "0001_expert.json"), "utf-8"));
    expect(persisted.score.notes).toHaveLength(1);
    expect(persisted.parserVersion).toBe(musicScoreParserVersion);

    const cached = await getMusicScore("tw", "1", "expert");
    expect(cached.trace.status).toBe("cache-hit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a source-valid cache written by an older parser", async () => {
    const root = await temporaryCacheRoot();
    const cacheFile = path.join(root, "data", "music-score", "tw", "0001_expert.json");
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify({
      score: { notes: [{ time: 0, type: 1 }], skills: [], fevers: [] },
      sourceUrl: musicScoreUrl("tw", "1", "expert"),
      cachedAt: "2026-09-17T00:00:00.000Z"
    }), "utf-8");
    setMusicScoreCacheRootForTest(root);
    const fetchMock = vi.fn(async () => new Response(parsableSus, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMusicScore("tw", "1", "expert");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.trace.status).toBe("matched");
    const rewritten = JSON.parse(await readFile(cacheFile, "utf-8"));
    expect(rewritten.parserVersion).toBe(musicScoreParserVersion);
  });

  it("keeps a successfully parsed score when its cache destination cannot be written", async () => {
    const root = await temporaryCacheRoot();
    const blockedRoot = path.join(root, "cache-root-file");
    await writeFile(blockedRoot, "not a directory", "utf-8");
    setMusicScoreCacheRootForTest(blockedRoot);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(parsableSus, { status: 200 })));

    const result = await getMusicScore("tw", "1", "expert");

    expect(result.trace.status).toBe("matched");
    expect(result.score?.notes).toHaveLength(1);
    expect(result.trace.warnings).toContainEqual(expect.stringContaining("music score cache write failed"));
  });
});

describe("Exact-score SUS parser", () => {
  it("applies persistent bar lengths and segment-by-segment BPM timing", () => {
    const score = parsedScore([
      '#REQUEST "ticks_per_beat 480"',
      "#BPM01: 120",
      "#BPM02: 240",
      "#00002: 3",
      "#00008: 01000200",
      "#00012:0013",
      "#00112:0013"
    ].join("\n"));

    expect(score.notes).toHaveLength(2);
    expect(score.notes[0].time).toBeCloseTo(0.75, 8);
    // Measure 0 is 3 beats and BPM doubles halfway through it; the second note is halfway through the next 3-beat measure.
    expect(score.notes[1].time).toBeCloseTo(1.5, 8);
  });

  it("keeps skill and fever markers out of score events and merges a directional note into a flick", () => {
    const score = parsedScore([
      "#BPM 120",
      "#00010:13",
      "#0001f:13",
      "#00012:13",
      "#00052:13"
    ].join("\n"));

    expect(score.skills).toEqual([{ time: 0 }]);
    expect(score.fevers).toEqual([{ time: 0 }]);
    expect(score.notes).toEqual([{ time: 0, type: 4 }]);
  });

  it.each([1, 2, 3, 4, 5, 6])("treats directional value %i as a flick without inheriting tap attributes", (direction) => {
    const score = parsedScore([
      "#BPM 120",
      "#00012:13",
      `#00052:${direction}3`
    ].join("\n"));

    expect(score.notes).toEqual([{ time: 0, type: 4 }]);
  });

  it("keeps a directional value 5 from turning the real 23520-tick long start into a friction hold", () => {
    const score = parsedScore([
      '#REQUEST "ticks_per_beat 480"',
      "#BPM 120",
      "#01212:00130000",
      "#01252:00530000",
      "#01232a:00130000",
      "#01332a:00000023"
    ].join("\n"));

    expect(score.notes.find((note) => note.time === 24.5)).toMatchObject({ type: 2, longId: 1 });
  });
  it("scores modern critical and friction taps while omitting cancel variants", () => {
    const score = parsedScore([
      "#BPM 120",
      "#00012:13",
      "#00013:23",
      "#00014:53",
      "#00015:63",
      "#00016:73",
      "#00017:83"
    ].join("\n"));

    expect(score.notes.map((note) => note.type)).toEqual([1, 5, 10, 13]);
  });

  it("scores long starts, relays, ends, and half-beat auto ticks without replacing a relay-coincident auto tick", () => {
    const score = parsedScore([
      '#REQUEST "ticks_per_beat 480"',
      "#BPM 120",
      "#00032a:13330000",
      "#00132a:0023"
    ].join("\n"));

    expect(score.notes).toHaveLength(14);
    expect(score.notes.filter((note) => note.type === 9)).toHaveLength(11);
    expect(score.notes.filter((note) => note.time === 0.5).map((note) => note.type).sort()).toEqual([3, 9]);
    expect(score.notes[0]).toMatchObject({ type: 2, longId: 1 });
    expect(score.notes.at(-1)).toMatchObject({ type: 1, longId: 1 });
  });

  it("inherits a critical long start through relays and the ending note", () => {
    const score = parsedScore([
      '#REQUEST "ticks_per_beat 480"',
      "#BPM 120",
      "#00012:23",
      "#00032a:13330000",
      "#00132a:0023"
    ].join("\n"));

    expect(score.notes[0]).toMatchObject({ type: 6, longId: 1 });
    expect(score.notes.filter((note) => note.type === 7)).toHaveLength(1);
    expect(score.notes.at(-1)).toMatchObject({ type: 5, longId: 1 });
  });

  it("removes a tap replaced by a hidden relay but retains its automatic hold tick", () => {
    const score = parsedScore([
      '#REQUEST "ticks_per_beat 480"',
      "#BPM 120",
      "#00012:0013",
      "#00032a:13530000",
      "#00132a:0023"
    ].join("\n"));

    expect(score.notes.filter((note) => note.time === 0.5).map((note) => note.type)).toEqual([9]);
  });

  it("uses one Exact score event for overlapping widths on the same timing lane", () => {
    const score = parsedScore([
      "#BPM 120",
      "#00012:13121313",
      "#00012:00130000"
    ].join("\n"));

    expect(score.notes).toHaveLength(4);
  });
  it("drops duplicate long segments with the same first node before generating automatic ticks", () => {
    const score = parsedScore([
      '#REQUEST "ticks_per_beat 480"',
      "#BPM 120",
      "#00032a:13",
      "#00032b:13",
      "#00132a:23",
      "#00132b:23"
    ].join("\n"));

    // One 4-beat hold: start, end, and seven half-beat automatic ticks.
    expect(score.notes).toHaveLength(9);
    expect(score.notes.filter((note) => note.type === 9)).toHaveLength(7);
  });
});

const runLiveHarukiValidation = process.env.PJSKTOOLS_RUN_HARUKI_LIVE_TESTS === "true";
describe.skipIf(!runLiveHarukiValidation)("live Haruki Exact-score acceptance", () => {
  const samples = [
    { region: "tw" as const, musicId: "1", difficulty: "expert", notes: 961 },
    { region: "tw" as const, musicId: "11012", difficulty: "expert", notes: 935 },
    { region: "jp" as const, musicId: "811", difficulty: "expert", notes: 760 },
    { region: "tw" as const, musicId: "1", difficulty: "append", notes: 1353 }
  ];

  for (const sample of samples) {
    it(`${sample.region} ${sample.musicId} ${sample.difficulty} matches the published score-event count`, async () => {
      const response = await fetch(musicScoreUrl(sample.region, sample.musicId, sample.difficulty));
      expect(response.ok).toBe(true);
      const score = parsedScore(await response.text());
      expect(score.notes).toHaveLength(sample.notes);
      expect(score.notes.every((note) => Number.isInteger(note.type) && note.type >= 1 && note.type <= 15)).toBe(true);
      expect(score.notes.every((note, index) => index === 0 || score.notes[index - 1].time <= note.time)).toBe(true);
      expect(score.skills).toHaveLength(6);
      expect(score.fevers).toHaveLength(2);
    });
  }

  it("retains the known TW 0001 timing markers", async () => {
    const response = await fetch(musicScoreUrl("tw", "1", "expert"));
    const score = parsedScore(await response.text());
    expect(score.skills.map((marker) => marker.time)).toEqual([12.8, 27.2, 43.2, 62.4, 81.6, 110.4]);
    expect(score.fevers.map((marker) => marker.time)).toEqual([65.6, 78.4]);
    // Haruki TW 0001: tick 23520 has tap 13 + directional 53 + a long start 13.
    expect(score.notes.filter((note) => note.time === 19.6).map((note) => note.type)).toContain(2);
    expect(score.notes.filter((note) => note.time === 19.6).map((note) => note.type)).not.toContain(11);
  });
});
