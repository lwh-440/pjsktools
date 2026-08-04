import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { RegionId } from "./config.js";

const entrySchema = z.object({
  region: z.enum(["jp", "en", "tw", "kr", "cn"]),
  playerUid: z.string().regex(/^\d{8,20}$/),
  ticketId: z.string().min(1).max(100),
  reasonCode: z.string().min(1).max(100),
  actionedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional()
}).strict();

const fileSchema = z.object({ entries: z.array(entrySchema).max(10_000) }).strict();

export type PlayerDisplayBlocker = (region: RegionId, playerUid: string) => boolean;

export function loadPlayerDisplayBlocker(filePath: string): PlayerDisplayBlocker {
  if (!filePath) return () => false;
  const stat = statSync(filePath);
  if (!stat.isFile()) throw new Error("PLAYER_DISPLAY_DENYLIST_FILE must reference a regular file");
  const parsed = fileSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  const active = new Set(parsed.entries
    .filter((entry) => !entry.expiresAt || Date.parse(entry.expiresAt) > Date.now())
    .map((entry) => `${entry.region}:${entry.playerUid}`));
  return (region, playerUid) => active.has(`${region}:${playerUid}`);
}
