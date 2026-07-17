import type { RegionId } from "./config.js";

export type RealtimeRankingLine = "main" | "global";

export type RealtimeRankingEntry = {
  rank: number;
  userId?: string;
  name?: string;
  playerName?: string;
  score: number;
  timestamp?: number;
  cardId?: number | string;
  leaderCardId?: number | string;
  leaderCharacterId?: number | string;
  cardDefaultImage?: string;
  leaderCardDefaultImage?: string;
  leaderCardImageUrl?: string;
  leaderCardImageCandidates?: string[];
  leaderCardMasterRank?: number;
  leaderCharacterImageCandidates?: string[];
  leaderAssetStatus?: "matched" | "card-master-missing" | "asset-unavailable";
  profileWord?: string;
  profileHonors?: unknown[];
  region: RegionId;
  eventId: string;
  updatedAt: string;
  source: string;
};

export type RealtimeRankingSnapshot = {
  region: RegionId;
  eventId: string;
  startAt?: string;
  endAt?: string;
  updatedAt: string;
  entries: RealtimeRankingEntry[];
  sourceLine: RealtimeRankingLine;
  sourceUrl: string;
  rawStatus?: string;
};

export type RealtimeTierLine = {
  rank: number;
  score: number;
  updatedAt: string;
  sourceLine: RealtimeRankingLine;
  sourceUrl: string;
};

export type RealtimeChurnEntry = {
  rank: number;
  userId?: string;
  name: string;
  isTierLine?: boolean;
  score: number;
  growth1h: number;
  churn1h: number;
  churn20min: number;
  churn48h: number;
  hourlyChurn: Array<{ hour: string; count: number }>;
  recentScoreChanges: Array<{ timestamp: number; delta: number }>;
  parkingPeriods: Array<{ startTime?: number; sinceMs?: number; endTime?: number; durationSeconds?: number }>;
};

export type RealtimeChurnSnapshot = {
  region: RegionId;
  eventId: string;
  boardType: "overall" | "worldlink";
  gameCharacterId?: number;
  updatedAt: string;
  entries: RealtimeChurnEntry[];
  sourceLine: RealtimeRankingLine;
  sourceUrl: string;
};

const realtimeRankingHosts: Record<RealtimeRankingLine, string> = {
  main: "https://rks-n.exmeaning.com/api/public/v2",
  global: "https://rks-n.pjsk.moe/api/public/v2"
};

function isoFromMaybeUnix(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Date(milliseconds).toISOString();
}

