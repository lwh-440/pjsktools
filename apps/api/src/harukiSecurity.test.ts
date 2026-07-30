import { describe, expect, it, vi } from "vitest";
import { encryptHarukiSecret } from "./authCrypto.js";
import { MemoryHarukiStore } from "./harukiStore.js";
import { ensureHarukiAccessToken } from "./harukiTokenManager.js";
import { nextPendingEmptyGroups } from "./harukiSyncState.js";
import type { HarukiSyncCandidate } from "./types.js";

describe("Haruki security and sync state", () => {
  it("serializes rotating refresh tokens across concurrent callers", async () => {
    const store = new MemoryHarukiStore();
    await store.saveConnection({
      userId: "user-1", subject: "subject-1", scope: ["offline_access", "user:read", "bindings:read", "game-data:read"],
      accessTokenEncrypted: encryptHarukiSecret("old-access"), refreshTokenEncrypted: encryptHarukiSecret("old-refresh"),
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(), encryptionKeyVersion: "v1", status: "active", availableBindings: []
    });
    const refresh = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { accessToken: "new-access", refreshToken: "new-refresh", expiresAt: new Date(Date.now() + 3600_000).toISOString(), scope: ["offline_access", "user:read", "bindings:read", "game-data:read"] };
    });
    const results = await Promise.all(Array.from({ length: 6 }, () => ensureHarukiAccessToken("user-1", { store, refresh })));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.accessToken)).toEqual(Array(6).fill("new-access"));
    expect((await store.getConnection("user-1"))?.status).toBe("active");
  });

  it("rejects inactive connections and missing required scopes before using an unexpired token", async () => {
    const store = new MemoryHarukiStore();
    await store.saveConnection({ userId: "user-1", subject: "subject-1", scope: ["user:read"], accessTokenEncrypted: encryptHarukiSecret("access"), tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), encryptionKeyVersion: "v1", status: "active", availableBindings: [] });
    await expect(ensureHarukiAccessToken("user-1", { store })).rejects.toMatchObject({ code: "reauthorize" });
    await store.saveConnection({ userId: "user-1", subject: "subject-1", scope: ["offline_access", "user:read", "bindings:read", "game-data:read"], accessTokenEncrypted: encryptHarukiSecret("access"), tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), encryptionKeyVersion: "v1", status: "reauthorize", availableBindings: [] });
    await expect(ensureHarukiAccessToken("user-1", { store })).rejects.toMatchObject({ code: "reauthorize" });
  });

  it("keeps, resolves, and preserves pending empty groups by the review matrix", () => {
    const candidate = {
      cardsPresent: false, cards: [], sourceSummary: { unknownKeys: [] }, invalidGroups: ["materials"], upstreamVersion: "v1",
      playerData: [
        { kind: "area-items", data: [] },
        { kind: "character-ranks", data: [{ characterId: "1", rank: 10 }] }
      ]
    } as HarukiSyncCandidate;
    expect(nextPendingEmptyGroups(["materials"], candidate, { "area-items": "keep", "character-ranks": "update" })).toEqual(expect.arrayContaining(["materials", "area-items"]));
    expect(nextPendingEmptyGroups(["materials", "area-items", "character-ranks"], candidate, { "area-items": "update", "character-ranks": "update" })).toEqual(["materials"]);
  });

  it("isolates OAuth state, handoff, subject, and review ownership", async () => {
    const store = new MemoryHarukiStore();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await store.saveOAuthState("opaque-state", { userId: "user-1", client: "web", codeVerifierEncrypted: "secret", expiresAt });
    expect((await store.consumeOAuthState("opaque-state"))?.userId).toBe("user-1");
    expect(await store.consumeOAuthState("opaque-state")).toBeNull();
    await store.saveMobileHandoff("handoff", "user-1", expiresAt);
    expect(await store.consumeMobileHandoff("handoff", "user-2")).toBe(false);
    expect(await store.saveConnection({ userId: "user-1", subject: "shared", scope: [], accessTokenEncrypted: "a", encryptionKeyVersion: "v1", status: "active", availableBindings: [] })).toBeTruthy();
    await expect(store.saveConnection({ userId: "user-2", subject: "shared", scope: [], accessTokenEncrypted: "b", encryptionKeyVersion: "v1", status: "active", availableBindings: [] })).rejects.toThrow("HARUKI_SUBJECT_EXISTS");
    await store.saveReview("review", { userId: "user-1", bindingId: "binding-1", candidateHash: "hash", upstreamVersion: "v1", expiresAt });
    expect(await store.consumeReview("review", "user-2", "binding-1")).toBeNull();
  });

  it("limits both user and IP buckets and shares the same store state", async () => {
    const store = new MemoryHarukiStore();
    expect(await store.consumeRateLimit(["public:user:u1", "public:ip:127.0.0.1"], 2, 60)).toBe(true);
    expect(await store.consumeRateLimit(["public:user:u1", "public:ip:127.0.0.2"], 2, 60)).toBe(true);
    expect(await store.consumeRateLimit(["public:user:u1", "public:ip:127.0.0.3"], 2, 60)).toBe(false);
    expect(await store.consumeRateLimit(["public:user:u2", "public:ip:127.0.0.1"], 2, 60)).toBe(true);
    expect(await store.consumeRateLimit(["public:user:u3", "public:ip:127.0.0.1"], 2, 60)).toBe(false);
  });

  it("marks exactly one verified path binding when webhook sync is disabled", async () => {
    const store = new MemoryHarukiStore();
    const connection = await store.saveConnection({ userId: "user-1", subject: "subject-1", scope: ["offline_access", "user:read", "bindings:read", "game-data:read"], accessTokenEncrypted: encryptHarukiSecret("access"), encryptionKeyVersion: "v1", status: "active", availableBindings: [] });
    await store.importBindings("user-1", connection.id, [{ id: "key", bindingKey: "key", region: "jp", playerUid: "123456789", verified: true }]);
    const event = { eventId: "event", subject: "", bindingKey: "", dataType: "suite" as const, region: "jp" as const, playerUid: "123456789", payloadHash: "hash", status: "pending" as const, receivedAt: new Date().toISOString() };
    expect(await store.markWebhookBinding(event)).toBe(true);
    expect((await store.resolveWebhookBinding(event))?.upstreamUpdateAvailable).toBe(true);
    expect(await store.resolveWebhookBinding({ ...event, playerUid: "987654321" })).toBeNull();
  });

  it("accepts a user-scoped revoke audit before local account deletion", async () => {
    const store = new MemoryHarukiStore();
    await expect(store.saveRevokeAudit({ userId: "user-1", connectionId: "connection-1", subjectHash: "hash", failedHints: ["refresh_token"], status: "pending", createdAt: new Date().toISOString() })).resolves.toBeUndefined();
  });
});
