import type { FastifyBaseLogger } from "fastify";
import { config, regions } from "./config.js";
import { syncMasterRegion } from "./masterData.js";
import { refreshWatchedPlayers, refreshWatchedRankings } from "./runtimeData.js";

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
      logger.warn({ job: name, error }, "auto update failed");
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
  if (!config.autoUpdateEnabled) {
    logger.info("auto update disabled");
    return [];
  }

  return [
    startLoop("players", config.playerRefreshMs, refreshWatchedPlayers, logger),
    startLoop("rankings", config.rankingRefreshMs, refreshWatchedRankings, logger),
    startLoop(
      "master",
      config.masterRefreshMs,
      async () => {
        for (const region of regions) {
          try {
            await syncMasterRegion(region.id);
          } catch (error) {
            logger.warn({ job: "master", region: region.id, error }, "region master update failed");
          }
        }
      },
      logger
    )
  ];
}
