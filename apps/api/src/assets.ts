import { config, regions, type RegionId } from "./config.js";
import { externalAssetSources } from "./externalData.js";
import { harukiAssetPath } from "./harukiAssetPaths.js";
import { isConfirmedUpstreamMissingAsset } from "./fixtures/confirmedUpstreamMissingAssets.js";
import type { Card, EventInfo, MasterCollectionItem, Song } from "./types.js";

const sekaiBestAssetBase = "https://storage.sekai.best";
const moeAssetBase = "https://storage.exmeaning.com";
const moeOverseasAssetBase = "https://storage.pjsk.moe";
const moeStaticBase = "https://moe.exmeaning.com";
const moeChartBase = "https://charts-new.unipjsk.com/moe/svg";
const comicsAssetBase = `${sekaiBestAssetBase}/sekai-comics`;
const live2dAssetBase = `${sekaiBestAssetBase}/sekai-live2d-assets`;
const harukiAssetBase = config.harukiAssetBaseUrl.replace(/\/+$/, "");
const harukiAssetMirrorBases = uniqueStrings([
  harukiAssetBase,
  "https://sekai-assets-haruki.seiunx.net",
  "https://sekai-assets-cn03-she01-cdn.haruki.seiunx.com",
  "https://sekai-assets-cn04-sha01-cdn.haruki.seiunx.com"
]);
const harukiToolboxImageBase = "https://images.haruki.seiunx.com/sekai-toolbox/static_images/chara_icon";

// Team-Haruki Toolbox publishes these stable icon nicknames for every game character icon.
const harukiCharacterIconNicknames: Record<number, string> = {
  1: "ick", 2: "saki", 3: "hnm", 4: "shiho", 5: "mnr", 6: "hrk", 7: "airi", 8: "szk",
  9: "khn", 10: "an", 11: "akt", 12: "toya", 13: "tks", 14: "emu", 15: "nene", 16: "rui",
  17: "knd", 18: "mfy", 19: "ena", 20: "mzk", 21: "miku", 22: "rin", 23: "len", 24: "luka",
  25: "meiko", 26: "kaito", 27: "miku_light_sound", 28: "miku_idol", 29: "miku_street",
  30: "miku_theme_park", 31: "miku_school_refusal"
};

const regionAssetDir: Record<RegionId, string> = {
  jp: "jp-assets",
  en: "en-assets",
  tw: "tw-assets",
  kr: "kr-assets",
  cn: "cn-assets"
};
const legacyRegionAssetDir: Record<RegionId, string> = {
  jp: "sekai-jp-assets", en: "sekai-en-assets", tw: "sekai-tw-assets", kr: "sekai-kr-assets", cn: "sekai-cn-assets"
};

function padMusicId(musicId: string | number) {
  return String(musicId).padStart(4, "0");
}

function lowerDifficulty(difficulty: string) {
  return difficulty.trim().toLowerCase();
}

function rawOf(item: MasterCollectionItem) {
  return (item.raw ?? {}) as Record<string, unknown>;
}

function stringField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}

function numberField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function costumeRepresentativePart(raw: Record<string, unknown>) {
  const parts = raw.parts && typeof raw.parts === "object" ? raw.parts as Record<string, unknown> : {};
  for (const partType of ["body", "hair", "head"]) {
    const variants = parts[partType];
    if (Array.isArray(variants)) {
      const variant = variants.find((entry) => entry && typeof entry === "object" && stringField(entry as Record<string, unknown>, ["assetbundleName"]));
      if (variant) return { partType, ...(variant as Record<string, unknown>) };
    }
  }
  if (Array.isArray(raw.extraParts)) {
    for (const extra of raw.extraParts) {
      if (!extra || typeof extra !== "object") continue;
      const record = extra as Record<string, unknown>;
      const variants = Array.isArray(record.variants) ? record.variants : [];
      const variant = variants.find((entry) => entry && typeof entry === "object" && stringField(entry as Record<string, unknown>, ["assetbundleName"]));
      if (variant) return { partType: String(record.partType ?? "extraParts"), characterId: record.characterId, ...(variant as Record<string, unknown>) };
    }
  }
  return undefined;
}

function sekaiBestAssetUrl(region: RegionId, assetPath: string) {
  return `${sekaiBestAssetBase}/${legacyRegionAssetDir[region]}/${assetPath.replace(/^\/+/, "")}`;
}

