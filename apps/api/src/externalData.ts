import { type RegionId } from "./config.js";
import type { MasterCollection, MasterCollectionItem } from "./types.js";

export type CollectionSourceType = "team-haruki" | "metadata" | "information-api" | "asset-list" | "live2d-assets";

export interface ExternalDataSource {
  sourceType: CollectionSourceType;
  primaryUrl: string;
  fallbackUrl?: string;
  sourceProject: string;
  fetchedAt: string;
  unavailableReason?: string;
}

export interface ResolvedCollectionResult extends MasterCollection {
  sourceMetadata: ExternalDataSource;
}

type DisplayPreviewItem = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  raw: unknown;
};

type DisplayGroup = {
  key: string;
  label: string;
  count: number;
  previewItems: DisplayPreviewItem[];
};

export interface InformationItem {
  id: string;
  title?: string;
  path?: string;
  informationType?: string;
  informationTag?: string;
  browseType?: string;
  bannerAssetbundleName?: string | null;
  startAt?: number;
  endAt?: number;
  bannerUrl?: string;
  bannerImageCandidates?: string[];
  detailUrl?: string;
  raw: unknown;
}

export interface Live2dModelSummary {
  id: string;
  name?: string;
  modelPath?: string;
  modelFile?: string;
  model3JsonUrl?: string;
  modelBaseUrl?: string;
  motionBaseUrl?: string;
  characterId?: number;
  costumeType?: string;
  scope?: "global-shared-model-asset";
  regionReferenceStatus?: "region-referenced" | "global-only";
  referencedStories?: Array<{ storyType: string; storyId: string; scenarioId?: string }>;
  playbackStatus?: "region-referenced" | "global-only" | "partial" | "missing-resource";
  assetCounts?: { motions: number; expressions: number; textures: number };
  raw: unknown;
}

type Live2dFileRef = { name: string; url: string; group?: string };
type ScenarioInfo = {
  storyType: string;
  storyId: string;
  matchedGroup?: string;
  scenarioId?: string;
  scenarioDataPath?: string;
  scenarioDataUrl?: string;
  proxiedScenarioDataUrl?: string;
  bannerUrl?: string;
  isCardStory: boolean;
  isActionSet: boolean;
  chapterTitle?: string;
  episodeTitle?: string;
  raw?: unknown;
};
type Live2dModel3RewriteResult = {
  model: Live2dModelSummary;
  originalModel3JsonUrl?: string;
  rewrittenModel3Json: unknown;
  rewrittenAt: string;
};

const metadataPrimaryBase = "https://metadata.exmeaning.com";
const metadataFallbackBase = "https://metadata.pjsk.moe";
const informationBase = "https://baijing.exmeaning.com";
const sekaiBestAssetBase = "https://storage.sekai.best";
const moeStaticBase = "https://moe.exmeaning.com";
const moeAssetBase = "https://storage.exmeaning.com";
const moeOverseasAssetBase = "https://storage.pjsk.moe";
const live2dAssetBase = `${sekaiBestAssetBase}/sekai-live2d-assets`;
const comicsAssetBase = `${sekaiBestAssetBase}/sekai-comics`;
const live2dRegionReferences = new Map<RegionId, Map<string, Map<string, { storyType: string; storyId: string; scenarioId?: string }>>>();

function rememberLive2dReference(region: RegionId, model: Live2dModelSummary, info: ScenarioInfo) {
  const regionReferences = live2dRegionReferences.get(region) ?? new Map();
  const modelReferences = regionReferences.get(model.id) ?? new Map();
  const reference = { storyType: info.storyType, storyId: info.storyId, scenarioId: info.scenarioId };
  modelReferences.set(`${reference.storyType}:${reference.storyId}:${reference.scenarioId ?? ""}`, reference);
  regionReferences.set(model.id, modelReferences);
  live2dRegionReferences.set(region, regionReferences);
}

function live2dCharacterId(modelPath: string) {
  const match = modelPath.match(/(?:^|\/)(?:\d+_)?(?:chara|character)?(\d{1,3})(?:_|\/|$)/i)
    ?? modelPath.match(/(?:^|\/)(\d{1,3})_[^/]+$/);
  return match ? Number(match[1]) : undefined;
}

const regionAssetDir: Record<RegionId, string> = {
  jp: "sekai-jp-assets",
  en: "sekai-en-assets",
  tw: "sekai-tw-assets",
  kr: "sekai-kr-assets",
  cn: "sekai-cn-assets"
};

const informationImageBase: Partial<Record<RegionId, string>> = {
  jp: "https://production-web.sekai.colorfulpalette.org/images/information",
  cn: "https://lf3-mkcncdn-tos.dailygn.com/obj/lf-game-lf/gdl_app_5236/images/information"
};

const oldComicAssetbundleNames = Array.from({ length: 40 }, (_, index) => `comic_${String(index + 1).padStart(4, "0")}`);

const metadataCollections: Record<string, string[]> = {
  costumes: ["moe_costume.json"],
  // Exchange entries are nested in summaries. Costs and rewards use the three lookup collections below.
  exchanges: ["materialExchangeSummaries.json", "materials.json", "mysekaiMaterials.json", "resourceBoxes.json"],
  shopItems: ["shopItems.json", "billingShopItems.json", "goods.json"],
  missions: ["normalMissions.json", "beginnerMissions.json", "characterMissionV2s.json", "characterMissionV2ParameterGroups.json", "honorMissions.json"],
  // Schedules, setlists, and rewards are nested in virtualLives on current metadata servers.
  virtualLives: ["virtualLives.json"],
  mysekai: [
    "mysekaiFixtures.json",
    "mysekaiFixtureMainGenres.json",
    "mysekaiFixtureSubGenres.json",
    "mysekaiBlueprints.json",
    "mysekaiBlueprintMaterialCosts.json",
    "mysekaiMaterials.json",
    "mysekaiFixtureTags.json",
    "mysekaiCharacterTalks.json",
    "mysekaiCharacterTalkConditions.json",
    "mysekaiGameCharacterUnitGroups.json",
    "mysekaiGates.json",
    "mysekaiGateLevels.json",
    "mysekaiFixtureGameCharacterGroups.json",
    "mysekaiFixtureGameCharacterGroupPerformanceBonuses.json",
    "cardMysekaiCanvasBonuses.json",
    "eventMysekaiFixtureGameCharacterPerformanceBonusLimits.json"
  ],
  stories: ["eventStories.json", "unitStories.json", "cardEpisodes.json", "specialStories.json", "areaItems.json"],
  comics: ["comics.json", "tips.json", "tipInfos.json"]
};

function nowIso() {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function displayName(raw: unknown, fallback: string) {
  const record = asRecord(raw);
  return String(
    record.name ??
    record.title ??
    record.missionName ??
    record.liveName ??
    record.assetbundleName ??
    record.id ??
    fallback
  );
}

function recordId(raw: unknown, fallback: string) {
  const record = asRecord(raw);
  return String(record.id ?? record.storyId ?? record.scenarioId ?? record.unit ?? record.assetbundleName ?? record.seq ?? fallback);
}

function previewItem(raw: unknown, group: string, index: number): DisplayPreviewItem {
  const record = asRecord(raw);
  return {
    id: recordId(raw, `${group}-${index + 1}`),
    name: displayName(raw, `${group} #${index + 1}`),
    category: String(record.category ?? record.missionType ?? record.informationType ?? group),
    description: typeof record.description === "string"
      ? record.description
      : typeof record.summary === "string"
        ? record.summary
        : undefined,
    raw
  };
}

function displayLabel(key: string) {
  const labels: Record<string, string> = {
    materialExchanges: "素材兑换",
    materialExchangeSummaries: "兑换所汇总",
    exchangeItems: "兑换商品",
    exchanges: "兑换入口",
    normalMissions: "普通任务",
    beginnerMissions: "新手任务",
    characterMissions: "角色任务",
    honorMissions: "称号任务",
    virtualLives: "虚拟 Live",
    virtualLiveSchedules: "日程",
    virtualLiveSetlists: "Setlist",
    virtualLiveRewards: "奖励",
    eventStories: "活动故事",
    unitStories: "组合故事",
    cardEpisodes: "卡牌剧情",
    specialStories: "特殊故事",
    areaItems: "区域对话/资源"
  };
  return labels[key] ?? key;
}

function buildDisplayGroups(groups: Record<string, unknown>, limitPerGroup = 12): DisplayGroup[] {
  return Object.entries(groups).map(([key, value]) => {
    const list = Array.isArray(value) ? value : [];
    return {
      key,
      label: displayLabel(key),
      count: list.length,
      previewItems: list.slice(0, limitPerGroup).map((item, index) => previewItem(item, key, index))
    };
  });
}

function sourceHealthFromEntries(entries: Array<{ unavailableReason?: string }>) {
  const totalGroups = entries.length;
  const unavailableGroups = entries.filter((entry) => entry.unavailableReason).length;
  const availableGroups = Math.max(0, totalGroups - unavailableGroups);
  return {
    status: availableGroups === 0 ? "empty" : unavailableGroups > 0 ? "partial" : "ok",
    availableGroups,
    unavailableGroups,
    totalGroups
  };
}

function warningsFromEntries(entries: Array<{ path: string; unavailableReason?: string }>) {
  return entries
    .filter((entry) => entry.unavailableReason)
    .map((entry) => `${entry.path.replace(/\.json$/i, "")}: ${entry.unavailableReason}`);
}

function metadataUrl(region: RegionId, path: string, base = metadataPrimaryBase) {
  return `${base}/${region}/master/${path}`;
}

async function fetchJsonUrl<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": "pjsktools-local-dev" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const text = await response.text();
  if (!text.trim()) return [] as T;
  return JSON.parse(text) as T;
}

function absoluteUrl(baseUrl: string, filePath?: unknown) {
  if (typeof filePath !== "string" || !filePath.trim()) return undefined;
  try {
    return new URL(filePath, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function proxyUrl(url?: string) {
  return url ? `/api/assets/proxy?url=${encodeURIComponent(url)}` : undefined;
}

function regionAssetBase(region: RegionId) {
  return `${sekaiBestAssetBase}/${regionAssetDir[region]}`;
}

function regionAssetUrl(region: RegionId, path: string) {
  return `${regionAssetBase(region)}/${path.replace(/^\/+/, "")}`;
}

function regionAssetCandidates(region: RegionId, path: string) {
  const normalized = path.replace(/^\/+/, "");
  const direct = [
    `${moeAssetBase}/${regionAssetDir[region]}/${normalized}`,
    `${moeOverseasAssetBase}/${regionAssetDir[region]}/${normalized}`,
    `${sekaiBestAssetBase}/${regionAssetDir[region]}/${normalized}`
  ];
  return [...direct, ...direct.map((url) => proxyUrl(url)!)];
}

function scenarioIdToAssetbundleName(scenarioId: string) {
  let result = scenarioId;
  const eventMatch = result.match(/event_(\d+)/);
  if (eventMatch) {
    const eventNumber = Number(eventMatch[1]);
    if (eventNumber > 166 && eventNumber < 177) result = result.replace(/event_(\d+)/, `event_${eventNumber + 1}`);
  }
  const map: Record<string, string> = {
    "areatalk03_266(20230607修正)": "areatalk03_266",
    "★4冬弥・泉_前半": "012043_touya01",
    "★4司・千秋_前半": "013042_tsukasa01",
    "★4類・夏目_後半": "016042_rui02",
    connect_live_collaboration_ensta_story: "collaboration_es_prequel_01",
    "ログインストーリー（OP）": "collaboration_es_op_01",
    "ログインストーリー（ED）": "collaboration_es_ed_01",
    connect_live_01_band: "connect_live_01_lon_01",
    connect_live_01_idol: "connect_live_01_mmj_01",
    connect_live_01_night: "connect_live_01_nig_01",
    story_connect_live_thanksgiving_4th_anv: "story_connect_live_4th_anniversary_01"
  };
  return map[result] || result;
}

function mediaAsset(kind: string, identifier: string, url?: string) {
  return url ? { kind, identifier, url, proxiedUrl: proxyUrl(url) } : undefined;
}

function soundEffectPath(se: string) {
  if (se.startsWith("se_event")) {
    return `event_story/${se.split("_").slice(1, -1).join("_")}/scenario_se/${se}.mp3`;
  }
  const seBundleName = /^se\d{5}$/.test(se) && Number(se.substring(2)) <= 528 ? "se_pack00001" : "se_pack00001_b";
  return `sound/scenario/se/${seBundleName}/${se}.mp3`;
}

function rewriteLive2dFileReference(baseUrl: string, value: unknown): unknown {
  if (typeof value === "string") return proxyUrl(absoluteUrl(baseUrl, value)) ?? value;
  if (Array.isArray(value)) return value.map((entry) => rewriteLive2dFileReference(baseUrl, entry));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
    if (["File", "file", "Path", "path"].includes(key) && typeof entry === "string") {
      return [key, proxyUrl(absoluteUrl(baseUrl, entry)) ?? entry];
    }
    return [key, rewriteLive2dFileReference(baseUrl, entry)];
  }));
}

