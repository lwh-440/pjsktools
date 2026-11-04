import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { filterProfileAreaItems, PlayerProfileAnalysisView, type ProfileAnalysis } from "./PlayerProfileAnalysis";

const analysis: ProfileAnalysis = {
  binding: { id: "one", region: "jp", playerUid: "123" },
  profileSummary: { nickname: "玩家", rank: 10, inventoryCount: 1, assetKindCount: 2 },
  characterRankAnalysis: { items: [], highestRank: 0, averageRank: 0, weakCharacters: [], units: [] },
  challengeAnalysis: { items: [], rewardRowCount: 0 },
  bondsAnalysis: { items: [], ownedCount: 0 },
  powerBonusAnalysis: { formulaVersion: "internal-formula", referenceFormulaId: "internal", inventoryCardCount: 1, exactCardCount: 1, totals: { base: 100, areaItemBonus: 20, characterBonus: 30, fixtureBonus: 40, gateBonus: 50, honorPower: 60 }, cards: [], missingFields: [], status: "ready" },
  areaItemUpgradeAnalysis: { items: [], materialInventory: {}, costMasterAvailable: false },
  moduleReadiness: {}, sourceDiagnostics: {}
};

function render(view: string, data = analysis) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/me/profile?state=full&view=${view}`]}><PlayerProfileAnalysisView analysis={data} /></MemoryRouter>);
}

describe("profile subpage links", () => {
  it("renders only the requested module and falls back for unknown views", () => {
    const headings = { characters: "角色 Rank", challenge: "挑战 LIVE", bonds: "羁绊等级", power: "综合力加成", area: "区域道具升级" };
    for (const [view, heading] of Object.entries(headings)) {
      const html = render(view);
      expect(html).toContain(`<h2>${heading} `);
      for (const other of Object.values(headings).filter((item) => item !== heading)) expect(html).not.toContain(`<h2>${other} `);
    }
    expect(render("unknown")).toContain("<h2>角色 Rank ");
  });

  it("preserves all six power components using game terminology", () => {
    const html = render("power");
    expect(html).toContain("MySekai 家具加成");
    expect(html).toContain("MySekai 大门加成");
    for (const value of [100, 20, 30, 40, 50, 60]) expect(html).toContain(`<strong>${value}</strong>`);
    expect(html).not.toContain("internal-formula");
  });

  it("places availability next to each title before its explanation", () => {
    const modules = [["characters", "角色 Rank", "characterRanks"], ["challenge", "挑战 LIVE", "challenge"], ["bonds", "羁绊等级", "bonds"], ["power", "综合力加成", "powerBonus"], ["area", "区域道具升级", "areaItems"]];
    for (const [view, title, key] of modules) {
      const html = render(view, { ...analysis, moduleReadiness: { [key]: { ready: true, status: "ready", missingFields: [] } } });
      expect(html).toContain(`<h2>${title} <span class="analysis-status ready">可用</span></h2><p>`);
    }
  });

  it("offers every unit and attribute icon even with no uploaded area items", () => {
    const html = render("area");
    for (const unit of ["light_sound", "idol", "street", "theme_park", "school_refusal", "piapro"]) expect(html).toContain(`/assets/catalog-filters/units/${unit}.png`);
    for (const attribute of ["cool", "cute", "happy", "mysterious", "pure"]) expect(html).toContain(`/assets/catalog-filters/attributes/${attribute}.png`);
    expect(html).not.toContain("全组合道具");
    expect(html).not.toContain("全属性道具");
    expect(html).not.toContain("其他组合</span></button>");
    expect(html).not.toContain("其他属性</span></button>");
    expect(html).toContain('<details class="profile-area-filter-disclosure">');
    expect(html).not.toContain("全部组合 · 全部属性");
    expect(html).toContain("应用筛选");
    expect(html).toContain("只看当前资源足够升级的区域道具");
    expect(html).not.toContain("area-affordable-help");
    expect(html).toContain("当前筛选没有区域道具");
  });

  it("shows a direct area detail with complete material and coin costs and a return link", () => {
    const item = { areaItemId: "detail-one", name: "真实道具名", unit: "light_sound", attribute: "cool", currentLevel: 2, maxLevel: 15, currentBonus: 2, nextBonus: 3, costs: [], costStatus: "matched", levels: [], affordable: false,
      cost: { resources: [{ resourceType: "coin", resourceId: "0", name: "金币", required: 1000, owned: 400 }, { resourceType: "material", resourceId: "17", name: "神秘种子", required: 20, owned: 25, imageCandidates: ["/assets/material17.png"] }] } };
    const html = render("area&areaItemId=detail-one", { ...analysis, areaItemUpgradeAnalysis: { ...analysis.areaItemUpgradeAnalysis, items: [item] } });
    expect(html).toContain("返回区域道具列表");
    expect(html).toContain("真实道具名");
    expect(html).toContain("金币");
    expect(html).toContain("神秘种子");
    expect(html).toContain("还缺 600");
    expect(html).toContain("当前资源不足");
    expect(html).not.toContain("数量足够");
    expect(html).not.toContain("compact-area-table");
  });

  it("distinguishes unknown upgrade costs and sends an explicit binding for selected calculations", () => {
    const base = { areaItemId: "unknown-cost", name: "待同步道具", unit: "any", attribute: "any", currentLevel: 1, maxLevel: 15, currentBonus: 1, nextBonus: 2, costs: [], costStatus: "missing-data", levels: [], affordable: null };
    const data = { ...analysis, areaItemUpgradeAnalysis: { ...analysis.areaItemUpgradeAnalysis, items: [base] } };
    const list = render("area", data);
    expect(list).toContain('aria-label="升级成本待同步"');
    expect(list).toContain("bindingId=one&amp;areaSelection=selected");
    expect(list).toContain('aria-label="全选当前筛选结果中已拥有的区域道具"');
    expect(render("area&areaItemId=unknown-cost", data)).toContain("升级费用尚未同步");
  });

  it("keeps max-level owned items selectable and explains that there is no next upgrade", () => {
    const item = { areaItemId: "max", name: "满级道具", unit: "light_sound", attribute: "cool", currentLevel: 15, maxLevel: 15, currentBonus: 15, nextBonus: null, costStatus: "max-level", affordable: null, costs: [], levels: [] };
    const data = { ...analysis, areaItemUpgradeAnalysis: { ...analysis.areaItemUpgradeAnalysis, items: [item] } };
    const html = render("area", data);
    expect(html).toContain('class="area-upgrade-status maxed" role="img" aria-label="已满级"');
    expect(html).toContain('aria-label="满级道具用于组卡"');
    expect(html).toContain("详细信息");
    expect(html).not.toContain('aria-label="满级道具用于组卡" disabled');
    expect(render("area&areaItemId=max", data)).toContain("已满级，无下一级升级费用");
  });

  it("keeps only confirmed affordable next upgrades and preserves universal or unknown targets", () => {
    const base = { areaItemId: "one", name: "道具", unit: "light_sound", attribute: "cool", currentLevel: 1, maxLevel: 15, currentBonus: 1, nextBonus: 2, costs: [], costStatus: "matched", levels: [] };
    const items = [
      { ...base, areaItemId: "enough", affordable: true },
      { ...base, areaItemId: "short", affordable: false },
      { ...base, areaItemId: "unknown", affordable: null },
      { ...base, areaItemId: "universal", unit: "any", attribute: "any", affordable: true },
      { ...base, areaItemId: "future", unit: "future-unit", attribute: "future-attribute", affordable: true }
    ];
    expect(filterProfileAreaItems(items, "light_sound", "cool", true).map((item) => item.areaItemId)).toEqual(["enough"]);
    expect(filterProfileAreaItems(items, "light_sound", "cool", false)).toHaveLength(3);
    expect(filterProfileAreaItems(items, "idol", "cute", false)).toEqual([]);
    expect(filterProfileAreaItems(items, "all", "all", false)).toEqual(items);
    expect(filterProfileAreaItems(items, "all", "all", true).map((item) => item.areaItemId)).toEqual(["enough", "universal", "future"]);
  });
});