function harukiAssetCandidates(region: RegionId, assetPath: string) {
  const path = harukiAssetPath(assetPath);
  return harukiAssetMirrorBases.map((base) => `${base}/${regionAssetDir[region]}/${path}`);
}

function harukiAssetUrl(region: RegionId, assetPath: string) {
  return harukiAssetCandidates(region, assetPath)[0] ?? "";
}

function assetUrl(region: RegionId, assetPath: string) {
  return harukiAssetUrl(region, assetPath) || sekaiBestAssetUrl(region, assetPath);
}

function moeAssetUrl(region: RegionId, assetPath: string) {
  return `${moeAssetBase}/${legacyRegionAssetDir[region]}/${assetPath.replace(/^\/+/, "")}`;
}

function moeOverseasAssetUrl(region: RegionId, assetPath: string) {
  return `${moeOverseasAssetBase}/${legacyRegionAssetDir[region]}/${assetPath.replace(/^\/+/, "")}`;
}

function moeAssetUrlPair(region: RegionId, assetPath: string) {
  return [moeAssetUrl(region, assetPath), moeOverseasAssetUrl(region, assetPath)];
}

export function proxiedAssetUrl(url: string) {
  if (url.startsWith("/api/")) return url;
  return `/api/assets/proxy?url=${encodeURIComponent(url)}`;
}

function unproxiedAssetUrl(url: string) {
  if (!url.startsWith("/api/assets/proxy?")) return url;
  try {
    return new URL(url, "https://pjsk-tools.local").searchParams.get("url") || url;
  } catch {
    return url;
  }
}

export function getAssetSourceLabel(url: string, fallback: string) {
  try {
    const hostname = new URL(unproxiedAssetUrl(url)).hostname.toLowerCase();
    if (hostname === "sekai-assets-cn04-sha01-cdn.haruki.seiunx.com" || (hostname.startsWith("sekai-assets-") && hostname.endsWith(".haruki.seiunx.com")) || hostname === "sekai-assets-haruki.seiunx.net") return "Haruki asset storage";
    if (hostname === "images.haruki.seiunx.com") return "Haruki Toolbox static assets";
    if (hostname === "storage.exmeaning.com" || hostname === "moe.exmeaning.com") return "Moesekai asset mirror";
    if (hostname === "storage.pjsk.moe") return "pjsk.moe asset mirror";
    if (hostname === "storage.sekai.best") return "Sekai Viewer asset mirror";
  } catch {
    // Keep the established label when a legacy or relative URL cannot identify its host.
  }
  return fallback;
}

export function getAssetCandidates(region: RegionId, assetPath: string) {
  const path = assetPath.replace(/^\/+/, "");
  const direct = [...harukiAssetCandidates(region, path), moeAssetUrl(region, path), moeOverseasAssetUrl(region, path), sekaiBestAssetUrl(region, path)];
  return uniqueStrings([...direct, ...direct.map(proxiedAssetUrl)]);
}

export function getCharacterIconCandidates(region: RegionId, characterId?: string | number) {
  if (characterId == null || String(characterId).trim() === "") return [];
  const nickname = harukiCharacterIconNicknames[Number(characterId)];
  if (!nickname) return [];
  const staticUrl = `${harukiToolboxImageBase}/${nickname}.png`;
  return [staticUrl, proxiedAssetUrl(staticUrl)];
}

function uniqueStrings(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim())).filter((value, index, array) => array.indexOf(value) === index);
}

function legacyComicCandidates(region: RegionId, assetbundleName: string, numericId?: number) {
  return uniqueStrings([
    assetbundleName ? `${comicsAssetBase}/comic/one_frame/${assetbundleName}.webp` : undefined,
    assetbundleName ? moeAssetUrl(region, `comic/one_frame/${assetbundleName}.webp`) : undefined,
    assetbundleName ? moeOverseasAssetUrl(region, `comic/one_frame/${assetbundleName}.webp`) : undefined,
    assetbundleName ? `${comicsAssetBase}/comic/${assetbundleName}/${assetbundleName}.webp` : undefined,
    assetbundleName ? sekaiBestAssetUrl(region, `comic/one_frame/${assetbundleName}.webp`) : undefined,
    numericId ? `${moeStaticBase}/mangas/${numericId}.webp` : undefined,
    numericId ? `${moeStaticBase}/assets/mangas/${numericId}.webp` : undefined
  ]);
}

