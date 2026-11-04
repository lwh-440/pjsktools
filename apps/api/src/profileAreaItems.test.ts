import { describe, expect, it } from "vitest";
import { completeProfileAreaItems, type ProfileAreaItem } from "./profileAreaItems.js";

const recommendation = (id: string): ProfileAreaItem => ({ areaItemId: id, name: `道具${id}`, unit: "light_sound", attribute: "cool", currentLevel: 1, maxLevel: 15, currentBonus: 1, nextBonus: 2, costStatus: "matched", affordable: true, costs: [], cost: { resources: [] }, levels: [] });

describe("complete profile area inventory", () => {
  it("keeps more than 55 owned items and appends max-level items for deck selection", () => {
    const owned = Array.from({ length: 60 }, (_, index) => ({ areaItemId: String(index + 1), level: index >= 55 ? 15 : 1 }));
    const masters = owned.map((item) => ({ id: item.areaItemId, name: `道具${item.areaItemId}` }));
    const levels = owned.map((item) => ({ raw: { areaItemId: item.areaItemId, level: 15, targetUnit: "idol", targetCardAttr: "cute", power1BonusRate: 15 } }));
    const result = completeProfileAreaItems(owned.slice(0, 55).map((item) => recommendation(item.areaItemId)), owned, masters, levels);
    expect(result).toHaveLength(60);
    expect(result[59]).toMatchObject({ areaItemId: "60", currentLevel: 15, maxLevel: 15, currentBonus: 15, nextBonus: null, costStatus: "max-level", affordable: null, unit: "idol", attribute: "cute", cost: { resources: [] } });
    expect(owned[59].level).toBe(15);
  });
  it("handles uploaded level aliases and keeps unknown metadata honest", () => {
    const result = completeProfileAreaItems([], [{ id: "alias", areaItemLevel: 6 }, { areaItemId: "zero", level: 0 }], [], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ areaItemId: "alias", currentLevel: 6, maxLevel: null, currentBonus: null, nextBonus: null, costStatus: "missing-data", affordable: null, unit: "unknown", attribute: "unknown" });
  });
  it("retains unowned upgrade candidates while avoiding duplicate owned rows", () => {
    const unowned = { ...recommendation("new"), currentLevel: 0 };
    const result = completeProfileAreaItems([recommendation("one"), unowned], [{ areaItemId: "one", level: 1 }], [], []);
    expect(result).toHaveLength(2);
    expect(result[1].currentLevel).toBe(0);
  });
  it("does not infer max level or universal targets from an out-of-date master", () => {
    const result = completeProfileAreaItems([], [{ areaItemId: "ahead", level: 16 }], [{ id: "ahead", name: "新等级道具" }], [{ raw: { areaItemId: "ahead", level: 15, targetUnit: "idol", targetCardAttr: "cute" } }]);
    expect(result[0]).toMatchObject({ currentLevel: 16, maxLevel: 15, currentBonus: null, nextBonus: null, costStatus: "missing-data", unit: "unknown", attribute: "unknown" });
  });
});
