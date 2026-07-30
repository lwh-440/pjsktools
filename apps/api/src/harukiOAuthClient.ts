import { createHash } from "node:crypto";
import { config, isRegion, type RegionId } from "./config.js";
import { validateHarukiTokenEncryptionConfiguration } from "./authCrypto.js";
import type { HarukiAvailableBinding } from "./types.js";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function unwrapHarukiEnvelope(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const source = current as Record<string, unknown>;
    const candidates = [source.updatedData, source.data, source.result].filter((item) => item != null);
    if (candidates.length !== 1 || !candidates[0] || typeof candidates[0] !== "object") return current;
    current = candidates[0];
  }
  return current;
}

export function normalizeHarukiEnvelope(value: unknown) {
  return unwrapHarukiEnvelope(value);
}

export class HarukiPlayerDataError extends Error {
  constructor(
    public readonly code: "not-configured" | "not-found" | "public-disabled" | "reauthorize" | "rate-limited" | "upstream-error" | "invalid-response",
    public readonly statusCode: number,
    public readonly retryAfterSeconds?: number
  ) {
    super(code);
    this.name = "HarukiPlayerDataError";
  }
}

type NotModified = { notModified: true; uploadTime?: string };

function baseUrl() {
  const configured = config.harukiOAuthAuthorizeUrl;
  if (configured) return configured.replace(/\/authorize\/?$/, "").replace(/\/+$/, "");
  return "https://toolbox-api-direct.haruki.seiunx.com/api/oauth2";
}

function endpoint(configured: string, path: string) {
  return configured || `${baseUrl()}${path}`;
}

export function harukiOAuthConfigured() {
  return Boolean(config.harukiOAuthClientId && config.harukiOAuthClientSecret && config.harukiOAuthRedirectUri);
}

function retryAfter(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.max(0, Math.ceil((time - Date.now()) / 1000)) : undefined;
}

async function readJson(response: Response) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new HarukiPlayerDataError("invalid-response", 502);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new HarukiPlayerDataError("invalid-response", 502);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HarukiPlayerDataError("invalid-response", 502);
  }
}

async function request(url: string, init?: RequestInit, mode: "public" | "oauth" | "service" = "service") {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new HarukiPlayerDataError("upstream-error", 502);
  }
  if (response.status === 304) return { notModified: true, uploadTime: response.headers.get("x-upload-time") ?? undefined } satisfies NotModified;
  if (!response.ok) {
    const code = response.status === 404 ? "not-found"
      : response.status === 403 ? mode === "public" ? "public-disabled" : mode === "oauth" ? "reauthorize" : "upstream-error"
        : response.status === 401 ? "reauthorize"
          : response.status === 429 ? "rate-limited" : "upstream-error";
    const statusCode = response.status === 429 ? 429
      : response.status >= 500 ? 502
        : mode === "oauth" && response.status === 403 ? 401
          : response.status;
    throw new HarukiPlayerDataError(code, statusCode, retryAfter(response));
  }
  return readJson(response);
}

export async function fetchPublicHarukiSuite(region: RegionId, playerUid: string) {
  const url = `${config.harukiPublicSuiteBaseUrl.replace(/\/+$/, "")}/${region}/suite/${encodeURIComponent(playerUid)}`;
  return request(url, undefined, "public");
}

export function buildHarukiAuthorizeUrl(state: string, codeChallenge: string) {
  if (!harukiOAuthConfigured()) throw new HarukiPlayerDataError("not-configured", 503);
  const url = new URL(endpoint(config.harukiOAuthAuthorizeUrl, "/authorize"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.harukiOAuthClientId);
  url.searchParams.set("redirect_uri", config.harukiOAuthRedirectUri);
  url.searchParams.set("scope", config.harukiOAuthScope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type HarukiTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope: string[];
};

async function tokenRequest(parameters: URLSearchParams): Promise<HarukiTokenSet> {
  if (!harukiOAuthConfigured()) throw new HarukiPlayerDataError("not-configured", 503);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (config.harukiOAuthClientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${config.harukiOAuthClientId}:${config.harukiOAuthClientSecret}`).toString("base64")}`;
  }
  const value = await request(endpoint(config.harukiOAuthTokenUrl, "/token"), {
    method: "POST",
    headers,
    body: parameters.toString()
  });
  const result = normalizeHarukiEnvelope(value) && typeof normalizeHarukiEnvelope(value) === "object"
    ? normalizeHarukiEnvelope(value) as Record<string, unknown> : {};
  const accessToken = typeof result.access_token === "string" ? result.access_token : "";
  if (!accessToken) throw new HarukiPlayerDataError("invalid-response", 502);
  const expiresIn = Number(result.expires_in ?? 0);
  return {
    accessToken,
    refreshToken: typeof result.refresh_token === "string" ? result.refresh_token : undefined,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    scope: typeof result.scope === "string" ? result.scope.split(/\s+/).filter(Boolean) : []
  };
}

export function exchangeHarukiCode(code: string, codeVerifier: string) {
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.harukiOAuthClientId,
    code,
    redirect_uri: config.harukiOAuthRedirectUri,
    code_verifier: codeVerifier
  }));
}

