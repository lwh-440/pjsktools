import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { calculateReferenceEventPoint, leaderBonus, sharedFormulaVersion } from "../apps/api/dist/normalEventFormula.js";
import { buildDeckDetailLike, CardDetailMapEventBonus, CardDetailMapPower, CardDetailMapSkill, getCardUnitsLike } from "../apps/api/dist/formulaDetail.js";
import { calculateLiveDetail } from "../apps/api/dist/liveCalculator.js";
import { calculateMultiLive } from "../apps/api/dist/multiLiveCalculator.js";
import { areaItemVersion } from "../apps/api/dist/areaItemRecommend.js";
import { buildExactCardDetailLike, resolveExactMysekaiServiceContext } from "../apps/api/dist/referenceCalculator.js";
import { calculateLiveExactFromMusicScore, liveExactVersion } from "../apps/api/dist/liveExactCalculator.js";
import { parseSusMusicScore } from "../apps/api/dist/musicScore.js";

const root = process.cwd();
const referenceRoot = resolve(root, "refer/Moesekai/refer/re_sekai-calculator");
const localMusicMetaCache = resolve(root, "apps/api/data/music-meta/music_metas.json");
const localReferenceMaster = resolve(root, "apps/api/data/reference-master/cn/cards.json");
const referenceFiles = {
  eventCalculator: "refer/Moesekai/refer/re_sekai-calculator/src/event-point/event-calculator.ts",
  deckCalculator: "refer/Moesekai/refer/re_sekai-calculator/src/deck-information/deck-calculator.ts",
  cardBloom: "refer/Moesekai/refer/re_sekai-calculator/src/event-point/card-bloom-event-calculator.ts",
  challengeRecommend: "refer/Moesekai/refer/re_sekai-calculator/src/deck-recommend/challenge-live-deck-recommend.ts",
  findBestGa: "refer/Moesekai/refer/re_sekai-calculator/src/deck-recommend/find-best-cards-ga.ts",
  testDataProvider: "refer/Moesekai/refer/re_sekai-calculator/test/data-provider.test.ts",
  eventCalculatorTest: "refer/Moesekai/refer/re_sekai-calculator/test/event-calculator.test.ts",
  deckCalculatorTest: "refer/Moesekai/refer/re_sekai-calculator/test/deck-calculator.test.ts",
  cardBloomTest: "refer/Moesekai/refer/re_sekai-calculator/test/card-bloom-event-calculator.test.ts",
  deckRecommendTest: "refer/Moesekai/refer/re_sekai-calculator/test/deck-recommend.test.ts",
  liveCalculatorTest: "refer/Moesekai/refer/re_sekai-calculator/test/live-calculator.test.ts"
  ,liveExactCalculator: "refer/Moesekai/refer/re_sekai-calculator/src/live-score/live-exact-calculator.ts"
};

const results = [];

function record(result) {
  results.push({
    status: "matched",
    referenceFiles: [],
    expected: undefined,
    actual: undefined,
    knownDifferences: [],
    ...result
  });
}

function assertEqual(caseId, actual, expected, referenceFiles, details = {}) {
  record({
    caseId,
    status: Object.is(actual, expected) ? "matched" : "implementation-mismatch",
    expected,
    actual,
    referenceFiles,
    ...details
  });
}

function assertAtLeast(caseId, actual, expectedMin, referenceFiles, details = {}) {
  record({
    caseId,
    status: actual >= expectedMin ? "matched" : "implementation-mismatch",
    expected: `>= ${expectedMin}`,
    actual,
    referenceFiles,
    ...details
  });
}

