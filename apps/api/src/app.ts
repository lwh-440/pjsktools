import cors from "@fastify/cors";
import compress from "@fastify/compress";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { encryptSecret } from "./authCrypto.js";
import { getCardImportManifest } from "./cardImportManifest.js";
import { getAssetConfig, getCardAssetDetail, getChartAssetDetail, getEventAssetDetail, getMusicAssetDetail } from "./assets.js";
import { config, isRegion, regions, type RegionId } from "./config.js";
import { estimateEventPoint, getCalculationContext, getCalculationSchema, getDeckRecommendSchema, getEventBonusConfig } from "./calcData.js";
import { sendVerificationEmail, smtpConfigured } from "./emailService.js";
import { getExternalContext, getLive2dModel3Proxy, getLive2dModelDetail, getLive2dModels, getMysekaiFullContext, getStoriesContext, getStoryCatalog, getStoryFullContext, getStoryPlaybackContext, getVirtualLivePlaybackContext, getVirtualLiveStepContext, informationCollection, isAllowedExternalAssetUrl } from "./externalData.js";
import { harukiClient } from "./harukiClient.js";
import { playerProfileFailure, playerUidPattern } from "./playerProfileHttp.js";
import {
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
import { calculateMysekai } from "./mysekaiCalc.js";
import { store, toPublicUser } from "./store.js";
import type { PlayerDataKind } from "./types.js";
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
  type: z.enum(["player", "event", "song", "card"]),
  region: z.string().refine(isRegion),
  targetId: z.string().min(1),
  label: z.string().min(1)
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
  boost: z.number().nonnegative().optional(),
  availableRuns: z.number().int().nonnegative().optional(),
  bonusPercent: z.number().optional(),
  eventId: z.string().optional(),
  targetRank: z.number().int().positive().optional()
  ,teammates: z.array(z.object({ power: z.number().positive(), effectiveness: z.number().nonnegative(), label: z.string().optional() })).length(4).optional()
  ,skill15Strategy: z.enum(["expected", "best", "worst"]).optional()
  ,skill6Mode: z.enum(["team-average", "highest-power"]).optional()
});

const catalogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(["id-asc", "id-desc", "name-asc", "name-desc"]).optional(),
  partType: z.string().optional(),
  source: z.string().optional(),
  rarity: z.string().optional(),
  gender: z.string().optional(),
  characterId: z.coerce.number().int().positive().optional()
  ,category: z.string().max(100).optional()
  ,tag: z.string().max(100).optional()
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

