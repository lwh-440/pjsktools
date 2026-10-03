import { describe, expect, it, vi } from "vitest";

const groups = {
  mysekaiFixtures: [
    { id: 1, name: "Fixture one", assetbundleName: "fixture_one" },
    { id: 2, name: "Wall two", assetbundleName: "wall_two" },
    { id: 444, name: "Canvas 444", assetbundleName: "canvas_444" }
  ],
  mysekaiTools: [
    { id: 1, name: "ふつうのツルハシ", description: "pickaxe", assetbundleName: "pickax0001" },
    { id: 2, name: "Tool two", description: "tool", assetbundleName: "pickax0002" },
    { id: 10, name: "チェーンソー", description: "chainsaw", assetbundleName: "ax0005" }
  ],
  mysekaiBlueprints: [
    { id: 444, mysekaiCraftType: "mysekai_canvas", craftTargetId: 444 },
    { id: 900, mysekaiCraftType: "mysekai_fixture", craftTargetId: 2 },
    { id: 100001, mysekaiCraftType: "mysekai_tool", craftTargetId: 1 },
    { id: 100002, mysekaiCraftType: "mysekai_tool", craftTargetId: 2 },
    { id: 100010, mysekaiCraftType: "mysekai_tool", craftTargetId: 10 }
  ],
  mysekaiBlueprintMysekaiMaterialCosts: [
    { mysekaiBlueprintId: 444, mysekaiMaterialId: 1, quantity: 4 },
    { mysekaiBlueprintId: 900, mysekaiMaterialId: 1, quantity: 9 },
    { mysekaiBlueprintId: 100002, mysekaiMaterialId: 2, quantity: 30 }
  ],
  mysekaiMaterials: [
    { id: 1, name: "Wood", iconAssetbundleName: "wood" },
    { id: 2, name: "Iron", iconAssetbundleName: "iron" }
  ]
};

vi.mock("./externalData.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./externalData.js")>()),
  getMysekaiFullContext: vi.fn(async () => ({ groups, sourceHealth: {} }))
}));

import { getMysekaiDetail, resolveExchangeResource, rowsFromExchangeLookup } from "./contentData.js";

describe("MySekai blueprint targets", () => {
  it("uses tool targets for tool blueprints and keeps fixture and canvas reverse links separate", async () => {
    const pickaxe = await getMysekaiDetail("jp", "blueprints", "100001");
    const chainsaw = await getMysekaiDetail("jp", "blueprints", "100010");
    const toolTwo = await getMysekaiDetail("jp", "blueprints", "100002");
    const wall = await getMysekaiDetail("jp", "fixtures", "2");
    const canvas = await getMysekaiDetail("jp", "fixtures", "444");

    expect(pickaxe?.item).toMatchObject({ name: "ふつうのツルハシ" });
    expect(pickaxe?.item.imageCandidates.some((candidate) => decodeURIComponent(candidate).includes("mysekai/thumbnail/tool/pickax0001.png"))).toBe(true);
    expect(chainsaw?.item).toMatchObject({ name: "チェーンソー" });
    expect(chainsaw?.item.imageCandidates.some((candidate) => decodeURIComponent(candidate).includes("mysekai/thumbnail/tool/ax0005.png"))).toBe(true);
    expect(toolTwo?.materialCosts).toHaveLength(1);
    expect(wall?.blueprints.map((blueprint) => blueprint.id)).toEqual([900]);
    expect(wall?.materialCosts.map((cost) => cost.material?.name)).toEqual(["Wood"]);
    expect(canvas?.blueprints.map((blueprint) => blueprint.id)).toEqual([444]);
    expect(canvas?.item.imageCandidates.some((candidate) => decodeURIComponent(candidate).includes("mysekai/thumbnail/fixture/canvas_444_1.png"))).toBe(true);
  });
});

describe("Haruki costume reward lookups", () => {
  it("accepts canonical costume3ds rows and preserves legacy wrapper rows", () => {
    expect(rowsFromExchangeLookup("costume_3d", [
      { id: 149065, costume3dGroupId: 149009, partType: "head" },
      { id: 149066, costume3dGroupId: 149009, partType: "body" }
    ])).toEqual([
      { id: 149065, costume3dGroupId: 149009, partType: "head", representativeAssetbundleName: undefined },
      { id: 149066, costume3dGroupId: 149009, partType: "body", representativeAssetbundleName: undefined }
    ]);
    expect(rowsFromExchangeLookup("costume_3d", {
      costumes: [{ costumeNumber: 9, name: "Legacy costume", parts: { body: [{ assetbundleName: "cos0009_body" }] } }]
    })).toEqual([{ costumeNumber: 9, name: "Legacy costume", parts: { body: [{ assetbundleName: "cos0009_body" }] }, id: 9, representativeAssetbundleName: "cos0009_body" }]);
  });

  it("marks a canonical row with no asset bundle as an unavailable image, not a missing lookup", () => {
    const result = resolveExchangeResource("tw", { resourceType: "costume_3d", resourceId: 149065 }, new Map(), new Map(), new Map(), new Map([
      ["costume_3d", new Map([[149065, { id: 149065, costume3dGroupId: 149009 }]])]
    ]));
    expect(result.lookupStatus).toBe("matched");
    expect(result.assetStatus).toBe("asset-unavailable");
    expect(result.imageCandidates).toEqual([]);
  });
});