async function fetchReachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function runEventPointParity() {
  const refs = [referenceFiles.eventCalculator, referenceFiles.eventCalculatorTest];
  const cases = [
    {
      id: "event-point.challenge.1919810",
      input: { liveType: "challenge", eventType: "none", selfScore: 1919810 },
      expected: 23400
    },
    {
      id: "event-point.multi.2499999",
      input: { liveType: "multi", eventType: "marathon", selfScore: 2499999, musicRate: 100, deckBonus: 260, boostRate: 15, otherScore: 8888888 },
      expected: 14580
    },
    {
      id: "event-point.multi.1907777",
      input: { liveType: "multi", eventType: "marathon", selfScore: 1907777, musicRate: 100, deckBonus: 125, boostRate: 15, otherScore: 8888888 },
      expected: 7920
    },
    {
      id: "event-point.multi.2302222",
      input: { liveType: "multi", eventType: "marathon", selfScore: 2302222, musicRate: 100, deckBonus: 315, boostRate: 10, otherScore: 8888888 },
      expected: 10700
    },
    {
      id: "event-point.multi.2070000",
      input: { liveType: "multi", eventType: "marathon", selfScore: 2070000, musicRate: 100, deckBonus: 285, boostRate: 23, otherScore: 8888888 },
      expected: 21597
    },
    {
      id: "event-point.multi.2061111",
      input: { liveType: "multi", eventType: "marathon", selfScore: 2061111, musicRate: 100, deckBonus: 271, boostRate: 10, otherScore: 8888888 },
      expected: 9050
    },
    {
      id: "event-point.cheerful.2358888",
      input: { liveType: "cheerful", eventType: "cheerful", selfScore: 2358888, musicRate: 113, deckBonus: 361, boostRate: 10, otherScore: 8888888 },
      expected: 18340
    },
    {
      id: "event-point.cheerful.2384444",
      input: { liveType: "cheerful", eventType: "cheerful", selfScore: 2384444, musicRate: 113, deckBonus: 361, boostRate: 5, otherScore: 8888888 },
      expected: 9245
    },
    {
      id: "event-point.cheerful.2397777",
      input: { liveType: "cheerful", eventType: "cheerful", selfScore: 2397777, musicRate: 111, deckBonus: 361, boostRate: 15, otherScore: 8888888 },
      expected: 27330
    },
    {
      id: "event-point.cheerful.2469999",
      input: { liveType: "cheerful", eventType: "cheerful", selfScore: 2469999, musicRate: 108, deckBonus: 361, boostRate: 15, otherScore: 8888888 },
      expected: 27000
    },
    {
      id: "event-point.cheerful.life.3113333",
      input: { liveType: "cheerful", eventType: "cheerful", selfScore: 3113333, musicRate: 111, deckBonus: 270, boostRate: 1, otherScore: 8888888, life: 920 },
      expected: 1675
    },
    {
      id: "event-point.cheerful.life.1927777",
      input: { liveType: "cheerful", eventType: "cheerful", selfScore: 1927777, musicRate: 120, deckBonus: 361, boostRate: 1, otherScore: 3699999, life: 920 },
      expected: 1718
    },
    {
      id: "event-point.cheerful.default-life.3213333",
      input: { liveType: "cheerful", eventType: "cheerful", selfScore: 3213333, musicRate: 108, deckBonus: 270, boostRate: 1, otherScore: 8888888 },
      expected: 1682
    }
  ];

  for (const item of cases) {
    const actual = calculateReferenceEventPoint({
      musicRate: 100,
      deckBonus: 0,
      boostRate: 1,
      ...item.input
    }).estimatedPt;
    assertEqual(item.id, actual, item.expected, refs, {
      referenceParity: { status: actual === item.expected ? "matched" : "implementation-mismatch" }
    });
  }
}

function makePower(total, base = total) {
  const power = new CardDetailMapPower();
  const detail = { base, areaItemBonus: 0, characterBonus: 0, fixtureBonus: 0, gateBonus: 0, total };
  power.setPower("any", false, false, detail);
  power.setPower("unit", true, false, detail);
  return Object.assign(power, {
    ...detail,
    breakdown: { estimatedPower: total }
  });
}

function makeSkill(cardId, scoreUp, lifeRecovery = 0) {
  const skill = new CardDetailMapSkill();
  const detail = { skillId: cardId, isAfterTraining: true, scoreUpFixed: scoreUp, scoreUpToReference: scoreUp, lifeRecovery };
  skill.setSkill("any", 1, 1, scoreUp, detail);
  skill.setSkill("unit", 5, 1, scoreUp, detail);
  return Object.assign(skill, {
    scoreUpBasic: scoreUp,
    scoreUpCharacterRank: 0,
    scoreUpSameUnit: 0,
    scoreUpDifferentUnit: 0,
    scoreUpReferenceMax: 0,
    scoreUpFixed: scoreUp,
    scoreUpToReference: scoreUp,
    lifeRecovery,
    judgeSupport: 0,
    referenceLimited: false
  });
}

