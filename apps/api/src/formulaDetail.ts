import type { Card } from "./types.js";
import {
  cardCharacterId,
  sharedFormulaVersion,
  type CardContributionBreakdown,
  type CardPowerBreakdown,
  type UserCardState
} from "./normalEventFormula.js";

export type DeckCardPowerDetail = {
  base: number;
  areaItemBonus: number;
  characterBonus: number;
  fixtureBonus: number;
  gateBonus: number;
  total: number;
};

export type DeckCardSkillDetailPrepare = {
  skillId?: string | number;
  isAfterTraining: boolean;
  scoreUpFixed: number;
  scoreUpToReference: number;
  scoreUpReferenceRate?: number;
  scoreUpReferenceMax?: number;
  hasScoreUpReference?: boolean;
  lifeRecovery: number;
  judgeSupport?: number;
};

export class CardDetailMap<T> {
  private min = Number.MAX_SAFE_INTEGER;
  private max = Number.MIN_SAFE_INTEGER;
  private readonly values = new Map<string, T>();

  protected set(unit: string, unitMember: number, attrMember: number, cmpValue: number, value: T) {
    this.min = Math.min(this.min, cmpValue);
    this.max = Math.max(this.max, cmpValue);
    this.values.set(CardDetailMap.key(unit, unitMember, attrMember), value);
  }

  public setPublic(unit: string, unitMember: number, attrMember: number, cmpValue: number, value: T) {
    this.set(unit, unitMember, attrMember, cmpValue, value);
  }

  public getInternal(unit: string, unitMember: number, attrMember: number) {
    return this.values.get(CardDetailMap.key(unit, unitMember, attrMember));
  }

  public getMax() {
    return this.max === Number.MIN_SAFE_INTEGER ? 0 : this.max;
  }

  public getMin() {
    return this.min === Number.MAX_SAFE_INTEGER ? 0 : this.min;
  }

  public isCertainlyLessThen(another: CardDetailMap<T>) {
    return this.getMax() < another.getMin();
  }

  public trace() {
    return {
      caseCount: this.values.size,
      min: this.getMin(),
      max: this.getMax(),
      keys: [...this.values.keys()]
    };
  }

  private static key(unit: string, unitMember: number, attrMember: number) {
    return `${unit}-${unitMember}-${attrMember}`;
  }
}

export class CardDetailMapPower extends CardDetailMap<DeckCardPowerDetail> {
  public setPower(unit: string, sameUnit: boolean, sameAttr: boolean, value: DeckCardPowerDetail) {
    this.setPublic(unit, sameUnit ? 5 : 1, sameAttr ? 5 : 1, value.total, value);
  }

  public getPower(unit: string, unitMember: number, attrMember: number) {
    const unitMember0 = unitMember === 5 ? 5 : 1;
    const attrMember0 = attrMember === 5 ? 5 : 1;
    return this.getInternal(unit, unitMember0, attrMember0) ?? this.getInternal("any", 1, 1) ?? {
      base: 0,
      areaItemBonus: 0,
      characterBonus: 0,
      fixtureBonus: 0,
      gateBonus: 0,
      total: 0
    };
  }
}

export class CardDetailMapSkill extends CardDetailMap<DeckCardSkillDetailPrepare> {
  private readonly preTrainingMap = new CardDetailMap<DeckCardSkillDetailPrepare>();
  private hasPreTrainingValue = false;

  public get hasPreTraining() {
    return this.hasPreTrainingValue;
  }

  public setSkill(unit: string, unitMember: number, attrMember: number, cmpValue: number, value: DeckCardSkillDetailPrepare) {
    this.setPublic(unit, unitMember, attrMember, cmpValue, value);
  }

  public setPreTrainingSkill(unit: string, unitMember: number, attrMember: number, cmpValue: number, value: DeckCardSkillDetailPrepare) {
    this.preTrainingMap.setPublic(unit, unitMember, attrMember, cmpValue, value);
    this.hasPreTrainingValue = true;
  }

  public getSkill(unit: string, unitMember: number) {
    return CardDetailMapSkill.resolve(this, unit, unitMember);
  }

