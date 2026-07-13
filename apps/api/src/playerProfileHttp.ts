import { HarukiProfileRequestError, HarukiRequestError } from "./harukiClient.js";

export const playerUidPattern = /^\d{10,20}$/;

const missingPublicPlayerMessage = "Player data is not in the public database; the player may not have uploaded it or enabled public access";

export function playerProfileFailure(reply: any, error: unknown) {
  if (error instanceof HarukiProfileRequestError && error.kind === "not-found") {
    return reply.notFound(missingPublicPlayerMessage);
  }
  return reply.serviceUnavailable(`Public player data is temporarily unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

export function rankingDataFailure(reply: any, error: unknown, subject = "Ranking data") {
  if (error instanceof HarukiRequestError && error.kind === "not-found") {
    return reply.notFound(`${subject} is not available from the public source`);
  }
  if (error instanceof HarukiRequestError && error.kind === "rate-limited") {
    return reply.serviceUnavailable("Ranking source is rate-limited; retry later");
  }
  return reply.serviceUnavailable(`${subject} is temporarily unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

export function rankingPlayerFailure(reply: any, error: unknown) {
  return rankingDataFailure(reply, error, "Ranking player detail");
}