export function getAssetConfig(region: RegionId) {
  const regionConfig = regions.find((item) => item.id === region);
  const assetDir = regionAssetDir[region];
  return {
    region,
    assetDirectory: assetDir,
    mirrorPriority: [
      ...harukiAssetMirrorBases,
      moeAssetBase,
      moeOverseasAssetBase,
      sekaiBestAssetBase,
      "same-origin asset proxy"
    ],
    cachePolicy: {
      stableAssets: "public, max-age=31536000, immutable",
      proxyFailureTtlSeconds: 60,
      browserFallback: "same-region only"
    },
    sourceHealth: {
      mode: "cached-background-probe",
      blockingProbe: false,
      status: "not-probed"
    },
    repository: regionConfig?.repository ?? "",
    sources: {
      master: "Haruki master registry primary, Moesekai metadata and Team-Haruki raw fallbacks",
      formulaReferenceMaster: "Haruki master registry primary, Moesekai metadata and Team-Haruki raw fallbacks",
      realtimeRanking: "Haruki toolbox primary, rks-n fallback",
      publicPlayerAssets: "Haruki Suite Public API for user-uploaded public player assets",
      rankingFallback: "Haruki toolbox primary; rks-n fallback for churn and unavailable legacy boards",
      sekaiBestAssets: `${sekaiBestAssetBase}/${assetDir}`,
      moeAssets: `${moeAssetBase}/${assetDir}`,
      moeChartSvg: moeChartBase,
      uniHarukiStorage: "storage.sekai.best / storage.pjsk.moe asset hosting fallback",
      ...externalAssetSources(region)
    },
    rules: {
      realDataRequired: true,
      fakeChartPreviewAllowed: false,
      chartFallback: "真实 SVG 不可用时只显示不可用提示和 SUS 链接，不生成伪造谱面图"
    }
  };
}

export function getMusicJacketUrl(region: RegionId, song: Song) {
  const assetName = song.jacketAssetbundleName ?? song.assetbundleName;
  if (!assetName) return "";
  return assetUrl(region, `music/jacket/${assetName}/${assetName}.webp`);
}

export function getMusicAssetDetail(region: RegionId, song: Song) {
  const assetName = song.jacketAssetbundleName ?? song.assetbundleName;
  const imageCandidates = assetName ? getAssetCandidates(region, `music/jacket/${assetName}/${assetName}.webp`) : [];
  const jacketUrl = imageCandidates[0] ?? getMusicJacketUrl(region, song);
  return {
    region,
    musicId: song.id,
    title: song.title,
    jacketUrl,
    imageCandidates,
    assetSourceTrace: { region, assetDirectory: regionAssetDir[region], priority: ["haruki", "exmeaning", "pjsk.moe", "sekai.best", "proxy"] },
    assetbundleName: song.assetbundleName,
    jacketAssetbundleName: song.jacketAssetbundleName,
    sources: {
      jacketUrl: getAssetSourceLabel(jacketUrl, "Sekai Viewer asset mirror")
    }
  };
}

export function getCardNormalUrl(region: RegionId, card: Card) {
  if (!card.assetbundleName) return "";
  return assetUrl(region, `character/member/${card.assetbundleName}/card_normal.webp`);
}

export function getCardAfterTrainingUrl(region: RegionId, card: Card) {
  if (!card.assetbundleName) return "";
  return assetUrl(region, `character/member/${card.assetbundleName}/card_after_training.webp`);
}

export function getCardNormalThumbnailUrl(region: RegionId, card: Card) {
  if (!card.assetbundleName) return "";
  return assetUrl(region, `thumbnail/chara/${card.assetbundleName}_normal.webp`);
}

export function getCardAfterTrainingThumbnailUrl(region: RegionId, card: Card) {
  if (!card.assetbundleName) return "";
  return assetUrl(region, `thumbnail/chara/${card.assetbundleName}_after_training.webp`);
}

export function supportsCardSpecialTraining(card: Pick<Card, "cardRarityType">) {
  return card.cardRarityType === "rarity_3" || card.cardRarityType === "rarity_4";
}