function makeEventBonus(fixedBonus, cardBonus, leaderBonus = 0) {
  const bonus = new CardDetailMapEventBonus();
  const detail = { fixedBonus, cardBonus, leaderBonus };
  bonus.setBonus("any", 1, 1, detail);
  return Object.assign(bonus, detail);
}

function makeCard(cardId, scoreUp, power, eventBonus) {
  return {
    cardId: String(cardId),
    level: 60,
    skillLevel: 4,
    masterRank: 5,
    cardRarityType: "rarity_4",
    characterId: String(cardId),
    units: ["unit"],
    attr: ["cool", "cute", "pure", "happy", "mysterious"][cardId % 5],
    power: makePower(power),
    skill: makeSkill(cardId, scoreUp),
    eventBonus,
    trace: { parityFixture: "synthetic DeckCalculator behavior case" }
  };
}

function runDeckCalculatorInvariantParity() {
  const refs = [referenceFiles.deckCalculator, referenceFiles.deckCalculatorTest];
  const deck = [
    makeCard(510, 80, 55000, makeEventBonus(25, 25, 10)),
    makeCard(87, 100, 54000, makeEventBonus(10, 15, 0)),
    makeCard(196, 40, 53000, makeEventBonus(10, 15, 0)),
    makeCard(152, 85, 52000, makeEventBonus(10, 15, 0)),
    makeCard(219, 80, 51000, makeEventBonus(10, 15, 0))
  ];
  const detail = buildDeckDetailLike(deck, { mode: "normal", honorBonus: 1000 });
  assertEqual("deck-calculator.synthetic.formula-version", detail.formulaVersion, sharedFormulaVersion, refs);
  assertEqual("deck-calculator.synthetic.power-total", detail.power.total, 266000, refs);
  assertEqual("deck-calculator.synthetic.best-skill-leader", detail.deckCards[0]?.cardId, "87", refs);
  assertEqual("deck-calculator.synthetic.event-bonus-leader", detail.eventBonus, 150, refs);
  assertEqual("deck-calculator.synthetic.multi-live-score-up", detail.multiLiveScoreUp, 157, refs);

  const wl3 = buildDeckDetailLike(deck, { mode: "wl3", honorBonus: 100000 });
  assertEqual("deck-calculator.synthetic.wl3-cap", wl3.power.total, 336000, refs);
  assertEqual("deck-calculator.synthetic.wl3-card-limit", wl3.cardBonusCountLimitTrace?.cardBonusCountLimit, 4, refs);
  assertAtLeast("deck-calculator.synthetic.trace-card-count", detail.cardDetailMapTrace.length, 5, refs);
}

function runLiveCalculatorParity() {
  const refs = [referenceFiles.liveCalculatorTest, "refer/Moesekai/refer/re_sekai-calculator/src/live-score/live-calculator.ts"];
  const deck = buildDeckDetailLike([
    makeCard(1, 100, 50000, makeEventBonus(0, 0)),
    makeCard(2, 80, 49000, makeEventBonus(0, 0)),
    makeCard(3, 60, 48000, makeEventBonus(0, 0)),
    makeCard(4, 40, 47000, makeEventBonus(0, 0)),
    makeCard(5, 20, 46000, makeEventBonus(0, 0))
  ]);
  const meta = {
    musicId: "1", difficulty: "master", musicTime: 120, eventRate: 100,
    baseScore: 1, baseScoreAuto: 0.7,
    skillScoreSolo: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    skillScoreAuto: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3],
    skillScoreMulti: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15],
    feverScore: 0.5, feverEndTime: 80, tapCount: 1000, source: "synthetic"
  };
  const solo = calculateLiveDetail(deck, meta, "solo");
  const expectedSoloRate = 1 + (20 * 0.1 + 40 * 0.2 + 60 * 0.3 + 80 * 0.4 + 100 * 0.5 + 100 * 0.6) / 100;
  assertEqual("live-calculator.synthetic.solo", solo.score, Math.floor(expectedSoloRate * deck.power.total * 4), refs);
  const challenge = calculateLiveDetail(deck, meta, "challenge");
  assertEqual("live-calculator.synthetic.challenge", challenge.score, solo.score, refs);
  const multi = calculateLiveDetail(deck, meta, "multi");
  const multiSkill = 100 + (80 + 60 + 40 + 20) / 5;
  const multiRate = 1 + 0.5 * 0.5 + 6 * multiSkill * 0.15 / 100;
  const activeBonus = 5 * 0.015 * (5 * deck.power.total);
  assertEqual("live-calculator.synthetic.multi", multi.score, Math.floor(multiRate * deck.power.total * 4 + activeBonus), refs);
  const auto = calculateLiveDetail(deck, meta, "auto");
  assertAtLeast("live-calculator.synthetic.auto-positive", auto.score, 1, refs);
}

