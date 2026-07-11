import type { RegionId } from "./config.js";
import { getExternalContext } from "./externalData.js";
import { buildDeckDetailLike, type CardDetailLike } from "./formulaDetail.js";
import { getCards, getMasterCollection } from "./masterData.js";
import { buildCardContributionBreakdown, sharedFormulaVersion } from "./normalEventFormula.js";
import { getEventBonusConfig } from "./calcData.js";
import { buildExactCardDetailLike, resolveExactMysekaiServiceContext } from "./referenceCalculator.js";
import { getReferenceMaster } from "./referenceMaster.js";
import type { Card, UserCardInventoryItem } from "./types.js";

type MysekaiAssetMap = Record<string, unknown>;
type MysekaiSearchAlgorithm = "ga" | "beam";
type MysekaiGaTarget = "score" | "power";

type MysekaiGaConfig = {
  seed?: number;
  maxIter?: number;
  maxIterNoImprove?: number;
  popSize?: number;
  parentSize?: number;
  eliteSize?: number;
  crossoverRate?: number;
  baseMutationRate?: number;
  noImproveIterToMutationRate?: number;
  timeoutMs?: number;
  target?: MysekaiGaTarget;
};

export type MysekaiCalcInput = {
  region: RegionId;
  cards?: Array<Partial<UserCardInventoryItem> & { cardId: string }>;
  playerAssets?: MysekaiAssetMap;
  targetCharacterId?: string;
  targetUnit?: string;
  eventId?: string;
  specialCharacterId?: string;
  calculationMode?: "mysekai" | "world_bloom" | "wl3";
  eventBonus?: number;
  supportDeckBonus?: number;
  search?: {
    algorithm?: MysekaiSearchAlgorithm;
    candidatePoolSize?: number;
    beamWidth?: number;
    uniqueCharacter?: boolean;
    gaConfig?: MysekaiGaConfig;
  };
};

const MYSEKAI_VERSION = "mysekai-v5-reference";

const DEFAULT_GA_CONFIG: Required<MysekaiGaConfig> = {
  seed: -1,
  maxIter: 1000,
  maxIterNoImprove: 10,
  popSize: 8000,
  parentSize: 800,
  eliteSize: 10,
  crossoverRate: 1.0,
  baseMutationRate: 0.1,
  noImproveIterToMutationRate: 0.02,
  timeoutMs: 15000,
  target: "score"
};

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function numberField(record: unknown, keys: string[], fallback = 0) {
  if (!record || typeof record !== "object") return fallback;
  const source = record as Record<string, unknown>;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function stringField(record: unknown, keys: string[]) {
  if (!record || typeof record !== "object") return undefined;
  const source = record as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (value != null && String(value).trim()) return String(value);
  }
  return undefined;
}

function cardCharacterId(card: { id: string; character?: string; assetbundleName?: string }) {
  const match = card.assetbundleName?.match(/(?:^|_)(\d{1,2})(?:_|$)/);
  return match ? match[1] : card.character ?? card.id;
}

function cardUnit(card: { supportUnit?: string; assetbundleName?: string }) {
  return card.supportUnit ?? card.assetbundleName?.split("_")[0];
}

function cardAttribute(card: { attribute?: string; attr?: string }) {
  return card.attribute ?? card.attr;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clampFloat(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function mysekaiEventPoint(power: number, eventBonus = 0, supportDeckBonus = 0) {
  let powerBonus = 1 + power / 450000;
  powerBonus = Math.floor(powerBonus * 10 + 1e-6) / 10.0;
  const eventBonusRate = Math.floor(eventBonus + supportDeckBonus + 1e-6) / 100.0;
  const internal = powerBonus * (1 + eventBonusRate) * 500;
  return {
    power,
    powerBonus,
    eventBonus,
    supportDeckBonus,
    inputBonuses: { eventBonus, supportDeckBonus, eventBonusRate },
    mysekaiEventPoint: Math.floor(powerBonus * (1 + eventBonusRate) + 1e-6) * 500,
    mysekaiInternalPoint: internal,
    referenceFormula: "Moesekai MysekaiEventCalculator: floor((floor((1 + power / 450000) * 10) / 10) * (1 + eventBonusRate) * 500)"
  };
}

function deckSearch(cardResults: Array<any>, options: { beamWidth?: number; candidatePoolSize?: number; uniqueCharacter?: boolean; eventBonus?: number; supportDeckBonus?: number } = {}) {
  const beamWidth = Math.max(5, Math.min(128, Math.floor(options.beamWidth ?? 24)));
  const candidatePoolSize = Math.max(5, Math.min(cardResults.length || 5, Math.floor(options.candidatePoolSize ?? beamWidth)));
  const uniqueCharacter = options.uniqueCharacter ?? true;
  const candidates = cardResults.slice(0, candidatePoolSize);
  const beams: Array<{ cards: any[]; totalPower: number; characterIds: Set<string> }> = [{ cards: [], totalPower: 0, characterIds: new Set() }];
  for (const candidate of candidates) {
    const next = [...beams];
    for (const beam of beams) {
      if (beam.cards.length >= 5) continue;
      if (uniqueCharacter && beam.characterIds.has(candidate.characterId)) continue;
      const characterIds = new Set(beam.characterIds);
      characterIds.add(candidate.characterId);
      next.push({
        cards: [...beam.cards, candidate],
        totalPower: beam.totalPower + candidate.breakdown.totalPower,
        characterIds
      });
    }
    next.sort((a, b) => b.totalPower - a.totalPower);
    beams.splice(0, beams.length, ...next.slice(0, beamWidth));
  }
  return beams.filter((beam) => beam.cards.length === Math.min(5, cardResults.length)).slice(0, 5).map((beam, index) => ({
    rank: index + 1,
    cards: beam.cards,
    totalPower: beam.totalPower,
    mysekaiEventPoint: mysekaiEventPoint(beam.totalPower, options.eventBonus, options.supportDeckBonus),
    searchMode: "deterministic-beam",
    constraints: [uniqueCharacter ? "unique character when possible" : "duplicate characters allowed", "sorted by MySekai-adjusted total power"]
  }));
}

class SimpleRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed & 0x7fffffff;
    if (this.state === 0) this.state = 1;
  }

  next() {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return (this.state >>> 0) / 4294967296;
  }

  nextInt(max: number) {
    return Math.floor(this.next() * max);
  }
}

