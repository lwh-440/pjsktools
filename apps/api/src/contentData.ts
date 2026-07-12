import type { RegionId } from "./config.js";
import { getAssetCandidates } from "./assets.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getExternalContext,
  getLive2dModels,
  getMysekaiFullContext,
  getOptionalMetadata,
  getStoriesContext,
  informationCollection
} from "./externalData.js";
import { getCards } from "./masterData.js";

type ContentCapabilityStatus = "ready" | "partial" | "not-released" | "missing-resource" | "source-unavailable";
type CatalogKind = "fixtures" | "materials" | "blueprints";
type Query = { page?: number; pageSize?: number; q?: string; category?: string; tag?: string; characterId?: string | number; sort?: string };
export type InformationDetailKind = "jp-static-id" | "cn-static-url" | "external";

const JP_INFORMATION_ORIGIN = "https://production-web.sekai.colorfulpalette.org";
const CN_INFORMATION_HOSTS = new Set([
  "lf3-cdn-tos.draftstatic.com",
  "lf3-mkcncdn-tos.dailygn.com"
]);
const INFORMATION_CONTENT_VERSION = "v2";

const cache = new Map<string, { expiresAt: number; value: unknown }>();
const CACHE_MS = 5 * 60_000;
const diskCacheDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "content-cache");

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value as T;
  const value = await loader();
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, value });
  return value;
}

function cacheFile(key: string) {
  return path.join(diskCacheDir, `${key.replace(/[^a-z0-9_-]+/gi, "-")}.json`);
}

