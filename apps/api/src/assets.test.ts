process.env.HARUKI_ASSET_BASE_URL = "https://sekai-assets.haruki.seiunx.com";

import { describe, expect, it } from "vitest";

const { getAssetCandidates, getCardAssetDetail, getCollectionItemAssetDetail } = await import("./assets.js");

const harukiJp = "https://sekai-assets.haruki.seiunx.com/jp-assets";

describe("Haruki asset mappings", () => {
  it("uses the confirmed full-size card path instead of a thumbnail", () => {
    const assets = getCardAssetDetail("jp", {
      id: "281",
      character: "Test",
      title: "Test",
      rarity: 4,
      attribute: "mysterious",
      assetbundleName: "res003_no012"
    });

    expect(assets.normalUrl).toBe(`${harukiJp}/startapp/character/member/res003_no012/card_normal.png`);
    expect(assets.normalUrl).not.toContain("thumbnail");
  });

  it("uses verified Haruki paths for material 281 and stamp 125261", () => {
    const material = getCollectionItemAssetDetail("jp", "materials", {
      id: "281",
      raw: { id: 281 }
    });
    const stamp = getCollectionItemAssetDetail("jp", "stamps", {
      id: "125261",
      assetbundleName: "stamp125261",
      raw: { id: 125261, assetbundleName: "stamp125261" }
    });

    expect(material.imageCandidates[0]).toBe(`${harukiJp}/startapp/thumbnail/material/material281.png`);
    expect(stamp.imageCandidates[0]).toBe(`${harukiJp}/startapp/stamp/stamp125261/stamp125261.png`);
    expect(getAssetCandidates("jp", "thumbnail/common_material/coin.webp")[0]).toBe(`${harukiJp}/startapp/thumbnail/common_material/coin.png`);
    expect(getAssetCandidates("jp", "stamp/stamp125261/stamp125261.png")[0]).toBe(`${harukiJp}/startapp/stamp/stamp125261/stamp125261.png`);
  });

  it("uses documented gacha and honor startapp paths", () => {
    const gacha = getCollectionItemAssetDetail("jp", "gachas", {
      id: "281",
      assetbundleName: "ab_gacha_281",
      raw: { id: 281, assetbundleName: "ab_gacha_281" }
    });
    const honor = getCollectionItemAssetDetail("jp", "honors", {
      id: "281",
      assetbundleName: "honor_0281",
      raw: {
        id: 281,
        assetbundleName: "honor_0281",
        honorRarity: "highest",
        honorGroup: { backgroundAssetbundleName: "honor_0280", honorType: "event" }
      }
    });

    expect(gacha.imageCandidates[0]).toBe(`${harukiJp}/startapp/home/banner/banner_gacha281/banner_gacha281.png`);
    expect(gacha.bannerUrl).toBe(`${harukiJp}/startapp/home/banner/banner_gacha281/banner_gacha281.png`);
    expect(honor.imageCandidates[0]).toBe(`${harukiJp}/startapp/honor/honor_0280/degree_main.png`);
    expect(honor.rankMainUrl).toBe(`${harukiJp}/startapp/honor/honor_0281/rank_main.png`);
  });

  it("uses only the documented region asset root and the legacy TW mirror", () => {
    const jpCandidates = getAssetCandidates("jp", "stamp/stamp125261/stamp125261.png");
    const twCandidates = getAssetCandidates("tw", "thumbnail/material/material281.webp");

    expect(jpCandidates.filter((url) => url.startsWith("https://sekai-assets.haruki.seiunx.com/"))).toEqual([
      `${harukiJp}/startapp/stamp/stamp125261/stamp125261.png`
    ]);
    expect(twCandidates).toContain("https://storage.exmeaning.com/sekai-tw-assets/thumbnail/material/material281.webp");
  });

  it("keeps rank-match honor detail URLs under the rank-live root", () => {
    const honor = getCollectionItemAssetDetail("jp", "honors", {
      id: "1870",
      assetbundleName: "honor_rank_match_1870",
      raw: {
        id: 1870,
        assetbundleName: "honor_rank_match_1870",
        honorRarity: "highest",
        honorGroup: { backgroundAssetbundleName: "season_2022_summer", honorType: "rank_match" }
      }
    });

    expect(honor.degreeMainUrl).toBe(`${harukiJp}/startapp/rank_live/honor/season_2022_summer/degree_main.png`);
    expect(honor.rankMainUrl).toBe(`${harukiJp}/startapp/rank_live/honor/honor_rank_match_1870/main.png`);
  });
  it("keeps card_normal first and uses same-card after-training art only as a non-trainable fallback", () => {
    const nonTrainable = getCardAssetDetail("jp", {
      id: "1463", character: "MEIKO", title: "酔いどれ知らず", rarity: 4, attribute: "cute", assetbundleName: "res025_no058"
    });
    const trainable = getCardAssetDetail("jp", {
      id: "1473", character: "神代類", title: "いい１枚を頼むよ", rarity: 3, attribute: "mysterious", assetbundleName: "res016_no057", specialTrainingSkillId: "1"
    });

    expect(nonTrainable.specialTrainingAvailable).toBe(false);
    expect(nonTrainable.normalImageCandidates.slice(0, 2)).toEqual([
      `${harukiJp}/startapp/character/member/res025_no058/card_normal.png`,
      `${harukiJp}/startapp/character/member/res025_no058/card_after_training.png`
    ]);
    expect(nonTrainable.normalImageCandidates).toContain(`${harukiJp}/startapp/character/member/res025_no058/card_after_training.png`);
    expect(nonTrainable.afterTrainingImageCandidates).toEqual([]);
    const oneStar = getCardAssetDetail("jp", { id: "1", character: "星乃一歌", title: "first", rarity: 1, attribute: "cool", assetbundleName: "res001_no001" });
    const birthday = getCardAssetDetail("jp", { id: "295", character: "天馬咲希", title: "birthday", rarity: 4, attribute: "cute", assetbundleName: "res006_no012" });
    expect(oneStar.normalImageCandidates[0]).toBe(`${harukiJp}/startapp/character/member/res001_no001/card_normal.png`);
    expect(birthday.normalImageCandidates[0]).toBe(`${harukiJp}/startapp/character/member/res006_no012/card_normal.png`);
    expect(trainable.specialTrainingAvailable).toBe(true);
    expect(trainable.afterTrainingImageCandidates[0]).toBe(`${harukiJp}/startapp/character/member/res016_no057/card_after_training.png`);
  });

  it("does not publish guessed gacha logo or screen paths and maps comics and nested rank-match art", () => {
    const gacha = getCollectionItemAssetDetail("jp", "gachas", { id: "281", assetbundleName: "ab_gacha_281", raw: { id: 281, assetbundleName: "ab_gacha_281" } });
    const comic = getCollectionItemAssetDetail("jp", "comics", { id: "1", assetbundleName: "comic_0001", raw: { id: 1, assetbundleName: "comic_0001" } });
    const rankMatch = getCollectionItemAssetDetail("jp", "honors", { id: "25", assetbundleName: "common/tier_25", raw: { id: 25, assetbundleName: "common/tier_25", honorGroup: { honorType: "rank_match", backgroundAssetbundleName: "common/tier_25" } } });

    expect(gacha.bannerUrl).toBe(`${harukiJp}/startapp/home/banner/banner_gacha281/banner_gacha281.png`);
    expect(gacha).not.toHaveProperty("logoUrl");
    expect(gacha).not.toHaveProperty("screenUrl");
    expect(comic.imageCandidates[0]).toBe(`${harukiJp}/startapp/comic/one_frame/comic_0001.png`);
    expect(rankMatch.rankMainUrl).toBe(`${harukiJp}/startapp/rank_live/honor/common/tier_25/main.png`);
  });
});
