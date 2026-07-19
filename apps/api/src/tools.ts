import type { RegionId } from "./config.js";
import { buildContributions, estimateEventPoint, searchDecks, type DeckTarget, type LiveType, type UserCardState } from "./calcData.js";
import { getMasterCollection, getSongs } from "./masterData.js";
import { buildAssetReadiness, cardCharacterId, sharedFormulaVersion } from "./normalEventFormula.js";
import { getRankingBorderCached, getRankingHistory, getRankingSamples } from "./runtimeData.js";
import { getMusicMeta, getMusicMetas } from "./musicMeta.js";
import type { MultiLivePlayer, Skill15Strategy, Skill6Mode } from "./multiLiveCalculator.js";
import { recommendAreaItemUpgrades } from "./areaItemRecommend.js";
import { calculateMultiLive } from "./multiLiveCalculator.js";
import { calculateReferenceEventPoint } from "./normalEventFormula.js";
import { getBoostEnergyRate } from "./boostEnergy.js";
import { calculateLiveExact } from "./liveExactCalculator.js";

export type ScoreControlInput = {
  region?: RegionId;
  musicId?: string;
  difficulty?: string;
  liveType?: LiveType;
  currentPt: number;
  targetPt: number;
  remainingMinutes: number;
  ptPerRun?: number;
  eventBonusPercent?: number;
  baseScore?: number;
  boost?: number;
  availableRuns?: number;
  bonusPercent?: number;
  forecastWindowHours?: number;
  eventId?: string;
  targetRank?: number;
  inventory?: UserCardState[];
  playerAssets?: Record<string, unknown>;
  teammates?: MultiLivePlayer[];
  skill15Strategy?: Skill15Strategy;
  skill6Mode?: Skill6Mode;
  scoreMode?: "aggregate" | "exact";
  skills?: number[];
  multiSumPower?: number;
  feverMusicId?: string;
  feverDifficulty?: string;
};

export async function calculateScoreControl(input: ScoreControlInput) {
  const exact = input.scoreMode === "exact" && input.region
    ? await calculateLiveExact({
        region: input.region,
        musicId: input.musicId,
        difficulty: input.difficulty,
        power: input.baseScore ?? 0,
        skills: input.skills ?? [],
        liveType: input.liveType,
        multiSumPower: input.multiSumPower,
        feverMusicId: input.feverMusicId,
        feverDifficulty: input.feverDifficulty
      })
    : null;
  const exactScore = typeof exact?.total === "number" ? Math.floor(exact.total) : undefined;
  const eventPoint = input.region && (input.scoreMode !== "exact" || exactScore != null)
    ? await estimateEventPoint({
        region: input.region,
        musicId: input.musicId,
        difficulty: input.difficulty,
        liveType: input.liveType,
        eventBonusPercent: input.eventBonusPercent ?? input.bonusPercent,
        baseScore: exactScore ?? input.baseScore,
        boost: input.boost,
        targetPt: input.targetPt,
        currentPt: input.currentPt,
        inventory: input.inventory,
        playerAssets: input.playerAssets,
        teammates: input.teammates,
        skill15Strategy: input.skill15Strategy,
        skill6Mode: input.skill6Mode
      })
    : null;
  const rawPtPerRun = input.ptPerRun ?? eventPoint?.estimatedPt ?? 0;
  const adjustedPtPerRun = Math.max(0, input.ptPerRun == null ? rawPtPerRun : rawPtPerRun * (1 + (input.bonusPercent ?? 0) / 100));
  const remainingPt = Math.max(0, input.targetPt - input.currentPt);
  const remainingHours = Math.max(input.remainingMinutes / 60, 0);
  const requiredRuns = adjustedPtPerRun > 0 ? Math.ceil(remainingPt / adjustedPtPerRun) : null;
  const requiredPtPerHour = remainingHours > 0 ? Math.ceil(remainingPt / remainingHours) : null;
  const requiredRunsPerHour = requiredRuns != null && remainingHours > 0 ? requiredRuns / remainingHours : null;
  const warnings: string[] = [];

  if (remainingPt === 0) warnings.push("target already reached");
  if (input.remainingMinutes <= 0 && remainingPt > 0) warnings.push("remainingMinutes must be greater than 0");
  if (adjustedPtPerRun <= 0 && remainingPt > 0) warnings.push("ptPerRun or event point estimate is required");
  if (input.availableRuns != null && requiredRuns != null && input.availableRuns < requiredRuns) {
    warnings.push("availableRuns is lower than requiredRuns");
  }
  if (eventPoint?.missingFields.length) warnings.push(...eventPoint.missingFields);
  if (exact?.missingFields?.length) warnings.push(...exact.missingFields);
  let targetBorder = null;
  if (input.region && input.eventId && input.targetRank) {
    const borders = await getRankingBorderCached(input.region, input.eventId);
    targetBorder = (borders as any[]).find((line) => Number(line.rank ?? line.targetRank ?? line.borderRank) === input.targetRank) ?? null;
    if (!targetBorder) warnings.push("target rank border is unavailable");
  }

  return {
    remainingPt,
    adjustedPtPerRun,
    requiredRuns,
    requiredPtPerHour,
    requiredRunsPerHour,
    eventPointEstimate: eventPoint,
    eventPointBreakdown: eventPoint?.eventPointBreakdown ?? null,
    scoreMode: input.scoreMode ?? "aggregate",
    liveExactVersion: exact?.liveExactVersion,
    liveExactTrace: exact,
    musicScoreTrace: exact?.musicScoreTrace,
    noteScoreSummary: exact?.noteScoreSummary,
    formulaContext: eventPoint?.formulaContext ?? null,
    assetReadiness: eventPoint?.assetReadiness ?? null,
    sharedFormulaVersion,
    targetBorder,
    feasible: warnings.length === 0 || (warnings.length === 1 && warnings[0] === "target already reached"),
    warnings,
    fieldSources: {
      ptPerRun: input.ptPerRun == null ? (input.scoreMode === "exact" ? "LiveExactCalculator-backed event-point estimate" : "event-point-calc estimate") : "user input",
      eventBonusPercent: input.eventBonusPercent == null && input.bonusPercent == null ? "not provided" : "user input",
      music: eventPoint?.sources.music ?? "not used"
    },
    referenceParity: {
      ...(eventPoint?.referenceParity ?? {}),
      liveExactCalculator: exact?.referenceParity?.liveExactCalculator ?? (input.scoreMode === "exact" ? "missing-data" : "not-requested")
    },
    realDataRequired: true
  };
}