async function persistentCached<T>(key: string, loader: () => Promise<T>, isValid: (value: T) => boolean): Promise<T> {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value as T;
  const file = cacheFile(key);
  let previous: T | undefined;
  try {
    previous = JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    previous = undefined;
  }
  try {
    const value = await loader();
    if (!isValid(value)) throw new Error(`${key} returned no usable data`);
    cache.set(key, { expiresAt: Date.now() + CACHE_MS, value });
    await mkdir(diskCacheDir, { recursive: true });
    const temporary = `${file}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), "utf8");
    await rename(temporary, file);
    return value;
  } catch (error) {
    if (!previous) throw error;
    const value = {
      ...asRecord(previous),
      stale: true,
      sourceHealth: { ...asRecord(asRecord(previous).sourceHealth), status: "stale-refreshing" },
      warnings: [...array(asRecord(previous).warnings), error instanceof Error ? error.message : String(error)]
    } as T;
    cache.set(key, { expiresAt: Date.now() + 30_000, value });
    return value;
  }
}

async function informationData(region: RegionId) {
  if (region !== "jp" && region !== "cn") return informationCollection(region);
  const collection = await persistentCached(`information:${INFORMATION_CONTENT_VERSION}:${region}`, () => informationCollection(region), (value) => array(value.items).length > 0);
  const items = array(collection.items).map((item) => {
      const record = asRecord(item);
      const raw = rawItem(item);
      const direct = array(raw.bannerImageCandidates).filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value));
      if (typeof raw.bannerUrl === "string" && /^https?:\/\//i.test(raw.bannerUrl) && !direct.includes(raw.bannerUrl)) direct.unshift(raw.bannerUrl);
      const candidates = Array.from(new Set(direct.flatMap((url) => [url, `/api/assets/proxy?url=${encodeURIComponent(url)}`])));
      const enrichedRaw = { ...raw, bannerUrl: candidates[0], bannerImageCandidates: candidates };
      return { ...record, bannerUrl: candidates[0], bannerImageCandidates: candidates, raw: enrichedRaw };
    }).sort((left, right) => {
      const leftRaw = rawItem(left);
      const rightRaw = rawItem(right);
      const leftTime = Number(leftRaw.startAt ?? 0) || Date.parse(String(asRecord(left).startAt ?? "")) || 0;
      const rightTime = Number(rightRaw.startAt ?? 0) || Date.parse(String(asRecord(right).startAt ?? "")) || 0;
      return rightTime - leftTime || Number(rightRaw.id ?? 0) - Number(leftRaw.id ?? 0);
    });
  return { ...collection, items };
}

function statusFromCounts(total: number, missing: number, notReleased = false): ContentCapabilityStatus {
  if (notReleased) return "not-released";
  if (total === 0) return missing ? "source-unavailable" : "missing-resource";
  return missing ? "partial" : "ready";
}

function rawItem(item: unknown) {
  const record = asRecord(item);
  return asRecord(record.raw ?? record);
}

function idOf(item: unknown) {
  const record = rawItem(item);
  return String(record.id ?? record.virtualLiveId ?? record.costumeNumber ?? "");
}

function validContentId(value: string) {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

function recoverInformationPath(raw: Record<string, any>) {
  const value = String(raw.path ?? raw.detailUrl ?? "").trim();
  const joinedExternal = value.match(/^https:\/\/production-web\.sekai\.colorfulpalette\.org\/(https?:\/\/.*)$/i);
  return joinedExternal?.[1] ?? value;
}

function httpUrl(value: string, base?: string) {
  try {
    const parsed = new URL(value, base);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function classifyInformationDetail(region: RegionId, value: unknown) {
  const raw = rawItem(value);
  const browseType = String(raw.browseType ?? "").toLowerCase();
  const sourcePath = recoverInformationPath(raw);
  const warnings: string[] = [];

  if (!sourcePath) {
    return {
      detailKind: "external" as InformationDetailKind,
      embedStatus: "missing-resource" as const,
      warnings: ["Information detail path is missing"]
    };
  }

  if (browseType !== "internal") {
    return {
      detailUrl: sourcePath,
      detailKind: "external" as InformationDetailKind,
      embedStatus: "external-only" as const,
      warnings
    };
  }

  if (region === "jp") {
    const parsed = httpUrl(sourcePath, JP_INFORMATION_ORIGIN);
    const contentId = parsed?.searchParams.get("id") ?? "";
    if (parsed?.origin === JP_INFORMATION_ORIGIN && parsed.pathname.includes("/information/") && validContentId(contentId)) {
      return {
        detailUrl: parsed.toString(),
        detailKind: "jp-static-id" as InformationDetailKind,
        embedStatus: "ready" as const,
        staticContentId: contentId,
        contentSourceUrl: `${JP_INFORMATION_ORIGIN}/html/${contentId}.html`,
        warnings
      };
    }
    warnings.push("JP internal information path does not contain a valid static content id");
    return {
      detailUrl: parsed?.toString() ?? sourcePath,
      detailKind: "external" as InformationDetailKind,
      embedStatus: "missing-resource" as const,
      warnings
    };
  }

  if (region === "cn") {
    const parsed = httpUrl(sourcePath);
    if (parsed?.protocol === "https:" && CN_INFORMATION_HOSTS.has(parsed.hostname) && parsed.pathname.toLowerCase().endsWith(".html")) {
      return {
        detailUrl: parsed.toString(),
        detailKind: "cn-static-url" as InformationDetailKind,
        embedStatus: "ready" as const,
        contentSourceUrl: parsed.toString(),
        warnings
      };
    }
    warnings.push("CN internal information URL is not on an approved static content host");
    return {
      detailUrl: parsed?.toString() ?? sourcePath,
      detailKind: "external" as InformationDetailKind,
      embedStatus: "missing-resource" as const,
      warnings
    };
  }

  return {
    detailUrl: sourcePath,
    detailKind: "external" as InformationDetailKind,
    embedStatus: "missing-resource" as const,
    warnings: ["Information detail is not released for this region"]
  };
}

function virtualLiveSummary(region: RegionId, liveValue: unknown): Record<string, any> {
  const live = rawItem(liveValue);
  const assetbundleName = String(live.assetbundleName ?? "");
  const imageCandidates = assetbundleName
    ? getAssetCandidates(region, `virtual_live/select/banner/${assetbundleName}/${assetbundleName}.webp`)
    : [];
  return {
    ...live,
    id: String(live.id ?? live.virtualLiveId ?? ""),
    name: String(live.name ?? live.title ?? live.assetbundleName ?? "Virtual Live"),
    imageCandidates,
    imageUrl: imageCandidates[0],
    scheduleCount: array(live.virtualLiveSchedules).length,
    setlistCount: array(live.virtualLiveSetlists).length,
    rewardCount: array(live.virtualLiveRewards).length
  };
}

export async function getInformationDetail(region: RegionId, informationId: string) {
  const collection = await informationData(region);
  const item = array(collection.items).find((candidate) => idOf(candidate) === informationId);
  if (!item) return null;
  const raw = rawItem(item);
  const classification = classifyInformationDetail(region, raw);
  return {
    region,
    id: informationId,
    title: raw.title ?? raw.name ?? `Information ${informationId}`,
    startAt: raw.startAt,
    endAt: raw.endAt,
    informationType: raw.informationType,
    informationTag: raw.informationTag,
    bannerUrl: raw.bannerUrl,
    bannerImageCandidates: array(raw.bannerImageCandidates),
    ...classification,
    embeddedDetailUrl: classification.embedStatus === "ready"
      ? `/api/master/${region}/information-content/${encodeURIComponent(informationId)}?v=${INFORMATION_CONTENT_VERSION}`
      : undefined,
    sourceHealth: (collection as any).sourceHealth,
    raw
  };
}

export async function getInformationCollection(region: RegionId) {
  return informationData(region);
}

export async function getVirtualLiveCatalog(region: RegionId) {
  return cached(`virtual-live-catalog:${region}`, async () => {
    const context = await getExternalContext(region, "virtualLives");
    const items = array(asRecord(context.groups).virtualLives).map((item) => virtualLiveSummary(region, item));
    return {
      region,
      items,
      total: items.length,
      sourceHealth: context.sourceHealth,
      warnings: context.warnings,
      capabilityStatus: statusFromCounts(items.length, array(context.unavailableGroups).length),
      syncedAt: context.sourceMetadata?.fetchedAt
    };
  });
}

export async function getVirtualLiveDetail(region: RegionId, virtualLiveId: string) {
  const catalog = await getVirtualLiveCatalog(region);
  const live = catalog.items.find((item) => String(item.id) === virtualLiveId);
  if (!live) return null;
  const [musicsResult, vocalsResult, unitsResult, charactersResult, profilesResult, boxesResult, boxDetailsResult, materialsResult] = await Promise.all([
    getOptionalMetadata(region, "musics.json"),
    getOptionalMetadata(region, "musicVocals.json"),
    getOptionalMetadata(region, "gameCharacterUnits.json"),
    getOptionalMetadata(region, "gameCharacters.json"),
    getOptionalMetadata(region, "characterProfiles.json"),
    getOptionalMetadata(region, "resourceBoxes.json"),
    getOptionalMetadata(region, "resourceBoxDetails.json"),
    getOptionalMetadata(region, "materials.json")
  ]);
  const musics = array(musicsResult.data).map(rawItem);
  const vocals = array(vocalsResult.data).map(rawItem);
  const units = array(unitsResult.data).map(rawItem);
  const characters = array(charactersResult.data).map(rawItem);
  const profiles = array(profilesResult.data).map(rawItem);
  const musicMap = new Map(musics.map((item) => [Number(item.id), item]));
  const vocalMap = new Map(vocals.map((item) => [Number(item.id), item]));
  const characterMap = new Map(characters.map((item) => [Number(item.id), item]));
  const profileMap = new Map(profiles.map((item) => [Number(item.characterId ?? item.gameCharacterId ?? item.id), item]));
  const resolvedCharacters = array(live.virtualLiveCharacters).map(rawItem).map((entry) => {
    const unit = units.find((item) => Number(item.id) === Number(entry.gameCharacterUnitId));
    const characterId = Number(unit?.gameCharacterId ?? entry.gameCharacterId ?? entry.characterId);
    const character = characterMap.get(characterId) ?? {};
    return {
      id: characterId,
      name: missionCharacterName(character, profileMap.get(characterId)),
      gameCharacterUnitId: Number(entry.gameCharacterUnitId),
      performanceType: entry.virtualLivePerformanceType
    };
  }).filter((item) => Number.isFinite(item.id));
  const setlistSummaries = array(live.virtualLiveSetlists).map(rawItem).map((step, index) => {
    const type = String(step.virtualLiveSetlistType ?? "unknown");
    const vocal = type === "music" ? vocalMap.get(Number(step.musicVocalId)) : undefined;
    const music = type === "music" ? musicMap.get(Number(vocal?.musicId ?? step.musicId)) : undefined;
    const jacketCandidates = music?.assetbundleName
      ? getAssetCandidates(region, `music/jacket/${music.assetbundleName}/${music.assetbundleName}.webp`)
      : [];
    return {
      index,
      id: String(step.id ?? index),
      seq: Number(step.seq ?? index + 1),
      type,
      assetbundleName: step.assetbundleName,
      music: music ? { id: String(music.id), title: String(music.title ?? music.name ?? `Music #${music.id}`), jacketCandidates } : undefined,
      musicVocal: vocal ? { id: String(vocal.id), assetbundleName: vocal.assetbundleName, characters: array(vocal.characters) } : undefined,
      character3dIds: [1, 2, 3, 4, 5, 6].map((slot) => Number(step[`character3dId${slot}`])).filter(Number.isFinite),
      playbackLoading: "deferred"
    };
  });
  const boxes = array(boxesResult.data).map(rawItem);
  const standaloneDetails = array(boxDetailsResult.data).map(rawItem);
  const detailsByBox = new Map<number, Record<string, any>[]>();
  for (const detail of standaloneDetails) {
    const boxId = Number(detail.resourceBoxId);
    detailsByBox.set(boxId, [...(detailsByBox.get(boxId) ?? []), detail]);
  }
  const boxMap = new Map<number, Record<string, any>[]>();
  for (const box of boxes) {
    if (String(box.resourceBoxPurpose ?? "") !== "virtual_live_reward") continue;
    const embedded = array(box.details).map(rawItem);
    boxMap.set(Number(box.id), embedded.length ? embedded : detailsByBox.get(Number(box.id)) ?? []);
  }
  const rewardDetails = array(live.virtualLiveRewards).map(rawItem).flatMap((reward) => boxMap.get(Number(reward.resourceBoxId)) ?? []);
  const rewardTypes = new Set(rewardDetails.map((detail) => String(detail.resourceType ?? "unknown")));
  const { maps: lookupMaps } = await loadExchangeLookups(region, rewardTypes);
  const materialMap = new Map(array(materialsResult.data).map(rawItem).map((item) => [Number(item.id), item]));
  const resolvedRewards = rewardDetails.map((detail) => resolveExchangeResource(region, detail, materialMap, new Map(), new Map(), lookupMaps));
  return {
    region,
    live,
    schedules: array(live.virtualLiveSchedules),
    setlists: array(live.virtualLiveSetlists),
    rewards: array(live.virtualLiveRewards),
    characters: resolvedCharacters,
    resolvedRewards,
    setlistSummaries,
    relatedEvent: live.eventId ? { id: String(live.eventId) } : undefined,
    detailReadiness: {
      status: setlistSummaries.length ? resolvedRewards.length || !array(live.virtualLiveRewards).length ? "ready" : "partial" : "missing-resource",
      setlistCount: setlistSummaries.length,
      characterCount: resolvedCharacters.length,
      rewardCount: resolvedRewards.length,
      playbackDeferred: true
    },
    playbackUrl: `/api/master/${region}/virtual-lives/${encodeURIComponent(virtualLiveId)}/playback`,
    playbackLoading: "deferred",
    sourceHealth: catalog.sourceHealth,
    capabilityStatus: catalog.capabilityStatus
  };
}

