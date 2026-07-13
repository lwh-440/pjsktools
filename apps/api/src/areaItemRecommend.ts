import type { RegionId } from "./config.js";
import { buildDeckDetailLike } from "./formulaDetail.js";
import { getCards, getMasterCollection } from "./masterData.js";
import { buildExactCardDetailLike, prepareExactCardPowerContext, resolveExactMysekaiServiceContext } from "./referenceCalculator.js";
import { getReferenceMasterHealth } from "./referenceMaster.js";
import type { UserCardInventoryItem } from "./types.js";

type Row = Record<string, unknown>;
export const areaItemVersion = "area-item-v1-reference" as const;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object") : [];
}

function raw(item: { raw?: unknown }): Row {
  return item.raw && typeof item.raw === "object" ? item.raw as Row : {};
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function string(value: unknown) {
  return value == null ? undefined : String(value);
}

function currentAreaRows(currentItems: Array<{ areaItemId?: string; id?: string; level?: number }> = []) {
  return currentItems.map((item) => ({ areaItemId: String(item.areaItemId ?? item.id ?? ""), level: number(item.level) })).filter((item) => item.areaItemId);
}

function materialMap(value: unknown) {
  return new Map(rows(value).map((item) => [String(item.materialId ?? item.resourceId ?? item.id ?? ""), number(item.quantity ?? item.count ?? item.amount)]));
}

function shopItemId(areaItemId: number, level: number) {
  const offset = level <= 10 ? 1000 + (areaItemId - 1) * 10 : 1550 - 10 + (areaItemId - 1) * 5;
  return offset + level;
}

function costEntries(shop?: Row) {
  return rows(shop?.costs).map((entry) => {
    const cost = entry.cost && typeof entry.cost === "object" ? entry.cost as Row : entry;
    const resourceType = String(cost.resourceType ?? "unknown");
    const resourceId = string(cost.resourceId) ?? (resourceType === "coin" ? "0" : "");
    return { resourceType, resourceId, required: number(cost.quantity) };
  }).filter((item) => item.required > 0);
}

export type AreaItemRecommendInput = {
  region: RegionId;
  currentItems?: Array<{ areaItemId?: string; id?: string; level?: number }>;
  inventory?: Array<Partial<UserCardInventoryItem> & { cardId: string }>;
  playerAssets?: Record<string, unknown>;
  materials?: unknown;
  cardIds?: string[];
  sortBy?: "coin-efficiency" | "power-gain" | "affordable";
  includeUnaffordable?: boolean;
  limit?: number;
};

export async function recommendAreaItemUpgrades(input: AreaItemRecommendInput) {
  const inventory = (input.inventory ?? []).filter((item) => !input.cardIds?.length || input.cardIds.includes(item.cardId)).slice(0, 5);
  const playerAssets: Record<string, unknown> = { ...(input.playerAssets ?? {}), "area-items": currentAreaRows(input.currentItems ?? rows(input.playerAssets?.["area-items"]) as any) };
  const [cards, areas, areaItems, areaLevels, shopItems, referenceHealth] = await Promise.all([
    getCards(input.region),
    getMasterCollection(input.region, "areas"),
    getMasterCollection(input.region, "areaItems"),
    getMasterCollection(input.region, "areaItemLevels"),
    getMasterCollection(input.region, "shopItems"),
    getReferenceMasterHealth(input.region)
  ]);
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const [service, powerContext] = await Promise.all([
    resolveExactMysekaiServiceContext(input.region, playerAssets),
    prepareExactCardPowerContext(input.region)
  ]);
  const buildDeck = async (assets: Record<string, unknown>) => {
    const exactService = { ...service, playerAssets: assets };
    const results = await Promise.all(inventory.map((owned) => {
      const card = cardMap.get(owned.cardId);
      return card ? buildExactCardDetailLike({ region: input.region, card, owned, service: exactService, powerContext }) : Promise.resolve({ detail: undefined, trace: {}, missingFields: [`cards:${owned.cardId}`], estimatedFieldsUsed: [] });
    }));
    const details = results.map((item) => item.detail).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const missingFields = [...new Set(results.flatMap((item) => item.missingFields))];
    return {
      detail: details.length === inventory.length && inventory.length > 0 ? buildDeckDetailLike(details, { missingFields }) : undefined,
      missingFields,
      estimatedFieldsUsed: [...new Set(results.flatMap((item) => item.estimatedFieldsUsed))]
    };
  };
  const current = await buildDeck(playerAssets);
  const levelsByItem = new Map<string, Row[]>();
  for (const item of areaLevels.items) {
    const row = raw(item);
    const id = String(row.areaItemId ?? item.id);
    levelsByItem.set(id, [...(levelsByItem.get(id) ?? []), row]);
  }
  const currentLevels = new Map(currentAreaRows(playerAssets["area-items"] as any).map((item) => [item.areaItemId, item.level]));
  const areaItemMap = new Map(areaItems.items.map((item) => [item.id, item]));
  const areaMap = new Map(areas.items.map((item) => [item.id, item]));
  const shopMap = new Map(shopItems.items.map((item) => [item.id, raw(item)]));
  const ownedMaterials = materialMap(input.materials ?? playerAssets.materials);
  const recommendations = [];
  for (const [areaItemId, levels] of levelsByItem) {
    const sorted = levels.sort((a, b) => number(a.level ?? a.areaItemLevel) - number(b.level ?? b.areaItemLevel));
    const fromLevel = currentLevels.get(areaItemId) ?? 0;
    const nextRow = sorted.find((row) => number(row.level ?? row.areaItemLevel) === fromLevel + 1);
    if (!nextRow) continue;
    const nextItems = currentAreaRows(playerAssets["area-items"] as any).filter((item) => item.areaItemId !== areaItemId);
    nextItems.push({ areaItemId, level: fromLevel + 1 });
    const next = await buildDeck({ ...playerAssets, "area-items": nextItems });
    const idNum = number(areaItemId);
    const explicitShopId = string(nextRow.shopItemId ?? nextRow.areaItemShopItemId);
    const derivedShopId = fromLevel + 1 <= 15 ? String(shopItemId(idNum, fromLevel + 1)) : undefined;
    const selectedShopId = explicitShopId ?? derivedShopId;
    const shop = selectedShopId ? shopMap.get(selectedShopId) : undefined;
    const costs = costEntries(shop).map((cost) => {
      const owned = cost.resourceType === "coin" ? ownedMaterials.get("0") ?? ownedMaterials.get("coin") ?? 0 : ownedMaterials.get(cost.resourceId) ?? 0;
      return { ...cost, owned, shortage: Math.max(0, cost.required - owned) };
    });
    const coin = costs.find((cost) => cost.resourceType === "coin")?.required;
    const shortages = costs.filter((cost) => cost.shortage > 0);
    const powerBefore = current.detail?.power.total;
    const powerAfter = next.detail?.power.total;
    const powerGain = powerBefore != null && powerAfter != null ? powerAfter - powerBefore : null;
    const areaItem = areaItemMap.get(areaItemId);
    const area = areaItem ? areaMap.get(String(raw(areaItem).areaId ?? "")) : undefined;
    const currentRow = sorted.find((row) => number(row.level ?? row.areaItemLevel) === fromLevel);
    const bonusRate = (row?: Row) => Math.max(...["power1BonusRate", "power2BonusRate", "power3BonusRate", "power1AllMatchBonusRate", "power2AllMatchBonusRate", "power3AllMatchBonusRate"].map((key) => number(row?.[key])));
    const affectedCards = next.detail?.deckCards.filter((card, index) => card.power.areaItemBonus !== current.detail?.deckCards[index]?.power.areaItemBonus).map((card) => card.cardId) ?? [];
    const targetUnit = string(nextRow.targetUnit) ?? "any";
    const targetAttr = string(nextRow.targetCardAttr) ?? "any";
    const targetCharacterId = string(nextRow.targetGameCharacterId);
    recommendations.push({
      areaItemId,
      name: areaItem?.name ?? `Area item ${areaItemId}`,
      area: area ? { id: area.id, name: area.name } : undefined,
      fromLevel,
      toLevel: fromLevel + 1,
      currentLevel: fromLevel,
      nextLevel: fromLevel + 1,
      maxLevel: Math.max(...sorted.map((row) => number(row.level ?? row.areaItemLevel))),
      currentBonus: currentRow ? bonusRate(currentRow) : 0,
      nextBonus: bonusRate(nextRow),
      unit: targetUnit,
      attribute: targetAttr,
      characterId: targetCharacterId,
      powerBefore: powerBefore ?? null,
      powerAfter: powerAfter ?? null,
      powerGain,
      powerPerCoin: powerGain != null && coin && coin > 0 ? powerGain / coin : null,
      affectedCardIds: affectedCards,
      cost: { coin: coin ?? null, seed: costs.find((cost) => cost.resourceType === "material" && cost.resourceId === "17")?.required ?? 0, szk: costs.find((cost) => cost.resourceType === "material" && cost.resourceId === "57")?.required ?? 0, resources: costs },
      costs: costs.filter((cost) => cost.resourceType === "material").map((cost) => ({ materialId: cost.resourceId, name: cost.resourceId, required: cost.required, owned: cost.owned })),
      materialShortages: shortages,
      affordable: costs.length ? shortages.length === 0 : null,
      costStatus: shop ? "matched" : "missing-data",
      levels: sorted.filter((row) => number(row.level ?? row.areaItemLevel) > fromLevel).map((row) => ({ level: number(row.level ?? row.areaItemLevel), bonus: bonusRate(row) })),
      areaItemLevelTrace: {
        source: "areaItemLevels",
        areaItemId,
        level: fromLevel + 1,
        targetUnit,
        targetCardAttr: targetAttr,
        targetGameCharacterId: targetCharacterId,
        bonusRates: Object.fromEntries(["power1BonusRate", "power2BonusRate", "power3BonusRate", "power1AllMatchBonusRate", "power2AllMatchBonusRate", "power3AllMatchBonusRate"].map((key) => [key, number(nextRow[key])]))
      },
      shopItemTrace: { source: "shopItems", shopItemId: selectedShopId, resolution: explicitShopId ? "explicit" : derivedShopId ? "Moesekai AreaItemService ID rule" : "missing", matched: Boolean(shop) },
      deckCalculatorTrace: next.detail ? {
        referenceFormulaId: "Moesekai.DeckCalculator.getDeckDetailByCards",
        powerBefore: powerBefore ?? null,
        powerAfter: powerAfter ?? null,
        powerGain,
        orderedCardIds: next.detail.deckCards.map((card) => card.cardId),
        affectedCardIds: affectedCards
      } : undefined,
      missingFields: [...new Set([...current.missingFields, ...next.missingFields, ...(shop ? [] : [fromLevel + 1 > 15 ? `shopItems:cost-unconfirmed:${areaItemId}:${fromLevel + 1}` : `shopItems:${selectedShopId ?? "unknown"}`])])],
      estimatedFieldsUsed: [...new Set([...current.estimatedFieldsUsed, ...next.estimatedFieldsUsed])]
    });
  }
  const filtered = input.includeUnaffordable === false ? recommendations.filter((item) => item.affordable !== false) : recommendations;
  const sortBy = input.sortBy ?? "coin-efficiency";
  filtered.sort((a, b) => {
    if (sortBy === "power-gain") return (b.powerGain ?? -Infinity) - (a.powerGain ?? -Infinity);
    if (sortBy === "affordable") return Number(b.affordable === true) - Number(a.affordable === true) || (b.powerPerCoin ?? -Infinity) - (a.powerPerCoin ?? -Infinity);
    return (b.powerPerCoin ?? -Infinity) - (a.powerPerCoin ?? -Infinity) || (b.powerGain ?? -Infinity) - (a.powerGain ?? -Infinity);
  });
  const missingFields = [...new Set(filtered.flatMap((item) => item.missingFields))];
  return {
    region: input.region,
    areaItemVersion,
    recommendations: filtered.slice(0, input.limit ?? 10),
    powerBefore: current.detail?.power.total ?? null,
    sortBy,
    masterTrace: { areas: areas.sourceMetadata ?? areas.source, areaItems: areaItems.sourceMetadata ?? areaItems.source, areaItemLevels: areaLevels.sourceMetadata ?? areaLevels.source, shopItems: shopItems.sourceMetadata ?? shopItems.source },
    referenceParity: {
      status: current.detail && !missingFields.length ? "matched" : "missing-data",
      referenceFormulaId: "Moesekai.AreaItemRecommend.recommendAreaItem",
      referenceFiles: ["refer/Moesekai/refer/re_sekai-calculator/src/area-item-information/area-item-service.ts", "refer/Moesekai/refer/re_sekai-calculator/src/area-item-recommend/area-item-recommend.ts", "refer/Moesekai/refer/re_sekai-calculator/src/deck-information/deck-calculator.ts"],
      referenceMasterHealth: {
        status: referenceHealth.status,
        syncedAt: referenceHealth.syncedAt,
        requiredCollections: Object.fromEntries(["areas", "areaItems", "areaItemLevels", "shopItems"].map((key) => [key, referenceHealth.counts[key as keyof typeof referenceHealth.counts] ?? 0]))
      }
    },
    missingFields,
    estimatedFieldsUsed: [...new Set(filtered.flatMap((item) => item.estimatedFieldsUsed))],
    warnings: inventory.length ? [] : ["A complete target deck is required for exact power gain"],
    realDataRequired: true
  };
}
