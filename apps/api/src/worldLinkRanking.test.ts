import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRealtimeWorldLinkLatest, selectRealtimeWorldLinkGroup } from "./realtimeRankingClient.js";
import {
  collectWorldLinkCharacterIds,
  discoverWorldLinkForEvent,
  getLiveRankingCached,
  getRankingChurnCached,
  getRankingPlayerDetail,
  latestLiveRankingForRegion,
  matchingWorldLinkSnapshot,
  persistLiveRankingHistoryForBoard,
  refreshRankingWithAuthoritativeContext
} from "./runtimeData.js";
import { validateRankingBoardContext } from "./rankingBoardContext.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("World Link ranking isolation", () => {
  it.each(["jp", "en", "tw", "kr", "cn"] as const)(
    "uses the selected %s region for World Link discovery",
    async (region) => {
      const fetchMock = vi.fn(async (_input: string | URL) => new Response(JSON.stringify({
        event_id: 211,
        region,
        groups: [{
          event_id: 211,
          region,
          game_character_id: 5,
          rankings: [{ rank: 1, score: 123456, name: "player", userId: "1001" }]
        }]
      }), { status: 200, headers: { "content-type": "application/json" } }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await fetchRealtimeWorldLinkLatest(region);

      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        `https://rks-n.exmeaning.com/api/public/v2/${region}/worldlink-latest`
      );
      expect(result.snapshot?.region).toBe(region);
      expect(result.snapshot?.groups[0]?.gameCharacterId).toBe(5);
    }
  );

  it("parses worldlink-latest groups instead of treating the root as a normal board", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) => new Response(JSON.stringify({
      event_id: 211,
      region: "jp",
      start_at: 1_800_000_000,
      end_at: 1_800_086_400,
      updated_at: 1_800_000_100,
      groups: [
        {
          event_id: 211,
          region: "jp",
          game_character_id: 5,
          updated_at: 1_800_000_100,
          rankings: [{ rank: 1, score: 123456, name: "角色榜玩家", userId: "1001" }]
        },
        {
          event_id: 211,
          region: "jp",
          game_character_id: 8,
          updated_at: 1_800_000_100,
          rankings: [{ rank: 1, score: 654321, name: "另一角色玩家", userId: "1002" }]
        }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRealtimeWorldLinkLatest("jp");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://rks-n.exmeaning.com/api/public/v2/jp/worldlink-latest");
    expect(result.snapshot?.eventId).toBe("211");
    expect(result.snapshot?.groups.map((group) => group.gameCharacterId)).toEqual([5, 8]);
    expect(selectRealtimeWorldLinkGroup(result.snapshot, 8)?.entries[0]).toMatchObject({
      rank: 1,
      score: 654321,
      playerName: "另一角色玩家"
    });
    expect(selectRealtimeWorldLinkGroup(result.snapshot, 99)).toBeUndefined();
  });

  it("uses worldBlooms only to order characters that have a real upstream group", () => {
    const ids = collectWorldLinkCharacterIds(
      "211",
      { id: "211", eventType: "world_bloom", bonusCharacterIds: ["9"] },
      [
        { raw: { eventId: 210, chapterNo: 1, gameCharacterId: 99 } },
        { raw: { eventId: 211, chapterNo: 2, gameCharacterId: 8 } },
        { raw: { eventId: 211, chapterNo: 1, gameCharacterId: 5 } }
      ],
      [8, 7]
    );

    expect(ids).toEqual([8, 7]);
    expect(collectWorldLinkCharacterIds(
      "211",
      { id: "211", eventType: "world_bloom", bonusCharacterIds: ["9"] },
      [{ raw: { eventId: 211, chapterNo: 1, gameCharacterId: 5 } }],
      []
    )).toEqual([]);
  });

  it.each([
    ["wrong root region", { event_id: 211, region: "en", groups: [] }],
    ["wrong group region", { event_id: 211, region: "jp", groups: [{ event_id: 211, region: "en", game_character_id: 5, rankings: [] }] }],
    ["wrong group event", { event_id: 211, region: "jp", groups: [{ event_id: 212, region: "jp", game_character_id: 5, rankings: [] }] }],
    ["duplicate group", { event_id: 211, region: "jp", groups: [
      { event_id: 211, region: "jp", game_character_id: 5, rankings: [] },
      { event_id: 211, region: "jp", game_character_id: 5, rankings: [] }
    ] }],
    ["invalid group", { event_id: 211, region: "jp", groups: [{ event_id: 211, region: "jp", game_character_id: 0, rankings: [] }] }]
  ])("rejects malformed World Link payloads: %s", async (_label, payload) => {
    const fetchMock = vi.fn(async (_input: string | URL) => new Response(
      JSON.stringify(payload),
      { status: 200, headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRealtimeWorldLinkLatest("jp");

    expect(result.snapshot).toBeNull();
    expect(result.errors).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["ordinary", { id: "211", eventType: "marathon" }],
    ["unknown", { id: "unknown" }],
    ["mismatched", { id: "212", eventType: "world_bloom" }]
  ])("does not call the World Link source for %s event context", async (_label, event) => {
    const fetcher = vi.fn(async (
      _region: Parameters<typeof fetchRealtimeWorldLinkLatest>[0],
      _timeout?: number
    ) => ({ snapshot: null, errors: [] }));

    const result = await discoverWorldLinkForEvent("jp", "211", event, fetcher);

    expect(result).toEqual({ snapshot: null, errors: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not expose groups from a different event as available", () => {
    const response = {
      snapshot: {
        region: "jp",
        eventId: "212",
        updatedAt: new Date().toISOString(),
        groups: [{ gameCharacterId: 5 }],
        sourceLine: "main",
        sourceUrl: "test"
      },
      errors: []
    };

    expect(matchingWorldLinkSnapshot(response as any, "211")).toBeNull();
  });

  it("never returns a World Link board as the latest overall snapshot", () => {
    const overall = {
      region: "jp",
      updatedAt: "2026-01-01T00:00:00.000Z",
      data: { boardType: "overall" }
    };
    const newerWorldLink = {
      region: "jp",
      updatedAt: "2026-01-02T00:00:00.000Z",
      data: { boardType: "worldlink", gameCharacterId: 5 }
    };

    expect(latestLiveRankingForRegion({
      liveRankings: { overall, newerWorldLink }
    } as any, "jp")).toBe(overall);
  });

  it.each([
    [{ boardType: "invalid" }, "Unsupported boardType"],
    [{ boardType: "overall", gameCharacterId: "5" }, "gameCharacterId is supported only for World Link"],
    [{ boardType: "worldlink" }, "gameCharacterId is required for World Link"],
    [{ boardType: "worldlink", gameCharacterId: "0" }, "Unsupported gameCharacterId"]
  ])("rejects invalid shared ranking context %#", async (query, message) => {
    const currentEvent = vi.fn();
    const overallLiveRanking = vi.fn();

    const result = await validateRankingBoardContext("jp", query, "211", {
      currentEvent,
      overallLiveRanking
    } as any);

    expect(result).toMatchObject({ ok: false, statusCode: 400, message });
    expect(currentEvent).not.toHaveBeenCalled();
    expect(overallLiveRanking).not.toHaveBeenCalled();
  });

  it("requires the matching active world_bloom event and authoritative character group", async () => {
    const live = (characters: number[], available = true) => ({
      worldLinkAvailable: available,
      worldLinkCharacters: characters.map((id) => ({ id }))
    });

    const ordinary = await validateRankingBoardContext("jp", { boardType: "worldlink", gameCharacterId: "5" }, "211", {
      currentEvent: vi.fn(async () => ({ id: "211", eventType: "marathon" })),
      overallLiveRanking: vi.fn()
    } as any);
    const wrongEvent = await validateRankingBoardContext("jp", { boardType: "worldlink", gameCharacterId: "5" }, "211", {
      currentEvent: vi.fn(async () => ({ id: "212", eventType: "world_bloom" })),
      overallLiveRanking: vi.fn()
    } as any);
    const wrongCharacter = await validateRankingBoardContext("jp", { boardType: "worldlink", gameCharacterId: "8" }, "211", {
      currentEvent: vi.fn(async () => ({ id: "211", eventType: "world_bloom" })),
      overallLiveRanking: vi.fn(async () => live([5]))
    } as any);
    const unavailable = await validateRankingBoardContext("jp", { boardType: "worldlink", gameCharacterId: "5" }, "211", {
      currentEvent: vi.fn(async () => ({ id: "211", eventType: "world_bloom" })),
      overallLiveRanking: vi.fn(async () => live([], false))
    } as any);
    const valid = await validateRankingBoardContext("jp", { boardType: "worldlink", gameCharacterId: "5" }, "211", {
      currentEvent: vi.fn(async () => ({ id: "211", eventType: "world_bloom" })),
      overallLiveRanking: vi.fn(async () => live([5, 8]))
    } as any);

    expect(ordinary).toMatchObject({ ok: false, statusCode: 400 });
    expect(wrongEvent).toMatchObject({ ok: false, statusCode: 400 });
    expect(wrongCharacter).toMatchObject({ ok: false, statusCode: 400 });
    expect(unavailable).toMatchObject({ ok: false, statusCode: 503 });
    expect(valid).toMatchObject({ ok: true, boardType: "worldlink", gameCharacterId: 5, event: { id: "211" } });
  });

  it("loads a valid World Link player detail and churn without overall fallback", async () => {
    const eventId = `wl-test-${Date.now()}`;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/worldlink-latest")) {
        return new Response(JSON.stringify({
          event_id: eventId,
          region: "jp",
          groups: [{
            event_id: eventId,
            region: "jp",
            game_character_id: 5,
            rankings: [{ rank: 1, score: 7654321, name: "World Link Player", userId: "wl-user" }]
          }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/worldlink-churn")) {
        return new Response(JSON.stringify({
          event_id: eventId,
          rankings: [{ rank: 1, score: 7654321, name: "World Link Player", userId: "wl-user", growth_1h: 1234 }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected ranking source URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const event = { id: eventId, eventType: "world_bloom" };

    const detail = await getRankingPlayerDetail(
      "jp",
      eventId,
      1,
      { boardType: "worldlink", gameCharacterId: 5 },
      event
    );
    const churn = await getRankingChurnCached("jp", eventId, {
      boardType: "worldlink",
      gameCharacterId: 5,
      top: 100,
      force: true
    });

    expect(detail).toMatchObject({
      rank: 1,
      score: 7654321,
      playerName: "World Link Player",
      growth1h: 1234
    });
    expect(churn).toMatchObject({
      status: "fresh",
      boardType: "worldlink",
      gameCharacterId: 5
    });
    expect(fetchMock.mock.calls.some(([url]) => /\/latest(?:\?|$)/.test(String(url)))).toBe(false);
  }, 20_000);

  it("preserves World Link character metadata across repeated authoritative background refreshes", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/worldlink-latest")) {
        return new Response(JSON.stringify({
          event_id: 211,
          region: "jp",
          groups: [2, 12].map((gameCharacterId) => ({
            event_id: 211,
            region: "jp",
            game_character_id: gameCharacterId,
            rankings: [{ rank: 1, score: 1000 + gameCharacterId, name: `WL ${gameCharacterId}` }]
          }))
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (/\/latest(?:\?|$)/.test(url)) {
        return new Response(JSON.stringify({
          event_id: 211,
          region: "jp",
          rankings: [{ rank: 1, score: 9999, name: "Overall" }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/tier-series")) {
        return new Response(JSON.stringify({ tiers: {} }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected ranking source URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const dependencies = {
      eventDetail: vi.fn(async () => ({ id: "211", eventType: "world_bloom" })),
      liveRanking: getLiveRankingCached
    } as any;

    const first = await refreshRankingWithAuthoritativeContext({ region: "jp", eventId: "211" }, dependencies);
    const second = await refreshRankingWithAuthoritativeContext({ region: "jp", eventId: "211" }, dependencies);

    for (const tick of [first, second]) {
      if (!("liveRanking" in tick)) throw new Error("authoritative World Link refresh was unexpectedly skipped");
      expect(tick.liveRanking).toMatchObject({ boardType: "overall", worldLinkAvailable: true });
      expect(tick.liveRanking.worldLinkCharacters.map((character) => character.id)).toEqual([2, 12]);
    }
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/worldlink-latest"))).toHaveLength(2);
  }, 20_000);

  it("never probes World Link while refreshing an ordinary or unknown watched event", async () => {
    const eventId = `ordinary-${Date.now()}`;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (/\/latest(?:\?|$)/.test(url)) {
        return new Response(JSON.stringify({
          event_id: eventId,
          region: "jp",
          rankings: [{ rank: 1, score: 5000, name: "Overall" }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/tier-series")) {
        return new Response(JSON.stringify({ tiers: {} }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected ranking source URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const ordinary = await refreshRankingWithAuthoritativeContext({ region: "jp", eventId }, {
      eventDetail: vi.fn(async () => ({ id: eventId, eventType: "marathon" })),
      liveRanking: getLiveRankingCached
    } as any);
    const unknownLive = vi.fn();
    const unknown = await refreshRankingWithAuthoritativeContext({ region: "jp", eventId: "missing" }, {
      eventDetail: vi.fn(async () => null),
      liveRanking: unknownLive
    } as any);

    if (!("liveRanking" in ordinary)) throw new Error("authoritative ordinary refresh was unexpectedly skipped");
    expect(ordinary.liveRanking).toMatchObject({ boardType: "overall", worldLinkAvailable: false, worldLinkCharacters: [] });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/worldlink-latest"))).toBe(false);
    expect(unknown).toMatchObject({ skipped: true, reason: "authoritative-event-context-unavailable" });
    expect(unknownLive).not.toHaveBeenCalled();
  }, 20_000);

  it("never writes a character board into the overall-only history store", async () => {
    const persist = vi.fn(async () => undefined);

    expect(await persistLiveRankingHistoryForBoard("worldlink", persist)).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(await persistLiveRankingHistoryForBoard("overall", persist)).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
