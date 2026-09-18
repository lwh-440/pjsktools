import type { RegionId } from "./config.js";
import type { RealtimeRankingEntry, RealtimeRankingSnapshot, RealtimeWorldLinkGroupSnapshot } from "./realtimeRankingClient.js";

const TOOLBOX_API_BASE = "https://toolbox-api-direct.haruki.seiunx.com";
const commonBorderRanks = [500, 1000, 2000, 5000];

export type RankingBorderHourlyGrowth = {
  region: RegionId;
  eventId: string;
  rank: number;
  hourlyGrowth: number;
  sampleSpanSeconds: number;
  source: string;
};

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
const overviewCache = new Map<string, { expiresAt: number; value: any }>();
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
  overviewCache.clear();
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

async function fetchToolboxOverviewCached(region: RegionId, eventId: string, intervalSeconds = 3600) {
  const key = `${region}:${eventId}:${intervalSeconds}`;
  const cached = overviewCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchToolboxOverview(region, eventId, intervalSeconds);
  overviewCache.set(key, {
    expiresAt: Date.now() + numericEnvironmentValue("HARUKI_OVERVIEW_CACHE_MS", 15_000),
    value
  });
  return value;
}

function isoFromEventTrackerTimestamp(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return new Date((timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000)).toISOString();
}