function fixtureCandidates(region: RegionId, fixture: Record<string, any>) {
  const bundle = String(fixture.assetbundleName ?? "");
  if (!bundle) return [];
  const genreId = Number(fixture.mysekaiFixtureMainGenreId ?? 0);
  if (genreId === 7 || genreId === 8) {
    const kind = genreId === 7 ? "wall_appearance" : "floor_appearance";
    return getAssetCandidates(region, `mysekai/thumbnail/surface_appearance/${bundle}/tex_${bundle}_${kind}_1.png`);
  }
  return getAssetCandidates(region, `mysekai/thumbnail/fixture/${bundle}_1.png`);
}

function materialCandidates(region: RegionId, material: Record<string, any>) {
  const bundle = String(material.iconAssetbundleName ?? "");
  return bundle ? getAssetCandidates(region, `mysekai/thumbnail/material/${bundle}.png`) : [];
}

function uniqueStrings(values: string[]) {
  return values.filter(Boolean).filter((value, index, all) => all.indexOf(value) === index);
}

function exchangeMaterialCandidates(region: RegionId, resourceType: string, resourceId: number | undefined, item?: Record<string, any>) {
  if (resourceType === "material" && resourceId != null) {
    const bundles = [item?.assetbundleName, item?.thumbnailAssetbundleName, item?.iconAssetbundleName].filter((value): value is string => typeof value === "string" && Boolean(value));
    return uniqueStrings([
      ...getAssetCandidates(region, `thumbnail/material/material${resourceId}.webp`),
      ...bundles.flatMap((bundle) => getAssetCandidates(region, `thumbnail/material/${bundle}.webp`)),
      ...bundles.flatMap((bundle) => getAssetCandidates(region, `thumbnail/common_material/${bundle}.webp`))
    ]);
  }
  if (resourceType === "mysekai_material" && item?.iconAssetbundleName) {
    return getAssetCandidates(region, `mysekai/thumbnail/material/${item.iconAssetbundleName}.png`);
  }
  if (["coin", "jewel", "virtual_coin"].includes(resourceType)) {
    return getAssetCandidates(region, `thumbnail/common_material/${resourceType}.webp`);
  }
  if (resourceType === "practice_ticket" && resourceId != null) {
    return getAssetCandidates(region, `thumbnail/practice_ticket/ticket${resourceId}.png`);
  }
  if (resourceType === "skill_practice_ticket" && resourceId != null) {
    return getAssetCandidates(region, `thumbnail/skill_practice_ticket/ticket${resourceId}.png`);
  }
  if (resourceType === "stamp" && item?.assetbundleName) {
    return getAssetCandidates(region, `stamp/${item.assetbundleName}/${item.assetbundleName}.png`);
  }
  if (resourceType === "costume_3d" && item?.representativeAssetbundleName) {
    return getAssetCandidates(region, `thumbnail/costume/${item.representativeAssetbundleName}.webp`);
  }
  if (resourceType === "mysekai_fixture" && item) return fixtureCandidates(region, item);
  return [];
}

