import { describe, expect, it } from "vitest";
import { cardAttributeLabel, catalogFilterOptionLabel, collectionCategoryLabel, eventTypeLabel, eventUnitLabel, forecastConfidenceLabel, forecastSamplingReason, playerErrorMessage, playerFieldLabel, playerStatusLabel, playerWarningMessage, technicalDiagnosticMessage } from "./playerLabels";

describe("player labels", () => {
  it("turns nested API JSON errors into a player-facing message", () => {
    expect(playerErrorMessage('{"message":"{\\"message\\":\\"upstream unavailable\\"}"}')).toBe("暂时无法加载资料，请稍后重试。");
    expect(playerErrorMessage("Failed to fetch")).toBe("暂时无法连接服务，请检查网络后重试。");
    expect(playerWarningMessage("A complete target deck is required for exact power gain")).toBe("需要完整的目标卡组，才能准确计算综合力提升。");
    expect(technicalDiagnosticMessage('{"message":"raw diagnostic"}')).toBe("raw diagnostic");
  });

  it("uses player labels for common internal values", () => {
    expect(playerFieldLabel("ownedCards")).toBe("持有卡牌");
    expect(playerStatusLabel("stale-refreshing")).toBe("正在更新");
    expect(cardAttributeLabel("happy")).toBe("欢乐");
    expect(catalogFilterOptionLabel("skillTypes", "life_recovery", "life recovery")).toBe("生命回复");
    expect(eventTypeLabel("marathon")).toBe("马拉松活动");
    expect(eventUnitLabel("mixed")).toBe("混合组合");
    expect(eventUnitLabel("idol")).toBe("MORE MORE JUMP!");
    expect(eventUnitLabel("future_unit")).toBe("future_unit");
    expect(collectionCategoryLabel("gachas", "ceil")).toBe("卡池资料");
    expect(forecastConfidenceLabel("medium")).toBe("中等");
    expect(forecastSamplingReason("Enough samples across at least one hour for a basic trend estimate")).toBe("样本覆盖至少 1 小时，可用于基础趋势估算。");
  });
});
