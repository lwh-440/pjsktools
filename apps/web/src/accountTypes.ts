import type { Favorite, FavoriteFolder, ScoreRecord } from "./sharedTypes";

export type AuthUser = { id: string; email?: string; nickname?: string; avatarUrl?: string; createdAt?: string };
export type OAuthAccount = { id: string; provider: string; nickname?: string; avatarUrl?: string; createdAt?: string };
export type PlayerBinding = { id: string; region: string; playerUid: string; displayName?: string; isDefault?: boolean; note?: string; publicProfileSnapshot?: any; refreshedAt?: string; updatedAt?: string; version?: string };
export type PlayerDataRecord = { kind: string; data: unknown; updatedAt?: string; unavailableReason?: string };
export type CompletenessSection = { ready: boolean; missingFields: string[]; uploadedKinds?: string[]; requiredKinds?: string[] };
export type CompletenessFull = { ownedCards: number; uploadedPlayerDataKinds: string[]; sections: Record<string, CompletenessSection> };
export type ToolState = { ready: boolean; missingFields: string[]; warnings: string[] };
export type ToolContext = {
  binding: PlayerBinding;
  publicProfileSnapshot?: any;
  inventoryCount: number;
  playerDataKinds: string[];
  completeness: CompletenessFull;
  formulaReadiness: Record<string, CompletenessSection>;
  sharedFormulaVersion?: string;
  assetReadiness?: Record<string, { ready: boolean; count: number; missingFields: string[] }>;
  formulaImpact?: Record<string, string>;
  toolAvailability: Record<string, ToolState>;
  normalEventPlan?: ToolState;
  toolContextWarnings: string[];
  summary?: BindingSummary;
  realDataRequired: boolean;
};
export type DeckConfig = { id: string; bindingId?: string; region: string; name: string; eventId?: string; leaderCardId?: string; cardIds: string[]; note?: string; version?: string };
export type BindingSummary = {
  binding: PlayerBinding;
  publicProfileSnapshot?: any;
  inventoryCount: number;
  playerData: PlayerDataRecord[];
  playerDataByKind: Record<string, PlayerDataRecord>;
  completeness: CompletenessFull;
  deckConfigs?: DeckConfig[];
  scores?: ScoreRecord[];
  favorites?: Favorite[];
};
export type MeProfile = {
  user: AuthUser;
  oauthAccounts: OAuthAccount[];
  bindings: PlayerBinding[];
  bindingSummaries: BindingSummary[];
  favorites: Favorite[];
  favoriteFolders: FavoriteFolder[];
  scores: ScoreRecord[];
  deckConfigs: DeckConfig[];
};
export type InventoryItem = { cardId: string; level?: number; masterRank?: number; skillLevel?: number; specialTrainingStatus?: string; defaultImage?: string; episodesRead?: boolean; episodes?: Array<{ cardEpisodeId: string; scenarioStatus: string; scenarioStatusReasons?: string[]; isNotSkipped?: boolean }> };
export type AuthResponse = { accessToken: string; token: string; refreshToken?: string; user: AuthUser };
export type { ProfileAnalysis } from "./components/PlayerProfileAnalysis";

export const playerDataKindOptions = [
  "area-items",
  "character-ranks",
  "music-results",
  "materials",
  "honors",
  "profile-honors",
  "challenge-live",
  "world-bloom-support",
  "mysekai-canvas",
  "mysekai-gates",
  "mysekai-fixtures"
];
