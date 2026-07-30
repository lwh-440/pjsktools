export const harukiRegions = ["jp", "en", "tw", "kr", "cn"] as const;

export type HarukiRegion = (typeof harukiRegions)[number];
export type SyncChoice = "update" | "keep";

export type HarukiAvailableBinding = {
  id: string;
  bindingKey: string;
  upstreamBindingId?: string;
  region: HarukiRegion;
  playerUid: string;
  displayName?: string;
  verified: true;
};

export type HarukiConnection = {
  connected: boolean;
  oauthConfigured: boolean;
  scope?: string[];
  status?: "active" | "reauthorize";
  availableBindings: HarukiAvailableBinding[];
  createdAt?: string;
  updatedAt?: string;
};

export type HarukiPublicSnapshot = {
  schemaVersion?: number;
  source: "haruki-public";
  region: HarukiRegion;
  playerUid: string;
  displayName?: string;
  rank?: number;
  uploadTime?: string;
  fetchedAt: string;
  inventoryCount?: number;
  dataGroups?: Array<{ kind: string; count: number; available?: boolean }>;
  completeness?: Record<string, unknown>;
  snapshot: Record<string, unknown>;
};

export type CachedHarukiPublicSnapshot = HarukiPublicSnapshot & {
  cacheKey: string;
  userId: string;
  refreshError?: string;
};

export type HarukiSyncReviewGroup = {
  kind: string;
  label?: string;
  itemCount: number;
  currentCount?: number;
  empty?: boolean;
  valid: boolean;
  warnings?: string[];
};

export type HarukiSyncReview = {
  reviewToken: string;
  expiresAt?: string;
  uploadTime?: string;
  cards?: {
    added: number;
    updated: number;
    unchanged: number;
    overwriteRisks?: number;
  };
  groups: HarukiSyncReviewGroup[];
};

export type HarukiSyncReviewResponse = {
  reviewToken: string | null;
  expiresIn: number;
  noChange?: boolean;
  review: {
    upstreamVersion: string;
    sourceSummary?: {
      userId?: string;
      name?: string;
      rank?: number;
      uploadTime?: string;
      unknownKeys?: string[];
    };
    cards?: {
      present: boolean;
      incomingCount: number;
      addedCount: number;
      changedCount: number;
      missingCardsWillBePreserved: boolean;
    };
    groups: Record<string, {
      present: boolean;
      incomingCount: number;
      currentCount: number;
      emptyRequiresConfirmation: boolean;
    }>;
  } | null;
};

export type HarukiSyncResult = {
  ok: boolean;
  upstreamVersion: string;
  updatedGroups: string[];
  pendingEmptyGroups?: string[];
  cardsUpdated: boolean;
  noChange?: boolean;
};

export type HarukiOAuthStart = {
  authorizationUrl: string;
};

export type HarukiPublicPreviewResponse = {
  snapshot: {
    schemaVersion: number;
    source: "haruki-public";
    region: HarukiRegion;
    playerUid: string;
    fetchedAt: string;
    upstreamUploadedAt?: string;
    profile?: { name?: string; rank?: number };
    cards: Record<string, unknown>[];
    playerData: Array<{ kind: string; data: unknown }>;
    completeness: Record<string, unknown>;
    diagnostics?: Record<string, unknown>;
  };
};
