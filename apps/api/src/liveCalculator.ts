import type { DeckDetailLike } from "./formulaDetail.js";
import type { MusicMeta } from "./types.js";
import type { LiveType } from "./normalEventFormula.js";

export type LiveCalculatorTrace = {
  referenceFormulaId: "Moesekai.LiveCalculator.getLiveDetailByDeck";
  liveType: LiveType;
  baseRate: number;
  skillRates: number[];
  orderedSkills: Array<{ cardId?: string; scoreUp: number; lifeRecovery: number; leaderRepeat?: boolean }>;
  totalRate: number;
  activeBonus: number;
  power: number;
  score: number;
};

function baseRate(meta: MusicMeta, liveType: LiveType) {
  if (liveType === "auto") return meta.baseScoreAuto;
  if (liveType === "multi" || liveType === "cheerful") return meta.baseScore + meta.feverScore * 0.5;
  return meta.baseScore;
}

function skillRates(meta: MusicMeta, liveType: LiveType) {
  if (liveType === "auto") return [...meta.skillScoreAuto];
  if (liveType === "multi" || liveType === "cheerful") return [...meta.skillScoreMulti];
  return [...meta.skillScoreSolo];
}

export function getMultiLiveSkill(deck: DeckDetailLike) {
  return {
    scoreUp: deck.deckCards.reduce((sum, card, index) => sum + (index === 0 ? card.skill.scoreUp : card.skill.scoreUp / 5), 0),
    lifeRecovery: deck.deckCards[0]?.skill.lifeRecovery ?? 0
  };
}

export function calculateLiveDetail(deck: DeckDetailLike, meta: MusicMeta, liveType: LiveType) {
  const rates = skillRates(meta, liveType);
  let sorted = false;
  let skills: Array<{ cardId?: string; scoreUp: number; lifeRecovery: number; leaderRepeat?: boolean }>;
  if (liveType === "multi") {
    const multi = getMultiLiveSkill(deck);
    skills = Array.from({ length: 6 }, () => ({ ...multi }));
  } else {
    const cardSkills = deck.deckCards.map((card) => ({ cardId: card.cardId, scoreUp: card.skill.scoreUp, lifeRecovery: card.skill.lifeRecovery }))
      .sort((a, b) => a.scoreUp - b.scoreUp);
    const empty = Array.from({ length: Math.max(0, 5 - cardSkills.length) }, () => ({ scoreUp: 0, lifeRecovery: 0 }));
    const leader = deck.deckCards[0];
    skills = [...cardSkills, ...empty, { cardId: leader?.cardId, scoreUp: leader?.skill.scoreUp ?? 0, lifeRecovery: leader?.skill.lifeRecovery ?? 0, leaderRepeat: true }];
    sorted = true;
  }
  const orderedRates = sorted
    ? [...rates.slice(0, deck.deckCards.length).sort((a, b) => a - b), ...rates.slice(deck.deckCards.length)]
    : rates;
  const rate = baseRate(meta, liveType) + skills.reduce((sum, skill, index) => sum + skill.scoreUp * (orderedRates[index] ?? 0) / 100, 0);
  const powerSum = 5 * deck.power.total;
  const activeBonus = liveType === "multi" ? 5 * 0.015 * powerSum : 0;
  const score = Math.floor(rate * deck.power.total * 4 + activeBonus);
  const trace: LiveCalculatorTrace = {
    referenceFormulaId: "Moesekai.LiveCalculator.getLiveDetailByDeck",
    liveType,
    baseRate: baseRate(meta, liveType),
    skillRates: orderedRates,
    orderedSkills: skills,
    totalRate: rate,
    activeBonus,
    power: deck.power.total,
    score
  };
  return {
    score,
    time: meta.musicTime,
    life: Math.min(2000, 1000 + skills.reduce((sum, skill) => sum + skill.lifeRecovery, 0)),
    tap: meta.tapCount,
    trace
  };
}