function assertWorldLinkOverviewContext(overview: any, region: RegionId, eventId: string, gameCharacterId: number) {
  const meta = overview?.meta;
  if (String(meta?.server ?? "").toLowerCase() !== region) throw new Error(`Haruki World Link overview region mismatch: expected ${region}`);
  if (String(meta?.eventId ?? "") !== eventId) throw new Error(`Haruki World Link overview event mismatch: expected ${eventId}`);
  if (String(meta?.scope ?? "") !== `world-bloom/${gameCharacterId}`) throw new Error(`Haruki World Link overview scope mismatch: expected world-bloom/${gameCharacterId}`);
  if (Number(meta?.characterId) !== gameCharacterId) throw new Error(`Haruki World Link overview character mismatch: expected ${gameCharacterId}`);
}
function sourceNumber(value: unknown) {
  if (value === null || value === undefined || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

type WorldLinkTraceCoverage = {
  complete: boolean;
  pages: number;
  records: number;
  termination: "exhausted" | "page-cap" | "record-cap" | "cursor-stalled" | "invalid-page" | "identity-mismatch";
  oldestTimestamp?: number;
  newestTimestamp?: number;
  excludedIdentityRecords?: number;
  invalidRecords?: number;
};

type NormalizedWorldLinkTrace = {
  rawCount: number;
  cursor?: number;
  records: Record<string, unknown>[];
  excludedIdentityRecords: number;
  invalidRecords: number;
};

function positiveIntegerEnvironmentValue(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

function worldLinkTracePageLimit() { return positiveIntegerEnvironmentValue("HARUKI_WORLD_LINK_TRACE_PAGE_LIMIT", 100, 5_000); }
function worldLinkTracePageCap() { return positiveIntegerEnvironmentValue("HARUKI_WORLD_LINK_TRACE_MAX_PAGES", 20, 100); }
function worldLinkTraceRecordCap() { return positiveIntegerEnvironmentValue("HARUKI_WORLD_LINK_TRACE_MAX_RECORDS", 2_000, 100_000); }

function tracePointTimestamp(value: unknown) {
  const timestamp = sourceNumber((value as any)?.timestamp);
  return timestamp !== undefined && timestamp > 0 ? timestamp : undefined;
}

function normalizeWorldLinkTrace(points: unknown, expectedUserId?: string): NormalizedWorldLinkTrace {
  if (!Array.isArray(points)) {
    return { rawCount: 0, records: [], excludedIdentityRecords: 0, invalidRecords: 1 };
  }
  const seen = new Set<string>();
  let excludedIdentityRecords = 0;
  let invalidRecords = 0;
  const records = points.flatMap((point) => {
    const timestamp = tracePointTimestamp(point);
    const score = sourceNumber((point as any)?.score);
    const rank = sourceNumber((point as any)?.rank);
    const userId = String((point as any)?.userId ?? "").trim();
    if (timestamp === undefined || score === undefined || score < 0 || rank === undefined || !Number.isInteger(rank) || rank < 1 || !userId) {
      invalidRecords += 1;
      return [];
    }
    if (expectedUserId && userId !== expectedUserId) {
      excludedIdentityRecords += 1;
      return [];
    }
    const key = String(timestamp) + ":" + userId + ":" + String(rank) + ":" + String(score);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...(point as Record<string, unknown>), timestamp, score, rank, userId }];
  }).sort((left, right) => Number(left.timestamp) - Number(right.timestamp));
  return {
    rawCount: points.length,
    cursor: points.length ? tracePointTimestamp(points.at(-1)) : undefined,
    records,
    excludedIdentityRecords,
    invalidRecords
  };
}

function assertWorldLinkDetailContext(detail: any, region: RegionId, eventId: string, gameCharacterId: number, rank: number) {
  assertWorldLinkOverviewContext(detail, region, eventId, gameCharacterId);
  const rankData = detail?.current?.rankData;
  const userData = detail?.current?.userData;
  if (Number(rankData?.rank) !== rank) throw new Error("Haruki World Link detail rank mismatch: expected " + rank);
  const rankUserId = String(rankData?.userId ?? "").trim();
  const profileUserId = String(userData?.userId ?? "").trim();
  if (!rankUserId) throw new Error("Haruki World Link detail is missing current userId");
  if (profileUserId && profileUserId !== rankUserId) throw new Error("Haruki World Link detail current userId mismatch");
  return rankUserId;
}

function normalizedOfficialGrowth(item: any) {
  const scoreLatest = sourceNumber(item?.scoreLatest);
  const scoreEarlier = sourceNumber(item?.scoreEarlier);
  const timestampLatest = sourceNumber(item?.timestampLatest);
  const timestampEarlier = sourceNumber(item?.timestampEarlier);
  const timeDiff = sourceNumber(item?.timeDiff);
  const growth = sourceNumber(item?.growth);
  if ([scoreLatest, scoreEarlier, timestampLatest, timestampEarlier, timeDiff, growth].some((value) => value === undefined)) return undefined;
  if (timeDiff! <= 0 || timestampLatest! <= timestampEarlier! || Math.abs((timestampLatest! - timestampEarlier!) - timeDiff!) > 120) return undefined;
  if (scoreLatest! - scoreEarlier! !== growth!) return undefined;
  return { scoreLatest, scoreEarlier, timestampLatest, timestampEarlier, timeDiff, growth, hourlyGrowth: Math.round(growth! * 3_600 / timeDiff!) };
}

async function fetchWorldLinkRankingDetailPage(region: RegionId, eventId: string, gameCharacterId: number, rank: number, options: { includeTrace: boolean; includePlayerTrace: boolean; cursor?: number; limit: number }) {
  const params = new URLSearchParams({ includeTrace: String(options.includeTrace), includePlayerTrace: String(options.includePlayerTrace), limit: String(options.limit), interval: "3600" });
  if (options.cursor !== undefined) params.set("cursor", String(options.cursor));
  const url = TOOLBOX_API_BASE + "/event-tracker/api/v2/web/events/" + region + "/" + eventId + "/leaderboards/world-bloom/" + gameCharacterId + "/details/rank/" + rank + "?" + params;
  const detail = await fetchHarukiJson<any>(url, "World Link ranking detail");
  const currentUserId = assertWorldLinkDetailContext(detail, region, eventId, gameCharacterId, rank);
  return { detail, url, currentUserId };
}

async function fetchCompleteWorldLinkTrace(
  initial: unknown,
  expectedUserId: string | undefined,
  pageLimit: number,
  fetchPage: (cursor: number) => Promise<{ points: unknown; currentUserId: string }>
): Promise<{ records: Record<string, unknown>[]; coverage: WorldLinkTraceCoverage }> {
  const first = normalizeWorldLinkTrace(initial, expectedUserId);
  const records = [...first.records];
  let pages = 1;
  let cursor = first.cursor;
  let excludedIdentityRecords = first.excludedIdentityRecords;
  let invalidRecords = first.invalidRecords;
  let termination: WorldLinkTraceCoverage["termination"] = first.rawCount < pageLimit ? "exhausted" : "page-cap";
  let complete = first.rawCount < pageLimit;

  while (!complete) {
    if (pages >= worldLinkTracePageCap()) { termination = "page-cap"; break; }
    if (records.length >= worldLinkTraceRecordCap()) { termination = "record-cap"; break; }
    if (cursor === undefined) { termination = "invalid-page"; break; }
    const previousCursor = cursor;
    const response = await fetchPage(previousCursor);
    pages += 1;
    if (expectedUserId && response.currentUserId !== expectedUserId) { termination = "identity-mismatch"; break; }
    const next = normalizeWorldLinkTrace(response.points, expectedUserId);
    excludedIdentityRecords += next.excludedIdentityRecords;
    invalidRecords += next.invalidRecords;
    if (next.rawCount === 0) { complete = true; termination = "exhausted"; break; }
    if (next.cursor === undefined) { termination = "invalid-page"; break; }
    if (next.cursor <= previousCursor) { termination = "cursor-stalled"; break; }
    records.push(...next.records.filter((record) => Number(record.timestamp) > previousCursor));
    cursor = next.cursor;
    if (next.rawCount < pageLimit) { complete = true; termination = "exhausted"; }
  }

  const bounded = records.slice(0, worldLinkTraceRecordCap());
  if (bounded.length < records.length) { complete = false; termination = "record-cap"; }
  if (complete && (invalidRecords > 0 || excludedIdentityRecords > 0)) {
    complete = false;
    termination = excludedIdentityRecords > 0 ? "identity-mismatch" : "invalid-page";
  }
  return {
    records: bounded,
    coverage: {
      complete,
      pages,
      records: bounded.length,
      termination,
      oldestTimestamp: tracePointTimestamp(bounded[0]),
      newestTimestamp: tracePointTimestamp(bounded.at(-1)),
      ...(expectedUserId ? { excludedIdentityRecords } : {}),
      ...(invalidRecords ? { invalidRecords } : {})
    }
  };
}

export function normalizeRankingBorderHourlyGrowths(
  overview: unknown,
  region: RegionId,
  eventId: string,
  nowMs = Date.now()
): RankingBorderHourlyGrowth[] {
  const rows = Array.isArray((overview as any)?.borderGrowths) ? (overview as any).borderGrowths : [];
  const nowSeconds = nowMs / 1000;
  const seenRanks = new Set<number>();
  const result: RankingBorderHourlyGrowth[] = [];
  for (const row of rows) {
    const rank = sourceNumber(row?.rank);
    const growth = sourceNumber(row?.growth);
    const timeDiff = sourceNumber(row?.timeDiff);
    const latest = sourceNumber(row?.timestampLatest);
    const earlier = sourceNumber(row?.timestampEarlier);
    if (rank === undefined || growth === undefined || timeDiff === undefined || latest === undefined || earlier === undefined) continue;
    if (!Number.isInteger(rank) || rank <= 100 || seenRanks.has(rank)) continue;
    if (timeDiff <= 0 || timeDiff > 3_600 || latest <= earlier || Math.abs((latest - earlier) - timeDiff) > 120) continue;
    if (latest < nowSeconds - 15 * 60 || latest > nowSeconds + 5 * 60) continue;
    seenRanks.add(rank);
    result.push({
      region,
      eventId,
      rank,
      hourlyGrowth: Math.round(growth * 3_600 / timeDiff),
      sampleSpanSeconds: Math.round(timeDiff),
      source: "haruki-border-growths"
    });
  }
  return result;
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
  async getRankingLatestSnapshot(region: RegionId, eventId: string): Promise<RealtimeRankingSnapshot> {
    const [top100, borders] = await Promise.all([
      this.getRankingTop100(region, eventId),
      this.getRankingBorder(region, eventId)
    ]);
    const byRank = new Map<number, RealtimeRankingEntry>();
    for (const entry of [...top100, ...borders]) {
      if (!Number.isInteger(entry.rank) || entry.rank <= 0 || !Number.isFinite(entry.score)) continue;
      if (!byRank.has(entry.rank)) byRank.set(entry.rank, entry);
    }
    const entries = [...byRank.values()].sort((left, right) => left.rank - right.rank);
    if (!entries.length) {
      throw new HarukiRequestError("upstream-error", 502, { operation: "ranking latest snapshot" });
    }
    const updatedAt = new Date().toISOString();
    return {
      region,
      eventId,
      updatedAt,
      entries: entries.map((entry) => ({ ...entry, updatedAt })),
      sourceLine: "main",
      sourceUrl: `${TOOLBOX_API_BASE}/event-tracker/api/v2/web/events/${region}/${eventId}/leaderboards/total`
    };
  }

  async getEventTrackerOverallSnapshot(region: RegionId, eventId: string): Promise<RealtimeRankingSnapshot> {
    const url = `${TOOLBOX_API_BASE}/event-tracker/api/v2/web/events/${region}/${eventId}/leaderboards/total/overview?interval=3600`;
    const overview = await fetchHarukiJson<any>(url, "ranking overview");
    const meta = overview?.meta;
    if (String(meta?.server ?? "").toLowerCase() !== region) throw new Error(`Haruki overview region mismatch: expected ${region}`);
    if (String(meta?.eventId ?? "") !== eventId) throw new Error(`Haruki overview event mismatch: expected ${eventId}`);
    if (String(meta?.scope ?? "") !== "total") throw new Error("Haruki overview scope mismatch: expected total");
    const rows = [...(Array.isArray(overview?.topRankings) ? overview.topRankings : []), ...(Array.isArray(overview?.borderLines) ? overview.borderLines : [])];
    const updatedAt = rows.map((item) => isoFromEventTrackerTimestamp(item?.rankData?.timestamp ?? item?.timestamp)).filter((value): value is string => Boolean(value)).sort().at(-1);
    if (!updatedAt) throw new HarukiRequestError("upstream-error", 502, { operation: "ranking overview timestamp" });
    const entriesByRank = new Map<number, RealtimeRankingEntry>();
    for (const item of rows) {
      const rank = Number(item?.rankData?.rank ?? item?.rank);
      const score = Number(item?.rankData?.score ?? item?.score);
      if (!Number.isInteger(rank) || rank < 1 || !Number.isFinite(score) || score < 0 || entriesByRank.has(rank)) continue;
      const rowUpdatedAt = isoFromEventTrackerTimestamp(item?.rankData?.timestamp ?? item?.timestamp) ?? updatedAt;
      const player = item?.rankData ? normalizePlayerItem(item, region, eventId, rowUpdatedAt) : null;
      entriesByRank.set(rank, player ?? { rank, score, region, eventId, updatedAt: rowUpdatedAt, source: "haruki-event-tracker" });
    }
    const entries = [...entriesByRank.values()].sort((left, right) => left.rank - right.rank);
    if (!entries.length) throw new HarukiRequestError("upstream-error", 502, { operation: "ranking overview" });
    return { region, eventId, updatedAt, entries, sourceLine: "main", sourceUrl: url };
  }
  async getWorldLinkRankingSnapshot(region: RegionId, eventId: string, gameCharacterId: number): Promise<RealtimeWorldLinkGroupSnapshot> {
    if (!Number.isInteger(gameCharacterId) || gameCharacterId < 1) throw new Error("World Link ranking requires a valid gameCharacterId");
    const url = `${TOOLBOX_API_BASE}/event-tracker/api/v2/web/events/${region}/${eventId}/leaderboards/world-bloom/${gameCharacterId}/overview?interval=3600`;
    const overview = await fetchHarukiJson<any>(url, "World Link ranking overview");
    assertWorldLinkOverviewContext(overview, region, eventId, gameCharacterId);
    const rows = [
      ...(Array.isArray(overview?.topRankings) ? overview.topRankings : []),
      ...(Array.isArray(overview?.borderLines) ? overview.borderLines : [])
    ];
    const updatedAt = rows.map((item) => isoFromEventTrackerTimestamp(item?.rankData?.timestamp ?? item?.timestamp)).filter((value): value is string => Boolean(value)).sort().at(-1);
    if (!updatedAt) throw new HarukiRequestError("upstream-error", 502, { operation: "World Link ranking overview timestamp" });
    const entriesByRank = new Map<number, RealtimeRankingEntry>();
    for (const item of rows) {
      const rank = Number(item?.rankData?.rank ?? item?.rank);
      const score = Number(item?.rankData?.score ?? item?.score);
      if (!Number.isInteger(rank) || rank < 1 || !Number.isFinite(score) || score < 0 || entriesByRank.has(rank)) continue;
      const rowUpdatedAt = isoFromEventTrackerTimestamp(item?.rankData?.timestamp ?? item?.timestamp) ?? updatedAt;
      const player = item?.rankData ? normalizePlayerItem(item, region, eventId, rowUpdatedAt) : null;
      entriesByRank.set(rank, player ?? { rank, score, region, eventId, updatedAt: rowUpdatedAt, source: "haruki-event-tracker" });
    }
    const entries = [...entriesByRank.values()].sort((left, right) => left.rank - right.rank);
    if (!entries.length) throw new HarukiRequestError("upstream-error", 502, { operation: "World Link ranking overview" });
    return { region, eventId, updatedAt, entries, sourceLine: "main", sourceUrl: url, gameCharacterId, isWorldBloomChapterAggregate: false };
  }
  async getWorldLinkRankingPlayerDetail(region: RegionId, eventId: string, gameCharacterId: number, rank: number) {
    if (!Number.isInteger(gameCharacterId) || gameCharacterId < 1) throw new Error("World Link ranking requires a valid gameCharacterId");
    if (!Number.isInteger(rank) || rank < 1) throw new Error("World Link ranking detail requires a valid rank");
    const pageLimit = worldLinkTracePageLimit();
    const first = await fetchWorldLinkRankingDetailPage(region, eventId, gameCharacterId, rank, { includeTrace: true, includePlayerTrace: true, limit: pageLimit });
    const updatedAt = isoFromEventTrackerTimestamp(first.detail.current?.rankData?.timestamp ?? first.detail.meta?.fetchedAt);
    if (!updatedAt) throw new HarukiRequestError("upstream-error", 502, { operation: "World Link ranking detail timestamp" });
    const current = normalizePlayerItem(first.detail.current, region, eventId, updatedAt);
    const next = normalizePlayerItem(first.detail.next, region, eventId, updatedAt);
    if (!current || current.rank !== rank) throw new Error("World Link ranking player detail not found");
    const [rankTrace, playerTrace] = await Promise.all([
      fetchCompleteWorldLinkTrace(first.detail.rankTrace, undefined, pageLimit, async (cursor) => {
        const page = await fetchWorldLinkRankingDetailPage(region, eventId, gameCharacterId, rank, { includeTrace: true, includePlayerTrace: false, cursor, limit: pageLimit });
        return { points: page.detail.rankTrace, currentUserId: page.currentUserId };
      }),
      fetchCompleteWorldLinkTrace(first.detail.playerTrace, current.userId, pageLimit, async (cursor) => {
        const page = await fetchWorldLinkRankingDetailPage(region, eventId, gameCharacterId, rank, { includeTrace: false, includePlayerTrace: true, cursor, limit: pageLimit });
        return { points: page.detail.playerTrace, currentUserId: page.currentUserId };
      })
    ]);
    const overview = await (async () => {
      const url = `${TOOLBOX_API_BASE}/event-tracker/api/v2/web/events/${region}/${eventId}/leaderboards/world-bloom/${gameCharacterId}/overview?interval=3600`;
      try {
        const value = await fetchHarukiJson<any>(url, "World Link ranking overview");
        assertWorldLinkOverviewContext(value, region, eventId, gameCharacterId);
        return value;
      } catch { return null; }
    })();
    const playerGrowth = normalizedOfficialGrowth((Array.isArray(overview?.topPlayerGrowths) ? overview.topPlayerGrowths : []).find((item: any) => String(item?.userId ?? "") === current.userId));
    const rankGrowth = normalizedOfficialGrowth((Array.isArray(overview?.topRankGrowths) ? overview.topRankGrowths : []).find((item: any) => Number(item?.rank) === rank));
    return {
      ...current,
      ...(playerGrowth ?? {}),
      next,
      fetchedAt: first.detail.meta?.fetchedAt,
      intervalSeconds: first.detail.intervalSeconds,
      windowStart: first.detail.windowStart,
      windowEnd: first.detail.windowEnd,
      rankScoreLatest: rankGrowth?.scoreLatest,
      rankScoreEarlier: rankGrowth?.scoreEarlier,
      rankTimestampLatest: rankGrowth?.timestampLatest,
      rankTimestampEarlier: rankGrowth?.timestampEarlier,
      rankTimeDiff: rankGrowth?.timeDiff,
      rankGrowth: rankGrowth?.growth,
      rankHourlyGrowth: rankGrowth?.hourlyGrowth,
      inTop100Range: current.rank >= 1 && current.rank <= 100,
      playerTrace: playerTrace.records,
      rankTrace: rankTrace.records,
      traceCoverage: { playerTrace: playerTrace.coverage, rankTrace: rankTrace.coverage },
      traceCompleteness: rankTrace.coverage.complete && playerTrace.coverage.complete ? "complete" : "partial",
      sourceUrl: first.url
    };
  }
  async getRankingBorderHourlyGrowths(region: RegionId, eventId: string) {
    const overview = await fetchToolboxOverviewCached(region, eventId, 3600);
    return normalizeRankingBorderHourlyGrowths(overview, region, eventId);
  }

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
      const overview = await fetchToolboxOverviewCached(region, eventId);
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
    const overview = await fetchToolboxOverviewCached(region, eventId).catch(() => null);
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


