import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.sequential("compliance and account lifecycle", () => {
  let app: Awaited<ReturnType<typeof import("./app.js")["buildApp"]>>;
  let store: typeof import("./store.js")["store"];
  let email = "";
  let accessToken = "";

  beforeAll(async () => {
    process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
    process.env.PJSKTOOLS_SILENT_APP_LOGS = "true";
    process.env.QQ_CONNECT_APP_ID = "test-app-id";
    process.env.QQ_CONNECT_APP_KEY = "test-app-key";
    process.env.QQ_CONNECT_REDIRECT_URI = "https://api.example.test/api/auth/qq/callback";
    const appModule = await import("./app.js");
    store = (await import("./store.js")).store;
    app = await appModule.buildApp({ smtpAvailable: true, verificationEmailSender: async () => ({ sent: true }) });
    email = `compliance-${Date.now()}@example.com`;
    await store.createUser(email, "Compliance-password-123!");
  });

  afterAll(async () => {
    await store.deleteUserByEmail(email).catch(() => false);
    await app.close();
  });

  it("publishes the exact current legal versions and public operator label", async () => {
    const response = await app.inject({ method: "GET", url: "/api/legal/current" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      operator: "SEKAI TOOLS（sekai-tools.cn 网站运营者）",
      privacyVersion: "2026-08-04",
      termsVersion: "2026-08-04",
      minimumAge: 14
    });
  });

  it("writes security events without account identifiers or credentials", async () => {
    const { buildSecurityEvent } = await import("./securityEvents.js");
    const { sanitizeRequestLogUrl } = await import("./app.js");
    const record = buildSecurityEvent({
      event: "login_failed", requestId: "request-1", ip: "203.0.113.1",
      accountIdentifier: "private@example.com", at: "2026-08-04T00:00:00.000Z"
    });
    const serialized = JSON.stringify(record);
    expect(record.accountHash).toMatch(/^[0-9a-f]{64}$/);
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("verification-code");
    expect(serialized).not.toContain("access-token");
    expect(sanitizeRequestLogUrl("/api/players/jp/123456789/profile?token=sensitive"))
      .toBe("/api/players/jp/:id/profile");
  });

  it("suppresses denylisted player profiles before reads or refreshes", async () => {
    const { buildApp } = await import("./app.js");
    const blocked = await buildApp({
      smtpAvailable: false,
      playerDisplayBlocker: (region, playerUid) => region === "jp" && playerUid === "1234567890"
    });
    const read = await blocked.inject({ method: "GET", url: "/api/players/jp/1234567890/profile" });
    const refresh = await blocked.inject({ method: "POST", url: "/api/players/jp/1234567890/refresh" });
    expect(read.statusCode).toBe(404);
    expect(refresh.statusCode).toBe(404);
    expect(read.body).not.toContain("1234567890");
    expect(refresh.body).not.toContain("1234567890");
    await blocked.close();
  });

  it("returns Retry-After for repeated verification requests and hides internal sync/Haruki routes", async () => {
    const target = `rate-${Date.now()}@example.com`;
    const first = await app.inject({ method: "POST", url: "/api/auth/email-code/start", payload: { email: target, purpose: "register" } });
    expect(first.statusCode).toBe(200);
    const repeated = await app.inject({ method: "POST", url: "/api/auth/email-code/start", payload: { email: target, purpose: "register" } });
    expect(repeated.statusCode).toBe(429);
    expect(Number(repeated.headers["retry-after"])).toBeGreaterThan(0);
    expect((await app.inject({ method: "POST", url: "/api/master/jp/sync" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/me/haruki/public/preview" })).statusCode).toBe(404);
  });

  it("uses a host-only HttpOnly refresh cookie and gates pending legal acceptance", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/web/login",
      payload: { email, password: "Compliance-password-123!" }
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().legalAcceptanceRequired).toBe(true);
    expect(await store.getLegalAcceptance(login.json().user.id)).toBeNull();
    expect(login.json()).not.toHaveProperty("refreshToken");
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("SameSite=Strict");
    expect(login.headers["set-cookie"]).not.toContain("Domain=");
    accessToken = login.json().accessToken;

    const gated = await app.inject({ method: "GET", url: "/api/me/profile", headers: { authorization: `Bearer ${accessToken}` } });
    expect(gated.statusCode).toBe(428);

    const accepted = await app.inject({
      method: "POST",
      url: "/api/me/legal-acceptances",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { privacyVersion: "2026-08-04", termsVersion: "2026-08-04", ageConfirmed: true, source: "web" }
    });
    expect(accepted.statusCode).toBe(200);
    expect((await store.getLegalAcceptance(accepted.json().userId))?.ageConfirmed).toBe(true);

    const profile = await app.inject({ method: "GET", url: "/api/me/profile", headers: { authorization: `Bearer ${accessToken}` } });
    expect(profile.statusCode).toBe(200);
  });

  it("strips duplicated raw ranking payloads", async () => {
    const [saved] = await store.saveRankingHistorySamples([{
      region: "jp", eventId: "1", sampleType: "border", rank: 100,
      score: 123, sampledAt: new Date().toISOString(), bucketAt: new Date().toISOString(),
      rawPayload: { player: { userId: "sensitive", name: "sensitive" } }, sourceMetadata: { source: "test" }
    }]);
    expect(saved.rawPayload).toEqual({});
  });

  it("reports the implemented 14-day raw ranking retention policy", async () => {
    const history = await app.inject({ method: "GET", url: "/api/events/jp/1/ranking-history" });
    expect(history.statusCode).toBe(200);
    expect(history.json().retentionRecommendation).toContain("retained for 14 days");
    expect(history.json().retentionRecommendation).toContain("one-minute rollups");

    const summary = await app.inject({ method: "GET", url: "/api/events/jp/1/ranking-history/summary" });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().retentionRecommendation).toContain("retained for 14 days");
    expect(summary.json().retentionRecommendation).toContain("one-minute rollups");
  });

  it("requires a one-time deletion email code and consumes the confirmation intent", async () => {
    const user = await store.verifyUser(email, "Compliance-password-123!");
    expect(user).toBeTruthy();
    await store.createEmailVerificationCode({
      email, purpose: "delete-account", code: "123456", expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    const intent = await app.inject({
      method: "POST", url: "/api/me/account-deletion/intent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { confirmation: "DELETE", code: "123456" }
    });
    expect(intent.statusCode).toBe(200);
    expect(intent.json().token).toHaveLength(72);
    const replay = await app.inject({
      method: "POST", url: "/api/me/account-deletion/intent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { confirmation: "DELETE", code: "123456" }
    });
    expect(replay.statusCode).toBe(401);
  });

  it("creates irreversible, time-bounded deletion tombstones", async () => {
    const deletedEmail = `deleted-${Date.now()}@example.com`;
    const deleted = await store.createUser(deletedEmail, "Deleted-password-123!");
    expect(await store.deleteUserById(deleted.id)).toBe(true);
    const tombstone = (await store.listDeletionTombstones()).find((item) => item.userHash.length === 64 && item.emailHash?.length === 64);
    expect(tombstone).toBeTruthy();
    expect(JSON.stringify(tombstone)).not.toContain(deletedEmail);
    expect(JSON.stringify(tombstone)).not.toContain(deleted.id);
  });

  it("deletes the account and all account-scoped data through the confirmation API", async () => {
    const cascadeEmail = `cascade-${Date.now()}@example.com`;
    const user = await store.createUser(cascadeEmail, "Cascade-password-123!");
    const refreshToken = `cascade-refresh-${Date.now()}`;
    await store.createSession(user.id, refreshToken, new Date(Date.now() + 86_400_000).toISOString());
    const folder = await store.createFavoriteFolder({ userId: user.id, name: "private" });
    await store.addFavorite({ userId: user.id, type: "player", region: "jp", targetId: "123456789", label: "private", folderIds: [folder.id] });
    await store.upsertScore({ userId: user.id, region: "jp", songId: "1", difficulty: "expert", clearStatus: "fc", score: 1 });
    const binding = await store.addPlayerBinding({
      userId: user.id, region: "jp", playerUid: "123456789", displayName: "private",
      isDefault: true, publicProfileSnapshot: { name: "private" }
    });
    await store.upsertDeckConfig({ userId: user.id, bindingId: binding.id, region: "jp", name: "private", cardIds: ["1"] });
    await store.upsertPlayerData({ userId: user.id, bindingId: binding.id, region: "jp", kind: "music-results", data: { private: true } });
    const confirmationToken = `cascade-${"a".repeat(64)}`;
    await store.createAccountDeletionIntent(user.id, confirmationToken, new Date(Date.now() + 300_000).toISOString());
    const token = app.jwt.sign({ sub: user.id, email: cascadeEmail });

    const confirmed = await app.inject({
      method: "POST", url: "/api/me/account-deletion/confirm",
      headers: { authorization: `Bearer ${token}` }, payload: { token: confirmationToken }
    });
    expect(confirmed.statusCode).toBe(200);
    expect(await store.getUser(user.id)).toBeNull();
    expect(await store.getSessionByRefreshToken(refreshToken)).toBeNull();
    expect(await store.listFavoriteFolders(user.id)).toEqual([]);
    expect(await store.listFavorites(user.id)).toEqual([]);
    expect(await store.listScores(user.id)).toEqual([]);
    expect(await store.listPlayerBindings(user.id)).toEqual([]);
    expect(await store.listDeckConfigs(user.id)).toEqual([]);
    expect(await store.listPlayerData(user.id, binding.id)).toEqual([]);

    const replay = await app.inject({
      method: "POST", url: "/api/me/account-deletion/confirm",
      headers: { authorization: `Bearer ${token}` }, payload: { token: confirmationToken }
    });
    expect(replay.statusCode).toBe(401);
  });

  it("keeps pure-QQ deletion handoffs one-time and bound to the reauthenticated user", async () => {
    const qqUser = await store.createOAuthUser({ provider: "qq", providerUserId: `qq-delete-${Date.now()}`, nickname: "qq-user" });
    const otherUser = await store.createOAuthUser({ provider: "qq", providerUserId: `qq-other-${Date.now()}`, nickname: "other" });
    const qqToken = app.jwt.sign({ sub: qqUser.id });
    const otherToken = app.jwt.sign({ sub: otherUser.id });
    const handoff = `delete_${"b".repeat(32)}`;
    await store.createOAuthHandoff(handoff, {
      kind: "delete", userId: qqUser.id,
      oauth: { provider: "qq", providerUserId: `qq-delete-${Date.now()}` }
    }, new Date(Date.now() + 120_000).toISOString());

    const wrongUser = await app.inject({
      method: "POST", url: "/api/me/account-deletion/qq/exchange",
      headers: { authorization: `Bearer ${otherToken}` }, payload: { handoff }
    });
    expect(wrongUser.statusCode).toBe(401);
    const exchanged = await app.inject({
      method: "POST", url: "/api/me/account-deletion/qq/exchange",
      headers: { authorization: `Bearer ${qqToken}` }, payload: { handoff }
    });
    expect(exchanged.statusCode).toBe(200);
    const replay = await app.inject({
      method: "POST", url: "/api/me/account-deletion/qq/exchange",
      headers: { authorization: `Bearer ${qqToken}` }, payload: { handoff }
    });
    expect(replay.statusCode).toBe(401);

    const confirmed = await app.inject({
      method: "POST", url: "/api/me/account-deletion/confirm",
      headers: { authorization: `Bearer ${qqToken}` }, payload: { token: exchanged.json().token }
    });
    expect(confirmed.statusCode).toBe(200);
    expect(await store.getUser(qqUser.id)).toBeNull();
    expect(await store.listOAuthAccounts(qqUser.id)).toEqual([]);
    await store.deleteUserById(otherUser.id);
  });

  it("returns Android QQ-deletion cancellation through a non-sensitive deep link", async () => {
    const user = await store.createOAuthUser({ provider: "qq", providerUserId: `qq-cancel-${Date.now()}` });
    const state = `cancel-${Date.now()}`;
    await store.createAuthState("qq", state, `__qq_delete__:android:${user.id}`, new Date(Date.now() + 120_000).toISOString());
    const response = await app.inject({ method: "GET", url: `/api/auth/qq/callback?error=access_denied&state=${state}` });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("pjsktools://auth/qq-delete?error=qq_authorization_cancelled");
    expect(response.headers.location).not.toContain(user.id);
    await store.deleteUserById(user.id);
  });

  it("exports QQ OpenID without exporting stored or transient OAuth tokens", async () => {
    const providerUserId = `qq-export-${Date.now()}`;
    const user = await store.createOAuthUser({
      provider: "qq", providerUserId, nickname: "export-user",
      accessTokenEncrypted: "legacy-access-token", refreshTokenEncrypted: "legacy-refresh-token",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const token = app.jwt.sign({ sub: user.id });
    const response = await app.inject({ method: "GET", url: "/api/me/export", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().oauthAccounts[0].providerUserId).toBe(providerUserId);
    expect(response.body).not.toContain("legacy-access-token");
    expect(response.body).not.toContain("legacy-refresh-token");
    expect(response.body).not.toContain("accessTokenEncrypted");
    expect(response.body).not.toContain("refreshTokenEncrypted");
    await store.deleteUserById(user.id);
  });

  it("deletes locally even when external Haruki cleanup throws", async () => {
    const { buildApp } = await import("./app.js");
    const cleanupFailureApp = await buildApp({
      smtpAvailable: false,
      accountDeletionExternalCleanup: async () => { throw new Error("simulated decrypt failure"); }
    });
    const user = await store.createUser(`cleanup-${Date.now()}@example.com`, "Cleanup-password-123!");
    const confirmationToken = `cleanup-${"c".repeat(64)}`;
    await store.createAccountDeletionIntent(user.id, confirmationToken, new Date(Date.now() + 120_000).toISOString());
    const token = cleanupFailureApp.jwt.sign({ sub: user.id });
    const response = await cleanupFailureApp.inject({
      method: "POST", url: "/api/me/account-deletion/confirm",
      headers: { authorization: `Bearer ${token}` }, payload: { token: confirmationToken }
    });
    expect(response.statusCode).toBe(200);
    expect(await store.getUser(user.id)).toBeNull();
    await cleanupFailureApp.close();
  });
});