function runMultiLiveCalculatorParity() {
  const refs = ["refer/Moesekai/web/src/lib/deck-comparator/calculator.ts"];
  const musicMeta = {
    musicId: "1", difficulty: "master", musicTime: 120, eventRate: 100,
    baseScore: 1.25, baseScoreAuto: 1, skillScoreSolo: [], skillScoreAuto: [],
    skillScoreMulti: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], feverScore: 0.4,
    feverEndTime: 0, tapCount: 1000, source: "fixture"
  };
  const players = [
    { power: 280000, effectiveness: 250 },
    { power: 200000, effectiveness: 200 },
    { power: 210000, effectiveness: 210 },
    { power: 220000, effectiveness: 220 },
    { power: 230000, effectiveness: 230 }
  ];
  const expected = calculateMultiLive({ players, musicMeta, skill15Strategy: "expected", skill6Mode: "team-average" });
  const avgEffect = players.reduce((sum, player) => sum + player.effectiveness, 0) / 5;
  const baseRate = musicMeta.baseScore + musicMeta.feverScore * 0.5;
  const skill15 = avgEffect * musicMeta.skillScoreMulti.slice(0, 5).reduce((sum, value) => sum + value, 0) / 100;
  const skill6 = avgEffect * musicMeta.skillScoreMulti[5] / 100;
  const active = 5 * 0.015 * players.reduce((sum, player) => sum + player.power, 0);
  assertEqual("multi-live.expected.self-score", expected.selfScore, Math.floor((baseRate + skill15 + skill6) * players[0].power * 4 + active), refs);
  assertEqual("multi-live.expected.other-score", expected.otherScore, players.slice(1).reduce((sum, player) => sum + Math.floor((baseRate + skill15 + skill6) * player.power * 4 + active), 0), refs);
  const best = calculateMultiLive({ players, musicMeta, skill15Strategy: "best", skill6Mode: "highest-power" });
  assertEqual("multi-live.best.skill6-highest-power", best.skill6Effectiveness, 250, refs);
  assertEqual("multi-live.best-range", best.details.scoreBest >= best.details.scoreWorst, true, refs);
}

