import { describe, expect, it } from "vitest";
import { isPublicCostumeItem, model3FromHarukiBuildModelData, normalizeScenarioData } from "./externalData.js";

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
});