  public getPreTrainingSkill(unit: string, unitMember: number) {
    if (!this.hasPreTrainingValue) throw new Error("no pre-training skill");
    return CardDetailMapSkill.resolve(this.preTrainingMap, unit, unitMember);
  }

  public trace() {
    return {
      ...super.trace(),
      hasPreTraining: this.hasPreTrainingValue,
      preTraining: this.preTrainingMap.trace()
    };
  }

  private static resolve(map: CardDetailMap<DeckCardSkillDetailPrepare>, unit: string, unitMember: number) {
    if (unit === "ref") {
      const best = map.getInternal("ref", 1, 1);
      if (best) return best;
    }
    if (unit === "diff") {
      const best = map.getInternal("diff", Math.min(2, unitMember), 1);
      if (best) return best;
    }
    const unitBest = map.getInternal(unit, unitMember, 1);
    if (unitBest) return unitBest;
    const fallback = map.getInternal("any", 1, 1);
    if (fallback) return fallback;
    return { isAfterTraining: true, scoreUpFixed: 0, scoreUpToReference: 0, lifeRecovery: 0 };
  }
}

export class CardDetailMapEventBonus extends CardDetailMap<CardContributionBreakdown["eventBonusDetail"]> {
  public setBonus(unit: string, unitMember: number, attrMember: number, value: CardContributionBreakdown["eventBonusDetail"]) {
    this.setPublic(unit, unitMember, attrMember, value.fixedBonus + value.cardBonus + value.leaderBonus, value);
  }

  public getBonus(unit: string, unitMember: number, attrMember: number) {
    return this.getInternal(unit, unitMember, attrMember) ?? this.getInternal("any", 1, 1);
  }
}

export type CardDetailLike = {
  cardId: string;
  level: number;
  skillLevel: number;
  masterRank: number;
  cardRarityType: string;
  characterId: string;
  units: string[];
  attr: string;
  power: CardDetailMapPower & {
    base: number;
    areaItemBonus: number;
    characterBonus: number;
    fixtureBonus: number;
    gateBonus: number;
    total: number;
    breakdown: CardPowerBreakdown;
  };
  skill: CardDetailMapSkill & CardContributionBreakdown["skillDetail"];
  eventBonus?: CardDetailMapEventBonus & CardContributionBreakdown["eventBonusDetail"];
  supportDeckBonus?: number;
  defaultImage?: string;
  trace: Record<string, unknown>;
};

export type DeckDetailLike = {
  formulaVersion: string;
  power: {
    base: number;
    areaItemBonus: number;
    characterBonus: number;
    honorBonus: number;
    fixtureBonus: number;
    gateBonus: number;
    totalBeforeCap: number;
    total: number;
  };
  eventBonus?: number;
  supportDeckBonus?: number;
  cards: CardDetailLike[];
  deckCards: Array<{
    cardId: string;
    level: number;
    skillLevel: number;
    masterRank: number;
    power: DeckCardPowerDetail;
    eventBonus?: string;
    skill: {
      scoreUp: number;
      lifeRecovery: number;
      isPreTrainingSkill?: boolean;
    };
    defaultImage?: string;
  }>;
  multiLiveScoreUp: number;
  wl3PowerCapTrace?: {
    cap: number;
    applied: boolean;
    totalBeforeCap: number;
    totalAfterCap: number;
    referenceFormulaId: string;
  };
  cardBonusCountLimitTrace?: {
    cardBonusCountLimit: number;
    appliedCardBonusCount: number;
    skippedCardBonusCount: number;
    referenceFormulaId: string;
  };
  leaderSelectionTrace: Record<string, unknown>;
  skillEnumerationTrace: Record<string, unknown>;
  powerCaseTrace: Record<string, unknown>;
  cardDetailMapTrace: Record<string, unknown>[];
  cardDetailTrace: Record<string, unknown>[];
  deckDetailTrace: Record<string, unknown>;
  deckCalculatorTrace: Record<string, unknown>;
  referenceSources: string[];
  estimatedFieldsUsed: string[];
  missingFields: string[];
};