const exchangeLookupPaths: Record<string, string> = {
  stamp: "stamps.json",
  costume_3d: "moe_costume.json",
  mysekai_blueprint: "mysekaiBlueprints.json",
  mysekai_fixture: "mysekaiFixtures.json",
  practice_ticket: "practiceTickets.json",
  skill_practice_ticket: "skillPracticeTickets.json",
  boost_item: "boostItems.json",
  gacha_ticket: "gachaTickets.json",
  avatar_coordinate: "avatarCoordinates.json",
  mysekai_item: "mysekaiItems.json",
  mysekai_tool: "mysekaiTools.json"
};

const exchangeReferenceImageTypes = new Set([
  "card", "material", "mysekai_material", "stamp", "costume_3d", "mysekai_blueprint",
  "mysekai_fixture", "practice_ticket", "skill_practice_ticket", "character_rank_exp",
  "coin", "jewel", "virtual_coin"
]);

function representativeCostumeAsset(costume: Record<string, any>) {
  for (const group of [costume.body, costume.hair, costume.head]) {
    const first = array(group)[0];
    if (first?.assetbundleName) return String(first.assetbundleName);
    const variant = array(first?.variants)[0];
    if (variant?.assetbundleName) return String(variant.assetbundleName);
  }
  for (const part of array(costume.extraParts)) {
    const variant = array(part?.variants)[0];
    if (variant?.assetbundleName) return String(variant.assetbundleName);
  }
  return undefined;
}

function rowsFromExchangeLookup(resourceType: string, value: unknown) {
  if (resourceType !== "costume_3d") return array(value).map(rawItem);
  return array(asRecord(value).costumes).map(rawItem).map((costume) => ({
    ...costume,
    id: costume.costumeNumber ?? costume.id,
    representativeAssetbundleName: representativeCostumeAsset(costume)
  }));
}

async function loadExchangeLookups(region: RegionId, resourceTypes: Set<string>) {
  const requested = Object.entries(exchangeLookupPaths).filter(([type]) => resourceTypes.has(type));
  const results = await Promise.all(requested.map(async ([type, file]) => [type, file, await getOptionalMetadata(region, file)] as const));
  const maps = new Map<string, Map<number, Record<string, any>>>();
  const diagnostics: Record<string, { file: string; status: string; count: number; warning?: string }> = {};
  for (const [type, file, result] of results) {
    const rows = rowsFromExchangeLookup(type, result.data);
    maps.set(type, new Map(rows.map((item) => [Number(item.id), item])));
    diagnostics[type] = { file, status: result.status, count: rows.length, warning: result.warning };
  }
  return { maps, diagnostics };
}

function exchangeStatus(summary: Record<string, any>, exchange: Record<string, any>, now = Date.now()) {
  const startAt = Number(exchange.startAt ?? summary.startAt ?? 0) || undefined;
  const endAt = Number(summary.endAt ?? 0) || undefined;
  if (startAt && now < startAt) return "upcoming";
  if (endAt && now > endAt) return "ended";
  if (!startAt && !endAt) return "permanent";
  return "active";
}

function resourceFallbackName(resourceType: string, resourceId?: number) {
  const labels: Record<string, string> = {
    card: "卡牌",
    material: "素材",
    mysekai_material: "MySekai 素材",
    stamp: "表情贴纸",
    costume_3d: "服装",
    mysekai_blueprint: "MySekai 蓝图",
    mysekai_fixture: "MySekai 家具",
    practice_ticket: "练习券",
    skill_practice_ticket: "技能练习券",
    boost_item: "能量道具",
    gacha_ticket: "招募券",
    avatar_coordinate: "虚拟形象套装",
    mysekai_item: "MySekai 道具",
    mysekai_tool: "MySekai 工具",
    character_rank_exp: "角色 Rank EXP",
    coin: "金币",
    jewel: "水晶",
    virtual_coin: "虚拟硬币"
  };
  const showId = resourceId != null && !["coin", "jewel", "virtual_coin"].includes(resourceType);
  return `${labels[resourceType] ?? resourceType}${showId ? ` #${resourceId}` : ""}`;
}

function resolveExchangeResource(
  region: RegionId,
  detailValue: unknown,
  materialMap: Map<number, Record<string, any>>,
  mysekaiMaterialMap: Map<number, Record<string, any>>,
  cardMap: Map<number, Record<string, any>>,
  lookupMaps: Map<string, Map<number, Record<string, any>>>
) {
  const detail = asRecord(detailValue);
  const resourceType = String(detail.resourceType ?? "unknown");
  const resourceId = Number.isFinite(Number(detail.resourceId)) ? Number(detail.resourceId) : undefined;
  const item = resourceType === "material" && resourceId != null
    ? materialMap.get(resourceId)
    : resourceType === "mysekai_material" && resourceId != null
      ? mysekaiMaterialMap.get(resourceId)
      : resourceType === "card" && resourceId != null
        ? cardMap.get(resourceId)
        : resourceId != null
          ? lookupMaps.get(resourceType)?.get(resourceId)
          : undefined;
  const resolvedItem = resourceType === "mysekai_blueprint" && item?.craftTargetId != null
    ? lookupMaps.get("mysekai_fixture")?.get(Number(item.craftTargetId)) ?? item
    : item;
  const imageCandidates = resourceType === "card"
    ? array(asRecord(item?.assets).normalThumbnailCandidates).map(String)
    : resourceType === "character_rank_exp" && resourceId != null
      ? [`https://moe.exmeaning.com/chr_ts_${resourceId}.png`]
      : exchangeMaterialCandidates(region, resourceType, resourceId, resolvedItem);
  const lookupRequired = Boolean(exchangeLookupPaths[resourceType]);
  const lookupStatus = lookupRequired ? (item ? "matched" : "missing-data") : "not-required";
  const assetStatus = imageCandidates.length
    ? "matched"
    : !exchangeReferenceImageTypes.has(resourceType)
      ? "reference-no-image"
      : lookupRequired && !item
        ? "lookup-missing"
        : "asset-unavailable";
  return {
    seq: Number(detail.seq ?? 0),
    resourceType,
    resourceId,
    quantity: Number(detail.resourceQuantity ?? detail.quantity ?? 1),
    name: String(item?.name ?? item?.title ?? resolvedItem?.name ?? resourceFallbackName(resourceType, resourceId)),
    subtitle: item?.materialType ?? item?.mysekaiMaterialRarityType ?? item?.description,
    imageUrl: imageCandidates[0],
    imageCandidates,
    lookupStatus,
    assetStatus
  };
}