export function cardShowsOnlyTrainedArt(card: Pick<Card, "cardRarityType" | "initialSpecialTrainingStatus">) {
  return supportsCardSpecialTraining(card) && card.initialSpecialTrainingStatus === "done";
}

export function getCardAssetDetail(region: RegionId, card: Card) {
  const supportsSpecialTraining = supportsCardSpecialTraining(card);
  const showsOnlyTrainedArt = cardShowsOnlyTrainedArt(card);
  const normalImageCandidates = card.assetbundleName ? getAssetCandidates(region, `character/member/${card.assetbundleName}/card_normal.webp`) : [];
  const afterTrainingImageCandidates = card.assetbundleName ? getAssetCandidates(region, `character/member/${card.assetbundleName}/card_after_training.webp`) : [];
  const normalThumbnailCandidates = card.assetbundleName ? getAssetCandidates(region, `thumbnail/chara/${card.assetbundleName}_normal.webp`) : [];
  const afterTrainingThumbnailCandidates = card.assetbundleName ? getAssetCandidates(region, `thumbnail/chara/${card.assetbundleName}_after_training.webp`) : [];
  const normalUrl = showsOnlyTrainedArt ? "" : normalImageCandidates[0] ?? normalThumbnailCandidates[0] ?? "";
  const normalThumbnailUrl = normalThumbnailCandidates[0] ?? normalUrl;
  const trainedImageCandidates = supportsSpecialTraining ? afterTrainingImageCandidates : [];
  const trainedThumbnailCandidates = supportsSpecialTraining ? afterTrainingThumbnailCandidates : [];
  const afterTrainingUrl = trainedImageCandidates[0] ?? trainedThumbnailCandidates[0] ?? "";
  const afterTrainingThumbnailUrl = trainedThumbnailCandidates[0] ?? afterTrainingUrl;
  return {
    region,
    cardId: card.id,
    title: card.title,
    character: card.character,
    normalUrl,
    afterTrainingUrl,
    normalThumbnailUrl: showsOnlyTrainedArt ? "" : normalThumbnailUrl,
    afterTrainingThumbnailUrl,
    specialTrainingAvailable: supportsSpecialTraining,
    showsOnlyTrainedArt,
    // List surfaces may use the trained image if the original source is absent, but detail surfaces keep the two states separate.
    imageCandidates: uniqueStrings(showsOnlyTrainedArt
      ? [...trainedImageCandidates, ...trainedThumbnailCandidates]
      : [...normalImageCandidates, ...normalThumbnailCandidates, ...trainedImageCandidates, ...trainedThumbnailCandidates]),
    normalImageCandidates: showsOnlyTrainedArt ? [] : normalImageCandidates,
    normalThumbnailCandidates: showsOnlyTrainedArt ? [] : normalThumbnailCandidates,
    afterTrainingImageCandidates: trainedImageCandidates,
    afterTrainingThumbnailCandidates: trainedThumbnailCandidates,
    assetSourceTrace: { region, assetDirectory: regionAssetDir[region], priority: ["haruki", "exmeaning", "pjsk.moe", "sekai.best", "proxy"] },
    assetbundleName: card.assetbundleName,
    sources: {
      normalUrl: showsOnlyTrainedArt ? "not-applicable-initially-trained" : "Haruki original card art",
      afterTrainingUrl: supportsSpecialTraining ? "Haruki special-training card art" : "not-applicable",
      normalThumbnailUrl: "Haruki original card thumbnail",
      afterTrainingThumbnailUrl: supportsSpecialTraining ? "Haruki special-training thumbnail" : "not-applicable"
    }
  };
}

export function getEventBannerUrl(region: RegionId, event: EventInfo) {
  if (!event.assetbundleName) return "";
  return assetUrl(region, `ondemand/event_story/${event.assetbundleName}/screen_image/banner_event_story.png`);
}