export function refreshHarukiToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.harukiOAuthClientId,
    refresh_token: refreshToken
  }));
}

async function authorized(path: string, accessToken: string, configured = "") {
  return request(endpoint(configured, path), { headers: { authorization: `Bearer ${accessToken}` } }, "oauth");
}

export async function fetchHarukiProfile(accessToken: string) {
  const value = await authorized("/user/profile", accessToken, config.harukiOAuthProfileUrl);
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const subject = source.sub ?? source.id ?? source.userId;
  if (subject == null || !String(subject).trim()) throw new HarukiPlayerDataError("invalid-response", 502);
  return {
    subject: String(subject),
    displayName: source.name == null ? source.nickname == null ? source.username == null ? undefined : String(source.username) : String(source.nickname) : String(source.name)
  };
}

function bindingRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const source = value as Record<string, any>;
  const unwrapped = normalizeHarukiEnvelope(value);
  if (unwrapped !== value) return bindingRows(unwrapped);
  const candidate = source.bindings ?? source.items ?? source.updatedData
    ?? source.data?.bindings ?? source.data?.items ?? source.data?.updatedData
    ?? source.result?.bindings ?? source.result?.items ?? source.result?.updatedData;
  return Array.isArray(candidate) ? candidate : [];
}

function strictIdentifier(value: unknown, maxLength: number) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return String(value);
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function deriveHarukiBindingKey(subject: string, region: RegionId, playerUid: string) {
  return createHash("sha256").update(`${subject}\0${region}\0${playerUid}`).digest("hex");
}

export function normalizeHarukiBindingsPayload(value: unknown, subject = "") : HarukiAvailableBinding[] {
  return bindingRows(value).flatMap((item) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const rawRegion = source.server ?? source.region;
    if (typeof rawRegion !== "string") return [];
    const region = rawRegion.trim().toLowerCase();
    const playerUid = strictIdentifier(source.gameId ?? source.userId ?? source.uid, 32);
    const upstreamBindingId = strictIdentifier(source.id ?? source.bindingId, 200) ?? undefined;
    if (!isRegion(region) || !playerUid || !/^\d{5,32}$/.test(playerUid) || source.verified !== true) return [];
    const bindingKey = deriveHarukiBindingKey(subject, region, playerUid);
    if (source.name != null && (typeof source.name !== "string" || source.name.trim().length > 80)) return [];
    return [{
      id: upstreamBindingId ?? bindingKey,
      bindingKey,
      upstreamBindingId,
      region,
      playerUid,
      displayName: source.name == null ? undefined : source.name.trim(),
      verified: true as const
    }];
  });
}

export async function fetchHarukiBindings(accessToken: string, subject: string): Promise<HarukiAvailableBinding[]> {
  const value = await authorized("/user/bindings", accessToken, config.harukiOAuthBindingsUrl);
  return normalizeHarukiBindingsPayload(value, subject);
}

export type HarukiSuiteFetchResult = NotModified | { notModified: false; suite: Record<string, unknown> };

