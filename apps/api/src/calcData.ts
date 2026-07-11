import type { RegionId } from "./config.js";
import { buildCardDetailLike, buildDeckDetailLike, type CardDetailLike, type DeckDetailLike } from "./formulaDetail.js";
import { getCards, getEventDetail, getMasterCollection, getSongDetail } from "./masterData.js";
import { calculateExactCardPower, calculateExactCardSkill } from "./referenceCalculator.js";
import { getReferenceMaster, getReferenceMasterHealth } from "./referenceMaster.js";
import { calculateLiveDetail } from "./liveCalculator.js";
import { getMusicMeta } from "./musicMeta.js";
import type { MusicMeta } from "./types.js";
import type { MultiLivePlayer, Skill15Strategy, Skill6Mode } from "./multiLiveCalculator.js";
import type { Card, MasterCollectionItem, UserCardInventoryItem } from "./types.js";
import {
  buildCardContributionBreakdown,
  buildCardPowerBreakdown as sharedBuildCardPowerBreakdown,
  buildNormalEventFormulaContext,
  cardCharacterId as sharedCardCharacterId,
  estimateNormalEventPoint,
  sharedFormulaVersion,
  type CardContributionBreakdown,
  type CardPowerBreakdown as SharedCardPowerBreakdown,
  type LiveType as SharedLiveType,
  type UserCardState as SharedUserCardState
} from "./normalEventFormula.js";

export type LiveType = SharedLiveType;
export type DeckTarget = "event" | "power" | "skill";

export type UserCardState = SharedUserCardState;

export type EventBonusConfig = {
  region: RegionId;
  eventId: string;
  eventType?: string;
  eventCards: MasterCollectionItem[];
  eventDeckBonuses: MasterCollectionItem[];
  eventRarityBonusRates: MasterCollectionItem[];
  gameCharacterUnits: MasterCollectionItem[];
  gameCharacters: MasterCollectionItem[];
  eventHonorBonuses: MasterCollectionItem[];
  eventCardBonusLimits: MasterCollectionItem[];
  worldBlooms: MasterCollectionItem[];
  worldBloomDifferentAttributeBonuses: MasterCollectionItem[];
  worldBloomType?: string;
  worldBloomEventTurn?: 1 | 2 | 3;
  worldBloomSupportUnit?: string;
  cardBonusCountLimit: number;
  eventConfigTrace: Record<string, unknown>;
  missingFields: string[];
  source: Record<string, string>;
};

export type CardContribution = {
  card: Card;
  owned?: UserCardState;
  estimatedPower: number;
  powerBreakdown: CardPowerBreakdown;
  skillScore: number;
  eventBonus: number;
  directEventBonus: number;
  deckBonus: number;
  masterRankBonus: number;
  contributionScore: number;
  cardContributionBreakdown: CardContributionBreakdown;
  cardDetailLike?: CardDetailLike;
  reasons: string[];
};

export type RecommendOptions = {
  region: RegionId;
  eventId?: string;
  specialCharacterId?: string;
  gameCharacterId?: string;
  worldBloomSupportUnit?: string;
  worldBloomEventTurn?: number;
  musicId?: string;
  difficulty?: string;
  liveType?: LiveType;
  calculationMode?: "normal" | "challenge" | "world_bloom" | "wl" | "wl3";
  target?: DeckTarget;
  inventory: UserCardState[];
  playerAssets?: Record<string, unknown>;
  fixedCardIds?: string[];
  fixedCharacterIds?: string[];
  leaderCardId?: string;
  limit?: number;
  timeoutMs?: number;
  eventConfig?: EventBonusConfig;
  musicMeta?: MusicMeta;
};

export type CardPowerBreakdown = SharedCardPowerBreakdown;

function rawRecord(item?: MasterCollectionItem): Record<string, unknown> {
  return item && typeof item.raw === "object" && item.raw !== null ? (item.raw as Record<string, unknown>) : {};
}

function rawNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rawString(value: unknown) {
  return value == null ? undefined : String(value);
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function rarityKey(card: Card) {
  if (card.rarity >= 4) return "rarity_4";
  if (card.rarity === 3) return "rarity_3";
  if (card.rarity === 2) return "rarity_2";
  if (card.rarity === 1) return "rarity_1";
  return "rarity_unknown";
}

function cardCharacterId(card: Card) {
  return sharedCardCharacterId(card);
}

function cardAttribute(card: Card) {
  return card.attribute ?? "unknown";
}

function firstFinite(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function supportDeckCountForMode(mode?: RecommendOptions["calculationMode"], asset?: Record<string, unknown>) {
  const turn = Number(asset?.worldBloomEventTurn ?? asset?.turn ?? asset?.worldBloomTurn);
  if (Number.isFinite(turn) && turn === 1) return 12;
  if (Number.isFinite(turn) && turn === 2) return 20;
  if (Number.isFinite(turn) && turn === 3) return 25;
  if (mode === "world_bloom") return 20;
  if (mode === "wl") return 12;
  if (mode === "wl3") return 25;
  return 20;
}

function supportBonusCollectionName(asset?: Record<string, unknown>) {
  const turn = Number(asset?.worldBloomEventTurn ?? asset?.turn ?? asset?.worldBloomTurn);
  if (Number.isFinite(turn) && turn === 1) return "worldBloomSupportDeckBonusesWL1";
  if (Number.isFinite(turn) && turn === 2) return "worldBloomSupportDeckBonusesWL2";
  if (Number.isFinite(turn) && turn === 3) return "worldBloomSupportDeckBonusesWL3";
  return "worldBloomSupportDeckBonuses";
}

function cardUnits(card: Card) {
  const units = new Set<string>();
  if (card.supportUnit && card.supportUnit !== "none") units.add(card.supportUnit);
  const characterUnit = characterUnitForCard(card);
  if (characterUnit) units.add(characterUnit);
  return [...units].filter(Boolean);
}

const characterUnitById: Record<string, string> = {
  "1": "light_sound", "2": "light_sound", "3": "light_sound", "4": "light_sound",
  "5": "idol", "6": "idol", "7": "idol", "8": "idol",
  "9": "street", "10": "street", "11": "street", "12": "street",
  "13": "theme_park", "14": "theme_park", "15": "theme_park", "16": "theme_park",
  "17": "school_refusal", "18": "school_refusal", "19": "school_refusal", "20": "school_refusal",
  "21": "piapro", "22": "piapro", "23": "piapro", "24": "piapro", "25": "piapro", "26": "piapro"
};

const characterUnitByName: Record<string, string> = {
  "星乃一歌": "light_sound", "天马咲希": "light_sound", "望月穗波": "light_sound", "日野森志步": "light_sound",
  "天馬咲希": "light_sound", "望月穂波": "light_sound", "日野森志歩": "light_sound",
  "花里实乃理": "idol", "桐谷遥": "idol", "桃井爱莉": "idol", "日野森雫": "idol",
  "花里みのり": "idol", "桃井愛莉": "idol",
  "小豆泽心羽": "street", "白石杏": "street", "东云彰人": "street", "青柳冬弥": "street",
  "小豆沢こはね": "street", "東雲彰人": "street",
  "天马司": "theme_park", "凤笑梦": "theme_park", "草薙宁宁": "theme_park", "神代类": "theme_park",
  "天馬司": "theme_park", "鳳えむ": "theme_park", "草薙寧々": "theme_park", "神代類": "theme_park",
  "宵崎奏": "school_refusal", "朝比奈真冬": "school_refusal", "东云绘名": "school_refusal", "晓山瑞希": "school_refusal",
  "朝比奈まふゆ": "school_refusal", "東雲絵名": "school_refusal", "暁山瑞希": "school_refusal",
  "初音未来": "piapro", "镜音铃": "piapro", "镜音连": "piapro", "巡音流歌": "piapro", "MEIKO": "piapro", "KAITO": "piapro",
  "初音ミク": "piapro", "鏡音リン": "piapro", "鏡音レン": "piapro", "巡音ルカ": "piapro"
};

function characterUnitForCard(card: Card) {
  return characterUnitByName[card.character] ?? (card.supportUnit && card.supportUnit !== "none" ? card.supportUnit : undefined);
}

function eventTurnFromId(eventId?: string): 1 | 2 | 3 | undefined {
  const numeric = Number(eventId);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (numeric > 1000) return (((Math.floor(numeric / 100000)) % 10) + 1) as 1 | 2 | 3;
  if (numeric <= 140) return 1;
  if (numeric <= 180) return 2;
  return 3;
}

type WorldBloomSupportContext = {
  supportDeckSource: "uploaded" | "recommended-from-inventory" | "unavailable";
  eventId?: string;
  specialCharacterId?: string;
  supportUnit?: string;
  turn?: number;
  uploadedCardIds: string[];
};

function explicitWorldBloomAsset(asset: unknown): Record<string, unknown> | undefined {
  return asset && typeof asset === "object" && !Array.isArray(asset) ? asset as Record<string, unknown> : undefined;
}

function uploadedWorldBloomCardIds(asset: unknown) {
  if (Array.isArray(asset)) {
    return asset.map((row) => String(typeof row === "string" || typeof row === "number" ? row : (row as Record<string, unknown>)?.cardId ?? (row as Record<string, unknown>)?.id ?? "")).filter(Boolean);
  }
  const record = explicitWorldBloomAsset(asset);
  if (!record) return [];
  const cardIds = Array.isArray(record.cardIds) ? record.cardIds : [];
  const members = Array.from({ length: 25 }, (_, index) => record[`member${index + 1}`]);
  return [...cardIds, ...members].map((row) => String(row ?? "")).filter((id) => id && id !== "0");
}

function worldBloomSupportContext(options: RecommendOptions, asset: unknown): WorldBloomSupportContext {
  const record = explicitWorldBloomAsset(asset);
  const uploadedCardIds = uploadedWorldBloomCardIds(asset);
  const specialCharacterId = rawString(record?.specialCharacterId ?? record?.gameCharacterId ?? record?.characterId ?? options.specialCharacterId ?? options.gameCharacterId);
  const supportUnit = rawString(record?.worldBloomSupportUnit ?? record?.supportUnit ?? record?.unit ?? options.worldBloomSupportUnit)
    ?? (specialCharacterId ? characterUnitById[specialCharacterId] : undefined);
  const turn = rawNumber(record?.worldBloomEventTurn ?? record?.turn ?? record?.worldBloomTurn ?? options.worldBloomEventTurn ?? eventTurnFromId(options.eventId), NaN);
  const eventId = rawString(record?.eventId ?? options.eventId);
  return {
    supportDeckSource: uploadedCardIds.length ? "uploaded" : (eventId && specialCharacterId && supportUnit ? "recommended-from-inventory" : "unavailable"),
    eventId,
    specialCharacterId,
    supportUnit,
    turn: Number.isFinite(turn) ? turn : undefined,
    uploadedCardIds
  };
}

function differentAttributeBonus(cards: CardContribution[], rows: MasterCollectionItem[]) {
  const attributeCount = new Set(cards.map((item) => cardAttribute(item.card)).filter(Boolean)).size;
  const matched = rows.find((item) => rawNumber(rawRecord(item).attributeCount, -1) === attributeCount);
  const bonusRate = firstFinite(rawRecord(matched), ["bonusRate", "rate", "value"]) ?? 0;
  return {
    attributeCount,
    bonusRate,
    matchedRow: matched?.raw,
    missingFields: rows.length ? [] : ["worldBloomDifferentAttributeBonuses"]
  };
}

function supportCardBonus(card: CardContribution, mode: RecommendOptions["calculationMode"], context: WorldBloomSupportContext, masterContext: {
  eventHonorBonuses: MasterCollectionItem[];
  worldBloomDifferentAttributeBonuses: MasterCollectionItem[];
  worldBloomSupportDeckBonuses: MasterCollectionItem[];
  worldBloomSupportDeckBonusSource: string;
  worldBloomSupportDeckUnitEventLimitedBonuses: MasterCollectionItem[];
}) {
  const owned = card.owned;
  const characterId = cardCharacterId(card.card);
  const specialCharacterId = context.specialCharacterId;
  const supportUnit = context.supportUnit;
  const rarity = rarityKey(card.card);
  const bonusRow = masterContext.worldBloomSupportDeckBonuses.find((item) => {
    const raw = rawRecord(item);
    return String(raw.cardRarityType ?? raw.rarity ?? "") === rarity || String(raw.cardRarityType ?? "").includes(String(card.card.rarity));
  });
  const bonusRaw = rawRecord(bonusRow);
  const characterBonusRows = asArray(bonusRaw.worldBloomSupportDeckCharacterBonuses);
  const masterRankBonusRows = asArray(bonusRaw.worldBloomSupportDeckMasterRankBonuses);
  const skillLevelBonusRows = asArray(bonusRaw.worldBloomSupportDeckSkillLevelBonuses);
  const characterType = specialCharacterId && characterId === specialCharacterId ? "specific" : "others";
  const characterBonusRow = characterBonusRows.find((row) => {
    const raw = row as Record<string, unknown>;
    return String(raw.worldBloomSupportDeckCharacterType ?? raw.type ?? "") === characterType;
  });
  const masterRankBonusRow = masterRankBonusRows.find((row) => {
    const raw = row as Record<string, unknown>;
    return rawNumber(raw.masterRank, -1) === Math.max(0, Math.min(5, owned?.masterRank ?? 0));
  });
  const skillLevelBonusRow = skillLevelBonusRows.find((row) => {
    const raw = row as Record<string, unknown>;
    return rawNumber(raw.skillLevel, -1) === Math.max(1, Math.min(4, owned?.skillLevel ?? 1));
  });
  const characterBonus = firstFinite(characterBonusRow as Record<string, unknown> | undefined ?? {}, ["bonusRate", "rate", "value"]) ?? (specialCharacterId && characterId === specialCharacterId ? 20 : 10);
  const masterRankBonus = firstFinite(masterRankBonusRow as Record<string, unknown> | undefined ?? {}, ["bonusRate", "rate", "value"]) ?? Math.max(0, Math.min(5, owned?.masterRank ?? 0)) * 2;
  const skillLevelBonus = firstFinite(skillLevelBonusRow as Record<string, unknown> | undefined ?? {}, ["bonusRate", "rate", "value"]) ?? Math.max(0, Math.min(4, owned?.skillLevel ?? 1) - 1);
  const uploadedBonus = firstFinite(card.cardContributionBreakdown.modeSpecificBreakdown.worldBloom as Record<string, unknown>, ["supportDeckBonus"]) ?? 0;
  const units = uniqueStrings([card.cardDetailLike?.units ?? [], cardUnits(card.card)]);
  const unitMatches = Boolean(supportUnit && units.includes(supportUnit));
  const eventId = context.eventId;
  const unitLimitedRow = masterContext.worldBloomSupportDeckUnitEventLimitedBonuses.find((item) => {
    const raw = rawRecord(item);
    return String(raw.eventId ?? "") === String(eventId ?? "") &&
      String(raw.gameCharacterId ?? raw.characterId ?? "") === String(specialCharacterId ?? "") &&
      String(raw.cardId ?? "") === card.card.id;
  });
  const unitEventLimitedBonus = firstFinite(rawRecord(unitLimitedRow), ["bonusRate", "rate", "value"]) ?? (mode === "wl3" && specialCharacterId && unitMatches ? 0 : 0);
  return {
    cardId: card.card.id,
    characterId,
    supportUnit: card.card.supportUnit,
    units,
    requiredSupportUnit: supportUnit,
    unitMatches,
    rarity,
    bonusSource: bonusRow ? masterContext.worldBloomSupportDeckBonusSource : "fallback",
    matchedBonusRow: bonusRow?.raw,
    characterType,
    characterBonus,
    masterRankBonus,
    skillLevelBonus,
    unitEventLimitedBonus,
    uploadedBonus,
    supportDeckBonus: unitMatches ? characterBonus + masterRankBonus + skillLevelBonus + unitEventLimitedBonus + uploadedBonus : undefined,
    officialFieldsUsed: [
      bonusRow ? masterContext.worldBloomSupportDeckBonusSource : undefined,
      unitLimitedRow ? "worldBloomSupportDeckUnitEventLimitedBonuses" : undefined,
      supportUnit ? "uploaded worldBloomSupportUnit" : undefined
    ].filter(Boolean),
    estimatedFieldsUsed: [
      bonusRow ? undefined : "support deck rarity bonus row fallback",
      unitLimitedRow || !eventId ? undefined : "unit-event-limited support bonus fallback",
      card.card.character ? "local Card.units reconstructed from normalized card shape" : "card unit metadata fallback"
    ].filter(Boolean)
  };
}

function supportDeckTrace(cards: CardContribution[], mode: RecommendOptions["calculationMode"], context: WorldBloomSupportContext, masterContext: {
  eventHonorBonuses: MasterCollectionItem[];
  worldBloomDifferentAttributeBonuses: MasterCollectionItem[];
  worldBloomSupportDeckBonuses: MasterCollectionItem[];
  worldBloomSupportDeckBonusSource: string;
  worldBloomSupportDeckUnitEventLimitedBonuses: MasterCollectionItem[];
}) {
  const supportDeckCount = supportDeckCountForMode(mode, context as unknown as Record<string, unknown>);
  const mainDeckIds = new Set(cards.slice(0, 5).map((item) => item.card.id));
  const uploadedOrder = new Map(context.uploadedCardIds.map((id, index) => [id, index]));
  const candidates = context.supportDeckSource === "uploaded"
    ? cards.filter((card) => uploadedOrder.has(card.card.id)).sort((a, b) => (uploadedOrder.get(a.card.id) ?? 0) - (uploadedOrder.get(b.card.id) ?? 0))
    : cards;
  const details = candidates
    .filter((card) => !mainDeckIds.has(card.card.id))
    .map((card) => supportCardBonus(card, mode, context, masterContext))
    .filter((item) => item.supportDeckBonus !== undefined)
    .sort((a, b) => context.supportDeckSource === "uploaded" ? 0 : (b.supportDeckBonus ?? 0) - (a.supportDeckBonus ?? 0))
    .slice(0, supportDeckCount);
  return {
    supportDeckSource: context.supportDeckSource,
    supportDeckCount,
    supportDeckCountTarget: supportDeckCount,
    usedCount: details.length,
    supportDeckBonus: details.reduce((sum, item) => sum + (item.supportDeckBonus ?? 0), 0),
    cards: details,
    recommendedCards: context.supportDeckSource === "recommended-from-inventory" ? details : [],
    excludedMainDeckCardIds: [...mainDeckIds],
    eventId: context.eventId,
    specialCharacterId: context.specialCharacterId,
    worldBloomSupportUnit: context.supportUnit,
    referenceFormulaId: "Moesekai.EventCalculator.getSupportDeckBonus",
    referencePreprocessId: "Moesekai.CardBloomEventCalculator.getCardSupportDeckBonus",
    referenceBehavior: "exclude main deck cards, sort/use prepared CardDetailLike.supportDeckBonus, sum first getWorldBloomSupportDeckCount(turn) cards",
    officialFieldsUsed: uniqueStrings(details.map((item) => item.officialFieldsUsed)),
    estimatedFieldsUsed: uniqueStrings(details.map((item) => item.estimatedFieldsUsed)),
    missingFields: [
      context.eventId ? undefined : "eventId",
      context.specialCharacterId ? undefined : "specialCharacterId/gameCharacterId",
      context.supportUnit ? undefined : "worldBloomSupportUnit",
      masterContext.worldBloomSupportDeckBonuses.length ? undefined : masterContext.worldBloomSupportDeckBonusSource,
      details.length ? undefined : "support deck cards with supportDeckBonus"
    ].filter((item): item is string => Boolean(item))
  };
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function dataNumber(record: unknown, keys: string[], fallback = 0) {
  if (!record || typeof record !== "object") return fallback;
  const source = record as Record<string, unknown>;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function dataString(record: unknown, keys: string[]) {
  if (!record || typeof record !== "object") return undefined;
  const source = record as Record<string, unknown>;
  for (const key of keys) {
    if (source[key] != null && String(source[key]).trim()) return String(source[key]);
  }
  return undefined;
}

function uploadedLevel(items: unknown[], idKeys: string[], id?: string, levelKeys = ["level", "rank", "characterRank"]) {
  if (!id) return 0;
  const normalizedId = String(id).toLowerCase();
  const item = items.find((entry) => {
    const text = JSON.stringify(entry ?? "").toLowerCase();
    return idKeys.some((key) => dataString(entry, [key])?.toLowerCase() === normalizedId) || text.includes(normalizedId);
  });
  return item ? dataNumber(item, levelKeys, 0) : 0;
}

function masterRankBonusFallback(card: Card, masterRank = 0) {
  const rank = Math.max(0, Math.min(5, masterRank));
  if (card.rarity >= 4) return [10, 12.5, 15, 17.5, 20, 25][rank] ?? 10;
  if (card.rarity === 3) return rank;
  if (card.rarity === 2) return rank * 0.2;
  return rank * 0.1;
}

export function buildCardPowerBreakdown(card: Card, owned?: UserCardState, playerAssets: Record<string, unknown> = {}): CardPowerBreakdown {
  return sharedBuildCardPowerBreakdown(card, owned, playerAssets);
}

function skillScore(card: Card, owned?: UserCardState) {
  const skillLevel = owned?.skillLevel ?? 1;
  const scoreEffect = card.skill?.effects?.some((effect) => String(effect.type ?? "").toLowerCase().includes("score"));
  const lifeOrJudgeEffect = card.skill?.effects?.some((effect) => effect.activateLife || effect.judgment);
  if (scoreEffect) return 500 + skillLevel * 80;
  if (lifeOrJudgeEffect) return 180 + skillLevel * 40;
  return skillLevel * 35;
}

function eventCardBonus(card: Card, config?: EventBonusConfig) {
  if (!config) return 0;
  const eventCard = config.eventCards.find((item) => String(rawRecord(item).cardId) === card.id);
  return rawNumber(rawRecord(eventCard).bonusRate, 0);
}

function deckBonus(card: Card, config?: EventBonusConfig) {
  if (!config) return 0;
  const characterId = cardCharacterId(card);
  let best = 0;
  for (const bonus of config.eventDeckBonuses) {
    const raw = rawRecord(bonus);
    const attr = rawString(raw.cardAttr ?? raw.attr);
    const unitId = rawString(raw.gameCharacterUnitId);
    const bonusRate = rawNumber(raw.bonusRate, 0);
    const attrMatches = !attr || attr === card.attribute;
    let characterMatches = !unitId;
    if (unitId) {
      const unit = config.gameCharacterUnits.find((item) => String(rawRecord(item).id) === unitId);
      const unitRaw = rawRecord(unit);
      characterMatches = String(unitRaw.gameCharacterId ?? unitRaw.characterId ?? "") === characterId || String(unitRaw.unit ?? "") === card.supportUnit;
    }
    if (attrMatches && characterMatches) best = Math.max(best, bonusRate);
  }
  return best;
}

function rarityBonus(card: Card, owned?: UserCardState, config?: EventBonusConfig) {
  const masterRank = owned?.masterRank ?? 0;
  if (config) {
    const match = config.eventRarityBonusRates.find((item) => {
      const raw = rawRecord(item);
      return String(raw.cardRarityType ?? raw.rarity) === rarityKey(card) && rawNumber(raw.masterRank, -1) === masterRank;
    });
    const value = rawNumber(rawRecord(match).bonusRate, NaN);
    if (Number.isFinite(value)) return value;
  }
  return masterRankBonusFallback(card, masterRank);
}

function worldBloomTurn(eventId: string): 1 | 2 | 3 {
  const id = Number(eventId);
  if (id > 1000) return ((Math.floor(id / 100000) % 10) + 1) as 1 | 2 | 3;
  if (id <= 140) return 1;
  if (id <= 180) return 2;
  return 3;
}

export async function getEventBonusConfig(region: RegionId, eventId: string, specialCharacterId?: string): Promise<EventBonusConfig> {
  const [event, eventCards, eventDeckBonuses, eventRarityBonusRates, gameCharacterUnits, gameCharacters, eventHonorBonuses, eventCardBonusLimits, worldBlooms, worldBloomDifferentAttributeBonuses] = await Promise.all([
    getEventDetail(region, eventId),
    getMasterCollection(region, "eventCards"),
    getMasterCollection(region, "eventDeckBonuses"),
    getMasterCollection(region, "eventRarityBonusRates"),
    getMasterCollection(region, "gameCharacterUnits"),
    getMasterCollection(region, "gameCharacters"),
    getMasterCollection(region, "eventHonorBonuses"),
    getMasterCollection(region, "eventCardBonusLimits"),
    getMasterCollection(region, "worldBlooms"),
    getMasterCollection(region, "worldBloomDifferentAttributeBonuses")
  ]);
  const eventCardsItems = eventCards.items.filter((item) => String(rawRecord(item).eventId) === eventId);
  const eventDeckBonusItems = eventDeckBonuses.items.filter((item) => String(rawRecord(item).eventId) === eventId);
  const missingFields = [];
  if (!event) missingFields.push("event master detail");
  if (!eventCardsItems.length) missingFields.push("eventCards");
  if (!eventDeckBonusItems.length) missingFields.push("eventDeckBonuses");
  if (!eventRarityBonusRates.items.length) missingFields.push("eventRarityBonusRates");
  if (!gameCharacterUnits.items.length) missingFields.push("gameCharacterUnits");
  const worldBloom = worldBlooms.items.find((item) => String(rawRecord(item).eventId ?? "") === eventId);
  const worldBloomType = rawString(rawRecord(worldBloom).worldBloomChapterType);
  const isWorldBloom = String(event?.eventType ?? "").includes("bloom");
  const isFinale = worldBloomType === "finale";
  const cardBonusLimitRow = eventCardBonusLimits.items.find((item) => String(rawRecord(item).eventId ?? "") === eventId);
  const cardBonusCountLimit = isFinale ? rawNumber(rawRecord(cardBonusLimitRow).memberCountLimit, 5) : 5;
  const characterRow = gameCharacters.items.find((item) => item.id === specialCharacterId || String(rawRecord(item).id ?? "") === specialCharacterId);
  const worldBloomSupportUnit = rawString(rawRecord(characterRow).unit);
  if (isWorldBloom && !worldBlooms.items.length) missingFields.push("worldBlooms");
  if (isFinale && !cardBonusLimitRow) missingFields.push("eventCardBonusLimits");
  if (isWorldBloom && !worldBloomDifferentAttributeBonuses.items.length) missingFields.push("worldBloomDifferentAttributeBonuses");
  if (isWorldBloom && specialCharacterId && !worldBloomSupportUnit) missingFields.push("gameCharacters.unit");
  return {
    region,
    eventId,
    eventType: event?.eventType,
    eventCards: eventCardsItems,
    eventDeckBonuses: eventDeckBonusItems,
    eventRarityBonusRates: eventRarityBonusRates.items,
    gameCharacterUnits: gameCharacterUnits.items,
    gameCharacters: gameCharacters.items,
    eventHonorBonuses: eventHonorBonuses.items,
    eventCardBonusLimits: eventCardBonusLimits.items,
    worldBlooms: worldBlooms.items,
    worldBloomDifferentAttributeBonuses: worldBloomDifferentAttributeBonuses.items,
    worldBloomType,
    worldBloomEventTurn: isWorldBloom ? worldBloomTurn(eventId) : undefined,
    worldBloomSupportUnit,
    cardBonusCountLimit,
    eventConfigTrace: {
      referenceFormulaId: "Moesekai.EventService.getEventConfig",
      eventType: event?.eventType,
      worldBloomType,
      worldBloomEventTurn: isWorldBloom ? worldBloomTurn(eventId) : undefined,
      worldBloomSupportUnit,
      cardBonusCountLimit,
      isFinale,
      specialCharacterId,
      sources: {
        worldBlooms: worldBlooms.source,
        eventCardBonusLimits: eventCardBonusLimits.source,
        gameCharacters: gameCharacters.source,
        worldBloomDifferentAttributeBonuses: worldBloomDifferentAttributeBonuses.source
      }
    },
    missingFields,
    source: {
      eventCards: eventCards.source,
      eventDeckBonuses: eventDeckBonuses.source,
      eventRarityBonusRates: eventRarityBonusRates.source,
      gameCharacterUnits: gameCharacterUnits.source,
      gameCharacters: gameCharacters.source,
      eventHonorBonuses: eventHonorBonuses.source,
      eventCardBonusLimits: eventCardBonusLimits.source,
      worldBlooms: worldBlooms.source,
      worldBloomDifferentAttributeBonuses: worldBloomDifferentAttributeBonuses.source
    }
  };
}

export async function getDeckRecommendSchema(region?: RegionId) {
  const collections = region
    ? await Promise.all([
        getMasterCollection(region, "eventDeckBonuses"),
        getMasterCollection(region, "eventRarityBonusRates"),
        getMasterCollection(region, "gameCharacterUnits"),
        getMasterCollection(region, "areaItemLevels")
      ])
    : [];
  return {
    inputs: {
      region: "jp | en | tw | kr | cn",
      eventId: "optional event id",
      musicId: "optional music id for event point calculation",
      difficulty: "easy | normal | hard | expert | master | append",
      liveType: "solo | multi | auto | cheerful | challenge",
      target: "event | power | skill",
      fixedCardIds: "optional card ids that must be included",
      fixedCharacterIds: "optional character ids/names that must be included",
      inventory: "owned card states: cardId, level, masterRank, skillLevel, specialTrainingStatus, defaultImage, episodesRead"
    },
    supportedTargets: ["event", "power", "skill"],
    supportedLiveTypes: ["solo", "multi", "auto", "cheerful", "challenge"],
    supportedCalculationModes: ["normal", "challenge", "world_bloom", "wl", "wl3"],
    eventPointCalcEndpoint: "/api/tools/event-point-calc",
    authenticatedEventPointCalcEndpoint: "/api/me/tools/event-point-calc",
    requiredMasterCollections: ["cards", "skills", "eventCards", "eventDeckBonuses", "eventRarityBonusRates", "gameCharacterUnits", "areaItemLevels", "music_meta"],
    availability: collections.map((collection) => ({ type: collection.type, count: collection.items.length, unavailableReason: collection.unavailableReason })),
    realDataRequired: true
  };
}

export async function getCalculationSchema(region?: RegionId) {
  const schema = await getDeckRecommendSchema(region);
  return {
    ...schema,
    playerAssetKinds: ["area-items", "character-ranks", "music-results", "materials", "challenge-live", "world-bloom-support"],
    officialFields: [
      "cards",
      "skills",
      "eventCards",
      "eventDeckBonuses",
      "eventRarityBonusRates",
      "gameCharacterUnits",
      "cardRarities",
      "cardEpisodes",
      "masterLessons",
      "areaItemLevels",
      "music_meta"
    ],
    estimatedUntilVerified: ["exact card parameter row mapping when local card shape lacks cardParameters", "exact musicMeta.event_rate when unavailable", "Challenge Live score source without uploaded challenge-live deck", "World Bloom/WL support and leader honor bonuses without uploaded assets"],
    references: [
      "Sekai-World/sekai-viewer src/pages/EventPointCalc.tsx",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/card-information/card-power-calculator.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/card-information/card-skill-calculator.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/event-point/event-calculator.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/deck-recommend/event-deck-recommend.ts"
    ],
    realDataRequired: true
  };
}

export async function getCalculationContext(region: RegionId, eventId: string) {
  const [bonusConfig, cardRarities, cardEpisodes, masterLessons, areaItemLevels] = await Promise.all([
    getEventBonusConfig(region, eventId),
    getMasterCollection(region, "cardRarities"),
    getMasterCollection(region, "cardEpisodes"),
    getMasterCollection(region, "masterLessons"),
    getMasterCollection(region, "areaItemLevels")
  ]);
  return {
    region,
    eventId,
    bonusConfig,
    collections: {
      cardRarities,
      cardEpisodes,
      masterLessons,
      areaItemLevels
    },
    formulaStatus: {
      eventBonus: "real master fields applied where available",
      cardPower: "estimated until full parameter formula is verified against references",
      eventPoint: "estimated until official formula is verified against references",
      challengeLive: "requires uploaded challenge-live asset data",
      worldBloom: "requires uploaded world-bloom-support asset data"
    },
    realDataRequired: true
  };
}

export async function buildContributions(options: RecommendOptions) {
  const worldBloomAsset = options.playerAssets?.["world-bloom-support"];
  const preliminarySupportContext = worldBloomSupportContext(options, worldBloomAsset);
  const [eventConfig] = await Promise.all([
    options.eventId ? getEventBonusConfig(options.region, options.eventId, preliminarySupportContext.specialCharacterId) : Promise.resolve(undefined)
  ]);
  const resolvedOptions: RecommendOptions = {
    ...options,
    worldBloomSupportUnit: options.worldBloomSupportUnit ?? eventConfig?.worldBloomSupportUnit,
    worldBloomEventTurn: options.worldBloomEventTurn ?? eventConfig?.worldBloomEventTurn,
    eventConfig
  };
  const supportContext = worldBloomSupportContext(resolvedOptions, worldBloomAsset);
  const supportBonusKey = supportBonusCollectionName(supportContext as unknown as Record<string, unknown>);
  const formulaMasters = await Promise.all([
    getMasterCollection(options.region, "cardParameters"),
    getMasterCollection(options.region, "cardEpisodes"),
    getMasterCollection(options.region, "masterLessons"),
    getMasterCollection(options.region, "areaItemLevels"),
    getMasterCollection(options.region, "eventSkillScoreUpLimits"),
    getMasterCollection(options.region, "eventHonorBonuses"),
    getMasterCollection(options.region, "worldBloomDifferentAttributeBonuses"),
    getMasterCollection(options.region, supportBonusKey),
    getMasterCollection(options.region, "worldBloomSupportDeckBonuses"),
    getMasterCollection(options.region, "worldBloomSupportDeckUnitEventLimitedBonuses")
  ]);
  const selectedSupportBonusRows = formulaMasters[7].items.length ? formulaMasters[7].items : formulaMasters[8].items;
  const selectedSupportBonusSource = formulaMasters[7].items.length ? supportBonusKey : "worldBloomSupportDeckBonuses";
  const masterContext = {
    cardParameters: formulaMasters[0].items,
    cardEpisodes: formulaMasters[1].items,
    masterLessons: formulaMasters[2].items,
    areaItemLevels: formulaMasters[3].items,
    eventSkillScoreUpLimits: formulaMasters[4].items,
    eventHonorBonuses: formulaMasters[5].items,
    worldBloomDifferentAttributeBonuses: formulaMasters[6].items,
    worldBloomSupportDeckBonuses: selectedSupportBonusRows,
    worldBloomSupportDeckBonusSource: selectedSupportBonusSource,
    worldBloomSupportDeckUnitEventLimitedBonuses: formulaMasters[9].items,
    missingFields: [
      ...["cardParameters", "cardEpisodes", "masterLessons", "areaItemLevels", "eventSkillScoreUpLimits", "eventHonorBonuses", "worldBloomDifferentAttributeBonuses"].filter((_, index) => formulaMasters[index].items.length === 0),
      selectedSupportBonusRows.length ? undefined : supportBonusKey,
      formulaMasters[9].items.length ? undefined : "worldBloomSupportDeckUnitEventLimitedBonuses"
    ].filter((item): item is string => Boolean(item)),
    officialFieldsUsed: [
      ...["cardParameters", "cardEpisodes", "masterLessons", "areaItemLevels", "eventSkillScoreUpLimits", "eventHonorBonuses", "worldBloomDifferentAttributeBonuses"].filter((_, index) => formulaMasters[index].items.length > 0),
      selectedSupportBonusRows.length ? selectedSupportBonusSource : undefined,
      formulaMasters[9].items.length ? "worldBloomSupportDeckUnitEventLimitedBonuses" : undefined
    ].filter((item): item is string => Boolean(item))
  };
  const formulaContext = await buildNormalEventFormulaContext({
    region: options.region,
    eventId: options.eventId,
    musicId: options.musicId,
    difficulty: options.difficulty,
    liveType: options.liveType,
    inventory: options.inventory,
    playerAssets: options.playerAssets,
    eventConfig,
    calculationMode: options.calculationMode,
    specialCharacterId: options.specialCharacterId,
    gameCharacterId: options.gameCharacterId,
    worldBloomSupportUnit: resolvedOptions.worldBloomSupportUnit,
    worldBloomEventTurn: resolvedOptions.worldBloomEventTurn
  });
  const [cards, referenceCards] = await Promise.all([
    getCards(options.region),
    getReferenceMaster<Record<string, unknown>>(options.region, "cards")
  ]);
  const referenceCardsById = new Map(referenceCards.map((row) => [String(row.id), row]));
  const formulaCards = cards.map((card) => {
    const raw = referenceCardsById.get(card.id);
    if (!raw) return card;
    return {
      ...card,
      characterId: raw.characterId == null ? card.characterId : String(raw.characterId),
      cardRarityType: raw.cardRarityType == null ? card.cardRarityType : String(raw.cardRarityType),
      attribute: raw.attr == null ? card.attribute : String(raw.attr),
      supportUnit: raw.supportUnit == null ? card.supportUnit : String(raw.supportUnit),
      skillId: raw.skillId == null ? card.skillId : String(raw.skillId),
      specialTrainingSkillId: raw.specialTrainingSkillId == null ? card.specialTrainingSkillId : String(raw.specialTrainingSkillId),
      specialTrainingPower1BonusFixed: Number(raw.specialTrainingPower1BonusFixed ?? card.specialTrainingPower1BonusFixed),
      specialTrainingPower2BonusFixed: Number(raw.specialTrainingPower2BonusFixed ?? card.specialTrainingPower2BonusFixed),
      specialTrainingPower3BonusFixed: Number(raw.specialTrainingPower3BonusFixed ?? card.specialTrainingPower3BonusFixed)
    };
  });
  const inventoryByCard = new Map(options.inventory.map((item) => [item.cardId, item]));
  const ownedCards = formulaCards.filter((card) => inventoryByCard.has(card.id));
  const target = options.target ?? "event";
  const missingFields = new Set<string>();
  const officialFieldsUsed = new Set<string>(formulaContext.officialFieldsUsed);
  const estimatedFieldsUsed = new Set<string>([...formulaContext.estimatedFieldsUsed]);
  masterContext.officialFieldsUsed.forEach((item) => officialFieldsUsed.add(item));
  masterContext.missingFields.forEach((item) => estimatedFieldsUsed.add(`${item} fallback`));
  if (!options.inventory.length) missingFields.add("user card inventory");
  if (options.eventId && eventConfig?.missingFields.length) eventConfig.missingFields.forEach((item) => missingFields.add(item));
  if (eventConfig?.eventCards.length) officialFieldsUsed.add("eventCards");
  if (eventConfig?.eventDeckBonuses.length) officialFieldsUsed.add("eventDeckBonuses");
  if (eventConfig?.eventRarityBonusRates.length) officialFieldsUsed.add("eventRarityBonusRates");
  if (eventConfig?.gameCharacterUnits.length) officialFieldsUsed.add("gameCharacterUnits");
  if (options.playerAssets?.["area-items"]) officialFieldsUsed.add("uploaded area item levels");
  else missingFields.add("uploaded area item levels");
  if (options.playerAssets?.["character-ranks"]) officialFieldsUsed.add("uploaded character rank");
  else missingFields.add("uploaded character rank");
  if (options.calculationMode === "challenge" || options.liveType === "challenge") {
    if (options.playerAssets?.["challenge-live"]) officialFieldsUsed.add("uploaded challenge live config");
    else missingFields.add("uploaded challenge live config");
  }
  if (["world_bloom", "wl", "wl3"].includes(options.calculationMode ?? "")) {
    if (supportContext.supportDeckSource === "uploaded") officialFieldsUsed.add("uploaded World Bloom support deck");
    else if (supportContext.supportDeckSource === "recommended-from-inventory") officialFieldsUsed.add("recommended World Bloom support deck from inventory");
    else {
      if (!supportContext.eventId) missingFields.add("eventId");
      if (!supportContext.specialCharacterId) missingFields.add("specialCharacterId/gameCharacterId");
      if (!supportContext.supportUnit) missingFields.add("worldBloomSupportUnit");
    }
    if (!eventConfig?.gameCharacters.length) estimatedFieldsUsed.add("World Bloom/WL support card units reconstructed from legacy normalized card data");
  }
  const challengeAsset = options.playerAssets?.["challenge-live"] as Record<string, unknown> | undefined;
  const supportDeckBreakdown = {
    supportDeckSource: supportContext.supportDeckSource,
    uploadedSupportCount: supportContext.uploadedCardIds.length,
    supportDeckCountTarget: ["world_bloom", "wl", "wl3"].includes(options.calculationMode ?? "") ? supportDeckCountForMode(options.calculationMode, supportContext as unknown as Record<string, unknown>) : 0,
    differentAttributeBonusRows: masterContext.worldBloomDifferentAttributeBonuses.length,
    eventHonorBonusRows: masterContext.eventHonorBonuses.length,
    supportBonusRows: masterContext.worldBloomSupportDeckBonuses.length,
    supportBonusCollection: selectedSupportBonusSource,
    unitEventLimitedBonusRows: masterContext.worldBloomSupportDeckUnitEventLimitedBonuses.length,
    supportCardIds: supportContext.uploadedCardIds,
    missingFields: [
      supportContext.supportDeckSource === "unavailable" && !supportContext.eventId ? "eventId" : undefined,
      supportContext.supportDeckSource === "unavailable" && !supportContext.specialCharacterId ? "specialCharacterId/gameCharacterId" : undefined,
      supportContext.supportDeckSource === "unavailable" && !supportContext.supportUnit ? "worldBloomSupportUnit" : undefined,
      masterContext.worldBloomSupportDeckBonuses.length ? undefined : supportBonusKey,
      masterContext.worldBloomDifferentAttributeBonuses.length ? undefined : "worldBloomDifferentAttributeBonuses",
      options.calculationMode === "wl3" && !masterContext.eventHonorBonuses.length ? "eventHonorBonuses" : undefined
    ].filter((item): item is string => Boolean(item))
  };
  const challengeTargetCharacter = String(challengeAsset?.characterId ?? challengeAsset?.gameCharacterId ?? "");
  const challengeCardIds = new Set((Array.isArray(challengeAsset?.cards) ? challengeAsset?.cards : Array.isArray(challengeAsset?.cardIds) ? challengeAsset?.cardIds : [])
    .map((row: unknown) => typeof row === "string" || typeof row === "number" ? String(row) : String((row as Record<string, unknown>)?.cardId ?? (row as Record<string, unknown>)?.id ?? ""))
    .filter(Boolean));

  const referenceHealth = await getReferenceMasterHealth(options.region);
  const referenceCharacters = await getReferenceMaster<Record<string, unknown>>(options.region, "characterRanks");
  const contributions = await Promise.all(ownedCards.map(async (card) => {
    const owned = inventoryByCard.get(card.id);
    const cardContributionBreakdown = buildCardContributionBreakdown({
      card,
      owned,
      playerAssets: options.playerAssets,
      eventConfig,
      masterContext,
      target
    });
    const characterId = cardCharacterId(card);
    if (options.calculationMode === "challenge" || options.liveType === "challenge") {
      const inUploadedDeck = challengeCardIds.has(card.id);
      cardContributionBreakdown.modeSpecificBreakdown.challenge = {
        formulaVersion: sharedFormulaVersion,
        targetCharacterId: challengeTargetCharacter || undefined,
        characterMatches: !challengeTargetCharacter || challengeTargetCharacter === characterId,
        inUploadedChallengeDeck: inUploadedDeck,
        uploadedChallengeLive: Boolean(challengeAsset),
        candidateRole: inUploadedDeck ? "uploaded-main-or-saved-card" : "candidate",
        officialFieldsUsed: ["cards", challengeAsset ? "uploaded challenge-live" : undefined].filter(Boolean),
        estimatedFieldsUsed: [],
        missingFields: [
          challengeAsset ? undefined : "uploaded challenge-live config",
          challengeTargetCharacter ? undefined : "challenge-live.characterId"
        ].filter(Boolean),
        scorePath: "Moesekai ChallengeLiveDeckRecommend filters user cards by characterId, then runs high-score deck search with Challenge live type"
      };
      if (inUploadedDeck) cardContributionBreakdown.contributionScore *= 1.08;
    }
    if (["world_bloom", "wl", "wl3"].includes(options.calculationMode ?? "")) {
      const supportIds = new Set(supportDeckBreakdown.supportCardIds);
      const supportHit = supportIds.has(card.id);
      const supportCandidate = supportCardBonus({ card, owned, estimatedPower: 0, powerBreakdown: cardContributionBreakdown.powerBreakdown, skillScore: cardContributionBreakdown.skillScore, eventBonus: cardContributionBreakdown.eventBonusPercent, directEventBonus: cardContributionBreakdown.directEventBonus, deckBonus: cardContributionBreakdown.deckBonus, masterRankBonus: cardContributionBreakdown.masterRankBonus, contributionScore: cardContributionBreakdown.contributionScore, cardContributionBreakdown, reasons: [] }, options.calculationMode, supportContext, masterContext);
      cardContributionBreakdown.modeSpecificBreakdown.worldBloom = {
        formulaVersion: sharedFormulaVersion,
        supportDeckBreakdown,
        supportDeckCandidate: supportCandidate,
        supportHit,
        differentAttributeBonusAvailable: masterContext.worldBloomDifferentAttributeBonuses.length > 0,
        leaderHonorBonusAvailable: masterContext.eventHonorBonuses.length > 0,
        wl3CardBonusCountLimit: options.calculationMode === "wl3" ? eventConfig?.cardBonusCountLimit : undefined,
        leaderHonorTrace: cardContributionBreakdown.leaderHonorTrace,
        officialFieldsUsed: [
          "cards",
          supportContext.supportDeckSource === "uploaded" ? "uploaded world-bloom-support" : undefined,
          supportContext.supportDeckSource === "recommended-from-inventory" ? "recommended world-bloom-support from inventory" : undefined,
          masterContext.worldBloomDifferentAttributeBonuses.length ? "worldBloomDifferentAttributeBonuses" : undefined,
          masterContext.eventHonorBonuses.length ? "eventHonorBonuses" : undefined
        ].filter(Boolean),
        estimatedFieldsUsed: card.characterUnit ? [] : ["support deck card unit uses legacy normalized-card fallback"],
        missingFields: supportDeckBreakdown.missingFields,
        unavailableReason: supportDeckBreakdown.missingFields.length ? supportDeckBreakdown.missingFields.join(" / ") : undefined
      };
      cardContributionBreakdown.modeSpecificBreakdown.wl = cardContributionBreakdown.modeSpecificBreakdown.worldBloom;
      cardContributionBreakdown.modeSpecificBreakdown.wl3 = options.calculationMode === "wl3"
        ? { ...cardContributionBreakdown.modeSpecificBreakdown.worldBloom as Record<string, unknown>, cardBonusCountLimit: eventConfig?.cardBonusCountLimit ?? 5 }
        : undefined;
      if (supportHit) cardContributionBreakdown.contributionScore *= 1.04;
    }
    const powerBreakdown = cardContributionBreakdown.powerBreakdown;
    const units = [card.supportUnit, card.characterUnit].filter((value): value is string => Boolean(value && value !== "none"));
    const exactPower = await calculateExactCardPower({
      region: options.region,
      card,
      owned,
      playerAssets: options.playerAssets,
      unit: units[0] ?? "any",
      sameUnit: false,
      sameAttr: false,
      mysekaiFixtureLimit: options.calculationMode === "wl3" ? 15_000 : undefined
    });
    const characterAsset = Array.isArray(options.playerAssets?.["character-ranks"])
      ? (options.playerAssets?.["character-ranks"] as Record<string, unknown>[]).find((row) => String(row.characterId ?? row.gameCharacterId ?? row.id) === card.characterId)
      : undefined;
    const exactSkill = await calculateExactCardSkill({
      region: options.region,
      card,
      owned,
      characterRank: Number(characterAsset?.characterRank ?? characterAsset?.rank ?? characterAsset?.level ?? 0),
      afterTraining: true
    });
    if (exactPower.detail) {
      powerBreakdown.estimatedPower = exactPower.detail.total;
      powerBreakdown.basePowerVector = (exactPower.trace.baseVector as [number, number, number]) ?? powerBreakdown.basePowerVector;
      powerBreakdown.areaItemBonus = exactPower.detail.areaItemBonus;
      powerBreakdown.characterRankBonus = exactPower.detail.characterBonus;
      powerBreakdown.cardParameterTrace = exactPower.trace;
      powerBreakdown.missingFields = exactPower.missingFields;
    }
    if (exactSkill.detail) {
      cardContributionBreakdown.skillDetail.scoreUpFixed = exactSkill.detail.scoreUpFixed;
      cardContributionBreakdown.skillDetail.scoreUpToReference = exactSkill.detail.scoreUpToReference;
      cardContributionBreakdown.skillDetail.lifeRecovery = exactSkill.detail.lifeRecovery;
      cardContributionBreakdown.skillEffectTrace = {
        ...(cardContributionBreakdown.skillEffectTrace ?? {}),
        exactReferenceTrace: exactSkill.trace
      } as Record<string, unknown> as typeof cardContributionBreakdown.skillEffectTrace;
      cardContributionBreakdown.skillScore = exactSkill.detail.scoreUpFixed;
    }
    exactPower.missingFields.forEach((field) => missingFields.add(field));
    exactPower.estimatedFieldsUsed.forEach((field) => estimatedFieldsUsed.add(field));
    exactSkill.missingFields.forEach((field) => missingFields.add(field));
    const estimatedPower = exactPower.detail?.total ?? powerBreakdown.estimatedPower;
    const directEventBonus = cardContributionBreakdown.directEventBonus;
    const matchedDeckBonus = cardContributionBreakdown.deckBonus;
    const masterRankBonus = cardContributionBreakdown.masterRankBonus;
    const totalEventBonus = cardContributionBreakdown.eventBonusPercent;
    const cardSkillScore = cardContributionBreakdown.skillScore;
    const contributionScore = cardContributionBreakdown.contributionScore;
    const cardDetailLike = buildCardDetailLike({
      card,
      owned,
      cardContributionBreakdown,
      estimatedPower,
      skillScore: cardSkillScore
    });
    return {
      card,
      owned,
      estimatedPower,
      powerBreakdown,
      skillScore: cardSkillScore,
      eventBonus: totalEventBonus,
      directEventBonus,
      deckBonus: matchedDeckBonus,
      masterRankBonus,
      contributionScore,
      cardContributionBreakdown,
      cardDetailLike,
      reasons: [
        `rarity ${card.rarity}`,
        `estimated power ${estimatedPower}`,
        `area item bonus ${powerBreakdown.areaItemBonus}`,
        `character rank bonus ${powerBreakdown.characterRankBonus}`,
        `event card bonus ${directEventBonus}%`,
        `deck bonus ${matchedDeckBonus}%`,
        `master rank bonus ${masterRankBonus}%`,
        card.skill ? `skill ${card.skill.skillType ?? card.skill.name ?? card.skill.id}` : "skill data unavailable"
      ]
    } satisfies CardContribution;
  }));

  const sortedContributions = contributions.sort((a, b) => b.contributionScore - a.contributionScore);
  if (["world_bloom", "wl", "wl3"].includes(options.calculationMode ?? "")) {
    const mainDeck = sortedContributions.slice(0, 5);
    const supportTrace = supportDeckTrace(sortedContributions, options.calculationMode, supportContext, masterContext);
    const attrTrace = differentAttributeBonus(mainDeck, masterContext.worldBloomDifferentAttributeBonuses);
    const leaderHonorTrace = mainDeck.map((item) => ({
      cardId: item.card.id,
      characterId: cardCharacterId(item.card),
      trace: item.cardContributionBreakdown.leaderHonorTrace
    }));
    const cardBonusCountLimitTrace = {
      cardBonusCountLimit: eventConfig?.cardBonusCountLimit ?? 5,
      source: eventConfig?.eventConfigTrace ? "Moesekai EventService.getEventCardBonusCountLimit" : "default 5",
      eventConfigTrace: eventConfig?.eventConfigTrace
    };
    for (const contribution of sortedContributions) {
      const previousWorldBloomBreakdown = contribution.cardContributionBreakdown.modeSpecificBreakdown.worldBloom as Record<string, unknown> | undefined;
      const supportHit = supportTrace.cards.some((item) => item.cardId === contribution.card.id);
      const breakdown = {
        formulaVersion: sharedFormulaVersion,
        deckBonusTrace: {
          fixedBonus: contribution.cardContributionBreakdown.eventBonusDetail.fixedBonus,
          cardBonus: contribution.cardContributionBreakdown.eventBonusDetail.cardBonus,
          leaderBonus: contribution.cardContributionBreakdown.eventBonusDetail.leaderBonus,
          differentAttributeBonus: attrTrace.bonusRate,
          totalDeckBonus: contribution.cardContributionBreakdown.eventBonusPercent + attrTrace.bonusRate
        },
        supportDeckBreakdown: supportTrace,
        supportDeckCandidate: previousWorldBloomBreakdown?.supportDeckCandidate,
        supportHit,
        differentAttributeTrace: attrTrace,
        leaderHonorTrace,
        cardBonusCountLimitTrace,
        officialFieldsUsed: [
          "cards",
          supportTrace.supportDeckSource === "uploaded" ? "uploaded world-bloom-support" : undefined,
          supportTrace.supportDeckSource === "recommended-from-inventory" ? "recommended world-bloom-support from inventory" : undefined,
          ...supportTrace.officialFieldsUsed,
          masterContext.worldBloomDifferentAttributeBonuses.length ? "worldBloomDifferentAttributeBonuses" : undefined,
          masterContext.eventHonorBonuses.length ? "eventHonorBonuses" : undefined
        ].filter(Boolean),
        estimatedFieldsUsed: uniqueStrings([supportTrace.estimatedFieldsUsed, "CardDetail.units/supportDeckBonus preprocessing reconstructed from local normalized card data"]),
        missingFields: uniqueStrings([supportTrace.missingFields, attrTrace.missingFields, mainDeck.map((item) => (item.cardContributionBreakdown.leaderHonorTrace as Record<string, unknown> | undefined)?.missingFields)]),
        unavailableReason: uniqueStrings([supportTrace.missingFields, attrTrace.missingFields, mainDeck.map((item) => (item.cardContributionBreakdown.leaderHonorTrace as Record<string, unknown> | undefined)?.missingFields)]).join(" / ") || undefined
      };
      contribution.cardContributionBreakdown.modeSpecificBreakdown.worldBloom = breakdown;
      contribution.cardContributionBreakdown.modeSpecificBreakdown.wl = breakdown;
      contribution.cardContributionBreakdown.modeSpecificBreakdown.wl3 = options.calculationMode === "wl3"
        ? { ...breakdown, cardBonusCountLimit: eventConfig?.cardBonusCountLimit ?? 5 }
        : undefined;
      if (supportHit) contribution.contributionScore += supportTrace.supportDeckBonus * 10;
    }
  }

  const topDeckDetails = sortedContributions.slice(0, 5).map((item) => item.cardDetailLike).filter((item): item is CardDetailLike => Boolean(item));
  const topWorldBloomBreakdown = sortedContributions[0]?.cardContributionBreakdown.modeSpecificBreakdown.worldBloom as Record<string, any> | undefined;
  const deckDetailLike: DeckDetailLike | undefined = topDeckDetails.length
    ? buildDeckDetailLike(topDeckDetails, {
        mode: formulaContext.mode as RecommendOptions["calculationMode"],
        supportDeckBonus: topWorldBloomBreakdown?.supportDeckBreakdown?.supportDeckBonus,
        cardBonusCountLimit: eventConfig?.cardBonusCountLimit,
        differentAttributeBonus: topWorldBloomBreakdown?.differentAttributeTrace?.bonusRate,
        estimatedFieldsUsed: [...estimatedFieldsUsed],
        missingFields: [...missingFields]
      })
    : undefined;

  return {
    eventConfig,
    eventConfigTrace: eventConfig?.eventConfigTrace,
    resolvedOptions,
    formulaContext,
    contributions: sortedContributions.sort((a, b) => b.contributionScore - a.contributionScore),
    deckDetailLike,
    cardDetailTrace: sortedContributions.slice(0, 20).map((item) => item.cardDetailLike?.trace).filter(Boolean),
    cardDetailMapTrace: deckDetailLike?.cardDetailMapTrace,
    deckDetailTrace: deckDetailLike?.deckDetailTrace,
    deckCalculatorTrace: deckDetailLike?.deckCalculatorTrace,
    wl3PowerCapTrace: deckDetailLike?.wl3PowerCapTrace,
    missingFields: [...missingFields],
    officialFieldsUsed: [...officialFieldsUsed],
    estimatedFieldsUsed: [...estimatedFieldsUsed],
    assetReadiness: formulaContext.assetReadiness,
    sharedFormulaVersion,
    formulaVersion: sharedFormulaVersion,
    referenceSources: formulaContext.referenceSources,
    referenceParity: {
      ...formulaContext.referenceParity,
      status: missingFields.size ? "missing-data" : "matched",
      cardCalculator: {
        status: referenceHealth.status === "matched" && ![...missingFields].some((field) => field.startsWith("cardParameters:") || field.startsWith("cards:") || field.startsWith("skills:")) ? "matched" : "missing-data",
        referenceFormulaId: "Moesekai.CardCalculator.batchGetCardDetail",
        referenceMasterHealth: referenceHealth,
        characterRankMasterRows: referenceCharacters.length
      },
      cardDetailLayer: "matched when normalized master/user-data fields are present: CardDetailMapPower/CardDetailMapSkill/CardDetailMapEventBonus feed DeckCalculator-style detail; unresolved raw master/user fields are missing-data",
      referenceFiles: [
        "refer/Moesekai/refer/re_sekai-calculator/src/card-information/card-detail-map.ts",
        "refer/Moesekai/refer/re_sekai-calculator/src/card-information/card-detail-map-power.ts",
        "refer/Moesekai/refer/re_sekai-calculator/src/card-information/card-detail-map-skill.ts",
        "refer/Moesekai/refer/re_sekai-calculator/src/deck-information/deck-calculator.ts"
      ]
    }
  };
}

function isSameCharacter(a: CardContribution, b: CardContribution) {
  return cardCharacterId(a.card) === cardCharacterId(b.card);
}

function deckScore(deck: CardContribution[], target: DeckTarget) {
  const eventBonus = deck.reduce((sum, item) => sum + item.eventBonus, 0);
  const power = deck.reduce((sum, item) => sum + item.estimatedPower, 0);
  const skill = deck.reduce((sum, item) => sum + item.skillScore, 0);
  if (target === "power") return power;
  if (target === "skill") return skill * 10 + power / 25;
  return eventBonus * 1000 + power / 12 + skill;
}

export function searchDecks(contributions: CardContribution[], options: RecommendOptions) {
  const limit = options.limit ?? 3;
  const timeoutMs = options.timeoutMs ?? 3000;
  const target = options.target ?? "event";
  const startedAt = Date.now();
  const fixedCardIds = new Set(options.fixedCardIds ?? []);
  if (options.leaderCardId) fixedCardIds.add(options.leaderCardId);
  const fixedCharacterIds = new Set(options.fixedCharacterIds ?? []);
  const fixed = contributions.filter((item) => fixedCardIds.has(item.card.id) || fixedCharacterIds.has(cardCharacterId(item.card)) || fixedCharacterIds.has(item.card.character));
  const candidateLimit = contributions.length > 80 ? 80 : contributions.length;
  const candidates = contributions.slice(0, candidateLimit);
  const isChallengeMode = options.liveType === "challenge" || options.calculationMode === "challenge";
  const isWorldBloomMode = ["world_bloom", "wl", "wl3"].includes(options.calculationMode ?? "");
  const member = isChallengeMode ? Math.min(5, candidates.length) : 5;
  const best: Array<{ cards: CardContribution[]; score: number; totalEventBonus: number; estimatedPower: number; skillScore: number; deckDetail?: DeckDetailLike; supportDeckBreakdown?: Record<string, unknown>; liveCalculatorTrace?: Record<string, unknown> }> = [];

  function supportForDeck(deck: CardContribution[]) {
    if (!isWorldBloomMode) return undefined;
    const reference = contributions.find((item) => item.cardContributionBreakdown.modeSpecificBreakdown.worldBloom)?.cardContributionBreakdown.modeSpecificBreakdown.worldBloom as Record<string, any> | undefined;
    const breakdown = reference?.supportDeckBreakdown as Record<string, any> | undefined;
    const count = Number(breakdown?.supportDeckCountTarget ?? breakdown?.supportDeckCount ?? supportDeckCountForMode(options.calculationMode));
    const deckIds = new Set(deck.map((item) => item.card.id));
    const uploadedOrder = new Map((Array.isArray(breakdown?.cards) ? breakdown.cards : []).map((item: any, index: number) => [String(item.cardId), index]));
    const source = String(breakdown?.supportDeckSource ?? "recommended-from-inventory");
    const cards = contributions
      .filter((item) => !deckIds.has(item.card.id))
      .map((item) => item.cardContributionBreakdown.modeSpecificBreakdown.worldBloom as Record<string, any> | undefined)
      .map((item) => item?.supportDeckCandidate)
      .filter((item) => item && Number.isFinite(Number(item.supportDeckBonus)))
      .filter((item) => source !== "uploaded" || uploadedOrder.has(String(item.cardId)))
      .sort((a, b) => source === "uploaded" ? (uploadedOrder.get(String(a.cardId)) ?? 0) - (uploadedOrder.get(String(b.cardId)) ?? 0) : Number(b.supportDeckBonus ?? 0) - Number(a.supportDeckBonus ?? 0))
      .slice(0, count);
    return {
      ...breakdown,
      supportDeckSource: source,
      supportDeckCountTarget: count,
      supportDeckCount: count,
      usedCount: cards.length,
      supportDeckBonus: cards.reduce((sum, item) => sum + Number(item.supportDeckBonus ?? 0), 0),
      cards,
      recommendedCards: source === "recommended-from-inventory" ? cards : [],
      excludedMainDeckCardIds: [...deckIds],
      referenceFormulaId: "Moesekai.EventCalculator.getSupportDeckBonus",
      referencePreprocessId: "Moesekai.CardBloomEventCalculator.getCardSupportDeckBonus"
    };
  }

  function push(deck: CardContribution[]) {
    const detailCards = deck.map((item) => item.cardDetailLike).filter((item): item is CardDetailLike => Boolean(item));
    const supportDeckBreakdown = supportForDeck(deck);
    const supportDeckBonus = Number(supportDeckBreakdown?.supportDeckBonus ?? 0);
    const deckDetail = detailCards.length === deck.length
      ? buildDeckDetailLike(detailCards, {
          mode: options.calculationMode ?? (options.liveType === "challenge" ? "challenge" : "normal"),
          supportDeckBonus,
          cardBonusCountLimit: options.eventConfig?.cardBonusCountLimit,
          differentAttributeBonus: isWorldBloomMode
            ? differentAttributeBonus(deck, options.eventConfig?.worldBloomDifferentAttributeBonuses ?? []).bonusRate
            : 0
        })
      : undefined;
    const liveDetail = deckDetail && options.musicMeta && isChallengeMode
      ? calculateLiveDetail(deckDetail, options.musicMeta, "challenge")
      : undefined;
    const score = liveDetail?.score ?? (deckDetail && (isChallengeMode || isWorldBloomMode)
      ? target === "power"
        ? deckDetail.power.total
        : target === "skill"
          ? deckDetail.multiLiveScoreUp * 1000 + deckDetail.power.total / 25
          : ((deckDetail.eventBonus ?? 0) + supportDeckBonus) * 1000 + deckDetail.power.total / 12 + deckDetail.multiLiveScoreUp
      : deckScore(deck, target));
    best.push({
      cards: deck,
      score,
      totalEventBonus: deckDetail ? (deckDetail.eventBonus ?? 0) + supportDeckBonus : deck.reduce((sum, item) => sum + item.eventBonus, 0) + supportDeckBonus,
      estimatedPower: Math.round(deck.reduce((sum, item) => sum + item.estimatedPower, 0)),
      skillScore: deck.reduce((sum, item) => sum + item.skillScore, 0),
      deckDetail,
      supportDeckBreakdown,
      liveCalculatorTrace: liveDetail?.trace
    });
    best.sort((a, b) => b.score - a.score);
    best.splice(limit);
  }

  function dfs(start: number, deck: CardContribution[]) {
    if (Date.now() - startedAt > timeoutMs) return;
    if (deck.length === member) {
      push(deck);
      return;
    }
    for (let index = start; index < candidates.length; index += 1) {
      const next = candidates[index];
      if (deck.some((item) => item.card.id === next.card.id)) continue;
      if (!isChallengeMode && deck.some((item) => isSameCharacter(item, next))) continue;
      dfs(index + 1, [...deck, next]);
    }
  }

  const uniqueFixed = fixed.filter((item, index) => fixed.findIndex((other) => other.card.id === item.card.id) === index).slice(0, 5);
  let gaIterations = 0;
  if (isChallengeMode && member > 0 && options.musicMeta) {
    let state = 0x6d2b79f5;
    const random = () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return (state >>> 0) / 0x100000000;
    };
    const population = Math.min(800, Math.max(80, candidates.length * 4));
    while (gaIterations < 120 && Date.now() - startedAt <= timeoutMs * 0.7) {
      for (let sample = 0; sample < population; sample += 1) {
        const pool = [...candidates];
        const deck = [...uniqueFixed];
        while (deck.length < member && pool.length) {
          const index = Math.floor(random() * pool.length);
          const [next] = pool.splice(index, 1);
          if (!deck.some((item) => item.card.id === next.card.id)) deck.push(next);
        }
        if (deck.length === member) push(deck);
      }
      gaIterations += 1;
    }
  }
  dfs(0, uniqueFixed);
  return {
    decks: best,
    calculationMode: isChallengeMode && options.musicMeta ? "ga-with-dfs-fallback" : contributions.length > candidateLimit ? "dfs-pruned" : "dfs-full",
    timedOut: Date.now() - startedAt > timeoutMs,
    candidateCount: candidates.length,
    totalCandidateCount: contributions.length,
    challengeSearchTrace: isChallengeMode ? {
      referenceFormulaId: "Moesekai.ChallengeLiveDeckRecommend.recommendDeck",
      algorithm: options.musicMeta ? "ga-with-dfs-fallback" : "unavailable-without-music-meta",
      member,
      iterations: gaIterations,
      stoppedReason: Date.now() - startedAt > timeoutMs ? "timeout" : "completed",
      fitness: options.musicMeta ? "Moesekai.LiveCalculator.getLiveScoreByDeck(..., CHALLENGE)" : "missing-data"
    } : undefined
  };
}

export async function estimateEventPoint(input: {
  region: RegionId;
  eventId?: string;
  musicId?: string;
  difficulty?: string;
  liveType?: LiveType;
  eventBonusPercent?: number;
  baseScore?: number;
  boost?: number;
  targetPt?: number;
  currentPt?: number;
  inventory?: UserCardState[];
  playerAssets?: Record<string, unknown>;
  calculationMode?: "normal" | "challenge" | "world_bloom" | "wl" | "wl3";
  specialCharacterId?: string;
  gameCharacterId?: string;
  worldBloomSupportUnit?: string;
  worldBloomEventTurn?: number;
  selfEffectiveness?: number;
  teammates?: MultiLivePlayer[];
  skill15Strategy?: Skill15Strategy;
  skill6Mode?: Skill6Mode;
}) {
  let baseScore = input.baseScore;
  let selfEffectiveness = input.selfEffectiveness;
  if (baseScore == null && input.inventory?.length && input.musicId && input.difficulty) {
    const built = await buildContributions({
      ...input,
      inventory: input.inventory,
      target: "power",
      liveType: input.liveType ?? "solo"
    });
    const musicMeta = await getMusicMeta(input.musicId, input.difficulty);
    const search = searchDecks(built.contributions, { ...built.resolvedOptions, musicMeta: musicMeta.meta, target: "power", limit: 1 });
    const detail = search.decks[0]?.deckDetail;
    if (detail && musicMeta.meta) {
      if (input.liveType === "multi" || input.liveType === "cheerful") {
        baseScore = detail.power.total;
        selfEffectiveness = detail.multiLiveScoreUp;
      } else {
        baseScore = calculateLiveDetail(detail, musicMeta.meta, input.liveType ?? "solo").score;
      }
    }
  }
  return estimateNormalEventPoint({ ...input, baseScore, selfEffectiveness });
}