export type DeckRecommendInput = {
  region: RegionId;
  eventId?: string;
  musicId?: string;
  difficulty?: string;
  liveType?: LiveType;
  calculationMode?: "normal" | "challenge" | "world_bloom" | "wl" | "wl3";
  specialCharacterId?: string;
  gameCharacterId?: string;
  worldBloomSupportUnit?: string;
  worldBloomEventTurn?: number;
  ownedCardIds?: string[];
  inventory?: UserCardState[];
  playerAssets?: Record<string, unknown>;
  target?: DeckTarget;
  fixedCardIds?: string[];
  fixedCharacterIds?: string[];
  leaderCardId?: string;
  limit?: number;
  timeoutMs?: number;
  teammates?: MultiLivePlayer[];
  skill15Strategy?: Skill15Strategy;
  skill6Mode?: Skill6Mode;
};

export type NormalEventPlanInput = {
  region: RegionId;
  eventId?: string;
  musicId?: string;
  difficulty?: string;
  liveType?: LiveType;
  calculationMode?: "normal" | "challenge" | "world_bloom" | "wl" | "wl3";
  specialCharacterId?: string;
  gameCharacterId?: string;
  worldBloomSupportUnit?: string;
  worldBloomEventTurn?: number;
  currentPt?: number;
  targetPt?: number;
  remainingMinutes?: number;
  boost?: number;
  baseScore?: number;
  eventBonusPercent?: number;
  ownedCardIds?: string[];
  inventory?: UserCardState[];
  playerAssets?: Record<string, unknown>;
  preferredDifficulties?: string[];
  target?: DeckTarget;
  limit?: number;
  timeoutMs?: number;
  teammates?: MultiLivePlayer[];
  skill15Strategy?: Skill15Strategy;
  skill6Mode?: Skill6Mode;
};

