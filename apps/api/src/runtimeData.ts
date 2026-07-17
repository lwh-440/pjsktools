import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config, type RegionId } from "./config.js";
import { harukiClient } from "./harukiClient.js";
import { fetchRealtimeChurn, fetchRealtimeLatest, fetchRealtimeTierSeries, fetchRealtimeWorldLinkLatest, type RealtimeChurnSnapshot, type RealtimeRankingEntry } from "./realtimeRankingClient.js";
import { getCharacterIconCandidates } from "./assets.js";
import { getCards, requestRankingAssetMasterSync } from "./masterData.js";
import { store } from "./store.js";
import type { PlayerProfile, RankingHistoryInput, RankingHistoryQuery, RankingSampleType } from "./types.js";

type RankingSample = { sampledAt: string; top100: unknown[]; borders: unknown[] };
type LiveRankingHealthStatus = "fresh" | "stale-refreshing" | "source-unavailable" | "fallback-haruki" | "no-active-event";
export type RankingChurnStatus = "fresh" | "stale-refreshing" | "source-unavailable" | "not-released" | "player-not-tracked" | "worldlink-context-missing";
export type RankingChurnResult = RealtimeChurnSnapshot & { status: RankingChurnStatus; stale?: boolean; errors?: string[] };
type LiveRankingSnapshot = {
  region: RegionId;
  eventId: string;
  currentEvent?: {
    id: string;
    name?: string;
    eventType?: string;
    startAt?: string;
    endAt?: string;
    assetbundleName?: string;
  };
  top100: unknown[];
  borderLines: unknown[];
  updatedAt: string;
  sourceHealth: {
    status: LiveRankingHealthStatus;
    primarySource: string;
    fallbackLine?: string;
    latestUpdatedAt?: string;
    cacheUpdatedAt?: string;
    stale?: boolean;
    errors?: string[];
  };
  boardType: "overall" | "worldlink";
  gameCharacterId?: number;
  worldLinkCharacters: Array<{ id: number; name: string; imageCandidates: string[] }>;
  worldLinkAvailable: boolean;
  staleRanks: number[];
  warnings: string[];
};

type RuntimeCache = {
  schemaVersion: number;
  updatedAt: string;
  watchedPlayers: Array<{ region: RegionId; userId: string }>;
  watchedRankings: Array<{ region: RegionId; eventId: string }>;
  players: Record<string, CacheEntry<PlayerProfile>>;
  liveRankings: Record<string, CacheEntry<LiveRankingSnapshot>>;
  rankingTop100: Record<string, CacheEntry<unknown[]>>;
  rankingBorders: Record<string, CacheEntry<unknown[]>>;
  rankingChurn: Record<string, CacheEntry<RealtimeChurnSnapshot>>;
  rankingSamples: Record<string, RankingSample[]>;
};

type CacheEntry<T> = {
  key: string;
  region: RegionId;
  updatedAt: string;
  source: string;
  data: T;
};

const schemaVersion = 4;
const fallbackCache: RuntimeCache = {
  schemaVersion,
  updatedAt: new Date(0).toISOString(),
  watchedPlayers: [],
  watchedRankings: [],
  players: {},
  liveRankings: {},
  rankingTop100: {},
  rankingBorders: {},
  rankingChurn: {},
  rankingSamples: {}
};
const commonBorderRanks = [1, 10, 20, 30, 40, 50, 100, 500, 1000, 2000, 5000, 10000];
const liveRankingRefreshes = new Map<string, Promise<LiveRankingSnapshot>>();
const rankingChurnRefreshes = new Map<string, Promise<RankingChurnResult>>();
const noWorldLinkProbe = { snapshot: null, errors: [] };

function getApiRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? cwd : path.join(cwd, "apps", "api");
}

function getCachePath() {
  return path.join(getApiRoot(), "data", "runtime-cache.json");
}

function playerKey(region: RegionId, userId: string) {
  return `${region}:${userId}`;
}

function rankingKey(region: RegionId, eventId: string, boardType: "overall" | "worldlink" = "overall", gameCharacterId?: number) {
  return boardType === "overall" ? `${region}:${eventId}` : `${region}:${eventId}:worldlink:${gameCharacterId ?? "unknown"}`;
}

function rankingChurnKey(region: RegionId, eventId: string, boardType: "overall" | "worldlink", gameCharacterId?: number) {
  return `${region}:${eventId}:${boardType}:${gameCharacterId ?? "overall"}`;
}

function rankNumber(item: any) {
  return Number(item?.rank ?? item?.targetRank ?? item?.borderRank ?? 0);
}

function scoreNumber(item: any) {
  return Number(item?.score ?? item?.point ?? item?.eventPoint ?? item?.userData?.score ?? 0);
}

function bucketIso(sampledAt: string) {
  const date = new Date(sampledAt);
  const bucketMs = Math.floor(date.getTime() / 60_000) * 60_000;
  return new Date(bucketMs).toISOString();
}

