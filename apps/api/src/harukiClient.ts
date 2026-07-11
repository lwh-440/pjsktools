import type { RegionId } from "./config.js";

const TOOLBOX_API_BASE = "https://toolbox-api-direct.haruki.seiunx.com";
const top100Ranks = Array.from({ length: 50 }, (_, index) => index * 2 + 1);
const commonBorderRanks = [500, 1000, 2000, 5000];

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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Haruki ranking request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchToolboxOverview(region: RegionId, eventId: string, intervalSeconds = 3600) {
  const url = `${TOOLBOX_API_BASE}/event-tracker/api/v2/web/events/${region}/${eventId}/leaderboards/total/overview?interval=${intervalSeconds}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Haruki overview request failed: ${response.status}`);
  }
  return response.json();
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
    const response = await fetch(`${TOOLBOX_API_BASE}/event-tracker/api/v2/web/players/${region}/${userId}/profile`);
    if (!response.ok) {
      throw new Error(`Haruki profile request failed: ${response.status}`);
    }
    return response.json();
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
    } catch {
      const results = await Promise.allSettled(top100Ranks.map((rank) => fetchToolboxLeaderboard(region, eventId, rank, 2)));
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const item of flattenLeaderboardItems(result.value)) {
          if (!item?.rankData) continue;
          const rd = item.rankData;
          if (rd.rank < 1 || rd.rank > 100 || entriesByRank.has(rd.rank)) continue;
          const entry = normalizePlayerItem(item, region, eventId, updatedAt);
          if (entry) entriesByRank.set(rd.rank, entry);
        }
      }
    }

    const entries = Array.from(entriesByRank.values()).sort((a, b) => a.rank - b.rank);
    return entries.length > 0
      ? entries
      : [
          {
            rank: 1,
            userId: "unknown",
            name: "Unknown",
            playerName: "Unknown",
            score: 0,
            region,
            eventId,
            updatedAt,
            source: "toolbox-api"
          }
        ];
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

    const results = await Promise.allSettled(commonBorderRanks.map((rank) => fetchToolboxLeaderboard(region, eventId, rank, 1)));
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const item = result.value.current;
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

    return entries.sort((a, b) => a.rank - b.rank);
  }
}

export const harukiClient = new HarukiClient();
