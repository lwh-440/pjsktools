const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith("--")) continue;
  const key = token.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, "true");
  }
}

const region = args.get("region") ?? "cn";
const uid = args.get("uid") ?? "7485929717040896807";
const suiteBase = args.get("suite-base") ?? "https://suite-api.haruki.seiunx.com/public";
const toolboxBase = args.get("toolbox-base") ?? "https://toolbox-api-direct.haruki.seiunx.com";
const trace = args.get("trace") === "true";
const runProfileAnalysis = args.get("profile-analysis") === "run";
const mark = (label) => { if (trace) console.error(`[verify-real-uid] ${label}`); };

process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
process.env.PJSKTOOLS_FAST_MASTER_REFRESH = "true";
process.env.PJSKTOOLS_SILENT_APP_LOGS = "true";
delete process.env.DATABASE_URL;

const { buildApp } = await import("../apps/api/dist/app.js");
const { store } = await import("../apps/api/dist/store.js");
const { normalizeSuitePlayerDataImport, suiteUserDataKeys } = await import("../apps/api/dist/playerSummary.js");

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function summarizeObject(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  if (value == null) return 0;
  return 1;
}

function summarizeTool(payload) {
  return {
    formulaVersion: payload?.formulaVersion ?? payload?.sharedFormulaVersion,
    referenceParityStatus: payload?.referenceParity?.status ?? payload?.referenceParity?.eventPoint ?? undefined,
    missingFields: Array.isArray(payload?.missingFields) ? payload.missingFields.slice(0, 20) : undefined,
    estimatedFieldsUsed: Array.isArray(payload?.estimatedFieldsUsed) ? payload.estimatedFieldsUsed.slice(0, 20) : undefined,
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.slice(0, 10) : undefined,
    assetReadiness: payload?.assetReadiness,
    sectionKeys: payload?.sections ? Object.keys(payload.sections) : undefined
  };
}