export async function recommendDeck(input: DeckRecommendInput) {
  const inventory: UserCardState[] = input.inventory?.length
    ? input.inventory
    : (input.ownedCardIds ?? []).map((cardId) => ({ cardId }));
  const options = {
    ...input,
    inventory,
    target: input.target ?? "event",
    liveType: input.liveType ?? "solo",
    limit: input.limit ?? 3,
    timeoutMs: input.timeoutMs ?? 3000
  };
  const {
    eventConfig,
    formulaContext,
    assetReadiness,
    sharedFormulaVersion: formulaVersion,
    referenceSources,
    referenceParity,
    contributions,
    missingFields,
    officialFieldsUsed,
    estimatedFieldsUsed,
    deckDetailLike,
    cardDetailTrace,
    cardDetailMapTrace,
    deckDetailTrace,
    deckCalculatorTrace,
    wl3PowerCapTrace,
    resolvedOptions
  } = await buildContributions(options);
  const targetCharacterId = String((options.playerAssets?.["challenge-live"] as Record<string, unknown> | undefined)?.characterId ?? (options.playerAssets?.["challenge-live"] as Record<string, unknown> | undefined)?.gameCharacterId ?? "");
  const isChallengeMode = options.liveType === "challenge" || options.calculationMode === "challenge";
  const challengeCandidates = isChallengeMode
    ? contributions.filter((item) => !targetCharacterId || cardCharacterId(item.card) === targetCharacterId)
    : [];
  const searchableContributions = isChallengeMode && targetCharacterId ? challengeCandidates : contributions;
  const musicMetaResult = await getMusicMeta(input.musicId, input.difficulty);
  const search = searchDecks(searchableContributions, { ...resolvedOptions, musicMeta: musicMetaResult.meta });
  const recommendedCards = search.decks[0]?.cards ?? searchableContributions.slice(0, 5);
  const challengeDecks = isChallengeMode
    ? search.decks.map((deck) => ({
        ...deck,
        challengeScoreTrace: {
          targetCharacterId: targetCharacterId || undefined,
          candidateCount: challengeCandidates.length,
          filteredOutCount: contributions.length - challengeCandidates.length,
          fixedCards: options.fixedCardIds ?? [],
          allowsDuplicateCharacters: true,
          scorePath: "Moesekai ChallengeLiveDeckRecommend: filter cards by characterId, then recommendHighScoreDeck with Challenge live type",
          deckDetailTrace: deck.deckDetail?.deckCalculatorTrace ?? (deck.cards?.[0]?.cardDetailLike ? "DeckCalculator detail scoring is used when all cards have detail maps" : "DeckCalculator detail unavailable"),
          liveCalculatorTrace: deck.liveCalculatorTrace,
          challengeSearchTrace: search.challengeSearchTrace
        }
      }))
    : undefined;

  return {
    region: input.region,
    eventId: input.eventId,
    musicId: input.musicId,
    difficulty: input.difficulty,
    liveType: options.liveType,
    formulaMode: options.calculationMode ?? (options.liveType === "challenge" ? "challenge" : "normal"),
    target: options.target,
    recommendedCards,
    recommendedDecks: search.decks,
    challengeDecks,
    candidates: contributions,
    formulaContext,
    assetReadiness,
    sharedFormulaVersion: formulaVersion,
    formulaVersion,
    referenceSources,
    referenceParity,
    cardDetailTrace,
    cardDetailMapTrace,
    deckDetailTrace,
    deckCalculatorTrace,
    deckDetail: deckDetailLike,
    liveScoreTrace: {
      referenceFormulaId: "Moesekai.LiveCalculator.getLiveScoreFunction",
      mode: isChallengeMode ? "challenge high-score deck scoring" : "normal deck recommendation scoring",
      estimated: false,
      deckCalculatorBacked: true,
      musicMetaTrace: musicMetaResult.sourceHealth,
      challengeSearchTrace: search.challengeSearchTrace
    },
    musicMetaTrace: musicMetaResult.sourceHealth,
    challengeSearchTrace: search.challengeSearchTrace,
    wl3PowerCapTrace,
    eventBonusConfig: eventConfig
      ? {
          eventId: eventConfig.eventId,
          eventType: eventConfig.eventType,
          missingFields: eventConfig.missingFields,
          source: eventConfig.source
        }
      : null,
    searchMode: search.calculationMode,
    timedOut: search.timedOut,
    candidateCount: search.candidateCount,
    totalCandidateCount: search.totalCandidateCount,
    officialFieldsUsed,
    estimatedFieldsUsed,
    missingFields,
    formulaSources: ["Sekai-World/sekai-viewer EventPointCalc/eventCardBonus", "moe-sekai/Moesekai re_sekai-calculator deck-recommend", "local deterministic DFS/pruning"],
    note: "Deck recommendation uses shared normal-event-v4.2-reference formula context with reference CardPower/CardSkill data, CardDetailMap-backed DeckCalculator detail, and music-meta-backed LiveCalculator scoring. Missing raw master/user fields stay in missingFields.",
    realDataRequired: true
  };
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function targetCardsFromDeck(deck: Awaited<ReturnType<typeof recommendDeck>>) {
  return (deck.recommendedDecks?.[0]?.cards ?? deck.recommendedCards ?? []).slice(0, 5).map((entry: any) => ({
    cardId: String(entry.card?.id ?? entry.cardId ?? ""),
    characterId: String(entry.cardContributionBreakdown?.characterId ?? entry.card?.characterId ?? entry.characterId ?? ""),
    unit: entry.card?.unit,
    attribute: entry.card?.attribute
  })).filter((item) => item.cardId || item.characterId);
}

export async function calculateNormalEventPlan(input: NormalEventPlanInput) {
  const inventory: UserCardState[] = input.inventory?.length
    ? input.inventory
    : (input.ownedCardIds ?? []).map((cardId) => ({ cardId }));
  const playerAssets = input.playerAssets ?? {};
  const targetPt = input.targetPt ?? 1_000_000;
  const currentPt = input.currentPt ?? 0;
  const remainingMinutes = input.remainingMinutes ?? 180;
  const limit = input.limit ?? 5;

  const deck = await recommendDeck({
    region: input.region,
    eventId: input.eventId,
    musicId: input.musicId,
    difficulty: input.difficulty,
    liveType: input.liveType ?? "solo",
    calculationMode: input.calculationMode,
    specialCharacterId: input.specialCharacterId,
    gameCharacterId: input.gameCharacterId,
    worldBloomSupportUnit: input.worldBloomSupportUnit,
    worldBloomEventTurn: input.worldBloomEventTurn,
    ownedCardIds: input.ownedCardIds,
    inventory,
    playerAssets,
    target: input.target ?? "event",
    limit: Math.min(limit, 5),
    timeoutMs: input.timeoutMs ?? 3000
  });
  const derivedEventBonusPercent = input.eventBonusPercent
    ?? deck.recommendedDecks?.[0]?.totalEventBonus
    ?? deck.recommendedCards?.reduce((sum: number, item: any) => sum + Number(item.eventBonus ?? 0), 0)
    ?? 0;

  const eventPoint = await estimateEventPoint({
    region: input.region,
    eventId: input.eventId,
    musicId: input.musicId,
    difficulty: input.difficulty,
    liveType: input.liveType ?? "solo",
    calculationMode: input.calculationMode,
    specialCharacterId: input.specialCharacterId,
    gameCharacterId: input.gameCharacterId,
    worldBloomSupportUnit: input.worldBloomSupportUnit,
    worldBloomEventTurn: input.worldBloomEventTurn,
    eventBonusPercent: derivedEventBonusPercent,
    baseScore: input.baseScore,
    boost: input.boost,
    targetPt,
    currentPt,
    inventory,
    playerAssets,
    teammates: input.teammates,
    skill15Strategy: input.skill15Strategy,
    skill6Mode: input.skill6Mode
  });
  const scoreControl = await calculateScoreControl({
    region: input.region,
    eventId: input.eventId,
    musicId: input.musicId,
    difficulty: input.difficulty,
    liveType: input.liveType ?? "solo",
    currentPt,
    targetPt,
    remainingMinutes,
    boost: input.boost,
    baseScore: input.baseScore,
    eventBonusPercent: derivedEventBonusPercent,
    ptPerRun: eventPoint.estimatedPt,
    inventory,
    playerAssets,
    teammates: input.teammates,
    skill15Strategy: input.skill15Strategy,
    skill6Mode: input.skill6Mode
  });
  const musicResults = Array.isArray(playerAssets["music-results"]) ? playerAssets["music-results"] as any[] : [];
  const preferredDifficulties = input.preferredDifficulties ?? [...new Set(musicResults.map((item) => String(item.difficulty ?? item.musicDifficulty ?? "")).filter(Boolean))];
  const music = await recommendMusic({
    region: input.region,
    eventId: input.eventId,
    targetPt,
    currentPt,
    eventBonusPercent: derivedEventBonusPercent,
    preferredDifficulties,
    limit,
    liveType: input.liveType ?? "solo",
    boost: input.boost,
    baseScore: input.baseScore,
    inventory,
    playerAssets,
    teammates: input.teammates,
    skill15Strategy: input.skill15Strategy,
    skill6Mode: input.skill6Mode
  });
  const area = await recommendAreaItems({
    region: input.region,
    currentItems: Array.isArray(playerAssets["area-items"]) ? playerAssets["area-items"] as any[] : undefined,
    materials: playerAssets.materials,
    targetCards: targetCardsFromDeck(deck),
    inventory,
    playerAssets,
    limit
  });
  const missingFields = uniqueStrings([deck.missingFields, eventPoint.missingFields, scoreControl.warnings, music.missingFields, area.missingFields]);
  const warnings = uniqueStrings([deck.note, deck.formulaContext?.warnings, eventPoint.warnings, scoreControl.warnings, music.warnings, area.warnings]);
  return {
    region: input.region,
    eventId: input.eventId,
    musicId: input.musicId,
    difficulty: input.difficulty,
    targetPt,
    currentPt,
    remainingMinutes,
    sharedFormulaVersion,
    formulaVersion: sharedFormulaVersion,
    referenceParity: deck.referenceParity ?? eventPoint.referenceParity,
    referenceSources: uniqueStrings([deck.referenceSources, eventPoint.referenceSources, music.referenceSources]),
    derivedEventBonusPercent,
    deck,
    eventPoint,
    scoreControl,
    music,
    area,
    sections: {
      deck: { ready: Boolean(deck.recommendedCards?.length), missingFields: deck.missingFields, warnings: [deck.note].filter(Boolean) },
      eventPoint: { ready: eventPoint.estimatedPt > 0, missingFields: eventPoint.missingFields, warnings: eventPoint.warnings },
      scoreControl: { ready: scoreControl.requiredRuns != null || scoreControl.remainingPt === 0, missingFields: scoreControl.warnings, warnings: scoreControl.warnings },
      music: { ready: Boolean(music.recommendations.length), missingFields: music.missingFields, warnings: music.warnings },
      area: { ready: Boolean(area.recommendations.length), missingFields: area.missingFields, warnings: area.warnings }
    },
    assetReadiness: deck.assetReadiness ?? buildAssetReadiness(inventory, playerAssets),
    formulaContext: deck.formulaContext ?? eventPoint.formulaContext,
    missingFields,
    warnings,
    formulaSources: uniqueStrings([deck.formulaSources, eventPoint.formulaSources, music.formulaSources, "local normal-event-plan orchestration"]),
    calculationTrace: uniqueStrings([eventPoint.calculationTrace, "normal-event-plan orchestrates deck/event-point/score-control/music/area outputs without recalculating divergent formulas"]),
    realDataRequired: true
  };
}

export async function recommendMusic(input: {
  region: RegionId;
  targetPt?: number;
  currentPt?: number;
  eventBonusPercent?: number;
  preferredDifficulties?: string[];
  maxDurationSeconds?: number;
  minNoteCount?: number;
  limit?: number;
  liveType?: LiveType;
  boost?: number;
  baseScore?: number;
  eventId?: string;
  inventory?: UserCardState[];
  playerAssets?: Record<string, unknown>;
  teammates?: MultiLivePlayer[];
  skill15Strategy?: Skill15Strategy;
  skill6Mode?: Skill6Mode;
}) {
  const songs = await getSongs(input.region);
  const preferred = new Set((input.preferredDifficulties ?? []).map((item) => item.toLowerCase()));
  let base = input.baseScore;
  let selfEffectiveness: number | undefined;
  if (base == null && input.inventory?.length && (input.liveType === "multi" || input.liveType === "cheerful")) {
    const built = await buildContributions({
      region: input.region,
      eventId: input.eventId,
      inventory: input.inventory,
      playerAssets: input.playerAssets,
      target: "power",
      liveType: input.liveType
    });
    const search = searchDecks(built.contributions, { ...built.resolvedOptions, target: "power", limit: 1 });
    const detail = search.decks[0]?.deckDetail;
    if (detail) {
      base = detail.power.total;
      selfEffectiveness = detail.multiLiveScoreUp;
    }
  }
  base ??= 1000;
  const liveMultiplier = input.liveType === "auto" ? 0.7 : input.liveType === "multi" || input.liveType === "cheerful" ? 1.08 : 1;
  const boostMultiplier = getBoostEnergyRate(input.boost);
  const eventMultiplier = 1 + Math.max(0, input.eventBonusPercent ?? 0) / 100;
  const candidates: Array<{
    music: Pick<(typeof songs)[number], "id" | "title" | "unit" | "durationSeconds" | "assets">;
    difficulty: NonNullable<(typeof songs)[number]["difficultyDetails"]>[number];
    estimatedPt: number;
    estimatedPtPerMinute: number;
    estimatedRunsToTarget?: number;
    missingFields: string[];
    sourceMetadata: Record<string, string>;
  }> = [];
  for (const song of songs) {
    for (const difficulty of song.difficultyDetails ?? []) {
      if (preferred.size && !preferred.has(difficulty.difficulty.toLowerCase())) continue;
      if (input.maxDurationSeconds && song.durationSeconds && song.durationSeconds > input.maxDurationSeconds) continue;
      if (input.minNoteCount && difficulty.totalNoteCount < input.minNoteCount) continue;
      const difficultyMultiplier = 1 + Math.max(0, difficulty.playLevel - 5) / 100;
      const estimatedPt = Math.round(base * liveMultiplier * boostMultiplier * eventMultiplier * difficultyMultiplier);
      const duration = song.durationSeconds ?? 120;
      const estimatedPtPerMinute = Math.round(estimatedPt / Math.max(duration / 60, 1));
      candidates.push({
        music: { id: song.id, title: song.title, unit: song.unit, durationSeconds: song.durationSeconds, assets: song.assets },
        difficulty,
        estimatedPt,
        estimatedPtPerMinute,
        estimatedRunsToTarget:
          input.targetPt == null ? undefined : Math.ceil(Math.max(0, input.targetPt - (input.currentPt ?? 0)) / Math.max(estimatedPt, 1)),
        missingFields: ["pre-rank candidate; final recommendation uses shared event-point estimate"],
        sourceMetadata: {
          music: "real master",
          difficulty: "real master",
          eventPoint: "shared event-point-calc estimate, batched for recommendation"
        }
      });
    }
  }
  const metaCache = await getMusicMetas().catch(() => undefined);
  const metaMap = new Map((metaCache?.rows ?? []).map((meta) => [`${meta.musicId}:${meta.difficulty.toLowerCase()}`, meta]));
  const summaries = candidates.map((candidate) => {
      const meta = metaMap.get(`${candidate.music.id}:${candidate.difficulty.difficulty.toLowerCase()}`);
      const teammates = input.teammates?.length === 4 ? input.teammates : Array.from({ length: 4 }, () => ({ power: 200000, effectiveness: 200 }));
      const multi = (input.liveType === "multi" || input.liveType === "cheerful") && meta && selfEffectiveness != null
        ? calculateMultiLive({ players: [{ power: base, effectiveness: selfEffectiveness }, ...teammates] as any, musicMeta: meta, skill15Strategy: input.skill15Strategy, skill6Mode: input.skill6Mode })
        : null;
      const selfScore = multi?.selfScore ?? base;
      const point = meta ? calculateReferenceEventPoint({
        liveType: input.liveType,
        selfScore,
        otherScore: multi?.otherScore,
        musicRate: meta.eventRate,
        deckBonus: input.eventBonusPercent ?? 0,
        boostRate: getBoostEnergyRate(input.boost)
      }) : null;
      const estimatedPt = point?.estimatedPt ?? 0;
      return {
        ...candidate,
        estimatedPt,
        estimatedPtPerMinute: Math.round(estimatedPt / Math.max((candidate.music.durationSeconds ?? 120) / 60, 1)),
        missingFields: meta ? [] : [`musicMeta:${candidate.music.id}:${candidate.difficulty.difficulty}`]
      };
    });
  summaries.sort((a, b) => b.estimatedPtPerMinute - a.estimatedPtPerMinute);
  const recommendations = await Promise.all(summaries.slice(0, input.limit ?? 10).map(async (candidate) => {
    const point = await estimateEventPoint({
      region: input.region, eventId: input.eventId, musicId: candidate.music.id, difficulty: candidate.difficulty.difficulty,
      liveType: input.liveType, eventBonusPercent: input.eventBonusPercent, boost: input.boost, baseScore: base,
      selfEffectiveness, targetPt: input.targetPt, currentPt: input.currentPt, inventory: input.inventory,
      playerAssets: input.playerAssets, teammates: input.teammates, skill15Strategy: input.skill15Strategy, skill6Mode: input.skill6Mode
    });
    return { ...candidate, estimatedPt: point.estimatedPt, estimatedRunsToTarget: point.estimatedRunsToTarget, eventPointEstimate: point, missingFields: point.missingFields };
  }));
  return {
    region: input.region,
    recommendations,
    sharedFormulaVersion,
    formulaVersion: sharedFormulaVersion,
    referenceSources: ["moe-sekai/Moesekai refer/re_sekai-calculator/src/music-recommend/music-recommend.ts"],
    referenceParity: {
      musicRecommend: "matched when deck, teammate configuration, and musicMeta are complete; every eligible song is evaluated through the shared event-point core before ranking"
    },
    assetReadiness: buildAssetReadiness(input.inventory, input.playerAssets),
    officialFieldsUsed: ["music master", "music difficulty"],
    estimatedFieldsUsed: input.teammates?.length === 4 ? [] : ["default teammate power/effectiveness assumption for multi-live"],
    missingFields: [...new Set(recommendations.flatMap((item) => item.missingFields))],
    formulaSources: ["moe-sekai/Moesekai music-recommend", "shared multi-live/event-point core"],
    warnings: candidates.length ? [] : ["No music matched the filters"],
    realDataRequired: true
  };
}

export async function recommendAreaItems(input: {
  region: RegionId;
  currentItems?: Array<{ areaItemId?: string; id?: string; level?: number }>;
  targetCards?: Array<{ characterId?: string; cardId?: string; unit?: string; attribute?: string }>;
  materials?: unknown;
  inventory?: UserCardState[];
  playerAssets?: Record<string, unknown>;
  cardIds?: string[];
  sortBy?: "coin-efficiency" | "power-gain" | "affordable";
  includeUnaffordable?: boolean;
  limit?: number;
}) {
  const cardIds = input.cardIds ?? input.targetCards?.map((card) => card.cardId).filter((id): id is string => Boolean(id));
  const result = await recommendAreaItemUpgrades({
    region: input.region,
    currentItems: input.currentItems,
    inventory: input.inventory,
    playerAssets: input.playerAssets,
    materials: input.materials,
    cardIds,
    sortBy: input.sortBy,
    includeUnaffordable: input.includeUnaffordable,
    limit: input.limit
  });
  return {
    ...result,
    sharedFormulaVersion,
    formulaVersion: sharedFormulaVersion,
    assetReadiness: buildAssetReadiness(input.inventory, input.playerAssets ?? { "area-items": input.currentItems, materials: input.materials }),
    referenceSources: result.referenceParity.referenceFiles,
    officialFieldsUsed: ["areas", "areaItems", "areaItemLevels", "shopItems", "CardCalculator", "DeckCalculator"],
    formulaSources: result.referenceParity.referenceFiles
  };
}

function lineRank(line: any) {
  return Number(line?.rank ?? line?.targetRank ?? line?.borderRank ?? 0);
}

function lineScore(line: any) {
  return Number(line?.score ?? line?.point ?? line?.eventPoint ?? 0);
}

function confidenceFor(sampleCount: number, sampleHours: number) {
  if (sampleCount >= 4 && sampleHours >= 1) {
    return {
      confidence: "medium",
      confidenceReason: "Enough samples across at least one hour for a basic trend estimate"
    };
  }
  if (sampleCount >= 2) {
    return {
      confidence: "low",
      confidenceReason: "Only a short sample window is available; treat this as directional"
    };
  }
  return {
    confidence: "unavailable",
    confidenceReason: "At least two samples are required before a speed can be estimated"
  };
}

function forecastLineFromSeries(line: { rank: number; score: number; updatedAt?: string; hourlyGrowth?: number }, samples: any[], windowHours?: number) {
  const rank = line.rank;
  const series: Array<{ sampledAt: string; score: number; sourceMetadata?: unknown }> = [];
  for (const sample of samples) {
    if ("score" in sample && "sampledAt" in sample && Number(sample.rank) === rank) {
      const score = Number(sample.score);
      if (Number.isFinite(score) && score > 0) series.push({ sampledAt: sample.sampledAt, score, sourceMetadata: sample.sourceMetadata });
      continue;
    }
    const matched = sample.borders?.find((item: any) => lineRank(item) === rank);
    if (matched) {
      const score = lineScore(matched);
      if (Number.isFinite(score) && score > 0) series.push({ sampledAt: sample.sampledAt, score, sourceMetadata: sample.sourceMetadata });
    }
  }
  series.sort((a, b) => Date.parse(a.sampledAt) - Date.parse(b.sampledAt));
  const last = series.at(-1);
  const filteredSeries = windowHours && last
    ? series.filter((item) => (Date.parse(last.sampledAt) - Date.parse(item.sampledAt)) / 3_600_000 <= windowHours)
    : series;
  const first = filteredSeries[0];
  const windowLast = filteredSeries.at(-1);
  const sampleHours = first && windowLast ? (Date.parse(windowLast.sampledAt) - Date.parse(first.sampledAt)) / 3_600_000 : 0;
  const sampledHourlyGrowth = first && windowLast && sampleHours > 0 ? Math.max(0, (windowLast.score - first.score) / sampleHours) : null;
  const hourlyGrowth = sampledHourlyGrowth ?? line.hourlyGrowth ?? null;
  const confidence = confidenceFor(filteredSeries.length, sampleHours);
  const sourceMetadata = windowLast?.sourceMetadata && typeof windowLast.sourceMetadata === "object" ? windowLast.sourceMetadata as Record<string, unknown> : {};
  const sampleSource = String(sourceMetadata.source ?? "ranking-history");
  return {
    rank,
    currentScore: line.score,
    updatedAt: line.updatedAt,
    sampleCount: filteredSeries.length,
    firstSampledAt: first?.sampledAt ?? null,
    latestSampledAt: windowLast?.sampledAt ?? null,
    sampleSpanHours: Math.round(sampleHours * 100) / 100,
    sampleHours: Math.round(sampleHours * 100) / 100,
    hourlyGrowth: hourlyGrowth == null ? null : Math.round(hourlyGrowth),
    speedPerHour: hourlyGrowth == null ? null : Math.round(hourlyGrowth),
    forecast1h: hourlyGrowth != null ? Math.round(line.score + hourlyGrowth) : null,
    forecast3h: hourlyGrowth != null ? Math.round(line.score + hourlyGrowth * 3) : null,
    forecastEnd: null,
    ...confidence,
    sampleSource,
    sourceHealth: {
      status: windowLast ? "ok" : "empty",
      latestSampledAt: windowLast?.sampledAt ?? null,
      sampleCount: filteredSeries.length,
      sampleSpanHours: Math.round(sampleHours * 100) / 100
    },
    unavailableReason: hourlyGrowth != null ? undefined : "not enough historical samples for a reliable forecast"
  };
}

export async function forecastRanking(region: RegionId, eventId: string, options: { windowHours?: number } = {}) {
  const borders = (await getRankingBorderCached(region, eventId)) as Array<{
    rank: number;
    score: number;
    updatedAt?: string;
    hourlyGrowth?: number;
  }>;
  const persistentSamples = await getRankingHistory({ region, eventId, sampleType: "border", limit: 5000 });
  const runtimeSamples = await getRankingSamples(region, eventId);
  const samples = persistentSamples.length ? persistentSamples : runtimeSamples;
  const generatedAt = new Date().toISOString();
  const windowHours = options.windowHours && options.windowHours > 0 ? options.windowHours : undefined;
  const windowOptions = [undefined, 1, 3, 6];
  const windows = Object.fromEntries(windowOptions.map((hours) => [
    hours ? `${hours}h` : "all",
    borders.map((line) => forecastLineFromSeries(line, samples, hours))
  ]));
  const lines = windowHours ? windows[`${windowHours}h`] ?? borders.map((line) => forecastLineFromSeries(line, samples, windowHours)) : windows.all;
  const windowSummaries = Object.fromEntries(Object.entries(windows).map(([key, value]) => {
    const sampleCounts = value.map((line: any) => Number(line.sampleCount ?? 0));
    const spanHours = value.map((line: any) => Number(line.sampleSpanHours ?? line.sampleHours ?? 0));
    const confidenceValues = value.map((line: any) => line.confidence);
    return [key, {
      lineCount: value.length,
      maxSampleCount: Math.max(0, ...sampleCounts),
      maxSampleSpanHours: Math.max(0, ...spanHours),
      confidence: confidenceValues.includes("medium") ? "medium" : confidenceValues.includes("low") ? "low" : "unavailable"
    }];
  }));
  const sourceHealth = {
    status: samples.length ? "ok" : "empty",
    sampleSource: persistentSamples.length ? "persistent-ranking-history" : "runtime-cache",
    sampleCount: samples.length,
    latestSampledAt: samples
      .map((sample: any) => sample.sampledAt)
      .filter(Boolean)
      .sort((a: string, b: string) => Date.parse(b) - Date.parse(a))[0] ?? null
  };
  const warnings = [
    ...(samples.length ? [] : ["No ranking history samples are available yet"]),
    ...(persistentSamples.length ? [] : ["Using runtime-cache fallback because no persistent history samples were found"])
  ];
  return {
    region,
    eventId,
    generatedAt,
    experimental: true,
    basis: "real ranking samples cached from upstream; reliability depends on sample history length",
    sampleCount: samples.length,
    source: persistentSamples.length ? "persistent-ranking-history" : "runtime-cache",
    windowHours: windowHours ?? "all",
    lines,
    windows,
    windowSummaries,
    sourceHealth,
    retentionRecommendation: "Keep raw ranking_history_samples for the active event; cleanup policy should be explicit and separate from forecasting.",
    warnings,
    realDataRequired: true
  };
}
