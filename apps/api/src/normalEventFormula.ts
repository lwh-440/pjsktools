import type { RegionId } from "./config.js";
import { getMasterCollection, getSongDetail } from "./masterData.js";
import { getMusicMeta } from "./musicMeta.js";
import { calculateMultiLive, type MultiLivePlayer, type Skill15Strategy, type Skill6Mode } from "./multiLiveCalculator.js";
import type { Card, MasterCollectionItem, UserCardInventoryItem } from "./types.js";

export const sharedFormulaVersion = "normal-event-v4.1-reference";

export type LiveType = "solo" | "multi" | "auto" | "cheerful" | "challenge";

export type UserCardState = Pick<
  UserCardInventoryItem,
  "cardId" | "level" | "masterRank" | "skillLevel" | "specialTrainingStatus" | "defaultImage" | "episodes" | "episodesRead"
>;

export type EventBonusConfigLike = {
  eventId: string;
  eventType?: string;
  eventCards: MasterCollectionItem[];
  eventDeckBonuses: MasterCollectionItem[];
  eventRarityBonusRates: MasterCollectionItem[];
  gameCharacterUnits: MasterCollectionItem[];
  gameCharacters?: MasterCollectionItem[];
  eventHonorBonuses?: MasterCollectionItem[];
  eventCardBonusLimits?: MasterCollectionItem[];
  worldBlooms?: MasterCollectionItem[];
  worldBloomDifferentAttributeBonuses?: MasterCollectionItem[];
  worldBloomType?: string;
  worldBloomEventTurn?: 1 | 2 | 3;
  worldBloomSupportUnit?: string;
  cardBonusCountLimit?: number;
  eventConfigTrace?: Record<string, unknown>;
  missingFields: string[];
  source: Record<string, string>;
};

type FormulaMasterContext = {
  cardParameters: MasterCollectionItem[];
  cardEpisodes: MasterCollectionItem[];
  masterLessons: MasterCollectionItem[];
  areaItemLevels: MasterCollectionItem[];
  eventSkillScoreUpLimits: MasterCollectionItem[];
  eventHonorBonuses: MasterCollectionItem[];
  worldBloomDifferentAttributeBonuses: MasterCollectionItem[];
  missingFields: string[];
  officialFieldsUsed: string[];
};

export type AssetReadiness = {
  inventory: { ready: boolean; count: number; missingFields: string[] };
  areaItems: { ready: boolean; count: number; missingFields: string[] };
  characterRanks: { ready: boolean; count: number; missingFields: string[] };
  musicResults: { ready: boolean; count: number; missingFields: string[] };
  materials: { ready: boolean; count: number; missingFields: string[] };
};

export type NormalEventFormulaContext = {
  version: string;
  mode: "normal" | "challenge" | "world_bloom" | "wl" | "wl3";
  region: RegionId;
  eventId?: string;
  musicId?: string;
  difficulty?: string;
  liveType: LiveType;
  assetReadiness: AssetReadiness;
  officialFieldsUsed: string[];
  estimatedFieldsUsed: string[];
  missingFields: string[];
  warnings: string[];
  formulaSources: string[];
  referenceSources: string[];
  referenceParity: Record<string, unknown>;
  realDataRequired: true;
};

export type CardPowerBreakdown = {
  basePowerVector: [number, number, number];
  areaItemBonusVector: [number, number, number];
  characterRankBonusVector: [number, number, number];
  rarityBasePower: number;
  levelBonus: number;
  specialTrainingBonus: number;
  masterRankBonusPower: number;
  skillLevelBonus: number;
  episodeReadBonus: number;
  areaItemBonus: number;
  characterRankBonus: number;
  estimatedPower: number;
  level: number;
  masterRank: number;
  skillLevel: number;
  trained: boolean;
  areaItemRate: number;
  characterRankRate: number;
  calculationTrace: string[];
  cardParameterTrace: Record<string, unknown>;
  missingFields: string[];
};

export type CardContributionBreakdown = {
  basePower: number;
  powerBreakdown: CardPowerBreakdown;
  eventBonusPercent: number;
  eventBonusDetail: {
    fixedBonus: number;
    cardBonus: number;
    leaderBonus: number;
    cardBonusCountLimit?: number;
  };
  directEventBonus: number;
  deckBonus: number;
  masterRankBonus: number;
  skillScore: number;
  skillDetail: {
    scoreUpBasic: number;
    scoreUpCharacterRank: number;
    scoreUpSameUnit: number;
    scoreUpDifferentUnit: number;
    scoreUpReferenceMax: number;
    scoreUpFixed: number;
    scoreUpToReference: number;
    lifeRecovery: number;
    judgeSupport: number;
    referenceLimited: boolean;
    scoreUpLimit?: number;
  };
  contributionScore: number;
  modeSpecificBreakdown: Record<string, unknown>;
  cardParameterTrace?: Record<string, unknown>;
  skillEffectTrace?: Record<string, unknown>;
  skillFormulaTrace?: Record<string, unknown>;
  limitTrace?: Record<string, unknown>;
  leaderHonorTrace?: Record<string, unknown>;
  fieldSources: Record<string, string>;
};

export type EventPointEstimateInput = {
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
};

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

export function cardCharacterId(card: Card) {
  if (card.characterId) return card.characterId;
  const match = card.assetbundleName?.match(/(?:^|_)(\d{1,2})(?:_|$)/);
  return match ? match[1] : card.character;
}

function rarityKey(card: Card) {
  if (card.rarity >= 4) return "rarity_4";
  if (card.rarity === 3) return "rarity_3";
  if (card.rarity === 2) return "rarity_2";
  if (card.rarity === 1) return "rarity_1";
  return "rarity_unknown";
}

