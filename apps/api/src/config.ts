import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadDotEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function loadEnvironment() {
  const cwd = process.cwd();
  loadDotEnvFile(path.join(cwd, ".env"));
  loadDotEnvFile(path.join(cwd, "apps", "api", ".env"));
  loadDotEnvFile(path.resolve(cwd, "..", "..", ".env"));
}

loadEnvironment();

function databaseUrl() {
  if (process.env.PJSKTOOLS_FORCE_MEMORY_STORE === "true") return "";
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!process.env.PGHOST) return "";
  const user = encodeURIComponent(process.env.PGUSER ?? "pjsktools");
  const password = encodeURIComponent(process.env.PGPASSWORD ?? "");
  const host = process.env.PGHOST;
  const port = process.env.PGPORT ?? "5432";
  const database = encodeURIComponent(process.env.PGDATABASE ?? "pjsktools");
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.API_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  databaseUrl: databaseUrl(),
  redisUrl: process.env.REDIS_URL ?? "",
  harukiApiBaseUrl: process.env.HARUKI_API_BASE_URL ?? "",
  masterRawBaseUrl: process.env.MASTER_RAW_BASE_URL ?? "https://raw.githubusercontent.com",
  publicWebBaseUrl: process.env.PUBLIC_WEB_BASE_URL ?? "http://127.0.0.1:5173",
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? process.env.PUBLIC_WEB_BASE_URL ?? "http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  qqConnectAppId: process.env.QQ_CONNECT_APP_ID ?? "",
  qqConnectAppKey: process.env.QQ_CONNECT_APP_KEY ?? "",
  qqConnectRedirectUri: process.env.QQ_CONNECT_REDIRECT_URI ?? "",
  qqConnectScope: process.env.QQ_CONNECT_SCOPE ?? "get_user_info",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpSecure: process.env.SMTP_SECURE !== "false",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  autoUpdateEnabled: process.env.AUTO_UPDATE_ENABLED !== "false",
  playerRefreshMs: Number(process.env.PLAYER_REFRESH_MS ?? 60_000),
  rankingRefreshMs: Number(process.env.RANKING_REFRESH_MS ?? 60_000),
  masterRefreshMs: Number(process.env.MASTER_REFRESH_MS ?? 600_000)
};

export const regions = [
  { id: "jp", name: "日服", repository: "Team-Haruki/haruki-sekai-master" },
  { id: "en", name: "国际服", repository: "Team-Haruki/haruki-sekai-en-master" },
  { id: "tw", name: "繁中服", repository: "Team-Haruki/haruki-sekai-tc-master" },
  { id: "kr", name: "韩服", repository: "Team-Haruki/haruki-sekai-kr-master" },
  { id: "cn", name: "国服", repository: "Team-Haruki/haruki-sekai-sc-master" }
] as const;

export type RegionId = (typeof regions)[number]["id"];

export function isRegion(value: string): value is RegionId {
  return regions.some((region) => region.id === value);
}
