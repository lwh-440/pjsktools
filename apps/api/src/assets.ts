import { regions, type RegionId } from "./config.js";
import { externalAssetSources } from "./externalData.js";
import type { Card, EventInfo, MasterCollectionItem, Song } from "./types.js";

const sekaiBestAssetBase = "https://storage.sekai.best";
const moeAssetBase = "https://storage.exmeaning.com";
const moeOverseasAssetBase = "https://storage.pjsk.moe";
const moeStaticBase = "https://moe.exmeaning.com";
const moeChartBase = "https://charts-new.unipjsk.com/moe/svg";
const comicsAssetBase = `${sekaiBestAssetBase}/sekai-comics`;
const live2dAssetBase = `${sekaiBestAssetBase}/sekai-live2d-assets`;

const regionAssetDir: Record<RegionId, string> = {
  jp: "sekai-jp-assets",
  en: "sekai-en-assets",
  tw: "sekai-tw-assets",
  kr: "sekai-kr-assets",
  cn: "sekai-cn-assets"
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

function assetUrl(region: RegionId, assetPath: string) {
  return `${sekaiBestAssetBase}/${regionAssetDir[region]}/${assetPath.replace(/^\/+/, "")}`;
}

function moeAssetUrl(region: RegionId, assetPath: string) {
  return `${moeAssetBase}/${regionAssetDir[region]}/${assetPath.replace(/^\/+/, "")}`;
}

function moeOverseasAssetUrl(region: RegionId, assetPath: string) {
  return `${moeOverseasAssetBase}/${regionAssetDir[region]}/${assetPath.replace(/^\/+/, "")}`;
}

function moeAssetUrlPair(region: RegionId, assetPath: string) {
  return [moeAssetUrl(region, assetPath), moeOverseasAssetUrl(region, assetPath)];
}

function proxiedAssetUrl(url: string) {
  return `/api/assets/proxy?url=${encodeURIComponent(url)}`;
}

export function getAssetCandidates(region: RegionId, assetPath: string) {
  const path = assetPath.replace(/^\/+/, "");
  const direct = [moeAssetUrl(region, path), moeOverseasAssetUrl(region, path), assetUrl(region, path)];
  return uniqueStrings([...direct, ...direct.map(proxiedAssetUrl)]);
}

export function getCharacterIconCandidates(region: RegionId, characterId?: string | number) {
  if (characterId == null || String(characterId).trim() === "") return [];
  const staticUrl = `${moeStaticBase}/assets/chr_ts_${characterId}.png`;
  return [staticUrl, proxiedAssetUrl(staticUrl)];
}

function uniqueStrings(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim())).filter((value, index, array) => array.indexOf(value) === index);
}

