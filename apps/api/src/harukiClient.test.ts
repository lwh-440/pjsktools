import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HarukiRequestError, harukiClient, resetHarukiRequestStateForTests } from "./harukiClient.js";

beforeEach(() => {
  process.env.HARUKI_REQUEST_INTERVAL_MS = "0";
  process.env.HARUKI_RATE_LIMIT_COOLDOWN_MS = "60000";
  resetHarukiRequestStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HARUKI_REQUEST_INTERVAL_MS;
  delete process.env.HARUKI_RATE_LIMIT_COOLDOWN_MS;
  resetHarukiRequestStateForTests();
});

describe.sequential("Haruki request controls", () => {
  it("deduplicates identical in-flight profile requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ userId: "990000000000000001", nickname: "real-player" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      harukiClient.getPlayerProfile("jp", "990000000000000001"),
      harukiClient.getPlayerProfile("jp", "990000000000000001")
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("opens a circuit after 429 and avoids another upstream request", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(harukiClient.getPlayerProfile("jp", "990000000000000002")).rejects.toMatchObject({ kind: "rate-limited", status: 429 });
    await expect(harukiClient.getPlayerProfile("en", "990000000000000003")).rejects.toBeInstanceOf(HarukiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("builds the overall ranking snapshot from Haruki top and border boards", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/leaderboards/total/overview")) {
        return new Response(JSON.stringify({
          topRankings: [
            {
              rankData: { rank: 1, userId: "u1", score: 123456, timestamp: 1_700_000_000 },
              userData: { name: "player-1", cardId: 1001 }
            }
          ],
          topRankGrowths: []
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      let rank = 500;
      const match = url.match(/details\/rank\/(\d+)/);
      if (match) rank = Number(match[1]);
      return new Response(JSON.stringify({
        current: {
          rankData: { rank, userId: `u${rank}`, score: 100000 - rank, timestamp: 1_700_000_000 },
          userData: { name: `border-${rank}`, cardId: 2000 }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await harukiClient.getRankingLatestSnapshot("jp", "210");

    expect(snapshot.sourceLine).toBe("main");
    expect(snapshot.eventId).toBe("210");
    expect(snapshot.entries.map((entry) => entry.rank)).toEqual([1, 500, 1000, 2000, 5000]);
    expect(snapshot.entries.find((entry) => entry.rank === 500)?.source).toBe("toolbox-api");
  });
  it("maps a World Link overview only when its region, event, scope and character match", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify({
      meta: { server: "en", eventId: 179, scope: "world-bloom/21", characterId: 21 },
      topRankings: [{
        rankData: { rank: 1, userId: "a".repeat(64), score: 700, timestamp: 1_700_000_100, characterId: 21 },
        userData: { name: "World Link player", cardId: 1235 }
      }],
      borderLines: [{ rank: 200, score: 500, timestamp: 1_700_000_000 }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await harukiClient.getWorldLinkRankingSnapshot("en", "179", 21);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/events/en/179/leaderboards/world-bloom/21/overview?interval=3600");
    expect(snapshot.updatedAt).toBe("2023-11-14T22:15:00.000Z");
    expect(snapshot.entries).toMatchObject([{ rank: 1, userId: "a".repeat(64), score: 700 }, { rank: 200, score: 500 }]);
  });

  it("loads a World Link detail through the official rank route, follows monotonic cursors, and reports trace coverage", async () => {
    process.env.HARUKI_WORLD_LINK_TRACE_PAGE_LIMIT = "2";
    const userId = "a".repeat(64);
    const detail = (url: URL) => {
      const cursor = Number(url.searchParams.get("cursor") ?? "0");
      const includeTrace = url.searchParams.get("includeTrace") === "true";
      const includePlayerTrace = url.searchParams.get("includePlayerTrace") === "true";
      const page = (values: number[]) => values.map((timestamp) => ({ timestamp, userId, score: timestamp * 10, rank: 1 }));
      const payload: Record<string, unknown> = {
        meta: { server: "en", eventId: 179, scope: "world-bloom/21", characterId: 21, fetchedAt: 1_700_000_500 },
        current: { rankData: { rank: 1, userId, score: 4_000, timestamp: 400 }, userData: { userId, name: "World Link player", cardId: 1235 } },
        next: { rankData: { rank: 2, userId: "b".repeat(64), score: 3_900, timestamp: 400 }, userData: { name: "next" } },
        intervalSeconds: 3600,
        windowStart: 1,
        windowEnd: 400
      };
      if (includeTrace) payload.rankTrace = cursor === 0 ? page([100, 200]) : cursor === 200 ? page([200, 300]) : [{ ...page([400])[0] }];
      if (includePlayerTrace) payload.playerTrace = cursor === 0 ? page([100, 200]) : cursor === 200 ? [{ timestamp: 250, userId: "wrong-user", score: 2500, rank: 1 }, ...page([300])] : [{ ...page([400])[0] }];
      return payload;
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/overview")) {
        return new Response(JSON.stringify({
          meta: { server: "en", eventId: 179, scope: "world-bloom/21", characterId: 21 },
          topPlayerGrowths: [{ userId, scoreLatest: 4000, scoreEarlier: 400, timestampLatest: 400, timestampEarlier: 100, timeDiff: 300, growth: 3600 }],
          topRankGrowths: [{ rank: 1, scoreLatest: 4000, scoreEarlier: 400, timestampLatest: 400, timestampEarlier: 100, timeDiff: 300, growth: 3600 }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.pathname.includes("/world-bloom/21/details/rank/1")) return new Response(JSON.stringify(detail(url)), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await harukiClient.getWorldLinkRankingPlayerDetail("en", "179", 21, 1);

    expect(result).toMatchObject({ userId, rank: 1, hourlyGrowth: 43200, rankHourlyGrowth: 43200, traceCompleteness: "partial" });
    expect(result.playerTrace.map((item: any) => item.timestamp)).toEqual([100, 200, 300, 400]);
    expect(result.rankTrace.map((item: any) => item.timestamp)).toEqual([100, 200, 300, 400]);
    expect(result.traceCoverage).toMatchObject({
      playerTrace: { complete: false, pages: 3, excludedIdentityRecords: 1, termination: "identity-mismatch" },
      rankTrace: { complete: true, pages: 3, termination: "exhausted" }
    });
    const detailRequests = fetchMock.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname.includes("/details/rank/1"));
    expect(detailRequests.map((url) => url.searchParams.get("cursor")).filter(Boolean)).toEqual(["200", "200", "300", "300"]);
    expect(detailRequests.every((url) => url.searchParams.get("limit") === "2" && url.searchParams.get("interval") === "3600")).toBe(true);
  });

  it.each([
    ["wrong character", { server: "en", eventId: 179, scope: "world-bloom/22", characterId: 22 }, "scope mismatch"],
    ["wrong event", { server: "en", eventId: 180, scope: "world-bloom/21", characterId: 21 }, "event mismatch"],
    ["current UID mismatch", { server: "en", eventId: 179, scope: "world-bloom/21", characterId: 21 }, "current userId mismatch"]
  ])("rejects a World Link detail with %s", async (_label, meta, message) => {
    const userId = "a".repeat(64);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      meta,
      current: { rankData: { rank: 1, userId, score: 1, timestamp: 1 }, userData: { userId: message.includes("current userId") ? "b".repeat(64) : userId, name: "player" } },
      rankTrace: [], playerTrace: []
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(harukiClient.getWorldLinkRankingPlayerDetail("en", "179", 21, 1)).rejects.toThrow(message);
  });
  it("rejects a World Link overview whose scope does not match the requested character", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      meta: { server: "en", eventId: 179, scope: "world-bloom/22", characterId: 22 },
      topRankings: [{ rankData: { rank: 1, score: 700, timestamp: 1_700_000_100 }, userData: {} }]
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(harukiClient.getWorldLinkRankingSnapshot("en", "179", 21)).rejects.toThrow("scope mismatch");
  });
});

