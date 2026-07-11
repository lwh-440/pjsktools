import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  getCardAssetDetail,
  getChartAssetDetail,
  getCollectionItemAssetDetail,
  getDisplayCollectionItem,
  getEventAssetDetail,
  getMusicAssetDetail
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
const moesekaiMetadataBase: Record<RegionId, string> = {
  jp: "https://metadata.exmeaning.com/jp/master",
  en: "https://metadata.exmeaning.com/en/master",
  tw: "https://metadata.exmeaning.com/tw/master",
  kr: "https://metadata.exmeaning.com/kr/master",
  cn: "https://metadata.exmeaning.com/cn/master"
};

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
  musicDifficulties: "master/musicDifficulties.json",
  musicMetas: ["master/musicMetas.json", "master/musicMeta.json"],
  musicBpms: ["master/musicBpm.json", "master/musicBpms.json"],
  gameCharacters: "master/gameCharacters.json",
  cards: "master/cards.json",
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
    : { attempts: 3, timeoutMs: 12_000, retryDelayMs: 750 };
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

async function fetchMetadataFirst<T>(region: RegionId, key: string, repository: string, filePath: string): Promise<T> {
  try {
    return await fetchMoesekaiMaster<T>(region, key);
  } catch {
    return fetchJson<T>(repository, filePath);
  }
}