function historyInput(region: RegionId, eventId: string, sampleType: RankingSampleType, rows: unknown[], sampledAt: string, source: string): RankingHistoryInput[] {
  const inputs: RankingHistoryInput[] = [];
  for (const item of rows as any[]) {
    const rank = rankNumber(item);
    const score = scoreNumber(item);
    if (!Number.isFinite(rank) || rank <= 0) continue;
    inputs.push({
      region,
      eventId,
      sampleType,
      rank,
      score: Number.isFinite(score) && score >= 0 ? score : 0,
      sampledAt,
      bucketAt: bucketIso(sampledAt),
      playerName: item.playerName ?? item.name ?? item.userData?.name,
      userId: item.userId ?? item.userData?.userId ?? item.userData?.id,
      leaderCardId: item.leaderCardId ?? item.cardId ?? item.userData?.cardId,
      leaderCardImageUrl: item.leaderCardImageUrl ?? item.cardDefaultImage ?? item.userData?.cardDefaultImage,
      rawPayload: item,
      sourceMetadata: { source, persistedAt: new Date().toISOString() }
    });
  }
  return inputs;
}

async function persistRankingHistory(region: RegionId, eventId: string, sampleType: RankingSampleType, rows: unknown[], source: string, sampledAt = new Date().toISOString()) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return store.saveRankingHistorySamples(historyInput(region, eventId, sampleType, rows, sampledAt, source));
}

function normalizeRuntimeCache(cache: Partial<RuntimeCache>): RuntimeCache {
  return {
    ...fallbackCache,
    ...cache,
    schemaVersion,
    watchedPlayers: cache.watchedPlayers ?? [],
    watchedRankings: cache.watchedRankings ?? [],
    players: cache.players ?? {},
    liveRankings: cache.liveRankings ?? {},
    rankingTop100: cache.rankingTop100 ?? {},
    rankingBorders: cache.rankingBorders ?? {},
    rankingChurn: cache.rankingChurn ?? {},
    rankingSamples: cache.rankingSamples ?? {}
  };
}

function isFresh(entry: CacheEntry<unknown> | undefined, ttlMs: number) {
  return entry ? Date.now() - Date.parse(entry.updatedAt) < ttlMs : false;
}

async function readRuntimeCache(): Promise<RuntimeCache> {
  try {
    return normalizeRuntimeCache(JSON.parse(await readFile(getCachePath(), "utf-8")) as Partial<RuntimeCache>);
  } catch {
    return { ...fallbackCache };
  }
}

async function writeRuntimeCache(cache: RuntimeCache) {
  await mkdir(path.dirname(getCachePath()), { recursive: true });
  await writeFile(getCachePath(), `${JSON.stringify({ ...cache, updatedAt: new Date().toISOString(), schemaVersion }, null, 2)}\n`, "utf-8");
}

function rememberPlayer(cache: RuntimeCache, region: RegionId, userId: string) {
  if (!cache.watchedPlayers.some((item) => item.region === region && item.userId === userId)) {
    cache.watchedPlayers.push({ region, userId });
  }
}

function rememberRanking(cache: RuntimeCache, region: RegionId, eventId: string) {
  if (!cache.watchedRankings.some((item) => item.region === region && item.eventId === eventId)) {
    cache.watchedRankings.push({ region, eventId });
  }
}

function rememberRankingSample(cache: RuntimeCache, region: RegionId, eventId: string) {
  const key = rankingKey(region, eventId);
  const top100 = cache.rankingTop100[key]?.data ?? [];
  const borders = cache.rankingBorders[key]?.data ?? [];
  if (!Array.isArray(top100) && !Array.isArray(borders)) return;
  const series = cache.rankingSamples[key] ?? [];
  const previous = series.at(-1);
  if (previous && Date.now() - Date.parse(previous.sampledAt) < Math.min(config.rankingRefreshMs, 10_000)) return;
  series.push({ sampledAt: new Date().toISOString(), top100: Array.isArray(top100) ? top100 : [], borders: Array.isArray(borders) ? borders : [] });
  cache.rankingSamples[key] = series.slice(-240);
}

function currentEventSummary(event: unknown, eventId: string, fallback?: { startAt?: string; endAt?: string }) {
  const item = event as Record<string, any> | undefined;
  const itemId = String(item?.id ?? "");
  const itemMatches = itemId === eventId && !["none", "unknown"].includes(itemId);
  return {
    id: eventId,
    name: itemMatches && item?.name ? item.name : `活动 #${eventId}`,
    eventType: itemMatches ? item?.eventType : undefined,
    startAt: (itemMatches ? item?.startAt : undefined) ?? fallback?.startAt,
    endAt: (itemMatches ? item?.endAt : undefined) ?? fallback?.endAt,
    assetbundleName: itemMatches ? item?.assetbundleName : undefined
  };
}

