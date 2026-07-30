import cors from "@fastify/cors";
import compress from "@fastify/compress";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { decryptHarukiSecret, encryptHarukiSecret, encryptSecret } from "./authCrypto.js";
import { getCardImportManifest } from "./cardImportManifest.js";
import { getAssetConfig, getCardAssetDetail, getChartAssetDetail, getEventAssetDetail, getMusicAssetDetail } from "./assets.js";
import { AssetResolveError, AssetResolver } from "./assetResolver.js";
import { config, isRegion, regions, type RegionId } from "./config.js";
import { estimateEventPoint, getCalculationContext, getCalculationSchema, getDeckRecommendSchema, getEventBonusConfig } from "./calcData.js";
import { sendVerificationEmail, smtpConfigured } from "./emailService.js";
import { getExternalContext, getLive2dModel3Proxy, getLive2dModelDetail, getLive2dModels, getMysekaiFullContext, getStoriesContext, getStoryCatalog, getStoryFullContext, getStoryPlaybackContext, getVirtualLivePlaybackContext, getVirtualLiveStepContext, informationCollection, isAllowedExternalAssetUrl } from "./externalData.js";
import { harukiClient } from "./harukiClient.js";
import {
  buildHarukiAuthorizeUrl,
  deriveHarukiBindingKey,
  exchangeHarukiCode,
  fetchHarukiBindings,
  fetchHarukiProfile,
  fetchOAuthHarukiSuite,
  fetchPublicHarukiSuite,
  HarukiPlayerDataError,
  harukiOAuthConfigured,
  revokeHarukiToken,
  validateHarukiEndpointConfiguration
} from "./harukiOAuthClient.js";
import { HarukiSuiteValidationError, harukiGroupIsEmpty, hashHarukiCandidate, normalizeHarukiSuite, publicSnapshot } from "./harukiPlayerData.js";
import { harukiStore } from "./harukiStore.js";
import { ensureHarukiAccessToken } from "./harukiTokenManager.js";
import { nextPendingEmptyGroups } from "./harukiSyncState.js";
import { playerProfileFailure, playerUidPattern, rankingDataFailure, rankingPlayerFailure } from "./playerProfileHttp.js";
import {
  getAndroidCatalog,
  getAndroidCatalogDetail,
  getCardDetail,
  getCardFullDetail,
  getCards,
  getCollectionFullDetail,
  getCurrentEvent,
  getEventDetail,
  getEventFullDetail,
  getEventRelations,
  getEvents,
  getMasterCollection,
  getMasterCollectionItem,
  getMasterCatalog,
  getMusicFullDetail,
  getMusicRelations,
  getSongDetail,
  getSongs,
  requestMasterRegionSync,
  syncMasterRegion,
  getMasterRegionStatus
} from "./masterData.js";
import {
  buildQqAuthorizeUrl,
  createQqState,
  exchangeQqCode,
  fetchQqOpenId,
  fetchQqUserInfo,
  qqAvatarUrl,
  qqConfigured
} from "./qqClient.js";
import { getLatestLiveRankingCached, getLiveRankingCached, getPlayerProfileCached, getRankingBorderCached, getRankingChurnCached, getRankingHistory, getRankingHistorySummary, getRankingPlayerDetail, getRankingTop100Cached, getRuntimeStatus } from "./runtimeData.js";
import { validateRankingBoardContext, type RankingBoardContext } from "./rankingBoardContext.js";
import { calculateMysekai } from "./mysekaiCalc.js";
import { store, toPublicUser, type AuthStore } from "./store.js";
import type { Favorite, FavoriteTargetSummary, FavoriteType, PlayerDataKind } from "./types.js";
import { validatePasswordStrength } from "./passwordPolicy.js";
import { buildBindingCompleteness, buildBindingSummary, buildMeProfile, isPlayerDataKind, normalizeSuitePlayerDataImport, playerDataKinds, reviewPlayerDataImport, validatePlayerDataRecord } from "./playerSummary.js";
import { calculateNormalEventPlan, calculateScoreControl, forecastRanking, recommendAreaItems, recommendDeck, recommendMusic } from "./tools.js";
import { buildAssetReadiness, sharedFormulaVersion } from "./normalEventFormula.js";
import { buildProfileAnalysis } from "./profileAnalysis.js";
import { compareDecks } from "./deckComparator.js";
import { installOpenApi } from "./openApi.js";
import { paginate, withPaginationFlags } from "./pagination.js";
import { renderShareCardPng, shareCardMetadata, type ShareCardData } from "./shareCard.js";
import { assertIfMatch, createWriteControls, setEntityTag, withEntityVersion } from "./writeControls.js";
import {
  getContentStatus,
  getExchangeCatalog,
  getExchangeDetail,
  getInformationCollection,
  getInformationDetail,
  getMissionCatalog,
  getMysekaiCatalog,
  getMysekaiDetail,
  getVirtualLiveCatalog,
  getVirtualLiveDetail,
  type CatalogKind
} from "./contentData.js";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  code: z.string().regex(/^\d{6}$/)
});

const emailCodeSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(["register"]).default("register")
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16)
});

const qqCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(8)
});

const favoriteSchema = z.object({
  type: z.enum(["player", "event", "song", "card", "gacha", "honor", "material", "costume", "stamp", "comic"]),
  region: z.string().refine(isRegion),
  targetId: z.string().min(1),
  label: z.string().trim().min(1).max(200).optional(),
  folderIds: z.array(z.string().uuid()).max(100).default([])
});

const favoriteFolderSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional()
});
const favoriteFolderPatchSchema = favoriteFolderSchema.partial().refine((value) => Object.keys(value).length > 0);

const favoriteFoldersPatchSchema = z.object({
  folderIds: z.array(z.string().uuid()).max(100)
});

const favoriteBulkPatchSchema = favoriteFoldersPatchSchema.extend({
  favoriteIds: z.array(z.string().uuid()).min(1).max(200),
  mode: z.enum(["add", "remove", "replace"])
});

const scoreSchema = z.object({
  id: z.string().optional(),
  region: z.string().refine(isRegion),
  songId: z.string().min(1),
  difficulty: z.string().min(1),
  clearStatus: z.enum(["not_clear", "clear", "fc", "ap"]),
  score: z.number().int().nonnegative(),
  targetScore: z.number().int().nonnegative().optional(),
  note: z.string().optional()
});

const scoreControlSchema = z.object({
  currentPt: z.number().nonnegative(),
  targetPt: z.number().nonnegative(),
  remainingMinutes: z.number().nonnegative(),
  region: z.string().refine(isRegion).optional(),
  bindingId: z.string().optional(),
  musicId: z.string().optional(),
  difficulty: z.string().optional(),
  liveType: z.enum(["solo", "multi", "auto", "cheerful", "challenge"]).optional(),
  scoreMode: z.enum(["aggregate", "exact"]).optional(),
  skills: z.array(z.number().nonnegative()).min(1).max(6).optional(),
  multiSumPower: z.number().positive().optional(),
  feverMusicId: z.string().optional(),
  feverDifficulty: z.string().optional(),
  calculationMode: z.enum(["normal", "challenge", "world_bloom", "wl", "wl3"]).optional(),
  specialCharacterId: z.string().optional(),
  gameCharacterId: z.string().optional(),
  worldBloomSupportUnit: z.string().optional(),
  worldBloomEventTurn: z.number().int().min(1).max(3).optional(),
  ptPerRun: z.number().nonnegative().optional(),
  eventBonusPercent: z.number().optional(),
  baseScore: z.number().nonnegative().optional(),
  boost: z.number().int().min(0).max(10).optional(),
  availableRuns: z.number().int().nonnegative().optional(),
  bonusPercent: z.number().optional(),
  eventId: z.string().optional(),
  targetRank: z.number().int().positive().optional()
  ,teammates: z.array(z.object({ power: z.number().positive(), effectiveness: z.number().nonnegative(), label: z.string().optional() })).length(4).optional()
  ,skill15Strategy: z.enum(["expected", "best", "worst"]).optional()
  ,skill6Mode: z.enum(["team-average", "highest-power"]).optional()
});

const commaValues = (value: unknown) => {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean))];
};

const stringValuesSchema = z.preprocess(commaValues, z.array(z.string().max(100)).max(100));
const numberValuesSchema = z.preprocess(
  (value) => commaValues(value).map(Number),
  z.array(z.number().int().positive()).max(100)
);
const booleanQuerySchema = z.preprocess(
  (value) => value === true || value === "true" || value === "1",
  z.boolean()
);

const catalogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(["id-asc", "id-desc", "name-asc", "name-desc", "start-asc", "start-desc"]).optional(),
  partType: z.string().optional(),
  source: z.string().optional(),
  rarity: z.string().optional(),
  gender: z.string().optional(),
  characterId: z.coerce.number().int().positive().optional()
  ,category: z.string().max(100).optional()
  ,tag: z.string().max(100).optional()
  ,unit: z.string().max(100).optional()
  ,attribute: z.string().max(100).optional()
  ,eventTypes: stringValuesSchema.default([])
  ,eventUnits: stringValuesSchema.default([])
  ,bonusCharacterIds: numberValuesSchema.default([])
  ,bannerCharacterIds: numberValuesSchema.default([])
  ,bonusAttributes: stringValuesSchema.default([])
  ,musicTags: stringValuesSchema.default([])
  ,categories: stringValuesSchema.default([])
  ,characterIds: numberValuesSchema.default([])
  ,units: stringValuesSchema.default([])
  ,supportUnits: stringValuesSchema.default([])
  ,attributes: stringValuesSchema.default([])
  ,rarities: stringValuesSchema.default([])
  ,supplyTypes: stringValuesSchema.default([])
  ,skillTypes: stringValuesSchema.default([])
  ,gachaTypes: stringValuesSchema.default([])
  ,honorTypes: stringValuesSchema.default([])
  ,groupOnce: booleanQuerySchema.default(false)
  ,materialTypes: stringValuesSchema.default([])
  ,usableOnly: booleanQuerySchema.default(false)
  ,partTypes: stringValuesSchema.default([])
  ,sources: stringValuesSchema.default([])
  ,genders: stringValuesSchema.default([])
  ,relatedOnly: booleanQuerySchema.default(false)
  ,stampTypes: stringValuesSchema.default([])
  ,comicTypes: stringValuesSchema.default([])
});

function catalogResponse(reply: any, request: any, payload: unknown) {
  if (payload && typeof payload === "object" && "items" in payload && "page" in payload && "pageSize" in payload && "total" in payload && "totalPages" in payload) {
    payload = withPaginationFlags(payload as any);
  }
  const etag = `W/\"${createHash("sha1").update(JSON.stringify(payload)).digest("base64url")}\"`;
  reply.header("etag", etag);
  reply.header("cache-control", "public, max-age=60, stale-while-revalidate=600");
  if (request.headers["if-none-match"] === etag) return reply.code(304).send();
  return payload;
}

function paginatedList<T>(request: any, items: T[], defaultPageSize = 24) {
  const query = request.query as { page?: unknown; pageSize?: unknown };
  if (query.page == null && query.pageSize == null) return items;
  return paginate(items, query, { page: 1, pageSize: defaultPageSize, maxPageSize: 100 });
}

const favoriteCollectionTypes: Partial<Record<FavoriteType, string>> = {
  gacha: "gachas",
  honor: "honors",
  material: "materials",
  costume: "costumes",
  stamp: "stamps",
  comic: "comics"
};

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

async function resolveFavoriteTarget(type: FavoriteType, region: RegionId, targetId: string, fallbackLabel = targetId): Promise<FavoriteTargetSummary> {
  try {
    if (type === "player") {
      return { id: targetId, type, displayName: fallbackLabel, secondaryText: `${region.toUpperCase()} · UID ${targetId}`, imageCandidates: [], available: true };
    }
    if (type === "song") {
      const song = await getSongDetail(region, targetId);
      if (!song) throw new Error("TARGET_NOT_FOUND");
      const assets = getMusicAssetDetail(region, song);
      return {
        id: targetId,
        type,
        displayName: song.title,
        secondaryText: song.categories?.join(" / ") || song.unit,
        imageCandidates: stringList((assets as any).imageCandidates),
        available: true
      };
    }
    if (type === "card") {
      const card = await getCardDetail(region, targetId);
      if (!card) throw new Error("TARGET_NOT_FOUND");
      const assets = getCardAssetDetail(region, card) as any;
      return {
        id: targetId,
        type,
        displayName: card.title,
        secondaryText: `${card.character} · ${card.rarity}★ · ${card.attribute}`,
        imageCandidates: stringList(assets.normalThumbnailCandidates).length
          ? stringList(assets.normalThumbnailCandidates)
          : stringList(assets.imageCandidates),
        available: true
      };
    }
    if (type === "event") {
      const event = await getEventDetail(region, targetId);
      if (!event) throw new Error("TARGET_NOT_FOUND");
      const assets = getEventAssetDetail(region, event) as any;
      return {
        id: targetId,
        type,
        displayName: event.name,
        secondaryText: event.eventType,
        imageCandidates: stringList(assets.imageCandidates),
        available: true
      };
    }
    const collectionType = favoriteCollectionTypes[type];
    if (!collectionType) throw new Error("TARGET_NOT_FOUND");
    const detail = await getCollectionFullDetail(region, collectionType, targetId);
    if (!detail) throw new Error("TARGET_NOT_FOUND");
    const item = detail.item as any;
    const assets = detail.assets as any;
    return {
      id: targetId,
      type,
      displayName: item.name ?? item.title ?? fallbackLabel,
      secondaryText: item.category ?? item.rarity ?? item.type,
      imageCandidates: stringList(assets.imageCandidates),
      available: true
    };
  } catch {
    return { id: targetId, type, displayName: fallbackLabel, imageCandidates: [], available: false };
  }
}

async function hydrateFavorite(favorite: Favorite) {
  const target = await resolveFavoriteTarget(favorite.type, favorite.region, favorite.targetId, favorite.label);
  return { ...favorite, label: target.available ? target.displayName : favorite.label, target };
}

async function resolveShareCardData(
  typeValue: string,
  id: string,
  region: RegionId,
  profileResolver: typeof getPlayerProfileCached = getPlayerProfileCached
): Promise<ShareCardData | null> {
  if (!(["profile", "score", "event", "card", "song"] as string[]).includes(typeValue)) return null;
  const type = typeValue as ShareCardData["type"];
  if (type === "profile") {
    const profile = await profileResolver(region, id).catch(() => null);
    if (!profile || profile.userId !== id) return null;
    return {
      type,
      id,
      region,
      title: profile.nickname,
      subtitle: `玩家等级 ${profile.rank}`,
      detail: [profile.comment, `UID ${profile.userId}`].filter(Boolean).join(" · "),
      sourceImageUrl: (profile as any).avatarUrl ?? (profile as any).userProfile?.avatarUrl
    };
  }
  if (type === "event") {
    const event = await getEventDetail(region, id).catch(() => null);
    if (!event) return null;
    const assets = getEventAssetDetail(region, event);
    return {
      type,
      id,
      region,
      title: event.name,
      subtitle: event.storyOutline || event.eventType,
      detail: `${event.startAt} - ${event.endAt}`,
      sourceImageUrl: assets.bannerUrl
    };
  }
  if (type === "card") {
    const card = await getCardDetail(region, id).catch(() => null);
    if (!card) return null;
    return {
      type,
      id,
      region,
      title: card.title,
      subtitle: [card.character, card.attribute, `星级 ${card.rarity}`].filter(Boolean).join(" · "),
      detail: `卡牌 ID ${card.id}`,
      sourceImageUrl: card.assets?.afterTrainingUrl ?? card.assets?.normalUrl
    };
  }
  if (type === "song") {
    const song = await getSongDetail(region, id).catch(() => null);
    if (!song) return null;
    return {
      type,
      id,
      region,
      title: song.title,
      subtitle: song.unit || "Project Sekai 歌曲资料",
      detail: [song.durationSeconds ? `${song.durationSeconds} 秒` : undefined, `歌曲 ID ${song.id}`].filter(Boolean).join(" · "),
      sourceImageUrl: song.assets?.jacketUrl
    };
  }
  const score = await store.getScoreById(id);
  if (!score || score.region !== region) return null;
  const song = await getSongDetail(score.region, score.songId).catch(() => null);
  if (!song) return null;
  return {
    type,
    id,
    region: score.region,
    title: song.title,
    subtitle: `${score.difficulty.toUpperCase()} · ${score.clearStatus.toUpperCase()} · ${score.score.toLocaleString("en-US")}`,
    detail: [score.targetScore == null ? undefined : `目标 ${score.targetScore.toLocaleString("en-US")}`, score.note].filter(Boolean).join(" · ") || `成绩记录 ${score.id}`,
    sourceImageUrl: song.assets?.jacketUrl
  };
}

