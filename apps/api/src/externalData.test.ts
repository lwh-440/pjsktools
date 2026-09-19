import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config.js";
import { applyCnCostumeThumbnailMappings, buildCnCostumeThumbnailAssetbundleName, createCnCostumeThumbnailIndex, getExternalCollection, getOptionalMetadata, isAllowedExternalAssetUrl, isPublicCostumeItem, live2dMotionReferencesFromManifest, model3FromHarukiBuildModelData, normalizeScenarioData, parseLive2dModel3, resetCnCostumeThumbnailIndexForTests, resolveLive2dModelAssetRegion } from "./externalData.js";
import { resetHarukiMasterClientStateForTests } from "./harukiMasterClient.js";

describe("Haruki Live2D BuildModelData adapter", () => {
  it("creates a Cubism model3 document from the exported MOC3, textures, and physics", () => {
    const model = model3FromHarukiBuildModelData({
      Moc3FileName: "01ichika_cloth001_3.1_f_t01.moc3.bytes",
      TextureNames: ["01ichika_cloth001_3.1_f_t01.2048/texture_00.png"],
      PhysicsFileName: "01ichika_cloth001_3.1_f_t01.physics3.json",
      AdditionalMotionData: [{ ClipAssetName: "w-normal-tilthead01r" }]
    }, {
      FileReferences: {
        Motions: { Idle: [{ File: "motions/idle.motion3.json" }] },
        Expressions: [{ Name: "smile", File: "expressions/smile.exp3.json" }]
      }
    }, "https://storage.sekai.best/sekai-live2d-assets/live2d/model/v1/main/01_ichika/01ichika_cloth001/");

    expect(model).toEqual({
      Version: 3,
      FileReferences: {
        Moc: "01ichika_cloth001_3.1_f_t01.moc3",
        Textures: ["01ichika_cloth001_3.1_f_t01.2048/texture_00.png"],
        Physics: "01ichika_cloth001_3.1_f_t01.physics3",
        Motions: { Idle: [{ File: "https://storage.sekai.best/sekai-live2d-assets/live2d/model/v1/main/01_ichika/01ichika_cloth001/motions/idle.motion3.json" }] },
        Expressions: [{ Name: "smile", File: "https://storage.sekai.best/sekai-live2d-assets/live2d/model/v1/main/01_ichika/01ichika_cloth001/expressions/smile.exp3.json" }]
      }
    });
  });

  it("does not mistake Unity clip metadata for Cubism motion files", () => {
    expect(() => model3FromHarukiBuildModelData({
      Moc3FileName: "model.moc3.bytes",
      TextureNames: [],
      AdditionalMotionData: [{ ClipAssetName: "walk" }]
    })).toThrow(/MOC3 or texture/i);
  });

  it("maps a confirmed Cubism motion manifest without fabricating model-relative files", () => {
    expect(live2dMotionReferencesFromManifest({
      motions: ["w-normal-tilthead05"],
      expressions: ["face_smile_02", "../ignored"]
    }, "https://storage.sekai.best/sekai-live2d-assets/live2d/motion/v1/main/01_ichika/01ichika_motion_base")).toEqual({
      Motion: [{
        Name: "w-normal-tilthead05",
        File: "https://storage.sekai.best/sekai-live2d-assets/live2d/motion/v1/main/01_ichika/01ichika_motion_base/motion/w-normal-tilthead05.motion3.json",
        FadeInTime: 1,
        FadeOutTime: 1
      }],
      Expression: [{
        Name: "face_smile_02",
        File: "https://storage.sekai.best/sekai-live2d-assets/live2d/motion/v1/main/01_ichika/01ichika_motion_base/facial/face_smile_02.motion3.json",
        FadeInTime: 1,
        FadeOutTime: 1
      }]
    });
  });

  it("adds stable asset suffixes to every proxied Cubism resource", () => {
    const base = "https://sekai-assets.haruki.seiunx.com/en-assets/startapp/live2d/model/v1/collabo/21_miku/clb01_21miku/";
    const parsed = parseLive2dModel3({ modelBaseUrl: base, model3JsonUrl: `${base}model.model3.json` } as any, {
      FileReferences: {
        Moc: "model.moc3",
        Textures: ["texture_00.png"],
        Physics: "model.physics3",
        Pose: "model.pose3.json",
        DisplayInfo: "model.cdi3.json",
        Motions: { Idle: [{ File: "motions/idle.motion3.json" }] },
        Expressions: [{ Name: "smile", File: "expressions/smile.exp3.json" }]
      }
    });

    expect(parsed.proxiedModelFileUrl).toContain("&__asset=model.moc3");
    expect(parsed.proxiedTextureFiles[0]?.url).toContain("&__asset=texture_00.png");
    expect(parsed.proxiedPhysicsFileUrl).toContain("&__asset=model.physics3");
    expect(parsed.proxiedPoseFileUrl).toContain("&__asset=model.pose3.json");
    expect(parsed.proxiedDisplayInfoFileUrl).toContain("&__asset=model.cdi3.json");
    expect(parsed.proxiedMotionFiles[0]?.url).toContain("&__asset=idle.motion3.json");
    expect(parsed.proxiedExpressionFiles[0]?.url).toContain("&__asset=smile.exp3.json");
  });

  it("falls back an unavailable EN BuildModelData URL to the JP shared asset", async () => {
    const model = {
      buildModelDataUrl: "https://sekai-assets.haruki.seiunx.com/en-assets/startapp/live2d/model/v1/collabo/21_miku/clb01_21miku/buildmodeldata.json",
      modelBaseUrl: "https://sekai-assets.haruki.seiunx.com/en-assets/startapp/live2d/model/v1/collabo/21_miku/clb01_21miku/",
      motionBaseUrl: "https://sekai-assets.haruki.seiunx.com/en-assets/live2d/motion/v1/collabo/21_miku/"
    };
    const fetchMock = vi.fn(async (input: string | URL) => String(input).includes("/en-assets/")
      ? new Response("missing", { status: 404 })
      : new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await resolveLive2dModelAssetRegion(model as any);

    expect(resolved.buildModelDataUrl).toContain("/jp-assets/");
    expect(resolved.modelBaseUrl).toContain("/jp-assets/");
    expect(resolved.motionBaseUrl).toContain("/jp-assets/");
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      model.buildModelDataUrl,
      model.buildModelDataUrl.replace("/en-assets/", "/jp-assets/")
    ]);
  });
});

