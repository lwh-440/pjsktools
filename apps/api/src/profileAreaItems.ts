type Row = Record<string, unknown>;
export type ProfileAreaItem = {
  areaItemId: string; name: string; unit: string; attribute: string;
  currentLevel: number; maxLevel: number | null; currentBonus: number | null; nextBonus: number | null;
  costStatus: string; affordable: boolean | null; imageCandidates?: string[];
  costs: Array<{ materialId: string; name: string; required: number; owned: number }>;
  cost: { resources: Array<{ resourceType: string; resourceId: string; name?: string; required: number; owned: number; shortage?: number; imageCandidates?: string[] }> };
  levels: Array<{ level: number; bonus: number }>;
};
const rate = (row: Row) => Math.max(...["power1BonusRate", "power2BonusRate", "power3BonusRate", "power1AllMatchBonusRate", "power2AllMatchBonusRate", "power3AllMatchBonusRate"].map((key) => Number(row[key]) || 0));

// The upgrade recommender omits max-level items. The profile also serves as the
// current-level deck selection inventory, so retain every uploaded owned item.
export function completeProfileAreaItems(recommendations: ProfileAreaItem[], owned: Row[], masters: Array<{ id: string; name?: string; raw?: unknown }>, levelMasters: Array<{ raw?: unknown }>): ProfileAreaItem[] {
  const result = [...recommendations];
  const ids = new Set(result.map((item) => item.areaItemId));
  for (const item of owned) {
    const id = String(item.areaItemId ?? item.id ?? "");
    const level = Number(item.level ?? item.areaItemLevel) || 0;
    if (!id || level <= 0 || ids.has(id)) continue;
    const master = masters.find((entry) => entry.id === id);
    const levels = levelMasters.map((entry) => entry.raw as Row).filter((row) => row && String(row.areaItemId) === id);
    const current = levels.find((row) => Number(row.level ?? row.areaItemLevel) === level);
    const next = levels.find((row) => Number(row.level ?? row.areaItemLevel) === level + 1);
    const max = levels.length ? Math.max(...levels.map((row) => Number(row.level ?? row.areaItemLevel) || 0)) : null;
    result.push({ areaItemId: id, name: master?.name ?? "区域道具资料待同步", unit: String(current?.targetUnit ?? next?.targetUnit ?? "unknown"), attribute: String(current?.targetCardAttr ?? next?.targetCardAttr ?? "unknown"), currentLevel: level, maxLevel: max,
      currentBonus: current ? rate(current) : null, nextBonus: next ? rate(next) : null,
      costStatus: current && max !== null && level === max ? "max-level" : "missing-data", affordable: null, imageCandidates: [], costs: [], cost: { resources: [] }, levels: [] });
    ids.add(id);
  }
  return result;
}
