import { describe, expect, it } from "vitest";
import { buildHourlyChurnTable, formatCompactScore, formatParkingPeriod } from "./components/RankingDetailPanel";

describe("ranking detail display helpers", () => {
  it("shortens large chart labels while retaining readable scores", () => {
    expect(formatCompactScore(2_402_945)).toMatch(/万$/);
    expect(formatCompactScore(3_200)).toBe("3,200");
    expect(formatCompactScore(undefined)).toBe("-");
  });

  it("keeps a 48-hour local-time matrix with missing hours distinct from zero", () => {
    const first = new Date(2026, 0, 1, 23, 0, 0).toISOString();
    const last = new Date(2026, 0, 3, 22, 0, 0).toISOString();
    const old = new Date(2025, 11, 1, 0, 0, 0).toISOString();
    const table = buildHourlyChurnTable([{ hour: old, count: 99 }, { hour: first, count: 0 }, { hour: last, count: 6 }]);
    const populated = table.rows.flatMap((row) => row.cells).filter((cell): cell is { hour: string; count: number } => Boolean(cell));

    expect(table.rows.length).toBeGreaterThan(0);
    expect(table.rows.every((row) => row.cells.length === 24)).toBe(true);
    expect(populated.map((cell) => cell.count)).toEqual([0, 6]);
    expect(table.maxCount).toBe(6);
  });

  it("only labels an explicitly active parking period as ongoing and uses total minutes", () => {
    expect(formatParkingPeriod({ startTime: 1_788_923_961_386, durationSeconds: 2_712, active: true })).toMatch(/-至今 45min$/);
    expect(formatParkingPeriod({ startTime: 1_788_681_809_726, endTime: 1_788_682_197_325, durationSeconds: 387 })).toMatch(/-.* 6min$/);
    expect(formatParkingPeriod({ startTime: 1_788_681_809_726 })).toContain("-结束时间未知 时长未知");
  });
});