function resolveGaConfig(config: MysekaiGaConfig | undefined): Required<MysekaiGaConfig> {
  return {
    seed: clampNumber(config?.seed, DEFAULT_GA_CONFIG.seed, -2147483648, 2147483647),
    maxIter: clampNumber(config?.maxIter, DEFAULT_GA_CONFIG.maxIter, 1, 1000),
    maxIterNoImprove: clampNumber(config?.maxIterNoImprove, DEFAULT_GA_CONFIG.maxIterNoImprove, 1, 200),
    popSize: clampNumber(config?.popSize, DEFAULT_GA_CONFIG.popSize, 20, 8000),
    parentSize: clampNumber(config?.parentSize, DEFAULT_GA_CONFIG.parentSize, 2, 800),
    eliteSize: clampNumber(config?.eliteSize, DEFAULT_GA_CONFIG.eliteSize, 1, 100),
    crossoverRate: clampFloat(config?.crossoverRate, DEFAULT_GA_CONFIG.crossoverRate, 0, 1),
    baseMutationRate: clampFloat(config?.baseMutationRate, DEFAULT_GA_CONFIG.baseMutationRate, 0, 1),
    noImproveIterToMutationRate: clampFloat(config?.noImproveIterToMutationRate, DEFAULT_GA_CONFIG.noImproveIterToMutationRate, 0, 1),
    timeoutMs: clampNumber(config?.timeoutMs, DEFAULT_GA_CONFIG.timeoutMs, 1000, 15000),
    target: config?.target === "power" ? "power" : "score"
  };
}

function deckHash(cards: Array<any>) {
  return cards.map((card) => String(card.card.id)).sort().join("|");
}

function deckPower(cards: Array<any>) {
  return cards.reduce((sum, card) => sum + card.breakdown.totalPower, 0);
}

function mysekaiCardDetail(cardResult: any): CardDetailLike {
  return cardResult.cardDetail;
}

function deckDetailPower(cards: Array<any>) {
  if (!cards.length) return 0;
  return deckDetailForCards(cards).power.total;
}

function deckDetailForCards(cards: Array<any>) {
  return buildDeckDetailLike(cards.map(mysekaiCardDetail), {
    mode: "normal",
    missingFields: []
  });
}

function deckScore(cards: Array<any>, options: { eventBonus?: number; supportDeckBonus?: number; target?: MysekaiGaTarget }) {
  const detail = deckDetailForCards(cards);
  const power = detail.power.total;
  if (options.target === "power") return power;
  return mysekaiEventPoint(power, options.eventBonus ?? detail.eventBonus ?? 0, options.supportDeckBonus ?? detail.supportDeckBonus ?? 0).mysekaiInternalPoint;
}

function weightedPick(rng: SimpleRng, cards: Array<any>, usedIds: Set<string>, usedCharacters: Set<string>, uniqueCharacter: boolean) {
  const available = cards.filter((card) => !usedIds.has(card.card.id) && (!uniqueCharacter || !usedCharacters.has(card.characterId)));
  if (!available.length) return undefined;
  const total = available.reduce((sum, card) => sum + Math.max(1, card.breakdown.totalPower), 0);
  let pick = rng.next() * total;
  for (const card of available) {
    pick -= Math.max(1, card.breakdown.totalPower);
    if (pick <= 0) return card;
  }
  return available[available.length - 1];
}

function uniqueCharactersCount(cards: Array<any>) {
  return new Set(cards.map((card) => card.characterId)).size;
}

