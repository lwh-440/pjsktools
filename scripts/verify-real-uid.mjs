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

const suitePayload = JSON.parse(suiteResponse.text);
const normalized = normalizeSuitePlayerDataImport(region, suitePayload);
const normalizedImportBody = {
  cards: normalized.cards,
  playerData: normalized.playerData
};
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
const toolRunResults = {};

try {
  const code = await injectJson(app, "POST", "/api/auth/email-code/start", { email, purpose: "register" });
  const auth = await injectJson(app, "POST", "/api/auth/register", { email, password: "RealUidSmoke123!", code: code.devCode });
  token = auth.accessToken;
  binding = await injectJson(app, "POST", "/api/me/player-bindings", {
    region,
    playerUid: uid,
    displayName: normalized.sourceSummary.name,
    isDefault: true,
    note: "verify-real-uid temporary binding"
  }, token);

  review = await injectJson(app, "POST", `/api/me/player-data/${binding.id}/import/review`, suitePayload, token);
  imported = await injectJson(app, "POST", `/api/me/player-data/${binding.id}/import`, normalizedImportBody, token);
  toolContext = await injectJson(app, "GET", `/api/me/player-bindings/${binding.id}/tool-context`, undefined, token);
  completeness = await injectJson(app, "GET", `/api/me/player-data/${binding.id}/completeness/full`, undefined, token);

  const deck = await injectJson(app, "POST", "/api/me/tools/deck-recommend", { region, bindingId: binding.id, limit: 1, timeoutMs: 3000 }, token);
  toolRunResults.deckRecommend = summarizeTool(deck);
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
    player: normalized.sourceSummary,
    normalizedImportPreview: {
      cardCount: normalized.cards.length,
      playerData: normalized.normalizedPreview.playerData,
      unmappedKeys: Object.keys(normalized.normalizedPreview.unmapped)
    },
    importReview: {
      valid: review.valid,
      summary: review.summary,
      sourceType: review.importReview?.sourceType,
      cardLookup: review.importReview?.cards ? {
        count: review.importReview.cards.count,
        unknownLookupCount: review.importReview.cards.unknownLookupCount,
        sampleLookupResults: Array.isArray(review.importReview.cards.lookupResults)
          ? review.importReview.cards.lookupResults.slice(0, 5)
          : []
      } : undefined,
      playerDataGroups: review.importReview?.playerDataGroups?.map((group) => ({
        kind: group.kind,
        itemCount: group.itemCount,
        warningCount: group.validation?.warnings?.length ?? 0,
        errorCount: group.validation?.errors?.length ?? 0
      }))
    },
    imported: {
      cards: imported.imported,
      playerDataKinds: imported.importedPlayerData,
      formulaReadiness: imported.formulaReadiness
    },
    toolContext: {
      binding: toolContext.binding,
      formulaReadiness: toolContext.formulaReadiness,
      toolAvailability: toolContext.toolAvailability,
      warnings: toolContext.toolContextWarnings
    },
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
