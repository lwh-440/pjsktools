export type Favorite = { id: string; type: "player" | "event" | "song" | "card"; region: string; targetId: string; label: string; createdAt: string };
export type ScoreRecord = { id: string; region: string; songId: string; difficulty: string; clearStatus: "not_clear" | "clear" | "fc" | "ap"; score: number; targetScore?: number; note?: string };

