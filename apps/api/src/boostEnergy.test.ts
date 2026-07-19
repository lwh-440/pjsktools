import { describe, expect, it } from "vitest";
import { boostEnergyRates, getBoostEnergyRate } from "./boostEnergy.js";
import { calculateReferenceEventPoint } from "./normalEventFormula.js";

describe("boost energy rates", () => {
  it("uses the in-game event point multiplier table", () => {
    expect(boostEnergyRates).toEqual([1, 5, 10, 15, 20, 25, 27, 29, 31, 33, 35]);
    expect(boostEnergyRates.map((_, fires) => getBoostEnergyRate(fires))).toEqual([...boostEnergyRates]);
  });

  it("keeps internal callers within the supported 0-10 fire range", () => {
    expect(getBoostEnergyRate()).toBe(1);
    expect(getBoostEnergyRate(-1)).toBe(1);
    expect(getBoostEnergyRate(5.9)).toBe(25);
    expect(getBoostEnergyRate(99)).toBe(35);
  });

  it("calculates the reported five-fire multiplayer regression case", () => {
    const result = calculateReferenceEventPoint({
      liveType: "multi",
      selfScore: 3_181_667,
      otherScore: 7_420_240,
      musicRate: 100,
      deckBonus: 621,
      boostRate: getBoostEnergyRate(5)
    });

    expect(result.baseScore).toBe(310);
    expect(result.estimatedPt).toBe(55_875);
  });
});