function rewriteLive2dModel3(model: Live2dModelSummary, model3Json: unknown): Live2dModel3RewriteResult {
  const baseUrl = model.modelBaseUrl ?? "";
  const root = model3Json && typeof model3Json === "object"
    ? { ...(model3Json as Record<string, unknown>) }
    : {};
  const fileReferences = root.FileReferences && typeof root.FileReferences === "object"
    ? { ...(root.FileReferences as Record<string, unknown>) }
    : {};
  for (const key of ["Moc", "Textures", "Physics", "Pose", "DisplayInfo", "Expressions", "Motions"]) {
    if (key in fileReferences) fileReferences[key] = rewriteLive2dFileReference(baseUrl, fileReferences[key]);
  }
  root.FileReferences = fileReferences;
  return {
    model,
    originalModel3JsonUrl: model.model3JsonUrl,
    rewrittenModel3Json: root,
    rewrittenAt: nowIso()
  };
}

function live2dFilesFromArray(baseUrl: string, value: unknown, group?: string): Live2dFileRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): Live2dFileRef | null => {
      if (typeof entry === "string") {
        const url = absoluteUrl(baseUrl, entry);
        return url ? { name: entry.split("/").pop() ?? entry, url, group } : null;
      }
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const file = record.File ?? record.file ?? record.Path ?? record.path;
      const url = absoluteUrl(baseUrl, file);
      return url ? { name: String(record.Name ?? record.name ?? String(file).split("/").pop()), url, group } : null;
    })
    .filter((entry): entry is Live2dFileRef => Boolean(entry));
}

function parseLive2dModel3(model: Live2dModelSummary, model3Json: unknown) {
  const baseUrl = model.modelBaseUrl ?? "";
  const root = model3Json && typeof model3Json === "object" ? model3Json as Record<string, unknown> : {};
  const fileReferences = root.FileReferences && typeof root.FileReferences === "object"
    ? root.FileReferences as Record<string, unknown>
    : {};
  const motionsSource = fileReferences.Motions && typeof fileReferences.Motions === "object"
    ? fileReferences.Motions as Record<string, unknown>
    : {};
  const motionGroups = Object.entries(motionsSource).flatMap(([group, files]) => live2dFilesFromArray(baseUrl, files, group));
  const textures = live2dFilesFromArray(baseUrl, fileReferences.Textures, "textures");
  const expressions = live2dFilesFromArray(baseUrl, fileReferences.Expressions, "expressions");
  return {
    modelFileUrl: absoluteUrl(baseUrl, fileReferences.Moc) ?? model.model3JsonUrl,
    proxiedModelFileUrl: proxyUrl(absoluteUrl(baseUrl, fileReferences.Moc)),
    textureFiles: textures,
    proxiedTextureFiles: textures.map((item) => ({ ...item, url: proxyUrl(item.url) ?? item.url })),
    motionFiles: motionGroups,
    proxiedMotionFiles: motionGroups.map((item) => ({ ...item, url: proxyUrl(item.url) ?? item.url })),
    expressionFiles: expressions,
    proxiedExpressionFiles: expressions.map((item) => ({ ...item, url: proxyUrl(item.url) ?? item.url })),
    physicsFileUrl: absoluteUrl(baseUrl, fileReferences.Physics),
    proxiedPhysicsFileUrl: proxyUrl(absoluteUrl(baseUrl, fileReferences.Physics)),
    poseFileUrl: absoluteUrl(baseUrl, fileReferences.Pose),
    proxiedPoseFileUrl: proxyUrl(absoluteUrl(baseUrl, fileReferences.Pose)),
    displayInfoFileUrl: absoluteUrl(baseUrl, fileReferences.DisplayInfo),
    proxiedDisplayInfoFileUrl: proxyUrl(absoluteUrl(baseUrl, fileReferences.DisplayInfo)),
    model3Json
  };
}

async function fetchMetadataFile<T>(region: RegionId, path: string): Promise<{ data: T; source: ExternalDataSource }> {
  const primaryUrl = metadataUrl(region, path);
  const fallbackUrl = metadataUrl(region, path, metadataFallbackBase);
  try {
    return {
      data: await fetchJsonUrl<T>(primaryUrl),
      source: { sourceType: "metadata", primaryUrl, fallbackUrl, sourceProject: "moe-sekai/Moesekai metadata mirror", fetchedAt: nowIso() }
    };
  } catch (primaryError) {
    try {
      return {
        data: await fetchJsonUrl<T>(fallbackUrl),
        source: { sourceType: "metadata", primaryUrl, fallbackUrl, sourceProject: "moe-sekai/Moesekai metadata mirror", fetchedAt: nowIso() }
      };
    } catch {
      throw primaryError;
    }
  }
}