async function resolveShareCardData(typeValue: string, id: string, region: RegionId): Promise<ShareCardData | null> {
  const type = typeValue as ShareCardData["type"];
  if (!["profile", "score", "event", "card", "song"].includes(type)) return null;
  if (type === "event") {
    const event = await getEventDetail(region, id).catch(() => null) as any;
    return { type, id, region, title: event?.name ?? `活动 ${id}`, subtitle: event?.storyOutline ?? "Project Sekai 活动资料", detail: event?.startAt && event?.endAt ? `${event.startAt} - ${event.endAt}` : `活动 ID ${id}` };
  }
  if (type === "card") {
    const card = await getCardDetail(region, id).catch(() => null) as any;
    return { type, id, region, title: card?.title ?? card?.name ?? `卡牌 ${id}`, subtitle: [card?.character, card?.attribute, card?.rarity ? `星级 ${card.rarity}` : undefined].filter(Boolean).join(" · ") || "Project Sekai 卡牌资料", detail: `卡牌 ID ${id}` };
  }
  if (type === "song") {
    const song = await getSongDetail(region, id).catch(() => null) as any;
    return { type, id, region, title: song?.title ?? song?.name ?? `歌曲 ${id}`, subtitle: song?.unit ?? "Project Sekai 歌曲资料", detail: song?.durationSeconds ? `${song.durationSeconds} 秒 · 歌曲 ID ${id}` : `歌曲 ID ${id}` };
  }
  if (type === "profile") {
    const profile = await getPlayerProfileCached(region, id).catch(() => null) as any;
    return { type, id, region, title: profile?.nickname ?? profile?.name ?? `玩家 ${id}`, subtitle: profile?.rank ? `玩家等级 ${profile.rank}` : "Project Sekai 玩家档案", detail: `UID ${id}` };
  }
  return { type, id, region, title: `歌曲成绩 ${id}`, subtitle: "Project Sekai 成绩分享", detail: `成绩记录 ${id}` };
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
  boost: z.number().nonnegative().optional(),
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
  boost: z.number().nonnegative().optional(),
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
  boost: z.number().nonnegative().optional(),
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
  boost: z.number().min(0).max(10).optional(),
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

function refreshExpiresAt() {
  return new Date(Date.now() + refreshTokenTtlMs).toISOString();
}

function authStateExpiresAt() {
  return new Date(Date.now() + authStateTtlMs).toISOString();
}

function emailCodeExpiresAt() {
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
}

function createSixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function normalizeRedirectTo(value?: string) {
  if (!value) return config.publicWebBaseUrl;
  if (value.startsWith("/")) return `${config.publicWebBaseUrl}${value}`;
  try {
    const target = new URL(value);
    const base = new URL(config.publicWebBaseUrl);
    return target.origin === base.origin ? target.toString() : config.publicWebBaseUrl;
  } catch {
    return config.publicWebBaseUrl;
  }
}

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

export async function buildApp() {
  const app = Fastify({
    logger: process.env.PJSKTOOLS_SILENT_APP_LOGS === "true" ? false : true,
    bodyLimit: 8 * 1024 * 1024
  });
  const buildOpenApiDocument = installOpenApi(app);
  const writeControls = createWriteControls(store);
  await app.register(cors, { origin: true });
  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(sensible);
  await app.register(jwt, { secret: config.jwtSecret });

  app.decorate("authenticate", async (request: any, reply: any) => {
    await request.jwtVerify();
    return writeControls.before(request, reply, request.user.sub);
  });
  app.addHook("onSend", (request, reply, payload) => writeControls.after(request, reply, payload));

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
    const currentEvent = await getCurrentEvent(region);
    if (currentEvent?.id && currentEvent.id !== "none") return getLiveRankingCached(region, currentEvent.id, currentEvent);
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
    return paginatedList(request, await getRankingTop100Cached(region, eventId), 100);
  });

  app.get("/api/events/:region/:eventId/ranking-border", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return paginatedList(request, []);
    return paginatedList(request, await getRankingBorderCached(region, eventId), 100);
  });

  app.get("/api/events/:region/:eventId/ranking-churn", async (request, reply) => {
    const { region, eventId } = request.params as { region: string; eventId: string };
    if (!isRegion(region)) return reply.badRequest("Unsupported region");
    if (eventId === "none") return reply.notFound("No active event");
    const query = request.query as { boardType?: string; gameCharacterId?: string; top?: string };
    const boardType = query.boardType === "worldlink" ? "worldlink" : "overall";
    const gameCharacterId = query.gameCharacterId ? Number(query.gameCharacterId) : undefined;
    const top = query.top ? Math.min(Math.max(Number(query.top), 1), 1000) : undefined;
    if (query.gameCharacterId && !Number.isInteger(gameCharacterId)) return reply.badRequest("Unsupported gameCharacterId");
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
    const boardType = query.boardType === "worldlink" ? "worldlink" : "overall";
    const gameCharacterId = query.gameCharacterId ? Number(query.gameCharacterId) : undefined;
    if (query.gameCharacterId && !Number.isInteger(gameCharacterId)) return reply.badRequest("Unsupported gameCharacterId");
    return getRankingPlayerDetail(region, eventId, numericRank, { boardType, gameCharacterId });
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
    const code = createSixDigitCode();
    await store.createEmailVerificationCode({ email: body.email, purpose: body.purpose, code, expiresAt: emailCodeExpiresAt() });
    try {
      const result = await sendVerificationEmail(body.email, code);
      return { ok: true, sent: result.sent, expiresIn: 300, devCode: result.devCode };
    } catch (error) {
      if ((error as Error).message === "SMTP_NOT_CONFIGURED") return reply.serviceUnavailable("SMTP is not configured");
      throw error;
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
    return {
      ...profile,
      bindings: profile.bindings.map(withEntityVersion),
      favorites: profile.favorites.map(withEntityVersion),
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

  app.get("/api/auth/qq/callback", async (request, reply) => {
    if (!qqConfigured()) return reply.serviceUnavailable("QQ login is not configured");
    const query = qqCallbackSchema.parse(request.query);
    try {
      const { oauth } = await resolveQqLogin(query.code, query.state);
      const existing = await store.findOAuthAccount("qq", oauth.providerUserId);
      const user = existing ? await store.getUser(existing.userId) : await store.createOAuthUser(oauth);
      if (!user) return reply.unauthorized("OAuth user not found");
      if (existing) await store.linkOAuthAccount(user.id, oauth);
      return issueAuth(app, user.id, user.email);
    } catch (error) {
      if ((error as Error).message === "INVALID_AUTH_STATE") return reply.unauthorized("Invalid QQ auth state");
      throw error;
    }
  });

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

  app.get("/api/me/favorites", { preHandler: (app as any).authenticate }, async (request: any) => {
    return paginatedList(request, (await store.listFavorites(request.user.sub)).map(withEntityVersion));
  });

  app.post("/api/me/favorites", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = favoriteSchema.parse(request.body);
    return setEntityTag(reply, await store.addFavorite({ ...body, region: body.region as RegionId, userId: request.user.sub }));
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

  app.get("/api/me/player-bindings", { preHandler: (app as any).authenticate }, async (request: any) => {
    return paginatedList(request, (await store.listPlayerBindings(request.user.sub)).map(withEntityVersion));
  });

  app.post("/api/me/player-bindings", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = playerBindingSchema.parse(request.body);
    try {
      return setEntityTag(reply, await store.addPlayerBinding({ ...body, region: body.region as RegionId, userId: request.user.sub }));
    } catch (error) {
      if ((error as Error).message === "PLAYER_BINDING_EXISTS") return reply.conflict("Player UID already bound to this account");
      throw error;
    }
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

  app.post("/api/me/player-bindings/:id/refresh-public-profile", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = (await store.listPlayerBindings(request.user.sub)).find((item) => item.id === request.params.id);
    if (!binding) return reply.notFound("Player binding not found");
    try {
      const profile = await getPlayerProfileCached(binding.region, binding.playerUid, true);
      return store.updatePlayerBinding(request.user.sub, binding.id, {
        displayName: profile.nickname ?? binding.displayName,
        publicProfileSnapshot: {
          ...profile,
          sourceMetadata: { source: profile.source, refreshedAt: new Date().toISOString() },
          realDataRequired: true
        },
        refreshedAt: new Date().toISOString()
      });
    } catch (error) {
      return playerProfileFailure(reply, error);
    }
  });

  app.get("/api/me/player-data/:bindingId/cards", { preHandler: (app as any).authenticate }, async (request: any) => {
    return paginatedList(request, (await store.listInventory(request.user.sub, request.params.bindingId)).map(withEntityVersion), 48);
  });

  app.put("/api/me/player-data/:bindingId/cards", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = (await store.listPlayerBindings(request.user.sub)).find((item) => item.id === request.params.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const body = inventoryBulkSchema.parse(request.body);
    const current = await store.listInventory(request.user.sub, binding.id);
    if (current.length && !assertIfMatch(request, reply, current)) return reply;
    return setEntityTag(reply, await store.upsertInventory(body.cards.map((card) => ({ ...card, userId: request.user.sub, bindingId: binding.id, region: body.region as RegionId }))));
  });

  app.post("/api/me/player-data/import", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const body = z.object({ bindingId: z.string(), region: z.string().refine(isRegion), cards: z.array(inventoryItemSchema).max(2000) }).parse(request.body);
    const binding = (await store.listPlayerBindings(request.user.sub)).find((item) => item.id === body.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const items = await store.upsertInventory(body.cards.map((card) => ({ ...card, userId: request.user.sub, bindingId: binding.id, region: body.region as RegionId })));
    return { imported: items.length, items };
  });

  app.get("/api/me/player-data/:bindingId/export", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = (await store.listPlayerBindings(request.user.sub)).find((item) => item.id === request.params.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const [cards, deckConfigs, scores, playerData] = await Promise.all([
      store.listInventory(request.user.sub, binding.id),
      store.listDeckConfigs(request.user.sub),
      store.listScores(request.user.sub),
      store.listPlayerData(request.user.sub, binding.id)
    ]);
    const completeness = await buildBindingCompleteness(binding, cards, playerData);
    const toolContext = await buildToolContext(request.user.sub, binding.id);
    return {
      schemaVersion: 2,
      exportSource: "pjsktools-api",
      exportedAt: new Date().toISOString(),
      binding,
      publicProfileSnapshot: binding.publicProfileSnapshot ?? null,
      cards,
      playerData,
      deckConfigs: deckConfigs.filter((item) => item.bindingId === binding.id),
      scores: scores.filter((item) => item.region === binding.region),
      formulaReadiness: toolContext?.formulaReadiness ?? completeness.sections,
      toolContextWarnings: toolContext?.toolContextWarnings ?? [],
      realDataRequired: true
    };
  });

  app.delete("/api/me/player-data/:bindingId/cards/:cardId", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = (await store.listPlayerBindings(request.user.sub)).find((item) => item.id === request.params.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const current = (await store.listInventory(request.user.sub, binding.id)).find((item) => item.cardId === String(request.params.cardId));
    if (!current) return reply.notFound("Inventory card not found");
    if (!assertIfMatch(request, reply, current)) return reply;
    const deleted = await store.deleteInventoryCard(request.user.sub, binding.id, String(request.params.cardId));
    return deleted ? { deleted: true, cardId: String(request.params.cardId) } : reply.notFound("Inventory card not found");
  });

  app.post("/api/me/player-data/:bindingId/import", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = (await store.listPlayerBindings(request.user.sub)).find((item) => item.id === request.params.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const rawBody = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const candidateBody = Array.isArray(rawBody.playerData) || Array.isArray(rawBody.cards)
      ? rawBody
      : normalizeSuitePlayerDataImport(binding.region, rawBody);
    const body = z.object({
      cards: z.array(inventoryItemSchema).max(2000).default([]),
      playerData: z.array(z.object({ kind: z.string(), data: z.unknown() })).default([])
    }).parse(candidateBody);
    const items = await store.upsertInventory(body.cards.map((card) => ({ ...card, userId: request.user.sub, bindingId: binding.id, region: binding.region })));
    const dataRecords = [];
    for (const record of body.playerData) {
      if (!isPlayerDataKind(record.kind)) return reply.badRequest(`Unsupported player data kind: ${record.kind}`);
      dataRecords.push(await store.upsertPlayerData({
        userId: request.user.sub,
        bindingId: binding.id,
        region: binding.region,
        kind: record.kind as PlayerDataKind,
        data: record.data
      }));
    }
    const completeness = await buildBindingCompleteness(binding, items, dataRecords as any);
    const toolContext = await buildToolContext(request.user.sub, binding.id);
    return {
      imported: items.length,
      importedPlayerData: dataRecords.length,
      items,
      playerData: dataRecords,
      formulaReadiness: toolContext?.formulaReadiness ?? completeness.sections,
      toolContextWarnings: toolContext?.toolContextWarnings ?? [],
      realDataRequired: true
    };
  });

  app.post("/api/me/player-data/:bindingId/import/review", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = await requireBinding(request.user.sub, request.params.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const inventory = await store.listInventory(request.user.sub, binding.id);
    return reviewPlayerDataImport(binding.region, request.body, inventory);
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

  app.post("/api/me/player-data/:bindingId/validate", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const binding = await requireBinding(request.user.sub, request.params.bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const body = z.object({
      kind: z.string(),
      region: z.string().refine(isRegion).optional(),
      data: z.unknown()
    }).parse(request.body);
    if (!isPlayerDataKind(body.kind)) return reply.notFound("Player data kind not found");
    if (body.region && body.region !== binding.region) return reply.badRequest("Player data region must match the binding region");
    return validatePlayerDataRecord(binding.region, body.kind, body.data);
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

  app.put("/api/me/player-data/:bindingId/:kind", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
    const { bindingId, kind } = request.params as { bindingId: string; kind: string };
    if (!isPlayerDataKind(kind)) return reply.notFound("Player data kind not found");
    const binding = await requireBinding(request.user.sub, bindingId);
    if (!binding) return reply.notFound("Player binding not found");
    const body = playerDataSchema.parse(request.body);
    if (body.region && body.region !== binding.region) return reply.badRequest("Player data region must match the binding region");
    const current = await store.getPlayerData(request.user.sub, binding.id, kind as PlayerDataKind);
    if (current && !assertIfMatch(request, reply, current)) return reply;
    return setEntityTag(reply, await store.upsertPlayerData({
      userId: request.user.sub,
      bindingId: binding.id,
      region: binding.region,
      kind: kind as PlayerDataKind,
      data: body.data
    }));
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
    const region = query.region && isRegion(query.region) ? query.region : "jp";
    const data = await resolveShareCardData(type, id, region);
    if (!data) return reply.badRequest("Unsupported share card type");
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
    const region = query.region && isRegion(query.region) ? query.region : "jp";
    const data = await resolveShareCardData(type, id, region);
    if (!data) return reply.badRequest("Unsupported share card type");
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
