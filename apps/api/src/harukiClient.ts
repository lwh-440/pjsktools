import type { RegionId } from "./config.js";

const TOOLBOX_API_BASE = "https://toolbox-api-direct.haruki.seiunx.com";
const commonBorderRanks = [500, 1000, 2000, 5000];

export type HarukiFailureKind = "not-found" | "rate-limited" | "upstream-error" | "network-error";
export type HarukiProfileFailureKind = HarukiFailureKind;

type HarukiRequestErrorOptions = {
  cause?: unknown;
  operation?: string;
  retryAfterMs?: number;
};

export class HarukiRequestError extends Error {
  public readonly operation: string;
  public readonly retryAfterMs?: number;

  constructor(
    public readonly kind: HarukiFailureKind,
    public readonly status?: number,
    options?: HarukiRequestErrorOptions
  ) {
    const operation = options?.operation ?? "request";
    super(status ? `Haruki ${operation} failed: ${status}` : `Haruki ${operation} failed: network error`, { cause: options?.cause });
    this.name = "HarukiRequestError";
    this.operation = operation;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export class HarukiProfileRequestError extends HarukiRequestError {
  constructor(
    public readonly kind: HarukiProfileFailureKind,
    public readonly status?: number,
    options?: HarukiRequestErrorOptions
  ) {
    super(kind, status, { ...options, operation: "profile" });
    this.name = "HarukiProfileRequestError";
  }
}

const inFlightRequests = new Map<string, Promise<unknown>>();
let requestTail: Promise<unknown> = Promise.resolve();
let nextRequestAt = 0;
let rateLimitedUntil = 0;

function numericEnvironmentValue(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function wait(milliseconds: number) {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

function requestError(kind: HarukiFailureKind, status: number | undefined, options: HarukiRequestErrorOptions) {
  return new HarukiRequestError(kind, status, options);
}

async function fetchHarukiJson<T>(
  url: string,
  operation: string,
  createError: (kind: HarukiFailureKind, status: number | undefined, options: HarukiRequestErrorOptions) => HarukiRequestError = requestError
): Promise<T> {
  const existing = inFlightRequests.get(url) as Promise<T> | undefined;
  if (existing) return existing;

  const execute = requestTail.then(async () => {
    const blockedFor = rateLimitedUntil - Date.now();
    if (blockedFor > 0) throw createError("rate-limited", 429, { operation, retryAfterMs: blockedFor });

    await wait(nextRequestAt - Date.now());
    const intervalMs = numericEnvironmentValue("HARUKI_REQUEST_INTERVAL_MS", 750);
    nextRequestAt = Date.now() + intervalMs;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    } catch (error) {
      throw createError("network-error", undefined, { cause: error, operation });
    }

    if (!response.ok) {
      const kind: HarukiFailureKind = response.status === 404
        ? "not-found"
        : response.status === 429
          ? "rate-limited"
          : "upstream-error";
      const upstreamRetryAfterMs = retryAfterMs(response);
      if (kind === "rate-limited") {
        const cooldownMs = upstreamRetryAfterMs ?? numericEnvironmentValue("HARUKI_RATE_LIMIT_COOLDOWN_MS", 15 * 60_000);
        rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + cooldownMs);
      }
      throw createError(kind, response.status, { operation, retryAfterMs: upstreamRetryAfterMs });
    }

    try {
      return await response.json() as T;
    } catch (error) {
      throw createError("upstream-error", response.status, { cause: error, operation });
    }
  });

  requestTail = execute.then(() => undefined, () => undefined);
  inFlightRequests.set(url, execute);
  execute.finally(() => inFlightRequests.delete(url)).catch(() => undefined);
  return execute;
}

export function resetHarukiRequestStateForTests() {
  inFlightRequests.clear();
  requestTail = Promise.resolve();
  nextRequestAt = 0;
  rateLimitedUntil = 0;
}

async function fetchToolboxLeaderboard(
  region: RegionId,
  eventId: string,
  rank: number,
  limit: number,
  includeTrace = false,
  includePlayerTrace = false,
  intervalSeconds?: number
) {
  const params = new URLSearchParams({
    includeTrace: String(includeTrace),
    includePlayerTrace: String(includePlayerTrace),
    limit: String(limit)
  });
  if (intervalSeconds) params.set("interval", String(intervalSeconds));
  const url = `${TOOLBOX_API_BASE}/event-tracker/api/v2/web/events/${region}/${eventId}/leaderboards/total/details/rank/${rank}?${params}`;
  return fetchHarukiJson<any>(url, "ranking request");
}

async function fetchToolboxOverview(region: RegionId, eventId: string, intervalSeconds = 3600) {
  const url = `${TOOLBOX_API_BASE}/event-tracker/api/v2/web/events/${region}/${eventId}/leaderboards/total/overview?interval=${intervalSeconds}`;
  return fetchHarukiJson<any>(url, "ranking overview");
}

function flattenLeaderboardItems(json: any) {
  return [json.current, json.next, ...(Array.isArray(json.list) ? json.list : [])].filter(Boolean);
}

function normalizePlayerItem(item: any, region: RegionId, eventId: string, updatedAt: string) {
  const rd = item?.rankData;
  const ud = item?.userData ?? {};
  if (!rd) return null;
  const playerName = ud.name ?? `Player ${rd.userId}`;
  return {
    rank: rd.rank,
    userId: rd.userId,
    name: playerName,
    playerName,
    score: rd.score,
    timestamp: rd.timestamp,
    cardId: ud.cardId,
    leaderCardId: ud.cardId,
    cardLevel: ud.cardLevel,
    leaderCardLevel: ud.cardLevel,
    cardMasterRank: ud.cardMasterRank,
    leaderCardMasterRank: ud.cardMasterRank,
    cardSpecialTrainingStatus: ud.cardSpecialTrainingStatus,
    leaderCardSpecialTrainingStatus: ud.cardSpecialTrainingStatus,
    cardDefaultImage: ud.cardDefaultImage,
    leaderCardImageUrl: ud.cardDefaultImage,
    profileWord: ud.profileWord,
    profileHonors: ud.profileHonors,
    region,
    eventId,
    updatedAt,
    source: "toolbox-api"
  };
}

function normalizeGrowth(item: any) {
  if (!item) return null;
  return {
    scoreLatest: item.scoreLatest,
    scoreEarlier: item.scoreEarlier,
    timestampLatest: item.timestampLatest,
    timestampEarlier: item.timestampEarlier,
    timeDiff: item.timeDiff,
    hourlyGrowth: item.growth
  };
}

export class HarukiClient {
  async getPlayerProfile(region: RegionId, userId: string) {
    return fetchHarukiJson<any>(
      `${TOOLBOX_API_BASE}/event-tracker/api/v2/web/players/${region}/${userId}/profile`,
      "profile",
      (kind, status, options) => new HarukiProfileRequestError(kind, status, options)
    );
  }

  async getRankingTop100(region: RegionId, eventId: string) {
    const entriesByRank = new Map<number, any>();
    const updatedAt = new Date().toISOString();
    try {
      const overview = await fetchToolboxOverview(region, eventId);
      const growthByUser = new Map((Array.isArray(overview.topPlayerGrowths) ? overview.topPlayerGrowths : []).map((item: any) => [item.userId, item]));
      const growthByRank = new Map((Array.isArray(overview.topRankGrowths) ? overview.topRankGrowths : []).map((item: any) => [item.rank, item]));
      for (const item of Array.isArray(overview.topRankings) ? overview.topRankings : []) {
        const entry = normalizePlayerItem(item, region, eventId, updatedAt);
        if (!entry || entry.rank < 1 || entry.rank > 100 || entriesByRank.has(entry.rank)) continue;
        const growth = normalizeGrowth(growthByUser.get(entry.userId) ?? growthByRank.get(entry.rank));
        entriesByRank.set(entry.rank, { ...entry, ...growth });
      }
    } catch (overviewError) {
      if (overviewError instanceof HarukiRequestError && overviewError.kind === "rate-limited") throw overviewError;
      const fallback = await fetchToolboxLeaderboard(region, eventId, 1, 100).catch((error) => {
        throw error instanceof HarukiRequestError ? error : overviewError;
      });
      for (const item of flattenLeaderboardItems(fallback)) {
        if (!item?.rankData) continue;
        const rd = item.rankData;
        if (rd.rank < 1 || rd.rank > 100 || entriesByRank.has(rd.rank)) continue;
        const entry = normalizePlayerItem(item, region, eventId, updatedAt);
        if (entry) entriesByRank.set(rd.rank, entry);
      }
    }

    const entries = Array.from(entriesByRank.values()).sort((a, b) => a.rank - b.rank);
    if (!entries.length) throw new HarukiRequestError("upstream-error", 502, { operation: "ranking top 100" });
    return entries;
  }

  async getRankingPlayerDetail(region: RegionId, eventId: string, rank: number) {
    const json = await fetchToolboxLeaderboard(region, eventId, rank, 10000, true, true, 3600);
    const overview = await fetchToolboxOverview(region, eventId).catch(() => null);
    const updatedAt = new Date().toISOString();
    const current = normalizePlayerItem(json.current, region, eventId, updatedAt);
    const next = normalizePlayerItem(json.next, region, eventId, updatedAt);
    if (!current) {
      throw new Error("Ranking player detail not found");
    }
    const playerTrace = Array.isArray(json.playerTrace) ? json.playerTrace : [];
    const rankTrace = Array.isArray(json.rankTrace) ? json.rankTrace : [];
    const playerGrowth = normalizeGrowth((Array.isArray(overview?.topPlayerGrowths) ? overview.topPlayerGrowths : []).find((item: any) => item.userId === current.userId));
    const rankGrowth = normalizeGrowth((Array.isArray(overview?.topRankGrowths) ? overview.topRankGrowths : []).find((item: any) => item.rank === current.rank));
    const currentTimestamp = current.timestamp ?? json.meta?.fetchedAt;
    const oneHourAgo = currentTimestamp ? currentTimestamp - 3600 : 0;
    const previousPoint = [...playerTrace].reverse().find((point) => point.timestamp <= oneHourAgo) ?? playerTrace[0];
    return {
      ...current,
      ...playerGrowth,
      next,
      fetchedAt: json.meta?.fetchedAt,
      intervalSeconds: overview?.intervalSeconds ?? json.intervalSeconds,
      windowStart: json.windowStart,
      windowEnd: json.windowEnd,
      hourlyGrowth: playerGrowth?.hourlyGrowth ?? (previousPoint ? Math.max(0, current.score - previousPoint.score) : 0),
      rankScoreLatest: rankGrowth?.scoreLatest,
      rankScoreEarlier: rankGrowth?.scoreEarlier,
      rankTimestampLatest: rankGrowth?.timestampLatest,
      rankTimestampEarlier: rankGrowth?.timestampEarlier,
      rankTimeDiff: rankGrowth?.timeDiff,
      rankHourlyGrowth: rankGrowth?.hourlyGrowth,
      inTop100Range: current.rank >= 1 && current.rank <= 100,
      playerTrace,
      rankTrace
    };
  }

  async getRankingBorder(region: RegionId, eventId: string) {
    const entries: Array<{
      rank: number;
      userId: string;
      score: number;
      region: string;
      eventId: string;
      updatedAt: string;
      source: string;
    }> = [];

    let firstError: unknown;
    for (const rank of commonBorderRanks) {
      let json: any;
      try {
        json = await fetchToolboxLeaderboard(region, eventId, rank, 1);
      } catch (error) {
        firstError ??= error;
        if (error instanceof HarukiRequestError && error.kind === "rate-limited") break;
        continue;
      }
      const item = json.current;
      if (!item?.rankData) continue;
      const rd = item.rankData;
      if (entries.some((entry) => entry.rank === rd.rank)) continue;
      entries.push({
        rank: rd.rank,
        userId: rd.userId,
        score: rd.score,
        region,
        eventId,
        updatedAt: new Date().toISOString(),
        source: "toolbox-api"
      });
    }

    if (!entries.length && firstError) throw firstError;
    return entries.sort((a, b) => a.rank - b.rank);
  }
}

export const harukiClient = new HarukiClient();