export async function getOptionalMetadata(region: RegionId, path: string) {
  try {
    const result = await fetchMetadataFile<unknown>(region, path);
    return { ...result, status: "matched" as const };
  } catch (error) {
    return {
      data: [],
      source: metadataSource(region, path, error),
      status: "missing-data" as const,
      warning: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchFirstMetadata(region: RegionId, paths: string[]) {
  let lastError: unknown;
  for (const path of paths) {
    try {
      return await fetchMetadataFile<unknown[]>(region, path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`No metadata file available: ${paths.join(", ")}`);
}

async function fetchManyMetadata(region: RegionId, paths: string[]) {
  const entries = await Promise.all(paths.map(async (path) => {
    try {
      const result = await fetchMetadataFile<unknown[]>(region, path);
      return { path, ...result, unavailableReason: undefined };
    } catch (error) {
      return { path, data: [], source: metadataSource(region, path, error), unavailableReason: error instanceof Error ? error.message : String(error) };
    }
  }));
  return entries;
}

function metadataSource(region: RegionId, path: string, error?: unknown): ExternalDataSource {
  return {
    sourceType: "metadata",
    primaryUrl: metadataUrl(region, path),
    fallbackUrl: metadataUrl(region, path, metadataFallbackBase),
    sourceProject: "moe-sekai/Moesekai metadata mirror",
    fetchedAt: nowIso(),
    unavailableReason: error instanceof Error ? error.message : error ? String(error) : undefined
  };
}

function costumeSource(source: ExternalDataSource): ExternalDataSource {
  return {
    ...source,
    sourceProject: "moe-sekai/Moesekai metadata + asset rules"
  };
}

function live2dSource(error?: unknown): ExternalDataSource {
  return {
    sourceType: "live2d-assets",
    primaryUrl: `${live2dAssetBase}/live2d/model_list.json`,
    sourceProject: "Sekai-World/sekai-viewer Live2D assets",
    fetchedAt: nowIso(),
    unavailableReason: error instanceof Error ? error.message : error ? String(error) : undefined
  };
}

function firstArrayField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function resolveStoryMatches(entries: Awaited<ReturnType<typeof fetchManyMetadata>>, storyType: string, storyId: string) {
  const normalizedType = storyType.toLowerCase();
  return entries.flatMap((entry) => {
    const group = entry.path.replace(/\.json$/i, "");
    return (entry.data as unknown[])
      .map((raw, index) => ({ raw, group, index }))
      .filter(({ raw, group }) => {
        if (!raw || typeof raw !== "object") return false;
        const record = raw as Record<string, unknown>;
        const id = String(record.id ?? record.scenarioId ?? record.unit ?? record.assetbundleName ?? "");
        return (group.toLowerCase().includes(normalizedType) || normalizedType === "any") && id === storyId;
      });
  });
}

function childScenarioInfo(region: RegionId, group: string, parent: Record<string, unknown>, child: Record<string, unknown>, index: number, storyType: string, storyId: string): ScenarioInfo | null {
  const scenarioId = typeof child.scenarioId === "string" ? child.scenarioId : typeof parent.scenarioId === "string" ? parent.scenarioId : undefined;
  if (!scenarioId) return null;
  const parentAsset = String(parent.assetbundleName ?? parent.assetBundleName ?? "");
  const childAsset = String(child.assetbundleName ?? child.assetBundleName ?? "");
  let scenarioDataPath = "";
  let bannerPath = "";
  let isCardStory = false;
  let isActionSet = false;
  if (group === "eventStories") {
    scenarioDataPath = `event_story/${parentAsset}/scenario/${scenarioId}.asset`;
    bannerPath = childAsset ? `event_story/${parentAsset}/episode_image/${childAsset}.webp` : "";
  } else if (group === "unitStories") {
    scenarioDataPath = `scenario/unitstory/${parentAsset}/${scenarioId}.asset`;
    bannerPath = childAsset ? `story/episode_image/${parentAsset}/${childAsset}.webp` : "";
  } else if (group === "cardEpisodes") {
    const cardAsset = parentAsset || childAsset;
    isCardStory = true;
    scenarioDataPath = `character/member_scenario/${cardAsset}/${scenarioId}.asset`;
    bannerPath = cardAsset ? `character/member_small/${cardAsset}/card_normal.webp` : "";
  } else if (group === "specialStories") {
    scenarioDataPath = String(scenarioId).startsWith("op")
      ? `scenario/special/${parentAsset}/${scenarioId}.asset`
      : `scenario/special/${childAsset || parentAsset}/${scenarioId}.asset`;
  } else if (group === "areaItems") {
    isActionSet = true;
    scenarioDataPath = `scenario/actionset/group${Math.floor(Number(parent.id ?? storyId) / 100)}/${scenarioId}.asset`;
  }
  if (!scenarioDataPath) return null;
  const scenarioDataUrl = regionAssetUrl(region, scenarioDataPath);
  return {
    storyType,
    storyId,
    matchedGroup: group,
    scenarioId,
    scenarioDataPath,
    scenarioDataUrl,
    proxiedScenarioDataUrl: proxyUrl(scenarioDataUrl),
    bannerUrl: bannerPath ? regionAssetUrl(region, bannerPath) : undefined,
    isCardStory,
    isActionSet,
    chapterTitle: typeof parent.title === "string" ? parent.title : undefined,
    episodeTitle: typeof child.title === "string" ? child.title : displayName(child, `Episode ${index + 1}`),
    raw: child
  };
}

function scenarioInfosForMatch(region: RegionId, match: { raw: unknown; group: string; index: number }, storyType: string, storyId: string): ScenarioInfo[] {
  const parent = asRecord(match.raw);
  const children = firstArrayField(parent, ["eventStoryEpisodes", "episodes", "chapters", "unitStoryEpisodes", "specialStoryEpisodes"]);
  if (children.length) {
    return children.flatMap((child, index) => {
      const childRecord = asRecord(child);
      const nestedEpisodes = firstArrayField(childRecord, ["episodes", "unitStoryEpisodes"]);
      if (nestedEpisodes.length) {
        return nestedEpisodes
          .map((episode, episodeIndex) => childScenarioInfo(region, match.group, { ...parent, assetbundleName: childRecord.assetbundleName ?? parent.assetbundleName }, asRecord(episode), index * 100 + episodeIndex, storyType, storyId))
          .filter((item): item is ScenarioInfo => Boolean(item));
      }
      const info = childScenarioInfo(region, match.group, parent, childRecord, index, storyType, storyId);
      return info ? [info] : [];
    });
  }
  const self = childScenarioInfo(region, match.group, parent, parent, match.index, storyType, storyId);
  return self ? [self] : [];
}

function findScenarioInfo(region: RegionId, matches: Array<{ raw: unknown; group: string; index: number }>, storyType: string, storyId: string): ScenarioInfo | null {
  const all = matches.flatMap((match) => scenarioInfosForMatch(region, match, storyType, storyId));
  return all.find((item) => String(item.raw && typeof item.raw === "object" ? (item.raw as Record<string, unknown>).id ?? "" : "") === storyId) ?? all[0] ?? null;
}

export function normalizeScenarioData(region: RegionId, info: ScenarioInfo, scenarioData: unknown, modelList: Live2dModelSummary[] = []) {
  const root = asRecord(scenarioData);
  const snippets = Array.isArray(root.Snippets) ? root.Snippets as Record<string, unknown>[] : [];
  const talkData = Array.isArray(root.TalkData) ? root.TalkData as Record<string, unknown>[] : [];
  const layoutData = Array.isArray(root.LayoutData) ? root.LayoutData as Record<string, unknown>[] : [];
  const specialEffectData = Array.isArray(root.SpecialEffectData) ? root.SpecialEffectData as Record<string, unknown>[] : [];
  const soundData = Array.isArray(root.SoundData) ? root.SoundData as Record<string, unknown>[] : [];
  const layoutModeData = Array.isArray(root.ScenarioSnippetCharacterLayoutModes) ? root.ScenarioSnippetCharacterLayoutModes as Record<string, unknown>[] : [];
  const appearCharacters = Array.isArray(root.AppearCharacters) ? root.AppearCharacters as Record<string, unknown>[] : [];
  const scenarioId = scenarioIdToAssetbundleName(String(root.ScenarioId ?? info.scenarioId ?? ""));
  const media = new Map<string, ReturnType<typeof mediaAsset>>();
  const unsupportedActions = new Set<string>();
  const supportedActions = new Set<string>(["Talk", "Sound", "CharacterLayout", "CharacterMotion", "ActionLayoutMode"]);
  const warnings: string[] = [];
  const addMedia = (asset: ReturnType<typeof mediaAsset>) => {
    if (asset) media.set(`${asset.kind}:${asset.identifier}:${asset.url}`, asset);
    return asset;
  };
  const actions: Record<string, unknown>[] = [];

  if (root.FirstBackground) {
    const bg = String(root.FirstBackground);
    const resource = addMedia(mediaAsset("background", bg, regionAssetUrl(region, `scenario/background/${bg}/${bg}.webp`)));
    actions.push({
      index: -3,
      type: "SpecialEffect",
      action: 6,
      effectType: 7,
      effectName: "ChangeBackground",
      delay: 0,
      isWait: false,
      body: bg,
      resource
    });
  }
  if (root.FirstBgm) {
    const bgm = String(root.FirstBgm);
    const resource = addMedia(mediaAsset("bgm", bgm, regionAssetUrl(region, `sound/scenario/bgm/${bgm}/${bgm}.mp3`)));
    actions.push({
      index: -2,
      type: "Sound",
      action: 7,
      delay: 0,
      isWait: false,
      bgm: resource,
      playMode: 0,
      volume: 1,
      duration: 2.5
    });
  }
  const firstLayout = Array.isArray(root.FirstLayout) ? root.FirstLayout as Record<string, unknown>[] : [];
  for (const [layoutIndex, layout] of firstLayout.entries()) {
    actions.push({
      index: -1 - layoutIndex / 100,
      type: "CharacterLayout",
      action: 2,
      delay: 0,
      isWait: false,
      character2dId: layout.Character2dId,
      costumeType: layout.CostumeType,
      motionName: layout.MotionName,
      facialName: layout.FacialName,
      sideFrom: layout.PositionSide,
      sideTo: layout.PositionSide,
      sideFromOffsetX: layout.OffsetX,
      sideToOffsetX: layout.OffsetX,
      layoutType: 2,
      moveSpeedType: 1,
      raw: layout
    });
  }

  for (const [index, snippet] of snippets.entries()) {
    const action = Number(snippet.Action);
    const referenceIndex = Number(snippet.ReferenceIndex);
    const base = {
      index,
      action,
      referenceIndex,
      delay: Number(snippet.Delay ?? 0),
      progressBehavior: snippet.ProgressBehavior,
      isWait: Number(snippet.ProgressBehavior) === 1
    };
    if (action === 1) {
      const detail = talkData[referenceIndex] ?? {};
      const voices = Array.isArray(detail.Voices) ? detail.Voices as Record<string, unknown>[] : [];
      const voiceId = voices.length ? String(voices[0].VoiceId ?? "") : "";
      const voicePath = voiceId ? `sound/${info.isCardStory ? "card_" : ""}${info.isActionSet ? "actionset" : "scenario"}/voice/${scenarioId}/${voiceId}.mp3` : "";
      const voice = voicePath ? addMedia(mediaAsset("voice", voiceId, regionAssetUrl(region, voicePath))) : undefined;
      const talkCharacters = Array.isArray(detail.TalkCharacters) ? detail.TalkCharacters : [];
      actions.push({
        ...base,
        type: "Talk",
        body: detail.Body ?? "",
        windowDisplayName: detail.WindowDisplayName ?? "",
        talkCharacters,
        motions: detail.Motions ?? [],
        voice
      });
    } else if (action === 2) {
      const detail = layoutData[referenceIndex] ?? {};
      actions.push({
        ...base,
        type: "CharacterLayout",
        character2dId: detail.Character2dId,
        costumeType: detail.CostumeType,
        motionName: detail.MotionName,
        facialName: detail.FacialName,
        sideFrom: detail.SideFrom,
        sideTo: detail.SideTo,
        sideFromOffsetX: detail.SideFromOffsetX,
        sideToOffsetX: detail.SideToOffsetX,
        layoutType: detail.Type,
        moveSpeedType: detail.MoveSpeedType,
        raw: detail
      });
    } else if (action === 4) {
      const detail = layoutData[referenceIndex] ?? {};
      actions.push({
        ...base,
        type: "CharacterMotion",
        character2dId: detail.Character2dId,
        costumeType: detail.CostumeType,
        motionName: detail.MotionName,
        facialName: detail.FacialName,
        raw: detail
      });
    } else if (action === 6) {
      const detail = specialEffectData[referenceIndex] ?? {};
      const effectType = Number(detail.EffectType);
      const effectNames: Record<number, string> = {
        1: "BlackIn", 2: "BlackOut", 3: "WhiteIn", 4: "WhiteOut", 5: "ShakeScreen", 6: "ShakeWindow",
        7: "ChangeBackground", 8: "Telop", 9: "FlashbackIn", 10: "FlashbackOut", 11: "ChangeCardStill",
        12: "AmbientColorNormal", 13: "AmbientColorEvening", 14: "AmbientColorNight", 15: "PlayScenarioEffect",
        16: "StopScenarioEffect", 17: "ChangeBackgroundStill", 18: "PlaceInfo", 19: "Movie", 20: "SekaiIn",
        21: "SekaiOut", 22: "AttachCharacterShader", 24: "FullScreenText", 25: "StopShakeScreen",
        26: "StopShakeWindow", 27: "MemoryIn", 28: "MemoryOut", 29: "BlackWipeInLeft", 30: "BlackWipeOutLeft",
        31: "BlackWipeInRight", 32: "BlackWipeOutRight", 33: "BlackWipeInTop", 34: "BlackWipeOutTop",
        35: "BlackWipeInBottom", 36: "BlackWipeOutBottom", 38: "FullScreenTextShow", 39: "FullScreenTextHide",
        40: "SekaiInCenter", 41: "SekaiOutCenter", 42: "ChangeCameraPosition", 43: "ChangeCameraZoomLevel", 44: "Blur"
      };
      const effectName = effectNames[effectType] ?? `SpecialEffect.${effectType}`;
      const resource = effectName === "ChangeBackground"
        ? addMedia(mediaAsset("background", String(detail.StringValSub ?? detail.StringVal ?? ""), regionAssetUrl(region, `scenario/background/${detail.StringValSub ?? detail.StringVal}/${detail.StringValSub ?? detail.StringVal}.webp`)))
        : effectName === "Movie" && detail.StringVal
          ? addMedia(mediaAsset("video", String(detail.StringVal), regionAssetUrl(region, `scenario/movie/${detail.StringVal}/${detail.StringVal}.mp4`)))
          : effectName === "PlayScenarioEffect" && detail.StringValSub
            ? addMedia(mediaAsset("scenario-effect", String(detail.StringVal), regionAssetUrl(region, `${detail.StringValSub}.webp`)))
            : undefined;
      if (effectName.startsWith("SpecialEffect.")) unsupportedActions.add(effectName);
      else supportedActions.add(`SpecialEffect.${effectName}`);
      actions.push({
        ...base,
        type: "SpecialEffect",
        effectType,
        effectName,
        body: detail.StringVal ?? "",
        resource,
        raw: detail
      });
    } else if (action === 7) {
      const detail = soundData[referenceIndex] ?? {};
      const bgm = typeof detail.Bgm === "string" && detail.Bgm ? addMedia(mediaAsset("bgm", detail.Bgm, regionAssetUrl(region, `sound/scenario/bgm/${detail.Bgm}/${detail.Bgm}.mp3`))) : undefined;
      const se = typeof detail.Se === "string" && detail.Se ? addMedia(mediaAsset("se", detail.Se, regionAssetUrl(region, soundEffectPath(detail.Se)))) : undefined;
      actions.push({
        ...base,
        type: "Sound",
        bgm,
        se,
        playMode: detail.PlayMode,
        volume: detail.Volume,
        duration: detail.Duration,
        raw: detail
      });
    } else if (action === 8) {
      const detail = layoutModeData[referenceIndex] ?? {};
      actions.push({
        ...base,
        type: "ActionLayoutMode",
        characterLayoutMode: Number(detail.CharacterLayoutMode ?? root.FirstCharacterLayoutMode ?? 0),
        raw: detail
      });
    } else {
      unsupportedActions.add(`SnippetAction.${action}`);
      actions.push({ ...base, type: `Unsupported.${action}`, raw: snippet });
    }
  }

  const appearByCharacter = new Map(appearCharacters.map((character) => [Number(character.Character2dId), character]));
  const referencedCharacterIds = new Set<number>();
  for (const action of actions) {
    if (action.character2dId != null) referencedCharacterIds.add(Number(action.character2dId));
    if (Array.isArray(action.motions)) {
      for (const motion of action.motions as Record<string, unknown>[]) {
        if (motion.Character2dId != null) referencedCharacterIds.add(Number(motion.Character2dId));
      }
    }
  }
  const referencedCharacters = referencedCharacterIds.size
    ? [...referencedCharacterIds].map((id) => appearByCharacter.get(id)).filter((item): item is Record<string, unknown> => Boolean(item))
    : appearCharacters.slice(0, 6);
  const live2dModels = referencedCharacters.map((character) => {
    const costumeType = String(character.CostumeType ?? "");
    const matched = modelList.find((model) => model.modelPath === costumeType || model.id === costumeType || model.modelPath?.endsWith(`/${costumeType}`));
    if (!matched && costumeType) warnings.push(`Live2D model not found for costume ${costumeType}`);
    if (matched) rememberLive2dReference(region, matched, info);
    return {
      character2dId: character.Character2dId,
      costumeType,
      modelId: matched?.id,
      modelPath: matched?.modelPath,
      model3JsonUrl: matched?.model3JsonUrl,
      rewrittenModel3JsonUrl: matched ? `/api/master/${region}/live2d/models/${encodeURIComponent(matched.id)}/model3-proxy` : undefined,
      raw: character
    };
  });

  const currentCostume = new Map(referencedCharacters.map((character) => [Number(character.Character2dId), String(character.CostumeType ?? "")]));
  const modelQueue: string[][] = [];
  const recent: string[] = [];
  const pushQueue = (costumes: string[]) => {
    for (const costume of costumes.filter(Boolean)) {
      const previous = recent.indexOf(costume);
      if (previous >= 0) recent.splice(previous, 1);
      recent.push(costume);
    }
    while (recent.length > 6) recent.shift();
    modelQueue.push([...recent]);
  };
  for (const action of actions) {
    if ((action.type === "CharacterLayout" || action.type === "CharacterMotion") && action.character2dId != null) {
      const cid = Number(action.character2dId);
      const costume = String(action.costumeType ?? currentCostume.get(cid) ?? "");
      if (costume) currentCostume.set(cid, costume);
    }
    pushQueue([...currentCostume.values()]);
  }

  const requiredMotions = new Map<string, Set<string>>();
  const requiredExpressions = new Map<string, Set<string>>();
  const addModelAction = (costume: string, motion?: unknown, expression?: unknown) => {
    if (!costume) return;
    if (motion) (requiredMotions.get(costume) ?? requiredMotions.set(costume, new Set()).get(costume))?.add(String(motion).replaceAll(" ", ""));
    if (expression) (requiredExpressions.get(costume) ?? requiredExpressions.set(costume, new Set()).get(costume))?.add(String(expression).replaceAll(" ", ""));
  };
  const costumeByCharacter = new Map(referencedCharacters.map((character) => [Number(character.Character2dId), String(character.CostumeType ?? "")]));
  for (const action of actions) {
    if (action.type === "CharacterLayout" || action.type === "CharacterMotion") {
      const costume = String(action.costumeType ?? costumeByCharacter.get(Number(action.character2dId)) ?? "");
      addModelAction(costume, action.motionName, action.facialName);
      if (costume) costumeByCharacter.set(Number(action.character2dId), costume);
    }
    if (action.type === "Talk" && Array.isArray(action.motions)) {
      for (const motion of action.motions as Record<string, unknown>[]) {
        addModelAction(costumeByCharacter.get(Number(motion.Character2dId)) ?? "", motion.MotionName, motion.FacialName);
      }
    }
  }
  const scenarioResource = {
    image: Array.from(media.values()).filter((asset) => asset && ["background", "scenario-effect"].includes(asset.kind)),
    audio: Array.from(media.values()).filter((asset) => asset && ["voice", "bgm", "se"].includes(asset.kind)),
    video: Array.from(media.values()).filter((asset) => asset?.kind === "video")
  };
  const modelsWithActions = Array.from(new Map(live2dModels.map((model) => [model.costumeType, {
    ...model,
    motions: [...(requiredMotions.get(model.costumeType) ?? [])],
    expressions: [...(requiredExpressions.get(model.costumeType) ?? [])]
  }])).values());
  const preloadPlan = {
    region,
    stages: ["scenario", "media", "model-data", "model-assets", "model-motion", "render-model"],
    media: Array.from(media.values()).filter(Boolean).map((asset) => ({ ...asset, region, status: asset?.url ? "pending" : "missing-resource" })),
    models: modelsWithActions.map((model) => ({
      ...model,
      region,
      status: model.rewrittenModel3JsonUrl ? "pending" : "missing-resource"
    }))
  };
  const supportStatus = Object.fromEntries([...supportedActions].map((name) => [name, "matched"]));
  for (const name of unsupportedActions) supportStatus[name] = "unsupported";

  return {
    playbackVersion: "story-live2d-v2-reference",
    scenarioId,
    appearCharacters,
    snippets,
    actions,
    mediaAssets: Array.from(media.values()).filter(Boolean),
    live2dModels: modelsWithActions,
    scenarioResource,
    modelQueue,
    preloadPlan,
    unsupportedActions: Array.from(unsupportedActions),
    actionSupport: {
      supported: Array.from(supportedActions),
      unsupported: Array.from(unsupportedActions),
      status: supportStatus,
      supportMatrix: {
        Talk: "implemented: dialog text, speaker, first voice asset, first motion trace",
        Sound: "implemented: BGM/SE URL extraction and frontend audio playback",
        CharacterLayout: "implemented: position placeholder and motion/expression state",
        CharacterMotion: "implemented: motion/expression state; full Live2D motion blending depends on runtime",
        ActionLayoutMode: "matched: normalized and executed by StoryLive2DController",
        "SpecialEffect.ChangeBackground": "implemented",
        "SpecialEffect.Camera": "matched when action data is present",
        "SpecialEffect.BlackWhiteWipe": "matched by layered runtime",
        "SpecialEffect.Shake": "matched by layered runtime",
        "SpecialEffect.TelopPlaceInfoFullScreenText": "matched by layered runtime",
        "SpecialEffect.MovieScenarioEffect": "matched when the region resource is available; otherwise missing-resource"
      },
      referenceSources: [
        "Sekai-World/sekai-viewer src/utils/Live2DPlayer/action/index.ts",
        "Sekai-World/sekai-viewer src/utils/Live2DPlayer/action/special_effect/index.ts",
        "Sekai-World/sekai-viewer src/pages/storyreader-live2d/StoryReaderLive2DStage.tsx"
      ]
    },
    preloadStatus: {
      mediaAssets: Array.from(media.values()).filter(Boolean).map((asset) => ({
        kind: asset?.kind,
        identifier: asset?.identifier,
        url: asset?.url,
        proxiedUrl: asset?.proxiedUrl,
        status: asset?.url ? "candidate" : "missing"
      })),
      live2dModels: live2dModels.map((model) => ({
        character2dId: model.character2dId,
        costumeType: model.costumeType,
        modelId: model.modelId,
        status: model.rewrittenModel3JsonUrl ? "candidate" : "missing"
      }))
    },
    playbackDiagnostics: {
      playbackVersion: "story-live2d-v2-reference",
      actionCount: actions.length,
      mediaCount: media.size,
      live2dModelCount: live2dModels.length,
      unsupportedActionCount: unsupportedActions.size,
      modelQueueMax: 6,
      referenceIndexPreserved: true,
      degradationPolicy: "text, background, and audio remain available when the Live2D runtime or a region resource is unavailable"
    },
    renderAcceptance: {
      status: "pending-browser-validation",
      serverValidation: "scenario-parsed",
      matchedPolicy: "Only browser canvas, model, action, and media checks may promote this scenario to matched."
    },
    runtimeRequirements: ["pixi.js@7", "@sekai-world/pixi-live2d-display-mulmotion", "howler", "Cubism Core"],
    warnings
  };
}

function normalizeRawItem(item: unknown, fallbackId: string): MasterCollectionItem {
  const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const id = raw.id ?? raw.assetbundleName ?? raw.assetBundleName ?? raw.virtualLiveId ?? raw.missionId ?? raw.path ?? fallbackId;
  return {
    id: String(id),
    name: typeof raw.name === "string" ? raw.name : undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    assetbundleName: typeof raw.assetbundleName === "string" ? raw.assetbundleName : typeof raw.assetBundleName === "string" ? raw.assetBundleName : undefined,
    startAt: typeof raw.startAt === "number" ? new Date(raw.startAt).toISOString() : undefined,
    endAt: typeof raw.endAt === "number" ? new Date(raw.endAt).toISOString() : undefined,
    raw
  };
}

function normalizeCostumeItem(item: unknown, fallbackId: string): MasterCollectionItem {
  const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const id = raw.costumeNumber ?? fallbackId;
  const publishedAt = typeof raw.publishedAt === "number" ? raw.publishedAt : typeof raw.archivePublishedAt === "number" ? raw.archivePublishedAt : undefined;
  return {
    id: String(id),
    name: typeof raw.name === "string" ? raw.name : undefined,
    startAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
    raw
  };
}

function toCollection(region: RegionId, type: string, items: unknown[], sourceMetadata: ExternalDataSource): ResolvedCollectionResult {
  return {
    region,
    type,
    source: sourceMetadata.primaryUrl,
    sourceMetadata,
    syncedAt: sourceMetadata.fetchedAt,
    items: items.map((item, index) => normalizeRawItem(item, `${type}-${index + 1}`)),
    unavailableReason: items.length ? undefined : sourceMetadata.unavailableReason ?? "Real data source returned no items"
  };
}

async function costumeCollection(region: RegionId): Promise<ResolvedCollectionResult> {
  const path = metadataCollections.costumes[0];
  try {
    const result = await fetchMetadataFile<unknown>(region, path);
    const wrapper = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
    const costumes = Array.isArray(wrapper.costumes) ? wrapper.costumes : [];
    const sourceMetadata = costumeSource(result.source);
    return {
      region,
      type: "costumes",
      source: sourceMetadata.primaryUrl,
      sourceMetadata,
      syncedAt: sourceMetadata.fetchedAt,
      items: costumes.map((item, index) => normalizeCostumeItem(item, `costumes-${index + 1}`)),
      unavailableReason: costumes.length ? undefined : "moe_costume.json returned no costume sets"
    };
  } catch (error) {
    const sourceMetadata = costumeSource(metadataSource(region, path, error));
    return { region, type: "costumes", source: sourceMetadata.primaryUrl, sourceMetadata, syncedAt: sourceMetadata.fetchedAt, items: [], unavailableReason: sourceMetadata.unavailableReason };
  }
}

function staticComicItems(region: RegionId) {
  return oldComicAssetbundleNames.map((assetbundleName, index) => ({
    id: String(index + 1),
    title: `Comic ${index + 1}`,
    assetbundleName,
    imageCandidates: [
      `${comicsAssetBase}/comic/one_frame/${assetbundleName}.webp`,
      `${moeAssetBase}/${regionAssetDir[region]}/comic/one_frame/${assetbundleName}.webp`,
      `${moeOverseasAssetBase}/${regionAssetDir[region]}/comic/one_frame/${assetbundleName}.webp`,
      `${comicsAssetBase}/comic/${assetbundleName}/${assetbundleName}.webp`,
      `${sekaiBestAssetBase}/${regionAssetDir[region]}/comic/one_frame/${assetbundleName}.webp`,
      `${moeStaticBase}/mangas/${index + 1}.webp`
    ]
  }));
}

export async function getExternalCollection(region: RegionId, type: string): Promise<ResolvedCollectionResult | null> {
  if (type === "announcements") return informationCollection(region);
  if (type === "live2d") return live2dCollection(region);
  if (type === "comics") return comicsCollection(region);
  if (type === "costumes") return costumeCollection(region);
  const paths = metadataCollections[type];
  if (!paths) return null;
  if (type === "missions" || type === "virtualLives" || type === "mysekai") {
    const context = await getExternalContext(region, type);
    const items = Object.entries(context.groups ?? {}).flatMap(([group, list]) =>
      Array.isArray(list) ? list.map((item) => ({ ...(item as Record<string, unknown>), sourceGroup: group })) : []
    );
    return toCollection(region, type, items, context.sourceMetadata);
  }
  try {
    const result = await fetchFirstMetadata(region, paths);
    return toCollection(region, type, result.data, type === "costumes" ? costumeSource(result.source) : result.source);
  } catch (error) {
    const source = metadataSource(region, paths[0], error);
    return toCollection(region, type, [], type === "costumes" ? costumeSource(source) : source);
  }
}

export async function informationCollection(region: RegionId): Promise<ResolvedCollectionResult> {
  if (region !== "jp" && region !== "cn") {
    const sourceMetadata: ExternalDataSource = {
      sourceType: "information-api",
      primaryUrl: `${informationBase}/${region}/information`,
      sourceProject: "moe-sekai/Moesekai information API",
      fetchedAt: nowIso(),
      unavailableReason: "Information API is only confirmed for jp and cn"
    };
    const collection = toCollection(region, "announcements", [], sourceMetadata);
    return {
      ...collection,
      displayGroups: [],
      previewItems: [],
      sourceHealth: { status: "empty", availableGroups: 0, unavailableGroups: 1, totalGroups: 1 },
      warnings: [sourceMetadata.unavailableReason]
    } as ResolvedCollectionResult;
  }
  const primaryUrl = `${informationBase}/${region}/information`;
  try {
    const data = await fetchJsonUrl<{ informations?: unknown[] }>(`${primaryUrl}?_ts=${Date.now()}`);
    const imageBase = informationImageBase[region] ?? "";
    const items = (data.informations ?? []).map((item) => {
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const bannerAssetbundleName = typeof raw.bannerAssetbundleName === "string" ? raw.bannerAssetbundleName : "";
      const encodedBannerName = bannerAssetbundleName ? encodeURIComponent(bannerAssetbundleName) : "";
      const directCandidates = encodedBannerName ? [
        `${imageBase}/${encodedBannerName}.png`,
        `${imageBase}/${encodedBannerName}.webp`
      ] : [];
      const bannerImageCandidates = directCandidates.flatMap((url) => [url, proxyUrl(url)]).filter((url): url is string => Boolean(url));
      return {
        ...raw,
        bannerUrl: bannerImageCandidates[0],
        bannerImageCandidates,
        detailUrl: typeof raw.path === "string"
          ? /^https?:\/\//i.test(raw.path)
            ? raw.path
            : region === "jp"
              ? `https://production-web.sekai.colorfulpalette.org/${raw.path.replace(/^\/+/, "")}`
              : raw.path
          : undefined
      } satisfies Partial<InformationItem>;
    });
    const collection = toCollection(region, "announcements", items, {
      sourceType: "information-api",
      primaryUrl,
      sourceProject: "moe-sekai/Moesekai information API",
      fetchedAt: nowIso()
    });
    const previewItems = items.slice(0, 24).map((item, index) => previewItem(item, "information", index));
    return {
      ...collection,
      displayGroups: [{
        key: "information",
        label: "公告资讯",
        count: items.length,
        previewItems
      }],
      previewItems,
      sourceHealth: { status: items.length ? "ok" : "empty", availableGroups: items.length ? 1 : 0, unavailableGroups: items.length ? 0 : 1, totalGroups: 1 },
      warnings: items.length ? [] : ["Information API returned no information items"]
    } as ResolvedCollectionResult;
  } catch (error) {
    const sourceMetadata: ExternalDataSource = {
      sourceType: "information-api",
      primaryUrl,
      sourceProject: "moe-sekai/Moesekai information API",
      fetchedAt: nowIso(),
      unavailableReason: error instanceof Error ? error.message : String(error)
    };
    const collection = toCollection(region, "announcements", [], sourceMetadata);
    return {
      ...collection,
      displayGroups: [],
      previewItems: [],
      sourceHealth: { status: "empty", availableGroups: 0, unavailableGroups: 1, totalGroups: 1 },
      warnings: [sourceMetadata.unavailableReason]
    } as ResolvedCollectionResult;
  }
}

async function comicsCollection(region: RegionId): Promise<ResolvedCollectionResult> {
  try {
    const result = await fetchFirstMetadata(region, metadataCollections.comics);
    if (Array.isArray(result.data) && result.data.length) return toCollection(region, "comics", result.data, result.source);
  } catch {
    // Fall back to the reference project's known old comic asset list below.
  }
  return toCollection(region, "comics", staticComicItems(region), {
    sourceType: "asset-list",
    primaryUrl: `${comicsAssetBase}/comic/one_frame/{assetbundleName}.webp`,
    sourceProject: "Sekai-World/sekai-viewer comic asset rules + moe-sekai/Moesekai oldComicTips",
    fetchedAt: nowIso()
  });
}

async function live2dCollection(region: RegionId): Promise<ResolvedCollectionResult> {
  const models = await getLive2dModels(region);
  return toCollection(region, "live2d", models.models, models.sourceMetadata);
}

type Live2dCatalogOptions = {
  page?: number;
  pageSize?: number;
  q?: string;
  characterId?: number;
  costumeType?: string;
  availability?: "verified-playable" | "region-referenced" | "global-only" | "unavailable" | "all";
};

export async function getLive2dModels(region: RegionId, options: Live2dCatalogOptions = {}): Promise<{
  models: Live2dModelSummary[];
  items?: Live2dModelSummary[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  filters?: Live2dCatalogOptions;
  availabilitySummary?: Record<string, number>;
  sourceMetadata: ExternalDataSource;
  realDataRequired: true;
}> {
  const sourceMetadata = live2dSource();
  try {
    const rows = await fetchJsonUrl<unknown[]>(sourceMetadata.primaryUrl);
    const references = live2dRegionReferences.get(region) ?? new Map();
    const models = rows.map((item, index): Live2dModelSummary => {
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const modelPath = String(raw.modelPath ?? raw.path ?? raw.modelBase ?? "");
      const modelFile = String(raw.modelFile ?? raw.file ?? "model.model3.json");
      const modelBaseUrl = modelPath ? `${live2dAssetBase}/live2d/model/${modelPath}/` : undefined;
      const id = String(raw.id ?? raw.modelId ?? raw.name ?? modelPath ?? index + 1);
      const referencedStories = [...(references.get(id)?.values() ?? [])];
      return {
        id,
        name: typeof raw.name === "string" ? raw.name : undefined,
        modelPath,
        modelFile,
        model3JsonUrl: modelPath ? `${modelBaseUrl}${modelFile}` : undefined,
        modelBaseUrl,
        motionBaseUrl: modelPath ? `${live2dAssetBase}/live2d/motion/${modelPath}/` : undefined,
        characterId: live2dCharacterId(modelPath),
        costumeType: modelPath.split("/").filter(Boolean).at(-1) ?? modelPath,
        scope: "global-shared-model-asset",
        regionReferenceStatus: referencedStories.length ? "region-referenced" : "global-only",
        referencedStories,
        playbackStatus: referencedStories.length ? "region-referenced" : "global-only",
        assetCounts: { motions: 0, expressions: 0, textures: 0 },
        raw
      };
    });
    const hasCatalogOptions = Object.keys(options).length > 0;
    const normalizedQuery = options.q?.trim().toLowerCase() ?? "";
    const availability = options.availability ?? "all";
    const filtered = models.filter((model) => {
      if (normalizedQuery && !`${model.id} ${model.name ?? ""} ${model.modelPath ?? ""}`.toLowerCase().includes(normalizedQuery)) return false;
      if (options.characterId && model.characterId !== options.characterId) return false;
      if (options.costumeType && !String(model.costumeType ?? "").toLowerCase().includes(options.costumeType.toLowerCase())) return false;
      if (["verified-playable", "region-referenced"].includes(availability) && model.regionReferenceStatus !== "region-referenced") return false;
      if (availability === "global-only" && model.regionReferenceStatus !== "global-only") return false;
      if (availability === "unavailable") return false;
      return true;
    });
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 24));
    const page = Math.min(Math.max(1, options.page ?? 1), Math.max(1, Math.ceil(filtered.length / pageSize)));
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);
    const availabilitySummary = {
      "region-referenced": models.filter((model) => model.regionReferenceStatus === "region-referenced").length,
      "global-only": models.filter((model) => model.regionReferenceStatus === "global-only").length,
      unavailable: 0
    };
    return {
      models,
      ...(hasCatalogOptions ? { items, page, pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)), filters: options, availabilitySummary } : {}),
      sourceMetadata: {
        ...sourceMetadata,
        scope: "global-shared-model-asset",
        regionAvailability: "A model is playable only after a scenario in the selected region references it and its files load successfully."
      } as ExternalDataSource,
      realDataRequired: true
    };
  } catch (error) {
    return { models: [], sourceMetadata: live2dSource(error), realDataRequired: true };
  }
}

export async function getLive2dModelDetail(region: RegionId, modelId: string) {
  const list = await getLive2dModels(region);
  const model = list.models.find((item) => item.id === modelId || item.modelPath === modelId || item.name === modelId);
  if (!model) return null;
  let parsedModel3 = null;
  let unavailableReason: string | undefined;
  if (model.model3JsonUrl) {
    try {
      parsedModel3 = parseLive2dModel3(model, await fetchJsonUrl<unknown>(model.model3JsonUrl));
    } catch (error) {
      unavailableReason = `Failed to parse model3.json: ${error instanceof Error ? error.message : String(error)}`;
    }
  } else {
    unavailableReason = "model3.json URL is unavailable";
  }
  return {
    region,
    model,
    assets: {
      model3JsonUrl: model.model3JsonUrl,
      proxiedModel3JsonUrl: proxyUrl(model.model3JsonUrl),
      rewrittenModel3JsonUrl: `/api/master/${region}/live2d/models/${encodeURIComponent(model.id)}/model3-proxy`,
      modelBaseUrl: model.modelBaseUrl,
      motionBaseUrl: model.motionBaseUrl,
      modelFileUrl: parsedModel3?.modelFileUrl,
      proxiedModelFileUrl: parsedModel3?.proxiedModelFileUrl,
      textureFiles: parsedModel3?.textureFiles ?? [],
      proxiedTextureFiles: parsedModel3?.proxiedTextureFiles ?? [],
      motionFiles: parsedModel3?.motionFiles ?? [],
      proxiedMotionFiles: parsedModel3?.proxiedMotionFiles ?? [],
      expressionFiles: parsedModel3?.expressionFiles ?? [],
      proxiedExpressionFiles: parsedModel3?.proxiedExpressionFiles ?? [],
      physicsFileUrl: parsedModel3?.physicsFileUrl,
      proxiedPhysicsFileUrl: parsedModel3?.proxiedPhysicsFileUrl,
      poseFileUrl: parsedModel3?.poseFileUrl,
      proxiedPoseFileUrl: parsedModel3?.proxiedPoseFileUrl,
      displayInfoFileUrl: parsedModel3?.displayInfoFileUrl,
      proxiedDisplayInfoFileUrl: parsedModel3?.proxiedDisplayInfoFileUrl,
      motionGroups: Object.entries((parsedModel3?.model3Json as Record<string, unknown> | undefined)?.FileReferences && typeof (parsedModel3?.model3Json as Record<string, unknown>)?.FileReferences === "object"
        ? (((parsedModel3?.model3Json as Record<string, unknown>).FileReferences as Record<string, unknown>).Motions as Record<string, unknown> | undefined) ?? {}
        : {}).map(([group, files]) => ({
        group,
        count: Array.isArray(files) ? files.length : 0
      })),
      expressionCandidates: model.modelBaseUrl ? [
        `${model.modelBaseUrl}expressions/`,
        `${model.modelBaseUrl}expression/`
      ] : [],
      motionCandidates: model.motionBaseUrl ? [
        model.motionBaseUrl,
        `${model.modelBaseUrl ?? ""}motions/`
      ].filter(Boolean) : []
    },
    playbackStatus: unavailableReason
      ? "missing-resource"
      : (parsedModel3?.textureFiles.length ?? 0) === 0
        ? "missing-resource"
        : (parsedModel3?.motionFiles.length ?? 0) === 0 || (parsedModel3?.expressionFiles.length ?? 0) === 0
          ? "partial"
          : model.regionReferenceStatus === "region-referenced" ? "region-referenced" : "global-only",
    assetCounts: {
      motions: parsedModel3?.motionFiles.length ?? 0,
      expressions: parsedModel3?.expressionFiles.length ?? 0,
      textures: parsedModel3?.textureFiles.length ?? 0
    },
    sourceMetadata: list.sourceMetadata,
    runtimeRequired: ["pixi.js@7", "@sekai-world/pixi-live2d-display-mulmotion", "Cubism runtime"],
    unavailableReason,
    realDataRequired: true
  };
}

export async function getLive2dModel3Proxy(region: RegionId, modelId: string) {
  const list = await getLive2dModels(region);
  const model = list.models.find((item) => item.id === modelId || item.modelPath === modelId || item.name === modelId);
  if (!model) return null;
  if (!model.model3JsonUrl) throw new Error("model3.json URL is unavailable");
  return rewriteLive2dModel3(model, await fetchJsonUrl<unknown>(model.model3JsonUrl));
}

export async function getExternalContext(region: RegionId, kind: "exchanges" | "missions" | "virtualLives" | "mysekai") {
  // Overseas metadata keeps resource-box details in a separate collection,
  // while JP/EN already embed them in resourceBoxes.json.
  const paths = kind === "exchanges" && ["tw", "kr", "cn"].includes(region)
    ? [...metadataCollections.exchanges, "resourceBoxDetails.json"]
    : metadataCollections[kind] ?? [];
  const entries = await fetchManyMetadata(region, paths);
  const groups = Object.fromEntries(entries.map((entry) => [entry.path.replace(/\.json$/i, ""), entry.data]));
  const firstSource = entries.find((entry) => !entry.unavailableReason)?.source ?? metadataSource(region, paths[0] ?? kind, entries[0]?.unavailableReason);
  const unavailableGroups = entries.filter((entry) => entry.unavailableReason).map((entry) => ({
    group: entry.path.replace(/\.json$/i, ""),
    unavailableReason: entry.unavailableReason
  }));
  return {
    region,
    type: kind,
    groups,
    files: entries.map((entry) => ({
      path: entry.path,
      count: Array.isArray(entry.data) ? entry.data.length : 0,
      sourceMetadata: entry.source,
      unavailableReason: entry.unavailableReason
    })),
    sourceMetadata: firstSource,
    summary: Object.fromEntries(Object.entries(groups).map(([group, value]) => [group, Array.isArray(value) ? value.length : 0])),
    displayGroups: buildDisplayGroups(groups),
    sourceHealth: sourceHealthFromEntries(entries),
    warnings: warningsFromEntries(entries),
    unavailableGroups,
    realDataRequired: true
  };
}

export async function getMysekaiFullContext(region: RegionId) {
  const context = await getExternalContext(region, "mysekai");
  const sourceGroups = context.groups as Record<string, unknown[]>;
  const groups: Record<string, unknown[]> = {
    ...sourceGroups,
    // Compatibility aliases for older web clients.
    mysekaiFixtureInfos: sourceGroups.mysekaiFixtures ?? [],
    mysekaiFixtureGenres: sourceGroups.mysekaiFixtureMainGenres ?? []
  };
  const groupedPreview = Object.fromEntries(Object.entries(groups).map(([key, value]) => [
    key,
    {
      count: Array.isArray(value) ? value.length : 0,
      sample: Array.isArray(value) ? value.slice(0, 5) : []
    }
  ]));
  return {
    ...context,
    assets: {
      thumbnailBaseUrl: `${sekaiBestAssetBase}/${regionAssetDir[region]}/mysekai/thumbnail`,
      fixtureBaseUrl: `${sekaiBestAssetBase}/${regionAssetDir[region]}/mysekai/fixture`,
      materialBaseUrl: `${sekaiBestAssetBase}/${regionAssetDir[region]}/mysekai/material`,
      assetCandidates: [
        `${moeAssetBase}/${regionAssetDir[region]}/mysekai`,
        `${moeOverseasAssetBase}/${regionAssetDir[region]}/mysekai`,
        `${sekaiBestAssetBase}/${regionAssetDir[region]}/mysekai`
      ]
    },
    summary: {
      fixtures: Array.isArray(groups.mysekaiFixtures) ? groups.mysekaiFixtures.length : 0,
      blueprints: Array.isArray(groups.mysekaiBlueprints) ? groups.mysekaiBlueprints.length : 0,
      materials: Array.isArray(groups.mysekaiMaterials) ? groups.mysekaiMaterials.length : 0,
      gates: Array.isArray(groups.mysekaiGates) ? groups.mysekaiGates.length : 0,
      gateLevels: Array.isArray(groups.mysekaiGateLevels) ? groups.mysekaiGateLevels.length : 0,
      canvasBonuses: Array.isArray(groups.cardMysekaiCanvasBonuses) ? groups.cardMysekaiCanvasBonuses.length : 0,
      fixtureLimits: Array.isArray(groups.eventMysekaiFixtureGameCharacterPerformanceBonusLimits) ? groups.eventMysekaiFixtureGameCharacterPerformanceBonusLimits.length : 0
    },
    groupedPreview,
    calculator: {
      supportedInputs: ["cards", "area-items", "character-ranks", "mysekai-canvas", "mysekai-gates", "mysekai-fixtures"],
      publicEndpoint: "/api/tools/mysekai-calc",
      authenticatedEndpoint: "/api/me/tools/mysekai-calc",
      officialMasterGroups: [
        "areaItemLevels",
        "cardEpisodes",
        "masterLessons",
        "mysekaiGates",
        "mysekaiGateLevels",
        "cardMysekaiCanvasBonuses",
        "mysekaiFixtureGameCharacterGroupPerformanceBonuses",
        "eventMysekaiFixtureGameCharacterPerformanceBonusLimits"
      ],
      formulaStatus: "v2 uses verified master fields where present and reports estimates/missing fields separately"
    },
    realDataRequired: true
  };
}

export async function getStoryFullContext(region: RegionId, storyType: string, storyId: string) {
  const paths = metadataCollections.stories;
  const entries = await fetchManyMetadata(region, paths);
  const matches = resolveStoryMatches(entries, storyType, storyId);
  const source = entries.find((entry) => !entry.unavailableReason)?.source ?? metadataSource(region, paths[0]);
  const relationRows = storyType === "eventStories"
    ? await fetchMetadataFile<unknown[]>(region, "events.json").then((result) => result.data.map(asRecord)).catch(() => [])
    : storyType === "cardEpisodes"
      ? await fetchMetadataFile<unknown[]>(region, "cards.json").then((result) => result.data.map(asRecord)).catch(() => [])
      : [];
  const relationRecord = storyType === "eventStories"
    ? relationRows.find((row) => String(row.id ?? row.eventId) === storyId)
    : storyType === "cardEpisodes"
      ? relationRows.find((row) => String(row.id ?? row.cardId) === String(asRecord(matches[0]?.raw).cardId ?? ""))
      : undefined;
  const displayTitle = String(relationRecord?.name ?? relationRecord?.title ?? relationRecord?.prefix ?? asRecord(matches[0]?.raw).title ?? asRecord(matches[0]?.raw).name ?? storyId);
  const relationAssetbundleName = String(relationRecord?.assetbundleName ?? "");
  const storyImageCandidates = storyType === "eventStories" && relationAssetbundleName
    ? regionAssetCandidates(region, `event_story/${relationAssetbundleName}/screen_image/banner_event_story.webp`)
    : storyType === "cardEpisodes" && relationAssetbundleName
      ? regionAssetCandidates(region, `thumbnail/chara/${relationAssetbundleName}_normal.webp`)
      : [];
  const scenarioInfo = findScenarioInfo(region, matches, storyType, storyId);
  const scenarioAssetCandidates = matches.flatMap((match) => {
    const raw = match.raw as Record<string, unknown>;
    const assetbundleName = String(raw.assetbundleName ?? raw.scenarioId ?? storyId);
    return [
      `${sekaiBestAssetBase}/${regionAssetDir[region]}/scenario/${assetbundleName}.asset`,
      `${sekaiBestAssetBase}/${regionAssetDir[region]}/scenario/${assetbundleName}/${assetbundleName}.asset`,
      `${sekaiBestAssetBase}/${regionAssetDir[region]}/scenario/${assetbundleName}.json`
    ];
  });
  const chapters = matches.flatMap((match) => {
    const raw = asRecord(match.raw);
    const candidates = [raw.episodes, raw.chapters, raw.eventStoryEpisodes, raw.unitStoryEpisodes, raw.specialStoryEpisodes];
    const list = candidates.find(Array.isArray) as unknown[] | undefined;
    if (list) {
      return list.flatMap((chapter, index) => {
        const chapterRecord = asRecord(chapter);
        const episodes = firstArrayField(chapterRecord, ["episodes", "unitStoryEpisodes"]);
        if (episodes.length) return episodes.map((episode, episodeIndex) => ({
          ...previewItem(episode, match.group, episodeIndex),
          storyType: match.group,
          chapterId: String(chapterRecord.id ?? index + 1),
          chapterTitle: displayName(chapterRecord, `Chapter ${index + 1}`),
          episodeIndex,
          scenarioStatus: asRecord(episode).scenarioId ? "ready" : "missing-scenario"
        }));
        return [{
          ...previewItem(chapter, match.group, index),
          storyType: match.group,
          episodeIndex: index,
          scenarioStatus: chapterRecord.scenarioId ? "ready" : "missing-scenario"
        }];
      });
    }
    return [{
      ...previewItem(match.raw, match.group, match.index),
      storyType: match.group
    }];
  });
  return {
    region,
    storyType,
    storyId,
    displayTitle,
    matches,
    scenarioInfo,
    scenarioDataUrl: scenarioInfo?.scenarioDataUrl,
    proxiedScenarioDataUrl: scenarioInfo?.proxiedScenarioDataUrl,
    bannerUrl: storyImageCandidates[0] ?? scenarioInfo?.bannerUrl,
    imageCandidates: storyImageCandidates,
    imageStatus: storyImageCandidates.length ? "matched" : "reference-no-cover",
    playbackUrl: `/api/master/${region}/stories/${encodeURIComponent(storyType)}/${encodeURIComponent(storyId)}/playback`,
    playbackReadiness: {
      hasScenario: Boolean(scenarioInfo?.scenarioDataUrl),
      supportedActions: ["Talk", "Sound", "CharacterLayout", "CharacterMotion", "SpecialEffect.ChangeBackground", "basic screen effects"],
      unsupportedActionPolicy: "unsupported actions are reported in playback.unsupportedActions and do not block text playback"
    },
    scenarioAssetCandidates,
    resourceCandidates: scenarioAssetCandidates,
    chapters,
    relationHints: {
      matchCount: matches.length,
      groups: Array.from(new Set(matches.map((match) => match.group)))
    },
    files: entries.map((entry) => ({
      path: entry.path,
      count: Array.isArray(entry.data) ? entry.data.length : 0,
      unavailableReason: entry.unavailableReason,
      sourceMetadata: entry.source
    })),
    sourceMetadata: source,
    sourceHealth: sourceHealthFromEntries(entries),
    warnings: warningsFromEntries(entries),
    unavailableReason: matches.length ? undefined : "Story record not found in confirmed metadata files",
    realDataRequired: true
  };
}

export async function getStoryPlaybackContext(region: RegionId, storyType: string, storyId: string, episodeId?: string) {
  const paths = metadataCollections.stories;
  const entries = await fetchManyMetadata(region, paths);
  const matches = resolveStoryMatches(entries, storyType, storyId);
  const source = entries.find((entry) => !entry.unavailableReason)?.source ?? metadataSource(region, paths[0]);
  const scenarioInfos = matches.flatMap((match) => scenarioInfosForMatch(region, match, storyType, storyId));
  const scenarioInfo = episodeId
    ? scenarioInfos.find((item) => String(asRecord(item.raw).id ?? "") === episodeId || item.scenarioId === episodeId) ?? null
    : findScenarioInfo(region, matches, storyType, storyId);
  const warnings = warningsFromEntries(entries);
  if (!scenarioInfo?.scenarioDataUrl) {
    return {
      region,
      storyType,
      storyId,
      episodeId,
      scenarioInfo,
      scenarioData: null,
      appearCharacters: [],
      snippets: [],
      actions: [],
      mediaAssets: [],
      live2dModels: [],
      unsupportedActions: [],
      sourceMetadata: source,
      sourceHealth: sourceHealthFromEntries(entries),
      warnings,
      unavailableReason: "Story scenario asset path could not be resolved from confirmed metadata",
      realDataRequired: true
    };
  }
  let scenarioData: unknown = null;
  let parsed = null as ReturnType<typeof normalizeScenarioData> | null;
  let unavailableReason: string | undefined;
  try {
    scenarioData = await fetchJsonUrl<unknown>(scenarioInfo.scenarioDataUrl);
    const models = await getLive2dModels(region).then((result) => result.models).catch(() => []);
    parsed = normalizeScenarioData(region, scenarioInfo, scenarioData, models);
  } catch (error) {
    unavailableReason = `Story scenario asset could not be loaded: ${error instanceof Error ? error.message : String(error)}`;
  }
  return {
    region,
    storyType,
    storyId,
    episodeId: episodeId ?? String(asRecord(scenarioInfo.raw).id ?? scenarioInfo.scenarioId ?? storyId),
    episodeIndex: Math.max(0, scenarioInfos.indexOf(scenarioInfo)),
    scenarioInfo,
    scenarioData,
    appearCharacters: parsed?.appearCharacters ?? [],
    snippets: parsed?.snippets ?? [],
    actions: parsed?.actions ?? [],
    mediaAssets: parsed?.mediaAssets ?? [],
    live2dModels: parsed?.live2dModels ?? [],
    playbackVersion: parsed?.playbackVersion ?? "story-live2d-v2-reference",
    scenarioResource: parsed?.scenarioResource ?? { image: [], audio: [], video: [] },
    modelQueue: parsed?.modelQueue ?? [],
    preloadPlan: parsed?.preloadPlan ?? { region, stages: [], media: [], models: [] },
    actionSupport: parsed?.actionSupport ?? { supported: [], unsupported: [], status: {} },
    preloadStatus: parsed?.preloadStatus ?? { mediaAssets: [], live2dModels: [] },
    runtimeRequirements: parsed?.runtimeRequirements ?? [],
    playbackDiagnostics: parsed?.playbackDiagnostics ?? { playbackVersion: "story-live2d-v2-reference", actionCount: 0 },
    renderAcceptance: parsed?.renderAcceptance ?? { status: "not-applicable", serverValidation: "scenario-unavailable" },
    unsupportedActions: parsed?.unsupportedActions ?? [],
    essentialAssets: (parsed?.mediaAssets ?? []).filter((asset) => ["background", "card-still"].includes(String(asset?.kind))).slice(0, 3),
    deferredAssets: (parsed?.mediaAssets ?? []).filter((asset) => !["background", "card-still"].includes(String(asset?.kind))),
    initialActions: (parsed?.actions ?? []).slice(0, 6),
    playbackStatus: unavailableReason || !parsed?.actions?.length
      ? "missing-resource"
      : (parsed.warnings.length || parsed.unsupportedActions.length || !parsed.live2dModels.length) ? "partial-ready" : "ready",
    missingResources: parsed?.warnings ?? [],
    sourceMetadata: source,
    sourceHealth: sourceHealthFromEntries(entries),
    warnings: [...warnings, ...(parsed?.warnings ?? [])],
    unavailableReason,
    realDataRequired: true
  };
}

const storyCatalogTypes = ["eventStories", "unitStories", "cardEpisodes", "specialStories"] as const;

export async function getStoryCatalog(region: RegionId, options: { storyType?: string; page?: number; pageSize?: number; q?: string; unit?: string; characterId?: string; relatedId?: string; sort?: string } = {}) {
  const context = await getStoriesContext(region);
  const groups = context.groups as Record<string, unknown[]>;
  const [events, cards] = await Promise.all([
    fetchMetadataFile<unknown[]>(region, "events.json").then((result) => result.data.map(asRecord)).catch(() => []),
    fetchMetadataFile<unknown[]>(region, "cards.json").then((result) => result.data.map(asRecord)).catch(() => [])
  ]);
  const eventNames = new Map(events.map((row) => [String(row.id ?? row.eventId), String(row.name ?? row.title ?? "")]));
  const cardNames = new Map(cards.map((row) => [String(row.id ?? row.cardId), String(row.prefix ?? row.name ?? row.title ?? "")]));
  const eventRows = new Map(events.map((row) => [String(row.id ?? row.eventId), row]));
  const cardRows = new Map(cards.map((row) => [String(row.id ?? row.cardId), row]));
  const normalizedQuery = options.q?.trim().toLowerCase() ?? "";
  const selectedTypes = options.storyType && storyCatalogTypes.includes(options.storyType as any) ? [options.storyType] : [...storyCatalogTypes];
  const allItems = selectedTypes.flatMap((storyType) => (Array.isArray(groups[storyType]) ? groups[storyType] : []).map((value, index) => {
    const raw = asRecord(value);
    const nested = firstArrayField(raw, ["eventStoryEpisodes", "episodes", "chapters", "unitStoryEpisodes", "specialStoryEpisodes"]);
    const nestedEpisodeCount = nested.reduce((total, child) => total + Math.max(1, firstArrayField(asRecord(child), ["episodes", "unitStoryEpisodes"]).length), 0);
    const item = previewItem(value, storyType, index);
    const startAt = numeric(raw.startAt ?? raw.publishedAt ?? raw.releaseAt);
    const relatedId = raw.eventId ?? raw.cardId ?? raw.specialStoryId;
    const relationName = storyType === "eventStories" ? eventNames.get(String(raw.eventId ?? raw.id)) : storyType === "cardEpisodes" ? cardNames.get(String(raw.cardId ?? "")) : undefined;
    const relatedRecord = storyType === "eventStories" ? eventRows.get(String(raw.eventId ?? raw.id)) : storyType === "cardEpisodes" ? cardRows.get(String(raw.cardId ?? "")) : undefined;
    const relatedAssetbundleName = String(relatedRecord?.assetbundleName ?? "");
    const imageCandidates = storyType === "eventStories" && relatedAssetbundleName
      ? regionAssetCandidates(region, `event_story/${relatedAssetbundleName}/screen_image/banner_event_story.webp`)
      : storyType === "cardEpisodes" && relatedAssetbundleName
        ? regionAssetCandidates(region, `thumbnail/chara/${relatedAssetbundleName}_normal.webp`)
        : [];
    return {
      id: item.id,
      storyType,
      name: relationName ? `${relationName}${storyType === "cardEpisodes" ? ` · ${item.name}` : ""}` : item.name,
      description: String(raw.outline ?? raw.description ?? raw.summary ?? ""),
      unit: String(raw.unit ?? raw.unitId ?? ""),
      characterId: raw.gameCharacterId ?? raw.characterId,
      relatedId,
      startAt,
      chapterCount: nested.length || 1,
      episodeCount: nestedEpisodeCount || nested.length || 1,
      bannerUrl: imageCandidates[0],
      imageCandidates,
      imageStatus: imageCandidates.length ? "matched" : "reference-no-cover",
      capabilityStatus: "ready",
      raw
    };
  }));
  const filtered = allItems.filter((item) => {
    if (normalizedQuery && !`${item.id} ${item.name} ${item.description}`.toLowerCase().includes(normalizedQuery)) return false;
    if (options.unit && item.unit !== options.unit) return false;
    if (options.characterId && String(item.characterId ?? "") !== options.characterId) return false;
    if (options.relatedId && String(item.relatedId ?? "") !== options.relatedId) return false;
    return true;
  }).sort((left, right) => {
    if (options.sort === "id-asc") return Number(left.id) - Number(right.id);
    if (options.sort === "time-asc") return left.startAt - right.startAt;
    return (right.startAt - left.startAt) || (Number(right.id) - Number(left.id));
  });
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 24));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, options.page ?? 1));
  return {
    region,
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: filtered.length,
    totalPages,
    capabilityStatus: context.warnings.length ? "partial" : "ready",
    warnings: context.warnings
  };
}