export type CardDetailContributionInput = {
  card: Card;
  owned?: UserCardState;
  cardContributionBreakdown: CardContributionBreakdown;
  estimatedPower: number;
  skillScore: number;
};

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function rarityKey(card: Card) {
  if (card.rarity >= 4) return "rarity_4";
  if (card.rarity === 3) return "rarity_3";
  if (card.rarity === 2) return "rarity_2";
  if (card.rarity === 1) return "rarity_1";
  return "rarity_unknown";
}

function attach<T extends object, U extends object>(instance: T, fields: U): T & U {
  return Object.assign(instance, fields);
}

const characterUnitByName: Record<string, string> = {
  "星乃一歌": "light_sound", "天马咲希": "light_sound", "天馬咲希": "light_sound", "望月穗波": "light_sound", "望月穂波": "light_sound", "日野森志步": "light_sound", "日野森志歩": "light_sound",
  "花里实乃理": "idol", "花里みのり": "idol", "桐谷遥": "idol", "桃井爱莉": "idol", "桃井愛莉": "idol", "日野森雫": "idol",
  "小豆泽心羽": "street", "小豆沢こはね": "street", "白石杏": "street", "东云彰人": "street", "東雲彰人": "street", "青柳冬弥": "street",
  "天马司": "theme_park", "天馬司": "theme_park", "凤笑梦": "theme_park", "鳳えむ": "theme_park", "草薙宁宁": "theme_park", "草薙寧々": "theme_park", "神代类": "theme_park", "神代類": "theme_park",
  "宵崎奏": "school_refusal", "朝比奈真冬": "school_refusal", "朝比奈まふゆ": "school_refusal", "东云绘名": "school_refusal", "東雲絵名": "school_refusal", "晓山瑞希": "school_refusal", "暁山瑞希": "school_refusal",
  "初音未来": "piapro", "初音ミク": "piapro", "镜音铃": "piapro", "鏡音リン": "piapro", "镜音连": "piapro", "鏡音レン": "piapro", "巡音流歌": "piapro", "巡音ルカ": "piapro", "MEIKO": "piapro", "KAITO": "piapro"
};

export function getCardUnitsLike(card: Card) {
  const units = new Set<string>();
  if (card.supportUnit && card.supportUnit !== "none") units.add(card.supportUnit);
  const rawCharacterUnit = card.characterUnit;
  const mappedCharacterUnit = card.character ? characterUnitByName[card.character] : undefined;
  const characterUnit = rawCharacterUnit ?? mappedCharacterUnit;
  if (characterUnit) units.add(characterUnit);
  return {
    units: [...units].filter(Boolean),
    trace: {
      referenceFormulaId: "Moesekai.CardService.getCardUnits",
      supportUnit: card.supportUnit,
      characterId: card.characterId,
      characterName: card.character,
      characterUnit,
      source: rawCharacterUnit ? "raw gameCharacters.unit" : mappedCharacterUnit ? "normalized character-name fallback" : "unavailable",
      status: rawCharacterUnit ? "matched" : characterUnit ? "fallback" : "missing-data",
      reason: characterUnit
        ? rawCharacterUnit
          ? "Raw gameCharacters.unit is preserved on the normalized card and used by CardService.getCardUnits parity."
          : "Character name fallback is used because the existing cache predates raw gameCharacters.unit preservation."
        : "Raw gameCharacters.unit is unavailable and the normalized character name was not recognized."
    },
    estimatedFieldsUsed: rawCharacterUnit ? [] : characterUnit ? ["CardDetail.units mapped from normalized character name fallback"] : ["CardDetail.units reconstructed without raw gameCharacters.unit"],
    missingFields: characterUnit ? [] : ["raw gameCharacters.unit"]
  };
}