async function injectJson(app, method, url, payload, token) {
  const response = await app.inject({
    method,
    url,
    payload,
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
  let json;
  try {
    json = response.json();
  } catch {
    json = { raw: response.payload };
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const message = typeof response.payload === "string" ? response.payload.slice(0, 500) : JSON.stringify(json).slice(0, 500);
    throw new Error(`${method} ${url} failed: ${response.statusCode} ${message}`);
  }
  return json;
}

async function injectStatus(app, method, url, payload, token, headers = {}) {
  const startedAt = Date.now();
  const response = await app.inject({
    method,
    url,
    payload,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });
  let json;
  try {
    json = response.json();
  } catch {
    json = undefined;
  }
  const contentType = response.headers["content-type"];
  const pngDimensions = contentType === "image/png" && response.rawPayload.length >= 24
    ? { width: response.rawPayload.readUInt32BE(16), height: response.rawPayload.readUInt32BE(20) }
    : undefined;
  return {
    status: response.statusCode,
    durationMs: Date.now() - startedAt,
    headers: response.headers,
    json,
    bodyBytes: response.rawPayload.length,
    pngDimensions
  };
}

const suiteUrl = `${suiteBase}/${region}/suite/${encodeURIComponent(uid)}?key=${encodeURIComponent(suiteUserDataKeys.join(","))}`;
const toolboxProfileUrl = `${toolboxBase}/event-tracker/api/v2/web/players/${region}/${encodeURIComponent(uid)}/profile`;

const [suiteResponse, toolboxProfile] = await Promise.all([
  fetchText(suiteUrl, 30000),
  fetchText(toolboxProfileUrl, 15000)
]);

if (!suiteResponse.ok) {
  console.log(JSON.stringify({
    realUidCaseId: `${region}:${uid}`,
    suiteSourceStatus: { ok: false, status: suiteResponse.status, error: suiteResponse.error, body: suiteResponse.text?.slice(0, 500) },
    toolboxProfileStatus: { ok: toolboxProfile.ok, status: toolboxProfile.status, error: toolboxProfile.error, body: toolboxProfile.text?.slice(0, 300) },
    requiresUserExport: true
  }, null, 2));
  process.exitCode = 1;
  process.exit();
}

let suitePayload = JSON.parse(suiteResponse.text);
let normalized = normalizeSuitePlayerDataImport(region, suitePayload);
let normalizedImportBody = {
  cards: normalized.cards,
  playerData: normalized.playerData
};
const player = normalized.sourceSummary;
const normalizedImportPreview = {
  cardCount: normalized.cards.length,
  playerData: normalized.normalizedPreview.playerData,
  unmappedKeys: Object.keys(normalized.normalizedPreview.unmapped)
};
const fallbackCardIds = normalized.cards.slice(0, 10).map((item) => String(item.cardId));
const suiteAssetCounts = Object.fromEntries(Object.entries(suitePayload).map(([key, value]) => [key, summarizeObject(value)]));
const sourceDiagnostics = {
  suitePublic: { ok: true, status: suiteResponse.status, url: suiteUrl.replace(uid, "{uid}") },
  toolboxProfile: { ok: toolboxProfile.ok, status: toolboxProfile.status, body: toolboxProfile.text?.slice(0, 300) },
  note: toolboxProfile.ok ? "toolbox profile route available" : "toolbox profile route is diagnostic only; Suite Public API is authoritative for this run"
};

const app = await buildApp();
const email = `real-uid-${region}-${uid}-${Date.now()}@example.com`;
let token;
let binding;
let imported;
let review;
let toolContext;
let completeness;
let bindingSummary;
let profileAnalysis;
let exportSummary;
let interfaceChecks;
const toolRunResults = {};

try {
  mark("registering temporary account");
  const code = await injectJson(app, "POST", "/api/auth/email-code/start", { email, purpose: "register" });
  const auth = await injectJson(app, "POST", "/api/auth/register", { email, password: "RealUidSmoke123!", code: code.devCode });
  token = auth.accessToken;
  binding = await injectJson(app, "POST", "/api/me/player-bindings", {
    region,
    playerUid: uid,
    displayName: player.name,
    isDefault: true,
    note: "verify-real-uid temporary binding"
  }, token);

  mark("reviewing Suite import");
  const reviewResponse = await injectJson(app, "POST", `/api/me/player-data/${binding.id}/import/review`, suitePayload, token);
  review = {
    valid: reviewResponse.valid,
    summary: reviewResponse.summary,
    sourceType: reviewResponse.importReview?.sourceType,
    cardLookup: reviewResponse.importReview?.cards ? {
      count: reviewResponse.importReview.cards.count,
      unknownLookupCount: reviewResponse.importReview.cards.unknownLookupCount,
      sampleLookupResults: Array.isArray(reviewResponse.importReview.cards.lookupResults)
        ? reviewResponse.importReview.cards.lookupResults.slice(0, 5)
        : []
    } : undefined,
    playerDataGroups: reviewResponse.importReview?.playerDataGroups?.map((group) => ({
      kind: group.kind,
      itemCount: group.itemCount,
      warningCount: group.validation?.warnings?.length ?? 0,
      errorCount: group.validation?.errors?.length ?? 0
    }))
  };
  mark("importing Suite data");
  const importedResponse = await injectJson(app, "POST", `/api/me/player-data/${binding.id}/import`, normalizedImportBody, token);
  imported = {
    cards: importedResponse.imported,
    playerDataKinds: importedResponse.importedPlayerData,
    formulaReadiness: importedResponse.formulaReadiness
  };
  mark("reading tool context and completeness");
  const toolContextResponse = await injectJson(app, "GET", `/api/me/player-bindings/${binding.id}/tool-context`, undefined, token);
  toolContext = {
    binding: toolContextResponse.binding,
    formulaReadiness: toolContextResponse.formulaReadiness,
    toolAvailability: toolContextResponse.toolAvailability,
    warnings: toolContextResponse.toolContextWarnings
  };
  completeness = await injectJson(app, "GET", `/api/me/player-data/${binding.id}/completeness/full`, undefined, token);
  mark("reading binding summary");
  const bindingSummaryResponse = await injectJson(app, "GET", `/api/me/player-bindings/${binding.id}/summary`, undefined, token);
  bindingSummary = {
    inventoryCount: bindingSummaryResponse.inventoryCount,
    playerDataKinds: Array.isArray(bindingSummaryResponse.playerData) ? bindingSummaryResponse.playerData.map((item) => item.kind) : [],
    includesPublicProfileSnapshot: Boolean(bindingSummaryResponse.publicProfileSnapshot)
  };
  if (runProfileAnalysis) {
    mark("running profile analysis");
    const profileAnalysisResponse = await injectJson(app, "GET", `/api/me/player-bindings/${binding.id}/profile-analysis`, undefined, token);
    profileAnalysis = {
      status: "completed",
      sourceDiagnostics: profileAnalysisResponse.sourceDiagnostics,
      missingFields: profileAnalysisResponse.missingFields,
      sectionKeys: profileAnalysisResponse.sections ? Object.keys(profileAnalysisResponse.sections) : []
    };
  } else {
    profileAnalysis = {
      status: "isolated-probe-required",
      reason: "Run with --profile-analysis run; the batch verifier executes this memory-intensive endpoint in a separate process."
    };
  }

  mark("checking pagination, export, validation, access control, and sharing");
  const bindingsPage = await injectJson(app, "GET", "/api/me/player-bindings?page=1&pageSize=1", undefined, token);
  const cardsPage = await injectJson(app, "GET", `/api/me/player-data/${binding.id}/cards?page=1&pageSize=5`, undefined, token);
  const exported = await injectJson(app, "GET", `/api/me/player-data/${binding.id}/export`, undefined, token);
  exportSummary = {
    schemaVersion: exported.schemaVersion,
    cardCount: Array.isArray(exported.cards) ? exported.cards.length : 0,
    playerDataKinds: Array.isArray(exported.playerData) ? exported.playerData.map((item) => item.kind) : [],
    includesPublicProfileSnapshot: Boolean(exported.publicProfileSnapshot)
  };

  let firstPlayerData = normalizedImportBody.playerData[0];
  const validatedPlayerDataKind = firstPlayerData?.kind;
  const validation = firstPlayerData
    ? await injectStatus(app, "POST", `/api/me/player-data/${binding.id}/validate`, {
        kind: firstPlayerData.kind,
        region,
        data: firstPlayerData.data
      }, token)
    : { status: 204, durationMs: 0 };
  const playerDataRead = firstPlayerData
    ? await injectStatus(app, "GET", `/api/me/player-data/${binding.id}/${firstPlayerData.kind}`, undefined, token)
    : { status: 204, durationMs: 0, headers: {} };
  const playerDataWrite = firstPlayerData
    ? await injectStatus(app, "PUT", `/api/me/player-data/${binding.id}/${firstPlayerData.kind}`, {
        region,
        data: firstPlayerData.data
      }, token, { "if-match": playerDataRead.headers?.etag })
    : { status: 204, durationMs: 0, headers: {} };
  const stalePlayerDataWrite = firstPlayerData
    ? await injectStatus(app, "PUT", `/api/me/player-data/${binding.id}/${firstPlayerData.kind}`, {
        region,
        data: firstPlayerData.data
      }, token, { "if-match": playerDataRead.headers?.etag })
    : { status: 204, durationMs: 0 };
  const unauthorized = await injectStatus(app, "GET", `/api/me/player-bindings/${binding.id}/summary`);
  const missingBinding = await injectStatus(app, "GET", "/api/me/player-bindings/missing-binding/summary", undefined, token);
  const wrongRegion = await injectStatus(app, "POST", "/api/me/tools/deck-recommend", {
    region: region === "jp" ? "en" : "jp",
    bindingId: binding.id,
    limit: 1
  }, token);
  const duplicateBinding = await injectStatus(app, "POST", "/api/me/player-bindings", {
    region,
    playerUid: uid,
    displayName: player.name
  }, token);
  const shareMetadata = await injectStatus(app, "GET", `/api/share/cards/profile/${encodeURIComponent(uid)}?region=${region}`);
  const sharePng = await injectStatus(app, "GET", `/api/share/cards/profile/${encodeURIComponent(uid)}.png?region=${region}`);
  const shareNotModified = sharePng.headers?.etag
    ? await injectStatus(app, "GET", `/api/share/cards/profile/${encodeURIComponent(uid)}.png?region=${region}`, undefined, undefined, { "if-none-match": sharePng.headers.etag })
    : { status: 0, durationMs: 0 };
  interfaceChecks = {
    bindingsPagination: { status: 200, total: bindingsPage.total, returned: bindingsPage.items?.length },
    cardsPagination: { status: 200, total: cardsPage.total, returned: cardsPage.items?.length },
    validation: { status: validation.status, kind: validatedPlayerDataKind },
    playerDataConcurrency: {
      readStatus: playerDataRead.status,
      etagPresent: Boolean(playerDataRead.headers?.etag),
      updateStatus: playerDataWrite.status,
      staleUpdateStatus: stalePlayerDataWrite.status,
      expectedStaleStatus: 412
    },
    unauthorizedSummary: { status: unauthorized.status, expected: 401 },
    missingBinding: { status: missingBinding.status, expected: 404 },
    wrongRegion: { status: wrongRegion.status, expected: 400 },
    duplicateBinding: { status: duplicateBinding.status, expected: 409 },
    profileShare: {
      metadataStatus: shareMetadata.status,
      pngStatus: sharePng.status,
      contentType: sharePng.headers?.["content-type"],
      cacheControl: sharePng.headers?.["cache-control"],
      etagPresent: Boolean(sharePng.headers?.etag),
      notModifiedStatus: shareNotModified.status,
      bodyBytes: sharePng.bodyBytes,
      dimensions: sharePng.pngDimensions
    }
  };

  suitePayload = null;
  normalizedImportBody = null;
  normalized = null;
  firstPlayerData = null;
  if (global.gc) global.gc();

  mark("running authenticated tools");
  const deck = await injectJson(app, "POST", "/api/me/tools/deck-recommend", { region, bindingId: binding.id, limit: 1, timeoutMs: 3000 }, token);
  toolRunResults.deckRecommend = summarizeTool(deck);
  const recommendedCardIds = (deck.recommendedDecks?.[0]?.cards ?? deck.recommendedCards ?? [])
    .map((item) => String(item.cardId ?? item.id ?? item))
    .filter(Boolean)
    .slice(0, 5);
  const firstDeckIds = recommendedCardIds.length >= 5 ? recommendedCardIds : fallbackCardIds.slice(0, 5);
  const secondDeckIds = fallbackCardIds.filter((id) => !firstDeckIds.includes(id)).slice(0, 5);
  if (firstDeckIds.length === 5 && secondDeckIds.length === 5) {
    const compared = await injectJson(app, "POST", "/api/me/tools/deck-compare", {
      region,
      bindingId: binding.id,
      musicId: "1",
      difficulty: "easy",
      candidates: [
        { id: "real-a", name: "Real inventory A", cardIds: firstDeckIds },
        { id: "real-b", name: "Real inventory B", cardIds: secondDeckIds }
      ]
    }, token);
    toolRunResults.deckCompare = summarizeTool(compared);
  }
  const scoreControl = await injectJson(app, "POST", "/api/me/tools/score-control", {
    region,
    bindingId: binding.id,
    currentPt: 0,
    targetPt: 100000,
    remainingMinutes: 120,
    musicId: "1",
    difficulty: "easy",
    baseScore: 1000000,
    boost: 3
  }, token);
  toolRunResults.scoreControl = summarizeTool(scoreControl);
  const worldBloomFallback = await injectJson(app, "POST", "/api/me/tools/deck-recommend", {
    region,
    bindingId: binding.id,
    eventId: "181",
    calculationMode: "wl3",
    gameCharacterId: "1",
    limit: 1,
    timeoutMs: 3000
  }, token);
  const worldBloomSupportBreakdown = worldBloomFallback.recommendedDecks?.[0]?.supportDeckBreakdown
    ?? worldBloomFallback.candidates?.[0]?.cardContributionBreakdown?.modeSpecificBreakdown?.worldBloom?.supportDeckBreakdown;
  toolRunResults.worldBloomSupportFallback = {
    ...summarizeTool(worldBloomFallback),
    supportDeckSource: worldBloomSupportBreakdown?.supportDeckSource,
    supportDeckBonus: worldBloomSupportBreakdown?.supportDeckBonus,
    usedCount: worldBloomSupportBreakdown?.usedCount,
    supportDeckCountTarget: worldBloomSupportBreakdown?.supportDeckCountTarget,
    missingFields: worldBloomSupportBreakdown?.missingFields
  };
  const eventPoint = await injectJson(app, "POST", "/api/me/tools/event-point-calc", { region, bindingId: binding.id, musicId: "1", difficulty: "easy", baseScore: 1000000, boost: 3 }, token);
  toolRunResults.eventPointCalc = summarizeTool(eventPoint);
  const normalPlan = await injectJson(app, "POST", "/api/me/tools/normal-event-plan", { region, bindingId: binding.id, musicId: "1", difficulty: "easy", targetPt: 100000, currentPt: 0, remainingMinutes: 120, limit: 1, timeoutMs: 3000 }, token);
  toolRunResults.normalEventPlan = summarizeTool(normalPlan);
  const music = await injectJson(app, "POST", "/api/me/tools/music-recommend", { region, bindingId: binding.id, limit: 3, baseScore: 1000000, boost: 3 }, token);
  toolRunResults.musicRecommend = summarizeTool(music);
  const area = await injectJson(app, "POST", "/api/me/tools/area-item-recommend", { region, bindingId: binding.id, limit: 3 }, token);
  toolRunResults.areaItemRecommend = summarizeTool(area);
  const mysekai = await injectJson(app, "POST", "/api/me/tools/mysekai-calc", {
    region,
    bindingId: binding.id,
    eventBonus: 10,
    supportDeckBonus: 5,
    search: {
      algorithm: "ga",
      candidatePoolSize: 80,
      gaConfig: { seed: 748592, popSize: 200, parentSize: 40, eliteSize: 5, maxIter: 30, maxIterNoImprove: 8, timeoutMs: 5000 }
    }
  }, token);
  toolRunResults.mysekaiCalc = summarizeTool(mysekai);

  console.log(JSON.stringify({
    realUidCaseId: `${region}:${uid}`,
    sourceDiagnostics,
    suiteSourceStatus: { ok: true, status: suiteResponse.status },
    suiteAssetCounts,
    player,
    normalizedImportPreview,
    importReview: review,
    imported,
    toolContext,
    bindingSummary,
    profileAnalysis,
    exportSummary,
    interfaceChecks,
    completeness,
    toolRunResults,
    remainingParityGaps: [
      "Compare Suite-derived normalized assets against Moesekai SnowyDataProvider outputs for the same UID.",
      "World Bloom/WL exactness still depends on current event context and honor/profile-honor ownership mapping.",
      "Team-Haruki toolbox CN profile route returned a diagnostic non-200 status and is not used as the authoritative asset source."
    ]
  }, null, 2));
} finally {
  await store.deleteUserByEmail(email).catch(() => false);
  await app.close();
}
