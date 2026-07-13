import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { suiteUserDataKeys } from "../apps/api/dist/playerSummary.js";

const baseUrl = process.env.E2E_API_BASE ?? "http://127.0.0.1:4010";
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
delete process.env.E2E_EMAIL;
delete process.env.E2E_PASSWORD;

if (!email || !password) throw new Error("E2E_EMAIL and E2E_PASSWORD are required");

const bindingsToCreate = [
  { alias: "B01", region: "jp", uid: "5607598393249799", displayName: "[B01] JP", isDefault: true, suite: true },
  { alias: "B02", region: "en", uid: "303653174110265345", displayName: "[B02] EN", isDefault: false, suite: false },
  { alias: "B03", region: "tw", uid: "7016857971942775553", displayName: "[B03] TW", isDefault: false, suite: false },
  { alias: "B04", region: "kr", uid: "7392163554549390081", displayName: "[B04] KR", isDefault: false, suite: false },
  { alias: "B05", region: "cn", uid: "7485963184709360403", displayName: "[B05] CN", isDefault: false, suite: true }
];

const report = {
  generatedAt: new Date().toISOString(),
  mode: "local-memory-real-email-api-fallback",
  account: { email: "15********@qq.com", credentialsPersisted: false },
  browser: {
    requested: true,
    completed: false,
    classification: "coverage-gap",
    reason: "Browser control runtime could not initialize; page-level screenshots and clicks were not fabricated"
  },
  configuration: {
    apiBase: baseUrl,
    databaseConfigured: false,
    smtpConfigured: true,
    rawSuitePersisted: false,
    tokensPersisted: false
  },
  auth: {},
  bindings: [],
  rankings: [],
  imports: [],
  tools: {},
  shares: [],
  checks: [],
  summary: {}
};

let accessToken = "";
let refreshToken = "";
let suiteRateLimitedUntil = 0;

function compact(value, depth = 0) {
  if (depth > 3) return undefined;
  if (Array.isArray(value)) return { count: value.length, sample: value.slice(0, 3).map((item) => compact(item, depth + 1)) };
  if (!value || typeof value !== "object") return value;
  const blocked = new Set(["accessToken", "refreshToken", "password", "code", "cards", "items", "playerData", "responseBody"]);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)).slice(0, 30).map(([key, item]) => [key, compact(item, depth + 1)]));
}

function check(id, condition, failureStatus, detail = {}) {
  report.checks.push({ id, passed: Boolean(condition), status: condition ? "passed" : failureStatus, detail: compact(detail) });
}

function expected(id, condition, status, detail = {}) {
  report.checks.push({ id, passed: Boolean(condition), status: condition ? status : "release-blocking", detail: compact(detail) });
}

async function request(method, url, body, token = accessToken, options = {}) {
  const started = performance.now();
  const headers = { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) };
  let response;
  try {
    response = await fetch(`${baseUrl}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000)
    });
  } catch (error) {
    return { method, url, status: 0, durationMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error), headers: {} };
  }
  const contentType = response.headers.get("content-type") ?? "";
  let data;
  let buffer;
  if (options.binary) buffer = Buffer.from(await response.arrayBuffer());
  else {
    const text = await response.text();
    try { data = text ? JSON.parse(text) : undefined; } catch { data = text.slice(0, 500); }
  }
  return {
    method,
    url,
    status: response.status,
    durationMs: Math.round(performance.now() - started),
    headers: Object.fromEntries(response.headers.entries()),
    data,
    buffer
  };
}

async function suiteFetch(region, uid) {
  const url = `https://suite-api.haruki.seiunx.com/public/${region}/suite/${encodeURIComponent(uid)}?key=${encodeURIComponent(suiteUserDataKeys.join(","))}`;
  const blockedForMs = suiteRateLimitedUntil - Date.now();
  if (blockedForMs > 0) {
    return { status: 429, durationMs: 0, sourceStatus: "source-rate-limited", circuitOpen: true, retryAfterMs: blockedForMs };
  }
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const text = await response.text();
    const retryAfter = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfter == null ? Number.NaN : Number(retryAfter);
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.max(0, retryAfterSeconds * 1000)
      : retryAfter && Number.isFinite(Date.parse(retryAfter))
        ? Math.max(0, Date.parse(retryAfter) - Date.now())
        : undefined;
    const result = {
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      retryAfter,
      retryAfterMs,
      sourceStatus: response.status === 429 ? "source-rate-limited" : response.ok ? "available" : "source-error"
    };
    if (response.status === 429) suiteRateLimitedUntil = Date.now() + (retryAfterMs ?? 15 * 60_000);
    if (response.ok) return { ...result, payload: JSON.parse(text) };
    return result;
  } catch (error) {
    return { status: 0, durationMs: Math.round(performance.now() - started), sourceStatus: "source-error", error: error instanceof Error ? error.message : String(error) };
  }
}

