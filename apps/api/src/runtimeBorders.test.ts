import { describe, expect, it } from "vitest";
import { normalizeHourlyGrowth, normalizeParkingPeriods } from "./realtimeRankingClient.js";
import { normalizeRankingBorderHourlyGrowths } from "./harukiClient.js";
import { attachRankingBorderHourlyGrowth, attachRankingHourlyGrowth, mergeRealtimeBorderLines } from "./runtimeData.js";

const region = "jp" as const;
const eventId = "216";
const at = (rank: number, score: number, updatedAt = "2026-09-09T00:00:00.000Z") => ({ rank, score, region, eventId, updatedAt, source: "latest" });
const tier = (rank: number, score: number, updatedAt = "2026-09-09T00:00:00.000Z") => ({ rank, score, updatedAt, sourceLine: "main" as const, sourceUrl: "tier-series" });

describe("mergeRealtimeBorderLines", () => {
  it("keeps later actual latest ranks that tier-series does not provide", () => {
    const lines = mergeRealtimeBorderLines(region, eventId, [at(200, 2200), at(300, 1800)], []);
    expect(lines).toMatchObject([{ rank: 200, score: 2200 }, { rank: 300, score: 1800 }]);
  });

  it("keeps tier-series-only ranks and uses the newer value for duplicate ranks", () => {
    const lines = mergeRealtimeBorderLines(region, eventId, [at(300, 3300, "2026-09-09T00:01:00.000Z")], [tier(200, 2100), tier(300, 3000)]);
    expect(lines).toMatchObject([{ rank: 200, score: 2100 }, { rank: 300, score: 3300 }]);
  });

  it("does not invent a border from ordinary non-configured Top 100 players", () => {
    const lines = mergeRealtimeBorderLines(region, eventId, [at(57, 9999)], []);
    expect(lines).toEqual([]);
  });
});

describe("attachRankingHourlyGrowth", () => {
  it("keeps reported zero but rejects empty upstream growth values", () => {
    expect(normalizeHourlyGrowth(0)).toBe(0);
    expect(normalizeHourlyGrowth("0")).toBe(0);
    expect(normalizeHourlyGrowth(null)).toBeUndefined();
    expect(normalizeHourlyGrowth("")).toBeUndefined();
    expect(normalizeHourlyGrowth("   ")).toBeUndefined();
    expect(normalizeHourlyGrowth(false)).toBeUndefined();
  });

  it("keeps upstream start_ms and end_ms parking periods closed", () => {
    expect(normalizeParkingPeriods([{ start_ms: 1_788_681_809_726, end_ms: 1_788_682_197_325, duration_s: 387 }, { start_ms: 1_788_923_961_386, duration_s: 2_712, active: true }])).toEqual([
      { startTime: 1_788_681_809_726, sinceMs: undefined, endTime: 1_788_682_197_325, durationSeconds: 387, active: false },
      { startTime: 1_788_923_961_386, sinceMs: undefined, endTime: undefined, durationSeconds: 2_712, active: true }
    ]);
  });

  it("does not turn missing parking values into epoch timestamps or zero-minute durations", () => {
    expect(normalizeParkingPeriods([{ start_ms: null, start_time: "", since_ms: 1_788_681_809_726, end_ms: null, duration_s: null }, { start_ms: true, duration_s: 0 }])).toEqual([
      { startTime: undefined, sinceMs: 1_788_681_809_726, endTime: undefined, durationSeconds: undefined, active: false },
      { startTime: undefined, sinceMs: undefined, endTime: undefined, durationSeconds: 0, active: false }
    ]);
  });

  it("matches real player growth by player ID and keeps a reported zero", () => {
    const entries = [{ ...at(1, 5000), userId: "player-a" }, { ...at(2, 4800), userId: "player-b" }];
    const result = attachRankingHourlyGrowth(entries, [
      { rank: 1, userId: "player-a", name: "A", score: 5000, growth1h: 0, churn1h: 0, churn20min: 0, churn48h: 0, hourlyChurn: [], recentScoreChanges: [], parkingPeriods: [] },
      { rank: 2, userId: "someone-else", name: "Other", score: 4800, growth1h: 321, churn1h: 0, churn20min: 0, churn48h: 0, hourlyChurn: [], recentScoreChanges: [], parkingPeriods: [] }
    ]);
    expect(result[0]?.hourlyGrowth).toBe(0);
    expect(result[1]?.hourlyGrowth).toBeUndefined();
  });

  it("matches a player ID even when the live rank changed, without matching an unknown ID by rank", () => {
    const result = attachRankingHourlyGrowth([{ ...at(3, 4600), userId: "player-c" }, { ...at(4, 4500), userId: undefined }], [
      { rank: 1, userId: "player-c", name: "Moved", score: 4600, growth1h: 222, churn1h: 0, churn20min: 0, churn48h: 0, hourlyChurn: [], recentScoreChanges: [], parkingPeriods: [] },
      { rank: 4, userId: "different-player", name: "Different", score: 4500, growth1h: undefined, churn1h: 0, churn20min: 0, churn48h: 0, hourlyChurn: [], recentScoreChanges: [], parkingPeriods: [] }
    ]);
    expect(result[0]?.hourlyGrowth).toBe(222);
    expect(result[1]?.hourlyGrowth).toBeUndefined();
  });
});

describe("border hourly growth", () => {
  it("normalizes Haruki's actual sampling window to an hourly rate and preserves zero", () => {
    const now = Date.parse("2026-09-09T00:20:00.000Z");
    const latest = Math.floor(now / 1000) - 60;
    const growths = normalizeRankingBorderHourlyGrowths({
      borderGrowths: [
        { rank: 200, growth: 0, timeDiff: 930, timestampLatest: latest, timestampEarlier: latest - 930 },
        { rank: 300, growth: 25_042, timeDiff: 930, timestampLatest: latest, timestampEarlier: latest - 930 }
      ]
    }, region, eventId, now);

    expect(growths).toMatchObject([
      { rank: 200, hourlyGrowth: 0, sampleSpanSeconds: 930 },
      { rank: 300, hourlyGrowth: 96_937, sampleSpanSeconds: 930 }
    ]);
  });

  it("rejects stale or malformed border samples and only attaches matching event data", () => {
    const now = Date.parse("2026-09-09T00:20:00.000Z");
    const latest = Math.floor(now / 1000) - 60;
    const invalid = normalizeRankingBorderHourlyGrowths({
      borderGrowths: [
        { rank: 200, growth: 50, timeDiff: 0, timestampLatest: latest, timestampEarlier: latest },
        { rank: 300, growth: 50, timeDiff: 930, timestampLatest: latest - 3_600, timestampEarlier: latest - 4_530 }
      ]
    }, region, eventId, now);
    expect(invalid).toEqual([]);

    const lines = attachRankingBorderHourlyGrowth(region, eventId, [at(200, 2_200), at(300, 2_000)], [
      { region, eventId, rank: 200, hourlyGrowth: 0, sampleSpanSeconds: 930, source: "haruki-border-growths" },
      { region, eventId: "other-event", rank: 300, hourlyGrowth: 99, sampleSpanSeconds: 930, source: "haruki-border-growths" }
    ]);
    expect(lines[0]).toMatchObject({ rank: 200, hourlyGrowth: 0, growthSampleSeconds: 930 });
    expect(lines[1]?.hourlyGrowth).toBeUndefined();
  });
});