describe("Haruki comic collection", () => {
  const originalBaseUrl = config.harukiMasterBaseUrl;

  afterEach(() => {
    Object.assign(config, { harukiMasterBaseUrl: originalBaseUrl });
    resetCnCostumeThumbnailIndexForTests();
    resetHarukiMasterClientStateForTests();
    vi.unstubAllGlobals();
  });

  it("keeps all master tips and supplies verified legacy Haruki panels in a stable namespace", async () => {
    Object.assign(config, { harukiMasterBaseUrl: "https://haruki.test" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/master/jp/current")) return new Response(JSON.stringify({ files: [] }));
      if (url.endsWith("/v1/master/jp/files/comics.json")) return new Response("missing", { status: 404 });
      if (url.includes("/jp/master/comics.json")) return new Response("missing", { status: 404 });
      if (url.endsWith("/v1/master/jp/files/tips.json")) return new Response(JSON.stringify([
        { id: 2, title: "legacy help tip" },
        { id: 1041, title: "bundled comic", assetbundleName: "comic_0041" }
      ]));
      return new Response("unexpected", { status: 500 });
    }));

    const collection = await getExternalCollection("jp", "comics");
    expect(collection?.items).toHaveLength(42);
    expect(collection?.items.find((item) => item.id === "haruki-comic_0001")?.assetbundleName).toBe("comic_0001");
    expect(collection?.items.find((item) => item.id === "haruki-comic_0040")?.assetbundleName).toBe("comic_0040");
    expect(collection?.items.find((item) => item.id === "1041")?.assetbundleName).toBe("comic_0041");
    expect(collection?.items.find((item) => item.id === "2")).toMatchObject({ title: "legacy help tip", assetbundleName: undefined });
    expect(collection?.items.find((item) => item.id === "haruki-comic_0002")).toMatchObject({ title: "Comic 2", assetbundleName: "comic_0002" });
  });
});
describe("CN costume catalog", () => {
  it("excludes only explicit master placeholders and retains released costumes", () => {
    expect(isPublicCostumeItem("cn", { costumeNumber: 271221, name: "12月占位" })).toBe(false);
    expect(isPublicCostumeItem("cn", { costumeNumber: 270411, name: "占位" })).toBe(false);
    expect(isPublicCostumeItem("cn", { costumeNumber: 300001, name: "音你必胜" })).toBe(true);
    expect(isPublicCostumeItem("cn", { costumeNumber: 300002, name: "必胜音弦" })).toBe(true);
    expect(isPublicCostumeItem("jp", { costumeNumber: 270411, name: "占位" })).toBe(true);
  });
});

