import { createHash } from "node:crypto";
import type { RegionId } from "./config.js";
import type { HarukiSyncCandidate, PlayerDataKind } from "./types.js";

const MAX_ROWS = 5_000;
const MAX_TEXT = 500;
const knownSuiteKeys = new Set([
  "userCards", "userDecks", "userGamedata", "userMusics", "userMusicResults", "userMusicAchievements",
  "userAreas", "userCharacters", "userMaterials", "userMysekaiMaterials", "userHonors", "userBonds",
  "userChallengeLiveSoloDecks", "userChallengeLiveSoloResults", "userChallengeLiveSoloStages",
  "userChallengeLiveSoloHighScoreRewards", "userWorldBloomSupportDecks", "userMysekaiCanvases",
  "userMysekaiGates", "userMysekaiFixtureGameCharacterPerformanceBonuses", "upload_time", "uploadTime",
  "userId", "region", "bindingId", "userBindingId"
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HarukiSuiteValidationError("expected-object");
  return value as Record<string, unknown>;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value == null ? {} : record(value);
}

function rows(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new HarukiSuiteValidationError("expected-array");
  if (value.length > MAX_ROWS) throw new HarukiSuiteValidationError("too-many-rows");
  return value;
}

function text(value: unknown) {
  if (value == null) return undefined;
  if (typeof value !== "string" && !(typeof value === "number" && Number.isSafeInteger(value))) {
    throw new HarukiSuiteValidationError("expected-string-or-id");
  }
  const result = String(value).trim();
  if (result.length > MAX_TEXT) throw new HarukiSuiteValidationError("text-too-long");
  return result || undefined;
}

function stringField(value: unknown, keys: string[]) {
  const source = recordOrEmpty(value);
  for (const key of keys) {
    const result = text(source[key]);
    if (result) return result;
  }
  return undefined;
}

function requiredStringField(value: unknown, keys: string[]) {
  const result = stringField(value, keys);
  if (!result) throw new HarukiSuiteValidationError(`missing-${keys[0]}`);
  return result;
}

function numberField(value: unknown, keys: string[], min = 0, max = Number.MAX_SAFE_INTEGER) {
  const source = recordOrEmpty(value);
  for (const key of keys) {
    const result = source[key];
    if (result == null) continue;
    if (typeof result !== "number" || !Number.isFinite(result) || result < min || result > max) {
      throw new HarukiSuiteValidationError("invalid-number");
    }
    return result;
  }
  return undefined;
}

function memberIds(value: unknown, max = 25) {
  const source = record(value);
  const result: string[] = [];
  for (let index = 1; index <= max; index += 1) {
    const id = text(source[`member${index}`]);
    if (id && id !== "0" && id !== "null") result.push(id);
  }
  return result;
}

function isoTime(value: unknown) {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const result = new Date(milliseconds);
    if (!Number.isFinite(result.valueOf())) throw new HarukiSuiteValidationError("invalid-time");
    return result.toISOString();
  }
  if (typeof value !== "string") throw new HarukiSuiteValidationError("invalid-time");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new HarukiSuiteValidationError("invalid-time");
  return new Date(parsed).toISOString();
}