const informationDocumentStyles = `html{color:#232833;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}body{margin:0;padding:20px;line-height:1.75}img{display:block;max-width:100%;height:auto;margin:0 auto 18px}a{color:#26708f;overflow-wrap:anywhere}.information-pre,.information-body-element{font-size:15px}.information-body-heading{margin:28px 0 14px;padding:10px 14px;border-radius:6px;background:#eef2f5;font-size:20px}.information-body-element-heading{font-size:17px}.btn{display:inline-block;padding:10px 16px;border:1px solid #26708f;border-radius:6px;text-decoration:none}@media(max-width:480px){body{padding:14px}.information-body-heading{font-size:18px}}`;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function informationFallbackDocument(message: string, detailUrl?: string) {
  const link = detailUrl && /^https?:\/\//i.test(detailUrl)
    ? `<p><a href="${escapeHtml(detailUrl)}" target="_blank" rel="noreferrer">在新窗口打开原公告</a></p>`
    : "";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${informationDocumentStyles}</style></head><body><p>${escapeHtml(message)}</p>${link}</body></html>`;
}

function sanitizeInformationDocument(source: string, sourceUrl: string, language: string) {
  const safeBase = escapeHtml(sourceUrl);
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${safeBase}"><style>${informationDocumentStyles}</style>`;
  let content = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\s(?:on\w+|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\b(href|src)\s*=\s*("|')\s*(?:javascript|vbscript):[^"']*\2/gi, "$1=$2#$2")
    .replace(/<a\b(?![^>]*\btarget=)/gi, '<a target="_blank" rel="noreferrer"');
  if (/<head\b[^>]*>/i.test(content)) return content.replace(/<head\b[^>]*>/i, (match) => `${match}${head}`);
  return `<!doctype html><html lang="${language}"><head>${head}</head><body>${content}</body></html>`;
}

const assetProxyFailures = new Map<string, number>();
const assetResolver = new AssetResolver();

const multiLiveFields = {
  teammates: z.array(z.object({ power: z.number().positive(), effectiveness: z.number().nonnegative(), label: z.string().optional() })).length(4).optional(),
  skill15Strategy: z.enum(["expected", "best", "worst"]).optional(),
  skill6Mode: z.enum(["team-average", "highest-power"]).optional()
};

const inventoryItemSchema = z.object({
  cardId: z.string().min(1),
  level: z.number().int().min(1).max(100).optional(),
  masterRank: z.number().int().min(0).max(5).optional(),
  skillLevel: z.number().int().min(1).max(4).optional(),
  specialTrainingStatus: z.enum(["not_doing", "done", "unknown"]).optional(),
  defaultImage: z.enum(["original", "after_training"]).optional(),
  episodes: z.array(z.object({
    cardEpisodeId: z.union([z.string(), z.number()]).transform(String),
    scenarioStatus: z.string(),
    scenarioStatusReasons: z.array(z.string()).optional(),
    isNotSkipped: z.boolean().optional()
  })).optional(),
  episodesRead: z.boolean().optional()
});

const deckRecommendSchema = z.object({
  region: z.string().refine(isRegion),
  eventId: z.string().optional(),
  ownedCardIds: z.array(z.string().min(1)).default([]),
  inventory: z.array(inventoryItemSchema).optional(),
  playerAssets: z.record(z.unknown()).optional(),
  target: z.enum(["event", "power", "skill"]).default("event"),
  liveType: z.enum(["solo", "multi", "auto", "cheerful", "challenge"]).default("solo"),
  calculationMode: z.enum(["normal", "challenge", "world_bloom", "wl", "wl3"]).optional(),
  specialCharacterId: z.string().optional(),
  gameCharacterId: z.string().optional(),
  worldBloomSupportUnit: z.string().optional(),
  worldBloomEventTurn: z.number().int().min(1).max(3).optional(),
  musicId: z.string().optional(),
  difficulty: z.string().optional(),
  fixedCardIds: z.array(z.string().min(1)).default([]),
  fixedCharacterIds: z.array(z.string().min(1)).default([]),
  leaderCardId: z.string().optional(),
  limit: z.number().int().min(1).max(10).default(3),
  timeoutMs: z.number().int().min(100).max(30000).default(3000)
});

const musicRecommendSchema = z.object({
  region: z.string().refine(isRegion),
  bindingId: z.string().optional(),
  eventId: z.string().optional(),
  targetPt: z.number().nonnegative().optional(),
  currentPt: z.number().nonnegative().optional(),
  eventBonusPercent: z.number().optional(),
  preferredDifficulties: z.array(z.string()).optional(),
  maxDurationSeconds: z.number().positive().optional(),
  minNoteCount: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  liveType: z.enum(["solo", "multi", "auto", "cheerful", "challenge"]).optional(),
  boost: z.number().int().min(0).max(10).optional(),
  baseScore: z.number().nonnegative().optional(),
  ...multiLiveFields
});

const areaItemRecommendSchema = z.object({
  region: z.string().refine(isRegion),
  bindingId: z.string().optional(),
  currentItems: z.array(z.object({
    areaItemId: z.string().optional(),
    id: z.string().optional(),
    level: z.number().int().nonnegative().optional()
  })).optional(),
  targetCards: z.array(z.object({
    characterId: z.string().optional(),
    cardId: z.string().optional(),
    unit: z.string().optional(),
    attribute: z.string().optional()
  })).optional(),
  materials: z.unknown().optional(),
  cardIds: z.array(z.string().min(1)).min(1).max(5).optional(),
  sortBy: z.enum(["coin-efficiency", "power-gain", "affordable"]).optional(),
  includeUnaffordable: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional()
});

const eventPointCalcSchema = z.object({
  region: z.string().refine(isRegion),
  bindingId: z.string().optional(),
  eventId: z.string().optional(),
  musicId: z.string().optional(),
  difficulty: z.string().optional(),
  liveType: z.enum(["solo", "multi", "auto", "cheerful", "challenge"]).optional(),
  calculationMode: z.enum(["normal", "challenge", "world_bloom", "wl", "wl3"]).optional(),
  specialCharacterId: z.string().optional(),
  gameCharacterId: z.string().optional(),
  worldBloomSupportUnit: z.string().optional(),
  worldBloomEventTurn: z.number().int().min(1).max(3).optional(),
  eventBonusPercent: z.number().optional(),
  baseScore: z.number().nonnegative().optional(),
  boost: z.number().int().min(0).max(10).optional(),
  targetPt: z.number().nonnegative().optional(),
  currentPt: z.number().nonnegative().optional(),
  selfEffectiveness: z.number().nonnegative().optional(),
  ...multiLiveFields
});

const normalEventPlanSchema = z.object({
  region: z.string().refine(isRegion),
  bindingId: z.string().optional(),
  eventId: z.string().optional(),
  musicId: z.string().optional(),
  difficulty: z.string().optional(),
  liveType: z.enum(["solo", "multi", "auto", "cheerful", "challenge"]).optional(),
  calculationMode: z.enum(["normal", "challenge", "world_bloom", "wl", "wl3"]).optional(),
  specialCharacterId: z.string().optional(),
  gameCharacterId: z.string().optional(),
  worldBloomSupportUnit: z.string().optional(),
  worldBloomEventTurn: z.number().int().min(1).max(3).optional(),
  currentPt: z.number().nonnegative().optional(),
  targetPt: z.number().nonnegative().optional(),
  remainingMinutes: z.number().nonnegative().optional(),
  boost: z.number().int().min(0).max(10).optional(),
  baseScore: z.number().nonnegative().optional(),
  eventBonusPercent: z.number().optional(),
  ownedCardIds: z.array(z.string().min(1)).optional(),
  inventory: z.array(inventoryItemSchema).optional(),
  playerAssets: z.record(z.unknown()).optional(),
  preferredDifficulties: z.array(z.string()).optional(),
  target: z.enum(["event", "power", "skill"]).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  timeoutMs: z.number().int().min(100).max(30000).optional(),
  ...multiLiveFields
});

const deckCompareCandidateSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(80).optional(),
  deckConfigId: z.string().optional(),
  cardIds: z.array(z.string().min(1)).min(1).max(5).optional(),
  power: z.number().positive().optional(),
  effectiveness: z.number().nonnegative().optional()
}).refine((value) => value.deckConfigId || value.cardIds?.length || (value.power != null && value.effectiveness != null), "Candidate requires deckConfigId, cardIds, or manual power/effectiveness");

const deckCompareSchema = z.object({
  region: z.string().refine(isRegion),
  bindingId: z.string().optional(),
  musicId: z.string().min(1),
  difficulty: z.string().min(1),
  candidates: z.array(deckCompareCandidateSchema).min(2).max(5),
  inventory: z.array(inventoryItemSchema).optional(),
  playerAssets: z.record(z.unknown()).optional(),
  eventBonusPercent: z.number().optional(),
  boost: z.number().int().min(0).max(10).optional(),
  liveType: z.enum(["multi", "cheerful"]).optional(),
  scoreMode: z.enum(["aggregate", "exact"]).optional(),
  skills: z.array(z.number().nonnegative()).min(1).max(6).optional(),
  multiSumPower: z.number().positive().optional(),
  feverMusicId: z.string().optional(),
  feverDifficulty: z.string().optional(),
  ...multiLiveFields
});

const mysekaiCalcSchema = z.object({
  region: z.string().refine(isRegion),
  bindingId: z.string().optional(),
  cards: z.array(inventoryItemSchema).optional(),
  playerAssets: z.record(z.unknown()).optional(),
  targetCharacterId: z.string().optional(),
  targetUnit: z.string().optional(),
  eventId: z.string().optional(),
  specialCharacterId: z.string().optional(),
  calculationMode: z.enum(["mysekai", "world_bloom", "wl3"]).optional(),
  eventBonus: z.number().optional(),
  supportDeckBonus: z.number().optional(),
  search: z.object({
    algorithm: z.enum(["ga", "beam"]).optional(),
    candidatePoolSize: z.number().int().min(1).max(500).optional(),
    beamWidth: z.number().int().min(5).max(128).optional(),
    uniqueCharacter: z.boolean().optional(),
    gaConfig: z.object({
      seed: z.number().int().min(-2147483648).max(2147483647).optional(),
      maxIter: z.number().int().min(1).max(1000).optional(),
      maxIterNoImprove: z.number().int().min(1).max(200).optional(),
      popSize: z.number().int().min(20).max(8000).optional(),
      parentSize: z.number().int().min(2).max(800).optional(),
      eliteSize: z.number().int().min(1).max(100).optional(),
      crossoverRate: z.number().min(0).max(1).optional(),
      baseMutationRate: z.number().min(0).max(1).optional(),
      noImproveIterToMutationRate: z.number().min(0).max(1).optional(),
      timeoutMs: z.number().int().min(1000).max(15000).optional(),
      target: z.enum(["score", "power"]).optional()
    }).optional()
  }).optional()
});

const playerBindingSchema = z.object({
  region: z.string().refine(isRegion),
  playerUid: z.string().min(1).max(32),
  displayName: z.string().max(80).optional(),
  isDefault: z.boolean().default(false),
  note: z.string().max(500).optional()
});

const playerBindingPatchSchema = playerBindingSchema.partial().omit({ playerUid: true, region: true });

const harukiPublicPreviewSchema = z.object({
  region: z.string().refine(isRegion),
  playerUid: z.string().trim().regex(/^\d{5,32}$/)
}).strict();

const harukiOAuthStartSchema = z.object({
  client: z.enum(["web", "android"]),
  redirectUri: z.string().max(500).optional()
}).strict();

const harukiBindingImportSchema = z.object({
  bindingIds: z.array(z.string().min(1).max(200)).min(1).max(20)
}).strict();

const harukiSyncConfirmSchema = z.object({
  reviewToken: z.string().min(32).max(200),
  groups: z.record(z.enum(["update", "keep"])).default({}),
  cards: z.enum(["update", "keep"]).default("update")
}).strict();

const harukiSyncSettingsSchema = z.object({
  autoSyncDaily: z.boolean()
}).strict();

const inventoryBulkSchema = z.object({
  region: z.string().refine(isRegion),
  cards: z.array(inventoryItemSchema).max(1000)
});

const deckConfigSchema = z.object({
  id: z.string().optional(),
  bindingId: z.string().optional(),
  region: z.string().refine(isRegion),
  name: z.string().min(1).max(80),
  eventId: z.string().optional(),
  leaderCardId: z.string().optional(),
  cardIds: z.array(z.string().min(1)).min(1).max(5),
  note: z.string().max(500).optional()
});

const playerDataKindSet = new Set<PlayerDataKind>(playerDataKinds);

const playerDataSchema = z.object({
  region: z.string().refine(isRegion).optional(),
  data: z.unknown()
});

const collectionTypes = new Set([
  "gachas",
  "honors",
  "honorGroups",
  "materials",
  "costumes",
  "stamps",
  "comics",
  "eventMusics",
  "musicVocals",
  "eventDeckBonuses",
  "eventRarityBonusRates",
  "gameCharacterUnits",
  "cardRarities",
  "cardEpisodes",
  "masterLessons",
  "areaItemLevels",
  "exchanges",
  "shopItems",
  "missions",
  "announcements",
  "stories",
  "virtualLives",
  "live2d",
  "mysekai"
]);

const accessTokenTtl = "15m";
const refreshTokenTtlMs = 1000 * 60 * 60 * 24 * 30;
const authStateTtlMs = 1000 * 60 * 10;
const emailCodeTtlSeconds = 5 * 60;
const emailCodeResendCooldownSeconds = 60;

function refreshExpiresAt() {
  return new Date(Date.now() + refreshTokenTtlMs).toISOString();
}

function authStateExpiresAt() {
  return new Date(Date.now() + authStateTtlMs).toISOString();
}

function emailCodeExpiresAt() {
  return new Date(Date.now() + emailCodeTtlSeconds * 1000).toISOString();
}

function createSixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function normalizeRedirectTo(value?: string) {
  if (!value) return config.publicWebBaseUrl;
  if (value === mobileQqRedirect) return mobileQqLoginState;
  if (value.startsWith("/")) return `${config.publicWebBaseUrl}${value}`;
  try {
    const target = new URL(value);
    const base = new URL(config.publicWebBaseUrl);
    return target.origin === base.origin ? target.toString() : config.publicWebBaseUrl;
  } catch {
    return config.publicWebBaseUrl;
  }
}

const mobileQqRedirect = "pjsktools://auth/qq";
const mobileQqLoginState = "mobile-login";
const mobileQqLinkStatePrefix = "mobile-link:";
const mobileHandoffTtlMs = 2 * 60 * 1000;
function mobileHandoffExpiresAt() { return new Date(Date.now() + mobileHandoffTtlMs).toISOString(); }
function mobileQqDeepLink(handoff: string) { return `${mobileQqRedirect}?handoff=${encodeURIComponent(handoff)}`; }

async function requireBinding(userId: string, bindingId: string) {
  return (await store.listPlayerBindings(userId)).find((item) => item.id === bindingId) ?? null;
}

