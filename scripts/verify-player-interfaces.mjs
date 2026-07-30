import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { playerInterfaceCases, rankingRegions } from "./player-interface-cases.mjs";

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

const suiteBase = args.get("suite-base") ?? "https://suite-api.haruki.seiunx.com/public";
const toolboxBase = args.get("toolbox-base") ?? "https://toolbox-api-direct.haruki.seiunx.com";
const reportDir = path.resolve(args.get("report-dir") ?? path.join("artifacts", "player-interface"));

process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
process.env.PJSKTOOLS_FAST_MASTER_REFRESH = "true";
process.env.PJSKTOOLS_SILENT_APP_LOGS = "true";
delete process.env.DATABASE_URL;

const { buildApp } = await import("../apps/api/dist/app.js");

function safeJson(response) {
  try {
    return response.json();
  } catch {
    return undefined;
  }
}

async function inject(app, method, url, payload, headers = {}) {
  const startedAt = Date.now();
  const response = await app.inject({ method, url, payload, headers });
  return {
    method,
    url,
    status: response.statusCode,
    durationMs: Date.now() - startedAt,
    headers: response.headers,
    json: safeJson(response),
    bodyBytes: response.rawPayload.length
  };
}

async function fetchStatus(url, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      bodyBytes: Buffer.byteLength(text),
      contentType: response.headers.get("content-type")
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function listPayload(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.items) ? payload.items : [];
}

function compactEndpoint(result) {
  return {
    method: result.method,
    url: result.url,
    status: result.status,
    durationMs: result.durationMs,
    bodyBytes: result.bodyBytes,
    source: result.json?.source ?? result.json?.sourceLine ?? result.json?.sourceHealth?.sampleSource,
    unavailableReason: result.json?.unavailableReason,
    message: result.json?.message ?? result.json?.error
  };
}

function check(checks, id, passed, severity, detail) {
  checks.push({ id, passed: Boolean(passed), severity, detail });
}