function masterRankBonusFallback(card: Card, masterRank = 0) {
  const rank = Math.max(0, Math.min(5, masterRank));
  if (card.rarity >= 4) return [10, 12.5, 15, 17.5, 20, 25][rank] ?? 10;
  if (card.rarity === 3) return rank;
  if (card.rarity === 2) return rank * 0.2;
  return rank * 0.1;
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function formulaMode(input: { liveType?: LiveType; calculationMode?: string; eventType?: string }) {
  const explicit = String(input.calculationMode ?? "").toLowerCase();
  const eventType = String(input.eventType ?? "").toLowerCase();
  if (explicit === "wl3") return "wl3";
  if (explicit === "wl") return "wl";
  if (explicit === "world_bloom" || eventType.includes("bloom")) return "world_bloom";
  if (explicit === "challenge" || input.liveType === "challenge") return "challenge";
  return "normal";
}

const worldBloomSupportUnitByCharacterId: Record<string, string> = {
  "1": "light_sound", "2": "light_sound", "3": "light_sound", "4": "light_sound",
  "5": "idol", "6": "idol", "7": "idol", "8": "idol",
  "9": "street", "10": "street", "11": "street", "12": "street",
  "13": "theme_park", "14": "theme_park", "15": "theme_park", "16": "theme_park",
  "17": "school_refusal", "18": "school_refusal", "19": "school_refusal", "20": "school_refusal",
  "21": "piapro", "22": "piapro", "23": "piapro", "24": "piapro", "25": "piapro", "26": "piapro"
};

export function formulaReferenceSources() {
  return [
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/card-information/card-power-calculator.ts",
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/card-information/card-skill-calculator.ts",
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/event-point/card-event-calculator.ts",
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/event-point/event-calculator.ts",
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/deck-recommend/event-deck-recommend.ts",
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/deck-recommend/challenge-live-deck-recommend.ts",
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/deck-recommend/bloom-support-deck-recommend.ts",
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/music-recommend/music-recommend.ts",
    "moe-sekai/Moesekai refer/re_sekai-calculator/src/area-item-recommend/area-item-recommend.ts",
    "Sekai-World/sekai-viewer src/pages/EventPointCalc.tsx"
  ];
}

async function loadFormulaMasterContext(region: RegionId): Promise<FormulaMasterContext> {
  const names = [
    "cardParameters",
    "cardEpisodes",
    "masterLessons",
    "areaItemLevels",
    "eventSkillScoreUpLimits",
    "eventHonorBonuses",
    "worldBloomDifferentAttributeBonuses"
  ] as const;
  const collections = await Promise.all(names.map((name) => getMasterCollection(region, name)));
  const byName = Object.fromEntries(names.map((name, index) => [name, collections[index].items])) as Record<(typeof names)[number], MasterCollectionItem[]>;
  const missingFields = names.filter((name, index) => collections[index].items.length === 0);
  const officialFieldsUsed = names.filter((name, index) => collections[index].items.length > 0);
  return {
    cardParameters: byName.cardParameters,
    cardEpisodes: byName.cardEpisodes,
    masterLessons: byName.masterLessons,
    areaItemLevels: byName.areaItemLevels,
    eventSkillScoreUpLimits: byName.eventSkillScoreUpLimits,
    eventHonorBonuses: byName.eventHonorBonuses,
    worldBloomDifferentAttributeBonuses: byName.worldBloomDifferentAttributeBonuses,
    missingFields,
    officialFieldsUsed
  };
}

function firstFinite(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function cardParameterVector(card: Card, owned: UserCardState | undefined, context?: FormulaMasterContext) {
  const level = owned?.level ?? (card.rarity >= 4 ? 60 : card.rarity === 3 ? 50 : 30);
  const rarity = rarityKey(card);
  const candidates = context?.cardParameters.filter((item) => {
    const raw = rawRecord(item);
    const rarityMatches = String(raw.cardRarityType ?? raw.rarity ?? "") === rarity || String(raw.cardRarityType ?? "").includes(String(card.rarity));
    const levelMatches = raw.level == null && raw.cardLevel == null
      ? true
      : rawNumber(raw.level ?? raw.cardLevel, -1) === level;
    return rarityMatches && levelMatches;
  }) ?? [];
  const exact = candidates.find((item) => rawNumber(rawRecord(item).level ?? rawRecord(item).cardLevel, -1) === level) ?? candidates[0];
  const raw = rawRecord(exact);
  const vector = exact
    ? [
        firstFinite(raw, ["power1", "power1BonusFixed", "param1", "performance1"]) ?? 0,
        firstFinite(raw, ["power2", "power2BonusFixed", "param2", "performance2"]) ?? 0,
        firstFinite(raw, ["power3", "power3BonusFixed", "param3", "performance3"]) ?? 0
      ] as [number, number, number]
    : undefined;
  return {
    level,
    vector,
    source: exact ? "cardParameters" : "deterministic fallback",
    matchedRow: exact?.raw,
    missingFields: exact ? [] : ["cardParameters"]
  };
}

function bonusVectorFromRows(rows: MasterCollectionItem[] | undefined, filters: (raw: Record<string, unknown>) => boolean) {
  const matched = (rows ?? []).filter((item) => filters(rawRecord(item)));
  const vector = matched.reduce<[number, number, number]>((sum, item) => {
    const raw = rawRecord(item);
    return [
      sum[0] + (firstFinite(raw, ["power1BonusFixed", "power1", "param1"]) ?? 0),
      sum[1] + (firstFinite(raw, ["power2BonusFixed", "power2", "param2"]) ?? 0),
      sum[2] + (firstFinite(raw, ["power3BonusFixed", "power3", "param3"]) ?? 0)
    ];
  }, [0, 0, 0]);
  return { matched, vector };
}

function vectorFromTotal(total: number): [number, number, number] {
  const first = Math.floor(total / 3);
  const second = Math.floor(total / 3);
  return [first, second, Math.max(0, total - first - second)];
}

function vectorBonus(base: [number, number, number], rate: number): [number, number, number] {
  return base.map((value) => Math.floor(Math.fround(Math.fround(rate) * Math.fround(0.01)) * value)) as [number, number, number];
}

function assetState(value: unknown, label: string) {
  const count = Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value as Record<string, unknown>).length : value == null ? 0 : 1;
  return {
    ready: count > 0,
    count,
    missingFields: count > 0 ? [] : [`Missing uploaded ${label}`]
  };
}

export function buildAssetReadiness(inventory: UserCardState[] = [], playerAssets: Record<string, unknown> = {}): AssetReadiness {
  return {
    inventory: {
      ready: inventory.length >= 5,
      count: inventory.length,
      missingFields: inventory.length >= 5 ? [] : ["At least 5 uploaded cards are required"]
    },
    areaItems: assetState(playerAssets["area-items"], "area-items"),
    characterRanks: assetState(playerAssets["character-ranks"], "character-ranks"),
    musicResults: assetState(playerAssets["music-results"], "music-results"),
    materials: assetState(playerAssets.materials, "materials")
  };
}

export async function buildNormalEventFormulaContext(input: {
  region: RegionId;
  eventId?: string;
  musicId?: string;
  difficulty?: string;
  liveType?: LiveType;
  inventory?: UserCardState[];
  playerAssets?: Record<string, unknown>;
  eventConfig?: EventBonusConfigLike;
  calculationMode?: "normal" | "challenge" | "world_bloom" | "wl" | "wl3";
  specialCharacterId?: string;
  gameCharacterId?: string;
  worldBloomSupportUnit?: string;
  worldBloomEventTurn?: number;
}) {
  const readiness = buildAssetReadiness(input.inventory ?? [], input.playerAssets ?? {});
  const mode = formulaMode({ liveType: input.liveType, calculationMode: input.calculationMode, eventType: input.eventConfig?.eventType });
  const officialFieldsUsed = new Set<string>(["cards"]);
  const estimatedFieldsUsed = new Set<string>(["normal event point estimate"]);
  const missingFields = new Set<string>();
  const warnings = new Set<string>();

  if (input.eventId) {
    if (input.eventConfig?.eventCards.length) officialFieldsUsed.add("eventCards");
    else missingFields.add("eventCards");
    if (input.eventConfig?.eventDeckBonuses.length) officialFieldsUsed.add("eventDeckBonuses");
    else missingFields.add("eventDeckBonuses");
    if (input.eventConfig?.eventRarityBonusRates.length) officialFieldsUsed.add("eventRarityBonusRates");
    else missingFields.add("eventRarityBonusRates");
    if (input.eventConfig?.gameCharacterUnits.length) officialFieldsUsed.add("gameCharacterUnits");
    else missingFields.add("gameCharacterUnits");
    for (const field of input.eventConfig?.missingFields ?? []) missingFields.add(field);
  }

  if (readiness.areaItems.ready) officialFieldsUsed.add("uploaded area-items");
  else missingFields.add("uploaded area-items");
  if (readiness.characterRanks.ready) officialFieldsUsed.add("uploaded character-ranks");
  else missingFields.add("uploaded character-ranks");
  if (readiness.musicResults.ready) officialFieldsUsed.add("uploaded music-results");
  else warnings.add("Missing uploaded music-results; personalized difficulty defaults are limited");
  if (!readiness.materials.ready) warnings.add("Missing uploaded materials; material affordability is not assumed");
  if (mode === "challenge") {
    if (input.playerAssets?.["challenge-live"]) officialFieldsUsed.add("uploaded challenge-live deck");
    else missingFields.add("uploaded challenge-live deck");
    estimatedFieldsUsed.add("Challenge Live score path is separated from normal event deck bonus");
  }
  if (mode === "world_bloom" || mode === "wl" || mode === "wl3") {
    const asset = input.playerAssets?.["world-bloom-support"];
    const assetRecord = asset && typeof asset === "object" && !Array.isArray(asset) ? asset as Record<string, unknown> : undefined;
    const uploadedCardIds = Array.isArray(asset)
      ? asset
      : Array.isArray(assetRecord?.cardIds)
        ? assetRecord.cardIds
        : [];
    const specialCharacterId = rawString(assetRecord?.specialCharacterId ?? assetRecord?.gameCharacterId ?? assetRecord?.characterId ?? input.specialCharacterId ?? input.gameCharacterId);
    const supportUnit = rawString(assetRecord?.worldBloomSupportUnit ?? assetRecord?.supportUnit ?? assetRecord?.unit ?? input.worldBloomSupportUnit) ?? (specialCharacterId ? worldBloomSupportUnitByCharacterId[specialCharacterId] : undefined);
    const recommendableFromInventory = Boolean(input.inventory?.length && input.eventId && specialCharacterId && supportUnit);
    if (uploadedCardIds.length) officialFieldsUsed.add("uploaded World Bloom support deck");
    else if (recommendableFromInventory) officialFieldsUsed.add("recommended World Bloom support deck from inventory");
    else {
      if (!input.eventId) missingFields.add("eventId");
      if (!specialCharacterId) missingFields.add("specialCharacterId/gameCharacterId");
      if (!supportUnit) missingFields.add("worldBloomSupportUnit");
    }
    if (input.eventConfig?.worldBloomDifferentAttributeBonuses?.length) officialFieldsUsed.add("worldBloomDifferentAttributeBonuses");
    else missingFields.add("worldBloomDifferentAttributeBonuses");
    if (mode === "wl3") {
      if (input.eventConfig?.eventHonorBonuses?.length && Array.isArray(input.playerAssets?.honors)) officialFieldsUsed.add("eventHonorBonuses + uploaded honors");
      else {
        if (!input.eventConfig?.eventHonorBonuses?.length) missingFields.add("eventHonorBonuses");
        if (!Array.isArray(input.playerAssets?.honors)) missingFields.add("uploaded honors");
      }
      if (input.eventConfig?.eventCardBonusLimits?.length) officialFieldsUsed.add("eventCardBonusLimits");
      else missingFields.add("eventCardBonusLimits");
    }
  }

  return {
    version: sharedFormulaVersion,
    mode,
    region: input.region,
    eventId: input.eventId,
    musicId: input.musicId,
    difficulty: input.difficulty,
    liveType: input.liveType ?? "solo",
    assetReadiness: readiness,
    officialFieldsUsed: [...officialFieldsUsed],
    estimatedFieldsUsed: [...estimatedFieldsUsed],
    missingFields: [...missingFields],
    warnings: [...warnings],
    formulaSources: [
      "Moesekai re_sekai-calculator card-information/event-point/deck-recommend references",
      "Sekai Viewer EventPointCalc reference",
      "local normal-event shared estimator"
    ],
    referenceSources: formulaReferenceSources(),
    referenceParity: {
      status: missingFields.size ? "missing-data" : "matched",
      referenceFiles: formulaReferenceSources(),
      calculatorLayering: "matched: card, deck, event point, deck/search, music, and area recommendation consume shared formula context",
      cardPower: "matched when cardParameters/cardEpisodes/masterLessons/area-item/rank assets are present; otherwise missing-data is reported",
      cardSkill: "matched for local skillEffectDetails categories consumed by CardDetailMapSkill; missing raw skill rows stay missing-data",
      eventBonus: "matched for fixed/card/leader/cardBonusCountLimit fields that exist in master; honor ownership remains missing-data when user honor source is absent",
      eventPoint: "matched live-type branch semantics for solo/multi/cheerful/challenge with explicit missing music-rate fields",
      unsupportedModes: mode === "normal" ? [] : [`${mode} requires uploaded mode-specific assets and verified master rows for matched status`]
    },
    realDataRequired: true as const
  };
}

export function buildCardPowerBreakdown(card: Card, owned?: UserCardState, playerAssets: Record<string, unknown> = {}, masterContext?: FormulaMasterContext): CardPowerBreakdown {
  const level = owned?.level ?? (card.rarity >= 4 ? 60 : card.rarity === 3 ? 50 : 30);
  const masterRank = owned?.masterRank ?? 0;
  const skillLevel = owned?.skillLevel ?? 1;
  const trained = owned?.specialTrainingStatus === "done" || owned?.defaultImage === "after_training";
  const parameter = cardParameterVector(card, owned, masterContext);
  const base = Math.max(1, card.rarity) * 950;
  const levelBonus = Math.max(1, Math.min(100, level)) * (card.rarity >= 4 ? 48 : 34);
  const episodeRows = owned?.episodesRead
    ? bonusVectorFromRows(masterContext?.cardEpisodes, (raw) => String(raw.cardId ?? "").replace(/\D/g, "") === card.id || JSON.stringify(raw).includes(`:${card.id}`))
    : { matched: [], vector: [0, 0, 0] as [number, number, number] };
  const masterRows = bonusVectorFromRows(masterContext?.masterLessons, (raw) => {
    const rarityMatches = String(raw.cardRarityType ?? raw.rarity ?? "") === rarityKey(card) || String(raw.cardRarityType ?? "").includes(String(card.rarity));
    const rowRank = rawNumber(raw.masterRank ?? raw.rank, -1);
    return rarityMatches && rowRank >= 0 && rowRank <= masterRank;
  });
  const fallbackMasterBonus = Math.max(0, Math.min(5, masterRank)) * 230;
  const masterBonus = masterRows.matched.length ? masterRows.vector.reduce((sum, value) => sum + value, 0) : fallbackMasterBonus;
  const fallbackEpisodeBonus = owned?.episodesRead && !episodeRows.matched.length ? 300 : 0;
  const skillBonus = Math.max(1, Math.min(4, skillLevel)) * 70;
  const fallbackBaseVector = vectorFromTotal(base + levelBonus);
  const baseVector = parameter.vector?.some((value) => value > 0) ? parameter.vector : fallbackBaseVector;
  const specialTrainingVector = trained
    ? vectorFromTotal(Math.round((baseVector.reduce((sum, value) => sum + value, 0) + masterBonus + skillBonus) * 0.08))
    : [0, 0, 0] as [number, number, number];
  const basePowerVectorBeforeRates = baseVector.map((value, index) => value + episodeRows.vector[index] + masterRows.vector[index] + specialTrainingVector[index]) as [number, number, number];
  const episodeBonus = episodeRows.vector.reduce((sum, value) => sum + value, 0) || fallbackEpisodeBonus;
  const beforeTraining = basePowerVectorBeforeRates.reduce((sum, value) => sum + value, 0) + (masterRows.matched.length ? 0 : fallbackMasterBonus) + fallbackEpisodeBonus + skillBonus;
  const specialTrainingBonus = trained ? Math.round(beforeTraining * 0.08) : 0;
  const characterId = cardCharacterId(card);
  const areaItems = asArray(playerAssets["area-items"]);
  const characterRanks = asArray(playerAssets["character-ranks"]);
  const areaLevel = Math.max(
    uploadedLevel(areaItems, ["areaItemId", "id", "targetGameCharacterId", "characterId"], characterId),
    uploadedLevel(areaItems, ["areaItemId", "id", "targetUnit", "unit"], card.supportUnit),
    uploadedLevel(areaItems, ["areaItemId", "id", "targetCardAttr", "attribute", "attr"], card.attribute)
  );
  const characterRank = uploadedLevel(characterRanks, ["characterId", "gameCharacterId", "id"], characterId);
  const basePower = parameter.vector ? beforeTraining : beforeTraining + specialTrainingBonus;
  const areaItemRate = Math.min(100, areaLevel) * 0.1;
  const characterRankRate = Math.min(100, characterRank) * 0.05;
  const basePowerVector = parameter.vector ? basePowerVectorBeforeRates : vectorFromTotal(basePower);
  const areaItemBonusVector = vectorBonus(basePowerVector, areaItemRate);
  const characterRankBonusVector = vectorBonus(basePowerVector, characterRankRate);
  const areaItemBonus = areaItemBonusVector.reduce((sum, value) => sum + value, 0);
  const characterRankBonus = characterRankBonusVector.reduce((sum, value) => sum + value, 0);
  return {
    basePowerVector,
    areaItemBonusVector,
    characterRankBonusVector,
    rarityBasePower: base,
    levelBonus,
    specialTrainingBonus,
    masterRankBonusPower: masterBonus,
    skillLevelBonus: skillBonus,
    episodeReadBonus: episodeBonus,
    areaItemBonus,
    characterRankBonus,
    estimatedPower: basePower + areaItemBonus + characterRankBonus,
    level,
    masterRank,
    skillLevel,
    trained,
    areaItemRate,
    characterRankRate,
    calculationTrace: [
      "Moesekai CardPowerCalculator uses power1/power2/power3 base parameters, then adds special training, episodes, master lessons, and MySekai canvas before rate bonuses",
      "Area item and character rank bonuses are applied per power axis with floor, then summed",
      parameter.vector ? "normal-event-v4.1-reference used cardParameters for the base power vector" : "cardParameters row was unavailable; normal-event-v4.1-reference used deterministic vector fallback"
    ],
    cardParameterTrace: {
      source: parameter.source,
      level: parameter.level,
      basePowerVector,
      matchedCardParameter: parameter.matchedRow,
      episodeRowsMatched: episodeRows.matched.length,
      masterLessonRowsMatched: masterRows.matched.length,
      specialTrainingVector,
      missingFields: parameter.missingFields
    },
    missingFields: [
      ...parameter.missingFields,
      areaLevel ? undefined : "uploaded area item level for this card",
      characterRank ? undefined : "uploaded character rank for this card",
      owned?.episodesRead ? undefined : "episode read state"
    ].filter((item): item is string => Boolean(item))
  };
}

export function skillScore(card: Card, owned?: UserCardState) {
  const skillLevel = owned?.skillLevel ?? 1;
  const scoreEffect = card.skill?.effects?.some((effect) => String(effect.type ?? "").toLowerCase().includes("score"));
  const lifeOrJudgeEffect = card.skill?.effects?.some((effect) => effect.activateLife || effect.judgment);
  if (scoreEffect) return 500 + skillLevel * 80;
  if (lifeOrJudgeEffect) return 180 + skillLevel * 40;
  return skillLevel * 35;
}

export function skillDetail(card: Card, owned?: UserCardState, scoreUpLimit = Number.MAX_SAFE_INTEGER) {
  const skillLevel = owned?.skillLevel ?? 1;
  const effects = card.skill?.effects ?? [];
  let scoreUpBasic = 0;
  let scoreUpSameUnit = 0;
  let scoreUpDifferentUnit = 0;
  let lifeRecovery = 0;
  let judgeSupport = 0;
  let scoreUpCharacterRank = 0;
  let scoreUpReferenceRate = 0;
  let scoreUpReferenceMax = 0;
  let referenceLimited = false;
  const selectedDetails: Array<Record<string, unknown>> = [];
  for (const effect of effects) {
    const record = (effect.raw && typeof effect.raw === "object" ? effect.raw : effect) as Record<string, unknown>;
    const type = String(record.type ?? record.skillEffectType ?? "").toLowerCase();
    const details = Array.isArray((effect as any).details) ? (effect as any).details as Record<string, unknown>[] : [];
    const levelDetail = details.find((detail) => rawNumber(detail.level ?? detail.skillLevel, -1) === skillLevel) ?? details[0];
    const rawDetail = levelDetail?.raw && typeof levelDetail.raw === "object" ? levelDetail.raw as Record<string, unknown> : levelDetail;
    const effectValue = rawNumber(record.activateEffectValue ?? record.value ?? rawDetail?.value ?? rawDetail?.activateEffectValue, 0);
    const effectValue2 = rawNumber(rawDetail?.value2 ?? rawDetail?.activateEffectValue2, 0);
    const scaled = effectValue || (type.includes("score") ? 500 + skillLevel * 80 : 0);
    selectedDetails.push({
      type,
      level: rawDetail?.level ?? rawDetail?.skillLevel ?? levelDetail?.level,
      activateEffectValue: effectValue,
      activateEffectValue2: effectValue2 || undefined
    });
    if (type === "score_up" || type === "score_up_condition_life" || type === "score_up_keep" || (type.includes("score") && !type.includes("reference") && !type.includes("unit_count") && !type.includes("character_rank"))) {
      scoreUpBasic = Math.max(scoreUpBasic, scaled);
      const enhance = record.skillEnhance && typeof record.skillEnhance === "object" ? record.skillEnhance as Record<string, unknown> : undefined;
      const enhanceValue = rawNumber(enhance?.activateEffectValue, 0);
      if (enhanceValue > 0) scoreUpSameUnit = Math.max(scoreUpSameUnit, enhanceValue * 4);
    }
    if (type.includes("life") || effect.activateLife) lifeRecovery = Math.max(lifeRecovery, rawNumber(effect.activateLife, scaled || 180 + skillLevel * 40));
    if (type.includes("judge") || effect.judgment) judgeSupport = Math.max(judgeSupport, 100 + skillLevel * 25);
    if (type === "score_up_character_rank") {
      scoreUpCharacterRank = Math.max(scoreUpCharacterRank, scaled);
    }
    if (type === "other_member_score_up_reference_rate" || type.includes("reference")) {
      referenceLimited = true;
      scoreUpReferenceRate = Math.max(scoreUpReferenceRate, effectValue);
      scoreUpReferenceMax = Math.max(scoreUpReferenceMax, effectValue2);
    }
    if (type === "score_up_unit_count" || type.includes("unit_count")) {
      referenceLimited = true;
      scoreUpDifferentUnit = Math.max(scoreUpDifferentUnit, scaled);
    }
  }
  if (!effects.length) scoreUpBasic = skillScore(card, owned);
  const scoreUpSelfFixed = scoreUpBasic + scoreUpCharacterRank;
  const scoreUpFixed = Math.min(scoreUpSelfFixed + scoreUpSameUnit + scoreUpDifferentUnit, scoreUpLimit);
  const scoreUpToReference = Math.min(scoreUpSelfFixed + scoreUpSameUnit + scoreUpDifferentUnit, scoreUpLimit);
  const appliedLimit = Number.isFinite(scoreUpLimit) && scoreUpLimit < Number.MAX_SAFE_INTEGER;
  return {
    scoreUpBasic,
    scoreUpCharacterRank,
    scoreUpSameUnit,
    scoreUpDifferentUnit,
    scoreUpReferenceMax,
    scoreUpFixed,
    scoreUpToReference,
    lifeRecovery,
    judgeSupport,
    referenceLimited,
    scoreUpLimit,
    appliedLimit,
    skillEffectTrace: {
      skillId: card.skill?.id,
      skillLevel,
      selectedDetails,
      appliedLimit,
      limitValue: appliedLimit ? scoreUpLimit : undefined,
      effects: effects.map((effect) => ({
        type: effect.type,
        detailCount: effect.details?.length ?? 0,
        selectedDetail: effect.details?.find((detail) => detail.level === skillLevel) ?? effect.details?.[0] ?? null
      })),
      categories: {
        score: scoreUpBasic > 0,
        life: lifeRecovery > 0,
        judge: judgeSupport > 0,
        characterRank: scoreUpCharacterRank > 0,
        sameUnit: scoreUpSameUnit > 0,
        differentUnit: scoreUpDifferentUnit > 0,
        reference: scoreUpReferenceRate > 0 || scoreUpReferenceMax > 0,
        referenceLimited
      },
      values: {
        scoreUpBasic,
        scoreUpCharacterRank,
        scoreUpSameUnit,
        scoreUpDifferentUnit,
        scoreUpReferenceRate,
        scoreUpReferenceMax,
        scoreUpFixed,
        scoreUpToReference,
        lifeRecovery,
        judgeSupport
      },
      referenceShape: "Moesekai CardSkillCalculator fillSkill: fixed score, same-unit, reference, different-unit, life recovery, and scoreUpLimit"
    }
  };
}

function scoreUpLimitForCard(card: Card, context?: FormulaMasterContext) {
  if (!context?.eventSkillScoreUpLimits.length) return { limit: Number.MAX_SAFE_INTEGER, matchedRow: undefined, matchReason: "eventSkillScoreUpLimits unavailable", estimated: true };
  const characterId = cardCharacterId(card);
  const matched = context.eventSkillScoreUpLimits.find((item) => {
    const raw = rawRecord(item);
    const cardId = rawString(raw.cardId ?? raw.targetCardId);
    const skillId = rawString(raw.skillId ?? raw.targetSkillId);
    const gameCharacterId = rawString(raw.gameCharacterId ?? raw.characterId ?? raw.targetGameCharacterId);
    const unit = rawString(raw.unit ?? raw.supportUnit ?? raw.gameCharacterUnit);
    return (cardId && cardId === card.id) ||
      (skillId && skillId === card.skillId) ||
      (gameCharacterId && gameCharacterId === characterId) ||
      (unit && card.supportUnit && unit === card.supportUnit);
  });
  const raw = rawRecord(matched);
  const limit = firstFinite(raw, ["scoreUpLimit", "skillScoreUpLimit", "maxScoreUp", "limitValue", "value"]) ?? Number.MAX_SAFE_INTEGER;
  return {
    limit,
    matchedRow: matched?.raw,
    matchReason: matched ? "matched by card/skill/character/unit field" : "no structured eventSkillScoreUpLimits match",
    estimated: !matched
  };
}

export function eventCardBonus(card: Card, config?: EventBonusConfigLike) {
  if (!config) return 0;
  const eventCard = config.eventCards.find((item) => String(rawRecord(item).cardId) === card.id);
  return rawNumber(rawRecord(eventCard).bonusRate, 0);
}

export function deckBonus(card: Card, config?: EventBonusConfigLike) {
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
      const unitCharacterMatches = String(unitRaw.gameCharacterId ?? unitRaw.characterId ?? "") === characterId;
      characterMatches = unitCharacterMatches && (
        Number(characterId) < 21 ||
        card.supportUnit === "none" ||
        card.supportUnit === String(unitRaw.unit ?? "")
      );
    }
    if (attrMatches && characterMatches) best = Math.max(best, bonusRate);
  }
  return best;
}