async function getPlayerAssetMap(userId: string, bindingId: string) {
  const records = await store.listPlayerData(userId, bindingId);
  return Object.fromEntries(records.map((record) => [record.kind, record.data]));
}

function hasUploadedAsset(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return value != null;
}

function toolState(ready: boolean, missingFields: string[] = [], warnings: string[] = []) {
  return {
    ready,
    missingFields,
    warnings
  };
}

async function deriveEventBonusPercent(region: RegionId, eventId: string | undefined, inventory: Awaited<ReturnType<typeof store.listInventory>>, playerAssets: Record<string, unknown>) {
  if (!eventId || !inventory.length) return undefined;
  const result = await recommendDeck({
    region,
    eventId,
    inventory,
    playerAssets,
    limit: 1,
    timeoutMs: 1000
  });
  const bestDeck = result.recommendedDecks?.[0];
  return bestDeck?.totalEventBonus ?? result.recommendedCards?.reduce((sum: number, item: any) => sum + Number(item.eventBonus ?? 0), 0);
}

async function buildToolContext(userId: string, bindingId: string) {
  const binding = await requireBinding(userId, bindingId);
  if (!binding) return null;
  const [inventory, playerData, summary] = await Promise.all([
    store.listInventory(userId, binding.id),
    store.listPlayerData(userId, binding.id),
    buildBindingSummary(userId, binding.id)
  ]);
  const completeness = await buildBindingCompleteness(binding, inventory, playerData);
  const assetMap = Object.fromEntries(playerData.map((record) => [record.kind, record.data]));
  const hasAreaItems = hasUploadedAsset(assetMap["area-items"]);
  const hasCharacterRanks = hasUploadedAsset(assetMap["character-ranks"]);
  const hasMusicResults = hasUploadedAsset(assetMap["music-results"]);
  const hasMaterials = hasUploadedAsset(assetMap.materials);
  const hasMysekai = ["mysekai-canvas", "mysekai-gates", "mysekai-fixtures"].some((kind) => hasUploadedAsset(assetMap[kind]));
  const hasChallengeLive = hasUploadedAsset(assetMap["challenge-live"]);
  const hasWorldBloom = hasUploadedAsset(assetMap["world-bloom-support"]);
  const worldBloomRecommendableFromInventory = inventory.length >= 5;
  const formulaV3Readiness = {
    inventory: toolState(inventory.length >= 5, inventory.length >= 5 ? [] : ["At least 5 uploaded cards are required"]),
    cardState: toolState(inventory.some((card) => card.level || card.masterRank || card.skillLevel || card.episodes?.length || card.episodesRead), [
      ...(inventory.some((card) => card.level || card.masterRank || card.skillLevel || card.episodes?.length || card.episodesRead) ? [] : ["Missing level/MR/skill/episode states on uploaded cards"])
    ]),
    skill: toolState(inventory.some((card) => card.skillLevel), inventory.some((card) => card.skillLevel) ? [] : ["Missing uploaded skillLevel; skillEffectDetails will use level 1 fallback"]),
    areaItems: toolState(hasAreaItems, hasAreaItems ? [] : ["Missing uploaded area-items"]),
    characterRanks: toolState(hasCharacterRanks, hasCharacterRanks ? [] : ["Missing uploaded character-ranks"]),
    challengeLive: toolState(hasChallengeLive, hasChallengeLive ? [] : ["Missing uploaded challenge-live"]),
    worldBloom: {
      ...toolState(hasWorldBloom || worldBloomRecommendableFromInventory, hasWorldBloom || worldBloomRecommendableFromInventory ? [] : ["Missing uploaded world-bloom-support or at least 5 cards for inventory recommendation"]),
      uploadedSupportReady: hasWorldBloom,
      recommendableFromInventory: worldBloomRecommendableFromInventory
    },
    mysekai: toolState(hasMysekai, hasMysekai ? [] : ["Missing uploaded MySekai canvas/gate/fixture data"]),
    mysekaiSearch: toolState(inventory.length >= 5 && hasMysekai, [
      ...(inventory.length >= 5 ? [] : ["At least 5 uploaded cards are required"]),
      ...(hasMysekai ? [] : ["Missing uploaded MySekai canvas/gate/fixture data"])
    ]),
    mysekaiEventPoint: toolState(inventory.length >= 5, inventory.length >= 5 ? [] : ["At least 5 uploaded cards are required for deck power"])
  };
  const toolAvailability = {
    deckRecommend: toolState(inventory.length >= 5, [
      ...(inventory.length >= 5 ? [] : ["At least 5 uploaded cards are required"]),
      ...(hasAreaItems ? [] : ["Missing uploaded area-items"]),
      ...(hasCharacterRanks ? [] : ["Missing uploaded character-ranks"])
    ]),
    eventPointCalc: toolState(true, hasMusicResults ? [] : ["Missing uploaded music-results for personalized difficulty preferences"]),
    scoreControl: toolState(true, hasMusicResults ? [] : ["Missing uploaded music-results for personalized assumptions"]),
    musicRecommend: toolState(true, hasMusicResults ? [] : ["Missing uploaded music-results for preferred difficulty defaults"]),
    areaItemRecommend: toolState(true, [
      ...(hasAreaItems ? [] : ["Missing uploaded area-items"]),
      ...(hasMaterials ? [] : ["Missing uploaded materials; material affordability will not be assumed"])
    ]),
    normalEventPlan: toolState(inventory.length >= 5, [
      ...(inventory.length >= 5 ? [] : ["At least 5 uploaded cards are required"]),
      ...(hasAreaItems ? [] : ["Missing uploaded area-items"]),
      ...(hasCharacterRanks ? [] : ["Missing uploaded character-ranks"]),
      ...(hasMusicResults ? [] : ["Missing uploaded music-results for personalized difficulty preferences"])
    ]),
    mysekaiCalc: toolState(hasMysekai || inventory.length > 0, [
      ...(inventory.length ? [] : ["Missing uploaded cards"]),
      ...(hasMysekai ? [] : ["Missing uploaded MySekai canvas/gate/fixture data"])
    ])
  };
  const toolContextWarnings = Object.entries(toolAvailability)
    .flatMap(([tool, state]) => state.missingFields.map((field) => `${tool}: ${field}`));
  return {
    binding,
    publicProfileSnapshot: binding.publicProfileSnapshot ?? null,
    inventoryCount: inventory.length,
    playerDataKinds: playerData.map((record) => record.kind),
    completeness,
    formulaReadiness: {
      deckRecommend: completeness.sections.deckRecommend,
      eventPoint: completeness.sections.eventPoint,
      challengeLive: completeness.sections.challengeLive,
      worldBloom: completeness.sections.worldBloom,
      mysekai: completeness.sections.mysekai,
      v3: formulaV3Readiness
    },
    sharedFormulaVersion,
    assetReadiness: buildAssetReadiness(inventory, assetMap),
    formulaImpact: {
      inventory: "Affects deck recommendation, derived event bonus, event point estimates, and MySekai calculations",
      areaItems: "Affects card power breakdown and area item upgrade suggestions",
      characterRanks: "Affects card power breakdown",
      musicResults: "Affects personalized difficulty defaults for music recommend and score-control assumptions",
      materials: "Used only as optional context; material affordability is not assumed unless explicitly uploaded",
      challengeLive: "Affects challenge mode deck filtering and modeSpecificBreakdown.challenge",
      worldBloom: "Affects World Bloom/WL support deck and modeSpecificBreakdown.worldBloom",
      mysekai: "Affects MySekai deck search, canvas/gate/fixture bonuses, fixture limits, and MySekai event point"
    },
    toolAvailability,
    normalEventPlan: toolAvailability.normalEventPlan,
    toolContextWarnings,
    summary,
    realDataRequired: true
  };
}

async function issueAuth(app: ReturnType<typeof Fastify>, userId: string, email?: string) {
  const refreshToken = randomUUID() + randomUUID();
  await store.createSession(userId, refreshToken, refreshExpiresAt());
  const accessToken = app.jwt.sign({ sub: userId, email }, { expiresIn: accessTokenTtl });
  const user = await store.getUser(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  return {
    token: accessToken,
    accessToken,
    refreshToken,
    expiresIn: 15 * 60,
    user: toPublicUser(user)
  };
}

async function resolveQqLogin(code: string, state: string) {
  const authState = await store.consumeAuthState("qq", state);
  if (!authState) throw new Error("INVALID_AUTH_STATE");
  const token = await exchangeQqCode(code);
  const openId = await fetchQqOpenId(token.accessToken);
  const info = await fetchQqUserInfo(token.accessToken, openId.openId);
  const expiresAt = token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : undefined;
  return {
    authState,
    oauth: {
      provider: "qq" as const,
      providerUserId: openId.openId,
      nickname: info.nickname,
      avatarUrl: qqAvatarUrl(info),
      accessTokenEncrypted: encryptSecret(token.accessToken),
      refreshTokenEncrypted: encryptSecret(token.refreshToken),
      expiresAt
    }
  };
}

function rankingBoardContextFailure(reply: any, context: Extract<RankingBoardContext, { ok: false }>) {
  if (context.statusCode === 404) return reply.notFound(context.message);
  if (context.statusCode === 503) return reply.serviceUnavailable(context.message);
  return reply.badRequest(context.message);
}

function publicHarukiConnection(connection: Awaited<ReturnType<typeof harukiStore.getConnection>>) {
  if (!connection) return { connected: false, oauthConfigured: harukiOAuthConfigured(), availableBindings: [] };
  return {
    connected: true,
    oauthConfigured: harukiOAuthConfigured(),
    status: connection.status,
    scope: connection.scope,
    availableBindings: connection.availableBindings,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  };
}

function harukiFailure(reply: any, error: unknown) {
  if (!(error instanceof HarukiPlayerDataError)) throw error;
  if (error.retryAfterSeconds != null) reply.header("Retry-After", String(error.retryAfterSeconds));
  const messages = {
    "not-configured": "Haruki OAuth is not configured",
    "not-found": "Haruki player data was not found",
    "public-disabled": "Haruki Public API is not enabled for this player",
    "reauthorize": "Haruki authorization expired; reconnect Haruki",
    "rate-limited": "Haruki rate limit reached; retry later",
    "upstream-error": "Haruki is temporarily unavailable",
    "invalid-response": "Haruki returned player data that pjsktools could not safely process"
  } as const;
  return reply.code(error.statusCode).send({
    statusCode: error.statusCode,
    code: `HARUKI_${error.code.replaceAll("-", "_").toUpperCase()}`,
    message: messages[error.code],
    retryable: ["rate-limited", "upstream-error"].includes(error.code)
  });
}

async function enforceHarukiRateLimit(request: any, reply: any, bucket: string, limit: number) {
  const keys = [`${bucket}:ip:${request.ip}`];
  if (request.user?.sub) keys.push(`${bucket}:user:${request.user.sub}`);
  let allowed: boolean;
  try {
    allowed = await harukiStore.consumeRateLimit(keys, limit, 60);
  } catch {
    reply.code(503).send({ statusCode: 503, code: "HARUKI_RATE_LIMIT_UNAVAILABLE", message: "Haruki request protection is unavailable", retryable: true });
    return false;
  }
  if (!allowed) {
    reply.header("Retry-After", "60");
    reply.code(429).send({ statusCode: 429, code: "HARUKI_RATE_LIMITED", message: "Too many Haruki requests", retryable: true });
    return false;
  }
  return true;
}

async function revokeHarukiTokens(tokens: Array<{ token?: string; hint: "access_token" | "refresh_token" }>) {
  const unique = new Map<string, "access_token" | "refresh_token">();
  for (const item of tokens) if (item.token) unique.set(item.token, item.hint);
  const entries = [...unique];
  const results = await Promise.allSettled(entries.map(([token, hint]) => revokeHarukiToken(token, hint)));
  return results.flatMap((result, index) => result.status === "rejected" ? [entries[index]![1]] : []);
}

async function revokeStoredHarukiConnection(connection: Awaited<ReturnType<typeof harukiStore.getConnection>>) {
  if (!connection) return [];
  const failedHints = await revokeHarukiTokens([
    { token: decryptHarukiSecret(connection.accessTokenEncrypted), hint: "access_token" },
    { token: connection.refreshTokenEncrypted ? decryptHarukiSecret(connection.refreshTokenEncrypted) : undefined, hint: "refresh_token" }
  ]);
  if (failedHints.length) await harukiStore.saveRevokeAudit({ userId: connection.userId, connectionId: connection.id, subjectHash: createHash("sha256").update(connection.subject).digest("hex"), failedHints, status: "pending", createdAt: new Date().toISOString() });
  return failedHints;
}

function normalizeHarukiCandidate(region: RegionId, value: unknown) {
  try {
    return normalizeHarukiSuite(region, value);
  } catch (error) {
    if (error instanceof HarukiSuiteValidationError) throw new HarukiPlayerDataError("invalid-response", 502);
    throw error;
  }
}

function harukiSyncFailureStatus(error: unknown) {
  return error instanceof HarukiPlayerDataError && error.code === "reauthorize"
    ? "reauthorize" as const
    : error instanceof HarukiPlayerDataError && error.code === "invalid-response"
      ? "parse-error" as const
      : "upstream-error" as const;
}

function requireHarukiReadScopes(scopes: string[]) {
  const granted = new Set(scopes);
  const required = config.harukiOAuthScope.split(/\s+/).filter(Boolean);
  if (required.some((scope) => !granted.has(scope))) throw new HarukiPlayerDataError("reauthorize", 401);
}

async function markHarukiConnectionForReauthorization(userId: string, error: unknown) {
  if (!(error instanceof HarukiPlayerDataError) || error.code !== "reauthorize") return;
  const connection = await harukiStore.getConnection(userId);
  if (!connection || connection.status === "reauthorize") return;
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = connection;
  await harukiStore.saveConnection({ ...input, userId, status: "reauthorize" });
}

async function activeHarukiAccessToken(userId: string) {
  return ensureHarukiAccessToken(userId);
}

async function fetchBindingCandidate(userId: string, binding: Awaited<ReturnType<typeof requireBinding>>) {
  if (!binding?.verified || binding.source !== "haruki-oauth") throw new Error("PLAYER_BINDING_NOT_VERIFIED");
  const { accessToken } = await activeHarukiAccessToken(userId);
  const fetched = await fetchOAuthHarukiSuite(accessToken, binding.region, binding.playerUid, binding.upstreamUploadedAt);
  if (fetched.notModified) {
    await harukiStore.updateSyncFailure(userId, binding.id, "no-change", fetched.uploadTime);
    return null;
  }
  const candidate = normalizeHarukiCandidate(binding.region, fetched.suite);
  if (!candidate.sourceSummary.userId || !candidate.sourceSummary.region
    || candidate.sourceSummary.userId !== binding.playerUid
    || candidate.sourceSummary.region !== binding.region) {
    throw new HarukiPlayerDataError("invalid-response", 502);
  }
  return candidate;
}

function harukiReview(candidate: NonNullable<Awaited<ReturnType<typeof fetchBindingCandidate>>>, currentCards: any[], currentData: any[]) {
  const currentCardsById = new Map(currentCards.map((card) => [card.cardId, card]));
  const changedCards = candidate.cards.filter((card) => {
    const current = currentCardsById.get(card.cardId);
    return !current || ["level", "masterRank", "skillLevel", "specialTrainingStatus", "defaultImage", "episodesRead", "episodes"]
      .some((field) => JSON.stringify((current as any)?.[field] ?? null) !== JSON.stringify((card as any)[field] ?? null));
  });
  const currentByKind = new Map(currentData.map((item) => [item.kind, item.data]));
  return {
    upstreamVersion: candidate.upstreamVersion,
    sourceSummary: candidate.sourceSummary,
    cards: {
      present: candidate.cardsPresent,
      incomingCount: candidate.cards.length,
      addedCount: candidate.cards.filter((card) => !currentCardsById.has(card.cardId)).length,
      changedCount: changedCards.length,
      missingCardsWillBePreserved: true
    },
    groups: Object.fromEntries(candidate.playerData.map((group) => [group.kind, {
      present: true,
      incomingCount: Array.isArray(group.data) ? group.data.length : group.data && typeof group.data === "object" ? 1 : 0,
      currentCount: Array.isArray(currentByKind.get(group.kind)) ? currentByKind.get(group.kind).length
        : currentByKind.get(group.kind) && typeof currentByKind.get(group.kind) === "object" ? 1 : 0,
      emptyRequiresConfirmation: harukiGroupIsEmpty(group.data)
    }]))
  };
}

function parseHarukiWebhook(value: unknown, rawBody: string, path?: { region?: string; playerUid?: string; dataType?: string }, headers?: Record<string, unknown>) {
  if (rawBody.trim().length > 0 && rawBody.trim() !== "{}") throw new Error("INVALID_HARUKI_WEBHOOK_BODY");
  const source: Record<string, unknown> = {};
  const subject = "";
  const region = String(path?.region ?? "").trim().toLowerCase();
  const playerUid = String(path?.playerUid ?? "").trim();
  const dataType = String(path?.dataType ?? "").trim().toLowerCase();
  const eventHeader = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === "x-haruki-delivery-id")?.[1];
  const eventId = String(eventHeader ?? "").trim();
  if (!eventId || eventId.length > 200) throw new Error("MISSING_HARUKI_DELIVERY_ID");
  if (!isRegion(region) || !/^\d{5,32}$/.test(playerUid) || !["suite", "mysekai"].includes(dataType)) throw new Error("INVALID_HARUKI_WEBHOOK");
  return {
    eventId, subject, bindingKey: "", dataType: dataType as "suite" | "mysekai", region, playerUid,
    uploadTime: typeof source.upload_time === "string" ? source.upload_time : typeof source.uploadTime === "string" ? source.uploadTime : undefined,
    payloadHash: createHash("sha256").update(rawBody).digest("hex"), status: "pending" as const,
    receivedAt: new Date().toISOString()
  };
}

