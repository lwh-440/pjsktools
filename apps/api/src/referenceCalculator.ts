import type { RegionId } from "./config.js";
import type { Card, CardSkill, UserCardInventoryItem } from "./types.js";
import {
  CardDetailMapEventBonus,
  CardDetailMapPower,
  CardDetailMapSkill,
  getCardUnitsLike,
  type CardDetailLike,
  type DeckCardPowerDetail,
  type DeckCardSkillDetailPrepare
} from "./formulaDetail.js";
import { getReferenceMaster } from "./referenceMaster.js";

type Row = Record<string, unknown>;
type PlayerAssets = Record<string, unknown>;

export type ExactMysekaiServiceContext = {
  playerAssets: PlayerAssets;
  canvasCardIds: Set<string>;
  gateBonuses: Array<{ mysekaiGateId: string; level: number; unit: string; powerBonusRate: number }>;
  fixtureBonuses: Array<{ gameCharacterId: string; totalBonusRate: number }>;
  trace: Row;
  missingFields: string[];
};

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function string(value: unknown) {
  return value == null ? undefined : String(value);
}

function records(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object") : [];
}

function inventoryEpisodes(owned?: Pick<UserCardInventoryItem, "episodes" | "episodesRead">) {
  if (owned?.episodes?.length) return { ids: new Set(owned.episodes.filter((episode) => episode.scenarioStatus === "already_read").map((episode) => episode.cardEpisodeId)), estimated: false };
  return { ids: undefined, estimated: owned?.episodesRead === true };
}

function rawCardParameters(rawCard: Row, level: number): [number, number, number] | undefined {
  const parameters = rawCard.cardParameters;
  if (!parameters || typeof parameters !== "object") return undefined;
  if (Array.isArray(parameters)) {
    const rows = records(parameters).filter((row) => num(row.cardLevel) === level);
    const value = (type: string) => rows.find((row) => row.cardParameterType === type);
    if (!value("param1") || !value("param2") || !value("param3")) return undefined;
    return [num(value("param1")?.power), num(value("param2")?.power), num(value("param3")?.power)];
  }
  const source = parameters as Row;
  const index = level - 1;
  const arrays = [source.param1, source.param2, source.param3];
  if (!arrays.every(Array.isArray)) return undefined;
  return arrays.map((array) => num((array as unknown[])[index])) as [number, number, number];
}

function ownedLevel(rows: Row[], idKeys: string[], target: string) {
  const row = rows.find((item) => idKeys.some((key) => string(item[key]) === target));
  return { row, level: num(row?.level ?? row?.areaItemLevel ?? row?.characterRank) };
}

function froundRatePower(rate: number, base: number) {
  return Math.fround(Math.fround(Math.fround(rate) * Math.fround(0.01)) * base);
}

