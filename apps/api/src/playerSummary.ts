import type { RegionId } from "./config.js";
import { getCardAssetDetail } from "./assets.js";
import { getExternalContext } from "./externalData.js";
import { getCards, getMasterCollection, getSongs } from "./masterData.js";
import { store, toPublicUser } from "./store.js";
import type { PlayerBinding, PlayerDataKind, PlayerDataRecord, UserCardInventoryItem } from "./types.js";

export const playerDataKinds: PlayerDataKind[] = [
  "area-items",
  "character-ranks",
  "music-results",
  "materials",
  "challenge-live",
  "world-bloom-support",
  "honors",
  "profile-honors",
  "decks",
  "mysekai-canvas",
  "mysekai-gates",
  "mysekai-fixtures"
];

const playerDataKindSet = new Set<PlayerDataKind>(playerDataKinds);

export const suiteUserDataKeys = [
  "userCards",
  "userBonds",
  "userDecks",
  "userGamedata",
  "userMusics",
  "userMusicResults",
  "userMysekaiMaterials",
  "userAreas",
  "userChallengeLiveSoloDecks",
  "userCharacters",
  "userCharacterMissionV2Statuses",
  "userMysekaiCanvases",
  "userCharacterMissionV2s",
  "userMysekaiFixtureGameCharacterPerformanceBonuses",
  "userMysekaiGates",
  "userWorldBloomSupportDecks",
  "userHonors",
  "userMysekaiCharacterTalks",
  "userChallengeLiveSoloResults",
  "userChallengeLiveSoloStages",
  "userChallengeLiveSoloHighScoreRewards",
  "userEvents",
  "userWorldBlooms",
  "userMusicAchievements",
  "userPlayerFrames",
  "userMaterials",
  "upload_time"
] as const;

export function isPlayerDataKind(value: string): value is PlayerDataKind {
  return playerDataKindSet.has(value as PlayerDataKind);
}

function dataByKind(records: PlayerDataRecord[]) {
  return Object.fromEntries(records.map((record) => [record.kind, record]));
}

function hasData(record?: PlayerDataRecord | null) {
  if (!record) return false;
  if (Array.isArray(record.data)) return record.data.length > 0;
  if (record.data && typeof record.data === "object") return Object.keys(record.data as Record<string, unknown>).length > 0;
  return record.data != null;
}

function completenessSection(required: PlayerDataKind[], records: Record<string, PlayerDataRecord>, extraMissing: string[] = []) {
  const missingKinds = required.filter((kind) => !hasData(records[kind]));
  return {
    ready: missingKinds.length === 0 && extraMissing.length === 0,
    requiredKinds: required,
    uploadedKinds: required.filter((kind) => hasData(records[kind])),
    missingFields: [...missingKinds.map((kind) => `Missing uploaded ${kind}`), ...extraMissing]
  };
}

export async function buildBindingCompleteness(
  binding: PlayerBinding,
  inventory: UserCardInventoryItem[],
  playerData: PlayerDataRecord[]
) {
  const records = dataByKind(playerData);
  const uploadedWorldBloomSupport = hasData(records["world-bloom-support"]);
  const recommendableWorldBloomSupport = inventory.length >= 5;
  return {
    bindingId: binding.id,
    region: binding.region,
    uploadedPlayerDataKinds: playerData.map((item) => item.kind),
    ownedCards: inventory.length,
    sections: {
      profile: completenessSection(["honors", "profile-honors"], records, binding.publicProfileSnapshot ? [] : ["public profile snapshot"]),
      deckRecommend: completenessSection(["area-items", "character-ranks"], records, inventory.length >= 5 ? [] : ["At least 5 owned cards are required"]),
      eventPoint: completenessSection(["music-results"], records),
      challengeLive: completenessSection(["challenge-live"], records),
      worldBloom: {
        ready: uploadedWorldBloomSupport || recommendableWorldBloomSupport,
        requiredKinds: ["world-bloom-support"],
        uploadedKinds: uploadedWorldBloomSupport ? ["world-bloom-support"] : [],
        missingFields: uploadedWorldBloomSupport || recommendableWorldBloomSupport ? [] : ["At least 5 owned cards are required to recommend World Bloom support deck"],
        uploadedSupportReady: uploadedWorldBloomSupport,
        recommendableFromInventory: recommendableWorldBloomSupport,
        note: uploadedWorldBloomSupport
          ? "Using uploaded World Bloom support deck"
          : "World Bloom support deck can be recommended from inventory when eventId and gameCharacterId are provided"
      },
      mysekai: completenessSection(["mysekai-canvas", "mysekai-gates", "mysekai-fixtures"], records)
    },
    realDataRequired: true
  };
}

export async function buildBindingSummary(userId: string, bindingId: string) {
  const binding = (await store.listPlayerBindings(userId)).find((item) => item.id === bindingId);
  if (!binding) return null;
  const [inventory, playerData, deckConfigs, scores, favorites] = await Promise.all([
    store.listInventory(userId, binding.id),
    store.listPlayerData(userId, binding.id),
    store.listDeckConfigs(userId),
    store.listScores(userId),
    store.listFavorites(userId)
  ]);
  const completeness = await buildBindingCompleteness(binding, inventory, playerData);
  return {
    binding,
    publicProfileSnapshot: binding.publicProfileSnapshot ?? null,
    inventoryCount: inventory.length,
    playerData,
    playerDataByKind: dataByKind(playerData),
    deckConfigs: deckConfigs.filter((item) => item.bindingId === binding.id),
    scores: scores.filter((item) => item.region === binding.region),
    favorites: favorites.filter((item) => item.region === binding.region),
    completeness,
    realDataRequired: true
  };
}

