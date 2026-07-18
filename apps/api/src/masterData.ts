import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  getCardAssetDetail,
  getChartAssetDetail,
  getCharacterIconCandidates,
  getCollectionItemAssetDetail,
  getDisplayCollectionItem,
  getEventAssetDetail,
  getMusicAssetDetail,
  proxiedAssetUrl
} from "./assets.js";
import { config, regions, type RegionId } from "./config.js";
import { getReferenceMaster, getReferenceMasterHealth, isFormulaMasterKey, syncReferenceMasterRegion } from "./referenceMaster.js";
import { getExternalCollection } from "./externalData.js";
import { sampleCards, sampleSongs } from "./sampleData.js";
import type { Card, CardSkill, CardSkillEffect, EventInfo, EventRelatedCard, EventStoryEpisode, MasterCollection, MasterCollectionItem, Song } from "./types.js";

type RawMusic = {
  id: number;
  title: string;
  assetbundleName?: string;
  jacketAssetbundleName?: string;
  publishedAt?: number;
  categories?: Array<string | { musicCategoryName?: string; name?: string }>;
  creatorArtistId?: number;
  lyricist?: string;
  composer?: string;
  arranger?: string;
  duration?: number;
  durationSeconds?: number;
  musicTime?: number;
  secForMusicScoreMaker?: number;
  bpm?: number;
};

type RawMusicDifficulty = {
  id?: number;
  musicId: number;
  musicDifficulty: string;
  playLevel: number;
  totalNoteCount: number;
};

type RawMusicMeta = {
  musicId: number;
  duration?: number;
  durationSeconds?: number;
  musicTime?: number;
  bpm?: number;
};

type RawMusicBpm = {
  musicId: number;
  bpm?: number;
  startAt?: number;
  endAt?: number;
};

type RawCharacter = {
  id: number;
  firstName?: string;
  givenName?: string;
  firstNameEnglish?: string;
  givenNameEnglish?: string;
  unit?: string;
};

type RawCard = {
  id: number;
  cardSupplyId?: number;
  characterId?: number;
  skillId?: number;
  cardRarityType?: string;
  attr?: string;
  attribute?: string;
  prefix?: string;
  assetbundleName?: string;
  supportUnit?: string;
  cardSkillName?: string;
  specialTrainingPower1BonusFixed?: number;
  specialTrainingPower2BonusFixed?: number;
  specialTrainingPower3BonusFixed?: number;
  specialTrainingSkillId?: number;
  cardParameters?: Array<{
    cardLevel: number;
    cardParameterType: string;
    power: number;
  }> | Record<string, number[]>;
};

type RawSkillEffectDetail = {
  id?: number;
  level?: number;
  skillLevel?: number;
  activateEffectValue?: number;
  activateEffectValue2?: number;
  activateEffectValueType?: string;
  activateEffectDuration?: number;
};

type RawSkillEffect = {
  id?: number;
  skillEffectType?: string;
  activateNotesJudgmentType?: string;
  activateLife?: number;
  activateCharacterRank?: number;
  activateUnitCount?: number;
  skillEnhance?: unknown;
  skillEffectDetails?: RawSkillEffectDetail[];
};

type RawSkill = {
  id: number;
  name?: string;
  shortDescription?: string;
  description?: string;
  skillType?: string;
  activateEffectDuration?: number;
  skillEffects?: RawSkillEffect[];
};

type RawEvent = {
  id: number;
  eventType?: string;
  name?: string;
  assetbundleName?: string;
  startAt?: number;
  aggregateAt?: number;
  rankingAnnounceAt?: number;
  closedAt?: number;
};

type RawEventCard = {
  id: number;
  cardId: number;
  eventId: number;
  bonusRate?: number;
  leaderBonusRate?: number;
  isDisplayCardStory?: boolean;
};

type RawEventStoryEpisode = {
  id: number;
  episodeNo: number;
  title: string;
  assetbundleName?: string;
  scenarioId?: string;
};

type RawEventStory = {
  id: number;
  eventId: number;
  outline?: string;
  assetbundleName?: string;
  eventStoryEpisodes?: RawEventStoryEpisode[];
};

type RawMasterItem = Record<string, unknown> & {
  id?: number | string;
  name?: string;
  title?: string;
  assetbundleName?: string;
  startAt?: number;
  closedAt?: number;
  aggregateAt?: number;
  endAt?: number;
};

export type MasterCache = {
  schemaVersion: number;
  region: RegionId;
  repository: string;
  syncedAt: string;
  source: string;
  songs: Song[];
  cards: Card[];
  events: EventInfo[];
  collections?: Record<string, MasterCollectionItem[]>;
  collectionHealth?: Record<string, MasterCollectionHealth>;
};

export type MasterCollectionHealth = {
  status: "available" | "available-empty" | "not-released" | "source-unavailable" | "cache-stale";
  source: string;
  scope?: "region" | "global-reference-constant";
  count: number;
  error?: string;
};

const moesekaiLocalMasterPaths: Record<string, string> = {
  worldBloomSupportDeckBonusesWL1: path.resolve(process.cwd(), "refer", "Moesekai", "web", "public", "data", "worldBloomSupportDeckBonusesWL1.json"),
  worldBloomSupportDeckBonusesWL2: path.resolve(process.cwd(), "refer", "Moesekai", "web", "public", "data", "worldBloomSupportDeckBonusesWL2.json"),
  worldBloomSupportDeckBonusesWL3: path.resolve(process.cwd(), "refer", "Moesekai", "web", "public", "data", "worldBloomSupportDeckBonusesWL3.json")
};
const moesekaiMetadataPrimaryBase: Record<RegionId, string> = {
  jp: "https://metadata.exmeaning.com/jp/master",
  en: "https://metadata.exmeaning.com/en/master",
  tw: "https://metadata.exmeaning.com/tw/master",
  kr: "https://metadata.exmeaning.com/kr/master",
  cn: "https://metadata.exmeaning.com/cn/master"
};
const moesekaiMetadataFallbackBase: Record<RegionId, string> = {
  jp: "https://metadata.pjsk.moe/jp/master",
  en: "https://metadata.pjsk.moe/en/master",
  tw: "https://metadata.pjsk.moe/tw/master",
  kr: "https://metadata.pjsk.moe/kr/master",
  cn: "https://metadata.pjsk.moe/cn/master"
};

function metadataUrls(region: RegionId, key: string) {
  return [moesekaiMetadataPrimaryBase[region], moesekaiMetadataFallbackBase[region]]
    .map((base) => `${base}/${key}.json`);
}

export const noCurrentEvent: EventInfo = {
  id: "none",
  name: "当前没有正在进行的活动",
  eventType: "none",
  startAt: "",
  endAt: ""
};

const schemaVersion = 16;
const masterFiles = {
  musics: "master/musics.json",
  musicTags: ["master/musicTags.json", "master/musicTagRelations.json"],
  musicDifficulties: "master/musicDifficulties.json",
  musicMetas: ["master/musicMetas.json", "master/musicMeta.json"],
  musicBpms: ["master/musicBpm.json", "master/musicBpms.json"],
  gameCharacters: "master/gameCharacters.json",
  cards: "master/cards.json",
  cardSupplies: "master/cardSupplies.json",
  skills: ["master/skills.json", "master/cardSkills.json"],
  events: "master/events.json",
  eventCards: "master/eventCards.json",
  eventStories: "master/eventStories.json",
  gachas: "master/gachas.json",
  honors: "master/honors.json",
  honorGroups: "master/honorGroups.json",
  materials: "master/materials.json",
  costumes: ["master/costumes.json", "master/avatarCostumes.json"],
  stamps: "master/stamps.json",
  comics: "master/comics.json",
  eventMusics: "master/eventMusics.json",
  musicVocals: "master/musicVocals.json",
  eventDeckBonuses: "master/eventDeckBonuses.json",
  eventRarityBonusRates: "master/eventRarityBonusRates.json",
  gameCharacterUnits: "master/gameCharacterUnits.json",
  cardRarities: "master/cardRarities.json",
  cardParameters: "master/cardParameters.json",
  cardEpisodes: "master/cardEpisodes.json",
  masterLessons: "master/masterLessons.json",
  areaItemLevels: "master/areaItemLevels.json",
  ingameNotes: "master/ingameNotes.json",
  ingameCombos: "master/ingameCombos.json",
  characterRanks: "master/characterRanks.json",
  cardMysekaiCanvasBonuses: "master/cardMysekaiCanvasBonuses.json",
  mysekaiGates: "master/mysekaiGates.json",
  mysekaiGateLevels: "master/mysekaiGateLevels.json",
  eventSkillScoreUpLimits: "master/eventSkillScoreUpLimits.json",
  eventHonorBonuses: "master/eventHonorBonuses.json",
  eventCardBonusLimits: "master/eventCardBonusLimits.json",
  worldBlooms: "master/worldBlooms.json",
  worldBloomDifferentAttributeBonuses: "master/worldBloomDifferentAttributeBonuses.json",
  worldBloomSupportDeckBonuses: "master/worldBloomSupportDeckBonuses.json",
  worldBloomSupportDeckBonusesWL1: "master/worldBloomSupportDeckBonusesWL1.json",
  worldBloomSupportDeckBonusesWL2: "master/worldBloomSupportDeckBonusesWL2.json",
  worldBloomSupportDeckBonusesWL3: "master/worldBloomSupportDeckBonusesWL3.json",
  worldBloomSupportDeckUnitEventLimitedBonuses: "master/worldBloomSupportDeckUnitEventLimitedBonuses.json"
};
const failedAutoSyncUntil = new Map<RegionId, number>();
const failedAutoSyncCooldownMs = 1000 * 60 * 10;
const runningSyncs = new Map<RegionId, Promise<MasterCache>>();
const runningEventSyncs = new Map<RegionId, Promise<MasterCache | null>>();
const runningRankingAssetSyncs = new Map<RegionId, Promise<MasterCache>>();
const masterCacheMemory = new Map<RegionId, MasterCache>();
const pendingMasterCacheReads = new Map<RegionId, Promise<MasterCache | null>>();
const lastRankingAssetSyncAt = new Map<RegionId, number>();
const rankingAssetSyncIntervalMs = 1000 * 60 * 5;
const fastMasterRefresh = process.env.PJSKTOOLS_FAST_MASTER_REFRESH === "true";
const collectionCacheKeys = [
  "eventCards",
  "eventDeckBonuses",
  "eventRarityBonusRates",
  "gameCharacterUnits",
  "cardParameters",
  "cardEpisodes",
  "masterLessons",
  "areaItemLevels",
  "ingameNotes",
  "ingameCombos",
  "characterRanks",
  "cardMysekaiCanvasBonuses",
  "mysekaiGates",
  "mysekaiGateLevels",
  "eventSkillScoreUpLimits",
  "eventHonorBonuses",
  "eventCardBonusLimits",
  "worldBlooms",
  "gameCharacters",
  "worldBloomDifferentAttributeBonuses",
  "worldBloomSupportDeckBonuses",
  "worldBloomSupportDeckBonusesWL1",
  "worldBloomSupportDeckBonusesWL2",
  "worldBloomSupportDeckBonusesWL3",
  "worldBloomSupportDeckUnitEventLimitedBonuses"
];

function getApiRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? cwd : path.join(cwd, "apps", "api");
}

function getCachePath(region: RegionId) {
  return path.join(getApiRoot(), "data", "master-cache", `${region}.json`);
}

function getRegionConfig(region: RegionId) {
  const regionConfig = regions.find((item) => item.id === region);
  if (!regionConfig) throw new Error(`Unsupported region: ${region}`);
  return regionConfig;
}

function rawUrl(repository: string, filePath: string) {
  return `${config.masterRawBaseUrl}/${repository}/main/${filePath}`;
}

function masterFetchOptions() {
  return fastMasterRefresh
    ? { attempts: 1, timeoutMs: 1_500, retryDelayMs: 0 }
    : { attempts: 2, timeoutMs: 60_000, retryDelayMs: 750 };
}

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `; cause=${error.cause.name}: ${error.cause.message}` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

