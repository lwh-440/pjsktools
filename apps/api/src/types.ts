import type { RegionId } from "./config.js";

export type FavoriteType = "player" | "event" | "song" | "card";

export interface UserAccount {
  id: string;
  email?: string;
  passwordHash?: string;
  nickname?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type OAuthProvider = "qq";

export interface OAuthAccount {
  id: string;
  userId: string;
  provider: OAuthProvider;
  providerUserId: string;
  nickname?: string;
  avatarUrl?: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface AuthState {
  id: string;
  provider: OAuthProvider;
  state: string;
  redirectTo: string;
  expiresAt: string;
  createdAt: string;
}

export type EmailVerificationPurpose = "register";

export interface EmailVerificationCode {
  id: string;
  email: string;
  purpose: EmailVerificationPurpose;
  codeHash: string;
  expiresAt: string;
  consumedAt?: string;
  attempts: number;
  createdAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  type: FavoriteType;
  region: RegionId;
  targetId: string;
  label: string;
  createdAt: string;
}

export interface ScoreRecord {
  id: string;
  userId: string;
  region: RegionId;
  songId: string;
  difficulty: string;
  clearStatus: "not_clear" | "clear" | "fc" | "ap";
  score: number;
  targetScore?: number;
  note?: string;
  updatedAt: string;
}

export interface PlayerBinding {
  id: string;
  userId: string;
  region: RegionId;
  playerUid: string;
  displayName?: string;
  isDefault: boolean;
  note?: string;
  publicProfileSnapshot?: unknown;
  refreshedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCardInventoryItem {
  id: string;
  userId: string;
  bindingId?: string;
  region: RegionId;
  cardId: string;
  level?: number;
  masterRank?: number;
  skillLevel?: number;
  specialTrainingStatus?: "not_doing" | "done" | "unknown";
  defaultImage?: "original" | "after_training";
  episodes?: Array<{
    cardEpisodeId: string;
    scenarioStatus: string;
    scenarioStatusReasons?: string[];
    isNotSkipped?: boolean;
  }>;
  episodesRead?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeckConfig {
  id: string;
  userId: string;
  bindingId?: string;
  region: RegionId;
  name: string;
  eventId?: string;
  leaderCardId?: string;
  cardIds: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type PlayerDataKind =
  | "area-items"
  | "character-ranks"
  | "music-results"
  | "materials"
  | "challenge-live"
  | "world-bloom-support"
  | "honors"
  | "profile-honors"
  | "decks"
  | "mysekai-canvas"
  | "mysekai-gates"
  | "mysekai-fixtures";

export interface PlayerDataRecord {
  id: string;
  userId: string;
  bindingId: string;
  region: RegionId;
  kind: PlayerDataKind;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface IdempotencyRecord {
  scope: string;
  key: string;
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: string;
  expiresAt: string;
}

export type RankingSampleType = "border" | "top100";

export interface RankingHistorySample {
  id: string;
  region: RegionId;
  eventId: string;
  sampleType: RankingSampleType;
  rank: number;
  score: number;
  sampledAt: string;
  bucketAt: string;
  playerName?: string;
  userId?: string;
  leaderCardId?: string;
  leaderCardImageUrl?: string;
  rawPayload: unknown;
  sourceMetadata: unknown;
  createdAt: string;
}

export type RankingHistoryInput = Omit<RankingHistorySample, "id" | "createdAt">;

export type RankingHistoryQuery = {
  region: RegionId;
  eventId: string;
  sampleType?: RankingSampleType;
  rank?: number;
  from?: string;
  to?: string;
  limit?: number;
  windowHours?: number;
};

export interface Song {
  id: string;
  title: string;
  unit: string;
  difficulties: string[];
  difficultyDetails?: Array<{
    id?: string;
    difficulty: string;
    playLevel: number;
    totalNoteCount: number;
  }>;
  publishedAt: string;
  assetbundleName?: string;
  categories?: string[];
  creatorArtistId?: number;
  lyricist?: string;
  composer?: string;
  arranger?: string;
  durationSeconds?: number;
  bpm?: number;
  musicMeta?: MusicMeta;
  jacketAssetbundleName?: string;
  assets?: {
    jacketUrl?: string;
    assetbundleName?: string;
    jacketAssetbundleName?: string;
    sources?: Record<string, string>;
  };
}

export interface SongChartDetail {
  region: RegionId;
  musicId: string;
  title: string;
  difficulty: string;
  difficultyId?: string;
  playLevel?: number;
  totalNoteCount?: number;
  durationSeconds?: number;
  bpm?: number;
  jacketUrl: string;
  chartSvgUrl: string;
  chartPngUrl: string;
  sekaiViewerChartSvgUrl: string;
  susUrl: string;
  source: Record<string, string>;
  realDataRequired: true;
}

export interface MusicMeta {
  musicId: string;
  difficulty: string;
  musicTime: number;
  eventRate: number;
  baseScore: number;
  baseScoreAuto: number;
  skillScoreSolo: number[];
  skillScoreAuto: number[];
  skillScoreMulti: number[];
  feverScore: number;
  feverEndTime: number;
  tapCount: number;
  source: string;
}

export interface Card {
  id: string;
  characterId?: string;
  character: string;
  characterUnit?: string;
  title: string;
  rarity: number;
  attribute: string;
  skillId?: string;
  skill?: CardSkill;
  assetbundleName?: string;
  supportUnit?: string;
  cardRarityType?: string;
  specialTrainingPower1BonusFixed?: number;
  specialTrainingPower2BonusFixed?: number;
  specialTrainingPower3BonusFixed?: number;
  specialTrainingSkillId?: string;
  specialTrainingSkill?: CardSkill;
  cardParameters?: Array<{
    cardLevel: number;
    cardParameterType: string;
    power: number;
  }>;
  assets?: {
    normalUrl?: string;
    afterTrainingUrl?: string;
    normalThumbnailUrl?: string;
    afterTrainingThumbnailUrl?: string;
    imageCandidates?: string[];
    normalImageCandidates?: string[];
    normalThumbnailCandidates?: string[];
    afterTrainingImageCandidates?: string[];
    afterTrainingThumbnailCandidates?: string[];
    assetbundleName?: string;
    sources?: Record<string, string>;
    assetSourceTrace?: unknown;
  };
}

export interface CardSkillEffectDetail {
  level?: number;
  value?: number;
  value2?: number;
  valueType?: string;
  duration?: number;
  raw?: unknown;
}

export interface CardSkillEffect {
  id?: number;
  type?: string;
  judgment?: string;
  activateLife?: number;
  activateCharacterRank?: number;
  activateUnitCount?: number;
  skillEnhance?: unknown;
  details?: CardSkillEffectDetail[];
  raw?: unknown;
}

export interface CardSkill {
  id: string;
  name?: string;
  description?: string;
  skillType?: string;
  duration?: number;
  effects?: CardSkillEffect[];
  formattedDescriptions?: Record<"1" | "2" | "3" | "4", string>;
  skillFormatTrace?: {
    status: "matched" | "missing-data";
    unresolvedPlaceholders: string[];
    referenceFormulaId: string;
  };
}

export interface EventStoryEpisode {
  id: string;
  episodeNo: number;
  title: string;
  assetbundleName?: string;
  scenarioId?: string;
}

export interface EventRelatedCard extends Card {
  bonusRate?: number;
  leaderBonusRate?: number;
  isDisplayCardStory?: boolean;
}

export interface EventInfo {
  id: string;
  name: string;
  eventType: string;
  startAt: string;
  endAt: string;
  assetbundleName?: string;
  aggregateAt?: string;
  rankingAnnounceAt?: string;
  storyOutline?: string;
  storyEpisodes?: EventStoryEpisode[];
  relatedCards?: EventRelatedCard[];
}

export interface PlayerProfile {
  region: RegionId;
  userId: string;
  nickname: string;
  rank: number;
  comment?: string;
  titles?: string[];
  updatedAt: string;
  source: string;
}

export interface MasterCollectionItem {
  id: string;
  name?: string;
  title?: string;
  assetbundleName?: string;
  startAt?: string;
  endAt?: string;
  raw: unknown;
}

export interface MasterCollection {
  region: RegionId;
  type: string;
  source: string;
  items: MasterCollectionItem[];
  syncedAt?: string;
  unavailableReason?: string;
  sourceMetadata?: ExternalDataSource;
}

export type CollectionSourceType = "team-haruki" | "metadata" | "information-api" | "asset-list" | "live2d-assets" | "reference-local";

export interface ExternalDataSource {
  sourceType: CollectionSourceType;
  primaryUrl: string;
  fallbackUrl?: string;
  sourceProject: string;
  fetchedAt: string;
  unavailableReason?: string;
  scope?: "region" | "global-reference-constant";
}