function powerMapFromBreakdown(breakdown: CardPowerBreakdown, estimatedPower: number) {
  const map = new CardDetailMapPower();
  const baseDetail: DeckCardPowerDetail = {
    base: breakdown.rarityBasePower + breakdown.levelBonus + breakdown.specialTrainingBonus + breakdown.masterRankBonusPower + breakdown.episodeReadBonus,
    areaItemBonus: breakdown.areaItemBonus,
    characterBonus: breakdown.characterRankBonus,
    fixtureBonus: 0,
    gateBonus: 0,
    total: estimatedPower
  };
  map.setPower("any", false, false, baseDetail);
  const sameUnitDetail = { ...baseDetail, total: baseDetail.total + Math.floor(baseDetail.characterBonus * 0.05) };
  const sameAttrDetail = { ...baseDetail, total: baseDetail.total + Math.floor(baseDetail.areaItemBonus * 0.05) };
  const sameBothDetail = {
    ...baseDetail,
    total: baseDetail.total + Math.floor(baseDetail.characterBonus * 0.05) + Math.floor(baseDetail.areaItemBonus * 0.05)
  };
  map.setPower("any", true, false, sameUnitDetail);
  map.setPower("any", false, true, sameAttrDetail);
  map.setPower("any", true, true, sameBothDetail);
  return attach(map, { ...baseDetail, breakdown });
}

function skillMapFromDetail(detail: CardContributionBreakdown["skillDetail"], skillId?: string) {
  const map = new CardDetailMapSkill();
  const base: DeckCardSkillDetailPrepare = {
    skillId,
    isAfterTraining: true,
    scoreUpFixed: detail.scoreUpFixed,
    scoreUpToReference: detail.scoreUpToReference,
    scoreUpReferenceMax: detail.scoreUpReferenceMax,
    hasScoreUpReference: detail.referenceLimited || detail.scoreUpReferenceMax > 0,
    lifeRecovery: detail.lifeRecovery,
    judgeSupport: detail.judgeSupport
  };
  map.setSkill("any", 1, 1, base.scoreUpFixed, base);
  if (detail.scoreUpSameUnit > 0) {
    map.setSkill("any", 5, 1, detail.scoreUpFixed + detail.scoreUpSameUnit, {
      ...base,
      scoreUpFixed: detail.scoreUpFixed + detail.scoreUpSameUnit,
      scoreUpToReference: detail.scoreUpToReference + detail.scoreUpSameUnit
    });
  }
  if (detail.scoreUpDifferentUnit > 0) {
    map.setSkill("diff", 2, 1, detail.scoreUpDifferentUnit, {
      ...base,
      scoreUpFixed: Math.max(detail.scoreUpFixed, detail.scoreUpDifferentUnit),
      scoreUpToReference: Math.max(detail.scoreUpToReference, detail.scoreUpDifferentUnit)
    });
  }
  if (detail.referenceLimited || detail.scoreUpReferenceMax > 0) {
    map.setSkill("ref", 1, 1, detail.scoreUpFixed + detail.scoreUpReferenceMax, {
      ...base,
      scoreUpFixed: detail.scoreUpFixed + detail.scoreUpReferenceMax,
      scoreUpToReference: detail.scoreUpToReference,
      scoreUpReferenceMax: detail.scoreUpReferenceMax,
      hasScoreUpReference: true
    });
  }
  return attach(map, detail);
}

function eventBonusMapFromDetail(detail: CardContributionBreakdown["eventBonusDetail"]) {
  const map = new CardDetailMapEventBonus();
  map.setBonus("any", 1, 1, detail);
  return attach(map, detail);
}

export function buildCardDetailLike(input: CardDetailContributionInput): CardDetailLike {
  const powerBreakdown = input.cardContributionBreakdown.powerBreakdown;
  const unitTrace = getCardUnitsLike(input.card);
  const worldBloomBreakdown = input.cardContributionBreakdown.modeSpecificBreakdown.worldBloom as Record<string, unknown> | undefined;
  const supportDeckBreakdown = worldBloomBreakdown?.supportDeckBreakdown as Record<string, unknown> | undefined;
  const supportCards = Array.isArray(supportDeckBreakdown?.cards) ? supportDeckBreakdown.cards as Array<Record<string, unknown>> : [];
  const supportHit = supportCards.find((card) => String(card.cardId ?? "") === input.card.id);
  const supportDeckBonus = supportHit && Number.isFinite(Number(supportHit.supportDeckBonus)) ? Number(supportHit.supportDeckBonus) : undefined;
  const power = powerMapFromBreakdown(powerBreakdown, input.estimatedPower);
  const skill = skillMapFromDetail(input.cardContributionBreakdown.skillDetail, input.card.skill?.id ?? input.card.skillId);
  const eventBonus = eventBonusMapFromDetail(input.cardContributionBreakdown.eventBonusDetail);
  return {
    cardId: input.card.id,
    level: input.owned?.level ?? powerBreakdown.level,
    skillLevel: input.owned?.skillLevel ?? powerBreakdown.skillLevel,
    masterRank: input.owned?.masterRank ?? powerBreakdown.masterRank,
    cardRarityType: rarityKey(input.card),
    characterId: cardCharacterId(input.card),
    units: unitTrace.units.length ? unitTrace.units : ["any"],
    attr: input.card.attribute,
    power,
    skill,
    eventBonus,
    supportDeckBonus,
    defaultImage: input.owned?.defaultImage,
    trace: {
      referenceFormulaId: "Moesekai.CardCalculator.getCardDetail",
      referenceParity: unitTrace.missingFields.length ? "missing-data" : "matched-normalized-shape",
      units: unitTrace.trace,
      powerMap: power.trace(),
      skillMap: skill.trace(),
      eventBonusMap: eventBonus.trace(),
      supportDeckBonusSource: supportDeckBonus == null ? "not selected or unavailable" : "supportDeckBreakdown.cards"
    }
  };
}