export async function calculateExactCardPower(input: {
  region: RegionId;
  card: Card;
  owned?: Pick<UserCardInventoryItem, "level" | "masterRank" | "skillLevel" | "specialTrainingStatus" | "defaultImage" | "episodes" | "episodesRead">;
  playerAssets?: PlayerAssets;
  unit: string;
  sameUnit: boolean;
  sameAttr: boolean;
  mysekaiFixtureLimit?: number;
  cardUnits?: string[];
}): Promise<{ detail?: DeckCardPowerDetail; trace: Row; missingFields: string[]; estimatedFieldsUsed: string[] }> {
  const [cards, episodes, lessons, areaLevels, characterRanks, canvasBonuses] = await Promise.all([
    getReferenceMaster<Row>(input.region, "cards"),
    getReferenceMaster<Row>(input.region, "cardEpisodes"),
    getReferenceMaster<Row>(input.region, "masterLessons"),
    getReferenceMaster<Row>(input.region, "areaItemLevels"),
    getReferenceMaster<Row>(input.region, "characterRanks"),
    getReferenceMaster<Row>(input.region, "cardMysekaiCanvasBonuses")
  ]);
  const rawCard = cards.find((row) => string(row.id) === input.card.id);
  const level = input.owned?.level ?? 1;
  const masterRank = input.owned?.masterRank ?? 0;
  const base = rawCard ? rawCardParameters(rawCard, level) : undefined;
  const missingFields: string[] = [];
  const estimatedFieldsUsed: string[] = [];
  if (!rawCard) missingFields.push(`cards:${input.card.id}`);
  if (!base) missingFields.push(`cardParameters:${input.card.id}:${level}`);
  if (!base) return { trace: { referenceFormulaId: "Moesekai.CardPowerCalculator.getCardBasePowers", cardId: input.card.id, level }, missingFields, estimatedFieldsUsed };
  const vector: [number, number, number] = [...base];
  const trained = input.owned?.specialTrainingStatus === "done" || input.owned?.defaultImage === "after_training";
  if (trained) {
    vector[0] += num(rawCard?.specialTrainingPower1BonusFixed);
    vector[1] += num(rawCard?.specialTrainingPower2BonusFixed);
    vector[2] += num(rawCard?.specialTrainingPower3BonusFixed);
  }
  const episodeState = inventoryEpisodes(input.owned);
  const cardEpisodes = episodes.filter((row) => string(row.cardId) === input.card.id);
  const usedEpisodes = episodeState.ids
    ? cardEpisodes.filter((row) => episodeState.ids?.has(string(row.id) ?? ""))
    : episodeState.estimated ? cardEpisodes : [];
  if (episodeState.estimated) estimatedFieldsUsed.push("legacy episodesRead treated as all card episodes read");
  if (cardEpisodes.length > 0 && !input.owned?.episodes?.length && input.owned?.episodesRead == null) missingFields.push(`episodes:${input.card.id}`);
  for (const row of usedEpisodes) {
    vector[0] += num(row.power1BonusFixed);
    vector[1] += num(row.power2BonusFixed);
    vector[2] += num(row.power3BonusFixed);
  }
  const rarity = string(rawCard?.cardRarityType ?? input.card.cardRarityType);
  const usedLessons = lessons.filter((row) => string(row.cardRarityType) === rarity && num(row.masterRank) <= masterRank);
  for (const row of usedLessons) {
    vector[0] += num(row.power1BonusFixed);
    vector[1] += num(row.power2BonusFixed);
    vector[2] += num(row.power3BonusFixed);
  }
  const canvas = records(input.playerAssets?.["mysekai-canvas"]).some((row) => string(row.cardId) === input.card.id);
  if (canvas) {
    const row = canvasBonuses.find((item) => string(item.cardRarityType) === rarity);
    if (!row) missingFields.push(`cardMysekaiCanvasBonuses:${rarity}`);
    vector[0] += num(row?.power1BonusFixed);
    vector[1] += num(row?.power2BonusFixed);
    vector[2] += num(row?.power3BonusFixed);
  }
  const areaInventory = records(input.playerAssets?.["area-items"]);
  const areaBonus = [0, 0, 0];
  for (const ownedArea of areaInventory) {
    const areaItemId = string(ownedArea.areaItemId ?? ownedArea.id);
    const levelValue = num(ownedArea.level ?? ownedArea.areaItemLevel);
    const row = areaLevels.find((item) => string(item.areaItemId ?? item.id) === areaItemId && num(item.level ?? item.areaItemLevel) === levelValue);
    if (!row) continue;
    const targetUnit = string(row.targetUnit) ?? "any";
    const targetAttr = string(row.targetCardAttr) ?? "any";
    const targetCharacter = string(row.targetGameCharacterId);
    if (targetUnit !== "any" && targetUnit !== input.unit) continue;
    if (targetAttr !== "any" && targetAttr !== input.card.attribute) continue;
    if (targetCharacter && targetCharacter !== input.card.characterId) continue;
    const allMatch = (targetUnit !== "any" && input.sameUnit) || (targetAttr !== "any" && input.sameAttr);
    for (let index = 0; index < 3; index += 1) {
      const key = `power${index + 1}${allMatch ? "AllMatch" : ""}BonusRate`;
      areaBonus[index] = Math.fround(areaBonus[index] + froundRatePower(num(row[key]), vector[index]));
    }
  }
  const areaItemBonus = areaBonus.reduce((sum, value) => sum + Math.floor(value), 0);
  const characterAssets = records(input.playerAssets?.["character-ranks"]);
  const character = ownedLevel(characterAssets, ["characterId", "gameCharacterId", "id"], input.card.characterId ?? "");
  if (character.row && character.level === 0) {
    character.level = num(character.row.characterRank ?? character.row.rank);
  }
  const characterRank = characterRanks.find((row) => string(row.characterId) === input.card.characterId && num(row.characterRank) === character.level);
  if (!character.row) missingFields.push(`character-rank:${input.card.characterId}`);
  if (character.row && !characterRank) missingFields.push(`characterRanks:${input.card.characterId}:${character.level}`);
  const characterBonus = characterRank
    ? vector.reduce((sum, value, index) => sum + Math.floor(froundRatePower(num(characterRank[`power${index + 1}BonusRate`]), value)), 0)
    : 0;
  const fixture = records(input.playerAssets?.["mysekai-fixtures"]).find((row) => string(row.gameCharacterId ?? row.characterId) === input.card.characterId);
  const fixtureRate = Math.min(num(fixture?.totalBonusRate), input.mysekaiFixtureLimit ?? Number.MAX_SAFE_INTEGER);
  const fixtureBonus = Math.floor(Math.fround(vector.reduce((sum, value) => sum + value, 0) * Math.fround(Math.fround(fixtureRate) * Math.fround(0.001))));
  const gateRows = records(input.playerAssets?.["mysekai-gates"]);
  const onlyPiapro = input.cardUnits?.length === 1 && input.cardUnits[0] === "piapro";
  const gateRate = gateRows
    .filter((row) => onlyPiapro || !row.unit || string(row.unit) === input.unit)
    .reduce((max, row) => Math.max(max, num(row.powerBonusRate ?? row.bonusRate)), 0);
  const gateBonus = Math.floor(Math.fround(vector.reduce((sum, value) => sum + value, 0) * Math.fround(Math.fround(gateRate) * Math.fround(0.01))));
  const detail = {
    base: vector.reduce((sum, value) => sum + value, 0),
    areaItemBonus,
    characterBonus,
    fixtureBonus,
    gateBonus,
    total: vector.reduce((sum, value) => sum + value, 0) + areaItemBonus + characterBonus + fixtureBonus + gateBonus
  };
  return {
    detail,
    trace: {
      referenceFormulaId: "Moesekai.CardPowerCalculator.getCardPower",
      cardId: input.card.id,
      level,
      baseVector: vector,
      trained,
      usedEpisodeIds: usedEpisodes.map((row) => row.id),
      usedMasterRanks: usedLessons.map((row) => row.masterRank),
      areaBonusVector: areaBonus,
      characterRank: character.level,
      fixtureRate,
      gateRate,
      detail
    },
    missingFields,
    estimatedFieldsUsed
  };
}

