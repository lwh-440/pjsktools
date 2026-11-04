import { describe, expect, it } from "vitest";
import { cardAttributeLabel, catalogFilterOptionLabel, collectionCategoryLabel, eventTypeLabel, eventUnitLabel, forecastConfidenceLabel, forecastSamplingReason, playerErrorMessage, playerFieldLabel, playerMissingDataLabels, playerStatusLabel, playerToolLabel, playerWarningMessage, technicalDiagnosticMessage } from "./playerLabels";

describe("player labels", () => {
  it("maps prefixed tool warnings without treating the tool name as missing input", () => {
    expect(playerMissingDataLabels(["deckRecommend: Missing uploaded character-ranks", "areaItemRecommend: Missing uploaded area-items", "musicRecommend: Missing uploaded area-items"])).toEqual(["角色等级", "区域道具"]);
    expect(playerToolLabel("normalEventPlan")).toBe("活动规划");
  });

  it("recognizes the real MySekai combined warning and deduplicates input labels", () => {
    expect(playerMissingDataLabels(["Missing uploaded MySekai canvas/gate/fixture data", "mysekai-fixtures"])).toEqual(["MySekai 家具", "MySekai 大门", "MySekai 画布"]);
  });

  it("hides unknown technical input identifiers", () => {
    expect(playerMissingDataLabels(["internal_future_field", "another_opaque_field"])).toEqual(["其他玩家资料"]);
    expect(playerToolLabel("futureInternalTool")).toBe("玩家工具");
  });
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
