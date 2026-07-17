export type FavoriteType = "player" | "event" | "song" | "card" | "gacha" | "honor" | "material" | "costume" | "stamp" | "comic";
export type FavoriteTarget = { available: boolean; id: string; type: FavoriteType; displayName: string; secondaryText?: string; imageUrl?: string; imageCandidates?: string[] };
export type Favorite = {
  id: string;
  type: FavoriteType;
  region: string;
  targetId: string;
  label?: string;
  folderIds: string[];
  target?: FavoriteTarget;
  createdAt: string;
  updatedAt: string;
  version?: string;
};
export type FavoriteFolder = { id: string; name: string; description?: string; itemCount?: number; createdAt: string; updatedAt: string; version?: string };
export type ScoreRecord = { id: string; region: string; songId: string; difficulty: string; clearStatus: "not_clear" | "clear" | "fc" | "ap"; score: number; targetScore?: number; note?: string; version?: string };
