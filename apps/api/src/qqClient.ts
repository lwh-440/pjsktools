import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export type QqTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

export type QqOpenIdResponse = {
  clientId?: string;
  openId: string;
};

export type QqUserInfo = {
  nickname?: string;
  figureurl?: string;
  figureurl_1?: string;
  figureurl_2?: string;
  figureurl_qq_1?: string;
  figureurl_qq_2?: string;
};

export function qqConfigured() {
  return Boolean(config.qqConnectAppId && config.qqConnectAppKey && config.qqConnectRedirectUri);
}

export function createQqState() {
  return randomUUID().replace(/-/g, "");
}

export function buildQqAuthorizeUrl(state: string) {
  const url = new URL("https://graph.qq.com/oauth2.0/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.qqConnectAppId);
  url.searchParams.set("redirect_uri", config.qqConnectRedirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", config.qqConnectScope);
  return url.toString();
}

function parseQqQueryLikeResponse(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("callback")) {
    const json = trimmed.replace(/^callback\(/, "").replace(/\);?$/, "");
    return JSON.parse(json) as Record<string, unknown>;
  }
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as Record<string, unknown>;
  return Object.fromEntries(new URLSearchParams(trimmed));
}

export async function exchangeQqCode(code: string): Promise<QqTokenResponse> {
  const url = new URL("https://graph.qq.com/oauth2.0/token");
  url.searchParams.set("grant_type", "authorization_code");
  url.searchParams.set("client_id", config.qqConnectAppId);
  url.searchParams.set("client_secret", config.qqConnectAppKey);
  url.searchParams.set("code", code);
  url.searchParams.set("redirect_uri", config.qqConnectRedirectUri);
  url.searchParams.set("fmt", "json");
  const response = await fetch(url);
  const payload = parseQqQueryLikeResponse(await response.text());
  if (!response.ok || payload.error) throw new Error(`QQ_TOKEN_FAILED:${payload.error_description ?? payload.error ?? response.status}`);
  return {
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : undefined,
    expiresIn: payload.expires_in ? Number(payload.expires_in) : undefined
  };
}

export async function fetchQqOpenId(accessToken: string): Promise<QqOpenIdResponse> {
  const url = new URL("https://graph.qq.com/oauth2.0/me");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fmt", "json");
  const response = await fetch(url);
  const payload = parseQqQueryLikeResponse(await response.text());
  if (!response.ok || payload.error) throw new Error(`QQ_OPENID_FAILED:${payload.error_description ?? payload.error ?? response.status}`);
  return {
    clientId: payload.client_id ? String(payload.client_id) : undefined,
    openId: String(payload.openid)
  };
}

export async function fetchQqUserInfo(accessToken: string, openId: string): Promise<QqUserInfo> {
  const url = new URL("https://graph.qq.com/user/get_user_info");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("oauth_consumer_key", config.qqConnectAppId);
  url.searchParams.set("openid", openId);
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  const payload = (await response.json()) as QqUserInfo & { ret?: number; msg?: string };
  if (!response.ok || (typeof payload.ret === "number" && payload.ret !== 0)) throw new Error(`QQ_USERINFO_FAILED:${payload.msg ?? response.status}`);
  return payload;
}

export function qqAvatarUrl(info: QqUserInfo) {
  return info.figureurl_qq_2 ?? info.figureurl_2 ?? info.figureurl_qq_1 ?? info.figureurl_1 ?? info.figureurl;
}
