import type { FastifyBaseLogger } from "fastify";
import { config, regions } from "./config.js";
import { syncMasterRegion } from "./masterData.js";
import { refreshWatchedPlayers, refreshWatchedRankings } from "./runtimeData.js";

function startLoop(name: string, intervalMs: number, task: () => Promise<unknown>, logger: FastifyBaseLogger) {
  const run = async () => {
    try {
      await task();
      logger.info({ job: name }, "auto update completed");
    } catch (error) {
      logger.warn({ job: name, error }, "auto update failed");
    }
  };

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
