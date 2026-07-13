import { HarukiProfileRequestError } from "./harukiClient.js";

export const playerUidPattern = /^\d{10,20}$/;

const missingPublicPlayerMessage = "Player data is not in the public database; the player may not have uploaded it or enabled public access";

export function playerProfileFailure(reply: any, error: unknown) {
  if (error instanceof HarukiProfileRequestError && error.kind === "not-found") {
    return reply.notFound(missingPublicPlayerMessage);
  }
  return reply.serviceUnavailable(`Public player data is temporarily unavailable: ${error instanceof Error ? error.message : String(error)}`);
}