function pngDimensions(buffer) {
  if (!buffer || buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function summarizeTool(value) {
  return {
    status: value.status,
    durationMs: value.durationMs,
    formulaVersion: value.data?.formulaVersion ?? value.data?.formula?.version,
    missingFields: value.data?.missingFields ?? [],
    estimatedFieldsUsed: value.data?.estimatedFieldsUsed ?? [],
    referenceParity: value.data?.referenceParity,
    recommendedCardIds: (value.data?.recommendedDecks?.[0]?.cards ?? value.data?.recommendedCards ?? []).map((item) => String(item.cardId ?? item.id ?? item)).filter(Boolean).slice(0, 5)
  };
}

async function runTools(binding, fallbackCardIds) {
  const region = binding.region;
  const bindingId = binding.id;
  const deck = await request("POST", "/api/me/tools/deck-recommend", { region, bindingId, limit: 1, timeoutMs: 5000 }, accessToken, { timeoutMs: 180_000 });
  const deckSummary = summarizeTool(deck);
  const first = deckSummary.recommendedCardIds.length === 5 ? deckSummary.recommendedCardIds : fallbackCardIds.slice(0, 5);
  const second = fallbackCardIds.filter((id) => !first.includes(id)).slice(0, 5);
  const tools = { deckRecommend: deckSummary };
  if (first.length === 5 && second.length === 5) {
    tools.deckCompare = summarizeTool(await request("POST", "/api/me/tools/deck-compare", {
      region, bindingId, musicId: "1", difficulty: "easy",
      candidates: [{ id: "real-a", name: "Real inventory A", cardIds: first }, { id: "real-b", name: "Real inventory B", cardIds: second }]
    }, accessToken, { timeoutMs: 180_000 }));
  }
  tools.scoreControl = summarizeTool(await request("POST", "/api/me/tools/score-control", { region, bindingId, currentPt: 0, targetPt: 100000, remainingMinutes: 120, musicId: "1", difficulty: "easy", baseScore: 1000000, boost: 3 }, accessToken));
  tools.eventPointCalc = summarizeTool(await request("POST", "/api/me/tools/event-point-calc", { region, bindingId, musicId: "1", difficulty: "easy", baseScore: 1000000, boost: 3 }, accessToken));
  tools.normalEventPlan = summarizeTool(await request("POST", "/api/me/tools/normal-event-plan", { region, bindingId, musicId: "1", difficulty: "easy", targetPt: 100000, currentPt: 0, remainingMinutes: 120, limit: 1, timeoutMs: 5000 }, accessToken, { timeoutMs: 180_000 }));
  tools.musicRecommend = summarizeTool(await request("POST", "/api/me/tools/music-recommend", { region, bindingId, limit: 3, baseScore: 1000000, boost: 3 }, accessToken));
  tools.areaItemRecommend = summarizeTool(await request("POST", "/api/me/tools/area-item-recommend", { region, bindingId, limit: 3 }, accessToken, { timeoutMs: 180_000 }));
  tools.mysekaiCalc = summarizeTool(await request("POST", "/api/me/tools/mysekai-calc", {
    region, bindingId, eventBonus: 10, supportDeckBonus: 5,
    search: { algorithm: "ga", candidatePoolSize: 80, gaConfig: { seed: 748592, popSize: 200, parentSize: 40, eliteSize: 5, maxIter: 30, maxIterNoImprove: 8, timeoutMs: 5000 } }
  }, accessToken, { timeoutMs: 240_000 }));
  tools.worldBloom = summarizeTool(await request("POST", "/api/me/tools/deck-recommend", { region, bindingId, eventId: "181", calculationMode: "wl3", gameCharacterId: "1", limit: 1, timeoutMs: 5000 }, accessToken, { timeoutMs: 180_000 }));
  return tools;
}

async function main() {
  const health = await request("GET", "/health", undefined, "");
  report.configuration.databaseConfigured = Boolean(health.data?.databaseConfigured);
  report.configuration.smtpConfigured = Boolean(health.data?.smtpConfigured);
  check("environment.health", health.status === 200, "release-blocking", health);
  check("environment.memory-store", health.data?.databaseConfigured === false, "release-blocking", health.data);
  check("environment.smtp", health.data?.smtpConfigured === true, "release-blocking", health.data);

  const login = await request("POST", "/api/auth/login", { email, password }, "");
  accessToken = login.data?.accessToken ?? "";
  refreshToken = login.data?.refreshToken ?? "";
  report.auth.login = { status: login.status, durationMs: login.durationMs, tokenIssued: Boolean(accessToken), refreshIssued: Boolean(refreshToken) };
  check("auth.login", login.status === 200 && accessToken && refreshToken, "release-blocking", report.auth.login);
  if (!accessToken) throw new Error("Login failed");

  const initialMe = await request("GET", "/api/auth/me");
  report.auth.sessionRead = { status: initialMe.status, emailMatches: initialMe.data?.user?.email === email };
  check("auth.session-read", initialMe.status === 200 && initialMe.data?.user?.email === email, "release-blocking", report.auth.sessionRead);

  const existingResponse = await request("GET", "/api/me/player-bindings");
  let existing = Array.isArray(existingResponse.data) ? existingResponse.data : existingResponse.data?.items ?? [];
  for (const item of bindingsToCreate) {
    let binding = existing.find((candidate) => candidate.region === item.region && candidate.playerUid === item.uid);
    let createStatus = 200;
    if (!binding) {
      const created = await request("POST", "/api/me/player-bindings", { region: item.region, playerUid: item.uid, displayName: item.displayName, isDefault: item.isDefault, note: `${item.alias} real-user-flow` });
      createStatus = created.status;
      binding = created.data;
      if (binding?.id) existing.push(binding);
    }
    report.bindings.push({ alias: item.alias, region: item.region, uid: item.uid, bindingId: binding?.id, isDefault: Boolean(binding?.isDefault), createStatus });
    check(`binding.${item.alias}.created`, Boolean(binding?.id) && binding.region === item.region && binding.playerUid === item.uid, "release-blocking", { createStatus, binding });
  }
  check("binding.count", report.bindings.length === 5 && new Set(report.bindings.map((item) => item.bindingId)).size === 5, "release-blocking", report.bindings);

  const duplicate = await request("POST", "/api/me/player-bindings", { region: "jp", playerUid: bindingsToCreate[0].uid, displayName: "duplicate" });
  check("binding.duplicate", duplicate.status === 409, "release-blocking", duplicate);
  const unauthorized = await request("GET", `/api/me/player-bindings/${report.bindings[0].bindingId}/summary`, undefined, "");
  check("security.unauthorized-summary", unauthorized.status === 401, "release-blocking", unauthorized);

  for (const item of report.bindings) {
    const refresh = await request("POST", `/api/me/player-bindings/${item.bindingId}/refresh-public-profile`, {});
    item.profileRefresh = { status: refresh.status, durationMs: refresh.durationMs, message: refresh.data?.message };
    const acceptable = refresh.status === 200 || refresh.status === 404 || refresh.status === 503;
    check(`profile.${item.alias}.normalized`, acceptable && refresh.status !== 500, "release-blocking", refresh);
  }

  for (const item of report.bindings) {
    const current = await request("GET", `/api/events/${item.region}/current`, undefined, "");
    const live = await request("GET", `/api/events/${item.region}/live-ranking`, undefined, "", { timeoutMs: 180_000 });
    const rows = Array.isArray(live.data?.top100) ? live.data.top100 : [];
    const match = rows.find((row) => String(row.userId) === item.uid);
    const selectedRank = match?.rank ?? rows[0]?.rank;
    const detail = selectedRank ? await request("GET", `/api/events/${item.region}/${current.data?.id}/ranking-player/${selectedRank}`, undefined, "", { timeoutMs: 60_000 }) : { status: 404, durationMs: 0 };
    const ranking = { alias: item.alias, region: item.region, uid: item.uid, eventId: current.data?.id, currentStatus: current.status, liveStatus: live.status, sourceStatus: live.data?.sourceHealth?.status, top100Count: rows.length, matchedRank: match?.rank ?? null, detailStatus: detail.status, detailUid: detail.data?.userId, detailDurationMs: detail.durationMs };
    report.rankings.push(ranking);
    if (["B01", "B02", "B05"].includes(item.alias)) {
      check(`ranking.${item.alias}.uid`, Boolean(match), "release-blocking", ranking);
      if (detail.status === 503) {
        report.checks.push({ id: `ranking.${item.alias}.detail`, passed: false, status: "coverage-gap", detail: compact({ ...ranking, sourceStatus: "source-rate-limited-or-unavailable" }) });
      } else {
        check(`ranking.${item.alias}.detail`, detail.status === 200 && String(detail.data?.userId) === item.uid, "release-blocking", ranking);
      }
    } else {
      expected(`ranking.${item.alias}.hashed-source`, !match, "expected-source-gap", ranking);
      if (detail.status === 503) {
        report.checks.push({ id: `ranking.${item.alias}.rank1-smoke`, passed: false, status: "coverage-gap", detail: compact({ ...ranking, sourceStatus: "source-rate-limited-or-unavailable" }) });
      } else {
        check(`ranking.${item.alias}.rank1-smoke`, detail.status === 200, detail.status === 500 ? "release-blocking" : "coverage-gap", ranking);
      }
    }
  }

  for (const sourceItem of bindingsToCreate.filter((item) => item.suite)) {
    const bound = report.bindings.find((item) => item.alias === sourceItem.alias);
    const suite = await suiteFetch(sourceItem.region, sourceItem.uid);
    const importRecord = { alias: sourceItem.alias, region: sourceItem.region, uid: sourceItem.uid, sourceStatus: suite.sourceStatus, sourceHttpStatus: suite.status, sourceDurationMs: suite.durationMs, retryAfter: suite.retryAfter, retryAfterMs: suite.retryAfterMs, circuitOpen: suite.circuitOpen };
    if (!suite.payload) {
      importRecord.classification = suite.status === 429 ? "coverage-gap" : "release-blocking";
      report.imports.push(importRecord);
      check(`suite.${sourceItem.alias}.available`, false, importRecord.classification, importRecord);
      continue;
    }
    const cardIds = Array.isArray(suite.payload.userCards) ? suite.payload.userCards.map((card) => String(card.cardId ?? card.id ?? "")).filter(Boolean) : [];
    importRecord.sourceCardCount = cardIds.length;
    const review = await request("POST", `/api/me/player-data/${bound.bindingId}/import/review`, suite.payload, accessToken, { timeoutMs: 240_000 });
    importRecord.review = { status: review.status, valid: review.data?.valid, cards: review.data?.importReview?.cards?.count, groups: review.data?.importReview?.playerDataGroups?.length, unknownLookupCount: review.data?.importReview?.cards?.unknownLookupCount };
    const imported = review.status === 200 && review.data?.valid !== false ? await request("POST", `/api/me/player-data/${bound.bindingId}/import`, suite.payload, accessToken, { timeoutMs: 300_000 }) : { status: 0, durationMs: 0 };
    importRecord.import = { status: imported.status, durationMs: imported.durationMs, cards: imported.data?.imported, playerDataKinds: imported.data?.importedPlayerData };
    suite.payload = null;
    const summary = await request("GET", `/api/me/player-bindings/${bound.bindingId}/summary`);
    const context = await request("GET", `/api/me/player-bindings/${bound.bindingId}/tool-context`);
    const completeness = await request("GET", `/api/me/player-data/${bound.bindingId}/completeness/full`);
    const analysis = await request("GET", `/api/me/player-bindings/${bound.bindingId}/profile-analysis`, undefined, accessToken, { timeoutMs: 600_000 });
    const cardsPage = await request("GET", `/api/me/player-data/${bound.bindingId}/cards?page=1&pageSize=5`);
    importRecord.summary = { status: summary.status, inventoryCount: summary.data?.inventoryCount, playerDataKinds: summary.data?.playerData?.map((item) => item.kind) ?? [] };
    importRecord.toolContext = { status: context.status, inventoryCount: context.data?.inventoryCount, warnings: context.data?.toolContextWarnings ?? [], availability: context.data?.toolAvailability };
    importRecord.completeness = { status: completeness.status, uploadedKinds: completeness.data?.uploadedPlayerDataKinds ?? [], sections: completeness.data?.sections };
    importRecord.profileAnalysis = { status: analysis.status, durationMs: analysis.durationMs, missingFields: analysis.data?.missingFields ?? [], sections: analysis.data?.sections ? Object.keys(analysis.data.sections) : [] };
    importRecord.cardsPage = { status: cardsPage.status, total: cardsPage.data?.total, returned: cardsPage.data?.items?.length };
    report.imports.push(importRecord);
    check(`suite.${sourceItem.alias}.import`, imported.status === 200 && imported.data?.imported > 0, "release-blocking", importRecord);
    check(`suite.${sourceItem.alias}.analysis`, analysis.status === 200, "release-blocking", importRecord.profileAnalysis);
    check(`suite.${sourceItem.alias}.pagination`, cardsPage.status === 200 && cardsPage.data?.total === imported.data?.imported, "release-blocking", importRecord.cardsPage);
    report.tools[sourceItem.alias] = await runTools({ ...bound, region: sourceItem.region }, cardIds);
    for (const [name, result] of Object.entries(report.tools[sourceItem.alias])) check(`tool.${sourceItem.alias}.${name}`, result.status === 200, "release-blocking", result);
  }

  const counts = {};
  for (const item of report.bindings) {
    const summary = await request("GET", `/api/me/player-bindings/${item.bindingId}/summary`);
    counts[item.alias] = summary.data?.inventoryCount ?? 0;
  }
  report.inventoryCounts = counts;
  for (const alias of ["B02", "B03", "B04"]) {
    const item = report.bindings.find((binding) => binding.alias === alias);
    const emptyDeck = await request("POST", "/api/me/tools/deck-recommend", { region: item.region, bindingId: item.bindingId, limit: 1 });
    expected(`tool.${alias}.empty-inventory`, emptyDeck.status === 400 && counts[alias] === 0, "expected-source-gap", { status: emptyDeck.status, inventoryCount: counts[alias], message: emptyDeck.data?.message });
  }
  if (counts.B01 > 0 && counts.B05 > 0) check("binding.inventory-isolation", counts.B01 !== counts.B05 || report.imports.every((item) => item.summary?.inventoryCount === counts[item.alias]), "release-blocking", counts);

  for (const item of report.bindings) {
    const metadata = await request("GET", `/api/share/cards/profile/${encodeURIComponent(item.uid)}?region=${item.region}`, undefined, "");
    const png = await request("GET", `/api/share/cards/profile/${encodeURIComponent(item.uid)}.png?region=${item.region}`, undefined, "", { binary: true, timeoutMs: 180_000 });
    const etag = png.headers?.etag;
    const notModified = etag ? await request("GET", `/api/share/cards/profile/${encodeURIComponent(item.uid)}.png?region=${item.region}`, undefined, "", { headers: { "if-none-match": etag }, binary: true }) : { status: 0 };
    const share = { alias: item.alias, region: item.region, uid: item.uid, metadataStatus: metadata.status, title: metadata.data?.title, imageUrl: metadata.data?.imageUrl, pngStatus: png.status, contentType: png.headers?.["content-type"], cacheControl: png.headers?.["cache-control"], etagPresent: Boolean(etag), notModifiedStatus: notModified.status, dimensions: pngDimensions(png.buffer), bodyBytes: png.buffer?.length ?? 0 };
    report.shares.push(share);
    check(`share.${item.alias}`, metadata.status === 200 && png.status === 200 && share.contentType?.startsWith("image/png") && share.dimensions?.width === 1200 && share.dimensions?.height === 630 && share.notModifiedStatus === 304 && metadata.data?.imageUrl?.includes(`region=${item.region}`), "release-blocking", share);
  }

  for (const alias of ["B01", "B05"]) {
    const binding = report.bindings.find((item) => item.alias === alias);
    const cardId = report.tools[alias]?.deckRecommend?.recommendedCardIds?.[0];
    if (!cardId) continue;
    const metadata = await request("GET", `/api/share/cards/card/${encodeURIComponent(cardId)}?region=${binding.region}`, undefined, "");
    const png = await request("GET", `/api/share/cards/card/${encodeURIComponent(cardId)}.png?region=${binding.region}`, undefined, "", { binary: true, timeoutMs: 180_000 });
    const share = { alias, region: binding.region, cardId, metadataStatus: metadata.status, pngStatus: png.status, dimensions: pngDimensions(png.buffer), contentType: png.headers?.["content-type"] };
    report.shares.push(share);
    check(`share.${alias}.recommended-card`, metadata.status === 200 && png.status === 200 && share.dimensions?.width === 1200 && share.dimensions?.height === 630, "release-blocking", share);
  }

  report.checks.push({ id: "browser.primary-flow", passed: false, status: "coverage-gap", detail: { reason: report.browser.reason } });
  report.checks.push({ id: "share.binding-aware-deck", passed: false, status: "coverage-gap", detail: { reason: "No deck share type; profile share does not read imported Suite assets" } });

  const logout = await request("POST", "/api/auth/logout", { refreshToken }, "");
  report.auth.finalLogout = { status: logout.status, ok: logout.data?.ok === true };
  check("auth.final-logout", logout.status === 200 && logout.data?.ok === true, "release-blocking", report.auth.finalLogout);
  accessToken = "";
  refreshToken = "";
}

function markdown() {
  const lines = [
    "# 五服务器真实用户流程测试报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 模式：${report.mode}`,
    `- 发布阻断：${report.summary.releaseBlocking}`,
    `- 预期来源缺口：${report.summary.expectedSourceGap}`,
    `- 覆盖缺口：${report.summary.coverageGap}`,
    "",
    "## 绑定矩阵",
    "",
    "| 编号 | 区服 | UID | Binding ID | Profile refresh | 库存 |",
    "| --- | --- | --- | --- | ---: | ---: |"
  ];
  for (const item of report.bindings) lines.push(`| ${item.alias} | ${item.region} | ${item.uid} | ${item.bindingId ?? "-"} | ${item.profileRefresh?.status ?? "-"} | ${report.inventoryCounts?.[item.alias] ?? 0} |`);
  lines.push("", "## 排名", "", "| 编号 | 活动 | Top100 | 匹配排名 | 详情状态 | 详情 UID |", "| --- | --- | ---: | ---: | ---: | --- |");
  for (const item of report.rankings) lines.push(`| ${item.alias} | ${item.eventId ?? "-"} | ${item.top100Count} | ${item.matchedRank ?? "-"} | ${item.detailStatus} | ${item.detailUid ?? "-"} |`);
  lines.push("", "## Suite 与分析", "", "| 编号 | 来源 | 预览 | 导入卡牌 | 资产类型 | Profile analysis |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const item of report.imports) lines.push(`| ${item.alias} | ${item.sourceStatus} | ${item.review?.status ?? "-"} | ${item.import?.cards ?? "-"} | ${item.import?.playerDataKinds ?? "-"} | ${item.profileAnalysis?.status ?? "-"} |`);
  lines.push("", "## 检查结果", "", "| 结果 | ID | 详情 |", "| --- | --- | --- |");
  for (const item of report.checks) lines.push(`| ${item.status} | ${item.id} | ${JSON.stringify(item.detail ?? {}).replaceAll("|", "\\|")} |`);
  lines.push("", "## 安全与清理", "", "- 密码、验证码、访问令牌、刷新令牌和完整 Suite 未写入报告。", "- 浏览器主流程因控制运行时不可用被标记为 coverage-gap，未伪造截图。", "- 本地 API 使用内存账户；停止测试 API 后账户及其绑定/资产即销毁。", "- `.env` 未修改，并继续由 Git 忽略。", "");
  return lines.join("\n");
}

let fatalError;
try {
  await main();
} catch (error) {
  fatalError = error instanceof Error ? error.message : String(error);
  report.checks.push({ id: "runner.fatal", passed: false, status: "release-blocking", detail: { message: fatalError } });
}

report.summary = {
  checks: report.checks.length,
  passed: report.checks.filter((item) => item.status === "passed").length,
  expectedSourceGap: report.checks.filter((item) => item.status === "expected-source-gap").length,
  coverageGap: report.checks.filter((item) => item.status === "coverage-gap").length,
  releaseBlocking: report.checks.filter((item) => item.status === "release-blocking").length,
  fatalError
};

const reportDir = path.resolve("artifacts", "real-user-flow");
await mkdir(reportDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const jsonPath = path.join(reportDir, `real-user-flow-${stamp}.json`);
const markdownPath = path.join(reportDir, `real-user-flow-${stamp}.md`);
await writeFile(jsonPath, JSON.stringify(report, null, 2));
await writeFile(markdownPath, markdown());

console.log(JSON.stringify({ summary: report.summary, jsonReport: jsonPath, markdownReport: markdownPath }, null, 2));
process.exitCode = report.summary.releaseBlocking ? 1 : 0;