const MISSION_SCHEMA_VERSION = "missions-v2";
const missionFiles = [
  "normalMissions.json",
  "beginnerMissions.json",
  "characterMissionV2s.json",
  "characterMissionV2ParameterGroups.json",
  "honorMissions.json",
  "gameCharacters.json",
  "characterProfiles.json",
  "resourceBoxes.json"
] as const;

function formatMissionSentence(template: unknown, replacements: Record<string, unknown>) {
  const missing: string[] = [];
  const sentence = String(template ?? "").replace(/\{(requirement|progress|name)\}/g, (_, key: string) => {
    const value = replacements[key];
    if (value === undefined || value === null || value === "") {
      missing.push(key);
      return "-";
    }
    return String(value);
  });
  return { sentence, missing };
}

function missionCharacterName(character: Record<string, any>, profile?: Record<string, any>) {
  if (profile?.name || profile?.characterName) return String(profile.name ?? profile.characterName);
  if (character.firstName && character.givenName) return `${character.firstName}${character.givenName}`;
  return String(character.name ?? character.givenName ?? `角色 #${character.id ?? "-"}`);
}

export async function getMissionCatalog(region: RegionId) {
  return cached(`mission-catalog:${MISSION_SCHEMA_VERSION}:${region}`, async () => {
    const requestedFiles = region === "tw" || region === "kr" || region === "cn"
      ? [...missionFiles, "resourceBoxDetails.json"]
      : [...missionFiles];
    const [results, cards] = await Promise.all([
      Promise.all(requestedFiles.map(async (file) => [file, await getOptionalMetadata(region, file)] as const)),
      getCards(region)
    ]);
    const data = new Map(results.map(([file, result]) => [file, array(result.data).map(rawItem)]));
    const normal = data.get("normalMissions.json") ?? [];
    const beginner = data.get("beginnerMissions.json") ?? [];
    const character = data.get("characterMissionV2s.json") ?? [];
    const parameters = data.get("characterMissionV2ParameterGroups.json") ?? [];
    const honor = data.get("honorMissions.json") ?? [];
    const characters = data.get("gameCharacters.json") ?? [];
    const profiles = data.get("characterProfiles.json") ?? [];
    const boxes = data.get("resourceBoxes.json") ?? [];
    const standaloneDetails = data.get("resourceBoxDetails.json") ?? [];

    const characterMap = new Map(characters.map((item) => [Number(item.id), item]));
    const profileMap = new Map(profiles.map((item) => [Number(item.characterId ?? item.gameCharacterId ?? item.id), item]));
    const parameterMap = new Map<number, Record<string, any>[]>();
    for (const parameter of parameters) {
      const group = Number(parameter.id);
      parameterMap.set(group, [...(parameterMap.get(group) ?? []), parameter]);
    }
    for (const stages of parameterMap.values()) stages.sort((left, right) => Number(left.seq ?? 0) - Number(right.seq ?? 0));

    const detailsByBox = new Map<number, Record<string, any>[]>();
    for (const detail of standaloneDetails) {
      const id = Number(detail.resourceBoxId);
      if (Number.isFinite(id)) detailsByBox.set(id, [...(detailsByBox.get(id) ?? []), detail]);
    }
    const resourceBoxMap = new Map<number, Record<string, any>[]>();
    for (const box of boxes) {
      if (String(box.resourceBoxPurpose ?? "") !== "mission_reward") continue;
      const id = Number(box.id);
      const embedded = array(box.details).map(rawItem);
      resourceBoxMap.set(id, embedded.length ? embedded : detailsByBox.get(id) ?? []);
    }
    const rewardTypes = new Set<string>();
    for (const mission of [...normal, ...beginner, ...honor]) {
      for (const reward of array(mission.rewards)) {
        for (const detail of resourceBoxMap.get(Number(rawItem(reward).resourceBoxId)) ?? []) {
          rewardTypes.add(String(detail.resourceType ?? "unknown"));
        }
      }
    }
    if (rewardTypes.has("mysekai_blueprint")) rewardTypes.add("mysekai_fixture");
    const { maps: lookupMaps, diagnostics: lookupDiagnostics } = await loadExchangeLookups(region, rewardTypes);
    const [materialResult, mysekaiMaterialResult] = await Promise.all([
      getOptionalMetadata(region, "materials.json"),
      getOptionalMetadata(region, "mysekaiMaterials.json")
    ]);
    const materialMap = new Map(array(materialResult.data).map(rawItem).map((item) => [Number(item.id), item]));
    const mysekaiMaterialMap = new Map(array(mysekaiMaterialResult.data).map(rawItem).map((item) => [Number(item.id), item]));
    const cardMap = new Map(cards.map((item) => [Number(item.id), item as unknown as Record<string, any>]));
    const rewardsFor = (mission: Record<string, any>) => array(mission.rewards).flatMap((rewardValue) => {
      const reward = rawItem(rewardValue);
      return (resourceBoxMap.get(Number(reward.resourceBoxId)) ?? []).map((detail) => ({
        ...resolveExchangeResource(region, detail, materialMap, mysekaiMaterialMap, cardMap, lookupMaps),
        resourceBoxId: Number(reward.resourceBoxId)
      }));
    });
    const normalizeFixedMission = (kind: "normal" | "beginner" | "honor", mission: Record<string, any>) => {
      const requirement = Number(mission.requirement ?? 0);
      const formatted = formatMissionSentence(mission.sentence, { requirement, progress: requirement });
      const rewards = rewardsFor(mission);
      return {
        id: String(mission.id ?? ""),
        seq: Number(mission.seq ?? mission.id ?? 0),
        missionKind: kind,
        missionType: String(mission[`${kind}MissionType`] ?? "unknown"),
        category: kind === "beginner" ? String(mission.beginnerMissionCategory ?? "normal") : undefined,
        sentence: formatted.sentence,
        requirement,
        rewards,
        stages: [],
        lookupStatus: formatted.missing.length || rewards.some((item) => item.lookupStatus === "missing-data") ? "missing-data" : "matched",
        missingFields: formatted.missing
      };
    };
    const normalizedCharacter = character.map((mission) => {
      const characterId = Number(mission.characterId);
      const characterRecord = characterMap.get(characterId) ?? {};
      const profile = profileMap.get(characterId);
      const name = missionCharacterName(characterRecord, profile);
      const stages = (parameterMap.get(Number(mission.parameterGroupId)) ?? []).map((stage) => ({
        seq: Number(stage.seq ?? 0),
        requirement: Number(stage.requirement ?? 0),
        exp: Number(stage.exp ?? 0),
        quantity: Number(stage.quantity ?? 0)
      }));
      const requirement = stages[0]?.requirement;
      const formatted = formatMissionSentence(mission.sentence, { requirement, progress: requirement, name });
      return {
        id: String(mission.id ?? ""),
        seq: Number(mission.seq ?? mission.id ?? 0),
        missionKind: "character",
        missionType: String(mission.characterMissionType ?? "unknown"),
        sentence: formatted.sentence,
        progressLabel: formatMissionSentence(mission.progressSentence, { progress: requirement, requirement, name }).sentence,
        requirement,
        maxRequirement: stages.at(-1)?.requirement,
        parameterGroupId: Number(mission.parameterGroupId),
        isAchievementMission: Boolean(mission.isAchievementMission),
        character: { id: characterId, name },
        stages,
        rewards: [],
        lookupStatus: stages.length && characterMap.has(characterId) && !formatted.missing.length ? "matched" : "missing-data",
        missingFields: [
          ...formatted.missing,
          ...(!stages.length ? ["parameterGroup"] : []),
          ...(!characterMap.has(characterId) ? ["character"] : [])
        ]
      };
    });
    const groups = {
      normal: normal.map((item) => normalizeFixedMission("normal", item)),
      beginner: beginner.map((item) => normalizeFixedMission("beginner", item)),
      character: normalizedCharacter,
      honor: honor.map((item) => normalizeFixedMission("honor", item))
    };
    const labels = { normal: "普通任务", beginner: "新手任务", character: "角色任务", honor: "称号任务" };
    const groupStatus = Object.fromEntries(Object.entries(groups).map(([key, items]) => [
      key,
      items.length ? "ready" : key === "beginner" ? "not-released" : "source-unavailable"
    ]));
    const unavailable = Object.values(groupStatus).filter((status) => status !== "ready").length;
    const missingItems = Object.values(groups).flat().filter((item) => item.lookupStatus !== "matched").length;
    const capabilityStatus: ContentCapabilityStatus = Object.values(groups).some((items) => items.length)
      ? unavailable || missingItems ? "partial" : "ready"
      : "source-unavailable";
    return {
      region,
      type: "missions",
      groups,
      displayGroups: Object.entries(groups).map(([key, items]) => ({ key, label: labels[key as keyof typeof labels], count: items.length })),
      groupStatus,
      summary: Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.length])),
      total: Object.values(groups).reduce((sum, items) => sum + items.length, 0),
      capabilityStatus,
      sourceHealth: { status: capabilityStatus, availableGroups: 4 - unavailable, unavailableGroups: unavailable, totalGroups: 4 },
      warnings: results.flatMap(([file, result]) => result.warning ? [`${file}: ${result.warning}`] : []),
      diagnostics: Object.fromEntries(results.map(([file, result]) => [file, { status: result.status, count: array(result.data).length, warning: result.warning }])),
      lookupDiagnostics,
      syncedAt: new Date().toISOString()
    };
  });
}