async function fetchMoesekaiMaster<T>(region: RegionId, key: string, fallback?: T): Promise<T> {
  const url = `${moesekaiMetadataBase[region]}/${key}.json`;
  const options = masterFetchOptions();
  let lastError: unknown;
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
  if (fallback !== undefined) return fallback;
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

async function fetchFormulaCollection(region: RegionId, repository: string, key: string, filePath: string, previous: RawMasterItem[] = []) {
  const metadataUrl = `${moesekaiMetadataBase[region]}/${key}.json`;
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
  try {
    const content = await readFile(getCachePath(region), "utf-8");
    return JSON.parse(content) as MasterCache;
  } catch {
    return null;
  }
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
          source: `${moesekaiMetadataBase[region]}/${type}.json`,
          syncedAt: (await getReferenceMasterHealth(region)).syncedAt,
          items: transformCollection(referenceRows).map((item) => getDisplayCollectionItem(region, type, item)),
          sourceMetadata: {
            sourceType: "metadata",
            primaryUrl: `${moesekaiMetadataBase[region]}/${type}.json`,
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
    relatedCards: event?.relatedCards ?? [],
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

export async function syncMasterRegion(region: RegionId): Promise<MasterCache> {
  const regionConfig = getRegionConfig(region);
  const existingCache = await readMasterCache(region);
  const previousCollections = existingCache?.collections ?? {};
  let collectionHealth: Record<string, MasterCollectionHealth> = {};
  let musics: RawMusic[];
  let musicDifficulties: RawMusicDifficulty[];
  let musicMetas: RawMusicMeta[];
  let musicBpms: RawMusicBpm[];
  let gameCharacters: RawCharacter[];
  let cards: RawCard[];
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
      fetchJson<RawMusic[]>(regionConfig.repository, masterFiles.musics),
      fetchJson<RawMusicDifficulty[]>(regionConfig.repository, masterFiles.musicDifficulties),
      fetchFirstAvailableJson<RawMusicMeta[]>(regionConfig.repository, masterFiles.musicMetas, []),
      fetchFirstAvailableJson<RawMusicBpm[]>(regionConfig.repository, masterFiles.musicBpms, []),
      fetchJson<RawCharacter[]>(regionConfig.repository, masterFiles.gameCharacters),
      fetchMoesekaiMaster<RawCard[]>(region, "cards"),
      fetchFirstAvailableJson<RawSkill[]>(regionConfig.repository, masterFiles.skills, []),
      fetchMetadataFirst<RawEvent[]>(region, "events", regionConfig.repository, masterFiles.events),
      fetchMetadataFirst<RawEventCard[]>(region, "eventCards", regionConfig.repository, masterFiles.eventCards),
      fetchMetadataFirst<RawEventStory[]>(region, "eventStories", regionConfig.repository, masterFiles.eventStories),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.gachas], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.honors], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.honorGroups], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.materials], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, masterFiles.costumes, []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.stamps], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.comics], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.eventMusics], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.musicVocals], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.eventDeckBonuses], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.eventRarityBonusRates], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.gameCharacterUnits], []),
      fetchFirstAvailableJson<RawMasterItem[]>(regionConfig.repository, [masterFiles.cardRarities], [])
    ]);
    [
      musics,
      musicDifficulties,
      musicMetas,
      musicBpms,
      gameCharacters,
      cards,
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
    await atomicWriteJson(getCachePath(region), preserved);
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
    source: `${moesekaiMetadataBase[region]} (Team-Haruki same-region fallback)`,
    songs: transformSongs(musics, musicDifficulties, musicMetas, musicBpms),
    cards: transformedCards,
    events: transformEvents(events, eventCards, eventStories, transformedCards),
    collections: {
      gachas: transformCollection(gachas),
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

  await atomicWriteJson(getCachePath(region), cache);
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
  sort?: "id-asc" | "id-desc" | "name-asc" | "name-desc";
  partType?: string;
  source?: string;
  rarity?: string;
  gender?: string;
  characterId?: number;
};

function catalogPage<T extends { id: string }>(items: T[], query: MasterCatalogQuery, textOf: (item: T) => string) {
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? 48), 1), 100);
  const page = Math.max(Math.trunc(query.page ?? 1), 1);
  const keyword = query.q?.trim().toLowerCase() ?? "";
  const filtered = keyword ? items.filter((item) => textOf(item).toLowerCase().includes(keyword)) : items;
  const sorted = [...filtered].sort((left, right) => {
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

export async function getMasterCatalog(region: RegionId, type: string, query: MasterCatalogQuery = {}) {
  const cache = await readMasterCache(region);
  const masterVersion = `${cache?.schemaVersion ?? schemaVersion}:${cache?.syncedAt ?? "unavailable"}`;
  if (type === "cards") {
    const cards = await getCards(region);
    const page = catalogPage(cards, query, (card) => `${card.id} ${card.title} ${card.character} ${card.attribute} ${card.rarity}`);
    return {
      ...page,
      items: page.items.map((card) => ({ id: card.id, title: card.title, character: card.character, characterId: card.characterId, rarity: card.rarity, attribute: card.attribute, assetbundleName: card.assetbundleName, assets: card.assets })),
      region, type, masterVersion, sourceHealth: { status: cache ? "fresh" : "missing-data", syncedAt: cache?.syncedAt ?? null }
    };
  }
  if (type === "songs") {
    const songs = await getSongs(region);
    const page = catalogPage(songs, query, (song) => `${song.id} ${song.title} ${song.unit} ${(song.categories ?? []).join(" ")}`);
    return {
      ...page,
      items: page.items.map((song) => ({ id: song.id, title: song.title, unit: song.unit, durationSeconds: song.durationSeconds, categories: song.categories, assetbundleName: song.assetbundleName, jacketAssetbundleName: song.jacketAssetbundleName, assets: song.assets })),
      region, type, masterVersion, sourceHealth: { status: cache ? "fresh" : "missing-data", syncedAt: cache?.syncedAt ?? null }
    };
  }
  if (type === "events") {
    const events = await getEvents(region);
    const enriched = events.map((event) => ({ ...event, assets: getEventAssetDetail(region, event) }));
    const page = catalogPage(enriched, query, (event) => `${event.id} ${event.name} ${event.eventType}`);
    return { ...page, region, type, masterVersion, sourceHealth: { status: cache ? "fresh" : "missing-data", syncedAt: cache?.syncedAt ?? null } };
  }
  const collection = await getMasterCollection(region, type);
  const filteredItems = type === "costumes" ? collection.items.filter((item) => {
    const raw = item.raw as Record<string, unknown>;
    if (query.partType && (!Array.isArray(raw.partTypes) || !raw.partTypes.map(String).includes(query.partType))) return false;
    if (query.source && String(raw.source ?? "") !== query.source) return false;
    if (query.rarity && String(raw.costume3dRarity ?? "") !== query.rarity) return false;
    if (query.gender && String(raw.gender ?? "") !== query.gender) return false;
    if (query.characterId && (!Array.isArray(raw.characterIds) || !raw.characterIds.map(Number).includes(query.characterId))) return false;
    return true;
  }) : collection.items;
  const page = catalogPage(filteredItems, query, (item) => {
    const raw = item.raw as Record<string, unknown>;
    return `${item.id} ${item.name ?? ""} ${item.title ?? ""} ${item.assetbundleName ?? ""} ${String(raw.designer ?? "")} ${String(raw.source ?? "")}`;
  });
  return {
    ...page,
    items: page.items.map((item) => getDisplayCollectionItem(region, type, item)),
    region,
    type,
    masterVersion: `${schemaVersion}:${collection.syncedAt ?? cache?.syncedAt ?? "unavailable"}`,
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
        fallback: "same-region Team-Haruki collections where applicable",
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
    source: `${moesekaiMetadataBase[region]} (Team-Haruki same-region fallback)`,
    events: transformEvents(events, eventCards, eventStories, existing.cards)
  };
  await atomicWriteJson(getCachePath(region), updated);
  return updated;
}

export function requestMasterRegionSync(region: RegionId) {
  if ((failedAutoSyncUntil.get(region) ?? 0) > Date.now()) return;
  if (runningEventSyncs.has(region)) return;
  const sync = syncEventMasterRegion(region)
    .catch((error) => {
      failedAutoSyncUntil.set(region, Date.now() + failedAutoSyncCooldownMs);
      throw error;
    })
    .finally(() => runningEventSyncs.delete(region));
  runningEventSyncs.set(region, sync);
  sync.catch(() => undefined);
}