describe("CN costume collection runtime association", () => {
  const originalBaseUrl = config.harukiMasterBaseUrl;

  beforeEach(() => {
    resetCnCostumeThumbnailIndexForTests();
    resetHarukiMasterClientStateForTests();
  });

  afterEach(() => {
    Object.assign(config, { harukiMasterBaseUrl: originalBaseUrl });
    resetHarukiMasterClientStateForTests();
    vi.unstubAllGlobals();
  });

  it("keeps wrapper candidates and reports source-unavailable when the first official index is empty", async () => {
    Object.assign(config, { harukiMasterBaseUrl: "https://haruki.test" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/master/cn/current")) return new Response(JSON.stringify({ files: [] }));
      if (url.includes("/master/moe_costume.json")) return new Response(JSON.stringify({
        costumes: [{ costumeNumber: 251221, name: "冲锋苹果狗", characterIds: [11], designer: "代谢灰尘", publishedAt: 1764518400000, parts: { body: [{ colorId: 1, assetbundleName: "existing-candidate" }] } }]
      }));
      if (url.endsWith("/v1/master/cn/files/costume3ds.json") || url.endsWith("/v1/master/cn/files/costume3dGroups.json") || url.endsWith("/v1/master/cn/files/gameCharacters.json")) return new Response("[]");
      return new Response("unexpected", { status: 500 });
    }));

    const collection = await getExternalCollection("cn", "costumes");
    const raw = collection?.items[0]?.raw as Record<string, any>;
    expect(raw.parts.body[0].assetbundleName).toBe("existing-candidate");
    expect(raw.thumbnailAssetbundleMapping).toMatchObject({ status: "source-unavailable" });
  });

  it("uses the official CN index through the public collection path", async () => {
    Object.assign(config, { harukiMasterBaseUrl: "https://haruki.test" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/master/cn/current")) return new Response(JSON.stringify({ files: [] }));
      if (url.includes("/master/moe_costume.json")) return new Response(JSON.stringify({
        costumes: [{ costumeNumber: 251221, name: "冲锋苹果狗", characterIds: [11, 12], designer: "代谢灰尘", publishedAt: 1764518400000, parts: { body: [{ colorId: 1, assetbundleName: "existing-candidate" }] } }]
      }));
      if (url.endsWith("/v1/master/cn/files/costume3ds.json")) return new Response(JSON.stringify([
        { id: 25122002, costume3dGroupId: 251221001, partType: "body", colorId: 1 },
        { id: 25122010, costume3dGroupId: 251221002, partType: "body", colorId: 1 }
      ]));
      if (url.endsWith("/v1/master/cn/files/costume3dGroups.json")) return new Response(JSON.stringify([
        { groupId: 251221001, name: "冲锋苹果狗", characterId: 11, designer: "代谢灰尘", publishedAt: 1764518400000 },
        { groupId: 251221002, name: "冲锋苹果狗", characterId: 12, designer: "代谢灰尘", publishedAt: 1764518400000 }
      ]));
      if (url.endsWith("/v1/master/cn/files/gameCharacters.json")) return new Response(JSON.stringify([
        { id: 11, gender: "male" }, { id: 12, gender: "male" }
      ]));
      return new Response("unexpected", { status: 500 });
    }));

    const collection = await getExternalCollection("cn", "costumes");
    const raw = collection?.items[0]?.raw as Record<string, any>;
    expect(raw.parts.body[0].assetbundleName).toBe("cos25122_body");
    expect(raw.thumbnailAssetbundleMapping).toMatchObject({
      status: "matched",
      sourceProjects: ["Team-Haruki master registry"],
      stale: false
    });
    expect(raw.gender).toBe("male");
    expect(raw.genderMapping).toMatchObject({ status: "matched", genders: ["male"] });
  });

  it("keeps Haruki thumbnail mapping when optional game character data is unavailable", async () => {
    Object.assign(config, { harukiMasterBaseUrl: "https://haruki.test" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/master/cn/current")) return new Response(JSON.stringify({ files: [] }));
      if (url.includes("/master/moe_costume.json")) return new Response(JSON.stringify({
        costumes: [{ costumeNumber: 260221, name: "喵色格调", gender: "female", characterIds: [11], parts: { body: [{ colorId: 1, assetbundleName: "wrapper" }] } }]
      }));
      if (url.endsWith("/v1/master/cn/files/costume3ds.json")) return new Response(JSON.stringify([
        { id: 26022002, costume3dGroupId: 260221001, partType: "body", colorId: 1 }
      ]));
      if (url.endsWith("/v1/master/cn/files/costume3dGroups.json")) return new Response(JSON.stringify([
        { groupId: 260221001, name: "喵色格调", characterId: 11 }
      ]));
      return new Response("unavailable", { status: 503 });
    }));

    const raw = (await getExternalCollection("cn", "costumes"))?.items[0]?.raw as Record<string, any>;
    expect(raw.parts.body[0].assetbundleName).toBe("cos26022_body");
    expect(raw.gender).toBe("female");
    expect(raw.genderMapping).toMatchObject({ status: "no-match", sourceUnavailable: true });
  });
});
describe("CN costume thumbnail association", () => {
  const mapCostume = (costume: Record<string, unknown>, groups: unknown[], costume3ds: unknown[]) => applyCnCostumeThumbnailMappings(
    costume,
    createCnCostumeThumbnailIndex(costume3ds, groups, ["https://haruki.test/costume3ds.json", "https://haruki.test/costume3dGroups.json"])
  ) as Record<string, any>;

  it.each([
    {
      label: "normal costume shared by characters 1 and 2",
      costume: { name: "校园摇滚", characterIds: [1, 2], designer: "-", publishedAt: 1233288000000, parts: { body: [{ colorId: 1, assetbundleName: "existing-candidate" }] } },
      groups: [
        { groupId: 1001, name: "校园摇滚", characterId: 1, designer: "-", publishedAt: 1233288000000 },
        { groupId: 1002, name: "校园摇滚", characterId: 2, designer: "-", publishedAt: 1233288000000 }
      ],
      rows: [
        { id: 1002, costume3dGroupId: 1001, partType: "body", colorId: 1 },
        { id: 1010, costume3dGroupId: 1002, partType: "body", colorId: 1 }
      ],
      expected: "cos0001_body"
    },
    {
      label: "male CN costume despite an incorrect wrapper gender",
      costume: { name: "冲锋苹果狗", characterIds: [11, 12], gender: "female", designer: "代谢灰尘", publishedAt: 1764518400000, parts: { body: [{ colorId: 1, assetbundleName: "existing-candidate" }] } },
      groups: [
        { groupId: 251221001, name: "冲锋苹果狗", characterId: 11, designer: "代谢灰尘", publishedAt: 1764518400000 },
        { groupId: 251221002, name: "冲锋苹果狗", characterId: 12, designer: "代谢灰尘", publishedAt: 1764518400000 }
      ],
      rows: [
        { id: 25122002, costume3dGroupId: 251221001, partType: "body", colorId: 1 },
        { id: 25122010, costume3dGroupId: 251221002, partType: "body", colorId: 1 }
      ],
      expected: "cos25122_body"
    },
    {
      label: "female CN costume with empty official asset names",
      costume: { name: "可露丽棉花兔", characterIds: [1, 2], gender: "male", designer: "汉堡猫套餐", publishedAt: 1764518400000, parts: { body: [{ colorId: 1, assetbundleName: "existing-candidate" }] } },
      groups: [
        { groupId: 251211001, name: "可露丽棉花兔", characterId: 1, designer: "汉堡猫套餐", publishedAt: 1764518400000 },
        { groupId: 251211002, name: "可露丽棉花兔", characterId: 2, designer: "汉堡猫套餐", publishedAt: 1764518400000 }
      ],
      rows: [
        { id: 25121002, costume3dGroupId: 251211001, partType: "body", colorId: 1 },
        { id: 25121010, costume3dGroupId: 251211002, partType: "body", colorId: 1 }
      ],
      expected: "cos25121_body"
    },
    {
      label: "CN color variant",
      costume: { name: "冲锋苹果狗", characterIds: [11, 12], designer: "代谢灰尘", publishedAt: 1764518400000, parts: { body: [{ colorId: 2, assetbundleName: "existing-candidate" }] } },
      groups: [
        { groupId: 251221001, name: "冲锋苹果狗", characterId: 11, designer: "代谢灰尘", publishedAt: 1764518400000 },
        { groupId: 251221002, name: "冲锋苹果狗", characterId: 12, designer: "代谢灰尘", publishedAt: 1764518400000 }
      ],
      rows: [
        { id: 25122004, costume3dGroupId: 251221001, partType: "body", colorId: 2 },
        { id: 25122012, costume3dGroupId: 251221002, partType: "body", colorId: 2 }
      ],
      expected: "cos25122_body_01"
    }
  ])("maps $label only through official group rows", ({ costume, groups, rows, expected }) => {
    const result = mapCostume(costume, groups, rows);
    expect(result.parts.body[0].assetbundleName).toBe(expected);
    expect(result.thumbnailAssetbundleMapping).toMatchObject({ status: "matched", replacements: 1 });
  });

  it("corrects a wrapper gender only from a matching official character group", () => {
    const result = applyCnCostumeThumbnailMappings(
      { costumeNumber: 260221, name: "喵色格调", gender: "female", characterIds: [11], parts: { body: [{ colorId: 1 }] } },
      createCnCostumeThumbnailIndex(
        [{ id: 26022002, costume3dGroupId: 260221001, partType: "body", colorId: 1 }],
        [{ groupId: 260221001, name: "喵色格调", characterId: 11 }],
        ["https://haruki.test/costume3ds.json", "https://haruki.test/costume3dGroups.json", "https://haruki.test/gameCharacters.json"],
        [{ id: 11, gender: "male", figure: "mens", unit: "street" }]
      )
    ) as Record<string, any>;

    expect(result.gender).toBe("male");
    expect(result.genderMapping).toMatchObject({
      status: "matched",
      matchedGroupIds: [260221001],
      genders: ["male"],
      source: "CN costume3dGroups + gameCharacters master association"
    });
  });

  it("retains the wrapper gender when the matching official groups are mixed", () => {
    const result = applyCnCostumeThumbnailMappings(
      { name: "共享服装", gender: "female", characterIds: [1, 11], parts: {} },
      createCnCostumeThumbnailIndex(
        [],
        [{ groupId: 1, name: "共享服装", characterId: 1 }, { groupId: 2, name: "共享服装", characterId: 11 }],
        ["https://haruki.test/costume3dGroups.json", "https://haruki.test/gameCharacters.json"],
        [{ id: 1, gender: "female" }, { id: 11, gender: "male" }]
      )
    ) as Record<string, any>;

    expect(result.gender).toBe("female");
    expect(result.genderMapping).toMatchObject({ status: "ambiguous", genders: ["female", "male"] });
  });

  it("corrects a wrapper gender from a uniform official female group", () => {
    const result = applyCnCostumeThumbnailMappings(
      { name: "甜心天使", gender: "male", characterIds: [1], parts: {} },
      createCnCostumeThumbnailIndex(
        [],
        [{ groupId: 260211001, name: "甜心天使", characterId: 1 }],
        ["https://haruki.test/costume3dGroups.json", "https://haruki.test/gameCharacters.json"],
        [{ id: 1, gender: "female" }]
      )
    ) as Record<string, any>;

    expect(result.gender).toBe("female");
    expect(result.genderMapping).toMatchObject({ status: "matched", genders: ["female"] });
  });

  it("retains the wrapper gender when any matching official group has no gender", () => {
    const result = applyCnCostumeThumbnailMappings(
      { name: "未完整资料", gender: "female", characterIds: [1, 11], parts: {} },
      createCnCostumeThumbnailIndex(
        [],
        [{ groupId: 1, name: "未完整资料", characterId: 1 }, { groupId: 2, name: "未完整资料", characterId: 11 }],
        ["https://haruki.test/costume3dGroups.json", "https://haruki.test/gameCharacters.json"],
        [{ id: 1, gender: "female" }]
      )
    ) as Record<string, any>;

    expect(result.gender).toBe("female");
    expect(result.genderMapping).toMatchObject({ status: "no-match", genders: ["female"], unresolvedGroupGender: true });
  });

  it("keeps the existing candidate when same-name official groups resolve to different bundles", () => {
    const result = mapCostume(
      { name: "校园摇滚", characterIds: [1, 11], designer: "-", publishedAt: 1233288000000, parts: { body: [{ colorId: 1, assetbundleName: "existing-candidate" }] } },
      [
        { groupId: 1001, name: "校园摇滚", characterId: 1, designer: "-", publishedAt: 1233288000000 },
        { groupId: 2001, name: "校园摇滚", characterId: 11, designer: "-", publishedAt: 1233288000000 }
      ],
      [
        { id: 1002, costume3dGroupId: 1001, partType: "body", colorId: 1 },
        { id: 2002, costume3dGroupId: 2001, partType: "body", colorId: 1 }
      ]
    );

    expect(result.parts.body[0].assetbundleName).toBe("existing-candidate");
    expect(result.thumbnailAssetbundleMapping).toMatchObject({ status: "ambiguous", replacements: 0, ambiguousParts: ["body:1"] });
  });

  it("uses a verified numeric override or a complete official asset name", () => {
    expect(buildCnCostumeThumbnailAssetbundleName({ id: 9_999_002, partType: "body", colorId: 2, assetbundleName: "0278" })).toBe("cos0278_body_01");
    expect(buildCnCostumeThumbnailAssetbundleName({ id: 9_999_002, partType: "body", colorId: 2, assetbundleName: "body_seifuku_a" })).toBe("body_seifuku_a");
  });
});
describe("Story Live2D costume coverage", () => {
  it("keeps distinct costumes for one character when actions switch outfits", () => {
    const result = normalizeScenarioData("jp", { scenarioId: "story-test" } as any, {
      ScenarioId: "story-test",
      AppearCharacters: [
        { Character2dId: 2, CostumeType: "02saki_pajamas" },
        { Character2dId: 2, CostumeType: "02saki_normal" }
      ],
      FirstLayout: [{ Character2dId: 2, CostumeType: "02saki_pajamas" }],
      Snippets: [
        { Action: 4, ReferenceIndex: 0, Delay: 0 },
        { Action: 4, ReferenceIndex: 1, Delay: 0 }
      ],
      LayoutData: [
        { Character2dId: 2, CostumeType: "02saki_pajamas", MotionName: "pajamas_motion" },
        { Character2dId: 2, CostumeType: "02saki_normal", MotionName: "normal_motion" }
      ]
    }, [
      { id: "pajamas", modelPath: "v1/main/02_saki/02saki_pajamas" },
      { id: "normal", modelPath: "v1/main/02_saki/02saki_normal" }
    ] as any);

    expect(result.live2dModels.map((model) => model.costumeType)).toEqual(["02saki_pajamas", "02saki_normal"]);
    expect(result.modelQueue.at(-1)).toEqual(["02saki_pajamas", "02saki_normal"]);
  });

  it("uses the verified master directory for Parallel Paaaarty special-story voices", () => {
    const result = normalizeScenarioData("jp", {
      storyType: "specialStories", storyId: "69", scenarioId: "story_connect_live_parallelpaaaarty_01"
    } as any, {
      ScenarioId: "story_connect_live_Parallel_Paaaarty_01",
      Snippets: [{ Action: 1, ReferenceIndex: 0, Delay: 0 }],
      TalkData: [{ Voices: [{ VoiceId: "connectlive_12_beforestory_01_21_piapro" }] }]
    });

    expect((result.actions[0] as any).voice.url).toMatch(
      /\/startapp\/sound\/scenario\/voice\/story_connect_live_parallelpaaaarty_01\/connectlive_12_beforestory_01_21_piapro\.mp3$/
    );
  });
});