export async function getExchangeCatalog(region: RegionId) {
  return cached(`exchange-catalog:v2:${region}`, async () => {
    const [context, cards] = await Promise.all([
      getExternalContext(region, "exchanges"),
      getCards(region)
    ]);
    const groups = asRecord(context.groups);
    const summaries = array(groups.materialExchangeSummaries).map(rawItem);
    const materials = array(groups.materials).map(rawItem);
    const mysekaiMaterials = array(groups.mysekaiMaterials).map(rawItem);
    const resourceBoxes = array(groups.resourceBoxes).map(rawItem);
    const standaloneResourceBoxDetails = array(groups.resourceBoxDetails).map(rawItem);
    const materialMap = new Map(materials.map((item) => [Number(item.id), item]));
    const mysekaiMaterialMap = new Map(mysekaiMaterials.map((item) => [Number(item.id), item]));
    const cardMap = new Map(cards.map((item) => [Number(item.id), item as unknown as Record<string, any>]));
    const standaloneDetailsByBox = new Map<number, Record<string, any>[]>();
    for (const detail of standaloneResourceBoxDetails) {
      if (String(detail.resourceBoxPurpose ?? "") !== "material_exchange") continue;
      const boxId = Number(detail.resourceBoxId);
      if (!Number.isFinite(boxId)) continue;
      const details = standaloneDetailsByBox.get(boxId) ?? [];
      details.push(detail);
      standaloneDetailsByBox.set(boxId, details);
    }
    const resourceBoxMap = new Map<number, Record<string, any>>();
    for (const box of resourceBoxes) {
      if (String(box.resourceBoxPurpose ?? "") !== "material_exchange") continue;
      const boxId = Number(box.id);
      const embeddedDetails = array(box.details).map(rawItem);
      const details = embeddedDetails.length ? embeddedDetails : standaloneDetailsByBox.get(boxId) ?? [];
      resourceBoxMap.set(boxId, { ...box, details });
    }
    const resourceTypes = new Set<string>();
    for (const summary of summaries) {
      for (const value of array(summary.materialExchanges)) {
        const exchange = rawItem(value);
        for (const detail of array(resourceBoxMap.get(Number(exchange.resourceBoxId))?.details)) {
          resourceTypes.add(String(rawItem(detail).resourceType ?? "unknown"));
        }
        for (const cost of array(exchange.costs)) resourceTypes.add(String(rawItem(cost).resourceType ?? "unknown"));
      }
    }
    if (resourceTypes.has("mysekai_blueprint")) resourceTypes.add("mysekai_fixture");
    const { maps: lookupMaps, diagnostics: lookupDiagnostics } = await loadExchangeLookups(region, resourceTypes);
    const items = summaries.flatMap((summary) => array(summary.materialExchanges).map((value) => {
      const exchange = rawItem(value);
      const rewards = array(resourceBoxMap.get(Number(exchange.resourceBoxId))?.details)
        .map((detail) => resolveExchangeResource(region, detail, materialMap, mysekaiMaterialMap, cardMap, lookupMaps))
        .sort((left, right) => left.seq - right.seq);
      const costs = array(exchange.costs).map((costValue) => {
        const cost = rawItem(costValue);
        return {
          ...resolveExchangeResource(region, cost, materialMap, mysekaiMaterialMap, cardMap, lookupMaps),
          costGroupId: Number(cost.costGroupId ?? 1)
        };
      }).sort((left, right) => left.seq - right.seq);
      const imageCandidates = rewards.find((reward) => reward.imageCandidates.length)?.imageCandidates ?? [];
      return {
        id: String(exchange.id ?? ""),
        summaryId: String(summary.id ?? ""),
        summaryName: String(summary.name ?? `兑换所 #${summary.id ?? ""}`),
        category: String(summary.exchangeCategory ?? "unknown"),
        exchangeType: String(summary.materialExchangeType ?? "normal"),
        name: String(exchange.displayName ?? rewards[0]?.name ?? `${summary.name ?? "兑换项"} #${exchange.id ?? ""}`),
        status: exchangeStatus(summary, exchange),
        startAt: Number(exchange.startAt ?? summary.startAt ?? 0) || undefined,
        endAt: Number(summary.endAt ?? 0) || undefined,
        refreshCycle: String(exchange.refreshCycle ?? "none"),
        exchangeLimit: Number.isFinite(Number(exchange.exchangeLimit)) ? Number(exchange.exchangeLimit) : undefined,
        resourceBoxId: Number(exchange.resourceBoxId ?? 0),
        imageUrl: imageCandidates[0],
        imageCandidates,
        rewards,
        costs,
        relationParents: array(exchange.materialExchangeRelationParents),
        raw: exchange
      };
    })).sort((left, right) => {
      const statusOrder: Record<string, number> = { active: 0, permanent: 1, upcoming: 2, ended: 3 };
      return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9)
        || Number(right.startAt ?? 0) - Number(left.startAt ?? 0)
        || Number(left.id) - Number(right.id);
    });
    const requiredCollections = ["materialExchangeSummaries", "materials", "mysekaiMaterials", "resourceBoxes"];
    const unavailableCollections = requiredCollections.filter((name) => !array(groups[name]).length);
    const missingLookups = Object.entries(lookupDiagnostics).filter(([, diagnostic]) => diagnostic.status !== "matched").map(([type]) => type);
    return {
      region,
      type: "exchanges",
      summaries: summaries.map((summary) => ({
        id: String(summary.id ?? ""),
        name: String(summary.name ?? `兑换所 #${summary.id ?? ""}`),
        category: String(summary.exchangeCategory ?? "unknown"),
        count: array(summary.materialExchanges).length,
        startAt: summary.startAt,
        endAt: summary.endAt
      })),
      items,
      total: items.length,
      facets: {
        statuses: Array.from(new Set(items.map((item) => item.status))),
        categories: Array.from(new Set(items.map((item) => item.category))),
        summaryIds: Array.from(new Set(items.map((item) => item.summaryId)))
      },
      capabilityStatus: unavailableCollections.length
        ? (items.length ? "partial" : "source-unavailable")
        : items.some((item) => item.rewards.length === 0) || missingLookups.length ? "partial" : "ready",
      unavailableCollections,
      missingLookups,
      rewardCoverage: {
        resolved: items.filter((item) => item.rewards.length > 0).length,
        missing: items.filter((item) => item.rewards.length === 0).length
      },
      lookupDiagnostics,
      sourceHealth: context.sourceHealth,
      warnings: context.warnings,
      syncedAt: context.sourceMetadata?.fetchedAt
    };
  });
}