export async function resolveExactMysekaiServiceContext(region: RegionId, playerAssets: PlayerAssets = {}): Promise<ExactMysekaiServiceContext> {
  const [gates, gateLevels] = await Promise.all([
    getReferenceMaster<Row>(region, "mysekaiGates"),
    getReferenceMaster<Row>(region, "mysekaiGateLevels")
  ]);
  const uploadedCanvas = records(playerAssets["mysekai-canvas"]);
  const uploadedGates = records(playerAssets["mysekai-gates"]);
  const uploadedFixtures = records(playerAssets["mysekai-fixtures"]);
  const canvasCardIds = new Set(uploadedCanvas.map((row) => string(row.cardId)).filter((value): value is string => Boolean(value)));
  const missingFields: string[] = [];
  const gateBonuses = uploadedGates.flatMap((row) => {
    const gateId = string(row.mysekaiGateId ?? row.gateId ?? row.id);
    const level = num(row.mysekaiGateLevel ?? row.level);
    if (!gateId || level <= 0) return [];
    const gate = gates.find((item) => string(item.id) === gateId);
    const levelRow = gateLevels.find((item) => string(item.mysekaiGateId) === gateId && num(item.level) === level);
    if (!gate || !levelRow) {
      missingFields.push(`mysekaiGate:${gateId}:${level}`);
      return [];
    }
    return [{ mysekaiGateId: gateId, level, unit: String(gate.unit), powerBonusRate: num(levelRow.powerBonusRate) }];
  });
  const fixtureBonuses = uploadedFixtures.flatMap((row) => {
    const gameCharacterId = string(row.gameCharacterId ?? row.characterId);
    if (!gameCharacterId) return [];
    return [{ gameCharacterId, totalBonusRate: num(row.totalBonusRate) }];
  });
  if (!Array.isArray(playerAssets["mysekai-canvas"])) missingFields.push("uploaded MySekai canvas data");
  if (!Array.isArray(playerAssets["mysekai-gates"])) missingFields.push("uploaded MySekai gate data");
  if (!Array.isArray(playerAssets["mysekai-fixtures"])) missingFields.push("uploaded MySekai fixture data");
  return {
    playerAssets: {
      ...playerAssets,
      "mysekai-canvas": [...canvasCardIds].map((cardId) => ({ cardId })),
      "mysekai-gates": gateBonuses,
      "mysekai-fixtures": fixtureBonuses
    },
    canvasCardIds,
    gateBonuses,
    fixtureBonuses,
    missingFields: [...new Set(missingFields)],
    trace: {
      referenceFormulaId: "Moesekai.MysekaiService.getMysekaiCanvasBonusCards/getMysekaiGateBonuses",
      canvasCount: canvasCardIds.size,
      gateBonuses,
      fixtureBonuses,
      sourceFields: {
        canvas: "userMysekaiCanvases.cardId",
        gate: "userMysekaiGates.mysekaiGateId/mysekaiGateLevel -> mysekaiGates/mysekaiGateLevels",
        fixture: "userMysekaiFixtureGameCharacterPerformanceBonuses.gameCharacterId/totalBonusRate"
      }
    }
  };
}