export function rarityBonus(card: Card, owned?: UserCardState, config?: EventBonusConfigLike) {
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

function playerHonorIds(playerAssets?: Record<string, unknown>) {
  const honors = playerAssets?.honors;
  if (!Array.isArray(honors)) return undefined;
  return new Set(honors.map((item) => dataString(item, ["honorId", "id"])).filter((item): item is string => Boolean(item)));
}

export function leaderBonus(card: Card, config?: EventBonusConfigLike, playerAssets?: Record<string, unknown>) {
  if (!config) return { bonus: 0, trace: { status: "missing-data", missingFields: ["event config"] } };
  const eventCard = config.eventCards.find((item) => String(rawRecord(item).cardId) === card.id);
  const cardLeaderBonus = rawNumber(rawRecord(eventCard).leaderBonusRate, 0);
  const characterId = cardCharacterId(card);
  const rows = (config.eventHonorBonuses ?? []).filter((item) => {
    const raw = rawRecord(item);
    return String(raw.eventId ?? "") === config.eventId &&
      String(raw.leaderGameCharacterId ?? raw.gameCharacterId ?? "") === characterId;
  });
  const ownedHonorIds = playerHonorIds(playerAssets);
  const matchedRows = ownedHonorIds
    ? rows.filter((item) => ownedHonorIds.has(String(rawRecord(item).honorId ?? "")))
    : [];
  const ownedHonorBonus = matchedRows.reduce((sum, item) => sum + rawNumber(rawRecord(item).bonusRate, 0), 0);
  const requiresHonorOwnership = rows.length > 0;
  const missingFields = [
    config.worldBloomType === "finale" && !(config.eventHonorBonuses ?? []).length ? "eventHonorBonuses" : undefined,
    requiresHonorOwnership && !ownedHonorIds ? "uploaded honors" : undefined
  ].filter((item): item is string => Boolean(item));
  return {
    bonus: cardLeaderBonus + ownedHonorBonus,
    trace: {
      referenceFormulaId: "Moesekai.CardEventCalculator.getCardLeaderBonus",
      status: missingFields.length ? "missing-data" : "matched",
      eventId: config.eventId,
      leaderGameCharacterId: characterId,
      cardLeaderBonus,
      ownedHonorBonus,
      matchedHonors: matchedRows.map((item) => rawRecord(item)),
      candidateHonorRows: rows.length,
      ownedHonorCount: ownedHonorIds?.size,
      missingFields
    }
  };
}

export function buildCardContributionBreakdown(input: {
  card: Card;
  owned?: UserCardState;
  playerAssets?: Record<string, unknown>;
  eventConfig?: EventBonusConfigLike;
  masterContext?: FormulaMasterContext;
  target?: "event" | "power" | "skill";
}) {
  const powerBreakdown = buildCardPowerBreakdown(input.card, input.owned, input.playerAssets, input.masterContext);
  const directEventBonus = eventCardBonus(input.card, input.eventConfig);
  const matchedDeckBonus = deckBonus(input.card, input.eventConfig);
  const masterRankBonus = rarityBonus(input.card, input.owned, input.eventConfig);
  const leader = leaderBonus(input.card, input.eventConfig, input.playerAssets);
  const eventBonusDetail = {
    fixedBonus: matchedDeckBonus + masterRankBonus,
    cardBonus: directEventBonus,
    leaderBonus: leader.bonus,
    cardBonusCountLimit: input.eventConfig?.cardBonusCountLimit
  };
  const eventBonusPercent = eventBonusDetail.fixedBonus + eventBonusDetail.cardBonus + eventBonusDetail.leaderBonus;
  const limitTrace = scoreUpLimitForCard(input.card, input.masterContext);
  const detail = skillDetail(input.card, input.owned, limitTrace.limit);
  const cardSkillScore = detail.scoreUpFixed + Math.floor(detail.scoreUpReferenceMax / 2) + Math.floor(detail.lifeRecovery / 5) + Math.floor(detail.judgeSupport / 8);
  const target = input.target ?? "event";
  const contributionScore = target === "power"
    ? powerBreakdown.estimatedPower
    : target === "skill"
      ? cardSkillScore * 10 + powerBreakdown.estimatedPower / 25
      : eventBonusPercent * 1000 + powerBreakdown.estimatedPower / 12 + cardSkillScore;
  const modeSpecificBreakdown: Record<string, unknown> = {
    normal: {
      fixedBonus: eventBonusDetail.fixedBonus,
      cardBonus: eventBonusDetail.cardBonus,
      deckBonus: matchedDeckBonus,
      masterRankBonus
    },
    challenge: {
      ignoresDeckBonusForEventPoint: true,
      requiresCharacterFilteredDeck: true
    },
    worldBloom: {
      supportDeckRequired: true,
      differentAttributeBonusRequired: true,
      supportDeckCountByTurn: { turn1: 12, turn2: 20, turn3: 25 }
    },
    wl3: {
      cardBonusCountLimit: input.eventConfig?.cardBonusCountLimit ?? 5,
      leaderBonusRequiresEventHonorBonuses: true
    }
  };
  return {
    basePower: powerBreakdown.rarityBasePower + powerBreakdown.levelBonus,
    powerBreakdown,
    eventBonusPercent,
    eventBonusDetail,
    directEventBonus,
    deckBonus: matchedDeckBonus,
    masterRankBonus,
    skillScore: cardSkillScore,
    skillDetail: detail,
    contributionScore,
    modeSpecificBreakdown,
    cardParameterTrace: powerBreakdown.cardParameterTrace,
    skillEffectTrace: detail.skillEffectTrace,
    skillFormulaTrace: {
      formulaVersion: sharedFormulaVersion,
      skillId: input.card.skill?.id,
      categories: detail.skillEffectTrace.categories,
      values: detail.skillEffectTrace.values,
      selectedDetails: detail.skillEffectTrace.selectedDetails,
      referenceSource: "Moesekai card-information/card-skill-calculator.ts"
    },
    limitTrace: {
      source: "eventSkillScoreUpLimits",
      applied: detail.appliedLimit,
      scoreUpLimit: detail.scoreUpLimit,
      matchedRow: limitTrace.matchedRow,
      matchReason: limitTrace.matchReason,
      estimated: limitTrace.estimated
    },
    leaderHonorTrace: leader.trace,
    fieldSources: {
      power: "shared normal-event card power estimate",
      directEventBonus: directEventBonus ? "eventCards" : "eventCards or no match",
      deckBonus: matchedDeckBonus ? "eventDeckBonuses/gameCharacterUnits" : "eventDeckBonuses or no match",
      masterRankBonus: input.eventConfig?.eventRarityBonusRates.length ? "eventRarityBonusRates" : "local rarity fallback",
      skill: input.card.skill ? "card skill master" : "skill unavailable"
    }
  } satisfies CardContributionBreakdown;
}

function liveMultiplier(liveType?: LiveType) {
  if (liveType === "auto") return 0.7;
  if (liveType === "multi" || liveType === "cheerful") return 1.08;
  if (liveType === "challenge") return 1;
  return 1;
}

function boostMultiplier(boost?: number) {
  return 1 + Math.max(0, boost ?? 0) * 0.5;
}

export function calculateReferenceEventPoint(input: {
  liveType?: LiveType;
  eventType?: string;
  selfScore: number;
  musicRate: number;
  deckBonus: number;
  supportDeckBonus?: number;
  boostRate: number;
  otherScore?: number;
  life?: number;
}) {
  const liveType = input.liveType ?? "solo";
  const musicRate = Math.max(0, input.musicRate) / 100;
  const deckBonus = Math.max(0, input.deckBonus) + Math.max(0, input.supportDeckBonus ?? 0);
  const deckRate = 1 + deckBonus / 100;
  const otherScore = input.otherScore && input.otherScore > 0 ? input.otherScore : 4 * input.selfScore;
  const lifeRate = 1.15 + Math.min(Math.max((input.life ?? 1000) / 5000, 0.1), 0.2);
  const common = {
    selfScore: input.selfScore,
    otherScore,
    musicRate: input.musicRate,
    deckBonus: input.deckBonus,
    supportDeckBonus: input.supportDeckBonus ?? 0,
    combinedDeckBonus: deckBonus,
    boostRate: input.boostRate,
    lifeRate,
    exactness: input.musicRate > 0 ? "reference-formula" : "estimated-missing-music-rate"
  };
  if (liveType === "challenge") {
    const baseScore = 100 + Math.floor(input.selfScore / 20000);
    return {
      ...common,
      baseScore,
      estimatedPt: baseScore * 120,
      referenceFormulaId: "Moesekai.EventCalculator.challenge",
      referenceFormula: "Challenge: (100 + floor(selfScore / 20000)) * 120; musicRate/deckBonus/boostRate are diagnostics only",
      ignoredMultipliers: ["musicRate", "deckBonus", "supportDeckBonus", "boostRate"]
    };
  }
  if (liveType === "multi" || liveType === "cheerful") {
    const baseScore = 110 + Math.floor(input.selfScore / 17000) + Math.min(13, Math.floor(otherScore / 340000));
    const beforeLife = Math.floor(baseScore * musicRate * deckRate);
    return {
      ...common,
      baseScore,
      otherScore,
      lifeRate: liveType === "cheerful" ? lifeRate : undefined,
      estimatedPt: Math.floor((liveType === "cheerful" ? Math.floor(beforeLife * lifeRate) : beforeLife) * input.boostRate),
      referenceFormulaId: liveType === "cheerful" ? "Moesekai.EventCalculator.cheerful" : "Moesekai.EventCalculator.multi",
      referenceFormula: "Multi/Cheerful: 110 + floor(selfScore / 17000) + min(13, floor(otherScore / 340000)), then music/deck/life/boost"
    };
  }
  const baseScore = 100 + Math.floor(input.selfScore / 20000);
  return {
    ...common,
    baseScore,
    estimatedPt: Math.floor(Math.floor(baseScore * musicRate * deckRate) * input.boostRate),
    referenceFormulaId: "Moesekai.EventCalculator.solo",
    referenceFormula: "Solo/Auto: floor((100 + floor(selfScore / 20000)) * musicRate * deckRate) * boost"
  };
}

export async function estimateNormalEventPoint(input: EventPointEstimateInput) {
  const song = input.musicId ? await getSongDetail(input.region, input.musicId) : null;
  const difficulty = song?.difficultyDetails?.find((item) => item.difficulty.toLowerCase() === input.difficulty?.toLowerCase());
  const musicMetaResult = await getMusicMeta(input.musicId, input.difficulty);
  const formulaContext = await buildNormalEventFormulaContext({
    region: input.region,
    eventId: input.eventId,
    musicId: input.musicId,
    difficulty: input.difficulty,
    liveType: input.liveType,
    inventory: input.inventory,
    playerAssets: input.playerAssets,
    calculationMode: input.calculationMode,
    specialCharacterId: input.specialCharacterId,
    gameCharacterId: input.gameCharacterId,
    worldBloomSupportUnit: input.worldBloomSupportUnit,
    worldBloomEventTurn: input.worldBloomEventTurn
  });
  const baseScore = input.baseScore ?? 1000000;
  const live = liveMultiplier(input.liveType);
  const boost = boostMultiplier(input.boost);
  const event = 1 + Math.max(0, input.eventBonusPercent ?? 0) / 100;
  const musicRate = musicMetaResult.meta?.eventRate ?? 0;
  const difficultyMultiplier = musicRate / 100;
  const supportDeckBonus = rawNumber((input.playerAssets?.["world-bloom-support"] as Record<string, unknown> | undefined)?.supportDeckBonus ?? (input.playerAssets?.["world-bloom-support"] as Record<string, unknown> | undefined)?.bonusRate, 0);
  const multiLive = (input.liveType === "multi" || input.liveType === "cheerful") && musicMetaResult.meta && input.selfEffectiveness != null
    ? calculateMultiLive({
        players: [
          { power: baseScore, effectiveness: input.selfEffectiveness, label: "self" },
          ...((input.teammates?.length === 4 ? input.teammates : Array.from({ length: 4 }, () => ({ power: 200_000, effectiveness: 200, label: "assumed teammate" }))))
        ] as [MultiLivePlayer, MultiLivePlayer, MultiLivePlayer, MultiLivePlayer, MultiLivePlayer],
        musicMeta: musicMetaResult.meta,
        skill15Strategy: input.skill15Strategy,
        skill6Mode: input.skill6Mode
      })
    : null;
  const selfScore = multiLive?.selfScore ?? baseScore;
  const referencePoint = calculateReferenceEventPoint({
    liveType: input.liveType,
    selfScore,
    otherScore: multiLive?.otherScore,
    musicRate,
    deckBonus: input.eventBonusPercent ?? 0,
    supportDeckBonus,
    boostRate: boost
  });
  const estimatedPt = Math.max(0, referencePoint.estimatedPt);
  const remainingPt = input.targetPt == null ? null : Math.max(0, input.targetPt - (input.currentPt ?? 0));
  const missingFields = new Set(formulaContext.missingFields);
  if (!song) missingFields.add("music master detail");
  if (!difficulty) missingFields.add("music difficulty detail");
  if (!musicMetaResult.meta) musicMetaResult.sourceHealth.missingFields.forEach((field) => missingFields.add(field));
  if (!input.baseScore) missingFields.add("selfScore/baseScore input");
  return {
    song,
    difficulty,
    input: {
      region: input.region,
      eventId: input.eventId,
      musicId: input.musicId,
      difficulty: input.difficulty,
      liveType: input.liveType ?? "solo",
      boost: input.boost ?? 0,
      eventBonusPercent: input.eventBonusPercent ?? 0,
      supportDeckBonus,
      baseScore
    },
    multipliers: {
      liveMultiplier: live,
      boostMultiplier: boost,
      eventMultiplier: event,
      supportDeckBonus,
      difficultyMultiplier
    },
    eventPointBreakdown: {
      ...referencePoint,
      baseScore: selfScore,
      selfScore,
      liveMultiplier: live,
      boostMultiplier: boost,
      eventMultiplier: event,
      musicRate,
      deckBonus: input.eventBonusPercent ?? 0,
      supportDeckBonus,
      difficultyMultiplier,
      referenceBaseScore: referencePoint.baseScore,
      estimatedPt,
      exactness: referencePoint.exactness,
      referenceFormulaId: referencePoint.referenceFormulaId,
      referenceFormula: referencePoint.referenceFormula,
      source: "shared normal-event-v4.1-reference event point core"
    },
    multiLiveTrace: multiLive,
    musicMetaTrace: musicMetaResult.sourceHealth,
    formulaContext,
    assetReadiness: formulaContext.assetReadiness,
    sharedFormulaVersion,
    formulaVersion: sharedFormulaVersion,
    referenceSources: formulaContext.referenceSources,
    referenceParity: formulaContext.referenceParity,
    calculationTrace: [
      "EventCalculator.getEventPoint reference shape is applied by live type",
      "musicRate uses Moesekai musicMeta.event_rate; calculation remains missing-data when the exact row is unavailable",
      "Deck bonus is consumed as eventBonusPercent; supportDeckBonus is added for Bloom/WL when uploaded"
    ],
    modeSpecificBreakdown: {
      [formulaContext.mode]: referencePoint,
      challenge: formulaContext.mode === "challenge" ? referencePoint : { missingFields: ["uploaded challenge-live deck", "verified challenge score"] },
      worldBloom: ["world_bloom", "wl", "wl3"].includes(formulaContext.mode) ? { supportDeckRequired: true } : undefined
    },
    estimatedPt,
    remainingPt,
    estimatedRunsToTarget: remainingPt == null ? null : Math.ceil(remainingPt / Math.max(estimatedPt, 1)),
    officialFieldsUsed: [
      ...formulaContext.officialFieldsUsed,
      song ? "music master" : undefined,
      difficulty ? "music difficulty" : undefined
    ].filter((item): item is string => Boolean(item)),
    estimatedFieldsUsed: uniqueStrings([
      formulaContext.estimatedFieldsUsed,
      musicMetaResult.meta ? undefined : "musicMeta.event_rate unavailable",
      input.baseScore == null ? "deck score to selfScore mapping unless supplied as baseScore" : undefined,
      (input.liveType === "multi" || input.liveType === "cheerful") && input.teammates?.length !== 4 ? "default teammate power/effectiveness assumption" : undefined
    ]),
    missingFields: [...missingFields],
    warnings: [...formulaContext.warnings],
    sources: {
      baseScore: input.baseScore == null ? "default estimate" : "user input",
      eventBonusPercent: input.eventBonusPercent == null ? "not provided" : "user input",
      music: song ? "real master" : "unavailable"
    },
    formulaSources: formulaContext.formulaSources,
    realDataRequired: true
  };
}

export async function loadAreaItemFormulaSource(region: RegionId) {
  const areaItemLevels = await getMasterCollection(region, "areaItemLevels");
  return {
    areaItemLevels,
    sourceMetadata: areaItemLevels.sourceMetadata ?? { primaryUrl: areaItemLevels.source, sourceProject: "Team-Haruki master", fetchedAt: areaItemLevels.syncedAt }
  };
}