export function getAssetConfig(region: RegionId) {
  const regionConfig = regions.find((item) => item.id === region);
  const assetDir = regionAssetDir[region];
  return {
    region,
    assetDirectory: assetDir,
    mirrorPriority: [moeAssetBase, moeOverseasAssetBase, sekaiBestAssetBase, "same-origin asset proxy"],
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
      master: "Team-Haruki master repositories for base catalog data",
      formulaReferenceMaster: "Moesekai metadata / metadata.exmeaning.com for formula-only reference collections",
      realtimeRanking: "rks-n.exmeaning.com primary, rks-n.pjsk.moe global fallback",
      publicPlayerAssets: "Haruki Suite Public API for user-uploaded public player assets",
      rankingFallback: "Haruki toolbox for ranking detail and fallback snapshots",
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
  return {
    region,
    musicId: song.id,
    title: song.title,
    jacketUrl: imageCandidates[0] ?? getMusicJacketUrl(region, song),
    imageCandidates,
    assetSourceTrace: { region, assetDirectory: regionAssetDir[region], priority: ["exmeaning", "pjsk.moe", "sekai.best", "proxy"] },
    assetbundleName: song.assetbundleName,
    jacketAssetbundleName: song.jacketAssetbundleName,
    sources: {
      jacketUrl: "Sekai Viewer asset mirror"
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

export function getCardAssetDetail(region: RegionId, card: Card) {
  const normalImageCandidates = card.assetbundleName ? getAssetCandidates(region, `character/member/${card.assetbundleName}/card_normal.webp`) : [];
  const afterTrainingImageCandidates = card.assetbundleName ? getAssetCandidates(region, `character/member/${card.assetbundleName}/card_after_training.webp`) : [];
  const normalThumbnailCandidates = card.assetbundleName ? getAssetCandidates(region, `thumbnail/chara/${card.assetbundleName}_normal.webp`) : [];
  const afterTrainingThumbnailCandidates = card.assetbundleName ? getAssetCandidates(region, `thumbnail/chara/${card.assetbundleName}_after_training.webp`) : [];
  const normalUrl = normalImageCandidates[0] ?? getCardNormalUrl(region, card);
  const afterTrainingUrl = afterTrainingImageCandidates[0] ?? getCardAfterTrainingUrl(region, card);
  const normalThumbnailUrl = normalThumbnailCandidates[0] ?? getCardNormalThumbnailUrl(region, card);
  const afterTrainingThumbnailUrl = afterTrainingThumbnailCandidates[0] ?? getCardAfterTrainingThumbnailUrl(region, card);
  return {
    region,
    cardId: card.id,
    title: card.title,
    character: card.character,
    normalUrl,
    afterTrainingUrl,
    normalThumbnailUrl,
    afterTrainingThumbnailUrl,
    imageCandidates: uniqueStrings([...normalImageCandidates, ...normalThumbnailCandidates, ...afterTrainingImageCandidates, ...afterTrainingThumbnailCandidates]),
    normalImageCandidates,
    normalThumbnailCandidates,
    afterTrainingImageCandidates: uniqueStrings([...afterTrainingImageCandidates, ...afterTrainingThumbnailCandidates]),
    afterTrainingThumbnailCandidates,
    assetSourceTrace: { region, assetDirectory: regionAssetDir[region], priority: ["exmeaning", "pjsk.moe", "sekai.best", "proxy"] },
    assetbundleName: card.assetbundleName,
    sources: {
      normalUrl: "Sekai Viewer asset mirror",
      afterTrainingUrl: "Sekai Viewer asset mirror",
      normalThumbnailUrl: "Moesekai thumbnail/chara asset rule",
      afterTrainingThumbnailUrl: "Moesekai thumbnail/chara asset rule"
    }
  };
}

export function getEventBannerUrl(region: RegionId, event: EventInfo) {
  if (!event.assetbundleName) return "";
  return assetUrl(region, `home/banner/${event.assetbundleName}/${event.assetbundleName}.webp`);
}

export function getEventAssetDetail(region: RegionId, event: EventInfo) {
  const imageCandidates = event.assetbundleName ? getAssetCandidates(region, `home/banner/${event.assetbundleName}/${event.assetbundleName}.webp`) : [];
  return {
    region,
    eventId: event.id,
    name: event.name,
    bannerUrl: imageCandidates[0] ?? getEventBannerUrl(region, event),
    imageCandidates,
    assetSourceTrace: { region, assetDirectory: regionAssetDir[region], priority: ["exmeaning", "pjsk.moe", "sekai.best", "proxy"] },
    assetbundleName: event.assetbundleName,
    sources: {
      bannerUrl: "Sekai Viewer asset mirror"
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
    chartSvgUrl: `${moeChartBase}/${song.id}/${normalizedDifficulty}.svg`,
    chartPngUrl: `${sekaiBestAssetBase}/sekai-music-charts/${region}/${paddedId}/${normalizedDifficulty}.png`,
    sekaiViewerChartSvgUrl: `${sekaiBestAssetBase}/sekai-music-charts/${region}/${paddedId}/${normalizedDifficulty}.svg`,
    susUrl: `${moeAssetBase}/${regionAssetDir[region]}/music/music_score/${paddedId}_01/${normalizedDifficulty}.txt`,
    source: {
      chartSvgUrl: "moe-sekai / charts-new.unipjsk.com",
      chartPngUrl: "Sekai Viewer music chart mirror",
      susUrl: "moe-sekai storage music_score",
      jacketUrl: "Sekai Viewer asset mirror"
    },
    realDataRequired: true
  };
}

function collectionAssetCandidates(region: RegionId, type: string, id: string, assetbundleName = "", raw: Record<string, unknown> = {}) {
  const gachaId = stringField(raw, ["id"]) || id;
  const gachaName = stringField(raw, ["name", "title"]);
  const gachaFallbackId = gachaName.includes("[1回限定]") && Number.isFinite(Number(gachaId)) ? String(Number(gachaId) - 1) : "";
  const gachaFallbackAssetbundleName = gachaFallbackId ? `ab_gacha_${gachaFallbackId}` : "";
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
      return uniqueStrings([
        ...(gachaId ? moeAssetUrlPair(region, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.webp`) : []),
        ...(assetbundleName ? moeAssetUrlPair(region, `gacha/${assetbundleName}/logo/logo.webp`) : []),
        ...(assetbundleName && gachaId ? moeAssetUrlPair(region, `gacha/${assetbundleName}/screen/bg_gacha${gachaId}_1.webp`) : []),
        ...(gachaFallbackId ? moeAssetUrlPair(region, `home/banner/banner_gacha${gachaFallbackId}/banner_gacha${gachaFallbackId}.webp`) : []),
        ...(gachaFallbackAssetbundleName ? moeAssetUrlPair(region, `gacha/${gachaFallbackAssetbundleName}/logo/logo.webp`) : []),
        gachaId ? assetUrl(region, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.webp`) : undefined,
        assetbundleName ? assetUrl(region, `gacha/${assetbundleName}/logo/logo.webp`) : undefined,
        assetbundleName && gachaId ? assetUrl(region, `gacha/${assetbundleName}/screen/bg_gacha${gachaId}_1.webp`) : undefined
      ]);
    case "honors": {
      const backgroundName = backgroundAssetbundleName || assetbundleName;
      const frameRarity = { low: 1, middle: 2, high: 3, highest: 4 }[rarity as "low" | "middle" | "high" | "highest"] ?? 1;
      const rankRoot = honorType === "rank_match" ? "rank_live/honor" : "honor";
      return uniqueStrings([
        backgroundName ? assetUrl(region, `${rankRoot}/${backgroundName}/degree_main.webp`) : undefined,
        backgroundName ? assetUrl(region, `${rankRoot}/${backgroundName}/degree_sub.webp`) : undefined,
        frameName ? assetUrl(region, `honor_frame/${frameName}/frame_degree_m_${frameRarity}.webp`) : undefined,
        frameName ? assetUrl(region, `honor_frame/${frameName}/frame_degree_s_${frameRarity}.webp`) : undefined,
        assetbundleName ? assetUrl(region, `${rankRoot}/${assetbundleName}/rank_main.webp`) : undefined,
        assetbundleName ? assetUrl(region, `${rankRoot}/${assetbundleName}/main.webp`) : undefined,
        assetbundleName ? assetUrl(region, `honor/${assetbundleName}/scroll.webp`) : undefined
      ]);
    }
    case "materials":
      return uniqueStrings([
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
      return assetbundleName ? [assetUrl(region, `stamp/${assetbundleName}/${assetbundleName}.png`), assetUrl(region, `stamp/${assetbundleName}/${assetbundleName}.webp`)] : [];
    case "comics":
      return uniqueStrings(assetbundleName ? [
        `${comicsAssetBase}/comic/one_frame/${assetbundleName}.webp`,
        moeAssetUrl(region, `comic/one_frame/${assetbundleName}.webp`),
        moeOverseasAssetUrl(region, `comic/one_frame/${assetbundleName}.webp`),
        `${comicsAssetBase}/comic/${assetbundleName}/${assetbundleName}.webp`,
        assetUrl(region, `comic/one_frame/${assetbundleName}.webp`),
        assetUrl(region, `comic/${assetbundleName}/${assetbundleName}.webp`),
        numericId ? `${moeStaticBase}/mangas/${numericId}.webp` : undefined
      ] : [
        numericId ? `${moeStaticBase}/mangas/${numericId}.webp` : undefined,
        numericId ? `${moeStaticBase}/assets/mangas/${numericId}.webp` : undefined
      ]);
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
      return modelPath ? [
        `${live2dAssetBase}/live2d/model/${modelPath}/${modelFile}`,
        `${live2dAssetBase}/live2d/model/${modelPath}/buildmodeldata.asset`
      ] : [];
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
  const gachaId = stringField(raw, ["id"]) || item.id;
  const gachaLogoUrl = type === "gachas" && assetbundleName ? moeAssetUrl(region, `gacha/${assetbundleName}/logo/logo.webp`) : undefined;
  const gachaBannerUrl = type === "gachas" && gachaId ? moeAssetUrl(region, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.webp`) : undefined;
  const gachaScreenUrl = type === "gachas" && assetbundleName && gachaId ? moeAssetUrl(region, `gacha/${assetbundleName}/screen/bg_gacha${gachaId}_1.webp`) : undefined;
  const honorGroup = raw.honorGroup && typeof raw.honorGroup === "object" ? (raw.honorGroup as Record<string, unknown>) : {};
  const backgroundName = stringField(honorGroup, ["backgroundAssetbundleName"]) || assetbundleName;
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
    logoUrl: gachaLogoUrl,
    bannerUrl: gachaBannerUrl,
    screenUrl: gachaScreenUrl,
    logoFallbackUrl: type === "gachas" && assetbundleName ? moeOverseasAssetUrl(region, `gacha/${assetbundleName}/logo/logo.webp`) : undefined,
    bannerFallbackUrl: type === "gachas" && gachaId ? moeOverseasAssetUrl(region, `home/banner/banner_gacha${gachaId}/banner_gacha${gachaId}.webp`) : undefined,
    screenFallbackUrl: type === "gachas" && assetbundleName && gachaId ? moeOverseasAssetUrl(region, `gacha/${assetbundleName}/screen/bg_gacha${gachaId}_1.webp`) : undefined,
    degreeMainUrl: type === "honors" && backgroundName ? assetUrl(region, `honor/${backgroundName}/degree_main.webp`) : undefined,
    degreeSubUrl: type === "honors" && backgroundName ? assetUrl(region, `honor/${backgroundName}/degree_sub.webp`) : undefined,
    rankMainUrl: type === "honors" && assetbundleName ? assetUrl(region, `honor/${assetbundleName}/rank_main.webp`) : undefined,
    scrollUrl: type === "honors" && assetbundleName ? assetUrl(region, `honor/${assetbundleName}/scroll.webp`) : undefined,
    frameUrl: type === "honors" ? imageCandidates.find((url) => url.includes("/honor_frame/")) : undefined,
    source: imageUrl
      ? type === "gachas" || type === "costumes"
        ? "moe-sekai/Moesekai metadata + asset rules"
        : "Sekai Viewer / Moesekai asset mirror"
      : "真实资源路径暂不可用"
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
