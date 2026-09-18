import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMusicScore, musicScoreUrl, resetMusicScoreStateForTest, setMusicScoreCacheRootForTest } from "./musicScore.js";

const temporaryRoots: string[] = [];
const parsableSus = [
  "#BPM 120",
  "#00011:0100",
  "#00008:0100"
].join("\n");

async function temporaryCacheRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "pjsktools-music-score-"));
  temporaryRoots.push(root);
  return root;
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

    const cached = await getMusicScore("tw", "1", "expert");
    expect(cached.trace.status).toBe("cache-hit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
