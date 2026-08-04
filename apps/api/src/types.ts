import type { RegionId } from "./config.js";

export type FavoriteType =
  | "player"
  | "event"
  | "song"
  | "card"
  | "gacha"
  | "honor"
  | "material"
  | "costume"
  | "stamp"
  | "comic";

export interface FavoriteFolder {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteTargetSummary {
  id: string;
  type: FavoriteType;
  displayName: string;
  secondaryText?: string;
  imageCandidates: string[];
  available: boolean;
}

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
  privacyVersion?: string;
  termsVersion?: string;
  ageConfirmed?: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface LegalAcceptance {
  id: string;
  userId: string;
  privacyVersion: string;
  termsVersion: string;
  ageConfirmed: true;
  source: "web" | "android" | "qq";
  acceptedAt: string;
}

export interface AccountDeletionIntent {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export interface DeletionTombstone {
  id: string;
  userHash: string;
  emailHash?: string;
  deletedAt: string;
}

export type EmailVerificationPurpose = "register" | "delete-account";

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
  folderIds: string[];
  createdAt: string;
  updatedAt: string;
  target?: FavoriteTargetSummary;
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
  harukiConnectionId?: string;
  harukiBindingId?: string;
  harukiBindingKey?: string;
  region: RegionId;
  playerUid: string;
  displayName?: string;
  isDefault: boolean;
  verified?: boolean;
  source?: "haruki-oauth";
  upstreamUploadedAt?: string;
  upstreamEtag?: string;
  lastWebhookAt?: string;
  upstreamUpdateAvailable?: boolean;
  lastSyncAttemptAt?: string;
  lastSyncSucceededAt?: string;
  lastSyncStatus?: "never" | "ready" | "syncing" | "success" | "no-change" | "needs-review" | "reauthorize" | "upstream-error" | "parse-error";
  pendingEmptyGroups?: PlayerDataKind[];
  autoSyncDaily?: boolean;
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
  source?: "haruki-oauth";
  upstreamVersion?: string;
  syncedAt?: string;
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
  source?: "haruki-oauth";
  upstreamVersion?: string;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarukiConnection {
  id: string;
  userId: string;
  subject: string;
  scope: string[];
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string;
  tokenExpiresAt?: string;
  encryptionKeyVersion: string;
  status: "active" | "reauthorize";
  availableBindings: HarukiAvailableBinding[];
  createdAt: string;
  updatedAt: string;
}

export interface HarukiAvailableBinding {
  id: string;
  bindingKey: string;
  upstreamBindingId?: string;
  region: RegionId;
  playerUid: string;
  displayName?: string;
  verified: true;
}

export interface HarukiOAuthState {
  stateHash: string;
  userId: string;
  client: "web" | "android";
  redirectUri?: string;
  codeVerifierEncrypted: string;
  expiresAt: string;
}

export interface HarukiSyncReview {
  tokenHash: string;
  userId: string;
  bindingId: string;
  candidateHash: string;
  upstreamVersion: string;
  expiresAt: string;
}

export interface HarukiSyncCandidate {
  cardsPresent: boolean;
  cards: Array<Omit<UserCardInventoryItem, "id" | "userId" | "bindingId" | "region" | "source" | "upstreamVersion" | "syncedAt" | "createdAt" | "updatedAt">>;
  playerData: Array<{ kind: PlayerDataKind; data: unknown }>;
  sourceSummary: {
    userId?: string;
    region?: RegionId;
    bindingId?: string;
    name?: string;
    rank?: number;
    uploadTime?: string;
    unknownKeys: string[];
  };
  invalidGroups: Array<"cards" | PlayerDataKind>;
  upstreamVersion: string;
}

export interface HarukiWebhookEvent {
  eventId: string;
  subject: string;
  bindingKey: string;
  region: RegionId;
  playerUid: string;
  dataType: "suite" | "mysekai";
  uploadTime?: string;
  payloadHash: string;
  status: "pending" | "processing" | "processed" | "ignored" | "failed";
  receivedAt: string;
  processedAt?: string;
}

export interface HarukiRevokeAudit {
  userId: string;
  connectionId: string;
  subjectHash: string;
  failedHints: Array<"access_token" | "refresh_token">;
  status: "pending" | "resolved";
  createdAt: string;
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
  cardSupplyId?: string;
  cardSupplyType?: string;
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