export async function getExchangeDetail(region: RegionId, exchangeId: string) {
  const catalog = await getExchangeCatalog(region);
  const item = catalog.items.find((candidate) => candidate.id === exchangeId);
  if (!item) return null;
  return {
    region,
    item,
    summary: catalog.summaries.find((candidate) => candidate.id === item.summaryId),
    siblings: catalog.items.filter((candidate) => candidate.summaryId === item.summaryId && candidate.id !== item.id).slice(0, 24),
    sourceHealth: catalog.sourceHealth,
    capabilityStatus: catalog.capabilityStatus
  };
}

function catalogSource(groups: Record<string, any>, kind: CatalogKind) {
  if (kind === "fixtures") return array(groups.mysekaiFixtures);
  if (kind === "materials") return array(groups.mysekaiMaterials);
  return array(groups.mysekaiBlueprints);
}

function normalizeMysekaiItem(region: RegionId, kind: CatalogKind, value: unknown, groups: Record<string, any>) {
  const raw = rawItem(value);
  const id = String(raw.id ?? "");
  const fixture = kind === "fixtures" ? raw : kind === "blueprints"
    ? array(groups.mysekaiFixtures).map(rawItem).find((item) => String(item.id) === String(raw.craftTargetId))
    : undefined;
  const imageCandidates = kind === "materials"
    ? materialCandidates(region, raw)
    : fixture ? fixtureCandidates(region, fixture) : [];
  return {
    id,
    kind,
    name: String(raw.name ?? fixture?.name ?? `${kind} ${id}`),
    description: raw.description ?? raw.flavorText ?? fixture?.flavorText,
    imageCandidates,
    imageUrl: imageCandidates[0],
    category: raw.mysekaiFixtureType ?? raw.mysekaiMaterialType ?? raw.mysekaiCraftType,
    rarity: raw.mysekaiMaterialRarityType,
    raw
  };
}