export async function fetchOAuthHarukiSuite(accessToken: string, region: RegionId, playerUid: string, knownUploadTime?: string): Promise<HarukiSuiteFetchResult> {
  const configured = config.harukiOAuthGameDataBaseUrl
    ? `${config.harukiOAuthGameDataBaseUrl.replace(/\/+$/, "")}/${region}/suite/${encodeURIComponent(playerUid)}`
    : "";
  try {
    const path = `/game-data/${region}/suite/${encodeURIComponent(playerUid)}`;
    const target = new URL(configured || endpoint("", path));
    if (knownUploadTime) target.searchParams.set("known_upload_time", knownUploadTime);
    const result = await request(target.toString(), { headers: { authorization: `Bearer ${accessToken}` } }, "oauth");
    if (result && typeof result === "object" && "notModified" in result) return result as NotModified;
    const unwrapped = normalizeHarukiEnvelope(result);
    if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) throw new HarukiPlayerDataError("invalid-response", 502);
    return { notModified: false, suite: unwrapped as Record<string, unknown> };
  } catch (error) {
    if (!(error instanceof HarukiPlayerDataError) || error.statusCode !== 400) throw error;
    const keys = [
      "userCards", "userDecks", "userGamedata", "userMusics", "userMusicResults", "userMusicAchievements",
      "userAreas", "userCharacters", "userMaterials", "userMysekaiMaterials", "userHonors", "userBonds",
      "userChallengeLiveSoloDecks", "userChallengeLiveSoloResults", "userChallengeLiveSoloStages",
      "userChallengeLiveSoloHighScoreRewards", "userWorldBloomSupportDecks", "userMysekaiCanvases",
      "userMysekaiGates", "userMysekaiFixtureGameCharacterPerformanceBonuses"
    ];
    const entries = await Promise.all(keys.map(async (key) => {
      try {
        return [key, await authorized(`/game-data/${region}/${key}/${encodeURIComponent(playerUid)}`, accessToken)] as const;
      } catch (keyError) {
        if (keyError instanceof HarukiPlayerDataError && keyError.statusCode === 400) return [key, []] as const;
        throw keyError;
      }
    }));
    return { notModified: false, suite: Object.fromEntries(entries) };
  }
}

export async function fetchOAuthHarukiMysekai(accessToken: string, region: RegionId, playerUid: string, knownUploadTime?: string): Promise<HarukiSuiteFetchResult> {
  const configured = config.harukiOAuthGameDataBaseUrl
    ? `${config.harukiOAuthGameDataBaseUrl.replace(/\/+$/, "")}/${region}/mysekai/${encodeURIComponent(playerUid)}` : "";
  const target = new URL(configured || endpoint("", `/game-data/${region}/mysekai/${encodeURIComponent(playerUid)}`));
  if (knownUploadTime) target.searchParams.set("known_upload_time", knownUploadTime);
  const result = await request(target.toString(), { headers: { authorization: `Bearer ${accessToken}` } }, "oauth");
  if (result && typeof result === "object" && "notModified" in result) return result as NotModified;
  const unwrapped = normalizeHarukiEnvelope(result);
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) throw new HarukiPlayerDataError("invalid-response", 502);
  return { notModified: false, suite: unwrapped as Record<string, unknown> };
}

export async function revokeHarukiToken(token: string, tokenTypeHint?: "access_token" | "refresh_token") {
  const body = new URLSearchParams({ token });
  if (tokenTypeHint) body.set("token_type_hint", tokenTypeHint);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (config.harukiOAuthClientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${config.harukiOAuthClientId}:${config.harukiOAuthClientSecret}`).toString("base64")}`;
  }
  await request(endpoint(config.harukiOAuthRevokeUrl, "/revoke"), {
    method: "POST",
    headers,
    body: body.toString()
  });
}

export function validateHarukiEndpointConfiguration() {
  if (config.nodeEnv !== "production") return;
  if (!config.harukiOAuthClientId || !config.harukiOAuthClientSecret) throw new Error("HARUKI_OAUTH_CLIENT_CREDENTIALS_REQUIRED");
  validateHarukiTokenEncryptionConfiguration();
  const endpoints = [
    config.harukiPublicSuiteBaseUrl,
    endpoint(config.harukiOAuthAuthorizeUrl, "/authorize"),
    endpoint(config.harukiOAuthTokenUrl, "/token"),
    endpoint(config.harukiOAuthProfileUrl, "/user/profile"),
    endpoint(config.harukiOAuthBindingsUrl, "/user/bindings"),
    endpoint(config.harukiOAuthGameDataBaseUrl, "/game-data"),
    endpoint(config.harukiOAuthRevokeUrl, "/revoke")
  ];
  const allowedOrigins = new Set([
    "https://toolbox-api-direct.haruki.seiunx.com",
    "https://suite-api.haruki.seiunx.com"
  ]);
  for (const value of endpoints) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !allowedOrigins.has(url.origin)) {
      throw new Error("HARUKI_ENDPOINT_NOT_ALLOWED");
    }
  }
  const redirect = new URL(config.harukiOAuthRedirectUri);
  if (redirect.protocol !== "https:" || redirect.username || redirect.password) throw new Error("HARUKI_REDIRECT_URI_NOT_ALLOWED");
}