export async function buildApp(options: {
  enableTestAuthRoutes?: boolean;
  shareCardProfileResolver?: typeof getPlayerProfileCached;
  verificationEmailSender?: typeof sendVerificationEmail;
  smtpAvailable?: boolean;
  authStore?: AuthStore;
} = {}) {
  validateHarukiEndpointConfiguration();
  const app = Fastify({
    logger: process.env.PJSKTOOLS_SILENT_APP_LOGS === "true" ? false : {
      serializers: {
        req: (incoming: { method?: string; url?: string }) => ({
          method: incoming.method,
          url: String(incoming.url ?? "").split("?", 1)[0]
        })
      },
      redact: {
        paths: [
          "req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie",
          "req.body.code", "req.body.token", "req.body.accessToken", "req.body.refreshToken",
          "req.body.handoff", "req.body.reviewToken"
        ],
        censor: "[REDACTED]"
      }
    },
    bodyLimit: 8 * 1024 * 1024
  });
  const buildOpenApiDocument = installOpenApi(app);
  const writeControls = createWriteControls(store);
  const verificationEmailSender = options.verificationEmailSender ?? sendVerificationEmail;
  const smtpAvailable = options.smtpAvailable ?? smtpConfigured();
  const emailVerificationStore = options.authStore ?? store;
  await app.register(cors, { origin: config.corsAllowedOrigins });
  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(sensible);
  await app.register(jwt, { secret: config.jwtSecret });

  app.decorate("authenticate", async (request: any, reply: any) => {
    await request.jwtVerify();
    return writeControls.before(request, reply, request.user.sub);
  });
  app.addHook("onSend", (request, reply, payload) => writeControls.after(request, reply, payload));
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/me/haruki") || request.url.startsWith("/api/me/player-") || request.url.startsWith("/api/auth/haruki")) {
      reply.header("Cache-Control", "private, no-store");
      reply.header("Pragma", "no-cache");
    }
    if (config.nodeEnv === "production") reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    return payload;
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "pjsktools-api",
    regions: regions.map((item) => item.id),
    autoUpdateEnabled: config.autoUpdateEnabled,
    harukiApiConfigured: Boolean(config.harukiApiBaseUrl),
    databaseConfigured: Boolean(config.databaseUrl),
    qqConfigured: qqConfigured(),
    smtpConfigured: smtpConfigured()
  }));

  app.get("/api/regions", async () => regions);
  app.get("/api/runtime/status", async () => getRuntimeStatus());

  app.get("/api/assets/:region/config", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getAssetConfig(region);
  });

  app.get("/api/assets/proxy", async (request, reply) => {
    const query = request.query as { url?: string };
    if (!query.url || !isAllowedExternalAssetUrl(query.url)) return reply.badRequest("Unsupported asset proxy URL");
    const failedAt = assetProxyFailures.get(query.url);
    if (failedAt && Date.now() - failedAt < 60_000) {
      reply.header("cache-control", "no-store");
      return reply.serviceUnavailable("Asset proxy source is temporarily unavailable");
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const range = request.headers.range;
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 8_000);
      const upstream = await fetch(query.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "pjsktools-local-dev",
          ...(range ? { range } : {}),
          ...(request.headers["if-none-match"] ? { "if-none-match": String(request.headers["if-none-match"]) } : {}),
          ...(request.headers["if-modified-since"] ? { "if-modified-since": String(request.headers["if-modified-since"]) } : {})
        }
      });
      clearTimeout(timeout);
      timeout = undefined;
      if (upstream.status === 304) return reply.code(304).send();
      if (!upstream.ok) {
        assetProxyFailures.set(query.url, Date.now());
        reply.header("cache-control", "no-store");
        return reply.code(upstream.status).send(`Upstream asset unavailable: ${upstream.status}`);
      }
      const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
      const contentLength = upstream.headers.get("content-length");
      const contentRange = upstream.headers.get("content-range");
      const acceptRanges = upstream.headers.get("accept-ranges");
      const etag = upstream.headers.get("etag");
      const lastModified = upstream.headers.get("last-modified");
      reply.header("content-type", contentType);
      if (contentLength) reply.header("content-length", contentLength);
      if (contentRange) reply.header("content-range", contentRange);
      reply.header("accept-ranges", acceptRanges ?? "bytes");
      if (etag) reply.header("etag", etag);
      if (lastModified) reply.header("last-modified", lastModified);
      reply.header("cache-control", "public, max-age=31536000, immutable");
      if (upstream.status === 206) reply.code(206);
      if (!upstream.body) return reply.send();
      assetProxyFailures.delete(query.url);
      return reply.send(Readable.fromWeb(upstream.body as any));
    } catch (error) {
      assetProxyFailures.set(query.url, Date.now());
      return reply.serviceUnavailable(`Asset proxy failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  });

  app.get("/api/assets/resolve", async (request, reply) => {
    const query = request.query as { url?: string | string[] };
    const urls = (Array.isArray(query.url) ? query.url : query.url ? [query.url] : []).slice(0, 3);
    if (!urls.length || urls.some((url) => !isAllowedExternalAssetUrl(url))) {
      return reply.badRequest("Unsupported asset resolve URL");
    }
    try {
      const asset = await assetResolver.resolve(urls);
      reply.header("content-type", asset.contentType);
      reply.header("content-length", String(asset.size));
      reply.header("cache-control", "public, max-age=31536000, immutable");
      reply.header("x-asset-cache", asset.cacheHit ? "hit" : "miss");
      if (asset.etag) reply.header("etag", asset.etag);
      if (asset.lastModified) reply.header("last-modified", asset.lastModified);
      return reply.send(asset.body);
    } catch (error) {
      reply.header("cache-control", "no-store");
      const status = error instanceof AssetResolveError && error.status >= 400 && error.status < 500 ? error.status : 503;
      return reply.code(status).send(error instanceof Error ? error.message : "Asset resolution failed");
    }
  });

  app.get("/api/master/:region/songs", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getSongs(region);
  });

  app.get("/api/master/:region/music/:musicId", async (request, reply) => {
    const { region, musicId } = request.params as { region: string; musicId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const song = await getSongDetail(region, musicId);
    return song ?? reply.notFound("Music not found");
  });

  app.get("/api/master/:region/music/:musicId/full", async (request, reply) => {
    const { region, musicId } = request.params as { region: string; musicId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getMusicFullDetail(region, musicId);
    return detail ?? reply.notFound("Music not found");
  });

  app.get("/api/master/:region/music/:musicId/assets", async (request, reply) => {
    const { region, musicId } = request.params as { region: string; musicId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const song = await getSongDetail(region, musicId);
    if (!song) return reply.notFound("Music not found");
    return getMusicAssetDetail(region, song);
  });

  app.get("/api/master/:region/music/:musicId/relations", async (request, reply) => {
    const { region, musicId } = request.params as { region: string; musicId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getMusicRelations(region, musicId);
  });

  app.get("/api/master/:region/music/:musicId/charts/:difficulty", async (request, reply) => {
    const { region, musicId, difficulty } = request.params as { region: string; musicId: string; difficulty: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const song = await getSongDetail(region, musicId);
    if (!song) return reply.notFound("Music not found");
    return getChartAssetDetail(region, song, difficulty);
  });

  app.get("/api/master/:region/cards", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getCards(region);
  });

  app.get("/api/master/:region/cards/:cardId", async (request, reply) => {
    const { region, cardId } = request.params as { region: string; cardId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const card = await getCardDetail(region, cardId);
    return card ?? reply.notFound("Card not found");
  });

  app.get("/api/master/:region/cards/:cardId/full", async (request, reply) => {
    const { region, cardId } = request.params as { region: string; cardId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getCardFullDetail(region, cardId);
    return detail ?? reply.notFound("Card not found");
  });

  app.get("/api/master/:region/cards/:cardId/assets", async (request, reply) => {
    const { region, cardId } = request.params as { region: string; cardId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const card = await getCardDetail(region, cardId);
    if (!card) return reply.notFound("Card not found");
    return getCardAssetDetail(region, card);
  });

  app.get("/api/master/:region/status", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getMasterRegionStatus(region);
  });

  app.post("/api/master/:region/sync", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const cache = await syncMasterRegion(region);
    return getMasterRegionStatus(cache.region);
  });

  app.get("/api/master/:region/events/:eventId", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getEventDetail(region, eventId);
    return detail ?? reply.notFound("Event not found");
  });

  app.get("/api/master/:region/events/:eventId/full", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getEventFullDetail(region, eventId);
    return detail ?? reply.notFound("Event not found");
  });

  app.get("/api/master/:region/events/:eventId/assets", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getEventDetail(region, eventId);
    if (!detail) return reply.notFound("Event not found");
    return getEventAssetDetail(region, detail);
  });

  app.get("/api/master/:region/events/:eventId/relations", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getEventRelations(region, eventId);
  });

  app.get("/api/master/:region/catalog/:catalogType", async (request, reply) => {
    const { region, catalogType } = request.params as { region: string; catalogType: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const parsed = catalogQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const payload = await getMasterCatalog(region, catalogType, parsed.data);
    return catalogResponse(reply, request, payload);
  });

  for (const catalogType of ["events", "songs", "cards"] as const) {
    app.get(`/api/master/:region/catalogs/${catalogType}`, async (request, reply) => {
      const { region } = request.params as { region: string };
      if (!isRegion(region)) return reply.badRequest("Unsupported region");
      const parsed = catalogQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.badRequest(parsed.error.message);
      return catalogResponse(reply, request, await getMasterCatalog(region, catalogType, parsed.data));
    });
  }

  for (const catalogType of ["gachas", "honors", "materials", "costumes", "stamps", "comics"] as const) {
    app.get(`/api/master/:region/catalogs/${catalogType}`, async (request, reply) => {
      const { region } = request.params as { region: string };
      if (!isRegion(region)) return reply.badRequest("Unsupported region");
      const parsed = catalogQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.badRequest(parsed.error.message);
      return catalogResponse(reply, request, await getAndroidCatalog(region, catalogType, parsed.data));
    });
    app.get(`/api/master/:region/catalogs/${catalogType}/:itemId`, async (request, reply) => {
      const { region, itemId } = request.params as { region: string; itemId: string };
      if (!isRegion(region)) return reply.badRequest("Unsupported region");
      const detail = await getAndroidCatalogDetail(region, catalogType, itemId);
      return detail ?? reply.notFound("Master item not found");
    });
  }

  app.get("/api/master/:region/cards/import-manifest", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getCardImportManifest(region);
  });

  app.get("/api/master/:region/information", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getInformationCollection(region);
  });

  app.get("/api/master/:region/information-view/*", async (request, reply) => {
    const { region, "*": resourcePath } = request.params as { region: string; "*": string };
    if (!isRegion(region) || (region !== "jp" && region !== "cn")) return reply.notFound("Information is not released for this region");
    const upstreamBase = region === "jp"
      ? "https://production-web.sekai.colorfulpalette.org"
      : "https://lf3-mkcncdn-tos.dailygn.com";
    const requestUrl = new URL(request.raw.url ?? "", "http://localhost");
    const upstreamUrl = new URL(`/${resourcePath}${requestUrl.search}`, upstreamBase);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const upstream = await fetch(upstreamUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          Referer: `${upstreamBase}/`,
          Accept: String(request.headers.accept ?? "*/*")
        }
      });
      if (!upstream.ok) return reply.code(upstream.status).send(`Information resource unavailable: ${upstream.status}`);
      const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
      reply.header("content-type", contentType);
      reply.header("cache-control", contentType.includes("text/html") ? "public, max-age=60" : "public, max-age=86400");
      if (!/text|javascript|json|css|xml/i.test(contentType)) {
        if (!upstream.body) return reply.send();
        return reply.send(Readable.fromWeb(upstream.body as any));
      }
      const prefix = `/api/master/${region}/information-view`;
      const body = (await upstream.text())
        .replace(/(["'(=:\s])\/(?!\/|api\/master\/)/g, `$1${prefix}/`)
        .replace(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "g"), `${prefix}/`);
      return reply.send(body);
    } catch (error) {
      return reply.serviceUnavailable(`Information proxy failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get("/api/master/:region/information-content/:informationId", async (request, reply) => {
    const { region, informationId } = request.params as { region: string; informationId: string };
    if (!isRegion(region) || (region !== "jp" && region !== "cn")) return reply.notFound("Information is not released for this region");
    const detail = await getInformationDetail(region, informationId);
    reply.type("text/html; charset=utf-8");
    reply.header("content-security-policy", "default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline' https:; font-src https: data:; frame-src https:; form-action 'none'; base-uri https:");
    const contentSourceUrl = detail && "contentSourceUrl" in detail ? detail.contentSourceUrl : undefined;
    if (!detail || detail.embedStatus !== "ready" || !contentSourceUrl) {
      reply.header("cache-control", "no-store");
      return reply.send(informationFallbackDocument("该公告没有可内嵌的正文，请使用外部打开入口。", detail?.detailUrl));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const contentUrl = new URL(contentSourceUrl);
      const upstream = await fetch(contentUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          Referer: `${contentUrl.origin}/`,
          Accept: "text/html,application/xhtml+xml"
        }
      });
      if (!upstream.ok) {
        reply.header("cache-control", "no-store");
        return reply.send(informationFallbackDocument(`公告正文暂不可用（上游状态 ${upstream.status}）。`, detail.detailUrl));
      }
      const content = sanitizeInformationDocument(await upstream.text(), contentUrl.toString(), region === "cn" ? "zh-CN" : "ja");
      reply.header("cache-control", "public, max-age=300, stale-while-revalidate=3600");
      return reply.send(content);
    } catch {
      reply.header("cache-control", "no-store");
      return reply.send(informationFallbackDocument("公告正文请求失败，请稍后重试或使用外部打开入口。", detail.detailUrl));
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get("/api/master/:region/content-status", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return catalogResponse(reply, request, await getContentStatus(region));
  });

  app.get("/api/master/:region/information/:informationId", async (request, reply) => {
    const { region, informationId } = request.params as { region: string; informationId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getInformationDetail(region, informationId);
    return detail ?? reply.notFound("Information item not found");
  });

  app.get("/api/master/:region/live2d/models", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const query = request.query as Record<string, string | undefined>;
    const hasCatalogQuery = ["page", "pageSize", "q", "characterId", "costumeType", "availability"].some((key) => query[key] != null);
    const payload = await getLive2dModels(region, hasCatalogQuery ? {
      page: Number(query.page ?? 1),
      pageSize: Number(query.pageSize ?? 24),
      q: query.q,
      characterId: query.characterId ? Number(query.characterId) : undefined,
      costumeType: query.costumeType,
      availability: query.availability as "verified-playable" | "region-referenced" | "global-only" | "unavailable" | "all" | undefined
    } : {});
    return payload && "items" in payload ? withPaginationFlags(payload as any) : payload;
  });

  app.get("/api/master/:region/live2d/models/:modelId/full", async (request, reply) => {
    const { region, modelId } = request.params as { region: string; modelId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getLive2dModelDetail(region, modelId);
    return detail ?? reply.notFound("Live2D model not found");
  });

  app.get("/api/master/:region/live2d/models/:modelId/model3-proxy", async (request, reply) => {
    const { region, modelId } = request.params as { region: string; modelId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    try {
      const rewritten = await getLive2dModel3Proxy(region, modelId);
      if (!rewritten) return reply.notFound("Live2D model not found");
      reply.header("cache-control", "public, max-age=3600");
      return rewritten.rewrittenModel3Json;
    } catch (error) {
      return reply.serviceUnavailable(`Live2D model3 rewrite failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  app.get("/api/master/:region/exchanges/context", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return catalogResponse(reply, request, await getExchangeCatalog(region));
  });

  app.get("/api/master/:region/exchanges/:exchangeId", async (request, reply) => {
    const { region, exchangeId } = request.params as { region: string; exchangeId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getExchangeDetail(region, exchangeId);
    return detail ?? reply.notFound("Exchange item not found");
  });

  app.get("/api/master/:region/missions/context", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return catalogResponse(reply, request, await getMissionCatalog(region));
  });

  app.get("/api/master/:region/virtual-lives/context", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const catalog = await getVirtualLiveCatalog(region);
    const query = request.query as { page?: unknown; pageSize?: unknown };
    return query.page == null && query.pageSize == null ? catalog : { ...catalog, ...paginate(catalog.items, query) };
  });

  app.get("/api/master/:region/virtual-lives/:virtualLiveId/full", async (request, reply) => {
    const { region, virtualLiveId } = request.params as { region: string; virtualLiveId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const detail = await getVirtualLiveDetail(region, virtualLiveId);
    return detail ?? reply.notFound("Virtual Live not found");
  });

  app.get("/api/master/:region/virtual-lives/:virtualLiveId/playback", async (request, reply) => {
    const { region, virtualLiveId } = request.params as { region: string; virtualLiveId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getVirtualLivePlaybackContext(region, virtualLiveId);
  });

  app.get("/api/master/:region/virtual-lives/:virtualLiveId/steps/:stepIndex", async (request, reply) => {
    const { region, virtualLiveId, stepIndex } = request.params as { region: string; virtualLiveId: string; stepIndex: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const index = Number(stepIndex);
    if (!Number.isInteger(index) || index < 0) return reply.badRequest("Invalid Virtual Live step index");
    const step = await getVirtualLiveStepContext(region, virtualLiveId, index);
    return step ?? reply.notFound("Virtual Live step not found");
  });

  app.get("/api/master/:region/mysekai/context", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getExternalContext(region, "mysekai");
  });

  app.get("/api/master/:region/mysekai/context/full", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getMysekaiFullContext(region);
  });

  app.get("/api/master/:region/mysekai/catalog/:catalogKind", async (request, reply) => {
    const { region, catalogKind } = request.params as { region: string; catalogKind: CatalogKind };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (!["fixtures", "materials", "blueprints"].includes(catalogKind)) return reply.notFound("MySekai catalog not found");
    const parsed = catalogQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    return catalogResponse(reply, request, await getMysekaiCatalog(region, catalogKind, parsed.data));
  });

  app.get("/api/master/:region/mysekai/catalog/:catalogKind/:itemId", async (request, reply) => {
    const { region, catalogKind, itemId } = request.params as { region: string; catalogKind: CatalogKind; itemId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (!["fixtures", "materials", "blueprints"].includes(catalogKind)) return reply.notFound("MySekai catalog not found");
    const detail = await getMysekaiDetail(region, catalogKind, itemId);
    return detail ?? reply.notFound("MySekai item not found");
  });

  app.get("/api/master/:region/stories/:storyType/:storyId/full", async (request, reply) => {
    const { region, storyType, storyId } = request.params as { region: string; storyType: string; storyId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getStoryFullContext(region, storyType, storyId);
  });

  app.get("/api/master/:region/stories/:storyType/:storyId/playback", async (request, reply) => {
    const { region, storyType, storyId } = request.params as { region: string; storyType: string; storyId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getStoryPlaybackContext(region, storyType, storyId);
  });

  app.get("/api/master/:region/stories/:storyType/:storyId/episodes/:episodeId/playback", async (request, reply) => {
    const { region, storyType, storyId, episodeId } = request.params as { region: string; storyType: string; storyId: string; episodeId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getStoryPlaybackContext(region, storyType, storyId, episodeId);
  });

  app.get("/api/master/:region/stories/catalog", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const query = request.query as Record<string, string | undefined>;
    return withPaginationFlags(await getStoryCatalog(region, { storyType: query.storyType, page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 24), q: query.q, unit: query.unit, characterId: query.characterId, relatedId: query.relatedId, sort: query.sort }));
  });

  app.get("/api/master/:region/stories/context", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getStoriesContext(region);
  });

  app.get("/api/master/:region/:collection", async (request, reply) => {
    const { region, collection } = request.params as { region: string; collection: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (!collectionTypes.has(collection)) return reply.notFound("Master collection not found");
    return getMasterCollection(region, collection);
  });

  app.get("/api/master/:region/:collection/:id/full", async (request, reply) => {
    const { region, collection, id } = request.params as { region: string; collection: string; id: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (!collectionTypes.has(collection)) return reply.notFound("Master collection not found");
    const detail = await getCollectionFullDetail(region, collection, id);
    return detail ?? reply.notFound("Master item not found");
  });

  app.get("/api/master/:region/:collection/:id", async (request, reply) => {
    const { region, collection, id } = request.params as { region: string; collection: string; id: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (!collectionTypes.has(collection)) return reply.notFound("Master collection not found");
    const item = await getMasterCollectionItem(region, collection, id);
    return item ?? reply.notFound("Master item not found");
  });

  app.get("/api/events/:region", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getEvents(region);
  });

  app.get("/api/events/:region/current", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getCurrentEvent(region);
  });

  app.get("/api/events/:region/live-ranking", async (request, reply) => {
    const { region } = request.params as { region: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    const query = request.query as { boardType?: string; gameCharacterId?: string };
    const context = await validateRankingBoardContext(region, query);
    if (!context.ok) return rankingBoardContextFailure(reply, context);
    const { boardType, gameCharacterId } = context;
    const currentEvent = context.event ?? await getCurrentEvent(region);
    if (currentEvent?.id && currentEvent.id !== "none") {
      return getLiveRankingCached(region, currentEvent.id, currentEvent, false, { boardType, gameCharacterId: gameCharacterId as number | undefined });
    }
    const live = await getLatestLiveRankingCached(region, currentEvent ?? { id: "unknown" });
    if (live.eventId && !["none", "unknown"].includes(live.eventId)) {
      requestMasterRegionSync(region);
    }
    return live;
  });

  app.get("/api/events/:region/:eventId/detail", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return getCurrentEvent(region);
    const detail = await getEventDetail(region, eventId);
    return detail ?? reply.notFound("Event not found");
  });

  app.get("/api/events/:region/:eventId/ranking-top100", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return paginatedList(request, []);
    try {
      return paginatedList(request, await getRankingTop100Cached(region, eventId), 100);
    } catch (error) {
      return rankingDataFailure(reply, error, "Top 100 ranking");
    }
  });

  app.get("/api/events/:region/:eventId/ranking-border", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return paginatedList(request, []);
    try {
      return paginatedList(request, await getRankingBorderCached(region, eventId), 100);
    } catch (error) {
      return rankingDataFailure(reply, error, "Ranking border data");
    }
  });

  app.get("/api/events/:region/:eventId/ranking-churn", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return reply.notFound("No active event");
    const query = request.query as { boardType?: string; gameCharacterId?: string; top?: string };
    const context = await validateRankingBoardContext(region, query, eventId);
    if (!context.ok) return rankingBoardContextFailure(reply, context);
    const { boardType, gameCharacterId } = context;
    const top = query.top ? Math.min(Math.max(Number(query.top), 1), 1000) : undefined;
    return getRankingChurnCached(region, eventId, { boardType, gameCharacterId, top });
  });

  app.get("/api/events/:region/:eventId/ranking-history", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return { region, eventId, items: [], sampleCount: 0, unavailableReason: "No active event", realDataRequired: true };
    const query = request.query as { sampleType?: string; rank?: string; from?: string; to?: string; limit?: string; windowHours?: string };
    const sampleType = query.sampleType === "top100" || query.sampleType === "border" ? query.sampleType : undefined;
    const rank = query.rank == null ? undefined : Number(query.rank);
    const limit = query.limit == null ? undefined : Math.min(Math.max(Number(query.limit), 1), 5000);
    const windowHours = query.windowHours == null ? undefined : Number(query.windowHours);
    const items = await getRankingHistory({
      region,
      eventId,
      sampleType,
      rank: Number.isFinite(rank) ? rank : undefined,
      from: query.from,
      to: query.to,
      limit: Number.isFinite(limit) ? limit : undefined,
      windowHours: Number.isFinite(windowHours) ? windowHours : undefined
    });
    const sorted = [...items].sort((a, b) => Date.parse(a.sampledAt) - Date.parse(b.sampledAt));
    const sampleSpanHours = sorted.length >= 2
      ? Math.round(Math.max(0, (Date.parse(sorted.at(-1)!.sampledAt) - Date.parse(sorted[0].sampledAt)) / 3_600_000) * 100) / 100
      : 0;
    return {
      region,
      eventId,
      sampleType: sampleType ?? "all",
      sampleCount: items.length,
      firstSampledAt: sorted[0]?.sampledAt ?? null,
      lastSampledAt: sorted.at(-1)?.sampledAt ?? null,
      sourceHealth: {
        status: sorted.length ? "ok" : "empty",
        sampleSource: "persistent-ranking-history",
        sampleCount: items.length,
        firstSampledAt: sorted[0]?.sampledAt ?? null,
        latestSampledAt: sorted.at(-1)?.sampledAt ?? null,
        sampleSpanHours
      },
      retentionRecommendation: "Raw ranking history samples are retained until an explicit cleanup policy is implemented.",
      warnings: items.length ? [] : ["No persistent ranking history samples yet"],
      items,
      unavailableReason: items.length ? undefined : "No persistent ranking history samples yet",
      realDataRequired: true
    };
  });

  app.get("/api/events/:region/:eventId/ranking-history/summary", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return { region, eventId, lines: [], unavailableReason: "No active event", realDataRequired: true };
    const query = request.query as { sampleType?: string; rank?: string; limit?: string; windowHours?: string };
    const sampleType = query.sampleType === "top100" || query.sampleType === "border" ? query.sampleType : undefined;
    const rank = query.rank == null ? undefined : Number(query.rank);
    const limit = query.limit == null ? undefined : Math.min(Math.max(Number(query.limit), 1), 5000);
    const windowHours = query.windowHours == null ? undefined : Number(query.windowHours);
    const lines = await getRankingHistorySummary({
      region,
      eventId,
      sampleType,
      rank: Number.isFinite(rank) ? rank : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      windowHours: Number.isFinite(windowHours) ? windowHours : undefined
    });
    const maxSampleCount = Math.max(0, ...lines.map((line) => Number(line.sampleCount ?? 0)));
    const maxSampleSpanHours = Math.max(0, ...lines.map((line) => Number(line.sampleSpanHours ?? 0)));
    return {
      region,
      eventId,
      sampleType: sampleType ?? "all",
      lineCount: lines.length,
      lines,
      sourceHealth: {
        status: lines.length ? "ok" : "empty",
        sampleSource: "persistent-ranking-history",
        maxSampleCount,
        maxSampleSpanHours
      },
      retentionRecommendation: "Keep raw samples for active-event planning; archive/delete policy should be explicit.",
      warnings: lines.length ? [] : ["No persistent ranking history samples yet"],
      unavailableReason: lines.length ? undefined : "No persistent ranking history samples yet",
      realDataRequired: true
    };
  });

  app.get("/api/events/:region/:eventId/ranking-forecast", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") {
      return {
        region,
        eventId,
        generatedAt: new Date().toISOString(),
        experimental: true,
        lines: [],
        sourceHealth: { status: "empty", sampleCount: 0 },
        warnings: ["No active event"],
        unavailableReason: "No active event",
        realDataRequired: true
      };
    }
    const query = request.query as { windowHours?: string };
    const windowHours = query.windowHours == null ? undefined : Number(query.windowHours);
    return forecastRanking(region, eventId, { windowHours: Number.isFinite(windowHours) ? windowHours : undefined });
  });

  app.get("/api/events/:region/:eventId/ranking-player/:rank", async (request, reply) => {
    const { region, eventId, rank } = request.params as { region: string; eventId: string; rank: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return reply.notFound("No active event");
    const numericRank = Number(rank);
    if (!Number.isInteger(numericRank) || numericRank < 1) return reply.badRequest("Unsupported rank");
    const query = request.query as { boardType?: string; gameCharacterId?: string };
    const context = await validateRankingBoardContext(region, query, eventId);
    if (!context.ok) return rankingBoardContextFailure(reply, context);
    const { boardType, gameCharacterId } = context;
    try {
      return await getRankingPlayerDetail(region, eventId, numericRank, { boardType, gameCharacterId }, context.event);
    } catch (error) {
      return rankingPlayerFailure(reply, error);
    }
  });

  app.post("/api/events/:region/:eventId/refresh", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return { eventId, top100: [], border: [] };
    const detail = await getEventDetail(region, eventId).catch(() => null);
    const liveRanking = await getLiveRankingCached(region, eventId, detail ?? { id: eventId }, true);
    return { eventId, top100: liveRanking.top100, border: liveRanking.borderLines, liveRanking };
  });

  app.get("/api/players/:region/:userId/profile", async (request, reply) => {
    const { region, userId } = request.params as { region: string; userId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (!playerUidPattern.test(userId)) return reply.badRequest("Unsupported player UID");
    try {
      return await getPlayerProfileCached(region, userId);
    } catch (error) {
      return playerProfileFailure(reply, error);
    }
  });

  app.post("/api/players/:region/:userId/refresh", async (request, reply) => {
    const { region, userId } = request.params as { region: string; userId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (!playerUidPattern.test(userId)) return reply.badRequest("Unsupported player UID");
    try {
      return await getPlayerProfileCached(region, userId, true);
    } catch (error) {
      return playerProfileFailure(reply, error);
    }
  });

  app.post("/api/tools/score-control", async (request, reply) => {
    const body = scoreControlSchema.omit({ bindingId: true }).parse(request.body);
    if (body.region && !isRegion(body.region)) return reply.badRequest("Unsupported region");
    return calculateScoreControl(body as any);
  });

  app.post("/api/tools/event-point-calc", async (request, reply) => {
    const body = eventPointCalcSchema.omit({ bindingId: true }).parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    return estimateEventPoint({ ...body, region: body.region as RegionId });
  });

  app.post("/api/tools/deck-compare", async (request, reply) => {
    const body = deckCompareSchema.omit({ bindingId: true }).parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    if (body.candidates.some((candidate) => candidate.deckConfigId)) return reply.badRequest("Public deck comparison cannot reference saved deck configs");
    return compareDecks({ ...body, region: body.region as RegionId, candidates: body.candidates.map(({ deckConfigId: _deckConfigId, ...candidate }) => candidate) });
  });

  app.get("/api/tools/calculation-schema", async (request, reply) => {
    const query = request.query as { region?: string };
    if (query.region && !isRegion(query.region)) return reply.badRequest("Unsupported region");
    return getCalculationSchema(query.region as RegionId | undefined);
  });

  app.get("/api/tools/deck-recommend/schema", async (request, reply) => {
    const query = request.query as { region?: string };
    if (query.region && !isRegion(query.region)) return reply.badRequest("Unsupported region");
    return getDeckRecommendSchema(query.region as RegionId | undefined);
  });

  app.get("/api/master/:region/events/:eventId/bonus-config", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getEventBonusConfig(region, eventId);
  });

  app.get("/api/master/:region/events/:eventId/calculation-context", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    return getCalculationContext(region, eventId);
  });

  app.post("/api/tools/deck-recommend", async (request, reply) => {
    const body = deckRecommendSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    return recommendDeck({ ...body, region: body.region as RegionId });
  });

  app.post("/api/tools/music-recommend", async (request, reply) => {
    const body = musicRecommendSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    return recommendMusic({ ...body, region: body.region as RegionId });
  });

  app.post("/api/tools/area-item-recommend", async (request, reply) => {
    const body = areaItemRecommendSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    return recommendAreaItems({ ...body, region: body.region as RegionId });
  });

  app.post("/api/tools/normal-event-plan", async (request, reply) => {
    const body = normalEventPlanSchema.omit({ bindingId: true }).parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    return calculateNormalEventPlan({ ...body, region: body.region as RegionId });
  });

  app.post("/api/tools/mysekai-calc", async (request, reply) => {
    const body = mysekaiCalcSchema.omit({ bindingId: true }).parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    return calculateMysekai({ ...body, region: body.region as RegionId });
  });

  app.post("/api/auth/email-code/start", async (request, reply) => {
    const body = emailCodeSchema.parse(request.body);
    if (!smtpAvailable && (config.nodeEnv === "production" || options.smtpAvailable === false)) {
      return reply.serviceUnavailable("邮件验证码服务尚未配置，请联系管理员。");
    }
    const reservationId = randomUUID();
    const retryAfterSeconds = await emailVerificationStore.reserveEmailVerificationCooldown({
      email: body.email,
      purpose: body.purpose,
      reservationId,
      cooldownSeconds: emailCodeResendCooldownSeconds
    });
    if (retryAfterSeconds > 0) {
      reply.header("retry-after", String(retryAfterSeconds));
      return reply.code(429).send({
        statusCode: 429,
        code: "EMAIL_CODE_COOLDOWN",
        error: "Too Many Requests",
        message: `请等待 ${retryAfterSeconds} 秒后再获取验证码。`,
        retryAfterSeconds
      });
    }
    const code = createSixDigitCode();
    try {
      const result = await verificationEmailSender(body.email, code);
      await emailVerificationStore.createEmailVerificationCode({ email: body.email, purpose: body.purpose, code, expiresAt: emailCodeExpiresAt() });
      return {
        ok: true,
        sent: result.sent,
        expiresIn: emailCodeTtlSeconds,
        resendAfter: emailCodeResendCooldownSeconds,
        devCode: result.devCode
      };
    } catch (error) {
      await emailVerificationStore.releaseEmailVerificationCooldown({ email: body.email, purpose: body.purpose, reservationId });
      if ((error as Error).message === "SMTP_NOT_CONFIGURED") {
        return reply.serviceUnavailable("邮件验证码服务尚未配置，请联系管理员。");
      }
      request.log.error({ errorType: (error as Error).name }, "verification email delivery failed");
      return reply.serviceUnavailable("验证码邮件发送失败，请稍后重试。");
    }
  });

  app.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const strength = validatePasswordStrength(body.password, body.email);
    if (!strength.ok) return reply.badRequest(strength.reasons.join("; "));
    const codeOk = await store.consumeEmailVerificationCode({ email: body.email, purpose: "register", code: body.code });
    if (!codeOk) return reply.unauthorized("Verification code is invalid or expired");
    try {
      const user = await store.createUser(body.email, body.password);
      return reply.code(201).send(await issueAuth(app, user.id, user.email));
    } catch (error) {
      if ((error as Error).message === "EMAIL_EXISTS") return reply.conflict("Email already registered");
      throw error;
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = authSchema.parse(request.body);
    const user = await store.verifyUser(body.email, body.password);
    if (!user) return reply.unauthorized("Invalid email or password");
    return issueAuth(app, user.id, user.email);
  });

  app.get("/api/auth/me", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const user = await store.getUser(request.user.sub);
    if (!user) return reply.unauthorized("User not found");
    return { user: toPublicUser(user), oauthAccounts: await store.listOAuthAccounts(user.id) };
  });

  app.get("/api/me/profile", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const profile = await buildMeProfile(request.user.sub);
    if (!profile) return reply.unauthorized("User not found");
    const hydratedFavorites = await Promise.all(profile.favorites.map(hydrateFavorite));
    const favoriteFolders = await store.listFavoriteFolders(request.user.sub);
    return {
      ...profile,
      bindings: profile.bindings.map(withEntityVersion),
      favorites: hydratedFavorites.map(withEntityVersion),
      favoriteFolders: favoriteFolders.map((folder) => ({
        ...withEntityVersion(folder),
        itemCount: profile.favorites.filter((favorite) => favorite.folderIds.includes(folder.id)).length
      })),
      scores: profile.scores.map(withEntityVersion),
      deckConfigs: profile.deckConfigs.map(withEntityVersion)
    };
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const session = await store.getSessionByRefreshToken(body.refreshToken);
    if (!session) return reply.unauthorized("Invalid refresh token");
    const user = await store.getUser(session.userId);
    if (!user) return reply.unauthorized("User not found");
    await store.revokeSession(session.id);
    return issueAuth(app, user.id, user.email);
  });

  app.post("/api/auth/logout", async (request) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (parsed.success) {
      const session = await store.getSessionByRefreshToken(parsed.data.refreshToken);
      if (session) await store.revokeSession(session.id);
    }
    return { ok: true };
  });

  app.get("/api/auth/qq/start", async (request, reply) => {
    if (!qqConfigured()) return reply.serviceUnavailable("QQ login is not configured");
    const query = request.query as { redirectTo?: string };
    const state = createQqState();
    const redirectTo = normalizeRedirectTo(query.redirectTo);
    await store.createAuthState("qq", state, redirectTo, authStateExpiresAt());
    return { provider: "qq", state, authorizeUrl: buildQqAuthorizeUrl(state), expiresIn: authStateTtlMs / 1000 };
  });

  app.get("/api/auth/qq/mobile-link/start", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    if (!qqConfigured()) return reply.serviceUnavailable("QQ login is not configured");
    const state = createQqState();
    await store.createAuthState("qq", state, `${mobileQqLinkStatePrefix}${request.user.sub}`, authStateExpiresAt());
    return { provider: "qq", state, authorizeUrl: buildQqAuthorizeUrl(state), expiresIn: authStateTtlMs / 1000 };
  });

  app.get("/api/auth/qq/callback", async (request, reply) => {
    if (!qqConfigured()) return reply.serviceUnavailable("QQ login is not configured");
    const query = qqCallbackSchema.parse(request.query);
    try {
      const { oauth, authState } = await resolveQqLogin(query.code, query.state);
      if (authState.redirectTo.startsWith(mobileQqLinkStatePrefix)) {
        const userId = authState.redirectTo.slice(mobileQqLinkStatePrefix.length);
        if (!userId || !(await store.getUser(userId))) return reply.unauthorized("Link target user not found");
        const handoff = createQqState();
        await store.createOAuthHandoff(handoff, { kind: "link", userId, oauth }, mobileHandoffExpiresAt());
        return reply.redirect(mobileQqDeepLink(handoff));
      }
      const existing = await store.findOAuthAccount("qq", oauth.providerUserId);
      const user = existing ? await store.getUser(existing.userId) : await store.createOAuthUser(oauth);
      if (!user) return reply.unauthorized("OAuth user not found");
      if (existing) await store.linkOAuthAccount(user.id, oauth);
      if (authState.redirectTo === mobileQqLoginState) {
        const handoff = createQqState();
        await store.createOAuthHandoff(handoff, { kind: "login", userId: user.id, oauth }, mobileHandoffExpiresAt());
        return reply.redirect(mobileQqDeepLink(handoff));
      }
      return issueAuth(app, user.id, user.email);
    } catch (error) {
      if ((error as Error).message === "INVALID_AUTH_STATE") return reply.unauthorized("Invalid QQ auth state");
      throw error;
    }
  });

  app.post("/api/auth/qq/mobile-exchange", async (request, reply) => {
    const body = z.object({ handoff: z.string().min(8) }).parse(request.body);
    const handoff = await store.consumeOAuthHandoff(body.handoff, "login");
    if (!handoff?.userId) return reply.unauthorized("Invalid or expired mobile login handoff");
    const user = await store.getUser(handoff.userId);
    return user ? issueAuth(app, user.id, user.email) : reply.unauthorized("User not found");
  });

  app.post("/api/auth/qq/mobile-link/exchange", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = z.object({ handoff: z.string().min(8) }).parse(request.body);
    const handoff = await store.consumeOAuthHandoff(body.handoff, "link", request.user.sub);
    if (!handoff) return reply.unauthorized("Invalid or expired mobile link handoff");
    try {
      await store.linkOAuthAccount(request.user.sub, handoff.oauth);
      return { ok: true, oauthAccounts: await store.listOAuthAccounts(request.user.sub) };
    } catch (error) {
      if ((error as Error).message === "OAUTH_ACCOUNT_EXISTS") return reply.conflict("QQ account already linked");
      throw error;
    }
  });

  if (options.enableTestAuthRoutes && config.nodeEnv === "test") {
    app.post("/__test/auth/email-code", async (request, reply) => {
      const body = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) }).parse(request.body);
      await store.createEmailVerificationCode({ email: body.email, purpose: "register", code: body.code, expiresAt: emailCodeExpiresAt() });
      return reply.code(201).send({ ok: true });
    });
    app.post("/__test/auth/qq/handoff", async (request, reply) => {
      const body = z.object({
        handoff: z.string().min(8), kind: z.enum(["login", "link"]), userId: z.string().uuid(),
        providerUserId: z.string().min(1), expiresAt: z.string().datetime()
      }).parse(request.body);
      if (!(await store.getUser(body.userId))) return reply.notFound("User not found");
      await store.createOAuthHandoff(body.handoff, {
        kind: body.kind, userId: body.userId,
        oauth: { provider: "qq", providerUserId: body.providerUserId, nickname: "QQ test user" }
      }, body.expiresAt);
      return reply.code(201).send({ ok: true });
    });
    app.post("/__test/auth/user", async (request, reply) => {
      const body = z.object({ email: z.string().email() }).parse(request.body);
      const user = await store.createUser(body.email, "Strong-passphrase-123!");
      return reply.code(201).send(await issueAuth(app, user.id, user.email));
    });
  }

  app.post("/api/auth/qq/link", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    if (!qqConfigured()) return reply.serviceUnavailable("QQ login is not configured");
    const body = qqCallbackSchema.parse(request.body);
    try {
      const { oauth } = await resolveQqLogin(body.code, body.state);
      return store.linkOAuthAccount(request.user.sub, oauth);
    } catch (error) {
      if ((error as Error).message === "INVALID_AUTH_STATE") return reply.unauthorized("Invalid QQ auth state");
      if ((error as Error).message === "OAUTH_ACCOUNT_EXISTS") return reply.conflict("QQ account already linked");
      throw error;
    }
  });

  app.delete("/api/auth/qq/link", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    try {
      const deleted = await store.unlinkOAuthAccount(request.user.sub, "qq");
      return deleted ? { ok: true } : reply.notFound("QQ account not linked");
    } catch (error) {
      if ((error as Error).message === "LAST_LOGIN_METHOD") return reply.badRequest("Cannot unlink the last login method");
      throw error;
    }
  });

  app.get("/api/me/favorite-folders", { preHandler: (app as any).authenticate }, async (request: any) => {
    const [folders, favorites] = await Promise.all([
      store.listFavoriteFolders(request.user.sub),
      store.listFavorites(request.user.sub)
    ]);
    return folders.map((folder) => ({
      ...withEntityVersion(folder),
      itemCount: favorites.filter((favorite) => favorite.folderIds.includes(folder.id)).length
    }));
  });

  app.post("/api/me/favorite-folders", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = favoriteFolderSchema.parse(request.body);
    try {
      return setEntityTag(reply, await store.createFavoriteFolder({ ...body, userId: request.user.sub }));
    } catch (error) {
      if ((error as Error).message === "FOLDER_EXISTS") return reply.conflict("Favorite folder name already exists");
      throw error;
    }
  });

  app.patch("/api/me/favorite-folders/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listFavoriteFolders(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Favorite folder not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const body = favoriteFolderPatchSchema.parse(request.body);
    try {
      const updated = await store.updateFavoriteFolder(request.user.sub, request.params.id, {
        name: body.name ?? current.name,
        description: body.description ?? current.description
      });
      return updated ? setEntityTag(reply, updated) : reply.notFound("Favorite folder not found");
    } catch (error) {
      if ((error as Error).message === "FOLDER_EXISTS") return reply.conflict("Favorite folder name already exists");
      throw error;
    }
  });

  app.delete("/api/me/favorite-folders/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listFavoriteFolders(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Favorite folder not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    return await store.deleteFavoriteFolder(request.user.sub, request.params.id)
      ? { ok: true }
      : reply.notFound("Favorite folder not found");
  });

  app.get("/api/me/favorites", { preHandler: (app as any).authenticate }, async (request: any) => {
    const query = request.query as {
      folderId?: string;
      unfiled?: string;
      type?: string;
      region?: string;
      q?: string;
    };
    let favorites = await Promise.all((await store.listFavorites(request.user.sub)).map(hydrateFavorite));
    if (query.folderId) favorites = favorites.filter((favorite) => favorite.folderIds.includes(query.folderId!));
    if (query.unfiled === "true") favorites = favorites.filter((favorite) => favorite.folderIds.length === 0);
    if (query.type) favorites = favorites.filter((favorite) => favorite.type === query.type);
    if (query.region) favorites = favorites.filter((favorite) => favorite.region === query.region);
    if (query.q?.trim()) {
      const keyword = query.q.trim().toLowerCase();
      favorites = favorites.filter((favorite) =>
        `${favorite.label} ${favorite.targetId} ${favorite.target?.secondaryText ?? ""}`.toLowerCase().includes(keyword)
      );
    }
    return paginatedList(request, favorites.map(withEntityVersion));
  });

  app.post("/api/me/favorites", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = favoriteSchema.parse(request.body);
    const target = await resolveFavoriteTarget(body.type, body.region as RegionId, body.targetId, body.label);
    if (!target.available) return reply.notFound("Favorite target not found");
    try {
      const favorite = await store.addFavorite({
        ...body,
        label: target.displayName,
        region: body.region as RegionId,
        userId: request.user.sub
      });
      return setEntityTag(reply, { ...favorite, target });
    } catch (error) {
      if ((error as Error).message === "FOLDER_NOT_FOUND") return reply.notFound("Favorite folder not found");
      throw error;
    }
  });

  app.patch("/api/me/favorites/bulk", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = favoriteBulkPatchSchema.parse(request.body);
    try {
      const updated = await store.bulkUpdateFavoriteFolders(request.user.sub, body.favoriteIds, body.folderIds, body.mode);
      return Promise.all(updated.map(async (favorite) => withEntityVersion(await hydrateFavorite(favorite))));
    } catch (error) {
      if ((error as Error).message === "FOLDER_NOT_FOUND") return reply.notFound("Favorite folder not found");
      if ((error as Error).message === "FAVORITE_NOT_FOUND") return reply.notFound("Favorite not found");
      throw error;
    }
  });

  app.patch("/api/me/favorites/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listFavorites(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Favorite not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const body = favoriteFoldersPatchSchema.parse(request.body);
    try {
      const updated = await store.updateFavoriteFolders(request.user.sub, request.params.id, body.folderIds);
      return updated ? setEntityTag(reply, await hydrateFavorite(updated)) : reply.notFound("Favorite not found");
    } catch (error) {
      if ((error as Error).message === "FOLDER_NOT_FOUND") return reply.notFound("Favorite folder not found");
      throw error;
    }
  });

  app.delete("/api/me/favorites/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listFavorites(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Favorite not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const deleted = await store.deleteFavorite(request.user.sub, request.params.id);
    return deleted ? { ok: true } : reply.notFound("Favorite not found");
  });

  app.get("/api/me/scores", { preHandler: (app as any).authenticate }, async (request: any) => {
    return paginatedList(request, (await store.listScores(request.user.sub)).map(withEntityVersion));
  });

  app.post("/api/me/scores", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = scoreSchema.parse(request.body);
    return setEntityTag(reply, await store.upsertScore({ ...body, region: body.region as RegionId, userId: request.user.sub }));
  });

  app.patch("/api/me/scores/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listScores(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Score not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const body = scoreSchema.parse({ ...request.body, id: request.params.id });
    return setEntityTag(reply, await store.upsertScore({ ...body, region: body.region as RegionId, userId: request.user.sub }));
  });

  app.delete("/api/me/scores/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listScores(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Score not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const deleted = await store.deleteScore(request.user.sub, request.params.id);
    return deleted ? { ok: true } : reply.notFound("Score not found");
  });

  app.post("/api/me/haruki/public/preview", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    if (!await enforceHarukiRateLimit(request, reply, "public", 12)) return reply;
    const body = harukiPublicPreviewSchema.parse(request.body);
    try {
      const candidate = normalizeHarukiCandidate(body.region as RegionId, await fetchPublicHarukiSuite(body.region as RegionId, body.playerUid));
      if ((candidate.sourceSummary.userId && candidate.sourceSummary.userId !== body.playerUid)
        || (candidate.sourceSummary.region && candidate.sourceSummary.region !== body.region)) {
        throw new HarukiPlayerDataError("invalid-response", 502);
      }
      return { snapshot: publicSnapshot(body.region as RegionId, body.playerUid, candidate) };
    } catch (error) {
      return harukiFailure(reply, error);
    }
  });

  app.post("/api/integrations/haruki/webhook/:region/:dataType/:playerUid", async (request: any, reply) => {
    if (!config.harukiWebhookEnabled || !config.harukiWebhookSecret) {
      return reply.code(200).send({ ok: true, ignored: true, reason: "disabled" });
    }
    try {
      if (!await harukiStore.consumeRateLimit([`webhook:ip:${request.ip}`], 120, 60)) {
        return reply.code(200).send({ ok: true, ignored: true, reason: "rate-limited" });
      }
    } catch {
      return reply.code(200).send({ ok: true, ignored: true, reason: "protection-unavailable" });
    }
    // Haruki's production contract authenticates service callbacks with a bearer secret.
    const authorization = String(request.headers.authorization ?? "");
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
    const bearerValid = bearer.length === config.harukiWebhookSecret.length
      && timingSafeEqual(Buffer.from(bearer), Buffer.from(config.harukiWebhookSecret));
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (contentLength > 0 || request.body != null) return reply.code(400).send({ code: "HARUKI_WEBHOOK_BODY_NOT_ALLOWED" });
    const rawBody = "";
    if (!bearerValid) {
      return reply.code(200).send({ ok: true, ignored: true, reason: "unauthorized" });
    }
    try {
      const event = parseHarukiWebhook(request.body, rawBody, request.params, request.headers);
      const accepted = await harukiStore.saveWebhookEvent(event);
      return reply.code(accepted ? 202 : 200).send({ ok: true, duplicate: !accepted });
    } catch {
      return reply.code(200).send({ ok: true, ignored: true, reason: "invalid-target" });
    }
  });

  app.post("/api/me/haruki/oauth/start", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    if (!await enforceHarukiRateLimit(request, reply, "oauth", 6)) return reply;
    const body = harukiOAuthStartSchema.parse(request.body);
    if (!harukiOAuthConfigured()) return harukiFailure(reply, new HarukiPlayerDataError("not-configured", 503));
    if (body.redirectUri) {
      const allowed = body.client === "android"
        ? body.redirectUri === config.harukiAndroidReturnUri
        : normalizeRedirectTo(body.redirectUri) === body.redirectUri;
      if (!allowed) return reply.badRequest("Unsupported OAuth return URI");
    }
    const verifier = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
    await harukiStore.saveOAuthState(state, {
      userId: request.user.sub,
      client: body.client,
      redirectUri: body.redirectUri,
      codeVerifierEncrypted: encryptHarukiSecret(verifier),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
    });
    return { authorizationUrl: buildHarukiAuthorizeUrl(state, challenge), expiresIn: 600 };
  });

  app.get("/api/auth/haruki/callback", async (request: any, reply) => {
    const query = z.object({
      code: z.string().min(1).optional(),
      state: z.string().min(8),
      error: z.string().max(100).optional()
    }).parse(request.query);
    const state = await harukiStore.consumeOAuthState(query.state);
    const webError = (code: string) => reply.redirect(`${config.publicWebBaseUrl}/me/assets?haruki=error&code=${encodeURIComponent(code)}`);
    const androidRedirect = (parameters: Record<string, string>) => {
      const target = new URL(state?.redirectUri ?? config.harukiAndroidReturnUri);
      for (const [key, value] of Object.entries(parameters)) target.searchParams.set(key, value);
      return reply.redirect(target.toString());
    };
    if (!state) return webError("invalid_state");
    if (query.error || !query.code) return state.client === "android"
      ? androidRedirect({ error: query.error ?? "missing_code" })
      : webError(query.error ?? "missing_code");
    let issuedTokens: Array<{ token?: string; hint: "access_token" | "refresh_token" }> = [];
    try {
      const previousConnection = await harukiStore.getConnection(state.userId);
      const token = await exchangeHarukiCode(query.code, decryptHarukiSecret(state.codeVerifierEncrypted));
      issuedTokens = [
        { token: token.accessToken, hint: "access_token" },
        { token: token.refreshToken, hint: "refresh_token" }
      ];
      requireHarukiReadScopes(token.scope);
      const profile = await fetchHarukiProfile(token.accessToken);
      const bindings = await fetchHarukiBindings(token.accessToken, profile.subject);
      if (!token.refreshToken) throw new HarukiPlayerDataError("reauthorize", 401);
      await harukiStore.saveConnection({
        userId: state.userId,
        subject: profile.subject,
        scope: token.scope,
        accessTokenEncrypted: encryptHarukiSecret(token.accessToken),
        refreshTokenEncrypted: token.refreshToken ? encryptHarukiSecret(token.refreshToken) : undefined,
        tokenExpiresAt: token.expiresAt,
        encryptionKeyVersion: config.harukiTokenEncryptionKeyVersion,
        status: "active",
        availableBindings: bindings
      });
      if (previousConnection) {
        const filtered = ([
          { token: decryptHarukiSecret(previousConnection.accessTokenEncrypted), hint: "access_token" as const },
          { token: previousConnection.refreshTokenEncrypted ? decryptHarukiSecret(previousConnection.refreshTokenEncrypted) : undefined, hint: "refresh_token" as const }
        ]).filter((item) => item.token && !issuedTokens.some((issued) => issued.token === item.token));
        const failedHints = await revokeHarukiTokens(filtered);
        if (failedHints.length) await harukiStore.saveRevokeAudit({ userId: previousConnection.userId, connectionId: previousConnection.id, subjectHash: createHash("sha256").update(previousConnection.subject).digest("hex"), failedHints, status: "pending", createdAt: new Date().toISOString() });
      }
      if (state.client === "android") {
        const handoff = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
        await harukiStore.saveMobileHandoff(handoff, state.userId, new Date(Date.now() + 2 * 60_000).toISOString());
        return androidRedirect({ handoff });
      }
      return reply.redirect(`${config.publicWebBaseUrl}/me/assets?haruki=connected`);
    } catch (error) {
      await revokeHarukiTokens(issuedTokens);
      if (error instanceof Error && ["HARUKI_SUBJECT_EXISTS", "HARUKI_SUBJECT_MISMATCH"].includes(error.message)) {
        return state.client === "android" ? androidRedirect({ error: "subject_conflict" }) : webError("subject_conflict");
      }
      return state.client === "android" ? androidRedirect({ error: "exchange_failed" }) : webError("exchange_failed");
    }
  });

  app.post("/api/me/haruki/oauth/mobile/complete", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = z.object({ handoff: z.string().min(32).max(200) }).strict().parse(request.body);
    if (!await harukiStore.consumeMobileHandoff(body.handoff, request.user.sub)) {
      return reply.unauthorized("Invalid or expired Haruki mobile handoff");
    }
    return publicHarukiConnection(await harukiStore.getConnection(request.user.sub));
  });

  app.get("/api/me/haruki/connection", { preHandler: (app as any).authenticate }, async (request: any) => {
    return publicHarukiConnection(await harukiStore.getConnection(request.user.sub));
  });

  app.delete("/api/me/account", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const connection = await harukiStore.getConnection(request.user.sub);
    if (connection) {
      await revokeStoredHarukiConnection(connection);
      await harukiStore.deleteConnection(request.user.sub);
    }
    const deleted = await store.deleteUserById(request.user.sub);
    return deleted ? { ok: true } : reply.notFound("Account not found");
  });

  app.post("/api/me/haruki/bindings/import", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = harukiBindingImportSchema.parse(request.body);
    const connection = await harukiStore.getConnection(request.user.sub);
    if (!connection) return reply.unauthorized("Connect Haruki before importing bindings");
    const selected = body.bindingIds.map((id) => connection.availableBindings.find((binding) => binding.id === id));
    if (selected.some((binding) => !binding)) return reply.badRequest("Binding is not present in the verified Haruki binding list");
    try {
      return { bindings: await harukiStore.importBindings(request.user.sub, connection.id, selected as any[]) };
    } catch (error) {
      if ((error as Error).message === "PLAYER_BINDING_EXISTS") {
        return reply.conflict("This region and UID already belongs to another pjsktools account");
      }
      throw error;
    }
  });

  app.delete("/api/me/haruki/connection", { preHandler: (app as any).authenticate }, async (request: any) => {
    const connection = await harukiStore.getConnection(request.user.sub);
    if (!connection) return { ok: true, revokeStatus: "not-connected" };
    const failedHints = await revokeStoredHarukiConnection(connection);
    await harukiStore.deleteConnection(request.user.sub);
    return { ok: true, revokeStatus: failedHints.length ? "partial-failure" : "complete" };
  });

  app.get("/api/me/player-bindings", { preHandler: (app as any).authenticate }, async (request: any) => {
    return paginatedList(request, (await store.listPlayerBindings(request.user.sub)).map(withEntityVersion));
  });

  app.patch("/api/me/player-bindings/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listPlayerBindings(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Player binding not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const body = playerBindingPatchSchema.parse(request.body);
    const updated = await store.updatePlayerBinding(request.user.sub, request.params.id, body);
    return updated ? setEntityTag(reply, updated) : reply.notFound("Player binding not found");
  });

  app.delete("/api/me/player-bindings/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listPlayerBindings(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Player binding not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const deleted = await store.deletePlayerBinding(request.user.sub, request.params.id);
    return deleted ? { ok: true } : reply.notFound("Player binding not found");
  });

  app.post("/api/me/player-bindings/:id/sync/review", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    if (!await enforceHarukiRateLimit(request, reply, "sync", 6)) return reply;
    const binding = await requireBinding(request.user.sub, request.params.id);
    if (!binding) return reply.notFound("Player binding not found");
    try {
      const candidate = await fetchBindingCandidate(request.user.sub, binding);
      if (!candidate) return { reviewToken: null, expiresIn: 0, noChange: true, review: null };
      const [currentCards, currentData] = await Promise.all([
        store.listInventory(request.user.sub, binding.id),
        store.listPlayerData(request.user.sub, binding.id)
      ]);
      const token = `${randomUUID()}${randomUUID()}`;
      await harukiStore.saveReview(token, {
        userId: request.user.sub,
        bindingId: binding.id,
        candidateHash: hashHarukiCandidate(candidate),
        upstreamVersion: candidate.upstreamVersion,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
      });
      return { reviewToken: token, expiresIn: 600, review: harukiReview(candidate, currentCards, currentData) };
    } catch (error) {
      if ((error as Error).message === "PLAYER_BINDING_NOT_VERIFIED") return reply.forbidden("Only Haruki OAuth bindings can sync");
      await markHarukiConnectionForReauthorization(request.user.sub, error);
      await harukiStore.updateSyncFailure(request.user.sub, binding.id,
        harukiSyncFailureStatus(error));
      return harukiFailure(reply, error);
    }
  });

  app.post("/api/me/player-bindings/:id/sync/confirm", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    if (!await enforceHarukiRateLimit(request, reply, "sync", 6)) return reply;
    const binding = await requireBinding(request.user.sub, request.params.id);
    if (!binding) return reply.notFound("Player binding not found");
    const body = harukiSyncConfirmSchema.parse(request.body);
    const review = await harukiStore.consumeReview(body.reviewToken, request.user.sub, binding.id);
    if (!review) return reply.unauthorized("Invalid, expired, or already used sync review token");
    try {
      const candidate = await fetchBindingCandidate(request.user.sub, binding);
      if (!candidate) return { ok: true, noChange: true, upstreamVersion: binding.upstreamUploadedAt, updatedGroups: [], cardsUpdated: false };
      if (hashHarukiCandidate(candidate) !== review.candidateHash || candidate.upstreamVersion !== review.upstreamVersion) {
        return reply.code(409).send({ statusCode: 409, code: "HARUKI_SYNC_CHANGED", message: "Haruki data changed; review it again" });
      }
      const presentKinds = new Set(candidate.playerData.map((group) => group.kind));
      const invalidKinds = Object.keys(body.groups).filter((kind) => !isPlayerDataKind(kind) || !presentKinds.has(kind as PlayerDataKind));
      if (invalidKinds.length) return reply.badRequest(`Sync selection contains unavailable groups: ${invalidKinds.join(", ")}`);
      const updateGroups = Object.entries(body.groups).flatMap(([kind, action]) => action === "update" ? [kind as PlayerDataKind] : []);
      const pendingEmptyGroups = nextPendingEmptyGroups(binding.pendingEmptyGroups ?? [], candidate, body.groups as Partial<Record<PlayerDataKind, "update" | "keep">>);
      await harukiStore.applySync({
        userId: request.user.sub,
        binding,
        candidate,
        updateCards: body.cards === "update" && candidate.cardsPresent,
        updateGroups,
        pendingEmptyGroups
      });
      return { ok: true, upstreamVersion: candidate.upstreamVersion, updatedGroups: updateGroups, cardsUpdated: body.cards === "update" };
    } catch (error) {
      await markHarukiConnectionForReauthorization(request.user.sub, error);
      await harukiStore.updateSyncFailure(request.user.sub, binding.id,
        harukiSyncFailureStatus(error));
      return harukiFailure(reply, error);
    }
  });

  app.post("/api/me/player-bindings/:id/sync", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    if (!await enforceHarukiRateLimit(request, reply, "sync", 6)) return reply;
    const binding = await requireBinding(request.user.sub, request.params.id);
    if (!binding) return reply.notFound("Player binding not found");
    try {
      const candidate = await fetchBindingCandidate(request.user.sub, binding);
      if (!candidate) return { ok: true, noChange: true, upstreamVersion: binding.upstreamUploadedAt, updatedGroups: [], cardsUpdated: false };
      const nonEmptyGroups = candidate.playerData.filter((group) => !harukiGroupIsEmpty(group.data)).map((group) => group.kind);
      const pendingEmptyGroups = nextPendingEmptyGroups(
        binding.pendingEmptyGroups ?? [],
        candidate,
        Object.fromEntries(candidate.playerData.map((group) => [group.kind, harukiGroupIsEmpty(group.data) ? "keep" : "update"]))
      );
      await harukiStore.applySync({
        userId: request.user.sub,
        binding,
        candidate,
        updateCards: candidate.cardsPresent,
        updateGroups: nonEmptyGroups,
        pendingEmptyGroups
      });
      return {
        ok: true,
        upstreamVersion: candidate.upstreamVersion,
        updatedGroups: nonEmptyGroups,
        pendingEmptyGroups,
        cardsUpdated: candidate.cardsPresent
      };
    } catch (error) {
      if ((error as Error).message === "PLAYER_BINDING_NOT_VERIFIED") return reply.forbidden("Only Haruki OAuth bindings can sync");
      await markHarukiConnectionForReauthorization(request.user.sub, error);
      await harukiStore.updateSyncFailure(request.user.sub, binding.id,
        harukiSyncFailureStatus(error));
      return harukiFailure(reply, error);
    }
  });

  app.patch("/api/me/player-bindings/:id/sync-settings", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = harukiSyncSettingsSchema.parse(request.body);
    const current = await requireBinding(request.user.sub, request.params.id);
    if (!current) return reply.notFound("Verified player binding not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const updated = await harukiStore.updateSyncSettings(request.user.sub, request.params.id, body.autoSyncDaily);
    return updated ? setEntityTag(reply, updated) : reply.notFound("Verified player binding not found");
  });

  app.get("/api/me/player-bindings/:bindingId/summary", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const summary = await buildBindingSummary(request.user.sub, request.params.bindingId);
    return summary ?? reply.notFound("Player binding not found");
  });

  app.get("/api/me/player-bindings/:bindingId/tool-context", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const context = await buildToolContext(request.user.sub, request.params.bindingId);
    return context ?? reply.notFound("Player binding not found");
  });

  app.get("/api/me/player-bindings/:bindingId/profile-analysis", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const analysis = await buildProfileAnalysis(request.user.sub, request.params.bindingId);
    return analysis ?? reply.notFound("Player binding not found");
  });

  app.get("/api/me/player-data/:bindingId/cards", { preHandler: (app as any).authenticate }, async (request: any) => {
    return paginatedList(request, (await store.listInventory(request.user.sub, request.params.bindingId)).map(withEntityVersion), 48);
  });

  app.get("/api/me/player-data/:bindingId/completeness/full", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = await requireBinding(request.user.sub, request.params.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const [inventory, playerData] = await Promise.all([
      store.listInventory(request.user.sub, binding.id),
      store.listPlayerData(request.user.sub, binding.id)
    ]);
    return buildBindingCompleteness(binding, inventory, playerData);
  });

  app.get("/api/me/player-data/:bindingId/completeness", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = await requireBinding(request.user.sub, request.params.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const [inventory, playerData] = await Promise.all([
      store.listInventory(request.user.sub, binding.id),
      store.listPlayerData(request.user.sub, binding.id)
    ]);
    const full = await buildBindingCompleteness(binding, inventory, playerData);
    return {
      bindingId: binding.id,
      region: binding.region,
      ownedCards: inventory.length,
      uploadedPlayerDataKinds: full.uploadedPlayerDataKinds,
      readyForDeckRecommend: full.sections.deckRecommend.ready,
      missingFields: full.sections.deckRecommend.missingFields,
      optionalMissingFields: [
        ...full.sections.challengeLive.missingFields,
        ...full.sections.worldBloom.missingFields,
        ...full.sections.mysekai.missingFields
      ],
      sections: full.sections,
      realDataRequired: true
    };
  });

  app.get("/api/me/player-data/:bindingId/:kind", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const { bindingId, kind } = request.params as { bindingId: string; kind: string };
    if (!isPlayerDataKind(kind)) return reply.notFound("Player data kind not found");
    const binding = await requireBinding(request.user.sub, bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const record = await store.getPlayerData(request.user.sub, binding.id, kind as PlayerDataKind);
    return record ? setEntityTag(reply, record) : {
      userId: request.user.sub,
      bindingId: binding.id,
      region: binding.region,
      kind,
      data: null,
      unavailableReason: "No uploaded player data for this kind",
      realDataRequired: true
    };
  });

  app.get("/api/me/deck-configs", { preHandler: (app as any).authenticate }, async (request: any) => {
    return paginatedList(request, (await store.listDeckConfigs(request.user.sub)).map(withEntityVersion));
  });

  app.post("/api/me/deck-configs", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = deckConfigSchema.parse(request.body);
    return setEntityTag(reply, await store.upsertDeckConfig({ ...body, region: body.region as RegionId, userId: request.user.sub }));
  });

  app.patch("/api/me/deck-configs/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listDeckConfigs(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Deck config not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const body = deckConfigSchema.parse({ ...request.body, id: request.params.id });
    return setEntityTag(reply, await store.upsertDeckConfig({ ...body, region: body.region as RegionId, userId: request.user.sub }));
  });

  app.delete("/api/me/deck-configs/:id", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const current = (await store.listDeckConfigs(request.user.sub)).find((item) => item.id === request.params.id);
    if (!current) return reply.notFound("Deck config not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const deleted = await store.deleteDeckConfig(request.user.sub, request.params.id);
    return deleted ? { ok: true } : reply.notFound("Deck config not found");
  });

  app.post("/api/me/tools/deck-recommend", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = deckRecommendSchema.extend({ bindingId: z.string().optional() }).parse(request.body);
    if (body.bindingId) {
      const binding = await requireBinding(request.user.sub, body.bindingId);
      if (!binding) return reply.notFound("Player binding not found");
      if (binding.region !== body.region) return reply.badRequest("Player data region must match the binding region");
    }
    const inventory = body.bindingId ? await store.listInventory(request.user.sub, body.bindingId) : undefined;
    if (body.bindingId && !inventory?.length) return reply.badRequest("No uploaded card inventory for this player binding");
    const playerAssets = body.bindingId ? await getPlayerAssetMap(request.user.sub, body.bindingId) : undefined;
    return recommendDeck({ ...body, region: body.region as RegionId, inventory: inventory ?? body.inventory, playerAssets });
  });

  app.post("/api/me/tools/score-control", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = scoreControlSchema.parse(request.body);
    if (body.region && !isRegion(body.region)) return reply.badRequest("Unsupported region");
    if (!body.bindingId) return calculateScoreControl(body as any);
    const binding = await requireBinding(request.user.sub, body.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    if (body.region && binding.region !== body.region) return reply.badRequest("Player data region must match the binding region");
    const [inventory, assets] = await Promise.all([
      store.listInventory(request.user.sub, binding.id),
      getPlayerAssetMap(request.user.sub, binding.id)
    ]);
    const region = (body.region ?? binding.region) as RegionId;
    const eventBonusPercent = body.eventBonusPercent ?? body.bonusPercent ?? await deriveEventBonusPercent(region, body.eventId, inventory, assets);
    return calculateScoreControl({ ...body, region, inventory, playerAssets: assets, eventBonusPercent } as any);
  });

  app.post("/api/me/tools/deck-compare", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = deckCompareSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    let inventory = body.inventory;
    let playerAssets = body.playerAssets;
    if (body.bindingId) {
      const binding = await requireBinding(request.user.sub, body.bindingId);
      if (!binding) return reply.notFound("Player binding not found");
      if (binding.region !== body.region) return reply.badRequest("Player data region must match the binding region");
      [inventory, playerAssets] = await Promise.all([
        store.listInventory(request.user.sub, binding.id),
        getPlayerAssetMap(request.user.sub, binding.id)
      ]);
    }
    const configs = await store.listDeckConfigs(request.user.sub);
    const candidates = body.candidates.map(({ deckConfigId, ...candidate }) => {
      if (!deckConfigId) return candidate;
      const config = configs.find((item) => item.id === deckConfigId && item.region === body.region && (!body.bindingId || item.bindingId === body.bindingId));
      if (!config) return { ...candidate, id: candidate.id ?? deckConfigId, name: candidate.name ?? "Unavailable saved deck", cardIds: [] };
      return { ...candidate, id: candidate.id ?? config.id, name: candidate.name ?? config.name, cardIds: config.cardIds };
    });
    return compareDecks({ ...body, region: body.region as RegionId, candidates, inventory, playerAssets });
  });

  app.post("/api/me/tools/event-point-calc", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = eventPointCalcSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    if (body.bindingId) {
      const binding = await requireBinding(request.user.sub, body.bindingId);
      if (!binding) return reply.notFound("Player binding not found");
      if (binding.region !== body.region) return reply.badRequest("Player data region must match the binding region");
      const [inventory, assets] = await Promise.all([
        store.listInventory(request.user.sub, binding.id),
        getPlayerAssetMap(request.user.sub, binding.id)
      ]);
      const eventBonusPercent = body.eventBonusPercent ?? await deriveEventBonusPercent(body.region as RegionId, body.eventId, inventory, assets);
      return estimateEventPoint({ ...body, region: body.region as RegionId, eventBonusPercent, inventory, playerAssets: assets });
    }
    return estimateEventPoint({ ...body, region: body.region as RegionId });
  });

  app.post("/api/me/tools/music-recommend", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = musicRecommendSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    if (body.bindingId) {
      const binding = await requireBinding(request.user.sub, body.bindingId);
      if (!binding) return reply.notFound("Player binding not found");
      if (binding.region !== body.region) return reply.badRequest("Player data region must match the binding region");
      const [inventory, assets] = await Promise.all([
        store.listInventory(request.user.sub, binding.id),
        getPlayerAssetMap(request.user.sub, binding.id)
      ]);
      const musicResults = Array.isArray(assets["music-results"]) ? assets["music-results"] as any[] : [];
      const preferredDifficulties = body.preferredDifficulties ?? [...new Set(musicResults.map((item) => String(item.difficulty ?? item.musicDifficulty ?? "")).filter(Boolean))];
      const eventBonusPercent = body.eventBonusPercent ?? await deriveEventBonusPercent(body.region as RegionId, body.eventId, inventory, assets);
      return recommendMusic({ ...body, region: body.region as RegionId, preferredDifficulties, eventBonusPercent, inventory, playerAssets: assets });
    }
    return recommendMusic({ ...body, region: body.region as RegionId });
  });

  app.post("/api/me/tools/area-item-recommend", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = areaItemRecommendSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    if (body.bindingId) {
      const binding = await requireBinding(request.user.sub, body.bindingId);
      if (!binding) return reply.notFound("Player binding not found");
      if (binding.region !== body.region) return reply.badRequest("Player data region must match the binding region");
      const assets = await getPlayerAssetMap(request.user.sub, binding.id);
      const inventory = await store.listInventory(request.user.sub, binding.id);
      const targetCards = body.targetCards ?? inventory.slice(0, 5).map((card) => ({ cardId: card.cardId }));
      return recommendAreaItems({
        ...body,
        region: body.region as RegionId,
        currentItems: body.currentItems ?? (Array.isArray(assets["area-items"]) ? assets["area-items"] as any[] : undefined),
        materials: assets.materials,
        targetCards,
        cardIds: body.cardIds ?? targetCards.map((card) => card.cardId).filter((id): id is string => Boolean(id)),
        inventory,
        playerAssets: assets
      });
    }
    return recommendAreaItems({ ...body, region: body.region as RegionId });
  });

  app.post("/api/me/tools/normal-event-plan", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = normalEventPlanSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    if (body.bindingId) {
      const binding = await requireBinding(request.user.sub, body.bindingId);
      if (!binding) return reply.notFound("Player binding not found");
      if (binding.region !== body.region) return reply.badRequest("Player data region must match the binding region");
      const [inventory, assets] = await Promise.all([
        store.listInventory(request.user.sub, binding.id),
        getPlayerAssetMap(request.user.sub, binding.id)
      ]);
      const eventBonusPercent = body.eventBonusPercent ?? await deriveEventBonusPercent(body.region as RegionId, body.eventId, inventory, assets);
      return calculateNormalEventPlan({ ...body, region: body.region as RegionId, inventory, playerAssets: assets, eventBonusPercent });
    }
    return calculateNormalEventPlan({ ...body, region: body.region as RegionId });
  });

  app.post("/api/me/tools/mysekai-calc", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = mysekaiCalcSchema.parse(request.body);
    if (!isRegion(body.region)) return reply.badRequest("Unsupported region");
    let cards = body.cards;
    let playerAssets = body.playerAssets;
    if (body.bindingId) {
      const binding = await requireBinding(request.user.sub, body.bindingId);
      if (!binding) return reply.notFound("Player binding not found");
      if (binding.region !== body.region) return reply.badRequest("Player data region must match the binding region");
      cards = await store.listInventory(request.user.sub, binding.id);
      playerAssets = await getPlayerAssetMap(request.user.sub, binding.id);
    }
    return calculateMysekai({ ...body, region: body.region as RegionId, cards, playerAssets });
  });


  app.get("/api/share/cards/:type/:id.png", async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const query = request.query as { region?: string };
    if (query.region && !isRegion(query.region)) return reply.badRequest("Unsupported region");
    if (!["profile", "score", "event", "card", "song"].includes(type)) return reply.badRequest("Unsupported share card type");
    const region = query.region && isRegion(query.region) ? query.region : "jp";
    const data = await resolveShareCardData(type, id, region, options.shareCardProfileResolver);
    if (!data) return reply.notFound("Share card source not found");
    const image = await renderShareCardPng(data);
    const etag = `"${createHash("sha256").update(image).digest("base64url")}"`;
    if (request.headers["if-none-match"] === etag) return reply.code(304).send();
    reply.header("content-type", "image/png");
    reply.header("content-length", image.length);
    reply.header("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
    reply.header("etag", etag);
    reply.header("content-disposition", `inline; filename="pjsktools-${type}-${id}.png"`);
    return reply.send(image);
  });

  app.get("/api/share/cards/:type/:id", async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const query = request.query as { region?: string };
    if (query.region && !isRegion(query.region)) return reply.badRequest("Unsupported region");
    if (!["profile", "score", "event", "card", "song"].includes(type)) return reply.badRequest("Unsupported share card type");
    const region = query.region && isRegion(query.region) ? query.region : "jp";
    const data = await resolveShareCardData(type, id, region, options.shareCardProfileResolver);
    if (!data) return reply.notFound("Share card source not found");
    reply.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return shareCardMetadata(data, `/api/share/cards/${encodeURIComponent(type)}/${encodeURIComponent(id)}.png?region=${region}`);
  });

  app.get("/openapi.json", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return buildOpenApiDocument();
  });

  app.get("/api/docs", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>pjsktools API</title><style>body{max-width:760px;margin:48px auto;padding:0 20px;font:16px/1.7 system-ui;color:#1d2a30}a{color:#168b88}.box{padding:20px;border:1px solid #cddde2;border-radius:8px;background:#f7fbfc}</style></head><body><h1>pjsktools API</h1><div class="box"><p>OpenAPI 3.1 规范已随服务发布，可用于生成 Android 与第三方客户端。</p><p><a href="/openapi.json">查看 OpenAPI JSON</a></p><p>账号写接口支持 <code>Idempotency-Key</code>，更新与删除支持 <code>If-Match</code>。</p></div></body></html>`;
  });

  return app;
}