export async function buildMeProfile(userId: string) {
  const user = await store.getUser(userId);
  if (!user) return null;
  const [oauthAccounts, bindings, favorites, scores, deckConfigs] = await Promise.all([
    store.listOAuthAccounts(userId),
    store.listPlayerBindings(userId),
    store.listFavorites(userId),
    store.listScores(userId),
    store.listDeckConfigs(userId)
  ]);
  const bindingSummaries = await Promise.all(bindings.map((binding) => buildBindingSummary(userId, binding.id)));
  return {
    user: toPublicUser(user),
    oauthAccounts,
    bindings,
    bindingSummaries: bindingSummaries.filter(Boolean),
    favorites,
    scores,
    deckConfigs,
    realDataRequired: true
  };
}

function asArray(data: unknown) {
  return Array.isArray(data) ? data : [];
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

function valueString(data: unknown, keys: string[]) {
  const record = asRecord(data);
  for (const key of keys) {
    if (record[key] != null && String(record[key]).trim()) return String(record[key]);
  }
  return undefined;
}

function valueNumber(data: unknown, keys: string[]) {
  const value = valueString(data, keys);
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function rawId(item: unknown, keys: string[]) {
  if (!item || typeof item !== "object") return undefined;
  const raw = item as Record<string, unknown>;
  for (const key of keys) {
    if (raw[key] != null) return String(raw[key]);
  }
  return undefined;
}

type LookupResult = {
  field: string;
  id?: string;
  matched: boolean;
  label?: string;
  meta?: Record<string, unknown>;
  warning?: string;
};

const fieldHelpByKind: Record<PlayerDataKind | "cards", Array<{ field: string; label: string; help: string; reference: string }>> = {
  "cards": [
    { field: "cardId", label: "卡牌 ID", help: "对应真实 master cards.id。", reference: "Sekai Viewer SekaiUserCardList/CardThumb" },
    { field: "level", label: "等级", help: "影响卡牌综合力估算。", reference: "Moesekai user-card" },
    { field: "masterRank", label: "Master Rank", help: "影响综合力、活动稀有度加成和部分支援加成。", reference: "Moesekai user-card" },
    { field: "skillLevel", label: "技能等级", help: "影响技能收益和高分组卡。", reference: "Moesekai user-card" },
    { field: "specialTrainingStatus", label: "特训状态", help: "建议使用 done/not_done。", reference: "Moesekai user-card" },
    { field: "episodes", label: "剧情阅读明细", help: "保留 cardEpisodeId、scenarioStatus、scenarioStatusReasons、isNotSkipped；旧 episodesRead 仅作兼容估算。", reference: "Moesekai user-card" }
  ],
  "area-items": [
    { field: "areaItemId", label: "区域道具 ID", help: "对应 areaItemLevels 中的 areaItemId/id。", reference: "Moesekai user-area" },
    { field: "level", label: "等级", help: "影响 deck-recommend、event-point 和 area-item-recommend。", reference: "Moesekai user-area" }
  ],
  "character-ranks": [
    { field: "characterId", label: "角色 ID", help: "对应 gameCharacterId/characterId。", reference: "Moesekai user-character" },
    { field: "rank", label: "Rank", help: "影响卡牌综合力和 MySekai 估算。", reference: "Moesekai user-character" }
  ],
  "music-results": [
    { field: "musicId", label: "歌曲 ID", help: "对应 musics.id。", reference: "Moesekai music-recommend user data" },
    { field: "difficulty", label: "难度", help: "用于个性化推荐难度。", reference: "Moesekai music-recommend" },
    { field: "clearStatus", label: "通关状态", help: "可填 clear/fc/ap/not_clear。", reference: "Moesekai user data" },
    { field: "score", label: "分数", help: "作为歌曲推荐和控分上下文。", reference: "Moesekai user data" }
  ],
  "materials": [
    { field: "materialId", label: "素材 ID", help: "只作为升级建议上下文，不自动推断可升级项。", reference: "Moesekai area-item-recommend" },
    { field: "quantity", label: "数量", help: "可选素材持有量。", reference: "Moesekai area-item-recommend" }
  ],
  "honors": [
    { field: "honorId", label: "称号 ID", help: "对应 honors.id。", reference: "Moesekai user-honor" },
    { field: "level", label: "等级", help: "用于资料与后续 honor bonus 识别。", reference: "Moesekai user-honor" }
  ],
  "profile-honors": [
    { field: "slot", label: "槽位", help: "资料页展示槽位。", reference: "Moesekai user-profile-honor" },
    { field: "honorId", label: "称号 ID", help: "对应 honors.id。", reference: "Moesekai user-profile-honor" }
  ],
  "decks": [
    { field: "cardIds", label: "卡牌 ID 列表", help: "保存手动卡组或参考卡组。", reference: "Moesekai user-deck" }
  ],
  "challenge-live": [
    { field: "characterId", label: "目标角色 ID", help: "Challenge Live 会先按角色过滤库存。", reference: "Moesekai user-challenge-live-solo-deck" },
    { field: "cardIds", label: "卡牌 ID 列表", help: "用于标记已保存的 Challenge 卡组。", reference: "Moesekai user-challenge-live-solo-deck" }
  ],
  "world-bloom-support": [
    { field: "eventId", label: "活动 ID", help: "用于匹配 World Bloom/WL 活动上下文。", reference: "Moesekai user-world-bloom-support-deck" },
    { field: "gameCharacterId", label: "角色 ID", help: "用于支援卡组角色 bonus。", reference: "Moesekai user-world-bloom-support-deck" },
    { field: "supportUnit", label: "支援 unit", help: "用于 unit-limited 支援加成。", reference: "Moesekai user-world-bloom-support-deck" },
    { field: "cardIds", label: "支援卡 ID", help: "按 turn 限制取支援卡。", reference: "Moesekai user-world-bloom-support-deck" }
  ],
  "mysekai-canvas": [
    { field: "cardId", label: "卡牌 ID", help: "canvas 以卡牌命中为主。", reference: "Moesekai user-mysekai-canvas" },
    { field: "powerBonusRate", label: "加成率", help: "可选，缺失时使用 master/默认推导。", reference: "Moesekai mysekai-service" }
  ],
  "mysekai-gates": [
    { field: "gateId", label: "大门 ID", help: "对应 mysekaiGates。", reference: "Moesekai user-mysekai-gate" },
    { field: "unit", label: "单位", help: "用于匹配 gate level bonus。", reference: "Moesekai mysekai-service" },
    { field: "level", label: "等级", help: "对应 mysekaiGateLevels。", reference: "Moesekai user-mysekai-gate" }
  ],
  "mysekai-fixtures": [
    { field: "fixtureId", label: "家具 ID", help: "对应 mysekaiFixtureInfos。", reference: "Moesekai user-mysekai-fixture-game-character-performance-bonus" },
    { field: "characterId", label: "角色 ID", help: "用于 fixture character performance bonus。", reference: "Moesekai mysekai-service" },
    { field: "totalBonusRate", label: "总加成率", help: "会受 fixture limit 截断。", reference: "Moesekai mysekai-service" }
  ]
};
function toolImpactForKind(kind: PlayerDataKind | "cards") {
  const map: Record<PlayerDataKind | "cards", string[]> = {
    cards: ["deck-recommend", "event-point-calc", "score-control", "music-recommend", "area-item-recommend", "normal-event-plan", "mysekai-calc"],
    "area-items": ["deck-recommend", "event-point-calc", "score-control", "area-item-recommend", "normal-event-plan", "mysekai-calc"],
    "character-ranks": ["deck-recommend", "event-point-calc", "normal-event-plan", "mysekai-calc"],
    "music-results": ["music-recommend", "score-control", "normal-event-plan"],
    materials: ["area-item-recommend"],
    honors: ["profile", "World Bloom/WL leader honor trace"],
    "profile-honors": ["profile"],
    decks: ["deck-recommend"],
    "challenge-live": ["Challenge Live deck recommend", "modeSpecificBreakdown.challenge"],
    "world-bloom-support": ["World Bloom/WL support deck", "modeSpecificBreakdown.worldBloom/wl/wl3"],
    "mysekai-canvas": ["mysekai-calc", "mysekai-v5 exact CardCalculator GA search"],
    "mysekai-gates": ["mysekai-calc", "mysekai-v5 exact CardCalculator GA search"],
    "mysekai-fixtures": ["mysekai-calc", "mysekai-v5 exact CardCalculator GA search"]
  };
  return map[kind];
}

function normalizedArrayPreview(data: unknown) {
  return asArray(data).slice(0, 20);
}

function normalizeSpecialTrainingStatus(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  if (["done", "special_training", "after_training", "trained", "true", "1"].includes(text)) return "done";
  if (["not_doing", "not_done", "original", "false", "0"].includes(text)) return "not_doing";
  return "unknown";
}

function normalizeDefaultImage(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  return text === "after_training" || text === "special_training" || text === "trained" ? "after_training" : "original";
}

function normalizeSuiteCard(card: unknown) {
  const cardId = valueString(card, ["cardId", "id"]);
  if (!cardId) return null;
  const episodes = asArray(asRecord(card).episodes);
  const episodesRead = episodes.length
    ? episodes.some((episode) => {
        const record = asRecord(episode);
        const status = String(record.scenarioStatus ?? "").toLowerCase();
        return record.isNotSkipped === true || status.includes("read") || status.includes("done") || status.includes("already");
      })
    : undefined;
  const normalizedEpisodes = episodes.map((episode) => {
    const record = asRecord(episode);
    const cardEpisodeId = valueString(record, ["cardEpisodeId", "id"]);
    if (!cardEpisodeId) return null;
    return {
      cardEpisodeId,
      scenarioStatus: String(record.scenarioStatus ?? ""),
      scenarioStatusReasons: asArray(record.scenarioStatusReasons).map(String),
      isNotSkipped: record.isNotSkipped === true
    };
  }).filter((episode): episode is NonNullable<typeof episode> => Boolean(episode));
  return {
    cardId,
    level: valueNumber(card, ["level", "cardLevel"]) ?? 1,
    masterRank: valueNumber(card, ["masterRank"]) ?? 0,
    skillLevel: valueNumber(card, ["skillLevel"]) ?? 1,
    specialTrainingStatus: normalizeSpecialTrainingStatus(asRecord(card).specialTrainingStatus),
    defaultImage: normalizeDefaultImage(asRecord(card).defaultImage),
    episodes: normalizedEpisodes,
    episodesRead
  };
}

function deckCardIds(deck: unknown, max = 25) {
  const record = asRecord(deck);
  const ids: string[] = [];
  for (let index = 1; index <= max; index += 1) {
    const value = record[`member${index}`];
    if (value != null) ids.push(String(value));
  }
  return ids.filter((id) => id && id !== "0" && id !== "null");
}

function normalizeSuiteChallenge(payload: Record<string, unknown>) {
  const decks = asArray(payload.userChallengeLiveSoloDecks);
  const results = asArray(payload.userChallengeLiveSoloResults);
  const bestResult = [...results].sort((a, b) =>
    (valueNumber(b, ["highScore", "score"]) ?? 0) - (valueNumber(a, ["highScore", "score"]) ?? 0)
  )[0];
  const firstDeck = decks[0];
  const characterId = valueString(firstDeck, ["characterId", "gameCharacterId"]) ?? valueString(bestResult, ["characterId", "gameCharacterId"]);
  const deckRecord = asRecord(firstDeck);
  const cardIds = ["leader", "support1", "support2", "support3", "support4"]
    .map((key) => deckRecord[key])
    .filter((value) => value != null && String(value) !== "0")
    .map(String);
  return {
    characterId,
    cardIds,
    highScore: valueNumber(bestResult, ["highScore", "score"]),
    deckCount: decks.length,
    resultCount: results.length,
    stageCount: asArray(payload.userChallengeLiveSoloStages).length,
    highScoreRewardCount: asArray(payload.userChallengeLiveSoloHighScoreRewards).length,
    source: "Haruki Suite userChallengeLiveSolo*",
    unavailableReason: cardIds.length ? undefined : "Suite payload did not include userChallengeLiveSoloDecks; retained results/stages/rewards for diagnostics"
  };
}

function normalizeSuiteWorldBloom(payload: Record<string, unknown>) {
  const rows = asArray(payload.userWorldBloomSupportDecks);
  return rows.map((row) => {
    const record = asRecord(row);
    return {
      eventId: valueString(row, ["eventId"]),
      gameCharacterId: valueString(row, ["gameCharacterId", "characterId"]),
      cardIds: deckCardIds(record, 25)
    };
  });
}

export function normalizeSuitePlayerDataImport(region: RegionId, source: Record<string, unknown>) {
  const cards = asArray(source.userCards).map(normalizeSuiteCard).filter((card): card is NonNullable<ReturnType<typeof normalizeSuiteCard>> => Boolean(card));
  const areaItems = asArray(source.userAreas).flatMap((area) => asArray(asRecord(area).areaItems).map((item) => ({
    areaId: valueString(area, ["areaId"]),
    areaItemId: valueString(item, ["areaItemId", "id"]),
    level: valueNumber(item, ["level"]) ?? 0
  })).filter((item) => item.areaItemId));
  const characterRanks = asArray(source.userCharacters).map((item) => ({
    characterId: valueString(item, ["characterId", "gameCharacterId", "id"]),
    rank: valueNumber(item, ["characterRank", "rank"]) ?? 0
  })).filter((item) => item.characterId);
  const musicResults = [...asArray(source.userMusicResults), ...asArray(source.userMusicAchievements), ...asArray(source.userMusics)].map((item) => ({
    musicId: valueString(item, ["musicId", "music_id", "id"]),
    difficulty: valueString(item, ["difficulty", "musicDifficulty"]),
    clearStatus: valueString(item, ["clearStatus", "playResult", "fullComboStatus"]) ?? "clear",
    score: valueNumber(item, ["score", "highScore", "mvpScore"])
  })).filter((item) => item.musicId);
  const materials = [...asArray(source.userMaterials), ...asArray(source.userMysekaiMaterials)].map((item) => ({
    materialId: valueString(item, ["materialId", "mysekaiMaterialId", "id"]),
    quantity: valueNumber(item, ["quantity", "count", "amount"]) ?? 0,
    source: asArray(source.userMysekaiMaterials).includes(item) ? "userMysekaiMaterials" : "userMaterials"
  })).filter((item) => item.materialId);
  const decks = asArray(source.userDecks).map((deck) => ({
    deckId: valueString(deck, ["deckId", "id"]),
    name: valueString(deck, ["name"]),
    leaderCardId: valueString(deck, ["leader", "member1"]),
    cardIds: deckCardIds(deck, 5)
  })).filter((deck) => deck.cardIds.length);
  const honors = [...asArray(source.userHonors), ...asArray(source.userBonds)].map((item) => ({
    honorId: valueString(item, ["honorId", "bondsHonorId", "id"]),
    level: valueNumber(item, ["level", "honorLevel", "bondsHonorLevel"]) ?? 1,
    kind: valueString(item, ["profileHonorType", "kind", "type"]) ?? (valueString(item, ["bondsHonorId"]) ? "bonds" : "normal")
  })).filter((item) => item.honorId);
  const mysekaiCanvas = asArray(source.userMysekaiCanvases).map((item) => ({
    cardId: valueString(item, ["cardId", "id"]),
    powerBonusRate: valueNumber(item, ["powerBonusRate", "bonusRate"])
  })).filter((item) => item.cardId);
  const mysekaiGates = asArray(source.userMysekaiGates).map((item) => ({
    gateId: valueString(item, ["gateId", "mysekaiGateId", "id"]),
    unit: valueString(item, ["unit", "unitType"]),
    level: valueNumber(item, ["level"]) ?? 0,
    powerBonusRate: valueNumber(item, ["powerBonusRate", "bonusRate"])
  })).filter((item) => item.gateId || item.unit);
  const mysekaiFixtures = asArray(source.userMysekaiFixtureGameCharacterPerformanceBonuses).map((item) => ({
    fixtureId: valueString(item, ["fixtureId", "mysekaiFixtureId", "id"]),
    characterId: valueString(item, ["gameCharacterId", "characterId"]),
    totalBonusRate: valueNumber(item, ["totalBonusRate", "bonusRate", "performanceBonusRate"]) ?? 0
  }));
  const playerData = [
    { kind: "area-items", data: areaItems },
    { kind: "character-ranks", data: characterRanks },
    { kind: "music-results", data: musicResults },
    { kind: "materials", data: materials },
    { kind: "decks", data: decks },
    { kind: "challenge-live", data: normalizeSuiteChallenge(source) },
    { kind: "world-bloom-support", data: normalizeSuiteWorldBloom(source) },
    { kind: "honors", data: honors },
    { kind: "profile-honors", data: honors.slice(0, 3).map((honor, index) => ({ slot: index + 1, ...honor })) },
    { kind: "mysekai-canvas", data: mysekaiCanvas },
    { kind: "mysekai-gates", data: mysekaiGates },
    { kind: "mysekai-fixtures", data: mysekaiFixtures }
  ].filter((record) => isPlayerDataKind(record.kind));
  const mappedKeys = new Set([
    "userCards", "userAreas", "userCharacters", "userMusicResults", "userMusicAchievements", "userMusics",
    "userMaterials", "userMysekaiMaterials", "userDecks", "userChallengeLiveSoloDecks", "userChallengeLiveSoloResults",
    "userChallengeLiveSoloStages", "userChallengeLiveSoloHighScoreRewards", "userWorldBloomSupportDecks", "userHonors",
    "userBonds", "userMysekaiCanvases", "userMysekaiGates", "userMysekaiFixtureGameCharacterPerformanceBonuses"
  ]);
  const unmapped = Object.keys(source).filter((key) => !mappedKeys.has(key) && key !== "upload_time" && key !== "uploadTime").sort();
  return {
    schemaVersion: 2,
    importSource: "haruki-suite-public",
    region,
    sourceSummary: {
      userId: valueString(source.userGamedata, ["userIdString", "userId"]) ?? valueString(source, ["userId"]),
      name: valueString(source.userGamedata, ["name"]),
      rank: valueNumber(source.userGamedata, ["rank"]),
      uploadTime: source.upload_time ?? source.uploadTime,
      suiteAssetCounts: Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : value == null ? 0 : 1]))
    },
    cards,
    playerData,
    normalizedPreview: {
      cards: cards.slice(0, 20),
      playerData: playerData.map((record) => ({ kind: record.kind, count: Array.isArray(record.data) ? record.data.length : record.data && typeof record.data === "object" ? 1 : 0 })),
      unmapped
    }
  };
}

