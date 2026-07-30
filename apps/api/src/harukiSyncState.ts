import type { HarukiSyncCandidate, PlayerDataKind } from "./types.js";
import { harukiGroupIsEmpty } from "./harukiPlayerData.js";

export function nextPendingEmptyGroups(
  previous: PlayerDataKind[],
  candidate: HarukiSyncCandidate,
  selections: Partial<Record<PlayerDataKind, "update" | "keep">>
) {
  const next = new Set(previous);
  const invalid = new Set(candidate.invalidGroups);
  for (const group of candidate.playerData) {
    if (invalid.has(group.kind)) continue;
    const action = selections[group.kind];
    if (harukiGroupIsEmpty(group.data)) {
      if (action === "update") next.delete(group.kind);
      else next.add(group.kind);
    } else if (action === "update") {
      next.delete(group.kind);
    }
  }
  return [...next];
}
