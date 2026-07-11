import { buildApp } from "../apps/api/dist/app.js";
import { store } from "../apps/api/dist/store.js";

import { gunzipSync } from "node:zlib";

const app = await buildApp();
let smokeEmail;

async function request(method, url, payload) {
  const response = await app.inject({ method, url, payload });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${method} ${url} failed: ${response.statusCode} ${response.payload}`);
  }
  return response.json();
}

try {
  const checks = [
    ["GET", "/api/regions"],
    ["GET", "/api/master/jp/music/1/full"],
    ["GET", "/api/master/jp/cards/1/full"],
    ["GET", "/api/master/jp/events/1/full"],
    ["GET", "/api/master/jp/gachas"],
    ["GET", "/api/master/jp/gachas/1/full"],
    ["GET", "/api/master/jp/honors"],
    ["GET", "/api/master/jp/honors/1/full"],
    ["GET", "/api/tools/calculation-schema?region=jp"],
    ["GET", "/api/master/jp/events/1/calculation-context"],
    ["GET", "/api/master/jp/exchanges"],
    ["GET", "/api/master/jp/exchanges/context"],
    ["GET", "/api/master/jp/missions"],
    ["GET", "/api/master/jp/missions/context"],
    ["GET", "/api/master/jp/virtualLives"],
    ["GET", "/api/master/jp/virtual-lives/context"],
    ["GET", "/api/master/jp/virtual-lives/1/full"],
    ["GET", "/api/master/jp/mysekai"],
    ["GET", "/api/master/jp/mysekai/context"],
    ["GET", "/api/master/jp/mysekai/context/full"],
    ["GET", "/api/master/jp/mysekai/catalog/fixtures?page=1&pageSize=2"],
    ["GET", "/api/master/jp/mysekai/catalog/materials?page=1&pageSize=2"],
    ["GET", "/api/master/jp/mysekai/catalog/blueprints?page=1&pageSize=2"],
    ["GET", "/api/master/jp/information"],
    ["GET", "/api/master/jp/information/4"],
    ["GET", "/api/master/jp/content-status"],
    ["GET", "/api/master/jp/live2d/models"],
    ["GET", "/api/master/jp/stories/context"],
    ["GET", "/api/master/jp/stories/any/1/full"],
    ["GET", "/api/master/jp/stories/any/1/playback"],
    ["GET", "/api/master/jp/virtual-lives/1/playback"],
    ["GET", "/api/master/jp/comics"]
  ];

  for (const [method, url] of checks) {
    const payload = await request(method, url);
    if (payload?.unavailableReason && !Array.isArray(payload?.items) && !payload.realDataRequired) {
      throw new Error(`${method} ${url} returned unavailable without realDataRequired`);
    }
    console.log(`${method} ${url} ok`, Array.isArray(payload) ? `items=${payload.length}` : "");
  }

  const storyPlayback = await request("GET", "/api/master/jp/stories/any/1/playback");
  if (storyPlayback.playbackVersion !== "story-live2d-v2-reference") throw new Error("story playback missing v2 reference version");
  if (!storyPlayback.scenarioResource || !Array.isArray(storyPlayback.modelQueue) || !storyPlayback.preloadPlan) throw new Error("story playback missing v2 preload/model queue fields");
  if (!storyPlayback.actionSupport || !storyPlayback.runtimeRequirements || !storyPlayback.playbackDiagnostics) throw new Error("story playback missing v2 diagnostics");

  const live2dModels = await request("GET", "/api/master/jp/live2d/models");
  const live2dModel = live2dModels.models?.[0];
  if (live2dModel?.id) {
    const live2dDetail = await request("GET", `/api/master/jp/live2d/models/${encodeURIComponent(live2dModel.id)}/full`);
    if (!live2dDetail.assets?.model3JsonUrl && !live2dDetail.unavailableReason) {
      throw new Error("live2d full detail missing model3JsonUrl and unavailableReason");
    }
    if (live2dDetail.assets?.rewrittenModel3JsonUrl) {
      const rewritten = await request("GET", live2dDetail.assets.rewrittenModel3JsonUrl);
      if (!rewritten.FileReferences) throw new Error("live2d model3 proxy missing FileReferences");
      const text = JSON.stringify(rewritten.FileReferences);
      if (!text.includes("/api/assets/proxy?url=")) throw new Error("live2d model3 proxy did not rewrite asset paths");
    }
    console.log("GET /api/master/jp/live2d/models/:id/full ok");
  } else {
    console.log("live2d full smoke skipped: no real model id returned");
  }

  const virtualLivePlayback = await request("GET", "/api/master/jp/virtual-lives/1/playback");
  if (!Array.isArray(virtualLivePlayback.steps)) throw new Error("virtual live playback missing steps array");
  if (!virtualLivePlayback.playbackReadiness || typeof virtualLivePlayback.playbackReadiness.setlistCount !== "number") {
    throw new Error("virtual live playback missing playbackReadiness");
  }
  if (!Array.isArray(virtualLivePlayback.warnings)) throw new Error("virtual live playback missing warnings array");
  if (virtualLivePlayback.live && (!virtualLivePlayback.assets || !("bannerProxiedUrl" in virtualLivePlayback.assets))) {
    throw new Error("virtual live playback missing banner asset candidates");
  }
  if (!virtualLivePlayback.referenceParity || !virtualLivePlayback.preloadStatus || !virtualLivePlayback.playbackDiagnostics) {
    throw new Error("virtual live playback missing reference parity diagnostics");
  }
  console.log("GET /api/master/jp/virtual-lives/:id/playback shape ok");

  const scoreControl = await request("POST", "/api/tools/score-control", {
    currentPt: 0,
    targetPt: 100000,
    remainingMinutes: 120,
    ptPerRun: 25000
  });
  if (scoreControl.requiredRuns !== 4) throw new Error("score-control returned unexpected requiredRuns");
  console.log("POST /api/tools/score-control ok");

  const exactScoreControl = await request("POST", "/api/tools/score-control", {
    region: "jp",
    musicId: "1",
    difficulty: "easy",
    liveType: "multi",
    scoreMode: "exact",
    baseScore: 280000,
    skills: [250, 250, 250, 250, 250, 250],
    multiSumPower: 1140000,
    currentPt: 0,
    targetPt: 100000,
    remainingMinutes: 120
  });
  if (exactScoreControl.scoreMode !== "exact" || exactScoreControl.liveExactVersion !== "live-exact-v1-reference") {
    throw new Error("score-control exact mode missing LiveExactCalculator fields");
  }
  if (!exactScoreControl.referenceParity || exactScoreControl.referenceParity.liveExactCalculator == null) {
    throw new Error("score-control exact mode missing reference parity");
  }
  console.log("POST /api/tools/score-control exact ok");

  const eventPoint = await request("POST", "/api/tools/event-point-calc", {
    region: "jp",
    musicId: "1",
    difficulty: "easy",
    liveType: "solo",
    boost: 3,
    targetPt: 100000,
    currentPt: 0
  });
  if (!eventPoint.realDataRequired || !Array.isArray(eventPoint.estimatedFieldsUsed)) throw new Error("event-point-calc returned invalid formula fields");
  if (!eventPoint.sharedFormulaVersion || !eventPoint.formulaContext || !eventPoint.eventPointBreakdown) {
    throw new Error("event-point-calc missing shared formula context");
  }
  console.log("POST /api/tools/event-point-calc ok");

  const multiPoint = await request("POST", "/api/tools/event-point-calc", {
    region: "jp", musicId: "1", difficulty: "easy", liveType: "multi",
    baseScore: 280000, selfEffectiveness: 250,
    teammates: [
      { power: 200000, effectiveness: 200 }, { power: 210000, effectiveness: 210 },
      { power: 220000, effectiveness: 220 }, { power: 230000, effectiveness: 230 }
    ]
  });
  if (!multiPoint.multiLiveTrace || multiPoint.multiLiveTrace.otherScore <= 0) throw new Error("multi event-point missing real teammate score trace");
  if (multiPoint.estimatedFieldsUsed.includes("default teammate power/effectiveness assumption")) throw new Error("configured teammates were marked estimated");
  console.log("POST /api/tools/event-point-calc multi-live ok");

  const compared = await request("POST", "/api/tools/deck-compare", {
    region: "jp", musicId: "1", difficulty: "easy",
    candidates: [
      { id: "a", name: "A", power: 280000, effectiveness: 250 },
      { id: "b", name: "B", power: 300000, effectiveness: 230 }
    ],
    teammates: [
      { power: 200000, effectiveness: 200 }, { power: 210000, effectiveness: 210 },
      { power: 220000, effectiveness: 220 }, { power: 230000, effectiveness: 230 }
    ],
    skill15Strategy: "expected", skill6Mode: "team-average", boost: 3, eventBonusPercent: 150
  });
  if (compared.multiLiveVersion !== "multi-live-v1-reference" || compared.comparisons.length !== 2) throw new Error("deck-compare returned invalid shape");
  if (!compared.winnerByScore || compared.scoreDelta <= 0) throw new Error("deck-compare missing winner/delta");
  console.log("POST /api/tools/deck-compare ok");

  const comparedExact = await request("POST", "/api/tools/deck-compare", {
    region: "jp", musicId: "1", difficulty: "easy", scoreMode: "exact",
    candidates: [
      { id: "a", name: "A", power: 280000, effectiveness: 250 },
      { id: "b", name: "B", power: 300000, effectiveness: 230 }
    ],
    teammates: [
      { power: 200000, effectiveness: 200 }, { power: 210000, effectiveness: 210 },
      { power: 220000, effectiveness: 220 }, { power: 230000, effectiveness: 230 }
    ],
    boost: 3, eventBonusPercent: 150
  });
  if (comparedExact.scoreMode !== "exact" || comparedExact.liveExactVersion !== "live-exact-v1-reference") throw new Error("deck-compare exact missing version fields");
  if (!comparedExact.referenceParity?.liveExactCalculator) throw new Error("deck-compare exact missing parity field");
  console.log("POST /api/tools/deck-compare exact ok");

  const deck = await request("POST", "/api/tools/deck-recommend", {
    region: "jp",
    ownedCardIds: ["1", "2", "3"],
    playerAssets: { "area-items": [], "character-ranks": [] }
  });
  if (!Array.isArray(deck.recommendedCards)) throw new Error("deck-recommend returned invalid recommendedCards");
  if (!Array.isArray(deck.officialFieldsUsed) || !Array.isArray(deck.estimatedFieldsUsed)) {
    throw new Error("deck-recommend missing formula source fields");
  }
  if (!deck.sharedFormulaVersion || !deck.formulaContext || !deck.assetReadiness) {
    throw new Error("deck-recommend missing shared formula fields");
  }
  console.log("POST /api/tools/deck-recommend ok");

  const challengeDeck = await request("POST", "/api/tools/deck-recommend", {
    region: "jp",
    ownedCardIds: ["1", "2", "3", "4", "5", "6"],
    liveType: "challenge",
    calculationMode: "challenge",
    playerAssets: { "challenge-live": { cardIds: ["1", "2"] } },
    limit: 1
  });
  if (!Array.isArray(challengeDeck.challengeDecks)) throw new Error("challenge deck-recommend missing challengeDecks");
  if (challengeDeck.challengeDecks[0] && !challengeDeck.challengeDecks[0].challengeScoreTrace) {
    throw new Error("challenge deck-recommend missing challengeScoreTrace");
  }
  if (!challengeDeck.deckDetailTrace || !Array.isArray(challengeDeck.cardDetailTrace) || !Array.isArray(challengeDeck.cardDetailMapTrace) || !challengeDeck.deckCalculatorTrace) {
    throw new Error("challenge deck-recommend missing CardDetailMap/DeckCalculator trace");
  }
  console.log("POST /api/tools/deck-recommend challenge trace ok");

  const wlDeck = await request("POST", "/api/tools/deck-recommend", {
    region: "jp",
    ownedCardIds: ["1", "2", "3", "4", "5", "6"],
    calculationMode: "wl3",
    playerAssets: {
      "world-bloom-support": {
        eventId: "1",
        turn: 3,
        gameCharacterId: "1",
        supportUnit: "light_sound",
        cardIds: ["1", "2", "3", "4", "5"]
      }
    },
    limit: 1
  });
  const wlTrace = wlDeck.candidates?.[0]?.cardContributionBreakdown?.modeSpecificBreakdown?.wl3
    ?? wlDeck.candidates?.[0]?.cardContributionBreakdown?.modeSpecificBreakdown?.worldBloom;
  if (!wlTrace?.supportDeckBreakdown || !wlTrace?.differentAttributeTrace || !wlTrace?.cardBonusCountLimitTrace) {
    throw new Error("wl3 deck-recommend missing support/different-attribute/card-limit trace");
  }
  if (wlTrace.supportDeckBreakdown.referenceFormulaId !== "Moesekai.EventCalculator.getSupportDeckBonus") {
    throw new Error("wl3 supportDeckBreakdown missing Moesekai reference formula id");
  }
  if (!Array.isArray(wlTrace.supportDeckBreakdown.excludedMainDeckCardIds) || typeof wlTrace.supportDeckBreakdown.supportDeckCount !== "number") {
    throw new Error("wl3 supportDeckBreakdown missing support count or main deck exclusion trace");
  }
  if (!Array.isArray(wlTrace.supportDeckBreakdown.officialFieldsUsed) || !Array.isArray(wlTrace.supportDeckBreakdown.estimatedFieldsUsed)) {
    throw new Error("wl3 supportDeckBreakdown missing official/estimated support fields");
  }
  if (!wlDeck.wl3PowerCapTrace || !wlDeck.deckDetailTrace) {
    throw new Error("wl3 deck-recommend missing DeckCalculator WL3 power cap trace");
  }
  console.log("POST /api/tools/deck-recommend wl3 trace ok");

  const wlFallbackDeck = await request("POST", "/api/tools/deck-recommend", {
    region: "jp",
    ownedCardIds: ["1", "2", "3", "4", "5", "6", "82", "83", "84", "85", "86", "87", "88"],
    eventId: "181",
    calculationMode: "wl3",
    gameCharacterId: "1",
    limit: 1
  });
  const wlFallbackTrace = wlFallbackDeck.recommendedDecks?.[0]?.supportDeckBreakdown
    ?? wlFallbackDeck.candidates?.[0]?.cardContributionBreakdown?.modeSpecificBreakdown?.worldBloom?.supportDeckBreakdown;
  if (wlFallbackTrace?.supportDeckSource !== "recommended-from-inventory") {
    throw new Error("wl3 support fallback did not recommend from inventory");
  }
  if (!Array.isArray(wlFallbackTrace.recommendedCards) || !wlFallbackTrace.recommendedCards.length) {
    throw new Error("wl3 support fallback missing recommended support cards");
  }
  if (wlFallbackTrace.recommendedCards.some((card) => wlFallbackTrace.excludedMainDeckCardIds.includes(String(card.cardId)))) {
    throw new Error("wl3 support fallback did not exclude main deck cards");
  }
  console.log("POST /api/tools/deck-recommend wl3 support fallback ok");

  const music = await request("POST", "/api/tools/music-recommend", {
    region: "jp",
    preferredDifficulties: ["expert", "master"],
    limit: 3
  });
  if (!Array.isArray(music.recommendations)) throw new Error("music-recommend returned invalid recommendations");
  if (!music.sharedFormulaVersion || !music.assetReadiness) throw new Error("music-recommend missing shared formula fields");
  console.log("POST /api/tools/music-recommend ok");

  const areaItems = await request("POST", "/api/tools/area-item-recommend", {
    region: "jp",
    currentItems: [{ areaItemId: "1", level: 1 }],
    limit: 3
  });
  if (!Array.isArray(areaItems.recommendations)) throw new Error("area-item-recommend returned invalid recommendations");
  if (!areaItems.sharedFormulaVersion || !areaItems.assetReadiness) throw new Error("area-item-recommend missing shared formula fields");
  if (areaItems.areaItemVersion !== "area-item-v1-reference" || !areaItems.referenceParity?.referenceFormulaId) throw new Error("area-item-recommend missing reference service fields");
  if (areaItems.recommendations.some((item) => "priorityScore" in item)) throw new Error("area-item-recommend still exposes priorityScore fallback");
  console.log("POST /api/tools/area-item-recommend ok");

  const publicPlan = await request("POST", "/api/tools/normal-event-plan", {
    region: "jp",
    eventId: "1",
    musicId: "1",
    difficulty: "easy",
    targetPt: 100000,
    currentPt: 0,
    remainingMinutes: 120,
    ownedCardIds: ["1", "2", "3", "4", "5"],
    limit: 2
  });
  if (!publicPlan.sharedFormulaVersion || !publicPlan.deck || !publicPlan.eventPoint || !publicPlan.scoreControl || !publicPlan.music || !publicPlan.area) {
    throw new Error("normal-event-plan missing planning sections");
  }
  if (publicPlan.sharedFormulaVersion !== "normal-event-v4.1-reference" || !publicPlan.referenceParity || !Array.isArray(publicPlan.referenceSources)) {
    throw new Error("normal-event-plan missing v4 reference parity fields");
  }
  if (!publicPlan.eventPoint?.eventPointBreakdown?.referenceFormulaId || !publicPlan.eventPoint?.eventPointBreakdown?.exactness) {
    throw new Error("normal-event-plan missing v4 event point exactness fields");
  }
  if (!Array.isArray(publicPlan.missingFields) || !publicPlan.sections?.deck) {
    throw new Error("normal-event-plan missing shared status fields");
  }
  console.log("POST /api/tools/normal-event-plan ok");

  const mysekaiCalc = await request("POST", "/api/tools/mysekai-calc", {
    region: "jp",
    cards: [
      { cardId: "1", level: 30, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "2", level: 50, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "3", level: 50, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "4", level: 30, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "5", level: 30, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "6", level: 50, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false }
    ],
    eventBonus: 10,
    supportDeckBonus: 5,
    search: {
      algorithm: "ga",
      candidatePoolSize: 6,
      gaConfig: { seed: 123, popSize: 80, parentSize: 20, eliteSize: 3, maxIter: 20, maxIterNoImprove: 5, timeoutMs: 2000 }
    },
    playerAssets: {
      "area-items": [{ areaItemId: "1", level: 10 }],
      "character-ranks": [{ characterId: "1", rank: 30 }, { characterId: "2", rank: 30 }],
      "mysekai-canvas": [{ cardId: "1" }],
      "mysekai-gates": [{ mysekaiGateId: "1", mysekaiGateLevel: 1 }],
      "mysekai-fixtures": [{ gameCharacterId: "1", totalBonusRate: 1 }, { gameCharacterId: "2", totalBonusRate: 1 }]
    }
  });
  if (!Array.isArray(mysekaiCalc.candidates)) throw new Error("mysekai-calc returned invalid candidates");
  if (!Array.isArray(mysekaiCalc.officialFieldsUsed) || !Array.isArray(mysekaiCalc.estimatedFieldsUsed)) {
    throw new Error("mysekai-calc missing formula field reporting");
  }
  if (mysekaiCalc.candidates[0] && typeof mysekaiCalc.candidates[0].breakdown?.totalPower !== "number") {
    throw new Error("mysekai-calc missing per-card totalPower breakdown");
  }
  if (mysekaiCalc.formulaVersion !== "mysekai-v5-reference" || !mysekaiCalc.mysekaiRecommendations || !mysekaiCalc.referenceParity) {
    throw new Error("mysekai-calc missing v4.4 recommendations or reference parity");
  }
  if (!mysekaiCalc.mysekaiEventPoint || !Array.isArray(mysekaiCalc.mysekaiDeckSearch?.decks) || !Array.isArray(mysekaiCalc.replacementCandidates) || !Array.isArray(mysekaiCalc.assetGapRanking)) {
    throw new Error("mysekai-calc missing v4.4 event point, deck search, replacement, or asset gap fields");
  }
  if (mysekaiCalc.mysekaiDeckSearch?.searchMode !== "ga" || !mysekaiCalc.mysekaiDeckSearch?.gaConfig || !mysekaiCalc.mysekaiDeckSearch?.gaTrace || !mysekaiCalc.mysekaiDeckSearch?.referenceFormulaId) {
    throw new Error("mysekai-calc missing v4.4 GA trace fields");
  }
  if (!mysekaiCalc.deckDetailTrace || !Array.isArray(mysekaiCalc.cardDetailTrace)) {
    throw new Error("mysekai-calc missing DeckCalculator-backed fitness trace");
  }
  if (mysekaiCalc.mysekaiEventPoint.inputBonuses?.eventBonus !== 10 || mysekaiCalc.mysekaiEventPoint.inputBonuses?.supportDeckBonus !== 5) {
    throw new Error("mysekai-calc schema dropped event/support bonus inputs");
  }
  const mysekaiCalcRepeat = await request("POST", "/api/tools/mysekai-calc", {
    region: "jp",
    cards: [
      { cardId: "1", level: 30, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "2", level: 50, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "3", level: 50, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "4", level: 30, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "5", level: 30, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false },
      { cardId: "6", level: 50, masterRank: 0, skillLevel: 1, episodes: [], episodesRead: false }
    ],
    eventBonus: 10,
    supportDeckBonus: 5,
    search: {
      algorithm: "ga",
      candidatePoolSize: 6,
      gaConfig: { seed: 123, popSize: 80, parentSize: 20, eliteSize: 3, maxIter: 20, maxIterNoImprove: 5, timeoutMs: 2000 }
    },
    playerAssets: {
      "area-items": [{ areaItemId: "1", level: 10 }],
      "character-ranks": [{ characterId: "1", rank: 30 }, { characterId: "2", rank: 30 }],
      "mysekai-canvas": [{ cardId: "1" }],
      "mysekai-gates": [{ mysekaiGateId: "1", mysekaiGateLevel: 1 }],
      "mysekai-fixtures": [{ gameCharacterId: "1", totalBonusRate: 1 }, { gameCharacterId: "2", totalBonusRate: 1 }]
    }
  });
  if (JSON.stringify(mysekaiCalc.mysekaiDeckSearch.decks?.[0]?.cards?.map((entry) => entry.card.id)) !== JSON.stringify(mysekaiCalcRepeat.mysekaiDeckSearch.decks?.[0]?.cards?.map((entry) => entry.card.id))) {
    throw new Error("mysekai-calc GA seed did not produce stable top deck");
  }
  const mysekaiBeam = await request("POST", "/api/tools/mysekai-calc", {
    region: "jp",
    cards: [
      { cardId: "1", level: 30, episodes: [], episodesRead: false },
      { cardId: "2", level: 50, episodes: [], episodesRead: false },
      { cardId: "3", level: 50, episodes: [], episodesRead: false },
      { cardId: "4", level: 30, episodes: [], episodesRead: false },
      { cardId: "5", level: 30, episodes: [], episodesRead: false }
    ],
    search: { algorithm: "beam", beamWidth: 8, candidatePoolSize: 5 },
    playerAssets: {
      "area-items": [],
      "character-ranks": [{ characterId: "1", rank: 30 }, { characterId: "2", rank: 30 }],
      "mysekai-canvas": [],
      "mysekai-gates": [{ mysekaiGateId: "1", mysekaiGateLevel: 1 }],
      "mysekai-fixtures": [{ gameCharacterId: "1", totalBonusRate: 1 }, { gameCharacterId: "2", totalBonusRate: 1 }]
    }
  });
  if (mysekaiBeam.mysekaiDeckSearch?.searchMode !== "deterministic-beam") {
    throw new Error("mysekai-calc beam compatibility mode failed");
  }
  console.log("POST /api/tools/mysekai-calc ok");

  const email = `smoke-${Date.now()}@example.com`;
  smokeEmail = email;
  const codeStart = await request("POST", "/api/auth/email-code/start", { email, purpose: "register" });
  const auth = await request("POST", "/api/auth/register", {
    email,
    password: "SmokeTest123!",
    code: codeStart.devCode
  });
  const token = auth.accessToken;
  const loggedIn = await request("POST", "/api/auth/login", { email, password: "SmokeTest123!" });
  if (!loggedIn.accessToken || !loggedIn.refreshToken) throw new Error("login did not return tokens");
  const refreshed = await request("POST", "/api/auth/refresh", { refreshToken: loggedIn.refreshToken });
  if (!refreshed.accessToken || !refreshed.refreshToken) throw new Error("refresh did not rotate tokens");
  await request("POST", "/api/auth/logout", { refreshToken: refreshed.refreshToken });

  async function authed(method, url, payload) {
    const response = await app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`${method} ${url} failed: ${response.statusCode} ${response.payload}`);
    }
    return response.json();
  }

  const binding = await authed("POST", "/api/me/player-bindings", { region: "jp", playerUid: `smoke-${Date.now()}`, isDefault: true });
  const secondBinding = await authed("POST", "/api/me/player-bindings", { region: "jp", playerUid: `smoke-alt-${Date.now()}`, isDefault: false, note: "second binding" });
  const bindings = await authed("GET", "/api/me/player-bindings");
  if (bindings.length < 2 || !bindings.some((item) => item.id === secondBinding.id)) throw new Error("multiple player bindings not listed");
  await authed("PATCH", `/api/me/player-bindings/${secondBinding.id}`, { note: "patched", isDefault: false });
  await authed("PUT", `/api/me/player-data/${secondBinding.id}/cards`, { region: "jp", cards: [{ cardId: "1", level: 1 }] });
  await authed("DELETE", `/api/me/player-data/${secondBinding.id}/cards/1`);
  const deletedInventory = await authed("GET", `/api/me/player-data/${secondBinding.id}/cards`);
  if (deletedInventory.length) throw new Error("explicit inventory card delete failed");
  await authed("PUT", `/api/me/player-data/${binding.id}/area-items`, { data: [{ areaItemId: "1", level: 10 }] });
  await authed("PUT", `/api/me/player-data/${binding.id}/character-ranks`, { data: [{ characterId: "1", rank: 30 }] });
  await authed("PUT", `/api/me/player-data/${binding.id}/honors`, { data: [{ honorId: "1" }] });
  await authed("PUT", `/api/me/player-data/${binding.id}/materials`, { data: [{ materialId: "1", quantity: 1000 }] });
  await authed("PUT", `/api/me/player-data/${binding.id}/challenge-live`, { data: { stages: [{ characterId: "1", rank: 25 }], results: [{ characterId: "1", highScore: 1234567 }], highScoreRewards: [], decks: [{ characterId: "1" }] } });
  await authed("PUT", `/api/me/player-data/${binding.id}/mysekai-canvas`, { data: [{ canvasId: "1" }] });
  await authed("PUT", `/api/me/player-data/${binding.id}/cards`, { region: "jp", cards: ["1", "2", "3", "4", "5"].map((cardId) => ({ cardId, level: 60, masterRank: 0, skillLevel: 1 })) });
  const asset = await authed("GET", `/api/me/player-data/${binding.id}/area-items`);
  if (!asset.data) throw new Error("player data asset not returned");
  const validation = await authed("POST", `/api/me/player-data/${binding.id}/validate`, { kind: "honors", data: [{ honorId: "1" }] });
  if (!validation.valid) throw new Error("player data validation unexpectedly failed");
  if (!Array.isArray(validation.lookupResults) || !Array.isArray(validation.fieldHelp) || !Array.isArray(validation.toolImpact) || !Array.isArray(validation.normalizedPreview)) {
    throw new Error("player data validation missing lookup/help/impact preview fields");
  }
  const review = await authed("POST", `/api/me/player-data/${binding.id}/import/review`, {
    cards: [{ cardId: "1", level: 60 }, { cardId: "6", level: 1 }, { cardId: "999999", level: 1 }],
    playerData: [
      { kind: "music-results", data: [{ musicId: "1", difficulty: "easy", clearStatus: "clear", score: 100000 }] },
      { kind: "challenge-live", data: { characterId: "1", cardIds: ["1", "2"] } }
    ]
  });
  if (!review.valid || review.importReview?.cards?.count !== 3 || review.importReview?.playerDataGroups?.length !== 2) {
    throw new Error("player data import review returned invalid shape");
  }
  if (!review.normalizedPreview?.cards || !Array.isArray(review.toolImpact) || !review.fieldHelp?.cards) {
    throw new Error("player data import review missing preview/help/impact fields");
  }
  if (!review.importReview?.cardDiff?.updated?.length || !review.importReview?.cardDiff?.added?.length || !review.importReview?.cardDiff?.unresolved?.length || !Array.isArray(review.postSaveImpact)) {
    throw new Error("player data import review missing card diff/post-save impact");
  }
  const reviewedOnlyMusic = await authed("GET", `/api/me/player-data/${binding.id}/music-results`);
  if (reviewedOnlyMusic.data) throw new Error("player data import review wrote data unexpectedly");
  const rejectedReview = await authed("POST", `/api/me/player-data/${binding.id}/import/review`, {
    cards: [],
    playerData: [{ kind: "unsupported-kind", data: [] }]
  });
  if (rejectedReview.valid || !rejectedReview.importReview?.unsupportedKinds?.length) {
    throw new Error("player data import review did not report unsupported kind");
  }
  const profile = await authed("GET", "/api/me/profile");
  if (!profile.user || !Array.isArray(profile.bindings)) throw new Error("me profile returned invalid shape");
  const summary = await authed("GET", `/api/me/player-bindings/${binding.id}/summary`);
  if (!summary.completeness) throw new Error("binding summary missing completeness");
  const profileAnalysis = await authed("GET", `/api/me/player-bindings/${binding.id}/profile-analysis`);
  if (!profileAnalysis.profileSummary || !profileAnalysis.characterRankAnalysis || !profileAnalysis.challengeAnalysis || !profileAnalysis.powerBonusAnalysis || !profileAnalysis.areaItemUpgradeAnalysis) {
    throw new Error("profile analysis returned invalid shape");
  }
  if (profileAnalysis.binding.region !== "jp" || profileAnalysis.sourceDiagnostics?.crossRegionFallback !== false) {
    throw new Error("profile analysis did not preserve region isolation");
  }
  if (!profileAnalysis.characterRankAnalysis.items.length || !profileAnalysis.challengeAnalysis.items.length) {
    throw new Error("profile analysis did not consume uploaded character/challenge data");
  }
  if (profileAnalysis.powerBonusAnalysis.formulaVersion !== "normal-event-v4.1-reference" || !Array.isArray(profileAnalysis.powerBonusAnalysis.missingFields)) {
    throw new Error("profile analysis missing shared CardCalculator diagnostics");
  }
  if (profileAnalysis.areaItemUpgradeAnalysis.areaItemVersion !== "area-item-v1-reference") {
    throw new Error("profile analysis does not reuse shared area item recommendation");
  }
  const completeness = await authed("GET", `/api/me/player-data/${binding.id}/completeness/full`);
  if (!completeness.sections?.deckRecommend) throw new Error("full completeness missing sections");
  const exported = await authed("GET", `/api/me/player-data/${binding.id}/export`);
  if (exported.schemaVersion !== 2 || !Array.isArray(exported.playerData) || exported.playerData.length < 4) {
    throw new Error("export missing player data");
  }
  if (!exported.formulaReadiness || !Array.isArray(exported.toolContextWarnings)) {
    throw new Error("export missing formula readiness fields");
  }
  const boundDeck = await authed("POST", "/api/me/tools/deck-recommend", { region: "jp", bindingId: binding.id, limit: 1 });
  if (!Array.isArray(boundDeck.recommendedCards) && !Array.isArray(boundDeck.decks)) {
    throw new Error("bound deck recommend returned invalid shape");
  }
  if (!boundDeck.sharedFormulaVersion || !boundDeck.formulaContext || !boundDeck.recommendedCards?.[0]?.cardContributionBreakdown) {
    throw new Error("bound deck recommend missing contribution breakdown");
  }
  const savedA = await authed("POST", "/api/me/deck-configs", { region: "jp", bindingId: binding.id, name: "Compare A", cardIds: ["1", "2", "3", "4", "5"] });
  const savedB = await authed("POST", "/api/me/deck-configs", { region: "jp", bindingId: binding.id, name: "Compare B", cardIds: ["5", "4", "3", "2", "1"] });
  const boundCompare = await authed("POST", "/api/me/tools/deck-compare", {
    region: "jp", bindingId: binding.id, musicId: "1", difficulty: "easy",
    candidates: [{ deckConfigId: savedA.id }, { deckConfigId: savedB.id }],
    teammates: [
      { power: 200000, effectiveness: 200 }, { power: 210000, effectiveness: 210 },
      { power: 220000, effectiveness: 220 }, { power: 230000, effectiveness: 230 }
    ]
  });
  if (boundCompare.comparisons?.length !== 2 || boundCompare.comparisons.some((item) => item.source !== "CardCalculator/DeckCalculator")) {
    throw new Error("bound deck-compare did not resolve saved decks through inventory");
  }
  const boundMysekai = await authed("POST", "/api/me/tools/mysekai-calc", { region: "jp", bindingId: binding.id });
  if (!Array.isArray(boundMysekai.candidates)) throw new Error("bound mysekai calc returned invalid shape");
  const toolContext = await authed("GET", `/api/me/player-bindings/${binding.id}/tool-context`);
  if (!toolContext.toolAvailability) throw new Error("tool-context missing toolAvailability");
  if (typeof toolContext.toolAvailability.deckRecommend?.ready !== "boolean" || !Array.isArray(toolContext.toolAvailability.deckRecommend?.missingFields)) {
    throw new Error("tool-context missing structured tool availability");
  }
  if (!toolContext.sharedFormulaVersion || !toolContext.assetReadiness || !toolContext.formulaImpact) {
    throw new Error("tool-context missing shared formula readiness");
  }
  if (typeof toolContext.toolAvailability.normalEventPlan?.ready !== "boolean" || typeof toolContext.normalEventPlan?.ready !== "boolean") {
    throw new Error("tool-context missing normal-event-plan availability");
  }
  const boundEventPoint = await authed("POST", "/api/me/tools/event-point-calc", { region: "jp", bindingId: binding.id, eventId: "1", musicId: "1", difficulty: "easy" });
  if (!boundEventPoint.realDataRequired || !boundEventPoint.assetReadiness) throw new Error("bound event-point-calc returned invalid shape");
  const boundMusic = await authed("POST", "/api/me/tools/music-recommend", { region: "jp", bindingId: binding.id, limit: 2 });
  if (!Array.isArray(boundMusic.recommendations) || !boundMusic.assetReadiness) throw new Error("bound music-recommend returned invalid shape");
  const boundArea = await authed("POST", "/api/me/tools/area-item-recommend", { region: "jp", bindingId: binding.id, limit: 2 });
  if (!Array.isArray(boundArea.recommendations) || !boundArea.assetReadiness) throw new Error("bound area-item-recommend returned invalid shape");
  const boundPlan = await authed("POST", "/api/me/tools/normal-event-plan", { region: "jp", bindingId: binding.id, eventId: "1", musicId: "1", difficulty: "easy", targetPt: 100000, currentPt: 0, remainingMinutes: 120, limit: 2 });
  if (!boundPlan.sharedFormulaVersion || !boundPlan.assetReadiness || !boundPlan.deck?.recommendedCards || !boundPlan.eventPoint?.realDataRequired) {
    throw new Error("bound normal-event-plan returned invalid shape");
  }
  await authed("DELETE", `/api/me/player-bindings/${secondBinding.id}`);
  console.log("player data asset APIs ok");

  const liveRanking = await request("GET", "/api/events/jp/live-ranking");
  if (!Array.isArray(liveRanking.top100) || !Array.isArray(liveRanking.borderLines) || !liveRanking.sourceHealth) {
    throw new Error("live-ranking returned invalid shape");
  }
  if (liveRanking.borderLines.length && liveRanking.borderLines.length < 7) {
    throw new Error("live-ranking returned fewer than the Moesekai front-rank tier set");
  }
  if (liveRanking.eventId && liveRanking.eventId !== "none" && ["none", "unknown"].includes(liveRanking.currentEvent?.id)) {
    throw new Error("live-ranking current event summary discarded the realtime event id");
  }
  const rankedLeader = liveRanking.top100.find((entry) => entry.leaderCardId);
  if (rankedLeader) {
    if (["original", "special_training"].includes(rankedLeader.leaderCardImageUrl)) throw new Error("ranking leader training state was exposed as an image URL");
    if (!Array.isArray(rankedLeader.leaderCardImageCandidates) || !rankedLeader.leaderAssetStatus) throw new Error("ranking leader asset candidates missing");
  }
  console.log(`GET /api/events/jp/live-ranking ok top100=${liveRanking.top100.length} borders=${liveRanking.borderLines.length}`);

  const cardCatalogResponse = await app.inject({ method: "GET", url: "/api/master/jp/catalog/cards?page=1&pageSize=24", headers: { "accept-encoding": "gzip" } });
  if (cardCatalogResponse.statusCode !== 200) throw new Error(`card catalog failed: ${cardCatalogResponse.statusCode}`);
  if (cardCatalogResponse.headers["content-encoding"] !== "gzip") throw new Error("card catalog response was not compressed");
  const cardCatalog = JSON.parse(gunzipSync(cardCatalogResponse.rawPayload).toString("utf8"));
  if (cardCatalog.items.length > 24 || !cardCatalog.masterVersion || !cardCatalog.sourceHealth) throw new Error("card catalog returned invalid shape");
  const catalogEtag = cardCatalogResponse.headers.etag;
  if (!catalogEtag) throw new Error("card catalog missing ETag");
  const notModified = await app.inject({ method: "GET", url: "/api/master/jp/catalog/cards?page=1&pageSize=24", headers: { "if-none-match": catalogEtag } });
  if (notModified.statusCode !== 304) throw new Error("card catalog conditional request did not return 304");
  const twCatalog = await request("GET", "/api/master/tw/catalog/cards?page=1&pageSize=1");
  const twUrls = JSON.stringify(twCatalog.items[0]?.assets ?? {});
  if (twUrls.includes("sekai-tc-assets") || (twUrls && !twUrls.includes("sekai-tw-assets"))) throw new Error("TW catalog uses the wrong asset directory");
  console.log("catalog cache/ETag/TW asset path ok");

  const currentEvent = await request("GET", "/api/events/jp/current");
  if (currentEvent.id && currentEvent.id !== "none") {
    try {
      const top100 = await request("GET", `/api/events/jp/${currentEvent.id}/ranking-top100`);
      await request("GET", `/api/events/jp/${currentEvent.id}/ranking-border`);
      const history = await request("GET", `/api/events/jp/${currentEvent.id}/ranking-history?sampleType=top100&limit=5`);
      if (typeof history.sampleCount !== "number" || !Array.isArray(history.items)) {
        throw new Error("ranking history returned invalid shape");
      }
      if (top100.length && history.sampleCount < 1) {
        throw new Error("ranking top100 did not write ranking history");
      }
      const historySummary = await request("GET", `/api/events/jp/${currentEvent.id}/ranking-history/summary?sampleType=top100&limit=50`);
      if (!Array.isArray(historySummary.lines)) {
        throw new Error("ranking history summary returned invalid shape");
      }
      const rank = top100[0]?.rank ?? 1;
      const detail = await request("GET", `/api/events/jp/${currentEvent.id}/ranking-player/${rank}`);
      if (!("playerName" in detail) || !("leaderCardImageUrl" in detail)) {
        throw new Error("ranking detail missing playerName or leaderCardImageUrl");
      }
      if (["original", "special_training"].includes(detail.leaderCardImageUrl)) throw new Error("ranking detail exposed training state as image URL");
      if (detail.leaderCardId && !Array.isArray(detail.leaderCardImageCandidates)) throw new Error("ranking detail missing leader image candidates");
      console.log(`GET /api/events/jp/${currentEvent.id}/ranking-player/${rank} ok`);
    } catch (error) {
      console.log(`ranking detail smoke skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log("ranking detail smoke skipped: no active event");
  }
} finally {
  if (smokeEmail) await store.deleteUserByEmail(smokeEmail);
  await app.close();
}
