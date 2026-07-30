import { afterEach, describe, expect, it } from "vitest";
import { config } from "./config.js";
import { validateHarukiEndpointConfiguration } from "./harukiOAuthClient.js";
import { readFileSync } from "node:fs";

describe("Haruki production endpoint policy", () => {
  const original = { nodeEnv: config.nodeEnv, publicUrl: config.harukiPublicSuiteBaseUrl, redirect: config.harukiOAuthRedirectUri, clientId: config.harukiOAuthClientId, clientSecret: config.harukiOAuthClientSecret, key: config.harukiTokenEncryptionKey, previous: config.harukiTokenPreviousEncryptionKeys };
  afterEach(() => Object.assign(config, { nodeEnv: original.nodeEnv, harukiPublicSuiteBaseUrl: original.publicUrl, harukiOAuthRedirectUri: original.redirect, harukiOAuthClientId: original.clientId, harukiOAuthClientSecret: original.clientSecret, harukiTokenEncryptionKey: original.key, harukiTokenPreviousEncryptionKeys: original.previous }));

  it("rejects non-HTTPS, userinfo, and unapproved origins", () => {
    Object.assign(config, { nodeEnv: "production", harukiOAuthClientId: "client", harukiOAuthClientSecret: "secret", harukiTokenEncryptionKey: "00".repeat(32), harukiOAuthRedirectUri: "https://sekai-tools.cn/api/auth/haruki/callback" });
    for (const value of ["http://suite-api.haruki.seiunx.com/public", "https://user:pass@suite-api.haruki.seiunx.com/public", "https://evil.example/public"]) {
      config.harukiPublicSuiteBaseUrl = value;
      expect(() => validateHarukiEndpointConfiguration()).toThrow("HARUKI_ENDPOINT_NOT_ALLOWED");
    }
  });

  it("rejects a non-HTTPS callback URI", () => {
    Object.assign(config, { nodeEnv: "production", harukiOAuthClientId: "client", harukiOAuthClientSecret: "secret", harukiTokenEncryptionKey: "00".repeat(32), harukiPublicSuiteBaseUrl: "https://suite-api.haruki.seiunx.com/public", harukiOAuthRedirectUri: "http://sekai-tools.cn/api/auth/haruki/callback" });
    expect(() => validateHarukiEndpointConfiguration()).toThrow("HARUKI_REDIRECT_URI_NOT_ALLOWED");
  });

  it("requires confidential client credentials in production", () => {
    Object.assign(config, { nodeEnv: "production", harukiOAuthClientId: "client", harukiOAuthClientSecret: "", harukiOAuthRedirectUri: "https://sekai-tools.cn/api/auth/haruki/callback" });
    expect(() => validateHarukiEndpointConfiguration()).toThrow("HARUKI_OAUTH_CLIENT_CREDENTIALS_REQUIRED");
  });

  it("requires a valid AES-256 token encryption key in production", () => {
    Object.assign(config, { nodeEnv: "production", harukiOAuthClientId: "client", harukiOAuthClientSecret: "secret", harukiTokenEncryptionKey: "", harukiOAuthRedirectUri: "https://sekai-tools.cn/api/auth/haruki/callback" });
    expect(() => validateHarukiEndpointConfiguration()).toThrow("HARUKI_TOKEN_ENCRYPTION_KEY is required in production");
  });

  it("rejects malformed previous encryption keys in production", () => {
    Object.assign(config, { nodeEnv: "production", harukiOAuthClientId: "client", harukiOAuthClientSecret: "secret", harukiTokenEncryptionKey: "00".repeat(32), harukiTokenPreviousEncryptionKeys: "v0:not-a-key", harukiOAuthRedirectUri: "https://sekai-tools.cn/api/auth/haruki/callback" });
    expect(() => validateHarukiEndpointConfiguration()).toThrow("Haruki key v0 must decode to exactly 32 bytes");
  });

  it("keeps revoke audits after account deletion and protects them with forced RLS", () => {
    const migration = readFileSync(new URL("./db/migrations/013_haruki_player_sync.sql", import.meta.url), "utf8");
    expect(migration).toContain("on delete set null");
    expect(migration).toContain("alter table haruki_revoke_audits force row level security");
    expect(migration).toContain("haruki_revoke_audits_owner_worker");
    expect(migration).toContain("user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid");
  });
});
