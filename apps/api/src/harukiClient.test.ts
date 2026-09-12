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
});
