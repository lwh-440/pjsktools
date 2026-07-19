import type { RegionId } from "./config.js";
import { buildContributions, type UserCardState } from "./calcData.js";
import { buildDeckDetailLike } from "./formulaDetail.js";
import { getMusicMeta } from "./musicMeta.js";
import { calculateReferenceEventPoint } from "./normalEventFormula.js";
import { calculateMultiLive, multiLiveVersion, type MultiLivePlayer, type Skill15Strategy, type Skill6Mode } from "./multiLiveCalculator.js";
import { calculateLiveExact, liveExactVersion } from "./liveExactCalculator.js";
import { getBoostEnergyRate } from "./boostEnergy.js";

export type DeckCompareCandidate = {
  id?: string;
  name?: string;
  cardIds?: string[];
  power?: number;
  effectiveness?: number;
};

export type DeckCompareInput = {
  region: RegionId;
  musicId: string;
  difficulty: string;
  candidates: DeckCompareCandidate[];
  inventory?: UserCardState[];
  playerAssets?: Record<string, unknown>;
  teammates?: MultiLivePlayer[];
  skill15Strategy?: Skill15Strategy;
  skill6Mode?: Skill6Mode;
  eventBonusPercent?: number;
  boost?: number;
  liveType?: "multi" | "cheerful";
  scoreMode?: "aggregate" | "exact";
  skills?: number[];
  multiSumPower?: number;
  feverMusicId?: string;
  feverDifficulty?: string;
};

async function resolveCandidate(input: DeckCompareInput, candidate: DeckCompareCandidate) {
  if (candidate.power != null && candidate.effectiveness != null) {
    return { power: candidate.power, effectiveness: candidate.effectiveness, source: "manual" as const, missingFields: [] as string[] };
  }
  const cardIds = candidate.cardIds ?? [];
  const inventory = (input.inventory ?? []).filter((card) => cardIds.includes(card.cardId));
  if (!cardIds.length || inventory.length !== cardIds.length) {
    return { power: 0, effectiveness: 0, source: "inventory" as const, missingFields: ["candidate cardIds with matching inventory state"] };
  }
  const built = await buildContributions({
    region: input.region,
    inventory,
    playerAssets: input.playerAssets,
    liveType: "multi",
    target: "power",
    fixedCardIds: cardIds
  });
  const details = cardIds.map((id) => built.contributions.find((item) => item.card.id === id)?.cardDetailLike).filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (details.length !== cardIds.length) {
    return { power: 0, effectiveness: 0, source: "inventory" as const, missingFields: ["complete CardCalculator detail for candidate deck", ...built.missingFields] };
  }
  const deck = buildDeckDetailLike(details, { missingFields: built.missingFields });
  return {
    power: deck.power.total,
    effectiveness: deck.multiLiveScoreUp,
    source: "CardCalculator/DeckCalculator" as const,
    deckDetail: deck,
    missingFields: built.missingFields
  };
}

