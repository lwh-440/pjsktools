import type { MusicMeta } from "./types.js";

export const multiLiveVersion = "multi-live-v1-reference" as const;
export type Skill15Strategy = "expected" | "best" | "worst";
export type Skill6Mode = "team-average" | "highest-power";

export type MultiLivePlayer = {
  power: number;
  effectiveness: number;
  label?: string;
};

export type MultiLiveInput = {
  players: [MultiLivePlayer, MultiLivePlayer, MultiLivePlayer, MultiLivePlayer, MultiLivePlayer];
  musicMeta: MusicMeta;
  skill15Strategy?: Skill15Strategy;
  skill6Mode?: Skill6Mode;
};

function skill15Contribution(effects: number[], weights: number[], strategy: Skill15Strategy) {
  if (strategy === "expected") {
    return effects.reduce((sum, value) => sum + value, 0) / effects.length
      * weights.reduce((sum, value) => sum + value, 0) / 100;
  }
  const sortedEffects = [...effects].sort((a, b) => b - a);
  const sortedWeights = [...weights].sort(strategy === "best" ? (a, b) => b - a : (a, b) => a - b);
  return sortedEffects.reduce((sum, value, index) => sum + value * (sortedWeights[index] ?? 0) / 100, 0);
}

function skill6Effectiveness(players: MultiLivePlayer[], mode: Skill6Mode) {
  if (mode === "team-average") return players.reduce((sum, player) => sum + player.effectiveness, 0) / players.length;
  return players.reduce((best, player) => player.power > best.power ? player : best, players[0]).effectiveness;
}

export function calculateMultiLive(input: MultiLiveInput) {
  const strategy = input.skill15Strategy ?? "expected";
  const skill6Mode = input.skill6Mode ?? "team-average";
  const weights = input.musicMeta.skillScoreMulti;
  if (weights.length < 6) throw new Error(`musicMeta.skill_score_multi requires 6 weights, got ${weights.length}`);
  const effects = input.players.map((player) => player.effectiveness);
  const baseRate = input.musicMeta.baseScore + input.musicMeta.feverScore * 0.5;
  const skill15 = skill15Contribution(effects, weights.slice(0, 5), strategy);
  const skill15Best = skill15Contribution(effects, weights.slice(0, 5), "best");
  const skill15Worst = skill15Contribution(effects, weights.slice(0, 5), "worst");
  const skill6Effect = skill6Effectiveness(input.players, skill6Mode);
  const skill6 = skill6Effect * weights[5] / 100;
  const totalRate = baseRate + skill15 + skill6;
  const totalPower = input.players.reduce((sum, player) => sum + player.power, 0);
  const activeBonus = 5 * 0.015 * totalPower;
  const scores = input.players.map((player, index) => ({
    index,
    label: player.label ?? (index === 0 ? "self" : `player-${index + 1}`),
    power: player.power,
    effectiveness: player.effectiveness,
    score: Math.floor(totalRate * player.power * 4 + activeBonus)
  }));
  const selfScore = scores[0].score;
  const otherScore = scores.slice(1).reduce((sum, player) => sum + player.score, 0);
  return {
    multiLiveVersion,
    referenceFormulaId: "Moesekai.MultiLivePTCalculator" as const,
    score: selfScore,
    selfScore,
    otherScore,
    playerScores: scores,
    baseScorePart: Math.floor(baseRate * input.players[0].power * 4),
    skill15Part: Math.floor(skill15 * input.players[0].power * 4),
    skill6Part: Math.floor(skill6 * input.players[0].power * 4),
    activeBonus: Math.floor(activeBonus),
    totalPower,
    skill6Effectiveness: skill6Effect,
    skill6Mode,
    skill15Strategy: strategy,
    details: {
      baseRate,
      skill15Contribution: skill15,
      skill6Contribution: skill6,
      totalRate,
      scoreBest: Math.floor((baseRate + skill15Best + skill6) * input.players[0].power * 4 + activeBonus),
      scoreWorst: Math.floor((baseRate + skill15Worst + skill6) * input.players[0].power * 4 + activeBonus),
      skillWeights: weights,
      players: input.players
    }
  };
}

