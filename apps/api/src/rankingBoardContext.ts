import type { RegionId } from "./config.js";
import { getCurrentEvent } from "./masterData.js";
import { getLiveRankingCached } from "./runtimeData.js";

export type RankingBoardType = "overall" | "worldlink";

export type RankingBoardContext =
  | {
      ok: true;
      boardType: RankingBoardType;
      gameCharacterId?: number;
      event?: Awaited<ReturnType<typeof getCurrentEvent>>;
    }
  | {
      ok: false;
      statusCode: 400 | 404 | 503;
      message: string;
    };

type RankingBoardContextDependencies = {
  currentEvent: typeof getCurrentEvent;
  overallLiveRanking: typeof getLiveRankingCached;
};

const defaultDependencies: RankingBoardContextDependencies = {
  currentEvent: getCurrentEvent,
  overallLiveRanking: getLiveRankingCached
};

export async function validateRankingBoardContext(
  region: RegionId,
  query: { boardType?: string; gameCharacterId?: string },
  expectedEventId?: string,
  dependencies: RankingBoardContextDependencies = defaultDependencies
): Promise<RankingBoardContext> {
  if (query.boardType != null && query.boardType !== "overall" && query.boardType !== "worldlink") {
    return { ok: false, statusCode: 400, message: "Unsupported boardType" };
  }
  const boardType: RankingBoardType = query.boardType === "worldlink" ? "worldlink" : "overall";
  const hasCharacter = query.gameCharacterId != null;
  const gameCharacterId = hasCharacter ? Number(query.gameCharacterId) : undefined;
  if (hasCharacter && (!Number.isInteger(gameCharacterId) || (gameCharacterId ?? 0) < 1)) {
    return { ok: false, statusCode: 400, message: "Unsupported gameCharacterId" };
  }
  if (boardType === "overall" && gameCharacterId != null) {
    return { ok: false, statusCode: 400, message: "gameCharacterId is supported only for World Link" };
  }
  if (boardType === "worldlink" && gameCharacterId == null) {
    return { ok: false, statusCode: 400, message: "gameCharacterId is required for World Link" };
  }
  if (boardType === "overall") return { ok: true, boardType };

  const event = await dependencies.currentEvent(region);
  if (!event || event.id === "none") {
    return { ok: false, statusCode: 404, message: "No active World Link event" };
  }
  if (expectedEventId != null && event.id !== expectedEventId) {
    return { ok: false, statusCode: 400, message: "World Link eventId does not match the active event" };
  }
  if (event.eventType !== "world_bloom") {
    return { ok: false, statusCode: 400, message: "World Link ranking is available only for an active world_bloom event" };
  }

  let discovery: Awaited<ReturnType<typeof getLiveRankingCached>>;
  try {
    discovery = await dependencies.overallLiveRanking(region, event.id, event);
  } catch {
    return { ok: false, statusCode: 503, message: "World Link ranking source is unavailable" };
  }
  if (!discovery.worldLinkAvailable || !discovery.worldLinkCharacters.length) {
    return { ok: false, statusCode: 503, message: "World Link ranking source is unavailable" };
  }
  if (!discovery.worldLinkCharacters.some((character) => character.id === gameCharacterId)) {
    return { ok: false, statusCode: 400, message: "Selected World Link character is not available for the current event" };
  }
  return { ok: true, boardType, gameCharacterId, event };
}