function gaDeckSearch(cardResults: Array<any>, options: {
  uniqueCharacter?: boolean;
  eventBonus?: number;
  supportDeckBonus?: number;
  candidatePoolSize?: number;
  gaConfig?: MysekaiGaConfig;
} = {}) {
  const startedAt = Date.now();
  const cfg = resolveGaConfig(options.gaConfig);
  const rng = new SimpleRng(cfg.seed);
  const uniqueCharacter = options.uniqueCharacter ?? true;
  const candidatePoolSize = Math.max(0, Math.min(cardResults.length, Math.floor(options.candidatePoolSize ?? cardResults.length)));
  const candidates = cardResults.slice(0, candidatePoolSize || cardResults.length);
  const member = Math.min(5, candidates.length, uniqueCharacter ? uniqueCharactersCount(candidates) : candidates.length);
  const fitnessCache = new Map<string, number>();
  const bestByHash = new Map<string, { cards: any[]; fitness: number }>();
  let iterations = 0;
  let noImproveIter = 0;
  let bestFitness = -Infinity;
  let stoppedReason = "completed";

  function evaluate(cards: Array<any>) {
    const hash = deckHash(cards);
    const cached = fitnessCache.get(hash);
    if (cached != null) return cached;
    const fitness = deckScore(cards, { eventBonus: options.eventBonus, supportDeckBonus: options.supportDeckBonus, target: cfg.target });
    fitnessCache.set(hash, fitness);
    const existing = bestByHash.get(hash);
    if (!existing || fitness > existing.fitness) bestByHash.set(hash, { cards, fitness });
    return fitness;
  }

  function randomIndividual() {
    const deck: any[] = [];
    const usedIds = new Set<string>();
    const usedCharacters = new Set<string>();
    while (deck.length < member) {
      const next = weightedPick(rng, candidates, usedIds, usedCharacters, uniqueCharacter);
      if (!next) break;
      deck.push(next);
      usedIds.add(next.card.id);
      usedCharacters.add(next.characterId);
    }
    return deck.length ? { cards: deck, fitness: evaluate(deck) } : undefined;
  }

  function crossover(a: { cards: any[]; fitness: number }, b: { cards: any[]; fitness: number }) {
    if (rng.next() > cfg.crossoverRate) return { cards: [...(a.fitness >= b.fitness ? a.cards : b.cards)], fitness: 0 };
    const deck: any[] = [];
    const usedIds = new Set<string>();
    const usedCharacters = new Set<string>();
    const combined = [...a.cards, ...b.cards];
    for (const card of combined) {
      if (deck.length >= member) break;
      if (usedIds.has(card.card.id)) continue;
      if (uniqueCharacter && usedCharacters.has(card.characterId)) continue;
      if (rng.next() < 0.5 || deck.length + (combined.length - combined.indexOf(card)) <= member) {
        deck.push(card);
        usedIds.add(card.card.id);
        usedCharacters.add(card.characterId);
      }
    }
    while (deck.length < member) {
      const next = weightedPick(rng, candidates, usedIds, usedCharacters, uniqueCharacter);
      if (!next) break;
      deck.push(next);
      usedIds.add(next.card.id);
      usedCharacters.add(next.characterId);
    }
    return deck.length ? { cards: deck, fitness: 0 } : undefined;
  }

  function mutate(individual: { cards: any[]; fitness: number }, mutationRate: number) {
    const deck = [...individual.cards];
    for (let index = 0; index < deck.length; index += 1) {
      if (rng.next() > mutationRate) continue;
      const usedIds = new Set(deck.map((card) => card.card.id));
      const usedCharacters = new Set(deck.map((card) => card.characterId));
      usedIds.delete(deck[index].card.id);
      usedCharacters.delete(deck[index].characterId);
      const next = weightedPick(rng, candidates, usedIds, usedCharacters, uniqueCharacter);
      if (next) deck[index] = next;
    }
    individual.cards = deck;
    individual.fitness = evaluate(deck);
  }

  let population: Array<{ cards: any[]; fitness: number }> = [];
  for (let index = 0; index < cfg.popSize && Date.now() - startedAt < cfg.timeoutMs; index += 1) {
    const individual = randomIndividual();
    if (individual) population.push(individual);
  }
  if (!population.length) {
    return {
      decks: [],
      candidateCount: cardResults.length,
      candidatePoolSize: candidates.length,
      searchMode: "ga",
      gaConfig: cfg,
      gaTrace: { initialPopulation: 0, bestFitness: 0, noImproveIter: 0, mutationRate: cfg.baseMutationRate },
      fitnessCacheSize: fitnessCache.size,
      iterations,
      stoppedReason: candidates.length ? "no viable population" : "no candidates",
      referenceFormulaId: "Moesekai.findBestCardsGA + MysekaiEventCalculator.getMysekaiEventPointFunction"
    };
  }

  bestFitness = population.reduce((max, item) => Math.max(max, item.fitness), -Infinity);
  for (iterations = 0; iterations < cfg.maxIter; iterations += 1) {
    if (Date.now() - startedAt >= cfg.timeoutMs) {
      stoppedReason = "timeout";
      break;
    }
    population.sort((a, b) => b.fitness - a.fitness);
    const previousBest = bestFitness;
    const mutationRate = Math.min(1, cfg.baseMutationRate + cfg.noImproveIterToMutationRate * noImproveIter);
    const newPopulation = population.slice(0, Math.min(cfg.eliteSize, population.length));
    const parentSize = Math.min(cfg.parentSize, population.length);
    while (newPopulation.length < cfg.popSize && Date.now() - startedAt < cfg.timeoutMs) {
      const parentA = population[rng.nextInt(parentSize)];
      const parentB = population[rng.nextInt(parentSize)];
      const child = crossover(parentA, parentB);
      if (!child) continue;
      mutate(child, mutationRate);
      newPopulation.push(child);
      bestFitness = Math.max(bestFitness, child.fitness);
    }
    population = newPopulation;
    if (bestFitness <= previousBest) noImproveIter += 1;
    else noImproveIter = 0;
    if (noImproveIter >= cfg.maxIterNoImprove) {
      stoppedReason = "no-improvement";
      break;
    }
  }

  const decks = [...bestByHash.values()]
    .sort((a, b) => b.fitness - a.fitness)
    .slice(0, 5)
    .map((beam, index) => {
      const totalPower = deckDetailPower(beam.cards);
      return {
        rank: index + 1,
        cards: beam.cards,
        totalPower,
        score: beam.fitness,
        mysekaiEventPoint: mysekaiEventPoint(totalPower, options.eventBonus, options.supportDeckBonus),
        searchMode: "ga",
        constraints: [uniqueCharacter ? "unique character when possible" : "duplicate characters allowed", "Moesekai-style GA selection/crossover/mutation"]
      };
    });
  return {
    decks,
    candidateCount: cardResults.length,
    candidatePoolSize: candidates.length,
    searchMode: "ga",
    gaConfig: cfg,
    gaTrace: {
      initialPopulation: population.length,
      bestFitness: Number.isFinite(bestFitness) ? bestFitness : 0,
      noImproveIter,
      mutationRate: Math.min(1, cfg.baseMutationRate + cfg.noImproveIterToMutationRate * noImproveIter),
      elapsedMs: Date.now() - startedAt,
      member
    },
    fitnessCacheSize: fitnessCache.size,
    iterations,
    stoppedReason,
    referenceFormulaId: "Moesekai.findBestCardsGA + MysekaiEventCalculator.getMysekaiEventPointFunction"
  };
}