async function lookupRows(region: RegionId, kind: PlayerDataKind | "cards", data: unknown): Promise<LookupResult[]> {
  const rows = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  const results: LookupResult[] = [];
  if (kind === "cards" || kind === "decks" || kind === "challenge-live" || kind === "world-bloom-support" || kind === "mysekai-canvas") {
    const cards = await getCards(region);
    const byId = new Map(cards.map((card) => [card.id, card]));
    const ids = kind === "cards" || kind === "mysekai-canvas"
      ? rows.map((row) => rawId(row, ["cardId", "id"]))
      : rows.flatMap((row) => {
          const cardIds = row && typeof row === "object" && Array.isArray((row as Record<string, unknown>).cardIds)
            ? (row as Record<string, unknown>).cardIds as unknown[]
            : [];
          const nestedCards = row && typeof row === "object" && Array.isArray((row as Record<string, unknown>).cards)
            ? (row as Record<string, unknown>).cards as unknown[]
            : [];
          const nestedIds = nestedCards.map((item) => typeof item === "string" ? item : rawId(item, ["cardId", "id"])).filter(Boolean) as string[];
          const directId = typeof row === "string" ? row : rawId(row, ["cardId", "id"]);
          return [...cardIds.map(String), ...nestedIds, ...(directId ? [directId] : [])];
        });
    for (const id of ids.filter(Boolean) as string[]) {
      const card = byId.get(id);
      results.push({
        field: "cardId",
        id,
        matched: Boolean(card),
        label: card?.title ?? card?.assetbundleName,
        meta: card ? {
          region,
          characterId: card.characterId,
          character: card.character,
          unit: card.characterUnit ?? card.supportUnit,
          rarity: card.rarity,
          cardRarityType: card.cardRarityType,
          attribute: card.attribute,
          supportUnit: card.supportUnit,
          assetbundleName: card.assetbundleName,
          thumbnails: {
            normal: getCardAssetDetail(region, card).normalThumbnailUrl,
            afterTraining: getCardAssetDetail(region, card).afterTrainingThumbnailUrl
          }
        } : undefined,
        warning: card ? undefined : `Unknown card id: ${id}`
      });
    }
  }
  if (kind === "music-results") {
    const songs = await getSongs(region);
    const byId = new Map(songs.map((song) => [song.id, song]));
    for (const row of rows) {
      const id = rawId(row, ["musicId", "songId", "id"]);
      if (!id) continue;
      const song = byId.get(id);
      results.push({ field: "musicId", id, matched: Boolean(song), label: song?.title, warning: song ? undefined : `Unknown music id: ${id}` });
    }
  }
  if (kind === "honors" || kind === "profile-honors") {
    const honors = await getMasterCollection(region, "honors");
    const byId = new Map(honors.items.map((item) => [item.id, item]));
    for (const row of rows) {
      const id = rawId(row, ["honorId", "id"]);
      if (!id) continue;
      const honor = byId.get(id);
      const honorRaw = honor?.raw as Record<string, unknown> | undefined;
      results.push({ field: "honorId", id, matched: Boolean(honor), label: String(honorRaw?.name ?? honor?.id ?? ""), warning: honor ? undefined : `Unknown honor id: ${id}` });
    }
  }
  if (kind === "area-items") {
    const items = await getMasterCollection(region, "areaItemLevels");
    const text = JSON.stringify(items.items.map((item) => item.raw));
    for (const row of rows) {
      const id = rawId(row, ["areaItemId", "id"]);
      if (!id) continue;
      const matched = text.includes(id);
      results.push({ field: "areaItemId", id, matched, label: matched ? `area item ${id}` : undefined, warning: matched ? undefined : `Unknown area item id: ${id}` });
    }
  }
  if (kind === "mysekai-gates" || kind === "mysekai-fixtures") {
    const context = await getExternalContext(region, "mysekai");
    const groups = context.groups as Record<string, unknown[]>;
    const groupName = kind === "mysekai-gates" ? "mysekaiGates" : "mysekaiFixtureInfos";
    const realRows = Array.isArray(groups[groupName]) ? groups[groupName] : [];
    const realText = JSON.stringify(realRows);
    for (const row of rows) {
      const id = rawId(row, kind === "mysekai-gates" ? ["gateId", "id"] : ["fixtureId", "mysekaiFixtureId", "id"]);
      if (!id) continue;
      const matched = realText.includes(id);
      results.push({ field: kind === "mysekai-gates" ? "gateId" : "fixtureId", id, matched, label: matched ? `${kind} ${id}` : undefined, warning: matched ? undefined : `Unknown ${kind} id: ${id}` });
    }
  }
  return results;
}