export async function compareDecks(input: DeckCompareInput) {
  const musicMeta = await getMusicMeta(input.musicId, input.difficulty);
  const configuredTeammates = input.teammates?.slice(0, 4) ?? [];
  const teammateAssumption = configuredTeammates.length !== 4;
  const comparisons = [];
  for (let index = 0; index < input.candidates.length; index += 1) {
    const candidate = input.candidates[index];
    const resolved = await resolveCandidate(input, candidate);
    const missingFields = [...resolved.missingFields];
    if (!musicMeta.meta) missingFields.push(...musicMeta.sourceHealth.missingFields);
    if (resolved.power <= 0) missingFields.push("candidate power");
    if (resolved.effectiveness < 0) missingFields.push("candidate effectiveness");
    const teammates = teammateAssumption
      ? Array.from({ length: 4 }, () => ({ power: 200_000, effectiveness: 200, label: "assumed teammate" }))
      : configuredTeammates;
    const players = [{ power: resolved.power, effectiveness: resolved.effectiveness, label: candidate.name ?? candidate.id ?? `candidate-${index + 1}` }, ...teammates] as [MultiLivePlayer, MultiLivePlayer, MultiLivePlayer, MultiLivePlayer, MultiLivePlayer];
    const multi = musicMeta.meta && resolved.power > 0 ? calculateMultiLive({ players, musicMeta: musicMeta.meta, skill15Strategy: input.skill15Strategy, skill6Mode: input.skill6Mode }) : null;
    const totalPower = input.multiSumPower ?? players.reduce((sum, player) => sum + player.power, 0);
    const exactScores = input.scoreMode === "exact"
      ? await Promise.all(players.map((player) => calculateLiveExact({
          region: input.region,
          musicId: input.musicId,
          difficulty: input.difficulty,
          power: player.power,
          skills: input.skills?.length ? input.skills : Array.from({ length: 6 }, () => player.effectiveness),
          liveType: input.liveType ?? "multi",
          multiSumPower: totalPower,
          feverMusicId: input.feverMusicId,
          feverDifficulty: input.feverDifficulty
        })))
      : [];
    const exactMissing = [...new Set(exactScores.flatMap((score) => score.missingFields ?? []))];
    if (input.scoreMode === "exact") missingFields.push(...exactMissing);
    const exactSelfScore = typeof exactScores[0]?.total === "number" ? Math.floor(exactScores[0].total) : null;
    const exactOtherScore = exactScores.length === 5 && exactScores.slice(1).every((score) => typeof score.total === "number")
      ? exactScores.slice(1).reduce((sum, score) => sum + Math.floor(score.total as number), 0)
      : null;
    const finalSelfScore = input.scoreMode === "exact" ? exactSelfScore : multi?.selfScore ?? null;
    const finalOtherScore = input.scoreMode === "exact" ? exactOtherScore : multi?.otherScore ?? undefined;
    const meta = musicMeta.meta;
    const canCalculateEventPoint = finalSelfScore != null && meta && (input.scoreMode !== "exact" || exactOtherScore != null);
    const eventPoint = canCalculateEventPoint ? calculateReferenceEventPoint({
      liveType: input.liveType ?? "multi",
      selfScore: finalSelfScore,
      otherScore: finalOtherScore ?? undefined,
      musicRate: meta.eventRate,
      deckBonus: input.eventBonusPercent ?? resolved.deckDetail?.eventBonus ?? 0,
      supportDeckBonus: resolved.deckDetail?.supportDeckBonus,
      boostRate: getBoostEnergyRate(input.boost)
    }) : null;
    comparisons.push({
      id: candidate.id ?? `candidate-${index + 1}`,
      name: candidate.name ?? `Candidate ${index + 1}`,
      source: resolved.source,
      power: resolved.power,
      effectiveness: resolved.effectiveness,
      score: finalSelfScore,
      eventPoint: eventPoint?.estimatedPt ?? null,
      deckDetail: resolved.deckDetail,
      multiLiveTrace: multi,
      liveExactTrace: input.scoreMode === "exact" ? exactScores[0] : undefined,
      teammateLiveExactTrace: input.scoreMode === "exact" ? exactScores.slice(1).map((score, playerIndex) => ({
        label: players[playerIndex + 1]?.label,
        total: score.total,
        missingFields: score.missingFields,
        noteScoreSummary: score.noteScoreSummary
      })) : undefined,
      eventCalculatorTrace: eventPoint,
      missingFields: [...new Set(missingFields)],
      estimatedFieldsUsed: teammateAssumption ? ["default teammate power/effectiveness assumption"] : []
    });
  }
  const scored = comparisons.filter((item) => item.score != null);
  const pointed = comparisons.filter((item) => item.eventPoint != null);
  const winnerByScore = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;
  const winnerByEventPoint = [...pointed].sort((a, b) => (b.eventPoint ?? 0) - (a.eventPoint ?? 0))[0] ?? null;
  const scoreValues = scored.map((item) => item.score ?? 0);
  const pointValues = pointed.map((item) => item.eventPoint ?? 0);
  const allMissing = [...new Set(comparisons.flatMap((item) => item.missingFields))];
  return {
    region: input.region,
    musicId: input.musicId,
    difficulty: input.difficulty,
    multiLiveVersion,
    liveExactVersion: input.scoreMode === "exact" ? liveExactVersion : undefined,
    scoreMode: input.scoreMode ?? "aggregate",
    referenceFormulaId: "Moesekai.MultiLivePTCalculator",
    comparisons,
    winnerByScore: winnerByScore ? { id: winnerByScore.id, score: winnerByScore.score } : null,
    winnerByEventPoint: winnerByEventPoint ? { id: winnerByEventPoint.id, eventPoint: winnerByEventPoint.eventPoint } : null,
    scoreDelta: scoreValues.length > 1 ? Math.max(...scoreValues) - Math.min(...scoreValues) : 0,
    eventPointDelta: pointValues.length > 1 ? Math.max(...pointValues) - Math.min(...pointValues) : 0,
    musicMetaTrace: musicMeta.sourceHealth,
    missingFields: allMissing,
    estimatedFieldsUsed: teammateAssumption ? ["default teammate power/effectiveness assumption"] : [],
    referenceParity: {
      status: allMissing.length ? "missing-data" : teammateAssumption ? "missing-data" : "matched",
      referenceFiles: [
        "refer/Moesekai/web/src/lib/deck-comparator/calculator.ts",
        "refer/Moesekai/refer/re_sekai-calculator/src/live-score/live-calculator.ts",
        ...(input.scoreMode === "exact" ? ["refer/Moesekai/refer/re_sekai-calculator/src/live-score/live-exact-calculator.ts"] : []),
        "refer/Moesekai/refer/re_sekai-calculator/src/event-point/event-calculator.ts"
      ],
      liveExactCalculator: input.scoreMode === "exact" ? (allMissing.length ? "missing-data" : "matched") : "not-requested"
    }
  };
}