function runLiveExactCalculatorParity() {
  const refs = [referenceFiles.liveExactCalculator];
  assertEqual("live-exact.version", liveExactVersion, "live-exact-v1-reference", refs);
  const score = {
    notes: [
      { time: 0, type: 1 },
      { time: 1, type: 2 },
      { time: 6, type: 1 },
      { time: 9, type: 2 },
      { time: 10, type: 1 },
      { time: 11, type: 2 },
      { time: 12, type: 1 },
      { time: 13, type: 2 },
      { time: 14, type: 1 },
      { time: 15, type: 2 }
    ],
    skills: [{ time: 0 }, { time: 10 }],
    fevers: [{ time: 9 }]
  };
  const ingameNotes = [
    { id: 1, scoreCoefficient: 1 },
    { id: 2, scoreCoefficient: 2 }
  ];
  const ingameCombos = [
    { fromCount: 1, toCount: 5, scoreCoefficient: 1 },
    { fromCount: 6, toCount: 999, scoreCoefficient: 1.1 }
  ];
  const detail = calculateLiveExactFromMusicScore({
    musicScore: score,
    ingameNotes,
    ingameCombos,
    power: 1000,
    skills: [100, 120],
    liveType: "multi",
    multiSumPower: 5000
  });
  const coefficientTotal = 15;
  const expectedFirst = 1 * 1 * 1 * 1 * 1000 * 4 / coefficientTotal;
  const expectedFeverWindow = 2 * 1 * 1 * 0.5 * 1000 * 4 / coefficientTotal;
  assertEqual("live-exact.note-count", detail.notes.length, 10, refs);
  assertEqual("live-exact.coefficient-total", detail.coefficientTotal, coefficientTotal, refs);
  assertEqual("live-exact.first-note-score", Math.round(detail.notes[0].score * 1000), Math.round(expectedFirst * 1000), refs);
  assertEqual("live-exact.fever-window", Math.round(detail.notes[3].score * 1000), Math.round(expectedFeverWindow * 1000), refs);
  assertEqual("live-exact.active-bonus", detail.activeBonus, 5 * 0.015 * 5000, refs);

  const sus = "#BPM 120\n#00011:0100\n#00008:0100\n#00116:0100\n";
  const parsed = parseSusMusicScore(sus);
  assertEqual("live-exact.sus-parser.notes", parsed.score?.notes.length, 1, refs);
  assertEqual("live-exact.sus-parser.skills", parsed.score?.skills.length, 1, refs);
  assertEqual("live-exact.sus-parser.fevers", parsed.score?.fevers.length, 1, refs);
}

function runAreaItemReferenceParity() {
  const refs = [
    "refer/Moesekai/refer/re_sekai-calculator/src/area-item-information/area-item-service.ts",
    "refer/Moesekai/refer/re_sekai-calculator/src/area-item-recommend/area-item-recommend.ts"
  ];
  const shopId = (areaItemId, level) => (level <= 10 ? 1000 + (areaItemId - 1) * 10 : 1540 + (areaItemId - 1) * 5) + level;
  assertEqual("area-item.version", areaItemVersion, "area-item-v1-reference", refs);
  assertEqual("area-item.shop-id.level-1", shopId(1, 1), 1001, refs);
  assertEqual("area-item.shop-id.level-10", shopId(55, 10), 1550, refs);
  assertEqual("area-item.shop-id.level-11", shopId(1, 11), 1551, refs);
  assertEqual("area-item.shop-id.level-15", shopId(55, 15), 1825, refs);
}