export function getEventAssetDetail(region: RegionId, event: EventInfo) {
  const imageCandidates = event.assetbundleName
    ? uniqueStrings([
      ...getAssetCandidates(region, `ondemand/event_story/${event.assetbundleName}/screen_image/banner_event_story.png`),
      `${sekaiBestAssetBase}/${legacyRegionAssetDir[region]}/event_story/${event.assetbundleName}/screen_image/banner_event_story.webp`,
      `${moeAssetBase}/${legacyRegionAssetDir[region]}/event_story/${event.assetbundleName}/screen_image/banner_event_story.webp`,
      // A small set of early events used the pre-event-story banner layout.
      ...getAssetCandidates(region, `ondemand/event/${event.assetbundleName}/screen/banner.png`)
    ])
    : [];
  const bannerUrl = imageCandidates[0] ?? getEventBannerUrl(region, event);
  return {
    region,
    eventId: event.id,
    name: event.name,
    bannerUrl,
    imageCandidates,
    assetSourceTrace: { region, assetDirectory: regionAssetDir[region], priority: ["haruki", "exmeaning", "pjsk.moe", "sekai.best", "proxy"] },
    assetbundleName: event.assetbundleName,
    sources: {
      bannerUrl: getAssetSourceLabel(bannerUrl, "Sekai Viewer asset mirror")
    }
  };
}

export function getChartAssetDetail(region: RegionId, song: Song, difficulty: string) {
  const normalizedDifficulty = lowerDifficulty(difficulty);
  const paddedId = padMusicId(song.id);
  const difficultyDetail = song.difficultyDetails?.find((item) => lowerDifficulty(item.difficulty) === normalizedDifficulty);
  const jacketUrl = getMusicJacketUrl(region, song);

  return {
    region,
    musicId: song.id,
    title: song.title,
    difficulty: difficultyDetail?.difficulty ?? difficulty,
    difficultyId: difficultyDetail?.id,
    playLevel: difficultyDetail?.playLevel,
    totalNoteCount: difficultyDetail?.totalNoteCount,
    durationSeconds: song.durationSeconds,
    bpm: song.bpm,
    jacketUrl,
    chartSvgUrl: `/api/assets/charts/${region}/${song.id}/${normalizedDifficulty}?format=svg`,
    chartPngUrl: `/api/assets/charts/${region}/${song.id}/${normalizedDifficulty}?format=png`,
    sekaiViewerChartSvgUrl: `/api/assets/charts/${region}/${song.id}/${normalizedDifficulty}?format=svg`,
    susUrl: `https://sekai-assets-cn04-sha01-cdn.haruki.seiunx.com/${region}-assets/startapp/music/music_score/${paddedId}_01/${normalizedDifficulty}.txt?v=2`,
    assetStatus: "partial",
    sourcePolicy: "mixed",
    missingResources: [],
    externalDependencies: ["asset3.pjsekai.moe/live/note/custom01 (optional note skin; local vector fallback is embedded when unavailable)"],
    source: {
      chartSvgUrl: "Haruki SUS rendered server-side with pjsekai-scores-rs v0.4.3",
      chartPngUrl: "Haruki SUS rendered server-side with pjsekai-scores-rs v0.4.3",
      susUrl: "Haruki asset storage music_score",
      noteSkin: "external-dependency with local fallback",
      jacketUrl: "Haruki asset storage"
    },
    realDataRequired: true
  };
}