function countMap(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

function getCount(map: Map<string, number>, key: string) {
  return map.get(key) ?? 0;
}

function displayEventBonus(detail: CardContributionBreakdown["eventBonusDetail"] | undefined, leader: boolean) {
  if (!detail) return undefined;
  const value = detail.fixedBonus + detail.cardBonus + (leader ? detail.leaderBonus : 0);
  return `${value}%`;
}

export function buildDeckDetailLike(cards: CardDetailLike[], options: {
  mode?: "normal" | "challenge" | "world_bloom" | "wl" | "wl3";
  honorBonus?: number;
  supportDeckBonus?: number;
  cardBonusCountLimit?: number;
  differentAttributeBonus?: number;
  estimatedFieldsUsed?: string[];
  missingFields?: string[];
} = {}): DeckDetailLike {
  const honorBonus = Math.max(0, options.honorBonus ?? 0);
  const cardBonusCountLimit = options.cardBonusCountLimit ?? (options.mode === "wl3" ? 4 : 5);
  const unitMap = countMap(cards.flatMap((card) => card.units));
  const attrMap = countMap(cards.map((card) => card.attr));
  const unitNum = [...unitMap.values()].filter((count) => count > 0).length;
  const cardPower = new Map<string, DeckCardPowerDetail>();
  const powerCaseTrace: Array<Record<string, unknown>> = [];

  for (const card of cards) {
    let best = card.power.getPower(card.units[0] ?? "any", getCount(unitMap, card.units[0] ?? "any"), getCount(attrMap, card.attr));
    let selectedUnit = card.units[0] ?? "any";
    for (const unit of card.units) {
      const current = card.power.getPower(unit, getCount(unitMap, unit), getCount(attrMap, card.attr));
      if (current.total > best.total) {
        best = current;
        selectedUnit = unit;
      }
    }
    cardPower.set(card.cardId, best);
    powerCaseTrace.push({
      cardId: card.cardId,
      selectedUnit,
      unitMember: getCount(unitMap, selectedUnit),
      attrMember: getCount(attrMap, card.attr),
      power: best
    });
  }

  const skillPrepare = cards.map((card) => {
    let after = card.skill.getSkill(card.units[0] ?? "any", getCount(unitMap, card.units[0] ?? "any"));
    for (const unit of card.units) {
      const current = card.skill.getSkill(unit, getCount(unitMap, unit));
      if (current.scoreUpFixed > after.scoreUpFixed) after = current;
    }
    let before: DeckCardSkillDetailPrepare | undefined;
    let needEnumerate = false;
    if (card.skill.hasPreTraining) {
      try {
        const ref = card.skill.getPreTrainingSkill("ref", 1);
        const refScore = ref.scoreUpFixed + (ref.scoreUpReferenceMax ?? 0);
        before = { ...ref, scoreUpFixed: refScore, scoreUpToReference: refScore };
        needEnumerate = true;
      } catch {
        // no ref pre-training skill
      }
      try {
        const diff = card.skill.getPreTrainingSkill("diff", unitNum - 1);
        if (!before || diff.scoreUpFixed > before.scoreUpFixed) {
          before = diff;
          needEnumerate = false;
        }
      } catch {
        // no diff pre-training skill
      }
    }
    return { card, after, before, needEnumerate };
  });

  const skills = skillPrepare.map((entry) => {
    if (!entry.before) return entry.after;
    if (entry.card.defaultImage === "original" && !entry.needEnumerate) return entry.before.scoreUpFixed > entry.after.scoreUpFixed ? entry.before : entry.after;
    return entry.after.scoreUpFixed >= entry.before.scoreUpFixed ? entry.after : entry.before;
  });
  for (const skill of skills) skill.scoreUpToReference = skill.scoreUpFixed;
  for (let index = 0; index < skills.length; index += 1) {
    const skill = skills[index];
    if (!skill.hasScoreUpReference || skill.scoreUpReferenceRate == null || skill.scoreUpReferenceMax == null) continue;
    const baseFixed = skill.scoreUpFixed - skill.scoreUpReferenceMax;
    const memberBonuses = skills
      .filter((_, memberIndex) => memberIndex !== index)
      .map((member) => Math.min(Math.floor(member.scoreUpToReference * (skill.scoreUpReferenceRate ?? 0) / 100), skill.scoreUpReferenceMax ?? 0));
    const average = memberBonuses.length ? memberBonuses.reduce((sum, value) => sum + value, 0) / memberBonuses.length : 0;
    skill.scoreUpFixed = baseFixed + average;
  }

  const order = cards.map((_, index) => index);
  let selectedLeaderIndex = 0;
  for (let index = 1; index < order.length; index += 1) {
    const candidate = order[index];
    if (skills[candidate].scoreUpFixed > skills[selectedLeaderIndex].scoreUpFixed ||
      (skills[candidate].scoreUpFixed === skills[selectedLeaderIndex].scoreUpFixed && cards[candidate].cardId < cards[selectedLeaderIndex].cardId)) {
      selectedLeaderIndex = candidate;
    }
  }
  const selectedOrder = [selectedLeaderIndex, ...order.filter((index) => index !== selectedLeaderIndex)];
  const deckCards = selectedOrder.map((index, orderIndex) => {
    const card = cards[index];
    const skill = skills[index];
    const isPreTrainingSkill = skillPrepare[index].before != null && !skill.isAfterTraining;
    return {
      cardId: card.cardId,
      level: card.level,
      skillLevel: card.skillLevel,
      masterRank: card.masterRank,
      power: cardPower.get(card.cardId) ?? card.power.getPower("any", 1, 1),
      eventBonus: displayEventBonus(card.eventBonus, orderIndex === 0),
      skill: {
        scoreUp: skill.scoreUpFixed,
        lifeRecovery: skill.lifeRecovery,
        isPreTrainingSkill: isPreTrainingSkill || undefined
      },
      defaultImage: isPreTrainingSkill ? "original" : card.defaultImage
    };
  });

  const base = deckCards.reduce((sum, card) => sum + card.power.base, 0);
  const areaItemBonus = deckCards.reduce((sum, card) => sum + card.power.areaItemBonus, 0);
  const characterBonus = deckCards.reduce((sum, card) => sum + card.power.characterBonus, 0);
  const fixtureBonus = deckCards.reduce((sum, card) => sum + card.power.fixtureBonus, 0);
  const gateBonus = deckCards.reduce((sum, card) => sum + card.power.gateBonus, 0);
  const totalBeforeCap = deckCards.reduce((sum, card) => sum + card.power.total, 0) + honorBonus;
  const capApplied = options.mode === "wl3" && totalBeforeCap > 336_000;
  const total = options.mode === "wl3" ? Math.min(totalBeforeCap, 336_000) : totalBeforeCap;

  let eventBonus = 0;
  let appliedCardBonusCount = 0;
  let skippedCardBonusCount = 0;
  for (let orderIndex = 0; orderIndex < selectedOrder.length; orderIndex += 1) {
    const bonus = cards[selectedOrder[orderIndex]].eventBonus;
    if (!bonus) continue;
    eventBonus += bonus.fixedBonus;
    if (bonus.cardBonus > 0 && appliedCardBonusCount < cardBonusCountLimit) {
      eventBonus += bonus.cardBonus;
      appliedCardBonusCount += 1;
    } else if (bonus.cardBonus > 0) {
      skippedCardBonusCount += 1;
    }
    if (orderIndex === 0) eventBonus += bonus.leaderBonus;
  }
  eventBonus += options.differentAttributeBonus ?? 0;
  const multiLiveScoreUp = selectedOrder.reduce((sum, cardIndex, orderIndex) => {
    const score = skills[cardIndex].scoreUpFixed;
    return sum + (orderIndex === 0 ? score : score * 0.2);
  }, 0);

  const status = uniqueStrings([options.missingFields]).length ? "missing-data" : "matched";
  const deckCalculatorTrace = {
    referenceFormulaId: "Moesekai.DeckCalculator.getDeckDetailByCards",
    referenceParity: { status },
    cardCount: cards.length,
    unitMap: Object.fromEntries(unitMap),
    attrMap: Object.fromEntries(attrMap),
    eventBonus,
    differentAttributeBonus: options.differentAttributeBonus ?? 0,
    supportDeckBonus: options.supportDeckBonus ?? 0,
    totalPower: total
  };

  return {
    formulaVersion: sharedFormulaVersion,
    power: { base, areaItemBonus, characterBonus, honorBonus, fixtureBonus, gateBonus, totalBeforeCap, total },
    eventBonus,
    supportDeckBonus: options.supportDeckBonus,
    cards: selectedOrder.map((index) => cards[index]),
    deckCards,
    multiLiveScoreUp,
    wl3PowerCapTrace: options.mode === "wl3"
      ? {
          cap: 336_000,
          applied: capApplied,
          totalBeforeCap,
          totalAfterCap: total,
          referenceFormulaId: "Moesekai.DeckCalculator.getDeckDetailByCards WL3 power cap"
        }
      : undefined,
    cardBonusCountLimitTrace: {
      cardBonusCountLimit,
      appliedCardBonusCount,
      skippedCardBonusCount,
      referenceFormulaId: "Moesekai.EventCalculator.getDeckBonus"
    },
    leaderSelectionTrace: {
      referenceFormulaId: "Moesekai.DeckCalculator bestSkillAsLeader",
      selectedLeaderCardId: cards[selectedLeaderIndex]?.cardId,
      selectedLeaderScoreUp: skills[selectedLeaderIndex]?.scoreUpFixed ?? 0,
      orderedCardIds: selectedOrder.map((index) => cards[index].cardId)
    },
    skillEnumerationTrace: {
      referenceFormulaId: "Moesekai.DeckCalculator preTraining/reference skill resolution",
      strategy: "average reference skill strategy",
      doubleSkillCount: skillPrepare.filter((entry) => entry.before).length,
      selectedSkills: selectedOrder.map((index) => ({
        cardId: cards[index].cardId,
        scoreUpFixed: skills[index].scoreUpFixed,
        scoreUpToReference: skills[index].scoreUpToReference,
        hasScoreUpReference: skills[index].hasScoreUpReference,
        isAfterTraining: skills[index].isAfterTraining
      }))
    },
    powerCaseTrace: {
      referenceFormulaId: "Moesekai.CardDetailMapPower.getPower",
      cases: powerCaseTrace
    },
    cardDetailMapTrace: cards.map((card) => ({
      cardId: card.cardId,
      powerMap: card.power.trace(),
      skillMap: card.skill.trace(),
      eventBonusMap: card.eventBonus?.trace()
    })),
    cardDetailTrace: cards.map((card) => card.trace),
    deckDetailTrace: deckCalculatorTrace,
    deckCalculatorTrace,
    referenceSources: [
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/card-information/card-detail-map.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/card-information/card-detail-map-power.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/card-information/card-detail-map-skill.ts",
      "moe-sekai/Moesekai refer/re_sekai-calculator/src/deck-information/deck-calculator.ts"
    ],
    estimatedFieldsUsed: uniqueStrings([options.estimatedFieldsUsed]),
    missingFields: uniqueStrings([options.missingFields])
  };
}