export class HarukiSuiteValidationError extends Error {
  constructor(public readonly reason: string) {
    super(`Invalid Haruki Suite group: ${reason}`);
    this.name = "HarukiSuiteValidationError";
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${stableJson(source[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashHarukiCandidate(candidate: HarukiSyncCandidate) {
  return createHash("sha256").update(stableJson(candidate)).digest("hex");
}

export function harukiGroupIsEmpty(value: unknown): boolean {
  if (value == null || value === "" || value === 0 || value === false) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(harukiGroupIsEmpty);
  return false;
}

export function normalizeHarukiSuite(region: RegionId, value: unknown): HarukiSyncCandidate {
  const source = record(value);
  const topKeys = Object.keys(source);
  if (topKeys.length > 500) throw new HarukiSuiteValidationError("too-many-top-level-keys");
  const hasSuiteData = topKeys.some((key) => knownSuiteKeys.has(key) && !["region", "userId", "bindingId", "userBindingId"].includes(key));
  if (!hasSuiteData && ["error", "errors", "message", "detail", "statusCode"].some((key) => Object.hasOwn(source, key))) {
    throw new HarukiSuiteValidationError("upstream-error-payload");
  }
  const invalidGroups: Array<"cards" | PlayerDataKind> = [];
  let cardsPresent = Object.hasOwn(source, "userCards");
  let cards: HarukiSyncCandidate["cards"] = [];
  try {
    cards = rows(source.userCards).map((value) => {
    const cardId = requiredStringField(value, ["cardId", "id"]);
    const sourceCard = record(value);
    const episodes = rows(sourceCard.episodes).map((entry) => {
      const cardEpisodeId = requiredStringField(entry, ["cardEpisodeId", "id"]);
      const episode = record(entry);
      if (episode.isNotSkipped != null && typeof episode.isNotSkipped !== "boolean") throw new HarukiSuiteValidationError("invalid-isNotSkipped");
      return {
        cardEpisodeId,
        scenarioStatus: text(episode.scenarioStatus) ?? "",
        scenarioStatusReasons: rows(episode.scenarioStatusReasons).map((item) => text(item)).filter(Boolean) as string[],
        isNotSkipped: episode.isNotSkipped === true
      };
    });
    const specialTrainingText = (text(sourceCard.specialTrainingStatus) ?? "").toLowerCase();
    const specialTrainingStatus = ["done", "special_training", "after_training", "trained", "true", "1"].includes(specialTrainingText)
      ? "done" as const
      : ["not_doing", "not_done", "original", "false", "0"].includes(specialTrainingText) ? "not_doing" as const : "unknown" as const;
    const defaultImageText = (text(sourceCard.defaultImage) ?? "").toLowerCase();
    if (defaultImageText && !["original", "after_training", "special_training", "trained"].includes(defaultImageText)) {
      throw new HarukiSuiteValidationError("invalid-default-image");
    }
    return {
      cardId,
      level: numberField(value, ["level", "cardLevel"], 1, 100),
      masterRank: numberField(value, ["masterRank"], 0, 5),
      skillLevel: numberField(value, ["skillLevel"], 1, 4),
      specialTrainingStatus,
      defaultImage: ["after_training", "special_training", "trained"].includes(defaultImageText)
        ? "after_training" as const : "original" as const,
      episodes,
      episodesRead: episodes.some((episode) => episode.isNotSkipped || /read|done|already/i.test(episode.scenarioStatus))
    };
    });
  } catch (error) {
    if (!(error instanceof HarukiSuiteValidationError)) throw error;
    cardsPresent = false;
    cards = [];
    invalidGroups.push("cards");
  }

  const groups: Array<{ kind: PlayerDataKind; sourceKeys: string[]; data: () => unknown }> = [
    {
      kind: "area-items", sourceKeys: ["userAreas"], data: () => rows(source.userAreas).flatMap((area) =>
        rows(record(area).areaItems).flatMap((item) => {
          const areaItemId = requiredStringField(item, ["areaItemId", "id"]);
          return [{ areaId: stringField(area, ["areaId"]), areaItemId, level: numberField(item, ["level"], 0, 100) ?? 0 }];
        }))
    },
    {
      kind: "character-ranks", sourceKeys: ["userCharacters"], data: () => rows(source.userCharacters).flatMap((item) => {
        const characterId = requiredStringField(item, ["characterId", "gameCharacterId", "id"]);
        return [{ characterId, rank: numberField(item, ["characterRank", "rank"], 0, 500) ?? 0 }];
      })
    },
    {
      kind: "music-results", sourceKeys: ["userMusicResults", "userMusicAchievements", "userMusics"], data: () =>
        ["userMusicResults", "userMusicAchievements", "userMusics"].flatMap((key) => rows(source[key])).flatMap((item) => {
          const musicId = requiredStringField(item, ["musicId", "music_id", "id"]);
          return [{
            musicId, difficulty: stringField(item, ["difficulty", "musicDifficulty"]),
            clearStatus: stringField(item, ["clearStatus", "playResult", "fullComboStatus"]) ?? "clear",
            score: numberField(item, ["score", "highScore", "mvpScore"], 0)
          }];
        })
    },
    {
      kind: "materials", sourceKeys: ["userMaterials", "userMysekaiMaterials"], data: () =>
        ["userMaterials", "userMysekaiMaterials"].flatMap((key) => rows(source[key]).flatMap((item) => {
          const materialId = requiredStringField(item, ["materialId", "mysekaiMaterialId", "id"]);
          return [{ materialId, quantity: numberField(item, ["quantity", "count", "amount"], 0) ?? 0, source: key }];
        }))
    },
    {
      kind: "decks", sourceKeys: ["userDecks"], data: () => rows(source.userDecks).flatMap((item) => {
        const cardIds = memberIds(item, 5);
        if (!cardIds.length) throw new HarukiSuiteValidationError("missing-deck-members");
        return [{
          deckId: stringField(item, ["deckId", "id"]), name: stringField(item, ["name"]),
          leaderCardId: stringField(item, ["leader", "member1"]), cardIds
        }];
      })
    },
    {
      kind: "challenge-live",
      sourceKeys: ["userChallengeLiveSoloDecks", "userChallengeLiveSoloResults", "userChallengeLiveSoloStages", "userChallengeLiveSoloHighScoreRewards"],
      data: () => {
        const deck = rows(source.userChallengeLiveSoloDecks)[0];
        const result = [...rows(source.userChallengeLiveSoloResults)].sort((a, b) =>
          (numberField(b, ["highScore", "score"]) ?? 0) - (numberField(a, ["highScore", "score"]) ?? 0))[0];
        const deckSource = recordOrEmpty(deck);
        const cardIds = ["leader", "support1", "support2", "support3", "support4"]
          .map((key) => text(deckSource[key])).filter((id) => id && id !== "0") as string[];
        return {
          characterId: stringField(deck, ["characterId", "gameCharacterId"]) ?? stringField(result, ["characterId", "gameCharacterId"]),
          cardIds,
          highScore: numberField(result, ["highScore", "score"], 0),
          stageCount: rows(source.userChallengeLiveSoloStages).length,
          claimedHighScoreRewardCount: rows(source.userChallengeLiveSoloHighScoreRewards).length
        };
      }
    },
    {
      kind: "world-bloom-support", sourceKeys: ["userWorldBloomSupportDecks"], data: () =>
        rows(source.userWorldBloomSupportDecks).map((item) => ({
          eventId: requiredStringField(item, ["eventId"]),
          gameCharacterId: requiredStringField(item, ["gameCharacterId", "characterId"]),
          cardIds: memberIds(item, 25)
        }))
    },
    {
      kind: "honors", sourceKeys: ["userHonors", "userBonds"], data: () =>
        ["userHonors", "userBonds"].flatMap((key) => rows(source[key])).flatMap((item) => {
          const honorId = requiredStringField(item, ["honorId", "bondsHonorId", "id"]);
          return [{
            honorId, level: numberField(item, ["level", "honorLevel", "bondsHonorLevel"], 0, 100) ?? 1,
            kind: stringField(item, ["profileHonorType", "kind", "type"]) ?? (stringField(item, ["bondsHonorId"]) ? "bonds" : "normal")
          }];
        })
    },
    {
      kind: "profile-honors", sourceKeys: ["userHonors", "userBonds"], data: () =>
        (groups.find((group) => group.kind === "honors")?.data() as any[]).slice(0, 3).map((item, index) => ({ slot: index + 1, ...item }))
    },
    {
      kind: "mysekai-canvas", sourceKeys: ["userMysekaiCanvases"], data: () => rows(source.userMysekaiCanvases).flatMap((item) => {
        const cardId = requiredStringField(item, ["cardId", "id"]);
        return [{ cardId, powerBonusRate: numberField(item, ["powerBonusRate", "bonusRate"], 0, 100_000) }];
      })
    },
    {
      kind: "mysekai-gates", sourceKeys: ["userMysekaiGates"], data: () => rows(source.userMysekaiGates).flatMap((item) => {
        const gateId = requiredStringField(item, ["gateId", "mysekaiGateId", "id"]);
        return [{
          gateId, unit: stringField(item, ["unit", "unitType"]), level: numberField(item, ["level"], 0, 100) ?? 0,
          powerBonusRate: numberField(item, ["powerBonusRate", "bonusRate"], 0, 100_000)
        }];
      })
    },
    {
      kind: "mysekai-fixtures", sourceKeys: ["userMysekaiFixtureGameCharacterPerformanceBonuses"], data: () =>
        rows(source.userMysekaiFixtureGameCharacterPerformanceBonuses).flatMap((item) => {
          const fixtureId = requiredStringField(item, ["fixtureId", "mysekaiFixtureId", "id"]);
          return [{
            fixtureId, characterId: stringField(item, ["gameCharacterId", "characterId"]),
            totalBonusRate: numberField(item, ["totalBonusRate", "bonusRate", "performanceBonusRate"], 0, 100_000) ?? 0
          }];
        })
    }
  ];

  const userGamedata = recordOrEmpty(source.userGamedata);
  const uploadTime = isoTime(source.upload_time ?? source.uploadTime);
  const normalizedGroups: HarukiSyncCandidate["playerData"] = [];
  for (const group of groups) {
    if (!group.sourceKeys.some((key) => Object.hasOwn(source, key))) continue;
    try {
      normalizedGroups.push({ kind: group.kind, data: group.data() });
    } catch (error) {
      if (!(error instanceof HarukiSuiteValidationError)) throw error;
      invalidGroups.push(group.kind);
    }
  }
  const candidate: HarukiSyncCandidate = {
    cardsPresent,
    cards,
    playerData: normalizedGroups,
    sourceSummary: {
      userId: stringField(userGamedata, ["userIdString", "userId"]) ?? stringField(source, ["userId"]),
      region: stringField(userGamedata, ["region", "server"]) as RegionId | undefined ?? stringField(source, ["region"]) as RegionId | undefined,
      bindingId: stringField(userGamedata, ["bindingId", "userBindingId"]) ?? stringField(source, ["bindingId", "userBindingId"]),
      name: stringField(userGamedata, ["name"]),
      rank: numberField(userGamedata, ["rank"], 0, 1_000),
      uploadTime,
      unknownKeys: Object.keys(source).filter((key) => !knownSuiteKeys.has(key)).sort()
    },
    invalidGroups: [...new Set(invalidGroups)],
    upstreamVersion: ""
  };
  candidate.upstreamVersion = uploadTime ?? createHash("sha256").update(stableJson({
    region, cardsPresent: candidate.cardsPresent, cards: candidate.cards, playerData: candidate.playerData
  })).digest("hex");
  return candidate;
}

export function publicSnapshot(region: RegionId, playerUid: string, candidate: HarukiSyncCandidate) {
  return {
    schemaVersion: 1,
    source: "haruki-public" as const,
    region,
    playerUid,
    fetchedAt: new Date().toISOString(),
    upstreamUploadedAt: candidate.sourceSummary.uploadTime,
    profile: {
      name: candidate.sourceSummary.name,
      rank: candidate.sourceSummary.rank
    },
    cards: candidate.cards,
    playerData: candidate.playerData.map((group) => ({
      kind: group.kind,
      data: Array.isArray(group.data) ? group.data : [group.data]
    })),
    completeness: {
      cardsPresent: candidate.cardsPresent,
      cardCount: candidate.cards.length,
      groups: Object.fromEntries(candidate.playerData.map((group) => [group.kind, {
        present: true,
        count: Array.isArray(group.data) ? group.data.length : group.data && typeof group.data === "object" ? 1 : 0
      }]))
    },
    diagnostics: {
      unknownKeyNames: candidate.sourceSummary.unknownKeys,
      invalidGroupNames: candidate.invalidGroups
    }
  };
}