export async function getMysekaiCatalog(region: RegionId, kind: CatalogKind, query: Query = {}) {
  const context = await cached(`mysekai-context:${region}`, () => getMysekaiFullContext(region));
  const groups = asRecord(context.groups);
  const normalizedQuery = String(query.q ?? "").trim().toLowerCase();
  let items = catalogSource(groups, kind).map((item) => normalizeMysekaiItem(region, kind, item, groups));
  if (normalizedQuery) items = items.filter((item) => `${item.id} ${item.name} ${item.description ?? ""}`.toLowerCase().includes(normalizedQuery));
  if (query.category) items = items.filter((item) => String(item.category ?? "") === query.category || String(item.raw.mysekaiFixtureMainGenreId ?? "") === query.category);
  if (query.tag) items = items.filter((item) => Object.values(asRecord(item.raw.mysekaiFixtureTagGroup)).some((value) => String(value) === query.tag));
  if (query.characterId) {
    const characterTagIds = new Set(array(groups.mysekaiFixtureTags).map(rawItem)
      .filter((tag) => tag.mysekaiFixtureTagType === "game_character" && String(tag.externalId) === String(query.characterId))
      .map((tag) => String(tag.id)));
    items = items.filter((item) => Object.values(asRecord(item.raw.mysekaiFixtureTagGroup)).some((value) => characterTagIds.has(String(value))));
  }
  items.sort((a, b) => query.sort === "id-asc" ? Number(a.id) - Number(b.id) : Number(b.id) - Number(a.id));
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 24)));
  const total = items.length;
  return {
    region,
    kind,
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    facets: {
      categories: Array.from(new Set(catalogSource(groups, kind).map(rawItem).map((item) => String(item.mysekaiFixtureType ?? item.mysekaiMaterialType ?? item.mysekaiCraftType ?? "")).filter(Boolean))).sort(),
      tags: array(groups.mysekaiFixtureTags).map(rawItem).map((tag) => ({ id: String(tag.id), name: String(tag.name ?? tag.id), type: tag.mysekaiFixtureTagType, externalId: tag.externalId })).slice(0, 200)
    },
    capabilityStatus: statusFromCounts(total, array(context.unavailableGroups).length),
    sourceHealth: context.sourceHealth,
    unavailableGroups: context.unavailableGroups,
    syncedAt: context.sourceMetadata?.fetchedAt
  };
}

export async function getMysekaiDetail(region: RegionId, kind: CatalogKind, itemId: string) {
  const context = await cached(`mysekai-context:${region}`, () => getMysekaiFullContext(region));
  const groups = asRecord(context.groups);
  const raw = catalogSource(groups, kind).map(rawItem).find((item) => String(item.id) === itemId);
  if (!raw) return null;
  const item = normalizeMysekaiItem(region, kind, raw, groups);
  const blueprints = array(groups.mysekaiBlueprints).map(rawItem).filter((entry) => kind === "fixtures" && String(entry.craftTargetId) === itemId);
  const blueprintIds = new Set(blueprints.map((entry) => String(entry.id)));
  const costs = array(groups.mysekaiBlueprintMaterialCosts).map(rawItem).filter((entry) => blueprintIds.has(String(entry.mysekaiBlueprintId)));
  const materials = new Map(array(groups.mysekaiMaterials).map(rawItem).map((entry) => [String(entry.id), entry]));
  return {
    region,
    item,
    blueprints,
    materialCosts: costs.map((cost) => {
      const material = materials.get(String(cost.mysekaiMaterialId));
      return { ...cost, material: material ? normalizeMysekaiItem(region, "materials", material, groups) : undefined };
    }),
    relatedFixtures: kind === "materials"
      ? array(groups.mysekaiBlueprintMaterialCosts).map(rawItem).filter((cost) => String(cost.mysekaiMaterialId) === itemId)
      : [],
    sourceHealth: context.sourceHealth
  };
}

export async function getContentStatus(region: RegionId) {
  return cached(`content-status:${region}`, async () => {
    const [information, exchanges, virtualLives, mysekai, stories, live2d] = await Promise.allSettled([
      informationData(region),
      getExchangeCatalog(region),
      getVirtualLiveCatalog(region),
      getMysekaiFullContext(region),
      getStoriesContext(region),
      getLive2dModels(region)
    ]);
    const infoValue = information.status === "fulfilled" ? information.value : null;
    const exchangeValue = exchanges.status === "fulfilled" ? exchanges.value : null;
    const virtualValue = virtualLives.status === "fulfilled" ? virtualLives.value : null;
    const mysekaiValue = mysekai.status === "fulfilled" ? mysekai.value : null;
    const storyValue = stories.status === "fulfilled" ? stories.value : null;
    const live2dValue = live2d.status === "fulfilled" ? live2d.value : null;
    const modules = {
      information: { status: statusFromCounts(array(infoValue?.items).length, infoValue ? 0 : 1, ["en", "tw", "kr"].includes(region)), count: array(infoValue?.items).length },
      exchanges: { status: exchangeValue?.capabilityStatus ?? "source-unavailable", count: exchangeValue?.total ?? 0 },
      virtualLive: { status: virtualValue?.capabilityStatus ?? "source-unavailable", count: virtualValue?.total ?? 0 },
      mysekai: { status: statusFromCounts(array(asRecord(mysekaiValue?.groups).mysekaiFixtures).length, array(mysekaiValue?.unavailableGroups).length), count: array(asRecord(mysekaiValue?.groups).mysekaiFixtures).length },
      stories: { status: statusFromCounts(Object.values(asRecord(storyValue?.groups)).reduce((sum, value) => sum + array(value).length, 0), array(storyValue?.unavailableGroups).length) },
      live2d: { status: live2dValue && live2dValue.models.length ? "partial" : "source-unavailable", count: live2dValue?.models.length ?? 0, scope: "global-shared-model-asset" }
    };
    return { region, checkedAt: new Date().toISOString(), modules };
  });
}

export type { CatalogKind };