describe("Haruki Toolbox static image host", () => {
  it("allows the exact HTTPS host used by character icon candidates", () => {
    expect(isAllowedExternalAssetUrl("https://images.haruki.seiunx.com/sekai-toolbox/static_images/chara_icon/ick.png")).toBe(true);
    expect(isAllowedExternalAssetUrl("https://untrusted.images.haruki.seiunx.com/sekai-toolbox/static_images/chara_icon/ick.png")).toBe(false);
  });
});

describe("Haruki master metadata", () => {
  const originalBaseUrl = config.harukiMasterBaseUrl;

  afterEach(() => {
    Object.assign(config, { harukiMasterBaseUrl: originalBaseUrl });
    resetHarukiMasterClientStateForTests();
    vi.unstubAllGlobals();
  });

  it("uses the Haruki registry for ordinary master arrays before legacy mirrors", async () => {
    Object.assign(config, { harukiMasterBaseUrl: "https://haruki.test" });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/master/jp/current")) return new Response(JSON.stringify({ files: [] }), { status: 200 });
      if (url.endsWith("/v1/master/jp/files/events.json")) return new Response(JSON.stringify([{ id: 217 }]), { status: 200 });
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getOptionalMetadata("jp", "events.json")).resolves.toMatchObject({
      data: [{ id: 217 }],
      source: { sourceType: "team-haruki", primaryUrl: "https://haruki.test/v1/master/jp/files/events.json" }
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(expect.stringContaining("metadata.exmeaning.com"));
  });
});