export async function validatePlayerDataRecord(region: RegionId, kind: PlayerDataKind, data: unknown) {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (kind === "area-items" && !Array.isArray(data)) errors.push("area-items data must be an array");
  if (kind === "character-ranks" && !Array.isArray(data)) errors.push("character-ranks data must be an array");
  if (kind === "music-results" && !Array.isArray(data)) errors.push("music-results data must be an array");
  if (kind === "materials" && !Array.isArray(data)) errors.push("materials data must be an array");
  if (kind === "challenge-live" && data != null && typeof data !== "object") errors.push("challenge-live data must be an object");
  if (kind === "world-bloom-support" && data != null && typeof data !== "object" && !Array.isArray(data)) errors.push("world-bloom-support data must be an object or array");
  if (kind === "mysekai-canvas" && !Array.isArray(data)) errors.push("mysekai-canvas data must be an array");
  if (kind === "mysekai-gates" && !Array.isArray(data)) errors.push("mysekai-gates data must be an array");
  if (kind === "mysekai-fixtures" && !Array.isArray(data)) errors.push("mysekai-fixtures data must be an array");
  if (kind === "area-items") {
    const areaItems = await getMasterCollection(region, "areaItemLevels");
    const valid = new Set(areaItems.items.map((item) => {
      const raw = item.raw as Record<string, unknown>;
      return String(raw.areaItemId ?? raw.id ?? item.id);
    }));
    for (const item of asArray(data)) {
      const id = rawId(item, ["areaItemId", "id"]);
      const level = Number((item as Record<string, unknown> | null)?.level);
      if (id && valid.size && !valid.has(id)) warnings.push(`Unknown area item id: ${id}`);
      if (Number.isFinite(level) && (level < 0 || level > 100)) warnings.push(`Suspicious area item level for ${id ?? "unknown"}: ${level}`);
    }
  }
  if (kind === "character-ranks") {
    for (const item of asArray(data)) {
      const id = rawId(item, ["characterId", "gameCharacterId", "id"]);
      const rank = Number((item as Record<string, unknown> | null)?.rank ?? (item as Record<string, unknown> | null)?.characterRank);
      if (!id) warnings.push("character-ranks item missing characterId");
      if (Number.isFinite(rank) && (rank < 0 || rank > 200)) warnings.push(`Suspicious character rank for ${id ?? "unknown"}: ${rank}`);
    }
  }
  if (kind === "honors" || kind === "profile-honors") {
    const honors = await getMasterCollection(region, "honors");
    const valid = new Set(honors.items.map((item) => item.id));
    for (const item of asArray(data)) {
      const id = rawId(item, ["honorId", "id"]);
      if (id && valid.size && !valid.has(id)) warnings.push(`Unknown honor id: ${id}`);
    }
  }
  if (kind === "music-results") {
    const valid = new Set((await getSongs(region)).map((song) => song.id));
    for (const item of asArray(data)) {
      const id = rawId(item, ["musicId", "songId", "id"]);
      if (id && valid.size && !valid.has(id)) warnings.push(`Unknown music id: ${id}`);
    }
  }
  if (kind === "decks") {
    const valid = new Set((await getCards(region)).map((card) => card.id));
    for (const item of asArray(data)) {
      const cardIds = item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).cardIds)
        ? ((item as Record<string, unknown>).cardIds as unknown[]).map(String)
        : [];
      for (const cardId of cardIds) {
        if (valid.size && !valid.has(cardId)) warnings.push(`Unknown deck card id: ${cardId}`);
      }
    }
  }
  if (kind === "challenge-live") {
    const cards = await getCards(region);
    const validCardIds = new Set(cards.map((card) => card.id));
    const rows = asArray((data as Record<string, unknown> | null)?.cards ?? (data as Record<string, unknown> | null)?.cardIds ?? []);
    const characterId = rawId(data, ["characterId", "gameCharacterId", "id"]);
    if (!characterId) warnings.push("challenge-live data missing characterId; challenge mode filtering will stay estimated");
    if (!rows.length) warnings.push("challenge-live should include cardIds or cards for saved challenge deck comparison");
    const seen = new Set<string>();
    for (const row of rows) {
      const cardId = typeof row === "string" ? row : rawId(row, ["cardId", "id"]);
      if (cardId && validCardIds.size && !validCardIds.has(cardId)) warnings.push(`Unknown challenge-live card id: ${cardId}`);
      if (cardId && seen.has(cardId)) warnings.push(`Duplicate challenge-live card id: ${cardId}`);
      if (cardId) seen.add(cardId);
    }
    warnings.push("challenge-live affects modeSpecificBreakdown.challenge, candidateRole, inUploadedChallengeDeck, and challenge deck filtering");
    warnings.push("Recommended challenge-live shape: { characterId, cardIds: [cardId...] }");
  }
  if (kind === "world-bloom-support") {
    const cards = await getCards(region);
    const validCardIds = new Set(cards.map((card) => card.id));
    const rows = Array.isArray(data)
      ? data
      : asArray((data as Record<string, unknown> | null)?.cards ?? (data as Record<string, unknown> | null)?.cardIds ?? []);
    const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const turn = Number(record.worldBloomEventTurn ?? record.turn ?? record.worldBloomTurn);
    if (Number.isFinite(turn) && ![1, 2, 3].includes(turn)) warnings.push(`Invalid world-bloom-support turn: ${turn}`);
    if (!rawId(record, ["eventId"])) warnings.push("world-bloom-support missing eventId; event-specific support bonus rows may stay estimated");
    if (!rawId(record, ["gameCharacterId", "specialCharacterId", "characterId"])) warnings.push("world-bloom-support missing gameCharacterId/specialCharacterId; specific character support bonus may stay estimated");
    if (!rawId(record, ["supportUnit", "worldBloomSupportUnit", "unit"])) warnings.push("world-bloom-support missing supportUnit; unit-limited support filtering may stay estimated");
    if (!rows.length) warnings.push("world-bloom-support has no support cards; World Bloom support bonus will stay missing");
    const seen = new Set<string>();
    for (const row of rows) {
      const cardId = typeof row === "string" ? row : rawId(row, ["cardId", "id"]);
      if (cardId && validCardIds.size && !validCardIds.has(cardId)) warnings.push(`Unknown world-bloom support card id: ${cardId}`);
      if (cardId && seen.has(cardId)) warnings.push(`Duplicate world-bloom support card id: ${cardId}`);
      if (cardId) seen.add(cardId);
    }
    warnings.push("world-bloom-support affects modeSpecificBreakdown.worldBloom/wl/wl3, supportDeckBreakdown, supportHit, and leaderHonorTrace");
    warnings.push("Recommended world-bloom-support shape: { eventId, gameCharacterId, cardIds: [cardId...] } or an array of { cardId }");
  }
  if (kind === "mysekai-canvas" || kind === "mysekai-gates" || kind === "mysekai-fixtures") {
    const context = await getExternalContext(region, "mysekai");
    const groups = context.groups as Record<string, unknown[]>;
    const groupName = kind === "mysekai-canvas"
      ? "cardMysekaiCanvasBonuses"
      : kind === "mysekai-gates"
        ? "mysekaiGates"
        : "mysekaiFixtureInfos";
    const realRows = Array.isArray(groups[groupName]) ? groups[groupName] : [];
    if (!realRows.length) warnings.push(`${groupName} master data is unavailable for validation`);
    const realText = JSON.stringify(realRows);
    for (const item of asArray(data)) {
      const id = rawId(item, ["id", "cardId", "gateId", "fixtureId", "mysekaiFixtureId"]);
      if (id && realRows.length && !realText.includes(id)) warnings.push(`Unknown ${kind} id: ${id}`);
    }
    warnings.push(`${kind} affects MySekai deck search, replacementCandidates, assetGapRanking, bonus trace, and formulaReadiness.v3.mysekaiSearch`);
    warnings.push(kind === "mysekai-canvas"
      ? "Recommended mysekai-canvas shape: [{ cardId, powerBonusRate? }]"
      : kind === "mysekai-gates"
        ? "Recommended mysekai-gates shape: [{ gateId, unit?, level, powerBonusRate? }]"
        : "Recommended mysekai-fixtures shape: [{ fixtureId, characterId?, level?, totalBonusRate? }]");
  }
  const lookupResults = await lookupRows(region, kind, data);
  const lookupWarnings = lookupResults.flatMap((item) => item.warning ? [item.warning] : []);
  for (const warning of lookupWarnings) {
    if (!warnings.includes(warning)) warnings.push(warning);
  }
  const normalizedPreview = normalizedArrayPreview(data);
  return {
    region,
    kind,
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      itemCount: Array.isArray(data) ? data.length : data && typeof data === "object" ? 1 : 0,
      matchedLookupCount: lookupResults.filter((item) => item.matched).length,
      unknownLookupCount: lookupResults.filter((item) => !item.matched).length
    },
    lookupResults,
    fieldHelp: fieldHelpByKind[kind] ?? [],
    toolImpact: toolImpactForKind(kind),
    normalizedPreview,
    realDataRequired: true
  };
}

