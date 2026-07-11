import { normalizeScenarioData } from "../apps/api/dist/externalData.js";

const regions = ["jp", "en", "tw", "kr", "cn"];
const failures = [];
const scenario = {
  ScenarioId: "fixture_01",
  FirstBackground: "bg_fixture",
  FirstBgm: "bgm_fixture",
  FirstCharacterLayoutMode: 0,
  AppearCharacters: [
    { Character2dId: 1, CostumeType: "costume_a" },
    { Character2dId: 2, CostumeType: "costume_b" }
  ],
  FirstLayout: [],
  TalkData: [{ Body: "hello", WindowDisplayName: "Ichika", Motions: [{ Character2dId: 1, MotionName: "talk 01", FacialName: "face 01" }], Voices: [{ VoiceId: "voice_01" }] }],
  LayoutData: [{ Character2dId: 1, CostumeType: "costume_a", MotionName: "idle", FacialName: "normal", SideTo: 3, Type: 2 }],
  SpecialEffectData: [
    { EffectType: 42, StringVal: "10,20", Duration: 0.3 },
    { EffectType: 29, Duration: 0.3 },
    { EffectType: 19, StringVal: "movie_fixture", Duration: 1 }
  ],
  SoundData: [{ Bgm: "bgm_fixture", Se: "", PlayMode: 0, Volume: 1, Duration: 0.2 }],
  ScenarioSnippetCharacterLayoutModes: [{ CharacterLayoutMode: 3 }],
  Snippets: [
    { Action: 2, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
    { Action: 8, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 },
    { Action: 6, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
    { Action: 6, ReferenceIndex: 1, Delay: 0, ProgressBehavior: 1 },
    { Action: 6, ReferenceIndex: 2, Delay: 0, ProgressBehavior: 1 },
    { Action: 7, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 },
    { Action: 99, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 }
  ]
};

for (const region of regions) {
  const parsed = normalizeScenarioData(region, { storyType: "fixture", storyId: "1", scenarioId: "fixture_01", scenarioDataPath: "", scenarioDataUrl: "", proxiedScenarioDataUrl: "", isCardStory: false, isActionSet: false, raw: {} }, scenario, [
    { id: "costume_a", modelPath: "costume_a", model3JsonUrl: `https://example.invalid/${region}/costume_a.model3.json` },
    { id: "costume_b", modelPath: "costume_b", model3JsonUrl: `https://example.invalid/${region}/costume_b.model3.json` }
  ]);
  if (parsed.playbackVersion !== "story-live2d-v2-reference") failures.push(`${region}: playback version`);
  if (parsed.actions.find((action) => action.type === "ActionLayoutMode")?.characterLayoutMode !== 3) failures.push(`${region}: layout mode`);
  if (!parsed.actions.some((action) => action.effectName === "ChangeCameraPosition")) failures.push(`${region}: camera action`);
  if (!parsed.actions.some((action) => action.effectName === "BlackWipeInLeft")) failures.push(`${region}: wipe action`);
  if (!parsed.scenarioResource.video.length) failures.push(`${region}: movie resource`);
  if (!parsed.modelQueue.length || parsed.modelQueue.some((queue) => queue.length > 6)) failures.push(`${region}: model queue`);
  if (!parsed.preloadPlan.models.find((model) => model.costumeType === "costume_a")?.motions.includes("talk01")) failures.push(`${region}: motion plan`);
  if (!parsed.unsupportedActions.includes("SnippetAction.99")) failures.push(`${region}: unsupported action`);
  const urls = parsed.preloadPlan.media.map((item) => item.url).filter(Boolean);
  const expectedDirectory = { jp: "/sekai-jp-assets/", en: "/sekai-en-assets/", tw: "/sekai-tc-assets/", kr: "/sekai-kr-assets/", cn: "/sekai-cn-assets/" }[region];
  if (urls.some((url) => !url.includes(expectedDirectory))) failures.push(`${region}: cross-region media URL`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Story Live2D v2 five-region fixture verification passed.");