export async function buildExactCardDetailLike(input: {
  region: RegionId;
  card: Card;
  owned: Partial<UserCardInventoryItem> & { cardId: string };
  service: ExactMysekaiServiceContext;
  mysekaiFixtureLimit?: number;
  scoreUpLimit?: number;
  eventBonusDetail?: { fixedBonus: number; cardBonus: number; leaderBonus: number; cardBonusCountLimit?: number };
  supportDeckBonus?: number;
}): Promise<{ detail?: CardDetailLike; trace: Row; missingFields: string[]; estimatedFieldsUsed: string[] }> {
  const unitTrace = getCardUnitsLike(input.card);
  const units = unitTrace.units.length ? unitTrace.units : [];
  const missingFields = [...input.service.missingFields, ...unitTrace.missingFields];
  const estimatedFieldsUsed: string[] = [];
  if (!units.length) return { trace: { cardId: input.card.id, unitTrace: unitTrace.trace }, missingFields, estimatedFieldsUsed };
  const powerMap = new CardDetailMapPower();
  const powerCases: Row[] = [];
  let representativePower: DeckCardPowerDetail | undefined;
  for (const unit of units) {
    for (const sameUnit of [false, true]) {
      for (const sameAttr of [false, true]) {
        const result = await calculateExactCardPower({
          region: input.region,
          card: input.card,
          owned: input.owned,
          playerAssets: input.service.playerAssets,
          unit,
          sameUnit,
          sameAttr,
          cardUnits: units,
          mysekaiFixtureLimit: input.mysekaiFixtureLimit
        });
        missingFields.push(...result.missingFields);
        estimatedFieldsUsed.push(...result.estimatedFieldsUsed);
        if (!result.detail) continue;
        powerMap.setPower(unit, sameUnit, sameAttr, result.detail);
        representativePower ??= result.detail;
        powerCases.push({ unit, sameUnit, sameAttr, detail: result.detail, trace: result.trace });
      }
    }
  }
  if (!representativePower) return { trace: { cardId: input.card.id, powerCases }, missingFields: [...new Set(missingFields)], estimatedFieldsUsed: [...new Set(estimatedFieldsUsed)] };
  const characterRankRow = records(input.service.playerAssets["character-ranks"]).find((row) => string(row.characterId ?? row.gameCharacterId ?? row.id) === input.card.characterId);
  const characterRank = num(characterRankRow?.characterRank ?? characterRankRow?.rank ?? characterRankRow?.level);
  const before = await calculateExactCardSkill({
    region: input.region,
    card: input.card,
    owned: input.owned,
    characterRank,
    afterTraining: false,
    scoreUpLimit: input.scoreUpLimit
  });
  const after = input.card.specialTrainingSkillId
    ? await calculateExactCardSkill({
        region: input.region,
        card: input.card,
        owned: input.owned,
        characterRank,
        afterTraining: true,
        scoreUpLimit: input.scoreUpLimit
      })
    : undefined;
  missingFields.push(...before.missingFields, ...(after?.missingFields ?? []));
  const skillMap = new CardDetailMapSkill();
  if (after?.detail && after.mapInputs) {
    fillExactSkillMap(after.detail, after.mapInputs, (unit, unitMember, attrMember, cmpValue, value) => {
      skillMap.setSkill(unit, unitMember, attrMember, cmpValue, value);
    });
  }
  if (before.detail && before.mapInputs) {
    fillExactSkillMap(before.detail, before.mapInputs, (unit, unitMember, attrMember, cmpValue, value) => {
      if (after?.detail) skillMap.setPreTrainingSkill(unit, unitMember, attrMember, cmpValue, value);
      else skillMap.setSkill(unit, unitMember, attrMember, cmpValue, value);
    });
  }
  const eventDetail = input.eventBonusDetail ?? { fixedBonus: 0, cardBonus: 0, leaderBonus: 0 };
  const eventBonusMap = new CardDetailMapEventBonus();
  eventBonusMap.setBonus("any", 1, 1, eventDetail);
  const exactMissing = [...new Set(missingFields)];
  const detail: CardDetailLike = {
    cardId: input.card.id,
    level: input.owned.level ?? 1,
    skillLevel: input.owned.skillLevel ?? 1,
    masterRank: input.owned.masterRank ?? 0,
    cardRarityType: input.card.cardRarityType ?? `rarity_${input.card.rarity}`,
    characterId: input.card.characterId ?? "",
    units,
    attr: input.card.attribute,
    power: Object.assign(powerMap, { ...representativePower, breakdown: { estimatedPower: representativePower.total } as any }),
    skill: Object.assign(skillMap, {
      scoreUpBasic: (after?.detail ?? before.detail)?.scoreUpFixed ?? 0,
      scoreUpCharacterRank: 0,
      scoreUpSameUnit: 0,
      scoreUpDifferentUnit: 0,
      scoreUpReferenceMax: (after?.detail ?? before.detail)?.scoreUpReferenceMax ?? 0,
      scoreUpFixed: (after?.detail ?? before.detail)?.scoreUpFixed ?? 0,
      scoreUpToReference: (after?.detail ?? before.detail)?.scoreUpToReference ?? 0,
      lifeRecovery: (after?.detail ?? before.detail)?.lifeRecovery ?? 0,
      judgeSupport: 0,
      referenceLimited: Boolean((after?.detail ?? before.detail)?.hasScoreUpReference)
    }),
    eventBonus: Object.assign(eventBonusMap, eventDetail),
    supportDeckBonus: input.supportDeckBonus,
    defaultImage: input.owned.defaultImage,
    trace: {
      referenceFormulaId: "Moesekai.CardCalculator.getCardDetail",
      referenceParity: exactMissing.length ? "missing-data" : "matched",
      keepAfterTrainingState: true,
      hasCanvasBonus: input.service.canvasCardIds.has(input.card.id),
      powerCases,
      skill: { after: after?.trace, before: before.trace, map: skillMap.trace() }
    }
  };
  return { detail, trace: detail.trace, missingFields: exactMissing, estimatedFieldsUsed: [...new Set(estimatedFieldsUsed)] };
}