async function runMysekaiCardCalculatorParity() {
  const refs = [
    "refer/Moesekai/refer/re_sekai-calculator/src/card-information/card-power-calculator.ts",
    "refer/Moesekai/refer/re_sekai-calculator/src/mysekai-information/mysekai-service.ts",
    "refer/Moesekai/refer/re_sekai-calculator/src/mysekai-information/mysekai-event-calculator.ts",
    "refer/Moesekai/refer/re_sekai-calculator/src/deck-recommend/mysekai-deck-recommend.ts"
  ];
  const cards = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(resolve(root, "apps/api/data/reference-master/cn/cards.json"), "utf8")));
  const raw = cards.find((card) => card.id === 1);
  const card = {
    id: "1", characterId: String(raw.characterId), character: "fixture", characterUnit: "light_sound",
    title: "fixture", rarity: 1, cardRarityType: raw.cardRarityType, attribute: raw.attr,
    supportUnit: raw.supportUnit, skillId: String(raw.skillId)
  };
  const assets = {
    "area-items": [],
    "character-ranks": [{ characterId: String(raw.characterId), rank: 1 }],
    "mysekai-canvas": [{ cardId: "1" }],
    "mysekai-gates": [{ mysekaiGateId: "1", mysekaiGateLevel: 1 }],
    "mysekai-fixtures": [{ gameCharacterId: String(raw.characterId), totalBonusRate: 30 }]
  };
  const service = await resolveExactMysekaiServiceContext("cn", assets);
  assertEqual("mysekai-service.gate-unit", service.gateBonuses[0]?.unit, "light_sound", refs);
  assertEqual("mysekai-service.gate-rate", service.gateBonuses[0]?.powerBonusRate, 0.10000000149011612, refs);
  const exact = await buildExactCardDetailLike({
    region: "cn", card, owned: { cardId: "1", level: 30, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
    service, mysekaiFixtureLimit: 20
  });
  assertEqual("mysekai-card-detail.available", Boolean(exact.detail), true, refs);
  assertEqual("mysekai-card-detail.missing", exact.missingFields.length, 0, refs);
  assertEqual("mysekai-card-detail.fixture-limit", exact.detail?.power.fixtureBonus > 0, true, refs);
  assertEqual("mysekai-card-detail.canvas", exact.detail?.trace.hasCanvasBonus, true, refs);
  assertEqual("mysekai-card-detail.skill-map-diff", exact.detail?.skill.trace().keys.includes("diff-2-1"), true, refs);
  const fixtureLimits = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(resolve(root, "apps/api/data/reference-master/cn/eventMysekaiFixtureGameCharacterPerformanceBonusLimits.json"), "utf8")));
  assertEqual("mysekai-event.finale-fixture-limit", fixtureLimits.find((row) => row.eventId === 180)?.bonusRateLimit, 20, refs);
  const detail = buildDeckDetailLike([exact.detail], { mode: "normal" });
  const powerBonus = Math.floor((1 + detail.power.total / 450000) * 10 + 1e-6) / 10;
  const expectedInternal = powerBonus * 500;
  assertEqual("mysekai-event.internal-point", powerBonus * 500, expectedInternal, refs);
}

function collectionItem(id, raw) {
  return { id: String(id), raw };
}

function runWorldBloomEventConfigParity() {
  const refs = [referenceFiles.eventCalculator, "refer/Moesekai/refer/re_sekai-calculator/src/event-point/card-event-calculator.ts", "refer/Moesekai/refer/re_sekai-calculator/src/card-information/card-service.ts"];
  const unitTrace = getCardUnitsLike({
    id: "1",
    characterId: "21",
    character: "Hatsune Miku",
    characterUnit: "piapro",
    title: "fixture",
    rarity: 4,
    attribute: "cool",
    supportUnit: "light_sound"
  });
  assertEqual("card-service.units.raw-character-unit", unitTrace.units.sort().join(","), "light_sound,piapro", refs);
  assertEqual("card-service.units.raw-source", unitTrace.trace.source, "raw gameCharacters.unit", refs);

  const config = {
    eventId: "999",
    eventCards: [collectionItem(1, { eventId: 999, cardId: 1, bonusRate: 20, leaderBonusRate: 10 })],
    eventDeckBonuses: [],
    eventRarityBonusRates: [],
    gameCharacterUnits: [],
    eventHonorBonuses: [
      collectionItem(10, { eventId: 999, honorId: 100, leaderGameCharacterId: 1, bonusRate: 5 }),
      collectionItem(11, { eventId: 999, honorId: 101, leaderGameCharacterId: 1, bonusRate: 7 })
    ],
    missingFields: [],
    source: {}
  };
  const card = { id: "1", characterId: "1", character: "Ichika", characterUnit: "light_sound", title: "fixture", rarity: 4, attribute: "cool", supportUnit: "light_sound" };
  const leader = leaderBonus(card, config, { honors: [{ honorId: 100 }, { honorId: 9999 }] });
  assertEqual("card-event.leader.card-bonus", leader.trace.cardLeaderBonus, 10, refs);
  assertEqual("card-event.leader.owned-honor", leader.trace.ownedHonorBonus, 5, refs);
  assertEqual("card-event.leader.total", leader.bonus, 15, refs);
  assertEqual("card-event.leader.matched-count", leader.trace.matchedHonors.length, 1, refs);

  const deck = [
    makeCard(1, 100, 50000, makeEventBonus(10, 20, 15)),
    makeCard(2, 90, 50000, makeEventBonus(10, 20, 99)),
    makeCard(3, 80, 50000, makeEventBonus(10, 20, 0)),
    makeCard(4, 70, 50000, makeEventBonus(10, 20, 0)),
    makeCard(5, 60, 50000, makeEventBonus(10, 20, 0))
  ];
  const detail = buildDeckDetailLike(deck, { mode: "wl3", cardBonusCountLimit: 3, differentAttributeBonus: 25 });
  assertEqual("event-calculator.dynamic-card-limit", detail.cardBonusCountLimitTrace.cardBonusCountLimit, 3, refs);
  assertEqual("event-calculator.dynamic-card-limit-applied", detail.cardBonusCountLimitTrace.appliedCardBonusCount, 3, refs);
  assertEqual("event-calculator.leader-only-and-attr", detail.eventBonus, 150, refs);
}