export async function calculateMysekai(input: MysekaiCalcInput) {
  const playerAssets = input.playerAssets ?? {};
  const inventory = input.cards ?? [];
  const [cards, referenceCards, mysekaiContext, service, eventConfig, fixtureLimitRows, skillLimitRows] = await Promise.all([
    getCards(input.region),
    getReferenceMaster<Record<string, unknown>>(input.region, "cards"),
    getExternalContext(input.region, "mysekai"),
    resolveExactMysekaiServiceContext(input.region, playerAssets),
    input.eventId ? getEventBonusConfig(input.region, input.eventId, input.specialCharacterId) : Promise.resolve(undefined),
    getReferenceMaster<Record<string, unknown>>(input.region, "eventMysekaiFixtureGameCharacterPerformanceBonusLimits"),
    getMasterCollection(input.region, "eventSkillScoreUpLimits")
  ]);
  const groups = mysekaiContext.groups as Record<string, unknown[]>;
  const gates = asArray(groups.mysekaiGates);
  const fixtures = asArray(groups.mysekaiFixtureInfos);
  const referenceCardsById = new Map(referenceCards.map((row) => [String(row.id), row]));
  const cardsById = new Map(cards.map((card) => {
    const raw = referenceCardsById.get(card.id);
    return [card.id, raw ? {
      ...card,
      characterId: String(raw.characterId ?? card.characterId ?? ""),
      characterUnit: card.characterUnit,
      cardRarityType: String(raw.cardRarityType ?? card.cardRarityType ?? ""),
      rarity: Number(String(raw.cardRarityType ?? "").match(/\d+/)?.[0] ?? card.rarity),
      attribute: String(raw.attr ?? card.attribute),
      supportUnit: String(raw.supportUnit ?? card.supportUnit ?? "none"),
      skillId: String(raw.skillId ?? card.skillId ?? ""),
      specialTrainingSkillId: raw.specialTrainingSkillId == null ? card.specialTrainingSkillId : String(raw.specialTrainingSkillId)
    } : card] as const;
  }));
  const officialFieldsUsed = new Set<string>(["cards", "cardParameters", "cardEpisodes", "masterLessons", "areaItemLevels", "characterRanks"]);
  const estimatedFieldsUsed = new Set<string>();
  const missingFields = new Set<string>();
  const warnings: string[] = [];
  service.missingFields.forEach((field) => missingFields.add(field));
  if (input.eventId) eventConfig?.missingFields.forEach((field) => missingFields.add(field));
  if (service.canvasCardIds.size) officialFieldsUsed.add("userMysekaiCanvases.cardId");
  if (service.gateBonuses.length) officialFieldsUsed.add("mysekaiGates + mysekaiGateLevels + userMysekaiGates");
  if (service.fixtureBonuses.length) officialFieldsUsed.add("userMysekaiFixtureGameCharacterPerformanceBonuses");
  if (!inventory.length) missingFields.add("user card inventory");
  const fixtureLimitRow = fixtureLimitRows.find((row) => String(row.eventId ?? "") === input.eventId)
    ?? asArray(groups.eventMysekaiFixtureGameCharacterPerformanceBonusLimits).find((row) => stringField(row, ["eventId"]) === input.eventId);
  const isFinale = eventConfig?.worldBloomType === "finale" || input.calculationMode === "wl3";
  const mysekaiFixtureLimit = isFinale ? numberField(fixtureLimitRow, ["bonusRateLimit"], Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  const skillLimitRow = skillLimitRows.items
    .map((row) => row.raw as Record<string, unknown> | undefined)
    .find((row) => String(row?.eventId ?? "") === input.eventId);
  const scoreUpLimit = isFinale ? numberField(skillLimitRow, ["scoreUpRateLimit"], Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  if (isFinale && !fixtureLimitRow) missingFields.add("eventMysekaiFixtureGameCharacterPerformanceBonusLimits");
  const cardResults = (await Promise.all(inventory.map(async (owned) => {
    const card = cardsById.get(owned.cardId);
    if (!card) {
      warnings.push(`Card ${owned.cardId} not found in real master`);
      return null;
    }
    const contribution = buildCardContributionBreakdown({ card, owned, playerAssets, eventConfig, target: "event" });
    const exact = await buildExactCardDetailLike({
      region: input.region,
      card,
      owned,
      service,
      mysekaiFixtureLimit,
      scoreUpLimit,
      eventBonusDetail: contribution.eventBonusDetail
    });
    exact.estimatedFieldsUsed.forEach((field) => estimatedFieldsUsed.add(field));
    if (!exact.detail || exact.missingFields.length) {
      exact.missingFields.forEach((field) => missingFields.add(field));
      return null;
    }
    const baseline = buildDeckDetailLike([exact.detail]).power.total;
    return {
      card,
      owned,
      cardDetail: exact.detail,
      characterId: exact.detail.characterId,
      unit: exact.detail.units[0],
      attribute: exact.detail.attr,
      breakdown: {
        basePower: exact.detail.power.base,
        areaItemBonus: exact.detail.power.areaItemBonus,
        characterRankBonus: exact.detail.power.characterBonus,
        mysekaiCanvasBonus: service.canvasCardIds.has(card.id),
        mysekaiGateBonus: exact.detail.power.gateBonus,
        mysekaiFixtureBonus: exact.detail.power.fixtureBonus,
        totalPower: baseline
      },
      mysekaiTrace: {
        ...exact.trace,
        canvas: { matched: service.canvasCardIds.has(card.id) },
        gate: { matched: exact.detail.power.gateBonus > 0, units: exact.detail.units },
        fixture: {
          matched: exact.detail.power.fixtureBonus > 0,
          hits: service.fixtureBonuses.filter((row) => row.gameCharacterId === exact.detail?.characterId),
          limit: mysekaiFixtureLimit,
          rawTotalRate: service.fixtureBonuses.find((row) => row.gameCharacterId === exact.detail?.characterId)?.totalBonusRate ?? 0,
          truncatedRate: Math.max(0, (service.fixtureBonuses.find((row) => row.gameCharacterId === exact.detail?.characterId)?.totalBonusRate ?? 0) - mysekaiFixtureLimit)
        },
        limitApplied: isFinale && service.fixtureBonuses.some((row) => row.gameCharacterId === exact.detail?.characterId && row.totalBonusRate > mysekaiFixtureLimit)
      },
      missingFields: []
    };
  }))).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!cardResults.length) {
    return {
      region: input.region,
      eventId: input.eventId,
      specialCharacterId: input.specialCharacterId,
      calculationMode: input.calculationMode ?? "mysekai",
      recommendedCards: [],
      recommendedDeck: [],
      candidates: [],
      mysekaiRecommendations: { canvas: [], gates: [], fixtures: [], fixtureLimitHits: [], priorityOrder: [] },
      mysekaiDeckSearch: { decks: [], searchMode: input.search?.algorithm ?? "ga", stoppedReason: "no exact candidates", candidateCount: 0 },
      replacementCandidates: [],
      assetGapRanking: [],
      marginalGainTrace: { baseline: null, candidates: [] },
      mysekaiEventPoint: null,
      cardCalculatorTrace: [],
      mysekaiServiceTrace: service.trace,
      eventConfigTrace: eventConfig?.eventConfigTrace,
      fixtureLimitTrace: { isFinale, limit: mysekaiFixtureLimit, matchedRow: fixtureLimitRow },
      skillLimitTrace: { isFinale, limit: scoreUpLimit, matchedRow: skillLimitRow },
      deckCalculatorTrace: null,
      formulaVersion: MYSEKAI_VERSION,
      mysekaiVersion: MYSEKAI_VERSION,
      referenceParity: { status: "missing-data", cardCalculator: "missing-data", mysekaiService: service.missingFields.length ? "missing-data" : "matched", deckRecommend: "missing-data" },
      officialFieldsUsed: [...officialFieldsUsed],
      estimatedFieldsUsed: [...estimatedFieldsUsed],
      missingFields: [...missingFields],
      warnings: [...warnings, "No cards had complete reference CardCalculator inputs"],
      realDataRequired: true
    };
  }

  cardResults.sort((a, b) => b.breakdown.totalPower - a.breakdown.totalPower);
  const recommendedCards = cardResults.slice(0, 5);
  const searchOptions = {
    algorithm: input.search?.algorithm ?? "ga",
    beamWidth: input.search?.beamWidth ?? 24,
    candidatePoolSize: input.search?.candidatePoolSize ?? cardResults.length,
    uniqueCharacter: input.search?.uniqueCharacter ?? true,
    gaConfig: input.search?.gaConfig,
    eventBonus: input.eventBonus ?? (input.playerAssets?.["mysekai-event"] ? numberField(input.playerAssets["mysekai-event"], ["eventBonus", "bonusRate"], 0) : undefined),
    supportDeckBonus: input.supportDeckBonus ?? (input.playerAssets?.["mysekai-event"] ? numberField(input.playerAssets["mysekai-event"], ["supportDeckBonus", "supportBonusRate"], 0) : undefined)
  };
  const mysekaiDeckSearch = searchOptions.algorithm === "beam"
    ? {
        ...searchOptions,
        decks: deckSearch(cardResults, searchOptions),
        candidateCount: cardResults.length,
        candidatePoolSize: Math.min(cardResults.length, searchOptions.candidatePoolSize),
        searchMode: "deterministic-beam",
        stoppedReason: cardResults.length ? "beam compatibility mode" : "no candidates",
        referenceFormulaId: "pjsktools.mysekai.beamCompatibility",
        gaParity: "compatibility fallback only; default MySekai recommendation uses Moesekai-style GA"
      }
    : {
        ...searchOptions,
        ...gaDeckSearch(cardResults, searchOptions),
        algorithm: "ga"
      };
  const bestDeck = mysekaiDeckSearch.decks[0];
  const recommendedDeck = bestDeck?.cards ?? recommendedCards;
  const bestDeckDetail = deckDetailForCards(recommendedDeck);
  const totalDeckPower = bestDeckDetail.power.total;
  const resolvedEventBonus = searchOptions.eventBonus ?? bestDeckDetail.eventBonus ?? 0;
  const resolvedSupportDeckBonus = searchOptions.supportDeckBonus ?? bestDeckDetail.supportDeckBonus ?? 0;
  const mysekaiEvent = mysekaiEventPoint(totalDeckPower, resolvedEventBonus, resolvedSupportDeckBonus);
  const deckDetailTrace = {
    formulaVersion: `${sharedFormulaVersion}/${MYSEKAI_VERSION}`,
    referenceFormulaId: "Moesekai.DeckCalculator.getDeckDetailByCards + MysekaiEventCalculator.getMysekaiEventPointFunction",
    cardCount: recommendedDeck.length,
    power: {
      total: totalDeckPower,
      source: "DeckCalculator-backed MySekai card detail adapter total power"
    },
    eventBonus: resolvedEventBonus,
    supportDeckBonus: resolvedSupportDeckBonus,
    estimated: false,
    reason: "MySekai GA fitness consumes buildDeckDetailLike over MySekai canvas/gate/fixture card details; missing fixture/gate/canvas master mappings remain in missingFields."
  };
  const selectedCardIds = new Set(recommendedDeck.map((entry: any) => entry.card.id));
  const replacementCandidates = recommendedDeck.map((entry: any) => {
    const alternatives = cardResults
      .filter((candidate) => candidate.card.id !== entry.card.id && !selectedCardIds.has(candidate.card.id) && (!searchOptions.uniqueCharacter || candidate.characterId === entry.characterId || !recommendedDeck.some((deckEntry: any) => deckEntry.characterId === candidate.characterId)))
      .slice(0, 3)
      .map((candidate) => ({
        cardId: candidate.card.id,
        title: candidate.card.title,
        characterId: candidate.characterId,
        totalPower: candidate.breakdown.totalPower,
        deltaPower: candidate.breakdown.totalPower - entry.breakdown.totalPower,
        mysekaiEventPoint: mysekaiEventPoint(deckDetailPower(recommendedDeck.map((deckEntry: any) => deckEntry.card.id === entry.card.id ? candidate : deckEntry)), resolvedEventBonus, resolvedSupportDeckBonus)
      }));
    return {
      replaceCardId: entry.card.id,
      replaceTitle: entry.card.title,
      alternatives
    };
  });
  const missingCanvasCards = cardResults.filter((entry) => !entry.mysekaiTrace.canvas.matched).slice(0, 8).map((entry) => ({
    cardId: entry.card.id,
    characterId: entry.characterId,
    reason: "Canvas bonus was not found in uploaded data or master bonus mapping for this card"
  }));
  const missingGateUnits = [...new Set(cardResults.filter((entry) => !entry.mysekaiTrace.gate.matched && entry.unit).map((entry) => String(entry.unit)))].slice(0, 8).map((unit) => ({
    unit,
    candidateMasterGates: gates.filter((gate) => JSON.stringify(gate ?? "").toLowerCase().includes(unit.toLowerCase())).slice(0, 5),
    reason: "Uploaded MySekai gate data has no matching power bonus for this unit"
  }));
  const missingFixtureCharacters = cardResults.filter((entry) => !entry.mysekaiTrace.fixture.hits.length).slice(0, 8).map((entry) => ({
    characterId: entry.characterId,
    candidateFixtures: fixtures.filter((fixture) => JSON.stringify(fixture ?? "").includes(entry.characterId)).slice(0, 5),
    reason: "Uploaded fixture bonuses do not hit this character"
  }));
  const fixtureLimitHits = cardResults.filter((entry) => entry.mysekaiTrace.limitApplied).map((entry) => ({
    cardId: entry.card.id,
    characterId: entry.characterId,
    limit: entry.mysekaiTrace.fixture.limit,
    rawTotalRate: entry.mysekaiTrace.fixture.rawTotalRate,
    truncatedRate: entry.mysekaiTrace.fixture.truncatedRate
  }));
  async function rebuildCard(entry: any, nextService: Awaited<ReturnType<typeof resolveExactMysekaiServiceContext>>) {
    const contribution = buildCardContributionBreakdown({ card: entry.card, owned: entry.owned, playerAssets: nextService.playerAssets, eventConfig, target: "event" });
    return buildExactCardDetailLike({
      region: input.region,
      card: entry.card,
      owned: entry.owned,
      service: nextService,
      mysekaiFixtureLimit,
      scoreUpLimit,
      eventBonusDetail: contribution.eventBonusDetail
    });
  }
  async function marginalForService(nextService: Awaited<ReturnType<typeof resolveExactMysekaiServiceContext>>, affected: (entry: any) => boolean) {
    const rebuilt = await Promise.all(recommendedDeck.map(async (entry: any) => {
      if (!affected(entry)) return entry;
      const next = await rebuildCard(entry, nextService);
      return next.detail ? { ...entry, cardDetail: next.detail, breakdown: { ...entry.breakdown, totalPower: buildDeckDetailLike([next.detail]).power.total } } : entry;
    }));
    const power = deckDetailPower(rebuilt);
    const point = mysekaiEventPoint(power, resolvedEventBonus, resolvedSupportDeckBonus);
    return {
      deckPower: power,
      deltaPower: power - totalDeckPower,
      mysekaiEventPoint: point,
      deltaInternalPoint: point.mysekaiInternalPoint - mysekaiEvent.mysekaiInternalPoint,
      deltaFinalPoint: point.mysekaiEventPoint - mysekaiEvent.mysekaiEventPoint
    };
  }
  const canvasMarginals = await Promise.all(missingCanvasCards.map(async (item) => {
    const nextAssets = { ...playerAssets, "mysekai-canvas": [...asArray(playerAssets["mysekai-canvas"]), { cardId: item.cardId }] };
    const nextService = await resolveExactMysekaiServiceContext(input.region, nextAssets);
    return { type: "canvas", key: item.cardId, reason: item.reason, ...(await marginalForService(nextService, (entry) => entry.card.id === item.cardId)) };
  }));
  const gateMarginals = await Promise.all(missingGateUnits.map(async (item) => {
    const gate = gates.find((row) => stringField(row, ["unit"]) === item.unit);
    const gateId = stringField(gate, ["id"]);
    if (!gateId) return { type: "gate", key: item.unit, reason: item.reason, deltaPower: 0, deltaInternalPoint: 0, deltaFinalPoint: 0 };
    const current = asArray(playerAssets["mysekai-gates"]).find((row) => stringField(row, ["mysekaiGateId", "gateId", "id"]) === gateId);
    const nextLevel = numberField(current, ["mysekaiGateLevel", "level"], 0) + 1;
    const nextAssets = {
      ...playerAssets,
      "mysekai-gates": [...asArray(playerAssets["mysekai-gates"]).filter((row) => stringField(row, ["mysekaiGateId", "gateId", "id"]) !== gateId), { mysekaiGateId: gateId, mysekaiGateLevel: nextLevel }]
    };
    const nextService = await resolveExactMysekaiServiceContext(input.region, nextAssets);
    return { type: "gate", key: item.unit, gateId, nextLevel, reason: item.reason, ...(await marginalForService(nextService, (entry) => entry.cardDetail.units.includes(item.unit))) };
  }));
  const fixtureMarginals = await Promise.all(missingFixtureCharacters.map(async (item) => {
    const existing = asArray(playerAssets["mysekai-fixtures"]).find((row) => stringField(row, ["gameCharacterId", "characterId"]) === item.characterId);
    const nextRate = numberField(existing, ["totalBonusRate"], 0) + 1;
    const nextAssets = {
      ...playerAssets,
      "mysekai-fixtures": [...asArray(playerAssets["mysekai-fixtures"]).filter((row) => stringField(row, ["gameCharacterId", "characterId"]) !== item.characterId), { gameCharacterId: item.characterId, totalBonusRate: nextRate }]
    };
    const nextService = await resolveExactMysekaiServiceContext(input.region, nextAssets);
    return { type: "fixture", key: item.characterId, nextTotalBonusRate: nextRate, reason: item.reason, ...(await marginalForService(nextService, (entry) => entry.characterId === item.characterId)) };
  }));
  const mysekaiRecommendations = {
    canvas: missingCanvasCards,
    gates: missingGateUnits,
    fixtures: missingFixtureCharacters,
    fixtureLimitHits,
    priorityOrder: [
      missingGateUnits.length ? "upload or upgrade matching MySekai gates for recommended units" : undefined,
      missingFixtureCharacters.length ? "upload fixture bonuses that target recommended characters" : undefined,
      missingCanvasCards.length ? "upload canvas ownership for recommended cards" : undefined
    ].filter(Boolean)
  };
  const assetGapRanking = [
    ...canvasMarginals,
    ...gateMarginals,
    ...fixtureMarginals,
    ...fixtureLimitHits.map((item) => ({ type: "fixture-limit", key: item.cardId, deltaPower: 0, deltaInternalPoint: 0, deltaFinalPoint: 0, reason: `fixture bonus exceeds limit by ${item.truncatedRate}` }))
  ].sort((a, b) => Number(b.deltaInternalPoint ?? 0) - Number(a.deltaInternalPoint ?? 0));
  const marginalGainTrace = {
    referenceFormulaId: "Moesekai.CardCalculator.getCardDetail + DeckCalculator.getDeckDetailByCards + MysekaiEventCalculator",
    baseline: { deckPower: totalDeckPower, mysekaiEventPoint: mysekaiEvent },
    candidates: assetGapRanking
  };
  return {
    region: input.region,
    eventId: input.eventId,
    specialCharacterId: input.specialCharacterId,
    calculationMode: input.calculationMode ?? "mysekai",
    targetCharacterId: input.targetCharacterId,
    targetUnit: input.targetUnit,
    recommendedCards,
    recommendedDeck,
    mysekaiRecommendations,
    mysekaiDeckSearch,
    deckDetailTrace,
    cardDetailTrace: recommendedDeck.map((entry: any) => entry.mysekaiTrace).filter(Boolean),
    replacementCandidates,
    assetGapRanking,
    marginalGainTrace,
    mysekaiEventPoint: mysekaiEvent,
    cardCalculatorTrace: recommendedDeck.map((entry: any) => entry.cardDetail.trace),
    mysekaiServiceTrace: service.trace,
    eventConfigTrace: eventConfig?.eventConfigTrace,
    fixtureLimitTrace: {
      referenceFormulaId: "Moesekai.EventService.getMysekaiFixtureLimit",
      eventId: input.eventId,
      worldBloomType: eventConfig?.worldBloomType,
      isFinale,
      limit: mysekaiFixtureLimit,
      matchedRow: fixtureLimitRow,
      appliedCards: fixtureLimitHits
    },
    skillLimitTrace: {
      referenceFormulaId: "Moesekai.EventService.getEventSkillScoreUpLimit",
      eventId: input.eventId,
      isFinale,
      limit: scoreUpLimit,
      matchedRow: skillLimitRow,
      defaultedToUnlimited: isFinale && !skillLimitRow
    },
    deckCalculatorTrace: bestDeckDetail.deckCalculatorTrace,
    formulaVersion: MYSEKAI_VERSION,
    mysekaiVersion: MYSEKAI_VERSION,
    referenceSources: [
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/mysekai-information/mysekai-service.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/mysekai-information/mysekai-event-calculator.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/deck-recommend/mysekai-deck-recommend.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/user-data/user-mysekai-canvas.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/user-data/user-mysekai-gate.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/user-data/user-mysekai-fixture-game-character-performance-bonus.ts"
    ],
    referenceParity: {
      status: missingFields.size ? "missing-data" : "matched",
      cardCalculator: missingFields.size ? "missing-data" : "matched",
      mysekaiService: service.missingFields.length ? "missing-data" : "matched",
      fixtureLimit: isFinale && !fixtureLimitRow ? "missing-data" : "matched",
      deckRecommend: missingFields.size ? "missing-data" : "matched",
      keepAfterTrainingState: true,
      liveTypeContext: "multi",
      excludedInventoryCount: inventory.length - cardResults.length,
      referenceFiles: [
        "refer/Moesekai/refer/re_sekai-calculator/src/card-information/card-calculator.ts",
        "refer/Moesekai/refer/re_sekai-calculator/src/card-information/card-power-calculator.ts",
        "refer/Moesekai/refer/re_sekai-calculator/src/mysekai-information/mysekai-service.ts",
        "refer/Moesekai/refer/re_sekai-calculator/src/mysekai-information/mysekai-event-calculator.ts",
        "refer/Moesekai/refer/re_sekai-calculator/src/deck-recommend/mysekai-deck-recommend.ts"
      ]
    },
    totalEstimatedPower: totalDeckPower,
    candidates: cardResults,
    officialFieldsUsed: [...officialFieldsUsed],
    estimatedFieldsUsed: [...estimatedFieldsUsed],
    missingFields: [...missingFields],
    warnings,
    formulaSources: [
      "moe-sekai/Moesekai re_sekai-calculator MySekai/card-power references",
      "Moesekai metadata master and Suite player assets",
      "pjsktools v5 reference GA helper"
    ],
    realDataRequired: true
  };
}
