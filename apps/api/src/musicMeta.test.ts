import { afterEach, describe, expect, it, vi } from "vitest";

const filesystem = vi.hoisted(() => ({
  cache: "",
  readFile: vi.fn(async () => filesystem.cache),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined)
}));

vi.mock("node:fs/promises", () => ({
  readFile: filesystem.readFile,
  writeFile: filesystem.writeFile,
  mkdir: filesystem.mkdir
}));

const { getMusicMetas, musicMetaSource, resetMusicMetaMemoryCacheForTest } = await import("./musicMeta.js");

afterEach(() => {
  resetMusicMetaMemoryCacheForTest();
  filesystem.cache = "";
  filesystem.readFile.mockClear();
  filesystem.writeFile.mockClear();
  filesystem.mkdir.mockClear();
  vi.unstubAllGlobals();
});

describe("Haruki music metadata sources", () => {
  it("uses the official region-specific CDN documents", () => {
    expect(musicMetaSource("jp")).toBe("https://sekai-api-cdn.haruki.seiunx.com/v1/metas/jp/music_metas.json");
    expect(musicMetaSource("en")).toBe("https://sekai-api-cdn.haruki.seiunx.com/v1/metas/en/music_metas.json");
    expect(musicMetaSource("tw")).toBe("https://sekai-api-cdn.haruki.seiunx.com/v1/metas/tw/music_metas.json");
    expect(musicMetaSource("kr")).toBe("https://sekai-api-cdn.haruki.seiunx.com/v1/metas/kr/music_metas.json");
    expect(musicMetaSource("cn")).toBe("https://sekai-api-cdn.haruki.seiunx.com/v1/metas/cn/music_metas.json");
  });

  it("retries the Haruki source after falling back to an expired cache", async () => {
    filesystem.cache = JSON.stringify({
      source: musicMetaSource("en"),
      fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
      rows: [{ music_id: 1, difficulty: "expert", music_time: 120, event_rate: 100, base_score: 1, base_score_auto: 1, skill_score_solo: [], skill_score_auto: [], skill_score_multi: [], fever_score: 1, fever_end_time: 1, tap_count: 1 }]
    });
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("temporary CDN failure"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMusicMetas("en")).resolves.toMatchObject({ source: musicMetaSource("en"), rows: [{ musicId: "1" }] });
    await expect(getMusicMetas("en")).resolves.toMatchObject({ source: musicMetaSource("en"), rows: [{ musicId: "1" }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("revalidates an expired cache with the registry ETag", async () => {
    filesystem.cache = JSON.stringify({
      source: musicMetaSource("en"),
      fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
      etag: '"music-1"',
      rows: [{ music_id: 2, difficulty: "expert", music_time: 121, event_rate: 100, base_score: 1, base_score_auto: 1, skill_score_solo: [], skill_score_auto: [], skill_score_multi: [], fever_score: 1, fever_end_time: 1, tap_count: 1 }]
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 304, headers: { etag: '"music-1"' } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMusicMetas("en")).resolves.toMatchObject({ source: musicMetaSource("en"), rows: [{ musicId: "2" }] });
    expect(fetchMock).toHaveBeenCalledWith(musicMetaSource("en"), expect.objectContaining({ headers: expect.objectContaining({ "If-None-Match": '"music-1"' }) }));
  });
});
