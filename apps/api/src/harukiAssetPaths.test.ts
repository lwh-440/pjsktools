import { describe, expect, it } from "vitest";

import { harukiAssetPath } from "./harukiAssetPaths.js";

describe("harukiAssetPath", () => {
  it("maps MySekai and event story assets to their exported locations", () => {
    expect(harukiAssetPath("mysekai/thumbnail/material/item_wood_1.webp"))
      .toBe("ondemand/mysekai/thumbnail/material/item_wood_1.png");
    expect(harukiAssetPath("mysekai/thumbnail/fixture/mdl_mis0001_house_house1_1.webp"))
      .toBe("ondemand/mysekai/thumbnail/fixture/mdl_mis0001_house_house1_1.png");
    expect(harukiAssetPath("event_story/event_drive_2026/screen_image/banner_event_story.webp"))
      .toBe("ondemand/event_story/event_drive_2026/screen_image/banner_event_story.png");
    expect(harukiAssetPath("event_story/event_stella_2020/scenario/event_01_01.asset"))
      .toBe("ondemand/event_story/event_stella_2020/scenario/event_01_01.json");
  });

  it("maps every supported story media family without changing established roots", () => {
    expect(harukiAssetPath("character/member_scenario/res001_no001/001001_ichika01.asset"))
      .toBe("startapp/character/member/res001_no001/001001_ichika01.json");
    expect(harukiAssetPath("scenario/unitstory/idol-story-chapter/mmj_01_00.asset"))
      .toBe("startapp/scenario/unitstory/idol-story-chapter/mmj_01_00.json");
    expect(harukiAssetPath("scenario/special/special-story/op_01.asset"))
      .toBe("startapp/scenario/special/special-story/op_01.json");
    expect(harukiAssetPath("scenario/background/bg_a000000/bg_a000000.webp"))
      .toBe("ondemand/scenario/background/bg_a000000/bg_a000000.png");
    expect(harukiAssetPath("sound/scenario/bgm/bgm00040/bgm00040.mp3"))
      .toBe("ondemand/sound/scenario/bgm/bgm00040/bgm00040.mp3");
    expect(harukiAssetPath("sound/scenario/se/se_pack00001/se00117.mp3"))
      .toBe("startapp/sound/scenario/se/se_pack00001/se00117.mp3");
  });

  it("maps virtual-live media and preserves already canonical and Live2D paths", () => {
    expect(harukiAssetPath("virtual_live/select/banner/vlentrance_00001_re/vlentrance_00001_re.webp"))
      .toBe("ondemand/virtual_live/select/banner/vlentrance_00001_re/vlentrance_00001_re.png");
    expect(harukiAssetPath("virtual_live/mc/scenario/mc_release_01_1/mc_release_01_1.asset"))
      .toBe("ondemand/virtual_live/mc/scenario/mc_release_01_1/mc_release_01_1.json");
    expect(harukiAssetPath("virtual_live/mc/voice/mc_release_01_1/voice_mc_release_01_1_01_21_piapro.mp3"))
      .toBe("ondemand/virtual_live/mc/voice/mc_release_01_1/voice_mc_release_01_1_01_21_piapro.mp3");
    expect(harukiAssetPath("music/long/vs_0010_02/vs_0010_02.mp3"))
      .toBe("ondemand/music/long/vs_0010_02/vs_0010_02.mp3");
    expect(harukiAssetPath("startapp/live2d/model/v1/main/model.model3.json"))
      .toBe("startapp/live2d/model/v1/main/model.model3.json");
    expect(harukiAssetPath("live2d/model/v1/main/model.model3.json"))
      .toBe("live2d/model/v1/main/model.model3.json");
    expect(harukiAssetPath("rank_live/honor/common/tier_25/main.webp"))
      .toBe("startapp/rank_live/honor/common/tier_25/main.png");
    expect(harukiAssetPath("comic/one_frame/comic_0001.webp"))
      .toBe("startapp/comic/one_frame/comic_0001.png");
  });
});