async function runReferenceFixtureAvailability() {
  const refs = [referenceFiles.testDataProvider, referenceFiles.deckCalculatorTest, referenceFiles.deckRecommendTest, referenceFiles.liveCalculatorTest];
  const localMaster = existsSync(resolve(referenceRoot, "sekai-master-db-diff")) || existsSync(localReferenceMaster);
  const localMusicMeta = existsSync(resolve(referenceRoot, "music_metas.json")) || existsSync(localMusicMetaCache);
  const localUserData = existsSync(resolve(referenceRoot, "mock-user-data.json"));
  const remoteMaster = localMaster ? { ok: true, local: true } : await fetchReachable("https://sekai-world.github.io/sekai-master-db-diff/cards.json");
  const remoteMusicMeta = localMusicMeta ? { ok: true, local: true } : await fetchReachable("https://storage.sekai.best/sekai-best-assets/music_metas.json");

  record({
    caseId: "reference-fixture.master-data",
    status: localMaster || remoteMaster.ok ? "matched" : "master-missing",
    expected: "local sekai-master-db-diff or reachable Moesekai remote master",
    actual: { localMaster, remoteMaster },
    referenceFiles: refs,
    knownDifferences: localMaster ? [] : ["Local reference master fixture is absent; harness can use Moesekai remote source for future full fixture parity."]
  });
  record({
    caseId: "reference-fixture.music-meta",
    status: localMusicMeta || remoteMusicMeta.ok ? "matched" : "master-missing",
    expected: "local music_metas.json or reachable Moesekai music meta URL",
    actual: { localMusicMeta, remoteMusicMeta },
    referenceFiles: refs,
    knownDifferences: localMusicMeta ? [] : ["Local music_metas.json is absent; harness can use Moesekai remote music meta for future full fixture parity."]
  });
  record({
    caseId: "reference-fixture.mock-user-data",
    status: localUserData ? "matched" : "user-data-missing",
    expected: "mock-user-data.json from Moesekai TestDataProvider",
    actual: { localUserData },
    referenceFiles: refs,
    knownDifferences: localUserData ? [] : [
      "Moesekai keeps mock-user-data.json in .gitignore, so the cloned reference does not provide a public fixed user-data fixture.",
      "Full deck/live/recommend fixture parity needs either a supplied fixture or a real player UID export supplied later."
    ]
  });
}

function printSummary() {
  const byStatus = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  for (const item of results) {
    const mark = item.status === "matched" ? "ok" : item.status;
    console.log(`[${mark}] ${item.caseId}`);
    if (item.status !== "matched") {
      console.log(`  expected: ${JSON.stringify(item.expected)}`);
      console.log(`  actual: ${JSON.stringify(item.actual)}`);
      if (item.knownDifferences?.length) console.log(`  knownDifferences: ${item.knownDifferences.join(" | ")}`);
    }
  }
  console.log(`\nMoesekai parity summary: ${JSON.stringify(byStatus)}`);
}

runEventPointParity();
runDeckCalculatorInvariantParity();
runLiveCalculatorParity();
runMultiLiveCalculatorParity();
runLiveExactCalculatorParity();
runAreaItemReferenceParity();
runWorldBloomEventConfigParity();
await runMysekaiCardCalculatorParity();
await runReferenceFixtureAvailability();
printSummary();

const hardFailures = results.filter((item) => item.status === "implementation-mismatch");
if (hardFailures.length) {
  process.exitCode = 1;
}