export async function reviewPlayerDataImport(region: RegionId, body: unknown, currentInventory: UserCardInventoryItem[] = []) {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const isSuitePayload = !Array.isArray(source.playerData) && suiteUserDataKeys.some((key) => key in source);
  const normalizedSuite = isSuitePayload ? normalizeSuitePlayerDataImport(region, source) : null;
  const importSource = normalizedSuite ?? source;
  const cards = Array.isArray(importSource.cards) ? importSource.cards : [];
  const playerData = Array.isArray(importSource.playerData) ? importSource.playerData as Array<Record<string, unknown>> : [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const cardsLookup = await lookupRows(region, "cards", cards);
  for (const item of cardsLookup) if (item.warning) warnings.push(item.warning);
  const groups = [];
  for (const record of playerData) {
    const kind = String(record.kind ?? "");
    if (!isPlayerDataKind(kind)) {
      errors.push(`Unsupported player data kind: ${kind || "unknown"}`);
      continue;
    }
    const validation = await validatePlayerDataRecord(region, kind, record.data);
    groups.push({
      kind,
      itemCount: Array.isArray(record.data) ? record.data.length : record.data && typeof record.data === "object" ? 1 : 0,
      validation,
      overwriteRisk: "Existing data for this kind will be replaced by import"
    });
  }
  const currentByCardId = new Map(currentInventory.map((item) => [item.cardId, item]));
  const incomingByCardId = new Map(cards.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return [String(row.cardId ?? row.id ?? ""), row] as const;
  }).filter(([cardId]) => cardId));
  const comparableFields = ["level", "masterRank", "skillLevel", "specialTrainingStatus", "defaultImage", "episodesRead", "episodes"] as const;
  const added: unknown[] = [];
  const updated: unknown[] = [];
  const unchanged: unknown[] = [];
  const overwriteRisks: unknown[] = [];
  for (const [cardId, incoming] of incomingByCardId) {
    const existing = currentByCardId.get(cardId);
    if (!existing) {
      added.push(incoming);
      continue;
    }
    const changes = comparableFields.flatMap((field) => {
      const before = existing[field];
      const after = incoming[field];
      return JSON.stringify(before ?? null) === JSON.stringify(after ?? null) ? [] : [{ field, before, after }];
    });
    if (!changes.length) unchanged.push(incoming);
    else {
      const change = { cardId, before: existing, after: incoming, changes };
      updated.push(change);
      overwriteRisks.push(change);
    }
  }
  const unresolved = cardsLookup.filter((item) => !item.matched);
  const postSaveImpact = toolImpactForKind("cards");
  return {
    valid: errors.length === 0 && groups.every((group) => group.validation.valid !== false),
    errors,
    warnings,
    importReview: {
      sourceType: normalizedSuite ? "haruki-suite-public" : "pjsktools-export",
      sourceSummary: normalizedSuite?.sourceSummary,
      cards: {
        count: cards.length,
        lookupResults: cardsLookup,
        unknownLookupCount: cardsLookup.filter((item) => !item.matched).length
      },
      playerDataGroups: groups,
      unsupportedKinds: errors,
      cardDiff: { added, updated, unchanged, overwriteRisks, unresolved }
    },
    summary: {
      cardCount: cards.length,
      playerDataKindCount: groups.length,
      warningCount: warnings.length + groups.reduce((sum, group) => sum + (group.validation.warnings?.length ?? 0), 0),
      errorCount: errors.length + groups.reduce((sum, group) => sum + (group.validation.errors?.length ?? 0), 0)
    },
    fieldHelp: fieldHelpByKind,
    toolImpact: [...new Set(["cards", ...groups.map((group) => group.kind)].flatMap((kind) => toolImpactForKind(kind as PlayerDataKind | "cards")))],
    postSaveImpact,
    normalizedPreview: {
      cards: normalizedArrayPreview(cards),
      playerData: groups.map((group) => ({ kind: group.kind, data: group.validation.normalizedPreview })),
      unmapped: normalizedSuite?.normalizedPreview.unmapped
    },
    realDataRequired: true
  };
}
