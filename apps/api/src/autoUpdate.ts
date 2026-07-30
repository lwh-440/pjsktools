import type { FastifyBaseLogger } from "fastify";
import { config, regions } from "./config.js";
import { syncMasterRegion } from "./masterData.js";
import { refreshWatchedPlayers, refreshWatchedRankings } from "./runtimeData.js";
import { syncDueHarukiBindings } from "./harukiAutoSync.js";
import { harukiStore } from "./harukiStore.js";
import { store } from "./store.js";
import { fetchOAuthHarukiMysekai, fetchOAuthHarukiSuite } from "./harukiOAuthClient.js";
import { ensureHarukiAccessToken } from "./harukiTokenManager.js";
import { harukiGroupIsEmpty, normalizeHarukiSuite } from "./harukiPlayerData.js";

export async function processHarukiWebhooks() {
  if (!config.harukiWebhookEnabled) return { claimed: 0 };
  const events = await harukiStore.claimWebhookEvents(50);
  for (const event of events) {
    try {
      const binding = await harukiStore.resolveWebhookBinding(event);
      if (!binding) { await harukiStore.finishWebhookEvent(event.eventId, "ignored"); continue; }
      if (!binding.verified || binding.region !== event.region || binding.playerUid !== event.playerUid || binding.source !== "haruki-oauth") {
        await harukiStore.finishWebhookEvent(event.eventId, "ignored"); continue;
      }
      const connection = await harukiStore.getConnection(binding.userId);
      if (!connection || connection.status !== "active" || !connection.scope.includes("game-data:read") || binding.harukiConnectionId !== connection.id) {
        await harukiStore.finishWebhookEvent(event.eventId, "ignored"); continue;
      }
      if (!config.harukiWebhookSyncEnabled) {
        await harukiStore.markWebhookBinding(event);
        await harukiStore.finishWebhookEvent(event.eventId, "processed");
        continue;
      }
      const { accessToken } = await ensureHarukiAccessToken(binding.userId);
      const fetched = event.dataType === "mysekai"
        ? await fetchOAuthHarukiMysekai(accessToken, binding.region, binding.playerUid, binding.upstreamUploadedAt)
        : await fetchOAuthHarukiSuite(accessToken, binding.region, binding.playerUid, binding.upstreamUploadedAt);
      if (fetched.notModified) await harukiStore.updateSyncFailure(binding.userId, binding.id, "no-change", fetched.uploadTime);
      else {
        const candidate = normalizeHarukiSuite(binding.region, fetched.suite);
        if (candidate.sourceSummary.userId !== binding.playerUid || candidate.sourceSummary.region !== binding.region) {
          await harukiStore.finishWebhookEvent(event.eventId, "ignored"); continue;
        }
        const selected = event.dataType === "mysekai" ? candidate.playerData.filter((group) => group.kind.startsWith("mysekai")) : candidate.playerData;
        const groups = selected.filter((group) => !harukiGroupIsEmpty(group.data)).map((group) => group.kind);
        const pending = selected.filter((group) => harukiGroupIsEmpty(group.data)).map((group) => group.kind);
        await harukiStore.applySync({ userId: binding.userId, binding, candidate, updateCards: event.dataType === "suite" && candidate.cardsPresent, updateGroups: groups, pendingEmptyGroups: pending });
      }
      await harukiStore.finishWebhookEvent(event.eventId, "processed");
    } catch {
      await harukiStore.finishWebhookEvent(event.eventId, "failed");
    }
  }
  return { claimed: events.length };
}

export function safeBackgroundError(error: unknown) {
  const value = error as { code?: unknown; name?: unknown; statusCode?: unknown };
  return {
    category: typeof value?.code === "string" ? value.code : typeof value?.name === "string" ? value.name : "unknown",
    statusCode: typeof value?.statusCode === "number" ? value.statusCode : undefined
  };
}

export function startLoop(name: string, intervalMs: number, task: () => Promise<unknown>, logger: FastifyBaseLogger) {
  let running = false;
  const run = async () => {
    if (running) {
      logger.warn({ job: name }, "auto update skipped because previous run is still active");
      return;
    }
    running = true;
    try {
      await task();
      logger.info({ job: name }, "auto update completed");
    } catch (error) {
      logger.warn({ job: name, failure: safeBackgroundError(error) }, "auto update failed");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return timer;
}

export function startAutoUpdate(logger: FastifyBaseLogger) {
  const maintenance = [
    startLoop("haruki-expired-records", 10 * 60_000, () => harukiStore.cleanupExpiredRecords(), logger),
    startLoop("idempotency-cleanup", 60 * 60_000, () => store.cleanupIdempotencyRecords(), logger),
    ...(config.harukiWebhookEnabled ? [startLoop("haruki-webhook-worker", 15_000, processHarukiWebhooks, logger)] : [])
  ];
  if (!config.autoUpdateEnabled) {
    logger.info("auto update disabled");
    return maintenance;
  }

  return [
    ...maintenance,
    startLoop("players", config.playerRefreshMs, refreshWatchedPlayers, logger),
    startLoop("rankings", config.rankingRefreshMs, refreshWatchedRankings, logger),
    startLoop("haruki-player-sync", 60 * 60_000, syncDueHarukiBindings, logger),
    startLoop(
      "master",
      config.masterRefreshMs,
      async () => {
        for (const region of regions) {
          try {
            await syncMasterRegion(region.id);
          } catch (error) {
            logger.warn({ job: "master", region: region.id, failure: safeBackgroundError(error) }, "region master update failed");
          }
        }
      },
      logger
    )
  ];
}
