import { randomUUID } from "node:crypto";
import { decryptHarukiSecret, encryptHarukiSecret } from "./authCrypto.js";
import { config } from "./config.js";
import { HarukiPlayerDataError, refreshHarukiToken, type HarukiTokenSet } from "./harukiOAuthClient.js";
import { harukiStore, type HarukiStore } from "./harukiStore.js";

const REFRESH_LEASE_MS = 30_000;
const REFRESH_WAIT_MS = 35_000;

function requireScopes(scopes: string[]) {
  const granted = new Set(scopes);
  if (config.harukiOAuthScope.split(/\s+/).filter(Boolean).some((scope) => !granted.has(scope))) {
    throw new HarukiPlayerDataError("reauthorize", 401);
  }
}

export async function ensureHarukiAccessToken(
  userId: string,
  dependencies: {
    store?: HarukiStore;
    refresh?: (refreshToken: string) => Promise<HarukiTokenSet>;
    wait?: (milliseconds: number) => Promise<void>;
  } = {}
) {
  const store = dependencies.store ?? harukiStore;
  const refresh = dependencies.refresh ?? refreshHarukiToken;
  const wait = dependencies.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = Date.now() + REFRESH_WAIT_MS;

  while (Date.now() < deadline) {
    const connection = await store.getConnection(userId);
    if (!connection) throw new HarukiPlayerDataError("reauthorize", 401);
    if (connection.status !== "active") throw new HarukiPlayerDataError("reauthorize", 401);
    requireScopes(connection.scope);
    if (!connection.tokenExpiresAt || Date.parse(connection.tokenExpiresAt) > Date.now() + 60_000) {
      return { connection, accessToken: decryptHarukiSecret(connection.accessTokenEncrypted) };
    }
    if (!connection.refreshTokenEncrypted) throw new HarukiPlayerDataError("reauthorize", 401);

    const leaseId = randomUUID();
    const claimed = await store.claimTokenRefresh(userId, leaseId, new Date(Date.now() + REFRESH_LEASE_MS).toISOString());
    if (!claimed) {
      await wait(50);
      continue;
    }

    try {
      const latest = await store.getConnection(userId);
      if (!latest) throw new HarukiPlayerDataError("reauthorize", 401);
      if (latest.status !== "active") throw new HarukiPlayerDataError("reauthorize", 401);
      requireScopes(latest.scope);
      if (!latest.tokenExpiresAt || Date.parse(latest.tokenExpiresAt) > Date.now() + 60_000) {
        await store.releaseTokenRefresh(userId, leaseId);
        return { connection: latest, accessToken: decryptHarukiSecret(latest.accessTokenEncrypted) };
      }
      if (!latest.refreshTokenEncrypted) throw new HarukiPlayerDataError("reauthorize", 401);
      const oldRefresh = decryptHarukiSecret(latest.refreshTokenEncrypted);
      const refreshed = await refresh(oldRefresh);
      const scopes = refreshed.scope.length ? refreshed.scope : latest.scope;
      requireScopes(scopes);
      const saved = await store.finishTokenRefresh(userId, leaseId, {
        ...latest,
        userId,
        scope: scopes,
        accessTokenEncrypted: encryptHarukiSecret(refreshed.accessToken),
        refreshTokenEncrypted: encryptHarukiSecret(refreshed.refreshToken ?? oldRefresh),
        tokenExpiresAt: refreshed.expiresAt,
        encryptionKeyVersion: config.harukiTokenEncryptionKeyVersion,
        status: "active"
      });
      if (!saved) continue;
      return { connection: saved, accessToken: refreshed.accessToken };
    } catch (error) {
      await store.releaseTokenRefresh(userId, leaseId);
      throw error;
    }
  }
  throw new HarukiPlayerDataError("upstream-error", 502);
}