function markdown(report) {
  const lines = [
    "# Player interface verification report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Result: ${report.summary.releaseBlockingFailures ? "FAIL" : "PASS"}`,
    `- Release-blocking failures: ${report.summary.releaseBlockingFailures}`,
    `- Expected missing profiles: ${report.summary.expectedMissingProfiles}`,
    `- Known source gaps: ${report.summary.knownSourceGaps}`,
    "",
    "## Checks",
    "",
    "| Status | Severity | Check | Detail |",
    "| --- | --- | --- | --- |"
  ];
  for (const item of report.checks) {
    const detail = JSON.stringify(item.detail ?? {}).replaceAll("|", "\\|");
    lines.push(`| ${item.passed ? "PASS" : "FAIL"} | ${item.severity} | ${item.id} | ${detail} |`);
  }
  lines.push("", "## Player source probes", "", "| Region | UID | Role | Profile | Refresh | Suite |", "| --- | --- | --- | ---: | ---: | ---: |");
  for (const item of report.players) {
    lines.push(`| ${item.region} | ${item.uid} | ${item.role} | ${item.profile.status} | ${item.refresh.status} | ${item.sources.suite.status} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const app = await buildApp();
const checks = [];
const ranking = [];
const players = [];

try {
  for (const region of rankingRegions) {
    const current = await inject(app, "GET", `/api/events/${region}/current`);
    const live = await inject(app, "GET", `/api/events/${region}/live-ranking`);
    const eventId = String(current.json?.id ?? live.json?.eventId ?? "none");
    const top100 = await inject(app, "GET", `/api/events/${region}/${encodeURIComponent(eventId)}/ranking-top100?page=1&pageSize=100`);
    const topRows = listPayload(top100.json);
    const targetCases = playerInterfaceCases.filter((item) => item.region === region && item.role === "ranking");
    const expectedRows = targetCases.map((item) => ({
      uid: item.uid,
      expectedRank: item.baseline.rank,
      actual: topRows.find((row) => String(row.userId) === item.uid)
    }));
    const baselineEventActive = targetCases.length > 0 && targetCases.every((item) => item.baseline.eventId === eventId);
    const selectedRank = baselineEventActive
      ? expectedRows.find((item) => item.actual)?.actual?.rank ?? targetCases[0]?.baseline.rank ?? 1
      : Number(topRows[0]?.rank ?? 1);
    const detail = eventId !== "none"
      ? await inject(app, "GET", `/api/events/${region}/${encodeURIComponent(eventId)}/ranking-player/${selectedRank}`)
      : { method: "GET", url: "", status: 404, durationMs: 0, json: undefined, bodyBytes: 0, headers: {} };
    const refresh = eventId !== "none"
      ? await inject(app, "POST", `/api/events/${region}/${encodeURIComponent(eventId)}/refresh`)
      : { method: "POST", url: "", status: 404, durationMs: 0, json: undefined, bodyBytes: 0, headers: {} };
    const refreshedRows = listPayload(refresh.json?.top100);
    const validationRows = refreshedRows.length > topRows.length ? refreshedRows : topRows;
    const verifiedExpectedRows = targetCases.map((item) => ({
      uid: item.uid,
      expectedRank: item.baseline.rank,
      actual: validationRows.find((row) => String(row.userId) === item.uid)
    }));
    const uidDetails = baselineEventActive
      ? await Promise.all(verifiedExpectedRows.map(async (item) => ({
          ...item,
          detail: item.actual?.rank
            ? await inject(app, "GET", `/api/events/${region}/${encodeURIComponent(eventId)}/ranking-player/${item.actual.rank}`)
            : undefined
        })))
      : [];
    ranking.push({
      region,
      eventId,
      baselineEventActive,
      current: compactEndpoint(current),
      live: compactEndpoint(live),
      top100: { ...compactEndpoint(top100), count: topRows.length },
      detail: compactEndpoint(detail),
      refresh: compactEndpoint(refresh),
      expectedRows: uidDetails.length
        ? uidDetails.map((item) => ({ uid: item.uid, expectedRank: item.expectedRank, actualRank: item.actual?.rank, detail: item.detail ? compactEndpoint(item.detail) : undefined }))
        : expectedRows.map((item) => ({ uid: item.uid, expectedRank: item.expectedRank, actualRank: item.actual?.rank }))
    });
    check(checks, `${region}.ranking.current`, current.status === 200 && eventId !== "none", "release-blocking", { eventId, status: current.status });
    check(checks, `${region}.ranking.live`, live.status === 200, "release-blocking", compactEndpoint(live));
    check(checks, `${region}.ranking.top100`, top100.status === 200 && validationRows.length > 0, "release-blocking", { eventId, status: top100.status, initialCount: topRows.length, refreshedCount: refreshedRows.length, validationCount: validationRows.length });
    check(checks, `${region}.ranking.player-detail`, detail.status === 200 && String(detail.json?.region) === region && String(detail.json?.eventId) === eventId, "release-blocking", compactEndpoint(detail));
    check(checks, `${region}.ranking.refresh`, refresh.status === 200, "release-blocking", compactEndpoint(refresh));
    if (baselineEventActive) {
      for (const item of uidDetails) {
        const currentRank = Number(item.actual?.rank);
        const detailUid = String(item.detail?.json?.userId ?? "");
        const detailUidIsPrivacyHash = /^[a-f0-9]{64}$/i.test(detailUid);
        const uidConsistent = Number.isInteger(currentRank)
          && currentRank > 0
          && item.detail?.status === 200
          && Number(item.detail.json?.rank) === currentRank
          && (detailUid === item.uid || detailUidIsPrivacyHash)
          && String(item.detail.json?.region) === region
          && String(item.detail.json?.eventId) === eventId;
        check(checks, `${region}.ranking.uid.${item.uid}`, uidConsistent, "release-blocking", {
          baselineRank: item.expectedRank,
          actualRank: item.actual?.rank,
          detailUid,
          detailUidType: detailUidIsPrivacyHash ? "privacy-hash" : "numeric-uid",
          detailStatus: item.detail?.status
        });
        if (currentRank !== item.expectedRank) {
          check(checks, `${region}.ranking.rank-drift.${item.uid}`, true, "ranking-drift", { baselineRank: item.expectedRank, actualRank: currentRank });
        }
      }
    } else if (targetCases.length) {
      check(checks, `${region}.ranking.baseline-rotated`, true, "known-gap", { currentEventId: eventId, baselineEventId: targetCases[0].baseline.eventId });
    }
  }

  for (const item of playerInterfaceCases) {
    const profile = await inject(app, "GET", `/api/players/${item.region}/${encodeURIComponent(item.uid)}/profile`);
    const refresh = await inject(app, "POST", `/api/players/${item.region}/${encodeURIComponent(item.uid)}/refresh`);
    const [profileSource, suiteSource] = await Promise.all([
      fetchStatus(`${toolboxBase}/event-tracker/api/v2/web/players/${item.region}/${encodeURIComponent(item.uid)}/profile`, 20_000),
      fetchStatus(`${suiteBase}/${item.region}/suite/${encodeURIComponent(item.uid)}?key=userGamedata,upload_time`, 30_000)
    ]);
    players.push({
      region: item.region,
      uid: item.uid,
      role: item.role,
      source: item.source,
      profile: compactEndpoint(profile),
      refresh: compactEndpoint(refresh),
      sources: { profile: profileSource, suite: suiteSource }
    });
    const upstreamNotFound = profileSource.status === 404;
    const normalizedUnavailable = profile.status === 404 && refresh.status === 404;
    if (upstreamNotFound) {
      check(checks, `${item.region}.profile.${item.uid}.expected-missing`, normalizedUnavailable, normalizedUnavailable ? "expected-missing" : "release-blocking", {
        upstreamStatus: profileSource.status,
        getStatus: profile.status,
        refreshStatus: refresh.status,
        reason: "Player data was not uploaded to or made public in the source database"
      });
    } else {
      check(checks, `${item.region}.profile.${item.uid}.available`, profile.status === 200 && refresh.status === 200, "release-blocking", {
        upstreamStatus: profileSource.status,
        getStatus: profile.status,
        refreshStatus: refresh.status
      });
    }
    if (item.role === "source-gap") {
      check(checks, `${item.region}.suite.${item.uid}.known-source-gap`, suiteSource.status === 404, "known-source-gap", {
        ...suiteSource,
        referenceProject: "Moesekai",
        referenceBehavior: "Uses the same Haruki Suite public source and reports that the player may not have uploaded or enabled public access"
      });
    }
  }

  const invalidRegion = await inject(app, "GET", "/api/players/xx/123/profile");
  const invalidRank = await inject(app, "GET", "/api/events/jp/1/ranking-player/0");
  const unauthorized = await inject(app, "GET", "/api/me/player-bindings?page=1&pageSize=1");
  check(checks, "negative.invalid-region", invalidRegion.status === 400, "release-blocking", compactEndpoint(invalidRegion));
  check(checks, "negative.invalid-rank", invalidRank.status === 400, "release-blocking", compactEndpoint(invalidRank));
  check(checks, "negative.unauthorized", unauthorized.status === 401, "release-blocking", compactEndpoint(unauthorized));

} finally {
  await app.close();
}

const releaseBlockingFailures = checks.filter((item) => item.severity === "release-blocking" && !item.passed).length;
const expectedMissingProfiles = checks.filter((item) => item.severity === "expected-missing").length;
const knownSourceGaps = checks.filter((item) => item.severity === "known-source-gap" || item.severity === "known-gap").length;
const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  generatedAt,
  configuration: {
    memoryStore: true,
    databaseUrlRemoved: true,
    suiteBase,
    toolboxBase,
    rawPlayerPayloadsPersisted: false
  },
  summary: { releaseBlockingFailures, expectedMissingProfiles, knownSourceGaps, checks: checks.length },
  checks,
  ranking,
  players
};

await mkdir(reportDir, { recursive: true });
const stamp = generatedAt.replaceAll(":", "-").replaceAll(".", "-");
const jsonPath = path.join(reportDir, `player-interface-${stamp}.json`);
const markdownPath = path.join(reportDir, `player-interface-${stamp}.md`);
await Promise.all([
  writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(markdownPath, markdown(report), "utf8")
]);

console.log(JSON.stringify({
  result: releaseBlockingFailures ? "fail" : "pass",
  releaseBlockingFailures,
  expectedMissingProfiles,
  knownSourceGaps,
  jsonReport: jsonPath,
  markdownReport: markdownPath
}, null, 2));
if (releaseBlockingFailures) process.exitCode = 1;
