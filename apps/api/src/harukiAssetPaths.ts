export function harukiAssetPath(assetPath: string) {
  const path = assetPath.replace(/^\/+/, "");
  if (/^(?:ondemand|startapp)\//.test(path)) return path;

  const card = path.match(/^character\/member\/([^/]+)\/card_(normal|after_training)\.webp$/);
  if (card) return `startapp/character/member/${card[1]}/card_${card[2]}.png`;
  const thumbnail = path.match(/^thumbnail\/chara\/([^/]+)_(normal|after_training)\.webp$/);
  if (thumbnail) return `startapp/thumbnail/chara/${thumbnail[1]}_${thumbnail[2]}.png`;
  const music = path.match(/^music\/jacket\/([^/]+)\/[^/]+\.webp$/);
  if (music) return `startapp/thumbnail/music_jacket/${music[1]}.png`;
  const gachaBanner = path.match(/^home\/banner\/(banner_gacha\d+)\/\1\.webp$/);
  if (gachaBanner) return `startapp/home/banner/${gachaBanner[1]}/${gachaBanner[1]}.png`;
  const gachaLogo = path.match(/^gacha\/([^/]+)\/logo\/logo\.webp$/);
  if (gachaLogo) return `startapp/gacha/${gachaLogo[1]}/logo/logo.png`;
  const gachaScreen = path.match(/^gacha\/([^/]+)\/screen\/bg_gacha(\d+)_1\.webp$/);
  if (gachaScreen) return `startapp/gacha/${gachaScreen[1]}/screen/texture/bg_gacha${gachaScreen[2]}.png`;
  const honor = path.match(/^honor\/([^/]+)\/(degree_(?:main|sub)|rank_(?:main|sub)|scroll)\.webp$/);
  if (honor) return `startapp/honor/${honor[1]}/${honor[2]}.png`;
  const rankLiveHonor = path.match(/^rank_live\/honor\/(.+)\/(degree_(?:main|sub)|rank_(?:main|sub)|main|sub|scroll)\.webp$/);
  if (rankLiveHonor) return `startapp/rank_live/honor/${rankLiveHonor[1]}/${rankLiveHonor[2]}.png`;
  const honorFrame = path.match(/^honor_frame\/([^/]+)\/(frame_degree_[ms]_[1-4])\.webp$/);
  if (honorFrame) return `startapp/honor_frame/${honorFrame[1]}/${honorFrame[2]}.png`;
  const costume = path.match(/^thumbnail\/costume\/([^/]+)\.webp$/);
  if (costume) return `startapp/thumbnail/costume/${costume[1]}.png`;
  const material = path.match(/^thumbnail\/material\/([^/]+)\.webp$/);
  if (material) return `startapp/thumbnail/material/${material[1]}.png`;
  const commonMaterial = path.match(/^thumbnail\/common_material\/([^/]+)\.webp$/);
  if (commonMaterial) return `startapp/thumbnail/common_material/${commonMaterial[1]}.png`;
  const stamp = path.match(/^stamp\/([^/]+)\/[^/]+\.png$/);
  if (stamp) return `startapp/stamp/${stamp[1]}/${stamp[1]}.png`;
  const comic = path.match(/^comic\/one_frame\/([^/]+)\.webp$/);
  if (comic) return `startapp/comic/one_frame/${comic[1]}.png`;

  const eventStoryImage = path.match(/^event_story\/(.+)\/(screen_image|episode_image)\/([^/]+)\.webp$/);
  if (eventStoryImage) return `ondemand/event_story/${eventStoryImage[1]}/${eventStoryImage[2]}/${eventStoryImage[3]}.png`;
  const eventStoryScenario = path.match(/^event_story\/(.+)\/scenario\/([^/]+)\.asset$/);
  if (eventStoryScenario) return `ondemand/event_story/${eventStoryScenario[1]}/scenario/${eventStoryScenario[2]}.json`;
  const cardScenario = path.match(/^character\/member_scenario\/([^/]+)\/([^/]+)\.asset$/);
  if (cardScenario) return `startapp/character/member/${cardScenario[1]}/${cardScenario[2]}.json`;
  const storyScenario = path.match(/^scenario\/(unitstory|special)\/(.+)\.asset$/);
  if (storyScenario) return `startapp/scenario/${storyScenario[1]}/${storyScenario[2]}.json`;
  const background = path.match(/^scenario\/background\/(.+)\/([^/]+)\.webp$/);
  if (background) return `ondemand/scenario/background/${background[1]}/${background[2]}.png`;
  if (/^sound\/(?:scenario|card_scenario|actionset)\/voice\//.test(path) || /^sound\/scenario\/bgm\//.test(path)) return `ondemand/${path}`;
  if (/^sound\/scenario\/se\//.test(path)) return `startapp/${path}`;
  const virtualLiveImage = path.match(/^virtual_live\/(select\/banner\/.+\/[^/]+)\.webp$/);
  if (virtualLiveImage) return `ondemand/virtual_live/${virtualLiveImage[1]}.png`;
  const virtualLiveScenario = path.match(/^virtual_live\/mc\/scenario\/(.+)\.asset$/);
  if (virtualLiveScenario) return `ondemand/virtual_live/mc/scenario/${virtualLiveScenario[1]}.json`;
  const mysekaiImage = path.match(/^mysekai\/(.+)\.webp$/);
  if (mysekaiImage) return `ondemand/mysekai/${mysekaiImage[1]}.png`;
  if (/^virtual_live\/mc\/(?:timeline|voice)\//.test(path) || /^music\/long\//.test(path) || /^mysekai\//.test(path)) return `ondemand/${path}`;

  return path;
}