async function worldLinkCharacters(region: RegionId, event: unknown) {
  const item = event as Record<string, any> | undefined;
  const ids = [...new Set((Array.isArray(item?.bonusCharacterIds) ? item.bonusCharacterIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const cards = await getCards(region);
  const labels = new Map(cards.filter((card) => card.characterId).map((card) => [Number(card.characterId), card.character]));
  return ids.map((id) => ({ id, name: labels.get(id) ?? `角色 ${id}`, imageCandidates: getCharacterIconCandidates(region, id) }));
}

export async function enrichRankingAssets<T extends RealtimeRankingEntry>(region: RegionId, entries: T[]) {
  const cards = await getCards(region);
  const cardsById = new Map(cards.map((card) => [String(card.id), card]));
  const missingLeaderCards = entries.some((entry) => entry.leaderCardId != null && !cardsById.has(String(entry.leaderCardId)));
  if (missingLeaderCards) requestRankingAssetMasterSync(region);
  return entries.map((entry) => {
      const card = entry.leaderCardId == null ? undefined : cardsById.get(String(entry.leaderCardId));
      const trained = (entry.leaderCardDefaultImage ?? entry.cardDefaultImage) === "special_training";
      const candidates = trained ? card?.assets?.afterTrainingThumbnailCandidates : card?.assets?.normalThumbnailCandidates;
      const leaderCardImageCandidates = Array.isArray(candidates) ? candidates : [];
      const leaderCharacterId = entry.leaderCharacterId ?? card?.characterId;
      return {
        ...entry,
        leaderCharacterId,
        leaderCardDefaultImage: entry.leaderCardDefaultImage ?? entry.cardDefaultImage,
        leaderCardImageCandidates,
        leaderCardImageUrl: leaderCardImageCandidates[0],
        leaderCharacterImageCandidates: getCharacterIconCandidates(region, leaderCharacterId),
        leaderAssetStatus: card ? (leaderCardImageCandidates.length ? "matched" : "asset-unavailable") : "card-master-missing"
      };
    });
}

async function normalizeTop100(region: RegionId, entries: RealtimeRankingEntry[]) {
  return enrichRankingAssets(region, entries.filter((entry) => entry.rank >= 1 && entry.rank <= 100).sort((a, b) => a.rank - b.rank));
}

async function rehydrateLiveRankingSnapshot(region: RegionId, snapshot: LiveRankingSnapshot): Promise<LiveRankingSnapshot> {
  return {
    ...snapshot,
    top100: await normalizeTop100(region, snapshot.top100 as RealtimeRankingEntry[])
  };
}

async function refreshRankingChurn(region: RegionId, eventId: string, options: { boardType: "overall" | "worldlink"; gameCharacterId?: number; top?: number }): Promise<RankingChurnResult> {
  const key = rankingChurnKey(region, eventId, options.boardType, options.gameCharacterId);
  const { snapshot, errors } = await fetchRealtimeChurn(region, options);
  if (snapshot.eventId !== eventId) throw new Error(`Realtime churn event mismatch: expected ${eventId}, got ${snapshot.eventId}`);
  const cache = await readRuntimeCache();
  cache.rankingChurn[key] = { key, region, updatedAt: snapshot.updatedAt, source: snapshot.sourceUrl, data: snapshot };
  await writeRuntimeCache(cache);
  return { ...snapshot, status: "fresh", errors };
}

function triggerRankingChurnRefresh(region: RegionId, eventId: string, options: { boardType: "overall" | "worldlink"; gameCharacterId?: number; top?: number }) {
  const key = rankingChurnKey(region, eventId, options.boardType, options.gameCharacterId);
  const running = rankingChurnRefreshes.get(key);
  if (running) return running;
  const promise = refreshRankingChurn(region, eventId, options).finally(() => rankingChurnRefreshes.delete(key));
  rankingChurnRefreshes.set(key, promise);
  return promise;
}

export async function getRankingChurnCached(region: RegionId, eventId: string, options: { boardType?: "overall" | "worldlink"; gameCharacterId?: number; top?: number; force?: boolean } = {}): Promise<RankingChurnResult> {
  const boardType = options.boardType ?? "overall";
  if (boardType === "worldlink" && !options.gameCharacterId) {
    return { region, eventId, boardType, updatedAt: new Date().toISOString(), entries: [], sourceLine: "main", sourceUrl: "", status: "worldlink-context-missing", errors: ["gameCharacterId is required for World Link churn"] };
  }
  const key = rankingChurnKey(region, eventId, boardType, options.gameCharacterId);
  const cache = await readRuntimeCache();
  const cached = cache.rankingChurn[key];
  if (!options.force && cached && isFresh(cached, Math.min(config.rankingRefreshMs, 30_000))) return { ...cached.data, status: "fresh" };
  if (!options.force && cached) {
    triggerRankingChurnRefresh(region, eventId, { boardType, gameCharacterId: options.gameCharacterId, top: options.top }).catch(() => undefined);
    return { ...cached.data, status: "stale-refreshing", stale: true };
  }
  try {
    return await triggerRankingChurnRefresh(region, eventId, { boardType, gameCharacterId: options.gameCharacterId, top: options.top });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status: RankingChurnStatus = /404/.test(message) ? "not-released" : "source-unavailable";
    return { region, eventId, boardType, gameCharacterId: options.gameCharacterId, updatedAt: new Date().toISOString(), entries: [], sourceLine: "main", sourceUrl: "", status, errors: [message] };
  }
}

export async function getRankingPlayerDetail(region: RegionId, eventId: string, rank: number, options: { boardType?: "overall" | "worldlink"; gameCharacterId?: number } = {}) {
  const raw = await harukiClient.getRankingPlayerDetail(region, eventId, rank) as Record<string, any>;
  const [live, churn] = await Promise.all([
    getLiveRankingCached(region, eventId, undefined, false, options).catch(() => null),
    getRankingChurnCached(region, eventId, { boardType: options.boardType, gameCharacterId: options.gameCharacterId, top: 100 }).catch(() => null)
  ]);
  const liveEntry = (live?.top100 as RealtimeRankingEntry[] | undefined)?.find((entry) => Number(entry.rank) === rank);
  const leaderCard = raw.leaderCard ?? raw.userCard ?? raw.card ?? {};
  const leaderCardId = raw.leaderCardId ?? raw.cardId ?? leaderCard.cardId ?? liveEntry?.leaderCardId;
  const leaderCardDefaultImage = raw.leaderCardDefaultImage ?? leaderCard.defaultImage ?? raw.cardDefaultImage ?? liveEntry?.leaderCardDefaultImage ?? liveEntry?.cardDefaultImage;
  const base = {
    ...liveEntry,
    ...raw,
    rank,
    leaderCardId: leaderCardId == null ? undefined : Number(leaderCardId),
    cardId: leaderCardId == null ? raw.cardId : Number(leaderCardId),
    leaderCardDefaultImage,
    cardDefaultImage: leaderCardDefaultImage,
    leaderCardMasterRank: raw.leaderCardMasterRank ?? leaderCard.masterRank ?? liveEntry?.leaderCardMasterRank,
    leaderCharacterId: raw.leaderCharacterId ?? leaderCard.characterId ?? liveEntry?.leaderCharacterId,
    leaderCardImageUrl: undefined,
    leaderCardImageCandidates: undefined,
    leaderCharacterImageCandidates: undefined
  } as RealtimeRankingEntry & Record<string, any>;
  const enriched = (await enrichRankingAssets(region, [base]))[0] as Record<string, any>;
  const observedPtUpdates = (() => {
    const trace = Array.isArray(raw.playerTrace) ? [...raw.playerTrace].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp)) : [];
    const latestTimestamp = Number(raw.timestamp ?? trace.at(-1)?.timestamp ?? 0);
    const recent = trace.filter((point: any) => Number(point.timestamp) >= latestTimestamp - 3600);
    return recent.slice(1).reduce((count: number, point: any, index: number) => count + (Number(point.score) !== Number(recent[index]?.score) ? 1 : 0), 0);
  })();
  const playerIds = new Set([enriched.userId, raw.userId, liveEntry?.userId].filter((value) => value != null).map(String));
  const churnEntry = churn?.entries.find((entry) => entry.userId && playerIds.has(String(entry.userId)))
    ?? churn?.entries.find((entry) => entry.isTierLine && entry.rank === rank);
  return {
    ...enriched,
    churnSource: churnEntry ? churn?.sourceUrl : undefined,
    churnStatus: churnEntry ? churn?.status : churn?.status === "fresh" ? "player-not-tracked" : churn?.status ?? "source-unavailable",
    churn1h: churnEntry?.churn1h,
    churn20min: churnEntry?.churn20min,
    churn48h: churnEntry?.churn48h,
    growth1h: churnEntry?.growth1h,
    hourlyChurn: churnEntry?.hourlyChurn ?? [],
    recentScoreChanges: churnEntry?.recentScoreChanges ?? [],
    parkingPeriods: churnEntry?.parkingPeriods ?? [],
    churnUpdatedAt: churn?.updatedAt,
    observedPtUpdates
  };
}

function normalizeBorders(entries: RealtimeRankingEntry[]) {
  const byRank = new Map(entries.map((entry) => [entry.rank, entry]));
  return commonBorderRanks
    .map((rank) => byRank.get(rank))
    .filter((entry): entry is RealtimeRankingEntry => Boolean(entry))
    .map((entry) => ({
      rank: entry.rank,
      userId: entry.userId,
      score: entry.score,
      region: entry.region,
      eventId: entry.eventId,
      updatedAt: entry.updatedAt,
      source: entry.source
    }));
}

function staleLiveSnapshot(entry: CacheEntry<LiveRankingSnapshot>, errors: string[] = []): LiveRankingSnapshot {
  const currentEvent = currentEventSummary(entry.data.currentEvent, entry.data.eventId, entry.data.currentEvent);
  return {
    ...entry.data,
    currentEvent,
    sourceHealth: {
      ...entry.data.sourceHealth,
      status: "stale-refreshing",
      stale: true,
      cacheUpdatedAt: entry.updatedAt,
      errors: [...(entry.data.sourceHealth.errors ?? []), ...errors].slice(-8)
    },
    warnings: [...new Set([...entry.data.warnings, "Returning stale ranking cache while refreshing upstream sources"])]
  };
}

function unavailableLiveSnapshot(region: RegionId, eventId: string, event: unknown, errors: string[]): LiveRankingSnapshot {
  return {
    region,
    eventId,
    currentEvent: currentEventSummary(event, eventId),
    top100: [],
    borderLines: [],
    updatedAt: new Date().toISOString(),
    sourceHealth: {
      status: eventId === "none" ? "no-active-event" : "source-unavailable",
      primarySource: "rks-n",
      errors
    },
    boardType: "overall",
    worldLinkCharacters: [],
    worldLinkAvailable: false,
    staleRanks: [],
    warnings: eventId === "none" ? ["No active event"] : ["Realtime ranking source unavailable and no usable cache exists"]
  };
}

function latestLiveRankingForRegion(cache: RuntimeCache, region: RegionId) {
  return Object.values(cache.liveRankings)
    .filter((entry) => entry.region === region)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

async function refreshLiveRanking(
  region: RegionId,
  eventId: string,
  event?: unknown,
  knownLatest?: Awaited<ReturnType<typeof fetchRealtimeLatest>>,
  knownTierSeries?: Awaited<ReturnType<typeof fetchRealtimeTierSeries>>,
  knownWorldLink?: Awaited<ReturnType<typeof fetchRealtimeWorldLinkLatest>>,
  options: { boardType: "overall" | "worldlink"; gameCharacterId?: number } = { boardType: "overall" }
): Promise<LiveRankingSnapshot> {
  const key = rankingKey(region, eventId, options.boardType, options.gameCharacterId);
  const cache = await readRuntimeCache();
  rememberRanking(cache, region, eventId);
  const latest = options.boardType === "worldlink"
    ? (knownWorldLink?.snapshot ?? (await fetchRealtimeWorldLinkLatest(region, 30_000, options.gameCharacterId)).snapshot)
    : (knownLatest ?? await fetchRealtimeLatest(region));
  if (!latest) throw new Error("World Link ranking unavailable");
  if (latest.eventId !== eventId) {
    throw new Error(`Realtime latest event mismatch: expected ${eventId}, got ${latest.eventId}`);
  }
  const [worldLink, tierSeries] = options.boardType === "worldlink"
    ? [{ snapshot: latest, errors: [] }, { lines: [], errors: [] }]
    : await Promise.all([
      knownWorldLink ? Promise.resolve(knownWorldLink) : fetchRealtimeWorldLinkLatest(region, 2_000).catch((error) => ({ snapshot: null, errors: [error instanceof Error ? error.message : String(error)] })),
      knownTierSeries ? Promise.resolve(knownTierSeries) : fetchRealtimeTierSeries(region, commonBorderRanks)
    ]);
  const top100 = await normalizeTop100(region, latest.entries);
  const borderLines = options.boardType === "worldlink"
    ? normalizeBorders(latest.entries)
    : tierSeries.lines.length
    ? tierSeries.lines.map((line) => ({ rank: line.rank, score: line.score, region, eventId, updatedAt: line.updatedAt, source: line.sourceUrl }))
    : normalizeBorders(latest.entries);
  const sampledAt = latest.updatedAt;
  const snapshot: LiveRankingSnapshot = {
    region,
    eventId,
    currentEvent: currentEventSummary(event, eventId, { startAt: latest.startAt, endAt: latest.endAt }),
    top100,
    borderLines,
    updatedAt: sampledAt,
    sourceHealth: {
      status: "fresh",
      primarySource: latest.sourceUrl,
      fallbackLine: latest.sourceLine === "global" ? "global" : undefined,
      latestUpdatedAt: latest.updatedAt,
      cacheUpdatedAt: new Date().toISOString(),
      errors: [...(worldLink.errors ?? []), ...tierSeries.errors].slice(-6)
    },
    boardType: options.boardType,
    gameCharacterId: options.gameCharacterId,
    worldLinkCharacters: await worldLinkCharacters(region, event),
    worldLinkAvailable: options.boardType === "worldlink" || Boolean(worldLink.snapshot),
    staleRanks: [],
    warnings: borderLines.length ? [] : ["Realtime ranking tier-series did not include configured border ranks"]
  };
  cache.liveRankings[key] = { key, region, updatedAt: sampledAt, source: latest.sourceUrl, data: snapshot };
  cache.rankingTop100[key] = { key, region, updatedAt: sampledAt, source: latest.sourceUrl, data: top100 };
  if (borderLines.length) {
    cache.rankingBorders[key] = { key, region, updatedAt: sampledAt, source: latest.sourceUrl, data: borderLines };
  }
  rememberRankingSample(cache, region, eventId);
  await writeRuntimeCache(cache);
  await Promise.all([
    persistRankingHistory(region, eventId, "top100", top100, latest.sourceUrl, sampledAt),
    borderLines.length ? persistRankingHistory(region, eventId, "border", borderLines, latest.sourceUrl, sampledAt) : Promise.resolve([])
  ]);
  return snapshot;
}

function triggerLiveRankingRefresh(region: RegionId, eventId: string, event?: unknown, options: { boardType?: "overall" | "worldlink"; gameCharacterId?: number } = {}) {
  const boardType = options.boardType ?? "overall";
  const key = rankingKey(region, eventId, boardType, options.gameCharacterId);
  const running = liveRankingRefreshes.get(key);
  if (running) return running;
  const promise = refreshLiveRanking(region, eventId, event, undefined, undefined, undefined, { boardType, gameCharacterId: options.gameCharacterId })
    .finally(() => liveRankingRefreshes.delete(key));
  liveRankingRefreshes.set(key, promise);
  return promise;
}

export async function getRuntimeStatus() {
  const cache = await readRuntimeCache();
  return {
    updatedAt: cache.updatedAt,
    watchedPlayers: cache.watchedPlayers.length,
    watchedRankings: cache.watchedRankings.length,
    cachedPlayers: Object.keys(cache.players).length,
    cachedLiveRankings: Object.keys(cache.liveRankings).length,
    cachedRankingTop100: Object.keys(cache.rankingTop100).length,
    cachedRankingBorders: Object.keys(cache.rankingBorders).length,
    cachedRankingChurn: Object.keys(cache.rankingChurn).length,
    rankingSampleSeries: Object.keys(cache.rankingSamples).length,
    refresh: {
      playerRefreshMs: config.playerRefreshMs,
      rankingRefreshMs: config.rankingRefreshMs,
      masterRefreshMs: config.masterRefreshMs
    }
  };
}

export async function getPlayerProfileCached(region: RegionId, userId: string, force = false) {
  const cache = await readRuntimeCache();
  const key = playerKey(region, userId);
  rememberPlayer(cache, region, userId);
  if (!force && isFresh(cache.players[key], config.playerRefreshMs)) {
    await writeRuntimeCache(cache);
    return cache.players[key].data;
  }
  const profile = (await harukiClient.getPlayerProfile(region, userId)) as PlayerProfile;
  cache.players[key] = {
    key,
    region,
    updatedAt: new Date().toISOString(),
    source: profile.source ?? (config.harukiApiBaseUrl ? "haruki-api" : "local-fallback"),
    data: profile
  };
  await writeRuntimeCache(cache);
  return profile;
}

export async function getLiveRankingCached(region: RegionId, eventId: string, event?: unknown, force = false, options: { boardType?: "overall" | "worldlink"; gameCharacterId?: number } = {}): Promise<LiveRankingSnapshot> {
  if (eventId === "none") return unavailableLiveSnapshot(region, eventId, event, []);
  const boardType = options.boardType ?? "overall";
  if (boardType === "worldlink" && options.gameCharacterId == null) return unavailableLiveSnapshot(region, eventId, event, ["gameCharacterId is required for World Link"]);
  const cache = await readRuntimeCache();
  const key = rankingKey(region, eventId, boardType, options.gameCharacterId);
  rememberRanking(cache, region, eventId);
  const cached = cache.liveRankings[key];
  if (!force && cached) {
    if (isFresh(cached, config.rankingRefreshMs)) {
      rememberRankingSample(cache, region, eventId);
      await writeRuntimeCache(cache);
      return rehydrateLiveRankingSnapshot(region, {
        ...cached.data,
        currentEvent: currentEventSummary(event ?? cached.data.currentEvent, eventId, cached.data.currentEvent)
      });
    }
    triggerLiveRankingRefresh(region, eventId, event, options).catch(() => undefined);
    rememberRankingSample(cache, region, eventId);
    await writeRuntimeCache(cache);
    return rehydrateLiveRankingSnapshot(region, staleLiveSnapshot(cached));
  }
  try {
    return await triggerLiveRankingRefresh(region, eventId, event, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const freshCache = await readRuntimeCache();
    const stale = freshCache.liveRankings[key];
    if (stale) return rehydrateLiveRankingSnapshot(region, staleLiveSnapshot(stale, [errorMessage]));
    if (boardType === "worldlink") return unavailableLiveSnapshot(region, eventId, event, [errorMessage]);
    const [top100Result, borderResult] = await Promise.allSettled([
      harukiClient.getRankingTop100(region, eventId),
      harukiClient.getRankingBorder(region, eventId)
    ]);
    const rawTop100 = top100Result.status === "fulfilled" && Array.isArray(top100Result.value) ? top100Result.value : [];
    const top100 = await normalizeTop100(region, rawTop100 as RealtimeRankingEntry[]);
    const borderLines = borderResult.status === "fulfilled" && Array.isArray(borderResult.value) ? borderResult.value : [];
    if (top100.length || borderLines.length) {
      const sampledAt = new Date().toISOString();
      const snapshot: LiveRankingSnapshot = {
        region,
        eventId,
        currentEvent: currentEventSummary(event, eventId),
        top100,
        borderLines,
        updatedAt: sampledAt,
        sourceHealth: {
          status: "fallback-haruki",
          primarySource: "haruki-toolbox",
          errors: [
            errorMessage,
            ...(top100Result.status === "rejected" ? [String(top100Result.reason)] : []),
            ...(borderResult.status === "rejected" ? [String(borderResult.reason)] : [])
          ].slice(-6)
        },
        boardType: "overall",
        worldLinkCharacters: await worldLinkCharacters(region, event),
        worldLinkAvailable: false,
        staleRanks: [],
        warnings: ["Realtime ranking source unavailable; using Haruki toolbox fallback"]
      };
      freshCache.liveRankings[key] = { key, region, updatedAt: sampledAt, source: "haruki-toolbox", data: snapshot };
      freshCache.rankingTop100[key] = { key, region, updatedAt: sampledAt, source: "haruki-toolbox", data: top100 };
      freshCache.rankingBorders[key] = { key, region, updatedAt: sampledAt, source: "haruki-toolbox", data: borderLines };
      rememberRanking(freshCache, region, eventId);
      rememberRankingSample(freshCache, region, eventId);
      await writeRuntimeCache(freshCache);
      await Promise.all([
        persistRankingHistory(region, eventId, "top100", top100, "haruki-toolbox", sampledAt),
        persistRankingHistory(region, eventId, "border", borderLines, "haruki-toolbox", sampledAt)
      ]);
      return snapshot;
    }
    return unavailableLiveSnapshot(region, eventId, event, [errorMessage]);
  }
}

export async function getLatestLiveRankingCached(region: RegionId, event?: unknown, force = false): Promise<LiveRankingSnapshot> {
  const cache = await readRuntimeCache();
  const cached = latestLiveRankingForRegion(cache, region);
  if (!force && cached) {
    if (isFresh(cached, config.rankingRefreshMs)) {
      return rehydrateLiveRankingSnapshot(region, {
        ...cached.data,
        currentEvent: currentEventSummary(cached.data.currentEvent, cached.data.eventId, cached.data.currentEvent)
      });
    }
    (async () => {
      const [latest, tierSeries] = await Promise.all([
        fetchRealtimeLatest(region),
        fetchRealtimeTierSeries(region, commonBorderRanks)
      ]);
      await refreshLiveRanking(region, latest.eventId, event, latest, tierSeries, noWorldLinkProbe);
    })().catch(() => undefined);
    return rehydrateLiveRankingSnapshot(region, staleLiveSnapshot(cached));
  }
  try {
    const [latest, tierSeries] = await Promise.all([
      fetchRealtimeLatest(region),
      fetchRealtimeTierSeries(region, commonBorderRanks)
    ]);
    return refreshLiveRanking(region, latest.eventId, event, latest, tierSeries, noWorldLinkProbe);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stale = latestLiveRankingForRegion(await readRuntimeCache(), region);
    if (stale) return rehydrateLiveRankingSnapshot(region, staleLiveSnapshot(stale, [errorMessage]));
    return unavailableLiveSnapshot(region, "unknown", event, [errorMessage]);
  }
}

export async function getRankingTop100Cached(region: RegionId, eventId: string, force = false) {
  const live = await getLiveRankingCached(region, eventId, undefined, force);
  if (live.top100.length) return live.top100;
  const cache = await readRuntimeCache();
  const key = rankingKey(region, eventId);
  rememberRanking(cache, region, eventId);
  if (!force && isFresh(cache.rankingTop100[key], config.rankingRefreshMs)) {
    rememberRankingSample(cache, region, eventId);
    await writeRuntimeCache(cache);
    await persistRankingHistory(region, eventId, "top100", cache.rankingTop100[key].data, cache.rankingTop100[key].source, cache.rankingTop100[key].updatedAt);
    return cache.rankingTop100[key].data;
  }
  const data = (await harukiClient.getRankingTop100(region, eventId)) as unknown[];
  const sampledAt = new Date().toISOString();
  cache.rankingTop100[key] = {
    key,
    region,
    updatedAt: sampledAt,
    source: config.harukiApiBaseUrl ? "haruki-api" : "local-fallback",
    data
  };
  rememberRankingSample(cache, region, eventId);
  await writeRuntimeCache(cache);
  await persistRankingHistory(region, eventId, "top100", data, cache.rankingTop100[key].source, sampledAt);
  return data;
}

export async function getRankingBorderCached(region: RegionId, eventId: string, force = false) {
  const live = await getLiveRankingCached(region, eventId, undefined, force);
  if (live.borderLines.length) return live.borderLines;
  const cache = await readRuntimeCache();
  const key = rankingKey(region, eventId);
  rememberRanking(cache, region, eventId);
  if (!force && isFresh(cache.rankingBorders[key], config.rankingRefreshMs)) {
    rememberRankingSample(cache, region, eventId);
    await writeRuntimeCache(cache);
    await persistRankingHistory(region, eventId, "border", cache.rankingBorders[key].data, cache.rankingBorders[key].source, cache.rankingBorders[key].updatedAt);
    return cache.rankingBorders[key].data;
  }
  const data = (await harukiClient.getRankingBorder(region, eventId)) as unknown[];
  const sampledAt = new Date().toISOString();
  cache.rankingBorders[key] = {
    key,
    region,
    updatedAt: sampledAt,
    source: config.harukiApiBaseUrl ? "haruki-api" : "local-fallback",
    data
  };
  rememberRankingSample(cache, region, eventId);
  await writeRuntimeCache(cache);
  await persistRankingHistory(region, eventId, "border", data, cache.rankingBorders[key].source, sampledAt);
  return data;
}

export async function getRankingSamples(region: RegionId, eventId: string) {
  const cache = await readRuntimeCache();
  return cache.rankingSamples[rankingKey(region, eventId)] ?? [];
}

export async function getRankingHistory(query: RankingHistoryQuery) {
  return store.listRankingHistory(query);
}

export async function getRankingHistorySummary(query: RankingHistoryQuery) {
  const rows = await getRankingHistory({ ...query, limit: query.limit ?? 5000 });
  const byLine = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byLine.get(row.rank) ?? [];
    list.push(row);
    byLine.set(row.rank, list);
  }
  return [...byLine.entries()].map(([rank, samples]) => {
    const sorted = [...samples].sort((a, b) => Date.parse(a.sampledAt) - Date.parse(b.sampledAt));
    const first = sorted[0];
    const latest = sorted.at(-1);
    const spanHours = first && latest ? Math.max(0, (Date.parse(latest.sampledAt) - Date.parse(first.sampledAt)) / 3_600_000) : 0;
    const speedPerHour = first && latest && spanHours > 0 ? Math.max(0, (latest.score - first.score) / spanHours) : null;
    const predictability = samples.length >= 4 && spanHours >= 1 ? "medium" : samples.length >= 2 ? "low" : "unavailable";
    const confidenceReason = predictability === "medium"
      ? "Enough samples across at least one hour for a basic trend estimate"
      : predictability === "low"
        ? "Only a short sample window is available; treat this as directional"
        : "At least two samples are required before a speed can be estimated";
    const sampleSource = latest?.sourceMetadata && typeof latest.sourceMetadata === "object"
      ? String((latest.sourceMetadata as Record<string, unknown>).source ?? "persistent-ranking-history")
      : "persistent-ranking-history";
    return {
      rank,
      sampleType: latest?.sampleType ?? query.sampleType,
      sampleCount: samples.length,
      latestScore: latest?.score ?? null,
      latestSampledAt: latest?.sampledAt ?? null,
      firstSampledAt: first?.sampledAt ?? null,
      sampleSpanHours: Math.round(spanHours * 100) / 100,
      speedPerHour: speedPerHour == null ? null : Math.round(speedPerHour),
      predictability,
      confidence: predictability,
      confidenceReason,
      sampleSource,
      sourceHealth: {
        status: latest ? "ok" : "empty",
        latestSampledAt: latest?.sampledAt ?? null,
        sampleCount: samples.length,
        sampleSpanHours: Math.round(spanHours * 100) / 100
      }
    };
  }).sort((a, b) => a.rank - b.rank);
}

export async function refreshWatchedPlayers() {
  const cache = await readRuntimeCache();
  const results = [];
  for (const player of cache.watchedPlayers) {
    results.push(await getPlayerProfileCached(player.region, player.userId, true));
  }
  return results;
}

export async function refreshWatchedRankings() {
  const cache = await readRuntimeCache();
  const results = [];
  for (const ranking of cache.watchedRankings) {
    const live = await getLiveRankingCached(ranking.region, ranking.eventId, undefined, true);
    results.push({ ...ranking, top100: live.top100, border: live.borderLines, liveRanking: live });
  }
  return results;
}