type ExactSkillMapInputs = {
  scoreUpLimit: number;
  sameUnit?: { unit: string; value: number };
  differentUnit: Map<number, number>;
  referenceRawMax: number;
};

function fillExactSkillMap(
  base: DeckCardSkillDetailPrepare,
  inputs: ExactSkillMapInputs,
  setter: (unit: string, unitMember: number, attrMember: number, cmpValue: number, value: DeckCardSkillDetailPrepare) => void
) {
  setter("any", 1, 1, base.scoreUpFixed, base);
  if (inputs.sameUnit) {
    for (let member = 1; member <= 5; member += 1) {
      const extra = (member === 5 ? 5 : member - 1) * inputs.sameUnit.value;
      const fixed = Math.min(base.scoreUpFixed + extra, inputs.scoreUpLimit);
      setter(inputs.sameUnit.unit, member, 1, fixed, { ...base, scoreUpFixed: fixed, scoreUpToReference: fixed });
    }
  }
  if (base.hasScoreUpReference) {
    setter("ref", 1, 1, base.scoreUpFixed + inputs.referenceRawMax, base);
  }
  for (let unitCount = 0; unitCount <= 2; unitCount += 1) {
    const extra = unitCount > 0 ? inputs.differentUnit.get(unitCount) ?? 0 : 0;
    const fixed = Math.min(base.scoreUpFixed + extra, inputs.scoreUpLimit);
    setter("diff", unitCount, 1, fixed, { ...base, scoreUpFixed: fixed, scoreUpToReference: fixed });
  }
}