function collectionAssetCandidates(region: RegionId, type: string, id: string, assetbundleName = "", raw: Record<string, unknown> = {}) {
  const gachaId = stringField(raw, ["id"]) || id;
  const numericId = numberField(raw, ["id", "materialId", "costume3dId", "seq"]) ?? (Number.isFinite(Number(id)) ? Number(id) : undefined);
  const rarity = stringField(raw, ["honorRarity"]);
  const honorGroup = raw.honorGroup && typeof raw.honorGroup === "object" ? (raw.honorGroup as Record<string, unknown>) : {};
  const frameName = stringField(honorGroup, ["frameName"]);
  const backgroundAssetbundleName = stringField(honorGroup, ["backgroundAssetbundleName"]);
  const honorType = stringField(honorGroup, ["honorType"]);
  const thumbnailAssetbundleName = stringField(raw, ["thumbnailAssetbundleName"]);
  const iconAssetbundleName = stringField(raw, ["iconAssetbundleName"]);

  switch (type) {
    case "gachas":
      // A banner is not exported for every region-specific ticket or gift gacha. Haruki's documented ondemand bundle logo is the real fallback.
      return uniqueStrings([
        ...(gachaId ? harukiAssetCandidates(region, `startapp/home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.png`) : []),
        ...(assetbundleName ? harukiAssetCandidates(region, `ondemand/gacha/${assetbundleName}/logo/logo.png`) : []),
        ...(gachaId ? moeAssetUrlPair(region, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.webp`) : []),
        ...(assetbundleName ? moeAssetUrlPair(region, `gacha/${assetbundleName}/logo/logo.webp`) : []),
        gachaId ? assetUrl(region, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.webp`) : undefined,
        assetbundleName ? assetUrl(region, `gacha/${assetbundleName}/logo/logo.webp`) : undefined
      ]);

    case "honors": {
      const backgroundName = backgroundAssetbundleName || assetbundleName;
      const frameRarity = { low: 1, middle: 2, high: 3, highest: 4 }[rarity as "low" | "middle" | "high" | "highest"] ?? 1;
      const rankRoot = honorType === "rank_match" ? "rank_live/honor" : "honor";
      return uniqueStrings([
        ...(backgroundName ? harukiAssetCandidates(region, `${rankRoot}/${backgroundName}/degree_main.webp`) : []),
        ...(backgroundName ? harukiAssetCandidates(region, `${rankRoot}/${backgroundName}/degree_sub.webp`) : []),
        ...(frameName ? harukiAssetCandidates(region, `honor_frame/${frameName}/frame_degree_m_${frameRarity}.webp`) : []),
        ...(frameName ? harukiAssetCandidates(region, `honor_frame/${frameName}/frame_degree_s_${frameRarity}.webp`) : []),
        ...(assetbundleName ? harukiAssetCandidates(region, `${rankRoot}/${assetbundleName}/rank_main.webp`) : []),
        ...(assetbundleName ? harukiAssetCandidates(region, `${rankRoot}/${assetbundleName}/main.webp`) : []),
        ...(assetbundleName ? harukiAssetCandidates(region, `honor/${assetbundleName}/scroll.webp`) : [])
      ]);
    }
    case "materials":
      return uniqueStrings([
        ...(numericId ? harukiAssetCandidates(region, `startapp/thumbnail/material/material${numericId}.png`) : []),
        ...(numericId ? [moeAssetUrl(region, `thumbnail/material/material${numericId}.webp`), moeOverseasAssetUrl(region, `thumbnail/material/material${numericId}.webp`)] : []),
        numericId ? assetUrl(region, `thumbnail/material/material${numericId}.webp`) : undefined,
        numericId ? moeAssetUrl(region, `thumbnail/material/material${numericId}.webp`) : undefined,
        numericId ? moeOverseasAssetUrl(region, `thumbnail/material/material${numericId}.webp`) : undefined,
        assetbundleName ? assetUrl(region, `thumbnail/material/${assetbundleName}.webp`) : undefined,
        thumbnailAssetbundleName ? assetUrl(region, `thumbnail/material/${thumbnailAssetbundleName}.webp`) : undefined,
        iconAssetbundleName ? assetUrl(region, `thumbnail/material/${iconAssetbundleName}.webp`) : undefined,
        assetbundleName ? assetUrl(region, `thumbnail/common_material/${assetbundleName}.webp`) : undefined,
        thumbnailAssetbundleName ? assetUrl(region, `thumbnail/common_material/${thumbnailAssetbundleName}.webp`) : undefined,
        iconAssetbundleName ? assetUrl(region, `thumbnail/common_material/${iconAssetbundleName}.webp`) : undefined
      ]);
    case "costumes":
      {
        const representative = costumeRepresentativePart(raw);
        const representativeAsset = representative ? stringField(representative, ["assetbundleName"]) : "";
        return representativeAsset ? getAssetCandidates(region, `thumbnail/costume/${representativeAsset}.webp`) : [];
      }
    case "stamps":
      return assetbundleName ? uniqueStrings([
        ...harukiAssetCandidates(region, `startapp/stamp/${assetbundleName}/${assetbundleName}.png`),
        moeAssetUrl(region, `stamp/${assetbundleName}/${assetbundleName}.png`),
        moeOverseasAssetUrl(region, `stamp/${assetbundleName}/${assetbundleName}.png`),
        sekaiBestAssetUrl(region, `stamp/${assetbundleName}/${assetbundleName}.png`),
        ...getAssetCandidates(region, `stamp/${assetbundleName}/${assetbundleName}.png`)
      ]) : [];
    case "comics":
      // Haruki is authoritative for comics that it publishes. Legacy mirrors are
      // allowed only when the record explicitly says it is legacy-only. A record
      // A confirmed Haruki gap may use the separately retained legacy mirror
      // candidates. It remains marked as an upstream gap so the UI never
      // presents the fallback as Haruki data.
      if (isConfirmedUpstreamMissingAsset(region, type, id)) return legacyComicCandidates(region, assetbundleName, numericId);
      if (raw.legacySource === true || raw.sourcePolicy === "legacy-only") return legacyComicCandidates(region, assetbundleName, numericId);
      return assetbundleName
        ? uniqueStrings([
          ...harukiAssetCandidates(region, `comic/one_frame/${assetbundleName}.webp`),
          ...harukiAssetCandidates(region, `comic/${assetbundleName}/${assetbundleName}.webp`)
        ])
        : numericId
          ? harukiAssetCandidates(region, `comic/one_frame/comic_${String(numericId).padStart(4, "0")}.webp`)
          : [];
    case "mysekai": {
      const fixtureType = stringField(raw, ["mysekaiFixtureType"]);
      const layoutType = stringField(raw, ["mysekaiSettableLayoutType"]);
      if (!assetbundleName) return [];
      return uniqueStrings([
        fixtureType === "surface_appearance" && layoutType
          ? assetUrl(region, `mysekai/thumbnail/surface_appearance/${assetbundleName}/tex_${assetbundleName}_${layoutType}_1.png`)
          : undefined,
        assetUrl(region, `mysekai/thumbnail/fixture/${assetbundleName}_1.webp`),
        assetUrl(region, `mysekai/fixture/${assetbundleName}/${assetbundleName}.obj`)
      ]);
    }
    case "live2d": {
      const modelPath = stringField(raw, ["modelPath", "path", "modelBase"]);
      const modelFile = stringField(raw, ["modelFile", "file"]) || "model.model3.json";
      // BuildModelData is not a Cubism model3 JSON. Keep it out of this generic image/model3 candidate chain until the adapter has translated it.
      return modelPath ? [`${live2dAssetBase}/live2d/model/${modelPath}/${modelFile}`] : [];
    }

    default:
      return [];
  }
}

export function getCollectionItemAssetDetail(region: RegionId, type: string, item: MasterCollectionItem) {
  const raw = rawOf(item);
  const assetbundleName = item.assetbundleName ?? stringField(raw, ["assetbundleName", "bannerAssetbundleName"]);
  const thumbnailAssetbundleName = stringField(raw, ["thumbnailAssetbundleName"]);
  const iconAssetbundleName = stringField(raw, ["iconAssetbundleName"]);
  const imageCandidates = collectionAssetCandidates(region, type, item.id, assetbundleName, raw);
  const imageUrl = imageCandidates[0] ?? "";
  const upstreamMissing = isConfirmedUpstreamMissingAsset(region, type, item.id);
  const legacyOnly = type === "comics" && (raw.legacySource === true || raw.sourcePolicy === "legacy-only" || upstreamMissing);
  const gachaId = stringField(raw, ["id"]) || item.id;
  const gachaBannerUrl = type === "gachas" && gachaId ? assetUrl(region, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.webp`) : undefined;
  const gachaLogoUrl = type === "gachas" && assetbundleName ? assetUrl(region, `gacha/${assetbundleName}/logo/logo.webp`) : undefined;
  const honorGroup = raw.honorGroup && typeof raw.honorGroup === "object" ? (raw.honorGroup as Record<string, unknown>) : {};
  const backgroundName = stringField(honorGroup, ["backgroundAssetbundleName"]) || assetbundleName;
  const honorRoot = stringField(honorGroup, ["honorType"]) === "rank_match" ? "rank_live/honor" : "honor";
  return {
    region,
    type,
    id: item.id,
    assetbundleName,
    thumbnailAssetbundleName: thumbnailAssetbundleName || undefined,
    iconAssetbundleName: iconAssetbundleName || undefined,
    imageUrl,
    thumbnailUrl: imageUrl,
    imageCandidates,
    assetStatus: upstreamMissing ? "upstream-missing" : imageCandidates.length ? (legacyOnly ? "legacy-only" : "haruki-primary") : "unavailable",
    unavailableReason: upstreamMissing ? "已确认 Team-Haruki 上游未提供该资源；已保留旧源候选" : imageCandidates.length ? undefined : "未找到可用资源路径",
    sourcePolicy: legacyOnly ? "legacy-only" : upstreamMissing ? "upstream-missing" : "haruki-only",
    bannerUrl: gachaBannerUrl,
    logoUrl: gachaLogoUrl,
    bannerFallbackUrl: type === "gachas" && gachaId ? moeOverseasAssetUrl(region, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.webp`) : undefined,
    degreeMainUrl: type === "honors" && backgroundName ? assetUrl(region, `${honorRoot}/${backgroundName}/degree_main.webp`) : undefined,
    degreeSubUrl: type === "honors" && backgroundName ? assetUrl(region, `${honorRoot}/${backgroundName}/degree_sub.webp`) : undefined,
    rankMainUrl: type === "honors" && assetbundleName ? assetUrl(region, `${honorRoot}/${assetbundleName}/${honorRoot === "rank_live/honor" ? "main" : "rank_main"}.webp`) : undefined,
    scrollUrl: type === "honors" && assetbundleName ? assetUrl(region, `${honorRoot}/${assetbundleName}/scroll.webp`) : undefined,
    frameUrl: type === "honors" ? imageCandidates.find((url) => url.includes("/honor_frame/")) : undefined,
    source: imageUrl
      ? getAssetSourceLabel(
          imageUrl,
          type === "gachas" || type === "costumes"
            ? "moe-sekai/Moesekai metadata + asset rules"
            : "Sekai Viewer / Moesekai asset mirror"
        )
      : upstreamMissing ? "Team-Haruki 上游缺失（已标记，保留旧源候选）" : "真实资源路径暂不可用"
  };
}