function numeric(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function virtualLiveVoiceAsset(region: RegionId, mcId: string, voiceKey?: unknown) {
  if (typeof voiceKey !== "string" || !voiceKey || !mcId) return undefined;
  const url = regionAssetUrl(region, `virtual_live/mc/voice/${mcId}/${voiceKey}.mp3`);
  return { voiceKey, url, proxiedUrl: proxyUrl(url) };
}

function normalizeMcEvent(region: RegionId, type: "spawn" | "unspawn" | "talk", raw: Record<string, unknown>, mcId: string, index: number) {
  const voice = type === "talk" ? virtualLiveVoiceAsset(region, mcId, raw.VoiceKey) : undefined;
  return {
    id: String(raw.Id ?? `${type}-${index + 1}`),
    type,
    time: numeric(raw.Time),
    duration: numeric(raw.Duration),
    character3dId: raw.Character3dId,
    headCostume3dId: raw.HeadCostume3dId,
    bodyCostume3dId: raw.BodyCostume3dId,
    motionKey: raw.MotionKey,
    facialKey: raw.FaicialKey ?? raw.FacialKey,
    serif: raw.Serif,
    voiceKey: raw.VoiceKey,
    voice,
    raw
  };
}

function parseMcScenario(region: RegionId, data: unknown, assetbundleName: string) {
  const root = asRecord(data);
  const mcId = String(root.Id ?? assetbundleName);
  const spawn = Array.isArray(root.characterSpawnEvents) ? root.characterSpawnEvents.map(asRecord) : [];
  const unspawn = Array.isArray(root.characterUnspawnEvents) ? root.characterUnspawnEvents.map(asRecord) : [];
  const talk = Array.isArray(root.characterTalkEvents) ? root.characterTalkEvents.map(asRecord) : [];
  const events = [
    ...spawn.map((item, index) => normalizeMcEvent(region, "spawn", item, mcId, index)),
    ...unspawn.map((item, index) => normalizeMcEvent(region, "unspawn", item, mcId, index)),
    ...talk.map((item, index) => normalizeMcEvent(region, "talk", item, mcId, index))
  ].sort((a, b) => a.time - b.time);
  return {
    mcId,
    events,
    summary: {
      spawn: spawn.length,
      unspawn: unspawn.length,
      talk: talk.length,
      total: events.length
    }
  };
}

function parseMcTimeline(region: RegionId, data: unknown, assetbundleName: string) {
  const root = asRecord(data);
  const parse = asRecord(root.__timelineParse);
  const meta = asRecord(parse.meta);
  const mcId = String(root.m_Name ?? meta.timelineName ?? assetbundleName);
  const characters = Array.isArray(meta.characters) ? meta.characters.map(asRecord) : [];
  const idByName = new Map(characters.map((item) => [String(item.name), item.character3dId]));
  const rawEvents = Array.isArray(parse.events) ? parse.events.map(asRecord) : [];
  const warnings: string[] = [];
  const events = rawEvents.flatMap((event, index) => {
    const type = String(event.type ?? "");
    const character3dId = typeof event.character3dId === "number"
      ? event.character3dId
      : event.character != null
        ? idByName.get(String(event.character))
        : undefined;
    if (!["spawn", "unspawn", "talk"].includes(type)) return [];
    if (typeof character3dId !== "number") {
      warnings.push(`mc_timeline event ${index + 1} missing character3dId`);
      return [];
    }
    return normalizeMcEvent(region, type as "spawn" | "unspawn" | "talk", {
      Id: index + 1,
      Time: numeric(event.start),
      Duration: numeric(event.duration),
      Character3dId: character3dId,
      MotionKey: event.motionKey,
      FaicialKey: event.facialKey,
      Serif: event.serif,
      VoiceKey: event.cueName
    }, mcId, index);
  }).sort((a, b) => a.time - b.time);
  if (!rawEvents.length) warnings.push("mc_timeline playable has no __timelineParse.events");
  return {
    mcId,
    events,
    warnings,
    summary: {
      total: events.length,
      talk: events.filter((event) => event.type === "talk").length,
      spawn: events.filter((event) => event.type === "spawn").length,
      unspawn: events.filter((event) => event.type === "unspawn").length
    }
  };
}

async function enrichVirtualLiveStep(region: RegionId, step: Record<string, unknown>, index: number, musicVocals: Record<string, unknown>[], musics: Record<string, unknown>[]) {
  const type = String(step.virtualLiveSetlistType ?? step.type ?? "");
  const assetbundleName = String(step.assetbundleName ?? "");
  if (type === "mc" || type === "mc_timeline") {
    const path = type === "mc_timeline"
      ? `virtual_live/mc/timeline/${assetbundleName}/${assetbundleName}.playable`
      : `virtual_live/mc/scenario/${assetbundleName}/${assetbundleName}.asset`;
    const scenarioUrl = assetbundleName ? regionAssetUrl(region, path) : undefined;
    const warnings: string[] = [];
    let events: ReturnType<typeof normalizeMcEvent>[] = [];
    let mcId = assetbundleName;
    let unavailableReason: string | undefined;
    let summary: Record<string, unknown> | undefined;
    if (scenarioUrl) {
      try {
        const data = await fetchJsonUrl<unknown>(scenarioUrl);
        if (type === "mc_timeline") {
          const parsed = parseMcTimeline(region, data, assetbundleName);
          events = parsed.events;
          mcId = parsed.mcId;
          summary = parsed.summary;
          warnings.push(...parsed.warnings);
        } else {
          const parsed = parseMcScenario(region, data, assetbundleName);
          events = parsed.events;
          mcId = parsed.mcId;
          summary = parsed.summary;
        }
      } catch (error) {
        unavailableReason = `MC asset could not be loaded: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else {
      unavailableReason = "MC assetbundleName is unavailable";
    }
    return {
      index,
      type,
      raw: step,
      assetbundleName,
      scenarioUrl,
      proxiedScenarioUrl: proxyUrl(scenarioUrl),
      voiceBaseUrl: mcId ? regionAssetUrl(region, `virtual_live/mc/voice/${mcId}`) : undefined,
      mcId,
      events,
      summary,
      warnings,
      unavailableReason
    };
  }
  if (type === "music") {
    const vocal = musicVocals.find((item) => String(item.id) === String(step.musicVocalId));
    const music = vocal ? musics.find((item) => String(item.id) === String(vocal.musicId)) : undefined;
    const vocalAsset = String(vocal?.assetbundleName ?? "");
    const audioUrl = vocalAsset ? regionAssetUrl(region, `music/long/${vocalAsset}/${vocalAsset}.mp3`) : undefined;
    return {
      index,
      type,
      raw: step,
      music,
      musicVocal: vocal,
      audioUrl,
      proxiedAudioUrl: proxyUrl(audioUrl),
      warnings: vocal ? [] : [`musicVocal ${String(step.musicVocalId ?? "")} not found`],
      unavailableReason: audioUrl ? undefined : "Music audio candidate could not be derived"
    };
  }
  return { index, type: type || "unknown", raw: step, warnings: [`Unsupported virtual live setlist type: ${type || "unknown"}`] };
}

export async function getVirtualLiveStepContext(region: RegionId, virtualLiveId: string, stepIndex: number) {
  const context = await getExternalContext(region, "virtualLives");
  const groups = context.groups as Record<string, unknown[]>;
  const lives = Array.isArray(groups.virtualLives) ? groups.virtualLives.map(asRecord) : [];
  const live = lives.find((item) => String(item.id ?? item.virtualLiveId) === virtualLiveId);
  if (!live) return null;
  const setlists = Array.isArray(live.virtualLiveSetlists) ? live.virtualLiveSetlists.map(asRecord) : [];
  const step = setlists[stepIndex];
  if (!step) return null;
  const [musicVocals, musics] = await Promise.all([
    fetchMetadataFile<unknown[]>(region, "musicVocals.json").then((result) => result.data.map(asRecord)).catch(() => []),
    fetchMetadataFile<unknown[]>(region, "musics.json").then((result) => result.data.map(asRecord)).catch(() => [])
  ]);
  const enriched = await enrichVirtualLiveStep(region, step, stepIndex, musicVocals, musics);
  const playbackQueue = enriched.type === "music" && enriched.proxiedAudioUrl
    ? [{ type: "music", label: String((enriched.music as any)?.title ?? `Music ${stepIndex + 1}`), url: enriched.proxiedAudioUrl }]
    : Array.isArray(enriched.events)
      ? enriched.events.flatMap((event) => {
          const url = event.type === "talk" ? event.voice?.proxiedUrl : undefined;
          return url ? [{
            type: "voice",
            label: String(event.serif ?? event.voiceKey ?? `Voice ${event.id}`),
            time: event.time,
            url
          }] : [];
        })
      : [];
  const warnings = Array.isArray(enriched.warnings) ? enriched.warnings : [];
  return {
    region,
    virtualLiveId,
    stepIndex,
    step: enriched,
    music: enriched.music,
    musicVocal: enriched.musicVocal,
    audioCandidates: enriched.proxiedAudioUrl ? [enriched.proxiedAudioUrl] : playbackQueue.map((item) => item.url),
    mcEvents: Array.isArray(enriched.events) ? enriched.events : [],
    playbackQueue,
    warnings,
    playbackStatus: enriched.unavailableReason
      ? warnings.some((warning) => String(warning).includes("__timelineParse")) ? "unsupported-format" : "missing-resource"
      : playbackQueue.length ? "ready" : "partial",
    unavailableReason: enriched.unavailableReason
  };
}

export async function getVirtualLivePlaybackContext(region: RegionId, virtualLiveId: string) {
  const context = await getExternalContext(region, "virtualLives");
  const groups = context.groups as Record<string, unknown[]>;
  const lives = Array.isArray(groups.virtualLives) ? groups.virtualLives.map(asRecord) : [];
  const setlists = Array.isArray(groups.virtualLiveSetlists) ? groups.virtualLiveSetlists.map(asRecord) : [];
  const schedules = Array.isArray(groups.virtualLiveSchedules) ? groups.virtualLiveSchedules.map(asRecord) : [];
  const rewards = Array.isArray(groups.virtualLiveRewards) ? groups.virtualLiveRewards.map(asRecord) : [];
  const live = lives.find((item) => String(item.id ?? item.virtualLiveId) === virtualLiveId) ?? null;
  const nestedSetlists = live && Array.isArray(live.virtualLiveSetlists) ? live.virtualLiveSetlists.map(asRecord) : [];
  const nestedSchedules = live && Array.isArray(live.virtualLiveSchedules) ? live.virtualLiveSchedules.map(asRecord) : [];
  const nestedRewards = live && Array.isArray(live.virtualLiveRewards) ? live.virtualLiveRewards.map(asRecord) : [];
  const liveSetlists = nestedSetlists.length
    ? nestedSetlists
    : setlists.filter((item) => String(item.virtualLiveId ?? item.virtualLiveID ?? item.liveId ?? virtualLiveId) === virtualLiveId || !item.virtualLiveId);
  const musicVocals = await fetchMetadataFile<unknown[]>(region, "musicVocals.json").then((result) => result.data.map(asRecord)).catch(() => []);
  const musics = await fetchMetadataFile<unknown[]>(region, "musics.json").then((result) => result.data.map(asRecord)).catch(() => []);
  const steps = await Promise.all(liveSetlists.map((step, index) => enrichVirtualLiveStep(region, step, index, musicVocals, musics)));
  const mcEvents = steps.flatMap((step) => Array.isArray(step.events) ? step.events.map((event) => ({ ...event, stepIndex: step.index, stepType: step.type })) : []);
  const musicSteps = steps.filter((step) => step.type === "music");
  const playbackQueue: Array<{ stepIndex: number; type: string; label: string; time?: number; url: string }> = steps.flatMap((step) => {
    if (step.type === "music" && step.proxiedAudioUrl) {
      return [{ stepIndex: step.index, type: "music", label: String((step.music as any)?.title ?? (step.music as any)?.name ?? step.assetbundleName ?? `music-${step.index + 1}`), url: step.proxiedAudioUrl }];
    }
    if (String(step.type).startsWith("mc") && Array.isArray(step.events)) {
      return step.events
        .filter((event) => event.type === "talk" && Boolean(event.voice?.proxiedUrl))
        .map((event) => ({ stepIndex: step.index, type: "voice", label: String(event.serif ?? event.voiceKey ?? `voice-${event.id}`), time: event.time, url: event.voice?.proxiedUrl ?? "" }))
        .filter((event) => event.url);
    }
    return [];
  });
  const assets = live ? {
    logoUrl: live.assetbundleName ? regionAssetUrl(region, `virtual_live/select/banner/${live.assetbundleName}/${live.assetbundleName}.webp`) : undefined,
    logoProxiedUrl: live.assetbundleName ? proxyUrl(regionAssetUrl(region, `virtual_live/select/banner/${live.assetbundleName}/${live.assetbundleName}.webp`)) : undefined,
    bannerUrl: regionAssetUrl(region, `home/banner/banner_virtuallive${virtualLiveId}/banner_virtuallive${virtualLiveId}.webp`),
    bannerProxiedUrl: proxyUrl(regionAssetUrl(region, `home/banner/banner_virtuallive${virtualLiveId}/banner_virtuallive${virtualLiveId}.webp`))
  } : {};
  const stepWarnings = steps.flatMap((step) => Array.isArray(step.warnings) ? step.warnings.map((warning) => `step ${step.index + 1}: ${warning}`) : []);
  return {
    ...context,
    virtualLiveId,
    live,
    assets,
    schedules: nestedSchedules.length ? nestedSchedules : schedules.filter((item) => String(item.virtualLiveId ?? item.liveId ?? virtualLiveId) === virtualLiveId || !item.virtualLiveId),
    rewards: nestedRewards.length ? nestedRewards : rewards.filter((item) => String(item.virtualLiveId ?? item.liveId ?? virtualLiveId) === virtualLiveId || !item.virtualLiveId),
    steps,
    mcEvents,
    musicSteps,
    playbackQueue,
    referenceSources: [
      "Sekai-World/sekai-viewer src/pages/virtual_live/VirtualLiveDetail.tsx",
      "Sekai-World/sekai-viewer src/pages/virtual_live/VirtualLiveStep.tsx",
      "Sekai-World/sekai-viewer src/pages/virtual_live/VirtualLiveStepMC.tsx",
      "Sekai-World/sekai-viewer src/pages/virtual_live/VirtualLiveStepMCTimeline.tsx",
      "Sekai-World/sekai-viewer src/pages/virtual_live/VirtualLiveStepMusic.tsx"
    ],
    referenceParity: {
      setlist: "aligned: music, mc, and mc_timeline steps are expanded separately",
      mcScenario: "aligned shape: characterSpawnEvents, characterUnspawnEvents, and characterTalkEvents are merged by Time",
      mcTimeline: "aligned shape: __timelineParse.events are normalized to spawn/unspawn/talk when present",
      audio: "aligned: MC voice and long music audio candidates are proxied with range-capable asset proxy",
      scopeBoundary: "aligned to reference virtual_live data/audio workflow: details, schedules, rewards, setlist, MC scenario, MC timeline, voice, music audio, and diagnostics"
    },
    preloadStatus: {
      queueLength: playbackQueue.length,
      musicAudioCandidates: musicSteps.filter((step) => step.proxiedAudioUrl).length,
      voiceCandidates: mcEvents.filter((event) => event.voice?.proxiedUrl).length,
      missingSteps: steps.filter((step) => step.unavailableReason).map((step) => ({ index: step.index, type: step.type, unavailableReason: step.unavailableReason }))
    },
    playbackDiagnostics: {
      stepCount: steps.length,
      mcEventCount: mcEvents.length,
      musicCount: musicSteps.length,
      queueLength: playbackQueue.length,
      degradationPolicy: "unavailable MC/music resources are skipped while the rest of the setlist remains inspectable"
    },
    playbackReadiness: {
      hasLive: Boolean(live),
      setlistCount: steps.length,
      mcCount: steps.filter((step) => String(step.type).startsWith("mc")).length,
      mcEventCount: mcEvents.length,
      musicCount: musicSteps.length,
      playableAudioCount: playbackQueue.length
    },
    warnings: [...(context.warnings ?? []), ...stepWarnings],
    unavailableReason: live ? undefined : "Virtual Live record not found in confirmed metadata",
    realDataRequired: true
  };
}

export async function getStoriesContext(region: RegionId) {
  const paths = metadataCollections.stories;
  const entries = await fetchManyMetadata(region, paths);
  const groups = Object.fromEntries(entries.map((entry) => [entry.path.replace(/\.json$/i, ""), entry.data]));
  const source = entries.find((entry) => !entry.unavailableReason)?.source ?? metadataSource(region, paths[0]);
  const displayGroups = buildDisplayGroups(groups, 20);
  const storyGroups = displayGroups.map((group) => ({
    ...group,
    previewItems: group.previewItems.map((item) => ({
      ...item,
      storyType: group.key
    }))
  }));
  return {
    region,
    type: "stories",
    groups,
    displayGroups,
    storyGroups,
    summary: Object.fromEntries(entries.map((entry) => [entry.path.replace(/\.json$/i, ""), Array.isArray(entry.data) ? entry.data.length : 0])),
    files: entries.map((entry) => ({
      path: entry.path,
      count: Array.isArray(entry.data) ? entry.data.length : 0,
      sourceMetadata: entry.source,
      unavailableReason: entry.unavailableReason
    })),
    sourceMetadata: source,
    sourceHealth: sourceHealthFromEntries(entries),
    warnings: warningsFromEntries(entries),
    unavailableGroups: entries.filter((entry) => entry.unavailableReason).map((entry) => ({
      group: entry.path.replace(/\.json$/i, ""),
      unavailableReason: entry.unavailableReason
    })),
    realDataRequired: true
  };
}

export function externalAssetSources(region: RegionId) {
  return {
    metadataPrimary: `${metadataPrimaryBase}/${region}/master`,
    metadataFallback: `${metadataFallbackBase}/${region}/master`,
    informationApi: region === "jp" || region === "cn" ? `${informationBase}/${region}/information` : "unavailable for this region",
    comicsAssets: comicsAssetBase,
    live2dAssets: live2dAssetBase,
    mysekaiAssets: `${sekaiBestAssetBase}/${regionAssetDir[region]}/mysekai`
  };
}

export function isAllowedExternalAssetUrl(value: string) {
  try {
    const url = new URL(value);
    const allowedHosts = new Set([
      "storage.sekai.best",
      "metadata.exmeaning.com",
      "metadata.pjsk.moe",
      "storage.exmeaning.com",
      "storage.pjsk.moe",
      "moe.exmeaning.com",
      "production-web.sekai.colorfulpalette.org",
      "lf3-mkcncdn-tos.dailygn.com"
    ]);
    return url.protocol === "https:" && allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}