function skillById(skills: Row[], id: unknown): CardSkill | undefined {
  const raw = skills.find((row) => string(row.id) === string(id));
  if (!raw) return undefined;
  return {
    id: String(raw.id),
    effects: records(raw.skillEffects).map((effect) => ({
      type: string(effect.skillEffectType),
      activateCharacterRank: num(effect.activateCharacterRank) || undefined,
      activateUnitCount: num(effect.activateUnitCount) || undefined,
      skillEnhance: effect.skillEnhance,
      details: records(effect.skillEffectDetails).map((detail) => ({
        level: num(detail.level), value: num(detail.activateEffectValue), value2: num(detail.activateEffectValue2), raw: detail
      })),
      raw: effect
    }))
  };
}

export async function calculateExactCardSkill(input: {
  region: RegionId;
  card: Card;
  owned?: Pick<UserCardInventoryItem, "skillLevel">;
  characterRank?: number;
  afterTraining: boolean;
  scoreUpLimit?: number;
}): Promise<{ detail?: DeckCardSkillDetailPrepare; mapInputs?: ExactSkillMapInputs; trace: Row; missingFields: string[] }> {
  const [cards, skills] = await Promise.all([getReferenceMaster<Row>(input.region, "cards"), getReferenceMaster<Row>(input.region, "skills")]);
  const rawCard = cards.find((row) => string(row.id) === input.card.id);
  const skillId = input.afterTraining && rawCard?.specialTrainingSkillId ? rawCard.specialTrainingSkillId : rawCard?.skillId ?? input.card.skillId;
  const skill = skillById(skills, skillId);
  if (!skill) return { trace: { referenceFormulaId: "Moesekai.CardSkillCalculator.getSkillDetail", skillId }, missingFields: [`skills:${skillId}`] };
  const level = input.owned?.skillLevel ?? 1;
  let basic = 0;
  let rank = 0;
  let life = 0;
  let referenceRate = 0;
  let referenceMax = 0;
  const different = new Map<number, number>();
  let sameUnit: { unit: string; value: number } | undefined;
  const selected: Row[] = [];
  for (const effect of skill.effects ?? []) {
    const detail = effect.details?.find((row) => row.level === level);
    if (!detail) continue;
    selected.push({ type: effect.type, ...detail });
    if (["score_up", "score_up_condition_life", "score_up_keep"].includes(effect.type ?? "")) {
      basic = Math.max(basic, num(detail.value));
      const enhance = effect.skillEnhance as Row | undefined;
      const condition = enhance?.skillEnhanceCondition as Row | undefined;
      if (enhance && condition) sameUnit = { unit: String(condition.unit), value: num(enhance.activateEffectValue) };
    } else if (effect.type === "life_recovery") life += num(detail.value);
    else if (effect.type === "score_up_character_rank" && num(effect.activateCharacterRank) <= (input.characterRank ?? 0)) rank = Math.max(rank, num(detail.value));
    else if (effect.type === "other_member_score_up_reference_rate") { referenceRate = num(detail.value); referenceMax = num(detail.value2); }
    else if (effect.type === "score_up_unit_count" && effect.activateUnitCount != null) different.set(effect.activateUnitCount, num(detail.value));
  }
  const limit = input.scoreUpLimit ?? Number.MAX_SAFE_INTEGER;
  const fixed = Math.min(basic + rank, limit);
  const detail = {
    skillId: String(skillId),
    isAfterTraining: input.afterTraining,
    scoreUpFixed: fixed,
    scoreUpToReference: fixed,
    lifeRecovery: life,
    hasScoreUpReference: referenceRate > 0 || undefined,
    scoreUpReferenceRate: referenceRate || undefined,
    scoreUpReferenceMax: referenceRate ? Math.min(referenceMax, limit - fixed) : undefined
  };
  return {
    detail,
    mapInputs: { scoreUpLimit: limit, sameUnit, differentUnit: different, referenceRawMax: referenceMax },
    trace: {
      referenceFormulaId: "Moesekai.CardSkillCalculator.getCardSkill",
      skillId,
      level,
      basic,
      characterRankBonus: rank,
      sameUnit,
      differentUnit: Object.fromEntries(different),
      referenceRate,
      referenceMax,
      selected,
      appliedLimit: limit
    },
    missingFields: []
  };
}