export function getDisplayCollectionItem(region: RegionId, type: string, item: MasterCollectionItem) {
  const raw = rawOf(item);
  const assets = getCollectionItemAssetDetail(region, type, item);
  const relatedCardIds = Array.isArray(raw.gachaDetails)
    ? raw.gachaDetails
        .map((detail) => (detail && typeof detail === "object" ? (detail as Record<string, unknown>).cardId : undefined))
        .filter((value): value is number | string => typeof value === "number" || typeof value === "string")
        .map(String)
    : [];
  const firstLevelDescription =
    Array.isArray(raw.levels) && raw.levels[0] && typeof raw.levels[0] === "object" ? stringField(raw.levels[0] as Record<string, unknown>, ["description"]) : "";
  return {
    id: item.id,
    type,
    name: (item.name ?? item.title ?? stringField(raw, ["name", "title"])) || `${type} ${item.id}`,
    title: item.title ?? item.name ?? stringField(raw, ["title", "name"]),
    assetbundleName: assets.assetbundleName,
    startAt: item.startAt,
    endAt: item.endAt,
    category:
      stringField(raw, [
        "gachaType",
        "honorRarity",
        "materialType",
        "costume3dType",
        "source",
        "unit",
        "stampType",
        "comicType",
        "groupId",
        "characterId",
        "gameCharacterUnitId"
      ]) || undefined,
    rarity: stringField(raw, ["honorRarity", "cardRarityType", "costume3dRarity"]) || undefined,
    characterId: numberField(raw, ["characterId", "characterId1", "gameCharacterUnitId"]),
    relatedCardIds: type === "costumes" && Array.isArray(raw.cardIds) ? raw.cardIds.map(String) : relatedCardIds,
    description: stringField(raw, ["description", "flavorText", "summary", "outline"]) || firstLevelDescription || undefined,
    assets,
    ...(type === "costumes" ? {
      costumeNumber: numberField(raw, ["costumeNumber"]),
      designer: stringField(raw, ["designer"]) || undefined,
      gender: stringField(raw, ["gender"]) || undefined,
      source: stringField(raw, ["source"]) || undefined,
      partTypes: Array.isArray(raw.partTypes) ? raw.partTypes.map(String) : [],
      characterIds: Array.isArray(raw.characterIds) ? raw.characterIds.map(Number).filter(Number.isFinite) : [],
      parts: raw.parts,
      extraParts: raw.extraParts,
      shopInfo: raw.shopInfo,
      representativePart: costumeRepresentativePart(raw),
      imageCandidates: assets.imageCandidates,
      assetStatus: costumeRepresentativePart(raw) ? "matched" : "missing-part-asset"
    } : {}),
    raw
  };
}