async function fetchJson<T>(repository: string, filePath: string): Promise<T> {
  const url = rawUrl(repository, filePath);
  let lastError: unknown;
  const options = masterFetchOptions();
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "pjsktools-local-dev" },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }
      const text = await response.text();
      if (!text.trim()) return [] as T;
      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      if (attempt < options.attempts && options.retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

async function fetchFirstAvailableJson<T>(repository: string, filePaths: string[], fallback: T): Promise<T> {
  let lastError: unknown;
  for (const filePath of filePaths) {
    try {
      return await fetchJson<T>(repository, filePath);
    } catch (error) {
      lastError = error;
    }
  }
  if (fastMasterRefresh) {
    console.warn(`Optional master files unavailable for ${repository}: ${errorSummary(lastError)}`);
  } else {
    console.warn(`Optional master files unavailable for ${repository}:`, lastError);
  }
  return fallback;
}

async function fetchMetadataFirstAvailableJson<T>(region: RegionId, repository: string, filePaths: string[], fallback: T): Promise<T> {
  for (const filePath of filePaths) {
    const key = path.posix.basename(filePath, ".json");
    try {
      return await fetchMoesekaiMaster<T>(region, key);
    } catch {
      // Continue through alternate filenames before using the GitHub compatibility fallback.
    }
  }
  return fetchFirstAvailableJson(repository, filePaths, fallback);
}

async function fetchMetadataFirst<T>(region: RegionId, key: string, repository: string, filePath: string): Promise<T> {
  try {
    return await fetchMoesekaiMaster<T>(region, key);
  } catch {
    return fetchJson<T>(repository, filePath);
  }
}

async function fetchMoesekaiMaster<T>(region: RegionId, key: string, fallback?: T): Promise<T> {
  const options = masterFetchOptions();
  let lastError: unknown;
  for (const url of metadataUrls(region, key)) {
    for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "pjsktools-reference-calculator" } });
        if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
        return JSON.parse(await response.text()) as T;
      } catch (error) {
        lastError = error;
        if (attempt < options.attempts && options.retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs * attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  if (fallback !== undefined) return fallback;
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch metadata for ${region}/${key}`);
}

async function fetchFormulaCollection(region: RegionId, repository: string, key: string, filePath: string, previous: RawMasterItem[] = []) {
  const metadataUrl = metadataUrls(region, key).join(" | ");
  try {
    const rows = await fetchMoesekaiMaster<RawMasterItem[]>(region, key);
    return {
      rows,
      health: { status: rows.length ? "available" : "available-empty", source: metadataUrl, count: rows.length } satisfies MasterCollectionHealth
    };
  } catch (metadataError) {
    try {
      const rows = await fetchJson<RawMasterItem[]>(repository, filePath);
      return {
        rows,
        health: { status: rows.length ? "available" : "available-empty", source: rawUrl(repository, filePath), count: rows.length } satisfies MasterCollectionHealth
      };
    } catch (teamError) {
      if (previous.length) {
        return {
          rows: previous,
          health: { status: "cache-stale", source: metadataUrl, count: previous.length, error: errorSummary(metadataError) } satisfies MasterCollectionHealth
        };
      }
      const notReleased = metadataError instanceof Error && metadataError.message.includes(": 404");
      return {
        rows: [],
        health: {
          status: notReleased ? "not-released" : "source-unavailable",
          source: metadataUrl,
          count: 0,
          error: `${errorSummary(metadataError)}; fallback=${errorSummary(teamError)}`
        } satisfies MasterCollectionHealth
      };
    }
  }
}

async function atomicWriteJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await rename(temporary, filePath);
}

function characterName(character?: RawCharacter) {
  if (!character) return "未知角色";
  const japaneseName = `${character.firstName ?? ""}${character.givenName ?? ""}`.trim();
  if (japaneseName) return japaneseName;
  return `${character.firstNameEnglish ?? ""} ${character.givenNameEnglish ?? ""}`.trim() || "未知角色";
}

function rarityNumber(cardRarityType?: string) {
  if (!cardRarityType) return 0;
  const match = cardRarityType.match(/\d+/);
  return match ? Number(match[0]) : cardRarityType.includes("birthday") ? 4 : 0;
}

function dateFromMillis(value?: number) {
  return value ? new Date(value).toISOString() : "";
}

function secondsFromMaybeMillis(value?: number) {
  if (!value) return undefined;
  return value > 1000 ? Math.round(value / 1000) : value;
}

function musicCategoryNames(categories: RawMusic["categories"] = []) {
  return categories
    .map((category) => (typeof category === "string" ? category : category.musicCategoryName ?? category.name ?? ""))
    .filter(Boolean);
}

function transformSongs(
  musics: RawMusic[],
  difficulties: RawMusicDifficulty[],
  metas: RawMusicMeta[] = [],
  bpms: RawMusicBpm[] = []
): Song[] {
  const difficultiesByMusic = new Map<number, RawMusicDifficulty[]>();
  for (const difficulty of difficulties) {
    const list = difficultiesByMusic.get(difficulty.musicId) ?? [];
    list.push(difficulty);
    difficultiesByMusic.set(difficulty.musicId, list);
  }
  const metasByMusic = new Map(metas.map((meta) => [meta.musicId, meta]));
  const bpmsByMusic = new Map<number, RawMusicBpm[]>();
  for (const bpm of bpms) {
    const list = bpmsByMusic.get(bpm.musicId) ?? [];
    list.push(bpm);
    bpmsByMusic.set(bpm.musicId, list);
  }

  return musics.map((music) => {
    const details = (difficultiesByMusic.get(music.id) ?? []).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const meta = metasByMusic.get(music.id);
    const bpmList = bpmsByMusic.get(music.id) ?? [];
    const bpm = music.bpm ?? meta?.bpm ?? bpmList.find((item) => typeof item.bpm === "number")?.bpm;
    const categories = musicCategoryNames(music.categories);
    return {
      id: String(music.id),
      title: music.title,
      unit: categories.join(", ") || "Project Sekai",
      difficulties: details.map((detail) => `${detail.musicDifficulty} ${detail.playLevel}`),
      difficultyDetails: details.map((detail) => ({
        id: detail.id ? String(detail.id) : undefined,
        difficulty: detail.musicDifficulty,
        playLevel: detail.playLevel,
        totalNoteCount: detail.totalNoteCount
      })),
      publishedAt: music.publishedAt ? new Date(music.publishedAt).toISOString() : "",
      assetbundleName: music.assetbundleName,
      categories,
      creatorArtistId: music.creatorArtistId,
      lyricist: music.lyricist,
      composer: music.composer,
      arranger: music.arranger,
      durationSeconds: secondsFromMaybeMillis(
        music.durationSeconds ??
          music.duration ??
          music.musicTime ??
          music.secForMusicScoreMaker ??
          meta?.durationSeconds ??
          meta?.duration ??
          meta?.musicTime
      ),
      bpm,
      jacketAssetbundleName: music.jacketAssetbundleName
    };
  });
}

function transformSkill(skill?: RawSkill): CardSkill | undefined {
  if (!skill) return undefined;
  const firstDuration = skill.skillEffects
    ?.flatMap((effect) => effect.skillEffectDetails ?? [])
    .find((detail) => typeof detail.activateEffectDuration === "number")?.activateEffectDuration;
  return {
    id: String(skill.id),
    name: skill.name,
    description: skill.description ?? skill.shortDescription,
    skillType: skill.skillType,
    duration: skill.activateEffectDuration ?? firstDuration,
    effects: skill.skillEffects?.map((effect) => ({
      id: effect.id,
      type: effect.skillEffectType,
      judgment: effect.activateNotesJudgmentType,
      activateLife: effect.activateLife,
      activateCharacterRank: effect.activateCharacterRank,
      activateUnitCount: effect.activateUnitCount,
      skillEnhance: effect.skillEnhance,
      details: effect.skillEffectDetails?.map((detail) => ({
        level: detail.level ?? detail.skillLevel,
        value: detail.activateEffectValue,
        value2: detail.activateEffectValue2,
        valueType: detail.activateEffectValueType,
        duration: detail.activateEffectDuration,
        raw: detail
      })),
      raw: effect
    }))
  };
}

function skillEnhanceValue(effect: CardSkillEffect) {
  const enhance = effect.skillEnhance;
  if (!enhance || typeof enhance !== "object") return undefined;
  const value = Number((enhance as Record<string, unknown>).activateEffectValue);
  return Number.isFinite(value) ? value : undefined;
}

export function formatCardSkillDescription(skill: CardSkill, level: number, card?: Card) {
  const template = skill.description ?? "";
  const detailFor = (effectId: number) => {
    const effect = skill.effects?.find((entry) => entry.id === effectId);
    const detail = effect?.details?.find((entry) => entry.level === level);
    return { effect, detail };
  };
  let output = template.replace(/{{(\d+);(\w+)}}/g, (match, rawId: string, type: string) => {
    if (type === "c") return card?.character ?? match;
    const { effect, detail } = detailFor(Number(rawId));
    if (!effect || !detail) return match;
    if (type === "v") return detail.value == null ? match : String(detail.value);
    if (type === "d") return detail.duration == null ? match : String(detail.duration);
    if (type === "e") return skillEnhanceValue(effect) == null ? match : String(skillEnhanceValue(effect));
    if (type === "m") {
      const enhance = skillEnhanceValue(effect);
      return detail.value == null || enhance == null ? match : String(detail.value + enhance * 5);
    }
    return match;
  });
  output = output.replace(/{{(\d+),(\d+);(\w+)}}/g, (match, firstId: string, secondId: string, type: string) => {
    const first = detailFor(Number(firstId)).detail?.value;
    const second = detailFor(Number(secondId)).detail?.value;
    if (first == null && second == null) return match;
    if (["o", "u", "s", "v"].includes(type)) return String((first ?? 0) + (second ?? 0));
    if (type === "r") return String(second ?? first);
    return match;
  });
  const unresolvedPlaceholders = [...new Set(output.match(/{{[^}]+}}/g) ?? [])];
  return {
    text: unresolvedPlaceholders.length ? "技能参数缺失" : output,
    unresolvedPlaceholders,
    status: unresolvedPlaceholders.length ? "missing-data" as const : "matched" as const
  };
}

function withFormattedSkill(skill: CardSkill | undefined, card: Card) {
  if (!skill) return undefined;
  const results = [1, 2, 3, 4].map((level) => [String(level), formatCardSkillDescription(skill, level, card)] as const);
  const unresolvedPlaceholders = [...new Set(results.flatMap(([, result]) => result.unresolvedPlaceholders))];
  return {
    ...skill,
    formattedDescriptions: Object.fromEntries(results.map(([level, result]) => [level, result.text])) as Record<"1" | "2" | "3" | "4", string>,
    skillFormatTrace: {
      status: unresolvedPlaceholders.length ? "missing-data" as const : "matched" as const,
      unresolvedPlaceholders,
      referenceFormulaId: "Moesekai.formatSkillDescription"
    }
  };
}

function fillSkillEffectIds(skill: CardSkill | undefined, referenceSkill?: RawSkill) {
  if (!skill || !referenceSkill?.skillEffects) return skill;
  return {
    ...skill,
    effects: skill.effects?.map((effect, index) => {
      const referenceEffect = referenceSkill.skillEffects?.[index];
      return {
        ...effect,
        id: effect.id ?? referenceEffect?.id,
        skillEnhance: effect.skillEnhance ?? referenceEffect?.skillEnhance,
        details: effect.details?.map((detail) => {
          const referenceDetail = referenceEffect?.skillEffectDetails?.find((entry) => (entry.level ?? entry.skillLevel) === detail.level);
          return {
            ...detail,
            value: detail.value ?? referenceDetail?.activateEffectValue,
            value2: detail.value2 ?? referenceDetail?.activateEffectValue2,
            duration: detail.duration ?? referenceDetail?.activateEffectDuration
          };
        })
      };
    })
  };
}

function transformCards(cards: RawCard[], characters: RawCharacter[], skills: RawSkill[] = []): Card[] {
  const charactersById = new Map(characters.map((character) => [character.id, character]));
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  return cards.map((card) => {
    const character = charactersById.get(card.characterId ?? 0);
    const skill = transformSkill(skillsById.get(card.skillId ?? 0));
    const specialTrainingSkill = transformSkill(skillsById.get(card.specialTrainingSkillId ?? 0));
    const cardParameters = Array.isArray(card.cardParameters)
      ? card.cardParameters
      : Object.entries(card.cardParameters ?? {}).flatMap(([cardParameterType, powers]) =>
          powers.map((power, index) => ({ cardLevel: index + 1, cardParameterType, power })));
    return {
      id: String(card.id),
      cardSupplyId: card.cardSupplyId == null ? undefined : String(card.cardSupplyId),
      characterId: card.characterId == null ? undefined : String(card.characterId),
      character: characterName(character),
      characterUnit: character?.unit,
      title: card.prefix || card.assetbundleName || `Card ${card.id}`,
      rarity: rarityNumber(card.cardRarityType),
      attribute: card.attr ?? card.attribute ?? "unknown",
      skillId: card.skillId ? String(card.skillId) : undefined,
      skill: skill ? { ...skill, name: skill.name ?? card.cardSkillName } : undefined,
      assetbundleName: card.assetbundleName,
      supportUnit: card.supportUnit ?? character?.unit,
      cardRarityType: card.cardRarityType,
      specialTrainingPower1BonusFixed: card.specialTrainingPower1BonusFixed,
      specialTrainingPower2BonusFixed: card.specialTrainingPower2BonusFixed,
      specialTrainingPower3BonusFixed: card.specialTrainingPower3BonusFixed,
      specialTrainingSkillId: card.specialTrainingSkillId == null ? undefined : String(card.specialTrainingSkillId),
      specialTrainingSkill,
      cardParameters: cardParameters.map((parameter) => ({
        cardLevel: parameter.cardLevel,
        cardParameterType: parameter.cardParameterType,
        power: parameter.power
      }))
    };
  });
}

function transformStoryEpisodes(episodes: RawEventStoryEpisode[] = []): EventStoryEpisode[] {
  return episodes
    .map((episode) => ({
      id: String(episode.id),
      episodeNo: episode.episodeNo,
      title: episode.title,
      assetbundleName: episode.assetbundleName,
      scenarioId: episode.scenarioId
    }))
    .sort((a, b) => a.episodeNo - b.episodeNo);
}

function transformEvents(events: RawEvent[], eventCards: RawEventCard[], eventStories: RawEventStory[], cards: Card[]): EventInfo[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const eventCardsByEvent = new Map<number, RawEventCard[]>();
  for (const eventCard of eventCards) {
    const list = eventCardsByEvent.get(eventCard.eventId) ?? [];
    list.push(eventCard);
    eventCardsByEvent.set(eventCard.eventId, list);
  }
  const storiesByEvent = new Map(eventStories.map((story) => [story.eventId, story]));

  return events.map((event) => ({
    id: String(event.id),
    name: event.name || `Event ${event.id}`,
    eventType: event.eventType ?? "unknown",
    startAt: dateFromMillis(event.startAt),
    endAt: dateFromMillis(event.closedAt ?? event.aggregateAt),
    aggregateAt: dateFromMillis(event.aggregateAt),
    rankingAnnounceAt: dateFromMillis(event.rankingAnnounceAt),
    assetbundleName: event.assetbundleName,
    storyOutline: storiesByEvent.get(event.id)?.outline,
    storyEpisodes: transformStoryEpisodes(storiesByEvent.get(event.id)?.eventStoryEpisodes),
    relatedCards: (eventCardsByEvent.get(event.id) ?? [])
      .map((eventCard): EventRelatedCard | null => {
        const card = cardsById.get(String(eventCard.cardId));
        if (!card) return null;
        return {
          ...card,
          bonusRate: eventCard.bonusRate,
          leaderBonusRate: eventCard.leaderBonusRate,
          isDisplayCardStory: eventCard.isDisplayCardStory
        };
      })
      .filter((card): card is EventRelatedCard => Boolean(card))
  }));
}

function transformCollection(items: RawMasterItem[] = []): MasterCollectionItem[] {
  return items.map((item) => ({
    id: String(item.id ?? item.assetbundleName ?? randomUUID()),
    name: item.name,
    title: item.title,
    assetbundleName: item.assetbundleName,
    startAt: dateFromMillis(item.startAt),
    endAt: dateFromMillis(item.closedAt ?? item.aggregateAt ?? item.endAt),
    raw: item
  }));
}

function rawCollection(items: MasterCollectionItem[] | undefined): RawMasterItem[] {
  return (items ?? []).map((item) => item.raw as RawMasterItem).filter(Boolean);
}

async function getMoesekaiLocalMasterCollection(region: RegionId, type: string): Promise<MasterCollection | null> {
  const filePath = moesekaiLocalMasterPaths[type];
  if (!filePath) return null;
  try {
    const raw = JSON.parse(await readFile(filePath, "utf-8")) as RawMasterItem[];
    const items = transformCollection(Array.isArray(raw) ? raw : []);
    if (!items.length) return null;
    return {
      region,
      type,
      source: "moesekai-local-reference",
      syncedAt: new Date(0).toISOString(),
      items: items.map((item) => getDisplayCollectionItem(region, type, item)),
      sourceMetadata: {
        sourceType: "reference-local",
        primaryUrl: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
        sourceProject: "Moesekai web/public/data local reference fallback",
        fetchedAt: new Date(0).toISOString(),
        scope: "global-reference-constant"
      }
    };
  } catch {
    return null;
  }
}

export async function readMasterCache(region: RegionId): Promise<MasterCache | null> {
  const cached = masterCacheMemory.get(region);
  if (cached) return cached;
  const pending = pendingMasterCacheReads.get(region);
  if (pending) return pending;
  const read = readFile(getCachePath(region), "utf-8")
    .then((content) => {
      const parsed = JSON.parse(content) as MasterCache;
      masterCacheMemory.set(region, parsed);
      return parsed;
    })
    .catch(() => null)
    .finally(() => pendingMasterCacheReads.delete(region));
  pendingMasterCacheReads.set(region, read);
  return read;
}

async function writeMasterCache(region: RegionId, cache: MasterCache) {
  await atomicWriteJson(getCachePath(region), cache);
  masterCacheMemory.set(region, cache);
}

function normalizeMasterCache(cache: MasterCache): MasterCache {
  const collections = { ...(cache.collections ?? {}) };
  for (const key of collectionCacheKeys) {
    collections[key] ??= [];
  }
  return {
    ...cache,
    schemaVersion,
    collections,
    events: cache.events ?? []
  };
}

async function getFreshMaster(region: RegionId): Promise<MasterCache | null> {
  const cache = await readMasterCache(region);
  if (cache?.schemaVersion === schemaVersion) return normalizeMasterCache(cache);
  if (cache && (failedAutoSyncUntil.get(region) ?? 0) > Date.now()) return normalizeMasterCache(cache);
  try {
    const running = runningSyncs.get(region);
    if (running) return await running;
    const sync = syncMasterRegion(region).finally(() => runningSyncs.delete(region));
    runningSyncs.set(region, sync);
    return await sync;
  } catch (error) {
    console.warn(fastMasterRefresh ? `Master sync failed for ${region}: ${errorSummary(error)}` : error);
    if (cache) failedAutoSyncUntil.set(region, Date.now() + failedAutoSyncCooldownMs);
    return cache ? normalizeMasterCache(cache) : null;
  }
}

export async function getSongs(region: RegionId): Promise<Song[]> {
  const songs = (await getFreshMaster(region))?.songs ?? sampleSongs;
  return songs.map((song) => ({ ...song, assets: getMusicAssetDetail(region, song) }));
}

export async function getSongDetail(region: RegionId, musicId: string): Promise<(Song & { region: RegionId }) | null> {
  const song = (await getSongs(region)).find((item) => item.id === musicId);
  return song ? { ...song, region } : null;
}

export async function getCards(region: RegionId): Promise<Card[]> {
  const cards = (await getFreshMaster(region))?.cards ?? sampleCards;
  return cards.map((card) => ({ ...card, assets: getCardAssetDetail(region, card) }));
}

export async function getCardDetail(region: RegionId, cardId: string): Promise<(Card & { region: RegionId }) | null> {
  const card = (await getCards(region)).find((item) => item.id === cardId);
  return card ? { ...card, region } : null;
}

export async function getEvents(region: RegionId): Promise<EventInfo[]> {
  return (await getFreshMaster(region))?.events ?? [];
}

export async function getCurrentEvent(region: RegionId): Promise<EventInfo & { region: RegionId }> {
  const events = await getEvents(region);
  const now = Date.now();
  const active = events.find((event) => {
    const start = Date.parse(event.startAt);
    const end = Date.parse(event.endAt);
    return Number.isFinite(start) && Number.isFinite(end) && start <= now && now <= end;
  });
  return { ...(active ?? noCurrentEvent), region };
}

export async function getEventDetail(region: RegionId, eventId: string): Promise<(EventInfo & { region: RegionId }) | null> {
  const event = (await getEvents(region)).find((item) => item.id === eventId);
  return event ? { ...event, region } : null;
}

export async function getMasterCollection(region: RegionId, type: string): Promise<MasterCollection> {
  const external = await getExternalCollection(region, type);
  if (external) {
    return {
      ...external,
      items: external.items.map((item) => getDisplayCollectionItem(region, type, item))
    };
  }
  const cache = await getFreshMaster(region);
  const rawItems = cache?.collections?.[type] ?? [];
  if (rawItems.length === 0) {
    if (isFormulaMasterKey(type)) {
      const referenceRows = await getReferenceMaster<RawMasterItem>(region, type);
      if (referenceRows.length) {
        return {
          region,
          type,
          source: metadataUrls(region, type).join(" | "),
          syncedAt: (await getReferenceMasterHealth(region)).syncedAt,
          items: transformCollection(referenceRows).map((item) => getDisplayCollectionItem(region, type, item)),
          sourceMetadata: {
            sourceType: "metadata",
            primaryUrl: metadataUrls(region, type)[0],
            fallbackUrl: metadataUrls(region, type)[1],
            sourceProject: "Moesekai metadata region master",
            fetchedAt: (await getReferenceMasterHealth(region)).syncedAt ?? new Date(0).toISOString(),
            scope: "region"
          }
        };
      }
    }
    const localReference = await getMoesekaiLocalMasterCollection(region, type);
    if (localReference) return localReference;
  }
  const items = rawItems.map((item) => getDisplayCollectionItem(region, type, item));
  return {
    region,
    type,
    source: cache?.source ?? "unavailable",
    syncedAt: cache?.syncedAt,
    items,
    unavailableReason: rawItems.length === 0 ? "真实 master 集合暂不可用或该区服暂无数据" : undefined
  };
}

export async function getMasterCollectionItem(region: RegionId, type: string, id: string) {
  const collection = await getMasterCollection(region, type);
  const item = collection.items.find((entry) => entry.id === id);
  return item ? { ...item, region, type, source: collection.source, syncedAt: collection.syncedAt } : null;
}

function rawIdEquals(item: MasterCollectionItem, key: string, id: string) {
  const value = (item.raw as Record<string, unknown>)[key];
  return value != null && String(value) === id;
}

function rawArray(item: MasterCollectionItem, key: string) {
  const value = (item.raw as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function gachaIncludesCard(item: MasterCollectionItem, cardId: string) {
  return rawArray(item, "gachaDetails").some((detail) => {
    if (!detail || typeof detail !== "object") return false;
    return String((detail as Record<string, unknown>).cardId) === cardId;
  });
}

function dateOverlaps(startA?: string, endA?: string, startB?: string, endB?: string) {
  const aStart = Date.parse(startA ?? "");
  const aEnd = Date.parse(endA ?? "");
  const bStart = Date.parse(startB ?? "");
  const bEnd = Date.parse(endB ?? "");
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

async function relatedGachasForEvent(region: RegionId, event: EventInfo) {
  const gachas = await getMasterCollection(region, "gachas");
  return gachas.items.filter((item) => rawIdEquals(item, "eventId", event.id) || dateOverlaps(item.startAt, item.endAt, event.startAt, event.endAt));
}

async function relatedEventsForCard(region: RegionId, cardId: string) {
  return (await getEvents(region)).filter((event) => event.relatedCards?.some((card) => card.id === cardId));
}

async function relatedGachasForCard(region: RegionId, cardId: string) {
  const gachas = await getMasterCollection(region, "gachas");
  return gachas.items.filter((item) => gachaIncludesCard(item, cardId));
}

export async function getMusicRelations(region: RegionId, musicId: string) {
  const [vocals, eventMusics] = await Promise.all([
    getMasterCollection(region, "musicVocals"),
    getMasterCollection(region, "eventMusics")
  ]);
  const matchedEventMusics = eventMusics.items.filter((item) => rawIdEquals(item, "musicId", musicId));
  const events = await getEvents(region);
  return {
    region,
    musicId,
    musicVocals: vocals.items.filter((item) => rawIdEquals(item, "musicId", musicId)),
    eventMusics: matchedEventMusics,
    relatedEvents: matchedEventMusics
      .map((item) => events.find((event) => rawIdEquals(item, "eventId", event.id)))
      .filter((event): event is EventInfo => Boolean(event)),
    sources: {
      musicVocals: vocals.source,
      eventMusics: eventMusics.source
    }
  };
}

export async function getEventRelations(region: RegionId, eventId: string) {
  const [eventMusics, gachas] = await Promise.all([
    getMasterCollection(region, "eventMusics"),
    getMasterCollection(region, "gachas")
  ]);
  const event = await getEventDetail(region, eventId);
  const songs = await getSongs(region);
  const matchedEventMusics = eventMusics.items.filter((item) => rawIdEquals(item, "eventId", eventId));
  return {
    region,
    eventId,
    eventMusics: matchedEventMusics,
    relatedSongs: matchedEventMusics
      .map((item) => songs.find((song) => rawIdEquals(item, "musicId", song.id)))
      .filter((song): song is Song => Boolean(song)),
    relatedCards: (event?.relatedCards ?? []).map((card) => ({
      ...card,
      assets: getCardAssetDetail(region, card)
    })),
    relatedGachas: event
      ? gachas.items.filter((item) => rawIdEquals(item, "eventId", eventId) || dateOverlaps(item.startAt, item.endAt, event.startAt, event.endAt))
      : gachas.items.filter((item) => rawIdEquals(item, "eventId", eventId)),
    sources: {
      eventMusics: eventMusics.source,
      relatedGachas: gachas.source
    }
  };
}

export async function getMusicFullDetail(region: RegionId, musicId: string) {
  const song = await getSongDetail(region, musicId);
  if (!song) return null;
  const [relations] = await Promise.all([getMusicRelations(region, musicId)]);
  return {
    region,
    music: song,
    assets: getMusicAssetDetail(region, song),
    charts: (song.difficultyDetails ?? []).map((detail) => getChartAssetDetail(region, song, detail.difficulty)),
    relations,
    realDataRequired: true
  };
}

export async function getCardFullDetail(region: RegionId, cardId: string) {
  const card = await getCardDetail(region, cardId);
  if (!card) return null;
  const [relatedEvents, relatedGachas, referenceSkills] = await Promise.all([
    relatedEventsForCard(region, cardId),
    relatedGachasForCard(region, cardId),
    getReferenceMaster<RawSkill & Record<string, unknown>>(region, "skills")
  ]);
  const referenceById = new Map(referenceSkills.map((skill) => [String(skill.id), skill]));
  const skill = fillSkillEffectIds(card.skill, card.skill ? referenceById.get(card.skill.id) : undefined);
  const specialTrainingSkill = fillSkillEffectIds(card.specialTrainingSkill, card.specialTrainingSkill ? referenceById.get(card.specialTrainingSkill.id) : undefined);
  const displayCard = {
    ...card,
    skill: withFormattedSkill(skill, card),
    specialTrainingSkill: withFormattedSkill(specialTrainingSkill, card)
  };
  return {
    region,
    card: displayCard,
    assets: getCardAssetDetail(region, card),
    relations: {
      relatedEvents,
      relatedGachas
    },
    realDataRequired: true
  };
}

export async function getEventFullDetail(region: RegionId, eventId: string) {
  const event = await getEventDetail(region, eventId);
  if (!event) return null;
  const relations = await getEventRelations(region, eventId);
  return {
    region,
    event,
    assets: getEventAssetDetail(region, event),
    relations,
    realDataRequired: true
  };
}

export async function getCollectionFullDetail(region: RegionId, type: string, id: string) {
  const item = await getMasterCollectionItem(region, type, id);
  if (!item) return null;
  const raw = item.raw as Record<string, unknown>;
  const costumeCardIds = type === "costumes" && Array.isArray(raw.cardIds) ? new Set(raw.cardIds.map(String)) : undefined;
  const relatedCards = Array.isArray(raw.gachaDetails)
    ? (await getCards(region)).filter((card) => gachaIncludesCard(item, card.id))
    : costumeCardIds
      ? (await getCards(region)).filter((card) => costumeCardIds.has(card.id))
      : [];
  return {
    region,
    type,
    item: getDisplayCollectionItem(region, type, item),
    assets: getCollectionItemAssetDetail(region, type, item),
    relations: {
      relatedCards
    },
    realDataRequired: true
  };
}

const androidCatalogTypes = new Set(["gachas", "honors", "materials", "costumes", "stamps", "comics"]);

function proxyCatalogUrl(value: unknown) {
  return typeof value === "string" && value.trim() ? proxiedAssetUrl(value) : undefined;
}

function typedCatalogAssets(value: unknown) {
  const assets = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const url = (key: string) => proxyCatalogUrl(assets[key]);
  const imageCandidates = Array.isArray(assets.imageCandidates)
    ? Array.from(new Set(assets.imageCandidates.map(proxyCatalogUrl).filter((item): item is string => Boolean(item))))
    : [];
  return {
    imageUrl: url("imageUrl"), thumbnailUrl: url("thumbnailUrl"), imageCandidates,
    logoUrl: url("logoUrl"), bannerUrl: url("bannerUrl"), screenUrl: url("screenUrl"),
    degreeMainUrl: url("degreeMainUrl"), degreeSubUrl: url("degreeSubUrl"), rankMainUrl: url("rankMainUrl"),
    scrollUrl: url("scrollUrl"), frameUrl: url("frameUrl"), source: typeof assets.source === "string" ? assets.source : undefined
  };
}

function typedCostumeParts(value: unknown) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([partType, variants]) => Array.isArray(variants) ? [{
    partType,
    variants: variants.filter((entry) => entry && typeof entry === "object").map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        colorId: typeof row.colorId === "number" ? row.colorId : undefined,
        colorName: typeof row.colorName === "string" ? row.colorName : undefined,
        assetbundleName: typeof row.assetbundleName === "string" ? row.assetbundleName : undefined
      };
    })
  }] : []);
}

function typedCollectionItem(type: string, value: unknown) {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const raw = item.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {};
  const strings = (key: string) => Array.isArray(item[key]) ? (item[key] as unknown[]).map(String) : [];
  const facets = Array.isArray(item.facets) ? item.facets.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const facet = value as Record<string, unknown>;
    return typeof facet.key === "string" && Array.isArray(facet.values)
      ? [{ key: facet.key, values: facet.values.map(String) }]
      : [];
  }) : [];
  const common = {
    id: String(item.id ?? ""), type,
    name: String(item.name ?? item.title ?? `${type} ${item.id ?? ""}`),
    title: typeof item.title === "string" ? item.title : undefined,
    description: typeof item.description === "string" ? item.description : undefined,
    category: typeof item.category === "string" ? item.category : undefined,
    rarity: typeof item.rarity === "string" ? item.rarity : undefined,
    characterId: typeof item.characterId === "number" ? item.characterId : undefined,
    startAt: typeof item.startAt === "string" ? item.startAt : undefined,
    endAt: typeof item.endAt === "string" ? item.endAt : undefined,
    relatedCardIds: strings("relatedCardIds"),
    assets: typedCatalogAssets(item.assets),
    facets
  };
  if (type === "gachas") return { ...common, gachaType: typeof raw.gachaType === "string" ? raw.gachaType : common.category };
  if (type === "honors") return { ...common, honorRarity: typeof raw.honorRarity === "string" ? raw.honorRarity : common.rarity, groupId: typeof raw.groupId === "number" ? raw.groupId : undefined };
  if (type === "materials") return { ...common, materialType: typeof raw.materialType === "string" ? raw.materialType : common.category };
  if (type === "costumes") return {
    ...common,
    costumeNumber: typeof item.costumeNumber === "number" ? item.costumeNumber : undefined,
    designer: typeof item.designer === "string" ? item.designer : undefined,
    gender: typeof item.gender === "string" ? item.gender : undefined,
    source: typeof item.source === "string" ? item.source : undefined,
    partTypes: strings("partTypes"),
    characterIds: Array.isArray(item.characterIds) ? item.characterIds.filter((id): id is number => typeof id === "number") : [],
    parts: typedCostumeParts(item.parts),
    assetStatus: typeof item.assetStatus === "string" ? item.assetStatus : undefined
  };
  if (type === "stamps") return { ...common, stampType: typeof raw.stampType === "string" ? raw.stampType : common.category };
  return { ...common, comicType: typeof raw.comicType === "string" ? raw.comicType : common.category };
}

export async function getAndroidCatalog(region: RegionId, type: string, query: MasterCatalogQuery = {}) {
  if (!androidCatalogTypes.has(type)) return null;
  const page = await getMasterCatalog(region, type, query);
  return { ...page, items: page.items.map((item) => typedCollectionItem(type, item)) };
}

export async function getAndroidCatalogDetail(region: RegionId, type: string, id: string) {
  if (!androidCatalogTypes.has(type)) return null;
  const detail = await getCollectionFullDetail(region, type, id);
  if (!detail) return null;
  return {
    region, type,
    item: typedCollectionItem(type, detail.item),
    assets: typedCatalogAssets(detail.assets),
    relatedCards: detail.relations.relatedCards.map((card) => ({
      id: card.id, title: card.title, character: card.character, characterId: card.characterId,
      rarity: card.rarity, attribute: card.attribute, characterUnit: card.characterUnit,
      supportUnit: card.supportUnit, assets: card.assets
    }))
  };
}

export async function syncMasterRegion(region: RegionId): Promise<MasterCache> {
  const regionConfig = getRegionConfig(region);
  const existingCache = await readMasterCache(region);
  const previousCollections = existingCache?.collections ?? {};
  let collectionHealth: Record<string, MasterCollectionHealth> = {};
  let musics: RawMusic[];
  let musicDifficulties: RawMusicDifficulty[];
  let musicTags: RawMasterItem[];
  let musicMetas: RawMusicMeta[];
  let musicBpms: RawMusicBpm[];
  let gameCharacters: RawCharacter[];
  let cards: RawCard[];
  let cardSupplies: RawMasterItem[];
  let skills: RawSkill[];
  let events: RawEvent[];
  let eventCards: RawEventCard[];
  let eventStories: RawEventStory[];
  let gachas: RawMasterItem[];
  let honors: RawMasterItem[];
  let honorGroups: RawMasterItem[];
  let materials: RawMasterItem[];
  let costumes: RawMasterItem[];
  let stamps: RawMasterItem[];
  let comics: RawMasterItem[];
  let eventMusics: RawMasterItem[];
  let musicVocals: RawMasterItem[];
  let eventDeckBonuses: RawMasterItem[];
  let eventRarityBonusRates: RawMasterItem[];
  let gameCharacterUnitsCollection: RawMasterItem[];
  let cardRarities: RawMasterItem[];
  let cardParameters: RawMasterItem[];
  let cardEpisodes: RawMasterItem[];
  let masterLessons: RawMasterItem[];
  let areaItemLevels: RawMasterItem[];
  let ingameNotes: RawMasterItem[];
  let ingameCombos: RawMasterItem[];
  let characterRanks: RawMasterItem[];
  let cardMysekaiCanvasBonuses: RawMasterItem[];
  let mysekaiGates: RawMasterItem[];
  let mysekaiGateLevels: RawMasterItem[];
  let eventSkillScoreUpLimits: RawMasterItem[];
  let eventHonorBonuses: RawMasterItem[];
  let eventCardBonusLimits: RawMasterItem[];
  let worldBlooms: RawMasterItem[];
  let worldBloomDifferentAttributeBonuses: RawMasterItem[];
  let worldBloomSupportDeckBonuses: RawMasterItem[];
  let worldBloomSupportDeckBonusesWL1: RawMasterItem[];
  let worldBloomSupportDeckBonusesWL2: RawMasterItem[];
  let worldBloomSupportDeckBonusesWL3: RawMasterItem[];
  let worldBloomSupportDeckUnitEventLimitedBonuses: RawMasterItem[];

  try {
    const baseResults = await Promise.all([
      fetchMetadataFirst<RawMusic[]>(region, "musics", regionConfig.repository, masterFiles.musics),
      fetchMetadataFirst<RawMusicDifficulty[]>(region, "musicDifficulties", regionConfig.repository, masterFiles.musicDifficulties),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, masterFiles.musicTags, []),
      fetchMetadataFirstAvailableJson<RawMusicMeta[]>(region, regionConfig.repository, masterFiles.musicMetas, []),
      fetchMetadataFirstAvailableJson<RawMusicBpm[]>(region, regionConfig.repository, masterFiles.musicBpms, []),
      fetchMetadataFirst<RawCharacter[]>(region, "gameCharacters", regionConfig.repository, masterFiles.gameCharacters),
      fetchMetadataFirst<RawCard[]>(region, "cards", regionConfig.repository, masterFiles.cards),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.cardSupplies], []),
      fetchMetadataFirstAvailableJson<RawSkill[]>(region, regionConfig.repository, masterFiles.skills, []),
      fetchMetadataFirst<RawEvent[]>(region, "events", regionConfig.repository, masterFiles.events),
      fetchMetadataFirst<RawEventCard[]>(region, "eventCards", regionConfig.repository, masterFiles.eventCards),
      fetchMetadataFirst<RawEventStory[]>(region, "eventStories", regionConfig.repository, masterFiles.eventStories),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.gachas], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.honors], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.honorGroups], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.materials], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, masterFiles.costumes, []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.stamps], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.comics], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.eventMusics], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.musicVocals], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.eventDeckBonuses], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.eventRarityBonusRates], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.gameCharacterUnits], []),
      fetchMetadataFirstAvailableJson<RawMasterItem[]>(region, regionConfig.repository, [masterFiles.cardRarities], [])
    ]);
    [
      musics,
      musicDifficulties,
      musicTags,
      musicMetas,
      musicBpms,
      gameCharacters,
      cards,
      cardSupplies,
      skills,
      events,
      eventCards,
      eventStories,
      gachas,
      honors,
      honorGroups,
      materials,
      costumes,
      stamps,
      comics,
      eventMusics,
      musicVocals,
      eventDeckBonuses,
      eventRarityBonusRates,
      gameCharacterUnitsCollection,
      cardRarities
    ] = baseResults;

    const exactResults = await Promise.all([
      fetchFormulaCollection(region, regionConfig.repository, "cardParameters", masterFiles.cardParameters, rawCollection(previousCollections.cardParameters)),
      fetchFormulaCollection(region, regionConfig.repository, "cardEpisodes", masterFiles.cardEpisodes, rawCollection(previousCollections.cardEpisodes)),
      fetchFormulaCollection(region, regionConfig.repository, "masterLessons", masterFiles.masterLessons, rawCollection(previousCollections.masterLessons)),
      fetchFormulaCollection(region, regionConfig.repository, "areaItemLevels", masterFiles.areaItemLevels, rawCollection(previousCollections.areaItemLevels)),
      fetchFormulaCollection(region, regionConfig.repository, "ingameNotes", masterFiles.ingameNotes, rawCollection(previousCollections.ingameNotes)),
      fetchFormulaCollection(region, regionConfig.repository, "ingameCombos", masterFiles.ingameCombos, rawCollection(previousCollections.ingameCombos)),
      fetchFormulaCollection(region, regionConfig.repository, "characterRanks", masterFiles.characterRanks, rawCollection(previousCollections.characterRanks)),
      fetchFormulaCollection(region, regionConfig.repository, "cardMysekaiCanvasBonuses", masterFiles.cardMysekaiCanvasBonuses, rawCollection(previousCollections.cardMysekaiCanvasBonuses)),
      fetchFormulaCollection(region, regionConfig.repository, "mysekaiGates", masterFiles.mysekaiGates, rawCollection(previousCollections.mysekaiGates)),
      fetchFormulaCollection(region, regionConfig.repository, "mysekaiGateLevels", masterFiles.mysekaiGateLevels, rawCollection(previousCollections.mysekaiGateLevels)),
      fetchFormulaCollection(region, regionConfig.repository, "eventSkillScoreUpLimits", masterFiles.eventSkillScoreUpLimits, rawCollection(previousCollections.eventSkillScoreUpLimits)),
      fetchFormulaCollection(region, regionConfig.repository, "eventHonorBonuses", masterFiles.eventHonorBonuses, rawCollection(previousCollections.eventHonorBonuses)),
      fetchFormulaCollection(region, regionConfig.repository, "eventCardBonusLimits", masterFiles.eventCardBonusLimits, rawCollection(previousCollections.eventCardBonusLimits)),
      fetchFormulaCollection(region, regionConfig.repository, "worldBlooms", masterFiles.worldBlooms, rawCollection(previousCollections.worldBlooms)),
      fetchFormulaCollection(region, regionConfig.repository, "worldBloomDifferentAttributeBonuses", masterFiles.worldBloomDifferentAttributeBonuses, rawCollection(previousCollections.worldBloomDifferentAttributeBonuses)),
      fetchFormulaCollection(region, regionConfig.repository, "worldBloomSupportDeckBonuses", masterFiles.worldBloomSupportDeckBonuses, rawCollection(previousCollections.worldBloomSupportDeckBonuses)),
      fetchFormulaCollection(region, regionConfig.repository, "worldBloomSupportDeckBonusesWL1", masterFiles.worldBloomSupportDeckBonusesWL1, rawCollection(previousCollections.worldBloomSupportDeckBonusesWL1)),
      fetchFormulaCollection(region, regionConfig.repository, "worldBloomSupportDeckBonusesWL2", masterFiles.worldBloomSupportDeckBonusesWL2, rawCollection(previousCollections.worldBloomSupportDeckBonusesWL2)),
      fetchFormulaCollection(region, regionConfig.repository, "worldBloomSupportDeckBonusesWL3", masterFiles.worldBloomSupportDeckBonusesWL3, rawCollection(previousCollections.worldBloomSupportDeckBonusesWL3)),
      fetchFormulaCollection(region, regionConfig.repository, "worldBloomSupportDeckUnitEventLimitedBonuses", masterFiles.worldBloomSupportDeckUnitEventLimitedBonuses, rawCollection(previousCollections.worldBloomSupportDeckUnitEventLimitedBonuses))
    ]);
    [
      cardParameters,
      cardEpisodes,
      masterLessons,
      areaItemLevels,
      ingameNotes,
      ingameCombos,
      characterRanks,
      cardMysekaiCanvasBonuses,
      mysekaiGates,
      mysekaiGateLevels,
      eventSkillScoreUpLimits,
      eventHonorBonuses,
      eventCardBonusLimits,
      worldBlooms,
      worldBloomDifferentAttributeBonuses,
      worldBloomSupportDeckBonuses,
      worldBloomSupportDeckBonusesWL1,
      worldBloomSupportDeckBonusesWL2,
      worldBloomSupportDeckBonusesWL3,
      worldBloomSupportDeckUnitEventLimitedBonuses
    ] = exactResults.map((result) => result.rows);
    collectionHealth = Object.fromEntries([
      "cardParameters", "cardEpisodes", "masterLessons", "areaItemLevels", "ingameNotes", "ingameCombos", "characterRanks", "cardMysekaiCanvasBonuses", "mysekaiGates", "mysekaiGateLevels",
      "eventSkillScoreUpLimits", "eventHonorBonuses", "eventCardBonusLimits", "worldBlooms", "worldBloomDifferentAttributeBonuses",
      "worldBloomSupportDeckBonuses", "worldBloomSupportDeckBonusesWL1", "worldBloomSupportDeckBonusesWL2", "worldBloomSupportDeckBonusesWL3",
      "worldBloomSupportDeckUnitEventLimitedBonuses"
    ].map((key, index) => [key, exactResults[index].health]));
  } catch (error) {
    const existing = await readMasterCache(region);
    if (!existing) throw error;
    console.warn(fastMasterRefresh
      ? `Master sync for ${region} fell back to existing cache: ${errorSummary(error)}`
      : `Master sync for ${region} fell back to existing cache:`, error);
    const preserved: MasterCache = normalizeMasterCache({
      ...existing,
      syncedAt: existing.syncedAt,
      events: existing.events ?? []
    });
    await writeMasterCache(region, preserved);
    try {
      await syncReferenceMasterRegion(region);
    } catch (referenceError) {
      console.warn(`Reference master sync failed for ${region}: ${errorSummary(referenceError)}`);
    }
    return preserved;
  }

  const honorGroupsById = new Map(honorGroups.map((group) => [String(group.id), group]));
  const enrichedHonors = honors.map((honor) => ({
    ...honor,
    honorGroup: honorGroupsById.get(String(honor.groupId))
  }));
  const transformedCards = transformCards(cards, gameCharacters, skills);
  const cache: MasterCache = {
    schemaVersion,
    region,
    repository: regionConfig.repository,
    syncedAt: new Date().toISOString(),
    source: `${moesekaiMetadataPrimaryBase[region]} (metadata.pjsk.moe, local cache, and Team-Haruki compatibility fallbacks)`,
    songs: transformSongs(musics, musicDifficulties, musicMetas, musicBpms),
    cards: transformedCards,
    events: transformEvents(events, eventCards, eventStories, transformedCards),
    collections: {
      gachas: transformCollection(gachas),
      musicTags: transformCollection(musicTags),
      cardSupplies: transformCollection(cardSupplies),
      honors: transformCollection(enrichedHonors),
      honorGroups: transformCollection(honorGroups),
      materials: transformCollection(materials),
      costumes: transformCollection(costumes),
      stamps: transformCollection(stamps),
      comics: transformCollection(comics),
      eventMusics: transformCollection(eventMusics),
      musicVocals: transformCollection(musicVocals),
      gameCharacters: transformCollection(gameCharacters),
      eventDeckBonuses: transformCollection(eventDeckBonuses),
      eventRarityBonusRates: transformCollection(eventRarityBonusRates),
      gameCharacterUnits: transformCollection(gameCharacterUnitsCollection),
      cardRarities: transformCollection(cardRarities),
      cardParameters: transformCollection(cardParameters),
      cardEpisodes: transformCollection(cardEpisodes),
      masterLessons: transformCollection(masterLessons),
      areaItemLevels: transformCollection(areaItemLevels),
      ingameNotes: transformCollection(ingameNotes),
      ingameCombos: transformCollection(ingameCombos),
      characterRanks: transformCollection(characterRanks),
      cardMysekaiCanvasBonuses: transformCollection(cardMysekaiCanvasBonuses),
      mysekaiGates: transformCollection(mysekaiGates),
      mysekaiGateLevels: transformCollection(mysekaiGateLevels),
      eventSkillScoreUpLimits: transformCollection(eventSkillScoreUpLimits),
      eventHonorBonuses: transformCollection(eventHonorBonuses),
      eventCardBonusLimits: transformCollection(eventCardBonusLimits),
      worldBlooms: transformCollection(worldBlooms),
      worldBloomDifferentAttributeBonuses: transformCollection(worldBloomDifferentAttributeBonuses),
      worldBloomSupportDeckBonuses: transformCollection(worldBloomSupportDeckBonuses),
      worldBloomSupportDeckBonusesWL1: transformCollection(worldBloomSupportDeckBonusesWL1),
      worldBloomSupportDeckBonusesWL2: transformCollection(worldBloomSupportDeckBonusesWL2),
      worldBloomSupportDeckBonusesWL3: transformCollection(worldBloomSupportDeckBonusesWL3),
      worldBloomSupportDeckUnitEventLimitedBonuses: transformCollection(worldBloomSupportDeckUnitEventLimitedBonuses)
    },
    collectionHealth
  };

  await writeMasterCache(region, cache);
  try {
    await syncReferenceMasterRegion(region);
  } catch (error) {
    console.warn(`Reference master sync failed for ${region}: ${errorSummary(error)}`);
  }
  return cache;
}

export type MasterCatalogQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: "id-asc" | "id-desc" | "name-asc" | "name-desc" | "start-asc" | "start-desc";
  partType?: string;
  source?: string;
  rarity?: string;
  gender?: string;
  characterId?: number;
  unit?: string;
  category?: string;
  attribute?: string;
  eventTypes?: string[];
  eventUnits?: string[];
  bonusCharacterIds?: number[];
  bannerCharacterIds?: number[];
  bonusAttributes?: string[];
  musicTags?: string[];
  categories?: string[];
  characterIds?: number[];
  units?: string[];
  supportUnits?: string[];
  attributes?: string[];
  rarities?: string[];
  supplyTypes?: string[];
  skillTypes?: string[];
  gachaTypes?: string[];
  honorTypes?: string[];
  groupOnce?: boolean;
  materialTypes?: string[];
  usableOnly?: boolean;
  partTypes?: string[];
  sources?: string[];
  genders?: string[];
  relatedOnly?: boolean;
  stampTypes?: string[];
  comicTypes?: string[];
};

const stableCatalogVersionTypes = new Set(["gachas", "honors", "materials", "costumes", "stamps", "comics"]);

function canonicalizeForDigest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeForDigest);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeForDigest(item)])
    );
  }
  return value;
}

export function stableCatalogMasterVersion(type: string, items: MasterCollectionItem[], version = schemaVersion) {
  const payload = JSON.stringify(canonicalizeForDigest({ type, items }));
  const digest = createHash("sha256").update(payload).digest("hex").slice(0, 24);
  return `${version}:${digest}`;
}

function catalogStartTime(item: { startAt?: string }) {
  const timestamp = Date.parse(item.startAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

type CatalogFilterGroup<T> = {
  key: string;
  label: string;
  selected: string[];
  values: (item: T) => string[];
  match?: "any" | "all";
  labelOf?: (value: string) => string;
};

const unitLabels: Record<string, string> = {
  light_sound: "Leo/need",
  idol: "MORE MORE JUMP!",
  street: "Vivid BAD SQUAD",
  theme_park: "Wonderlands×Showtime",
  school_refusal: "25时，在Nightcord。",
  piapro: "Virtual Singer",
  ln: "Leo/need",
  mmj: "MORE MORE JUMP!",
  vbs: "Vivid BAD SQUAD",
  ws: "Wonderlands×Showtime",
  "25ji": "25时，在Nightcord。",
  vs: "Virtual Singer",
  mixed: "混合"
};

const valueLabels: Record<string, string> = {
  cool: "Cool",
  cute: "Cute",
  happy: "Happy",
  mysterious: "Mysterious",
  pure: "Pure",
  rarity_1: "1★",
  rarity_2: "2★",
  rarity_3: "3★",
  rarity_4: "4★",
  rarity_birthday: "生日",
  marathon: "马拉松",
  cheerful_carnival: "欢乐嘉年华",
  world_bloom: "世界绽放",
  mv: "MV",
  mv_2d: "2D MV",
  original: "原创歌曲",
  image: "静态影像",
  male: "男性",
  female: "女性",
  body: "衣装",
  hair: "发型",
  head: "头饰",
  card: "卡牌",
  shop: "商店",
  event: "活动",
  mission: "任务",
  distribution: "发放",
  normal: "常驻",
  limited: "限定"
};

const attributeColors: Record<string, string> = {
  cool: "#4455dd",
  cute: "#ff6699",
  happy: "#ffaa00",
  mysterious: "#bb88ff",
  pure: "#44dd88"
};

function defaultFilterLabel(value: string) {
  return unitLabels[value] ?? valueLabels[value] ?? value.replaceAll("_", " ");
}

function filterIcon(region: RegionId, key: string, value: string) {
  if (key.toLowerCase().includes("character")) {
    return { iconKey: `character:${value}`, iconCandidates: getCharacterIconCandidates(region, value) };
  }
  if (key === "units" || key === "eventUnits" || key === "supportUnits" || key === "musicTags") {
    return { iconKey: `unit:${value}`, iconCandidates: [] };
  }
  if (key === "attributes" || key === "bonusAttributes") {
    return { iconKey: `attribute:${value}`, iconCandidates: [], color: attributeColors[value] };
  }
  if (key === "rarities") return { iconKey: `rarity:${value}`, iconCandidates: [] };
  return { iconCandidates: [] as string[] };
}

function matchesFilterGroup<T>(item: T, group: CatalogFilterGroup<T>) {
  if (!group.selected.length) return true;
  const itemValues = group.values(item);
  return group.match === "all"
    ? group.selected.every((value) => itemValues.includes(value))
    : group.selected.some((value) => itemValues.includes(value));
}

function catalogFilters<T>(
  region: RegionId,
  items: T[],
  query: MasterCatalogQuery,
  textOf: (item: T) => string,
  groups: CatalogFilterGroup<T>[]
) {
  const keyword = query.q?.trim().toLowerCase() ?? "";
  const searched = keyword ? items.filter((item) => textOf(item).toLowerCase().includes(keyword)) : items;
  const filtered = searched.filter((item) => groups.every((group) => matchesFilterGroup(item, group)));
  const filterMeta = {
    groups: groups.map((group) => {
      const countBase = searched.filter((item) => groups.every((candidate) => candidate.key === group.key || matchesFilterGroup(item, candidate)));
      const counts = new Map<string, number>();
      for (const item of countBase) {
        for (const value of [...new Set(group.values(item))]) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      for (const selected of group.selected) if (!counts.has(selected)) counts.set(selected, 0);
      return {
        key: group.key,
        label: group.label,
        selection: "multi" as const,
        match: group.match ?? "any",
        options: [...counts.entries()]
          .map(([value, count]) => ({
            value,
            label: group.labelOf?.(value) ?? defaultFilterLabel(value),
            count,
            ...filterIcon(region, group.key, value)
          }))
          .sort((left, right) => left.label.localeCompare(right.label))
      };
    }).filter((group) => group.options.length > 0)
  };
  const appliedFilters = Object.fromEntries(groups.filter((group) => group.selected.length).map((group) => [group.key, group.selected]));
  const facets = (item: T) => groups
    .map((group) => ({ key: group.key, values: [...new Set(group.values(item))] }))
    .filter((facet) => facet.values.length > 0);
  return { filtered, filterMeta, appliedFilters, facets };
}

function catalogPage<T extends { id: string; startAt?: string }>(items: T[], query: MasterCatalogQuery, textOf: (item: T) => string) {
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? 48), 1), 100);
  const page = Math.max(Math.trunc(query.page ?? 1), 1);
  const sorted = [...items].sort((left, right) => {
    if (query.sort === "start-asc" || query.sort === "start-desc") {
      const leftStart = catalogStartTime(left);
      const rightStart = catalogStartTime(right);
      if (leftStart == null && rightStart != null) return 1;
      if (leftStart != null && rightStart == null) return -1;
      if (leftStart != null && rightStart != null && leftStart !== rightStart) {
        return query.sort === "start-desc" ? rightStart - leftStart : leftStart - rightStart;
      }
      return query.sort === "start-desc" ? Number(right.id) - Number(left.id) : Number(left.id) - Number(right.id);
    }
    if (query.sort === "id-desc") return Number(right.id) - Number(left.id);
    if (query.sort === "name-asc") return textOf(left).localeCompare(textOf(right));
    if (query.sort === "name-desc") return textOf(right).localeCompare(textOf(left));
    return Number(left.id) - Number(right.id);
  });
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  return { items: sorted.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageSize, total, totalPages };
}

function mergedStringFilters(values?: string[], legacy?: string | number) {
  return [...new Set([...(values ?? []), ...(legacy == null || legacy === "" ? [] : [String(legacy)])])];
}

function recordOf(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function recordValues(value: unknown, keys: string[]) {
  const raw = recordOf(value);
  return [...new Set(keys.flatMap((key) => {
    const field = raw[key];
    if (Array.isArray(field)) return field.map(String);
    return field == null || field === "" ? [] : [String(field)];
  }))];
}

function collectionRaw(item: MasterCollectionItem) {
  return recordOf(item.raw);
}

function collectionText(item: MasterCollectionItem) {
  const raw = collectionRaw(item);
  return `${item.id} ${item.name ?? ""} ${item.title ?? ""} ${item.assetbundleName ?? ""} ${String(raw.designer ?? "")} ${String(raw.source ?? "")}`;
}

export async function getMasterCatalog(region: RegionId, type: string, query: MasterCatalogQuery = {}) {
  const cache = await readMasterCache(region);
  const masterVersion = `${cache?.schemaVersion ?? schemaVersion}:${cache?.syncedAt ?? "unavailable"}`;
  if (type === "cards") {
    const baseCards = await getCards(region);
    const supplyItems = cache?.collections?.cardSupplies ?? [];
    const supplyTypes = new Map(supplyItems.map((item) => {
      const raw = collectionRaw(item);
      return [item.id, String(raw.cardSupplyType ?? raw.supplyType ?? item.name ?? item.title ?? "normal")];
    }));
    const cards = baseCards.map((card) => ({
      ...card,
      cardSupplyType: card.cardSupplyType ?? (card.cardSupplyId ? supplyTypes.get(card.cardSupplyId) : undefined) ?? "normal"
    }));
    const characterLabels = new Map(cards.filter((card) => card.characterId).map((card) => [String(card.characterId), card.character]));
    const groups: CatalogFilterGroup<(typeof cards)[number]>[] = [
      { key: "characterIds", label: "角色", selected: mergedStringFilters(query.characterIds?.map(String), query.characterId), values: (card) => card.characterId ? [card.characterId] : [], labelOf: (value) => characterLabels.get(value) ?? `角色 ${value}` },
      { key: "units", label: "组合", selected: mergedStringFilters(query.units, query.unit), values: (card) => card.characterUnit ? [card.characterUnit] : [] },
      { key: "supportUnits", label: "支援组合", selected: query.supportUnits ?? [], values: (card) => card.supportUnit ? [card.supportUnit] : [] },
      { key: "attributes", label: "属性", selected: mergedStringFilters(query.attributes, query.attribute), values: (card) => [card.attribute] },
      { key: "rarities", label: "稀有度", selected: mergedStringFilters(query.rarities, query.rarity), values: (card) => [card.cardRarityType ?? String(card.rarity)] },
      { key: "supplyTypes", label: "供给类型", selected: query.supplyTypes ?? [], values: (card) => card.cardSupplyType ? [card.cardSupplyType] : [] },
      { key: "skillTypes", label: "技能类型", selected: query.skillTypes ?? [], values: (card) => [...new Set([card.skill?.skillType, ...(card.skill?.effects?.map((effect) => effect.type) ?? [])].filter((value): value is string => Boolean(value)))] }
    ];
    const filtered = catalogFilters(region, cards, query, (card) => `${card.id} ${card.title} ${card.character} ${card.attribute} ${card.rarity}`, groups);
    const page = catalogPage(filtered.filtered, query, (card) => `${card.id} ${card.title} ${card.character}`);
    return {
      ...page,
      items: page.items.map((card) => ({
        id: card.id, title: card.title, character: card.character, characterId: card.characterId,
        characterUnit: card.characterUnit, supportUnit: card.supportUnit, rarity: card.rarity,
        cardRarityType: card.cardRarityType, attribute: card.attribute, cardSupplyType: card.cardSupplyType,
        skillTypes: [...new Set([card.skill?.skillType, ...(card.skill?.effects?.map((effect) => effect.type) ?? [])].filter(Boolean))],
        assetbundleName: card.assetbundleName, assets: card.assets, facets: filtered.facets(card)
      })),
      filterMeta: filtered.filterMeta,
      appliedFilters: filtered.appliedFilters,
      region, type, masterVersion, sourceHealth: { status: cache ? "fresh" : "missing-data", syncedAt: cache?.syncedAt ?? null }
    };
  }
  if (type === "songs") {
    const baseSongs = await getSongs(region);
    const tagItems = cache?.collections?.musicTags ?? [];
    const tagsByMusic = new Map<string, string[]>();
    for (const item of tagItems) {
      const raw = collectionRaw(item);
      const musicId = String(raw.musicId ?? raw.id ?? "");
      if (!musicId) continue;
      const tags = recordValues(raw, ["musicTag", "musicTagType", "tag", "unit"]);
      tagsByMusic.set(musicId, [...new Set([...(tagsByMusic.get(musicId) ?? []), ...tags])]);
    }
    const songs = baseSongs.map((song) => ({ ...song, musicTags: tagsByMusic.get(song.id) ?? [] }));
    const groups: CatalogFilterGroup<(typeof songs)[number]>[] = [
      { key: "musicTags", label: "组合标签", selected: mergedStringFilters(query.musicTags, query.unit), values: (song) => song.musicTags },
      { key: "categories", label: "MV / 歌曲分类", selected: mergedStringFilters(query.categories, query.category), values: (song) => song.categories ?? [] }
    ];
    const filtered = catalogFilters(region, songs, query, (song) => `${song.id} ${song.title} ${song.unit} ${(song.categories ?? []).join(" ")} ${song.musicTags.join(" ")}`, groups);
    const page = catalogPage(filtered.filtered, query, (song) => `${song.id} ${song.title}`);
    return {
      ...page,
      items: page.items.map((song) => ({ id: song.id, title: song.title, unit: song.unit, musicTags: song.musicTags, durationSeconds: song.durationSeconds, categories: song.categories, publishedAt: song.publishedAt, assetbundleName: song.assetbundleName, jacketAssetbundleName: song.jacketAssetbundleName, assets: song.assets, facets: filtered.facets(song) })),
      filterMeta: filtered.filterMeta,
      appliedFilters: filtered.appliedFilters,
      region, type, masterVersion, sourceHealth: { status: cache ? "fresh" : "missing-data", syncedAt: cache?.syncedAt ?? null }
    };
  }
  if (type === "events") {
    const events = await getEvents(region);
    const bonusItems = cache?.collections?.eventDeckBonuses ?? [];
    const characterUnitItems = cache?.collections?.gameCharacterUnits ?? [];
    const characterUnitById = new Map(characterUnitItems.map((item) => {
      const raw = collectionRaw(item);
      return [String(raw.id ?? item.id), { characterId: String(raw.gameCharacterId ?? raw.characterId ?? ""), unit: String(raw.unit ?? "") }];
    }));
    const bonusesByEvent = new Map<string, Array<{ characterId?: string; unit?: string; attribute?: string }>>();
    for (const item of bonusItems) {
      const raw = collectionRaw(item);
      const eventId = String(raw.eventId ?? "");
      if (!eventId) continue;
      const unit = characterUnitById.get(String(raw.gameCharacterUnitId ?? ""));
      const list = bonusesByEvent.get(eventId) ?? [];
      list.push({
        characterId: unit?.characterId || (raw.gameCharacterId == null ? undefined : String(raw.gameCharacterId)),
        unit: unit?.unit || (raw.unit == null ? undefined : String(raw.unit)),
        attribute: raw.cardAttr == null && raw.attribute == null ? undefined : String(raw.cardAttr ?? raw.attribute)
      });
      bonusesByEvent.set(eventId, list);
    }
    const enriched = events.map((event) => {
      const bonusRows = bonusesByEvent.get(event.id) ?? [];
      const relatedUnits = [...new Set((event.relatedCards ?? []).map((card) => card.characterUnit).filter((value): value is string => Boolean(value)))];
      const bannerCard = [...(event.relatedCards ?? [])].sort((left, right) => right.rarity - left.rarity)[0];
      return {
        ...event,
        eventUnit: relatedUnits.length === 1 ? relatedUnits[0] : relatedUnits.length > 1 ? "mixed" : undefined,
        bonusCharacterIds: [...new Set(bonusRows.map((row) => row.characterId).filter((value): value is string => Boolean(value)))],
        bonusAttributes: [...new Set(bonusRows.map((row) => row.attribute).filter((value): value is string => Boolean(value)))],
        bannerCharacterId: bannerCard?.characterId,
        assets: getEventAssetDetail(region, event)
      };
    });
    const characterLabels = new Map((await getCards(region)).filter((card) => card.characterId).map((card) => [String(card.characterId), card.character]));
    const groups: CatalogFilterGroup<(typeof enriched)[number]>[] = [
      { key: "eventTypes", label: "活动类型", selected: query.eventTypes ?? [], values: (event) => [event.eventType] },
      { key: "eventUnits", label: "活动组合", selected: query.eventUnits ?? [], values: (event) => event.eventUnit ? [event.eventUnit] : [] },
      { key: "bonusCharacterIds", label: "加成角色", selected: query.bonusCharacterIds?.map(String) ?? [], values: (event) => event.bonusCharacterIds, match: "all", labelOf: (value) => characterLabels.get(value) ?? `角色 ${value}` },
      { key: "bannerCharacterIds", label: "看板角色", selected: query.bannerCharacterIds?.map(String) ?? [], values: (event) => event.bannerCharacterId ? [event.bannerCharacterId] : [], labelOf: (value) => characterLabels.get(value) ?? `角色 ${value}` },
      { key: "bonusAttributes", label: "加成属性", selected: query.bonusAttributes ?? [], values: (event) => event.bonusAttributes }
    ];
    const filtered = catalogFilters(region, enriched, query, (event) => `${event.id} ${event.name} ${event.eventType}`, groups);
    const page = catalogPage(filtered.filtered, query, (event) => `${event.id} ${event.name}`);
    return {
      ...page,
      items: page.items.map((event) => ({ ...event, facets: filtered.facets(event) })),
      filterMeta: filtered.filterMeta,
      appliedFilters: filtered.appliedFilters,
      region, type, masterVersion,
      sourceHealth: { status: cache ? "fresh" : "missing-data", syncedAt: cache?.syncedAt ?? null }
    };
  }
  const collection = await getMasterCollection(region, type);
  const collectionMasterVersion = stableCatalogVersionTypes.has(type)
    ? stableCatalogMasterVersion(type, collection.items)
    : `${schemaVersion}:${collection.syncedAt ?? cache?.syncedAt ?? "unavailable"}`;
  const cards = ["gachas", "costumes", "stamps"].includes(type) ? await getCards(region) : [];
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const characterLabels = new Map(cards.filter((card) => card.characterId).map((card) => [String(card.characterId), card.character]));
  const characterUnits = new Map((cache?.collections?.gameCharacterUnits ?? []).map((item) => {
    const raw = collectionRaw(item);
    return [String(raw.id ?? item.id), { characterId: String(raw.gameCharacterId ?? raw.characterId ?? ""), unit: String(raw.unit ?? "") }];
  }));
  const relatedCards = (item: MasterCollectionItem) => {
    const raw = collectionRaw(item);
    const ids = type === "gachas"
      ? (Array.isArray(raw.gachaPickups)
          ? raw.gachaPickups.map((detail) => String(recordOf(detail).cardId ?? ""))
          : Array.isArray(raw.gachaDetails) ? raw.gachaDetails.filter((detail) => recordOf(detail).isWish === true).map((detail) => String(recordOf(detail).cardId ?? "")) : [])
      : Array.isArray(raw.cardIds) ? raw.cardIds.map(String) : [];
    return ids.map((id) => cardsById.get(id)).filter((card): card is Card => Boolean(card));
  };
  const rawStrings = (item: MasterCollectionItem, keys: string[]) => recordValues(collectionRaw(item), keys);
  const groups: CatalogFilterGroup<MasterCollectionItem>[] = [];
  if (type === "gachas") {
    groups.push(
      { key: "gachaTypes", label: "卡池类型", selected: query.gachaTypes ?? [], values: (item) => rawStrings(item, ["gachaType"]) },
      { key: "characterIds", label: "Pickup 角色", selected: mergedStringFilters(query.characterIds?.map(String), query.characterId), values: (item) => [...new Set(relatedCards(item).map((card) => card.characterId).filter((value): value is string => Boolean(value)))], labelOf: (value) => characterLabels.get(value) ?? `角色 ${value}` },
      { key: "units", label: "组合", selected: mergedStringFilters(query.units, query.unit), values: (item) => [...new Set(relatedCards(item).map((card) => card.characterUnit).filter((value): value is string => Boolean(value)))] }
    );
  } else if (type === "honors") {
    groups.push(
      { key: "honorTypes", label: "称号类型", selected: query.honorTypes ?? [], values: (item) => {
        const raw = collectionRaw(item);
        return recordValues(raw.honorGroup, ["honorType", "groupType"]);
      } },
      { key: "rarities", label: "稀有度", selected: mergedStringFilters(query.rarities, query.rarity), values: (item) => rawStrings(item, ["honorRarity"]) }
    );
  } else if (type === "materials") {
    groups.push({ key: "materialTypes", label: "素材类型", selected: query.materialTypes ?? [], values: (item) => rawStrings(item, ["materialType"]) });
  } else if (type === "costumes") {
    groups.push(
      { key: "characterIds", label: "角色", selected: mergedStringFilters(query.characterIds?.map(String), query.characterId), values: (item) => rawStrings(item, ["characterIds", "characterId"]), labelOf: (value) => characterLabels.get(value) ?? `角色 ${value}` },
      { key: "units", label: "组合", selected: mergedStringFilters(query.units, query.unit), values: (item) => [...new Set(relatedCards(item).map((card) => card.characterUnit).filter((value): value is string => Boolean(value)))] },
      { key: "partTypes", label: "部件", selected: mergedStringFilters(query.partTypes, query.partType), values: (item) => rawStrings(item, ["partTypes"]) },
      { key: "sources", label: "来源", selected: mergedStringFilters(query.sources, query.source), values: (item) => rawStrings(item, ["source"]) },
      { key: "rarities", label: "稀有度", selected: mergedStringFilters(query.rarities, query.rarity), values: (item) => rawStrings(item, ["costume3dRarity"]) },
      { key: "genders", label: "性别", selected: mergedStringFilters(query.genders, query.gender), values: (item) => rawStrings(item, ["gender"]) }
    );
  } else if (type === "stamps") {
    groups.push(
      { key: "stampTypes", label: "贴纸类型", selected: query.stampTypes ?? [], values: (item) => rawStrings(item, ["stampType"]) },
      { key: "characterIds", label: "角色", selected: mergedStringFilters(query.characterIds?.map(String), query.characterId), values: (item) => {
        const raw = collectionRaw(item);
        const direct = recordValues(raw, ["characterId", "characterId1", "characterId2", "gameCharacterId"]);
        const linked = characterUnits.get(String(raw.gameCharacterUnitId ?? ""))?.characterId;
        return [...new Set([...direct, ...(linked ? [linked] : [])])];
      }, labelOf: (value) => characterLabels.get(value) ?? `角色 ${value}` },
      { key: "units", label: "组合", selected: mergedStringFilters(query.units, query.unit), values: (item) => {
        const raw = collectionRaw(item);
        const linked = characterUnits.get(String(raw.gameCharacterUnitId ?? ""))?.unit;
        return [...new Set([...recordValues(raw, ["unit"]), ...(linked ? [linked] : [])])];
      } }
    );
  } else if (type === "comics") {
    groups.push({ key: "comicTypes", label: "漫画类型", selected: query.comicTypes ?? [], values: (item) => rawStrings(item, ["comicType"]) });
  }
  let baseItems = collection.items;
  if (type === "materials" && query.usableOnly) {
    baseItems = baseItems.filter((item) => {
      const raw = collectionRaw(item);
      return raw.canUse === true || raw.isUsable === true || raw.usable === true || raw.materialUseType != null || raw.useType != null;
    });
  }
  if (type === "costumes" && query.relatedOnly) baseItems = baseItems.filter((item) => relatedCards(item).length > 0);
  const filtered = catalogFilters(region, baseItems, query, collectionText, groups);
  let filteredItems = filtered.filtered;
  if (type === "honors" && query.groupOnce) {
    const seen = new Set<string>();
    filteredItems = filteredItems.filter((item) => {
      const key = String(collectionRaw(item).groupId ?? item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const page = catalogPage(filteredItems, query, collectionText);
  return {
    ...page,
    items: page.items.map((item) => ({ ...getDisplayCollectionItem(region, type, item), facets: filtered.facets(item) })),
    filterMeta: {
      ...filtered.filterMeta,
      toggles: [
        ...(type === "honors" ? [{ key: "groupOnce", label: "同组只显示一次", value: Boolean(query.groupOnce) }] : []),
        ...(type === "materials" ? [{ key: "usableOnly", label: "仅可使用", value: Boolean(query.usableOnly) }] : []),
        ...(type === "costumes" ? [{ key: "relatedOnly", label: "仅关联卡牌", value: Boolean(query.relatedOnly) }] : [])
      ]
    },
    appliedFilters: {
      ...filtered.appliedFilters,
      ...(query.groupOnce ? { groupOnce: true } : {}),
      ...(query.usableOnly ? { usableOnly: true } : {}),
      ...(query.relatedOnly ? { relatedOnly: true } : {})
    },
    region,
    type,
    masterVersion: collectionMasterVersion,
    sourceHealth: { status: collection.unavailableReason ? "source-unavailable" : "fresh", syncedAt: collection.syncedAt ?? null, unavailableReason: collection.unavailableReason },
    source: collection.source
  };
}

type FormulaCapabilityName = "cardCalculator" | "mysekai" | "challenge" | "worldBloom" | "eventPoint" | "areaItemRecommend" | "liveExact";

const capabilityRequirements: Record<FormulaCapabilityName, { reference?: string[]; collections?: string[] }> = {
  cardCalculator: { reference: ["cards", "skills", "cardEpisodes", "masterLessons", "areaItemLevels", "characterRanks"] },
  mysekai: { reference: ["cards", "skills", "cardEpisodes", "masterLessons", "areaItemLevels", "characterRanks", "cardMysekaiCanvasBonuses", "mysekaiGates", "mysekaiGateLevels"] },
  challenge: { reference: ["cards", "skills", "cardEpisodes", "masterLessons", "areaItemLevels", "characterRanks"] },
  worldBloom: { reference: ["worldBlooms", "worldBloomDifferentAttributeBonuses", "worldBloomSupportDeckBonuses", "worldBloomSupportDeckUnitEventLimitedBonuses"] },
  eventPoint: { reference: ["eventDeckBonuses", "eventRarityBonusRates", "eventCards"] },
  areaItemRecommend: { reference: ["cards", "skills", "cardEpisodes", "masterLessons", "areas", "areaItems", "areaItemLevels", "shopItems", "characterRanks"] },
  liveExact: { reference: ["ingameNotes", "ingameCombos"] }
};

export async function getMasterRegionStatus(region: RegionId) {
  const cache = await readMasterCache(region);
  const normalized = cache ? normalizeMasterCache(cache) : undefined;
  const referenceMaster = await getReferenceMasterHealth(region);
  const collectionHealth = { ...(normalized?.collectionHealth ?? {}) };
  for (const [key, items] of Object.entries(normalized?.collections ?? {})) {
    collectionHealth[key] ??= {
      status: cache?.schemaVersion === schemaVersion ? (items.length ? "available" : "available-empty") : "cache-stale",
      source: normalized?.source ?? "unavailable",
      count: items.length
    };
  }
  for (const key of ["worldBloomSupportDeckBonusesWL1", "worldBloomSupportDeckBonusesWL2", "worldBloomSupportDeckBonusesWL3"]) {
    if ((normalized?.collections?.[key]?.length ?? 0) === 0 && await getMoesekaiLocalMasterCollection(region, key)) {
      collectionHealth[key] = { status: "available", source: "moesekai-local-reference", scope: "global-reference-constant", count: (await getMoesekaiLocalMasterCollection(region, key))?.items.length ?? 0 };
    }
  }
  const formulaCapabilities = Object.fromEntries(Object.entries(capabilityRequirements).map(([name, requirements]) => {
    const referenceMissing = (requirements.reference ?? []).filter((key) => Number(referenceMaster.counts[key as keyof typeof referenceMaster.counts] ?? 0) === 0);
    const collectionMissing = (requirements.collections ?? []).filter((key) => (normalized?.collections?.[key]?.length ?? 0) === 0);
    const statuses = [
      ...referenceMissing.map((key) => referenceMaster.collections[key as keyof typeof referenceMaster.collections]?.status),
      ...collectionMissing.map((key) => collectionHealth[key]?.status)
    ].filter(Boolean);
    const status = !referenceMissing.length && !collectionMissing.length
      ? "matched"
      : statuses.includes("not-released") ? "not-released"
        : statuses.includes("cache-stale") ? "cache-stale" : "missing-data";
    return [name, { status, ready: status === "matched" || status === "cache-stale", referenceMissing, collectionMissing }];
  }));
  const staleCollections = Object.entries(collectionHealth).filter(([, health]) => health.status === "cache-stale").map(([key]) => key);
  const unavailableCollections = Object.entries(collectionHealth).filter(([, health]) => ["not-released", "source-unavailable"].includes(health.status)).map(([key]) => key);
  return {
    region,
    synced: Boolean(cache),
    syncedAt: cache?.syncedAt ?? null,
    schemaVersion: cache?.schemaVersion ?? null,
    currentSchemaVersion: schemaVersion,
    repository: cache?.repository ?? getRegionConfig(region).repository,
    songs: cache?.songs.length ?? 0,
    cards: cache?.cards.length ?? 0,
    events: cache?.events?.length ?? 0,
    collections: Object.fromEntries(Object.entries(normalized?.collections ?? {}).map(([key, value]) => [key, value.length])),
    referenceMaster,
    formulaCapabilities,
    sourcePolicy: {
      realtimeRanking: {
        primary: "https://rks-n.exmeaning.com/api/public/v2",
        globalFallback: "https://rks-n.pjsk.moe/api/public/v2",
        role: "public fast current ranking, top board and border snapshots"
      },
      assets: {
        primary: "Sekai.best / storage.sekai.best",
        fallback: "Uni/Haruki storage mirrors",
        role: "public game assets and thumbnails"
      },
      formulaReferenceMaster: {
        primary: "Moesekai metadata / metadata.exmeaning.com",
        fallback: "metadata.pjsk.moe, then same-region Team-Haruki raw collections where applicable",
        role: "formula reference collections and music metadata"
      },
      playerAssets: {
        primary: "Haruki Suite Public API",
        role: "public player asset import"
      },
      harukiToolbox: {
        role: "player profile/detail and ranking fallback; not the first-screen ranking fast path"
      },
      regionIsolation: "jp/en/tw/kr/cn are diagnosed independently; no ordinary cross-region fallback"
    },
    sourceHealth: { primary: normalized?.source ?? "unavailable", collections: collectionHealth },
    staleCollections: [...new Set([...staleCollections, ...referenceMaster.staleCollections])],
    unavailableCollections: [...new Set([...unavailableCollections, ...referenceMaster.unavailableCollections])]
  };
}

export async function syncAllMasterRegions() {
  const results: Array<{ region: RegionId; cache?: MasterCache; error?: string }> = [];
  for (const region of regions) {
    try {
      results.push({ region: region.id, cache: await syncMasterRegion(region.id) });
    } catch (error) {
      results.push({ region: region.id, error: errorSummary(error) });
    }
  }
  return results;
}

export async function syncEventMasterRegion(region: RegionId) {
  const existing = await readMasterCache(region);
  if (!existing) return syncMasterRegion(region);
  const [events, eventCards, eventStories] = await Promise.all([
    fetchMetadataFirst<RawEvent[]>(region, "events", existing.repository, masterFiles.events),
    fetchMetadataFirst<RawEventCard[]>(region, "eventCards", existing.repository, masterFiles.eventCards),
    fetchMetadataFirst<RawEventStory[]>(region, "eventStories", existing.repository, masterFiles.eventStories)
  ]);
  const updated: MasterCache = {
    ...existing,
    syncedAt: new Date().toISOString(),
    source: `${moesekaiMetadataPrimaryBase[region]} (metadata.pjsk.moe, local cache, and Team-Haruki compatibility fallbacks)`,
    events: transformEvents(events, eventCards, eventStories, existing.cards)
  };
  await writeMasterCache(region, updated);
  return updated;
}

export async function syncRankingAssetMasterRegion(region: RegionId): Promise<MasterCache> {
  const fullSync = runningSyncs.get(region);
  if (fullSync) return fullSync;
  const running = runningRankingAssetSyncs.get(region);
  if (running) return running;

  const sync = (async () => {
    const eventSync = runningEventSyncs.get(region);
    if (eventSync) await eventSync;
    const existing = await readMasterCache(region);
    if (!existing) return syncMasterRegion(region);

    const regionConfig = getRegionConfig(region);
    const [cards, gameCharacters, skills, events, eventCards, eventStories] = await Promise.all([
      fetchMetadataFirst<RawCard[]>(region, "cards", regionConfig.repository, masterFiles.cards),
      fetchMetadataFirst<RawCharacter[]>(region, "gameCharacters", regionConfig.repository, masterFiles.gameCharacters),
      fetchMoesekaiMaster<RawSkill[]>(region, "skills")
        .catch(() => fetchFirstAvailableJson<RawSkill[]>(regionConfig.repository, masterFiles.skills, [])),
      fetchMetadataFirst<RawEvent[]>(region, "events", regionConfig.repository, masterFiles.events),
      fetchMetadataFirst<RawEventCard[]>(region, "eventCards", regionConfig.repository, masterFiles.eventCards),
      fetchMetadataFirst<RawEventStory[]>(region, "eventStories", regionConfig.repository, masterFiles.eventStories)
    ]);
    const transformedCards = transformCards(cards, gameCharacters, skills);
    const updated: MasterCache = {
      ...existing,
      syncedAt: new Date().toISOString(),
      source: `${moesekaiMetadataPrimaryBase[region]} (metadata.pjsk.moe, local cache, and Team-Haruki compatibility fallbacks)`,
      cards: transformedCards,
      events: transformEvents(events, eventCards, eventStories, transformedCards)
    };
    await writeMasterCache(region, updated);
    lastRankingAssetSyncAt.set(region, Date.now());
    return updated;
  })().finally(() => runningRankingAssetSyncs.delete(region));

  runningRankingAssetSyncs.set(region, sync);
  return sync;
}

export function requestRankingAssetMasterSync(region: RegionId) {
  if ((failedAutoSyncUntil.get(region) ?? 0) > Date.now()) return;
  if ((lastRankingAssetSyncAt.get(region) ?? 0) + rankingAssetSyncIntervalMs > Date.now()) return;
  if (runningRankingAssetSyncs.has(region)) return;
  syncRankingAssetMasterRegion(region).catch((error) => {
    failedAutoSyncUntil.set(region, Date.now() + failedAutoSyncCooldownMs);
    if (!fastMasterRefresh) console.warn(`Ranking asset master sync failed for ${region}:`, error);
  });
}

export function requestMasterRegionSync(region: RegionId) {
  requestRankingAssetMasterSync(region);
}
