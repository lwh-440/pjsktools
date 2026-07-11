import type { RegionId } from "./config.js";
import { getCards, getMasterCollection } from "./masterData.js";
import { calculateExactCardPower } from "./referenceCalculator.js";
import { store } from "./store.js";
import { recommendAreaItemUpgrades } from "./areaItemRecommend.js";

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object") : [];
}

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function text(value: unknown) {
  return value == null ? undefined : String(value);
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNumber(source: Row, keys: string[], fallback = 0) {
  for (const key of keys) {
    const parsed = Number(source[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function firstText(source: Row, keys: string[]) {
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return undefined;
}

function dataByKind(items: Array<{ kind: string; data: unknown; updatedAt?: string }>) {
  return Object.fromEntries(items.map((item) => [item.kind, item]));
}

function moduleState(ready: boolean, missingFields: string[], updatedAt?: string, status?: string) {
  return {
    ready,
    status: status ?? (ready ? "ready" : "user-data-missing"),
    missingFields,
    updatedAt: updatedAt ?? null
  };
}

function characterName(row: Row, id: string) {
  const full = [row.firstName, row.givenName].map(text).filter(Boolean).join("");
  return full || firstText(row, ["name", "givenNameEnglish", "modelName"]) || `Character ${id}`;
}

function challengeRows(value: unknown) {
  const source = record(value);
  return {
    stages: rows(source.stages),
    results: rows(source.results),
    rewards: rows(source.highScoreRewards),
    decks: rows(source.decks)
  };
}

function honorCharacterIds(row: Row) {
  const ids = [
    firstText(row, ["gameCharacterId1", "characterId1", "firstGameCharacterId"]),
    firstText(row, ["gameCharacterId2", "characterId2", "secondGameCharacterId"])
  ].filter((value): value is string => Boolean(value));
  const raw = record(row.raw);
  for (const key of ["gameCharacterId1", "characterId1", "firstGameCharacterId", "gameCharacterId2", "characterId2", "secondGameCharacterId"]) {
    const value = text(raw[key]);
    if (value && !ids.includes(value)) ids.push(value);
  }
  return ids;
}

function areaRate(row: Row) {
  return Math.max(
    number(row.power1BonusRate), number(row.power2BonusRate), number(row.power3BonusRate),
    number(row.power1AllMatchBonusRate), number(row.power2AllMatchBonusRate), number(row.power3AllMatchBonusRate)
  );
}

export async function buildProfileAnalysis(userId: string, bindingId: string) {
  const binding = (await store.listPlayerBindings(userId)).find((item) => item.id === bindingId);
  if (!binding) return null;
  const [inventory, playerData, deckConfigs, cards, gameCharacters, honors, materialsMaster] = await Promise.all([
    store.listInventory(userId, bindingId),
    store.listPlayerData(userId, bindingId),
    store.listDeckConfigs(userId),
    getCards(binding.region),
    getMasterCollection(binding.region, "gameCharacters"),
    getMasterCollection(binding.region, "honors"),
    getMasterCollection(binding.region, "materials")
  ]);
  const assets = dataByKind(playerData);
  const playerAssets = Object.fromEntries(playerData.map((item) => [item.kind, item.data]));
  const characterMaster = new Map(gameCharacters.items.map((item) => [item.id, record(item.raw)]));
  const cardMaster = new Map(cards.map((card) => [card.id, card]));
  const honorMaster = new Map(honors.items.map((item) => [item.id, item]));
  const materialMaster = new Map(materialsMaster.items.map((item) => [item.id, item]));

  const characterRanks = rows(assets["character-ranks"]?.data).map((item) => {
    const characterId = firstText(item, ["characterId", "gameCharacterId", "id"]) ?? "";
    const master = characterMaster.get(characterId) ?? {};
    return {
      characterId,
      name: characterName(master, characterId),
      unit: firstText(master, ["unit"]) ?? "unknown",
      rank: firstNumber(item, ["rank", "characterRank", "level"]),
      ownedCardCount: inventory.filter((card) => cardMaster.get(card.cardId)?.characterId === characterId).length
    };
  }).filter((item) => item.characterId).sort((a, b) => b.rank - a.rank);
  const rankTotal = characterRanks.reduce((sum, item) => sum + item.rank, 0);

  const challenge = challengeRows(assets["challenge-live"]?.data);
  const challengeIds = new Set([...challenge.stages, ...challenge.results, ...challenge.decks]
    .map((item) => firstText(item, ["characterId", "gameCharacterId"]))
    .filter((value): value is string => Boolean(value)));
  const challengeItems = [...challengeIds].map((characterId) => {
    const stageRows = challenge.stages.filter((item) => firstText(item, ["characterId", "gameCharacterId"]) === characterId);
    const resultRows = challenge.results.filter((item) => firstText(item, ["characterId", "gameCharacterId"]) === characterId);
    const deckRows = challenge.decks.filter((item) => firstText(item, ["characterId", "gameCharacterId"]) === characterId);
    const master = characterMaster.get(characterId) ?? {};
    const candidateCards = inventory.filter((owned) => cardMaster.get(owned.cardId)?.characterId === characterId);
    return {
      characterId,
      name: characterName(master, characterId),
      unit: firstText(master, ["unit"]) ?? "unknown",
      stage: Math.max(0, ...stageRows.map((item) => firstNumber(item, ["rank", "stage", "stageRank", "challengeLiveStageId"]))),
      highScore: Math.max(0, ...resultRows.map((item) => firstNumber(item, ["highScore", "score"]))),
      rewardProgress: challenge.rewards.filter((item) => firstText(item, ["characterId", "gameCharacterId"]) === characterId).length,
      savedDeckCount: deckRows.length,
      candidateCount: candidateCards.length,
      candidateCards: candidateCards.map((owned) => ({ cardId: owned.cardId, title: cardMaster.get(owned.cardId)?.title ?? owned.cardId, level: owned.level ?? 1 }))
    };
  }).sort((a, b) => b.highScore - a.highScore || b.stage - a.stage);

  const ownedHonors = rows(assets.honors?.data);
  const bondsItems = ownedHonors.filter((item) => item.kind === "bonds" || honorCharacterIds(item).length >= 2).map((item) => {
    const honorId = firstText(item, ["honorId", "bondsHonorId", "id"]) ?? "";
    const master = honorMaster.get(honorId);
    const ids = honorCharacterIds(item);
    return {
      honorId,
      name: master?.name ?? `Honor ${honorId}`,
      characterIds: ids,
      characterNames: ids.map((id) => characterName(characterMaster.get(id) ?? {}, id)),
      rank: firstNumber(item, ["level", "honorLevel", "bondsHonorLevel"], 1),
      unlocked: true,
      matched: Boolean(master)
    };
  }).sort((a, b) => b.rank - a.rank);

  const exactCards = await Promise.all(inventory.map(async (owned) => {
    const card = cardMaster.get(owned.cardId);
    if (!card) return null;
    const unit = card.characterUnit ?? card.supportUnit ?? "unknown";
    const result = await calculateExactCardPower({
      region: binding.region as RegionId,
      card,
      owned,
      playerAssets,
      unit,
      sameUnit: false,
      sameAttr: false,
      cardUnits: [card.characterUnit, card.supportUnit].filter((value): value is string => Boolean(value && value !== "none"))
    });
    return result.detail ? { cardId: card.id, title: card.title, characterId: card.characterId, ...result } : { cardId: card.id, title: card.title, characterId: card.characterId, ...result };
  }));
  const completeCards = exactCards.filter((item): item is NonNullable<typeof item> & { detail: NonNullable<NonNullable<typeof item>["detail"]> } => Boolean(item?.detail));
  const powerTotals = completeCards.reduce((totals, item) => ({
    base: totals.base + item.detail.base,
    areaItemBonus: totals.areaItemBonus + item.detail.areaItemBonus,
    characterBonus: totals.characterBonus + item.detail.characterBonus,
    fixtureBonus: totals.fixtureBonus + item.detail.fixtureBonus,
    gateBonus: totals.gateBonus + item.detail.gateBonus,
    total: totals.total + item.detail.total
  }), { base: 0, areaItemBonus: 0, characterBonus: 0, fixtureBonus: 0, gateBonus: 0, total: 0 });
  const honorPower = ownedHonors.reduce((sum, item) => sum + firstNumber(record(item.raw), ["power", "powerBonus", "honorPower"]), 0);
  const powerMissing = [...new Set(exactCards.flatMap((item) => item?.missingFields ?? []))];

  const materialInventory = new Map(rows(assets.materials?.data).map((item) => [firstText(item, ["materialId", "id"]) ?? "", firstNumber(item, ["quantity", "count", "amount"])]));
  const mainDeck = deckConfigs.find((item) => item.bindingId === binding.id) ?? rows(assets.decks?.data)[0] ?? null;
  const mainDeckCardIds = Array.isArray((mainDeck as Row | null)?.cardIds) ? (mainDeck as Row).cardIds as string[] : inventory.slice(0, 5).map((item) => item.cardId);
  const areaRecommendation = await recommendAreaItemUpgrades({
    region: binding.region as RegionId,
    currentItems: rows(assets["area-items"]?.data),
    inventory,
    playerAssets,
    materials: assets.materials?.data,
    cardIds: mainDeckCardIds,
    sortBy: "coin-efficiency",
    limit: 55
  });
  const areaItems = areaRecommendation.recommendations;

  const snapshot = record(binding.publicProfileSnapshot);
  const sourceDiagnostics = {
    region: binding.region,
    crossRegionFallback: false,
    publicProfile: snapshot.sourceMetadata ?? snapshot.source ?? (Object.keys(snapshot).length ? "binding-snapshot" : "user-data-missing"),
    masters: {
      gameCharacters: gameCharacters.sourceMetadata ?? gameCharacters.source,
      honors: honors.sourceMetadata ?? honors.source,
      areaItems: areaRecommendation.masterTrace,
      materials: materialsMaster.sourceMetadata ?? materialsMaster.source
    }
  };
  const moduleReadiness = {
    profileSummary: moduleState(Boolean(Object.keys(snapshot).length || inventory.length), Object.keys(snapshot).length ? [] : ["public profile snapshot"], binding.refreshedAt),
    characterRanks: moduleState(characterRanks.length > 0, characterRanks.length ? [] : ["character-ranks"], assets["character-ranks"]?.updatedAt),
    challenge: moduleState(challengeItems.length > 0, challengeItems.length ? [] : ["challenge-live stages/results"], assets["challenge-live"]?.updatedAt),
    bonds: moduleState(bondsItems.length > 0, bondsItems.length ? [] : ["bonds ownership in honors"], assets.honors?.updatedAt),
    powerBonus: moduleState(completeCards.length > 0 && powerMissing.length === 0, powerMissing.length ? powerMissing : completeCards.length ? [] : ["complete card calculator inputs"], inventory.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, "")),
    areaItems: moduleState(areaItems.length > 0, areaItems.length ? [] : ["area-items"], assets["area-items"]?.updatedAt),
    areaItemCosts: moduleState(areaItems.some((item) => item.cost.resources.length > 0), areaItems.some((item) => item.cost.resources.length > 0) ? [] : ["area item material/coin cost master"], assets.materials?.updatedAt, areaItems.some((item) => item.cost.resources.length > 0) ? "ready" : "missing-data")
  };

  return {
    binding: { id: binding.id, region: binding.region, playerUid: binding.playerUid, displayName: binding.displayName, isDefault: binding.isDefault },
    profileSummary: {
      nickname: firstText(snapshot, ["nickname", "name"]) ?? binding.displayName ?? binding.playerUid,
      rank: firstNumber(snapshot, ["rank", "userRank"]),
      comment: firstText(snapshot, ["comment", "profileWord"]),
      inventoryCount: inventory.length,
      assetKindCount: playerData.length,
      mainDeck,
      updatedAt: binding.refreshedAt ?? binding.updatedAt
    },
    characterRankAnalysis: {
      items: characterRanks,
      highestRank: characterRanks[0]?.rank ?? 0,
      averageRank: characterRanks.length ? Math.round((rankTotal / characterRanks.length) * 10) / 10 : 0,
      weakCharacters: [...characterRanks].sort((a, b) => a.rank - b.rank).slice(0, 5),
      units: [...new Set(characterRanks.map((item) => item.unit))]
    },
    challengeAnalysis: { items: challengeItems, rewardRowCount: challenge.rewards.length },
    bondsAnalysis: { items: bondsItems, ownedCount: bondsItems.length },
    powerBonusAnalysis: {
      formulaVersion: "normal-event-v4.1-reference",
      referenceFormulaId: "Moesekai.CardPowerCalculator.getCardPower",
      inventoryCardCount: inventory.length,
      exactCardCount: completeCards.length,
      totals: { ...powerTotals, honorPower, totalWithHonor: powerTotals.total + honorPower },
      cards: completeCards.sort((a, b) => b.detail.total - a.detail.total).slice(0, 20).map((item) => ({ cardId: item.cardId, title: item.title, characterId: item.characterId, detail: item.detail })),
      missingFields: powerMissing,
      status: completeCards.length === inventory.length && powerMissing.length === 0 ? "matched" : completeCards.length ? "missing-data" : "unsupported"
    },
    areaItemUpgradeAnalysis: { ...areaRecommendation, items: areaItems, materialInventory: Object.fromEntries(materialInventory), costMasterAvailable: areaItems.some((item) => item.cost.resources.length > 0) },
    moduleReadiness,
    sourceDiagnostics,
    referenceFiles: [
      "Moesekai web/src/components/profile/CharacterRankRadar.tsx",
      "Moesekai web/src/components/profile/ChallengeStageChart.tsx",
      "Moesekai web/src/components/profile/BondsRankTable.tsx",
      "Moesekai web/src/components/profile/PowerBonusDetail.tsx",
      "Moesekai web/src/components/profile/AreaItemUpgradeMaterials.tsx"
    ]
  };
}