function numberOrUndefined(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Realtime ranking request failed: ${response.status}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeEntry(item: any, region: RegionId, eventId: string, updatedAt: string, sourceLine: RealtimeRankingLine): RealtimeRankingEntry | null {
  const rank = numberOrUndefined(item?.rank ?? item?.targetRank ?? item?.borderRank);
  const score = numberOrUndefined(item?.score ?? item?.eventPoint ?? item?.point);
  if (!rank || rank <= 0 || score == null || score < 0) return null;
  const userCard = item?.userCard ?? item?.card ?? {};
  const userProfile = item?.userProfile ?? item?.profile ?? {};
  const userId = item?.userId ?? item?.user_id ?? userProfile?.userId ?? userProfile?.id;
  const name = item?.name ?? item?.playerName ?? userProfile?.name;
  return {
    rank,
    userId: userId == null ? undefined : String(userId),
    name: name == null ? undefined : String(name),
    playerName: name == null ? undefined : String(name),
    score,
    timestamp: numberOrUndefined(item?.timestamp ?? item?.updated_at),
    cardId: userCard?.cardId ?? userCard?.card_id ?? item?.cardId,
    leaderCardId: userCard?.cardId ?? userCard?.card_id ?? item?.leaderCardId,
    leaderCharacterId: userCard?.characterId ?? userCard?.gameCharacterId,
    cardDefaultImage: userCard?.defaultImage ?? item?.cardDefaultImage,
    leaderCardDefaultImage: userCard?.defaultImage ?? item?.leaderCardDefaultImage ?? item?.cardDefaultImage,
    leaderCardImageUrl: typeof item?.leaderCardImageUrl === "string" && /^https?:\/\//.test(item.leaderCardImageUrl) ? item.leaderCardImageUrl : undefined,
    leaderCardMasterRank: numberOrUndefined(userCard?.masterRank ?? item?.leaderCardMasterRank),
    profileWord: userProfile?.word ?? item?.profileWord,
    profileHonors: Array.isArray(item?.profileHonors) ? item.profileHonors : Array.isArray(userProfile?.profileHonors) ? userProfile.profileHonors : undefined,
    region,
    eventId,
    updatedAt,
    source: `rks-n-${sourceLine}`
  };
}

function normalizeSnapshot(json: any, region: RegionId, sourceLine: RealtimeRankingLine, sourceUrl: string): RealtimeRankingSnapshot {
  const eventId = String(json?.event_id ?? json?.eventId ?? json?.event?.id ?? "");
  if (!eventId) throw new Error("Realtime ranking response did not include event_id");
  const updatedAt = isoFromMaybeUnix(json?.updated_at ?? json?.updatedAt ?? json?.timestamp) ?? new Date().toISOString();
  const entries = (Array.isArray(json?.rankings) ? json.rankings : Array.isArray(json?.entries) ? json.entries : [])
    .map((item: any) => normalizeEntry(item, region, eventId, updatedAt, sourceLine))
    .filter(Boolean)
    .sort((a: RealtimeRankingEntry, b: RealtimeRankingEntry) => a.rank - b.rank);
  return {
    region,
    eventId,
    startAt: isoFromMaybeUnix(json?.start_at ?? json?.startAt),
    endAt: isoFromMaybeUnix(json?.end_at ?? json?.endAt),
    updatedAt,
    entries,
    sourceLine,
    sourceUrl,
    rawStatus: json?.user_ranking_status ?? json?.status
  };
}

async function fetchFromLine(region: RegionId, path: "latest" | "worldlink-latest", sourceLine: RealtimeRankingLine, timeoutMs: number, gameCharacterId?: number) {
  const query = path === "worldlink-latest" && gameCharacterId ? `?gameCharacterId=${encodeURIComponent(String(gameCharacterId))}` : "";
  const url = `${realtimeRankingHosts[sourceLine]}/${region}/${path}${query}`;
  return normalizeSnapshot(await fetchJsonWithTimeout(url, timeoutMs), region, sourceLine, url);
}

async function fetchTierSeriesFromLine(region: RegionId, tiers: number[], sourceLine: RealtimeRankingLine, timeoutMs: number): Promise<RealtimeTierLine[]> {
  const since = Math.floor(Date.now() / 1000) - 3600;
  const url = `${realtimeRankingHosts[sourceLine]}/${region}/tier-series?tiers=${tiers.join(",")}&since=${since}`;
  const json = await fetchJsonWithTimeout(url, timeoutMs);
  const tierMap = (json as any)?.tiers ?? {};
  return tiers
    .map((rank) => {
      const series = Array.isArray(tierMap[String(rank)]) ? tierMap[String(rank)] : [];
      const latest = series.at(-1);
      const score = Number(latest?.s ?? latest?.score);
      const timestamp = latest?.t ?? latest?.timestamp;
      const updatedAt = isoFromMaybeUnix(timestamp) ?? new Date().toISOString();
      return Number.isFinite(score) ? { rank, score, updatedAt, sourceLine, sourceUrl: url } : null;
    })
    .filter((item): item is RealtimeTierLine => Boolean(item));
}

function normalizeChurnSnapshot(json: any, region: RegionId, boardType: "overall" | "worldlink", gameCharacterId: number | undefined, sourceLine: RealtimeRankingLine, sourceUrl: string): RealtimeChurnSnapshot {
  const eventId = String(json?.event_id ?? json?.eventId ?? "");
  if (!eventId) throw new Error("Realtime churn response did not include event_id");
  const updatedAt = isoFromMaybeUnix(json?.updated_at ?? json?.updatedAt) ?? new Date().toISOString();
  const entries = (Array.isArray(json?.rankings) ? json.rankings : []).map((item: any): RealtimeChurnEntry | null => {
    const rank = numberOrUndefined(item?.rank);
    const score = numberOrUndefined(item?.score);
    if (!rank || score == null) return null;
    return {
      rank,
      userId: item?.userId == null ? undefined : String(item.userId),
      name: String(item?.name ?? (item?.isTierLine ? `T${rank}` : `Player ${item?.userId ?? rank}`)),
      isTierLine: Boolean(item?.isTierLine),
      score,
      growth1h: numberOrUndefined(item?.growth_1h) ?? 0,
      churn1h: numberOrUndefined(item?.churn_1h) ?? 0,
      churn20min: numberOrUndefined(item?.churn_20min) ?? 0,
      churn48h: numberOrUndefined(item?.churn_48h) ?? 0,
      hourlyChurn: (Array.isArray(item?.hourly_churn) ? item.hourly_churn : []).map((hour: any) => ({ hour: String(hour?.hour ?? ""), count: numberOrUndefined(hour?.count) ?? 0 })).filter((hour: { hour: string }) => hour.hour),
      recentScoreChanges: (Array.isArray(item?.recent_score_changes) ? item.recent_score_changes : []).map((change: any) => ({ timestamp: numberOrUndefined(change?.t ?? change?.time) ?? 0, delta: numberOrUndefined(change?.delta) ?? 0 })).filter((change: { timestamp: number }) => change.timestamp > 0),
      parkingPeriods: (Array.isArray(item?.parking_periods) ? item.parking_periods : []).map((period: any) => ({
        startTime: numberOrUndefined(period?.start_time),
        sinceMs: numberOrUndefined(period?.since_ms),
        endTime: numberOrUndefined(period?.end_time),
        durationSeconds: numberOrUndefined(period?.duration_s)
      }))
    };
  }).filter((entry: RealtimeChurnEntry | null): entry is RealtimeChurnEntry => Boolean(entry));
  return { region, eventId, boardType, gameCharacterId, updatedAt, entries, sourceLine, sourceUrl };
}

async function fetchChurnFromLine(region: RegionId, boardType: "overall" | "worldlink", gameCharacterId: number | undefined, top: number | undefined, sourceLine: RealtimeRankingLine) {
  const path = boardType === "worldlink" ? "worldlink-churn" : "churn";
  const params = new URLSearchParams();
  if (top) params.set("top", String(top));
  if (boardType === "worldlink" && gameCharacterId) params.set("gameCharacterId", String(gameCharacterId));
  const url = `${realtimeRankingHosts[sourceLine]}/${region}/${path}${params.size ? `?${params}` : ""}`;
  const json = await fetchJsonWithTimeout(url, 15_000);
  return normalizeChurnSnapshot(json, region, boardType, gameCharacterId, sourceLine, url);
}

export async function fetchRealtimeLatest(region: RegionId) {
  const lines = ["main", "global"] as const;
  try {
    return await Promise.any(lines.map((line) => fetchFromLine(region, "latest", line, 10_000)));
  } catch (error) {
    const messages = error instanceof AggregateError
      ? error.errors.map((item, index) => `${lines[index]}: ${item instanceof Error ? item.message : String(item)}`)
      : [error instanceof Error ? error.message : String(error)];
    throw new Error(`Realtime ranking latest unavailable (${messages.join("; ")})`);
  }
}

export async function fetchRealtimeWorldLinkLatest(region: RegionId, timeoutMs = 30_000, gameCharacterId?: number) {
  const errors: string[] = [];
  for (const line of ["main", "global"] as const) {
    try {
      return { snapshot: await fetchFromLine(region, "worldlink-latest", line, timeoutMs, gameCharacterId), errors };
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      errors.push(`${line}: ${error instanceof Error ? error.message : String(error)}`);
      if (status === 404 || status === 503) continue;
    }
  }
  return { snapshot: null, errors };
}

export async function fetchRealtimeTierSeries(region: RegionId, tiers: number[]) {
  const sourceLines = ["main", "global"] as const;
  try {
    const lines = await Promise.any(sourceLines.map((line) => fetchTierSeriesFromLine(region, tiers, line, 5_000)));
    return { lines, errors: [] };
  } catch (error) {
    const errors = error instanceof AggregateError
      ? error.errors.map((item, index) => `${sourceLines[index]}: ${item instanceof Error ? item.message : String(item)}`)
      : [error instanceof Error ? error.message : String(error)];
    return { lines: [], errors };
  }
}

export async function fetchRealtimeChurn(region: RegionId, options: { boardType?: "overall" | "worldlink"; gameCharacterId?: number; top?: number } = {}) {
  const boardType = options.boardType ?? "overall";
  if (boardType === "worldlink" && !options.gameCharacterId) throw new Error("worldlink-context-missing");
  const errors: string[] = [];
  for (const line of ["main", "global"] as const) {
    try {
      return { snapshot: await fetchChurnFromLine(region, boardType, options.gameCharacterId, options.top, line), errors };
    } catch (error) {
      errors.push(`${line}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Realtime churn unavailable (${errors.join("; ")})`);
}

export const realtimeRankingSourcePolicy = {
  main: realtimeRankingHosts.main,
  globalFallback: realtimeRankingHosts.global,
  latestTimeoutMs: 10_000,
  worldLinkTimeoutMs: 30_000,
  tierSeriesTimeoutMs: 5_000,
  churnTimeoutMs: 15_000,
  referenceFiles: [
    "refer/Moesekai/web/src/lib/realtime-ranking-line.ts",
    "refer/Moesekai/web/src/lib/realtime-ranking-next-api.ts",
    "refer/Moesekai/web/src/app/realtime-ranking-next/_hooks/useRealtimeBoard.ts"
  ]
};
