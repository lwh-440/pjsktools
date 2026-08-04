import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { hashToken } from "./authCrypto.js";
import { config, type RegionId } from "./config.js";
import { deletionIdentifierHash } from "./deletionPrivacy.js";
import { PgStore } from "./pgStore.js";
import type {
  AuthSession,
  AuthState,
  AccountDeletionIntent,
  DeckConfig,
  DeletionTombstone,
  EmailVerificationCode,
  EmailVerificationPurpose,
  Favorite,
  FavoriteFolder,
  IdempotencyRecord,
  LegalAcceptance,
  OAuthAccount,
  OAuthProvider,
  PlayerDataKind,
  PlayerDataRecord,
  PlayerBinding,
  RankingHistoryInput,
  RankingHistoryQuery,
  RankingHistorySample,
  ScoreRecord,
  UserAccount,
  UserCardInventoryItem
} from "./types.js";

export type PublicUser = Pick<UserAccount, "id" | "email" | "nickname" | "avatarUrl" | "createdAt" | "updatedAt">;

export type CreateOAuthInput = {
  provider: OAuthProvider;
  providerUserId: string;
  nickname?: string;
  avatarUrl?: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  expiresAt?: string;
};

export type OAuthHandoffKind = "login" | "link" | "delete";

export type OAuthHandoff = {
  kind: OAuthHandoffKind;
  userId?: string;
  oauth: CreateOAuthInput;
};

export type AuthStore = {
  createUser(email: string, password: string, profile?: { nickname?: string; avatarUrl?: string }): Promise<UserAccount>;
  createOAuthUser(input: CreateOAuthInput): Promise<UserAccount>;
  createEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string; expiresAt: string }): Promise<EmailVerificationCode>;
  getLatestEmailVerificationCode(email: string, purpose: EmailVerificationPurpose): Promise<EmailVerificationCode | null>;
  reserveEmailVerificationCooldown(input: { email: string; purpose: EmailVerificationPurpose; reservationId: string; cooldownSeconds: number }): Promise<number>;
  releaseEmailVerificationCooldown(input: { email: string; purpose: EmailVerificationPurpose; reservationId: string }): Promise<void>;
  consumeEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string }): Promise<boolean>;
  verifyUser(email: string, password: string): Promise<UserAccount | null>;
  getUser(id: string): Promise<UserAccount | null>;
  deleteUserById(id: string): Promise<boolean>;
  deleteUserByEmail(email: string): Promise<boolean>;
  findOAuthAccount(provider: OAuthProvider, providerUserId: string): Promise<OAuthAccount | null>;
  linkOAuthAccount(userId: string, input: CreateOAuthInput): Promise<OAuthAccount>;
  unlinkOAuthAccount(userId: string, provider: OAuthProvider): Promise<boolean>;
  listOAuthAccounts(userId: string): Promise<OAuthAccount[]>;
  createSession(userId: string, refreshToken: string, expiresAt: string): Promise<AuthSession>;
  getSessionByRefreshToken(refreshToken: string): Promise<AuthSession | null>;
  revokeSession(id: string): Promise<boolean>;
  createAuthState(provider: OAuthProvider, state: string, redirectTo: string, expiresAt: string, legal?: { privacyVersion: string; termsVersion: string; ageConfirmed: boolean }): Promise<AuthState>;
  consumeAuthState(provider: OAuthProvider, state: string): Promise<AuthState | null>;
  getLegalAcceptance(userId: string): Promise<LegalAcceptance | null>;
  recordLegalAcceptance(userId: string, input: { privacyVersion: string; termsVersion: string; ageConfirmed: true; source: LegalAcceptance["source"] }): Promise<LegalAcceptance>;
  createAccountDeletionIntent(userId: string, token: string, expiresAt: string): Promise<AccountDeletionIntent>;
  consumeAccountDeletionIntent(userId: string, token: string): Promise<boolean>;
  createOAuthHandoff(handoff: string, input: OAuthHandoff, expiresAt: string): Promise<void>;
  consumeOAuthHandoff(handoff: string, kind: OAuthHandoffKind, userId?: string): Promise<OAuthHandoff | null>;
  listFavoriteFolders(userId: string): Promise<FavoriteFolder[]>;
  createFavoriteFolder(input: Omit<FavoriteFolder, "id" | "createdAt" | "updatedAt">): Promise<FavoriteFolder>;
  updateFavoriteFolder(userId: string, id: string, patch: Pick<FavoriteFolder, "name"> & { description?: string }): Promise<FavoriteFolder | null>;
  deleteFavoriteFolder(userId: string, id: string): Promise<boolean>;
  listFavorites(userId: string): Promise<Favorite[]>;
  addFavorite(input: Omit<Favorite, "id" | "createdAt" | "updatedAt" | "target">): Promise<Favorite>;
  updateFavoriteFolders(userId: string, id: string, folderIds: string[]): Promise<Favorite | null>;
  bulkUpdateFavoriteFolders(userId: string, ids: string[], folderIds: string[], mode: "add" | "remove" | "replace"): Promise<Favorite[]>;
  deleteFavorite(userId: string, id: string): Promise<boolean>;
  listScores(userId: string): Promise<ScoreRecord[]>;
  getScoreById(id: string): Promise<ScoreRecord | null>;
  upsertScore(input: Omit<ScoreRecord, "id" | "updatedAt"> & { id?: string }): Promise<ScoreRecord>;
  deleteScore(userId: string, id: string): Promise<boolean>;
  listPlayerBindings(userId: string): Promise<PlayerBinding[]>;
  addPlayerBinding(input: Omit<PlayerBinding, "id" | "createdAt" | "updatedAt">): Promise<PlayerBinding>;
  updatePlayerBinding(userId: string, id: string, patch: Partial<Omit<PlayerBinding, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<PlayerBinding | null>;
  deletePlayerBinding(userId: string, id: string): Promise<boolean>;
  listInventory(userId: string, bindingId?: string): Promise<UserCardInventoryItem[]>;
  upsertInventory(input: Array<Omit<UserCardInventoryItem, "id" | "createdAt" | "updatedAt">>): Promise<UserCardInventoryItem[]>;
  deleteInventoryCard(userId: string, bindingId: string, cardId: string): Promise<boolean>;
  listDeckConfigs(userId: string): Promise<DeckConfig[]>;
  upsertDeckConfig(input: Omit<DeckConfig, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<DeckConfig>;
  deleteDeckConfig(userId: string, id: string): Promise<boolean>;
  getPlayerData(userId: string, bindingId: string, kind: PlayerDataKind): Promise<PlayerDataRecord | null>;
  upsertPlayerData(input: Omit<PlayerDataRecord, "id" | "createdAt" | "updatedAt">): Promise<PlayerDataRecord>;
  listPlayerData(userId: string, bindingId: string): Promise<PlayerDataRecord[]>;
  saveRankingHistorySamples(input: RankingHistoryInput[]): Promise<RankingHistorySample[]>;
  listRankingHistory(query: RankingHistoryQuery): Promise<RankingHistorySample[]>;
  getIdempotencyRecord(scope: string, key: string): Promise<IdempotencyRecord | null>;
  reserveIdempotencyRecord(record: IdempotencyRecord): Promise<"reserved" | IdempotencyRecord>;
  saveIdempotencyRecord(record: IdempotencyRecord): Promise<void>;
  cleanupIdempotencyRecords(): Promise<void>;
  cleanupExpiredData(): Promise<void>;
  listDeletionTombstones(): Promise<DeletionTombstone[]>;
};

export function toPublicUser(user: UserAccount): PublicUser {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export class MemoryStore implements AuthStore {
  private users = new Map<string, UserAccount>();
  private usersByEmail = new Map<string, string>();
  private oauthAccounts = new Map<string, OAuthAccount>();
  private oauthByProvider = new Map<string, string>();
  private sessions = new Map<string, AuthSession>();
  private sessionsByHash = new Map<string, string>();
  private authStates = new Map<string, AuthState>();
  private oauthHandoffs = new Map<string, OAuthHandoff & { expiresAt: string }>();
  private legalAcceptances = new Map<string, LegalAcceptance>();
  private deletionIntents = new Map<string, AccountDeletionIntent>();
  private deletionTombstones = new Map<string, DeletionTombstone>();
  private emailCodes = new Map<string, EmailVerificationCode>();
  private emailCodeCooldowns = new Map<string, { reservationId: string; expiresAt: number }>();
  private favoriteFolders = new Map<string, FavoriteFolder>();
  private favorites = new Map<string, Favorite>();
  private scores = new Map<string, ScoreRecord>();
  private playerBindings = new Map<string, PlayerBinding>();
  private inventory = new Map<string, UserCardInventoryItem>();
  private deckConfigs = new Map<string, DeckConfig>();
  private playerData = new Map<string, PlayerDataRecord>();
  private rankingHistory = new Map<string, RankingHistorySample>();
  private idempotencyRecords = new Map<string, IdempotencyRecord>();

  async createUser(email: string, password: string, profile: { nickname?: string; avatarUrl?: string } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (this.usersByEmail.has(normalizedEmail)) throw new Error("EMAIL_EXISTS");
    const timestamp = nowIso();
    const user: UserAccount = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10),
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(normalizedEmail, user.id);
    return user;
  }

  async createOAuthUser(input: CreateOAuthInput) {
    const existing = await this.findOAuthAccount(input.provider, input.providerUserId);
    if (existing) {
      const user = await this.getUser(existing.userId);
      if (user) return user;
    }
    const timestamp = nowIso();
    const user: UserAccount = {
      id: randomUUID(),
      nickname: input.nickname,
      avatarUrl: input.avatarUrl,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.users.set(user.id, user);
    await this.linkOAuthAccount(user.id, input);
    return user;
  }

  async createEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string; expiresAt: string }) {
    const codeRecord: EmailVerificationCode = {
      id: randomUUID(),
      email: normalizeEmail(input.email),
      purpose: input.purpose,
      codeHash: await bcrypt.hash(input.code, 10),
      expiresAt: input.expiresAt,
      attempts: 0,
      createdAt: nowIso()
    };
    this.emailCodes.set(codeRecord.id, codeRecord);
    return codeRecord;
  }

  async getLatestEmailVerificationCode(email: string, purpose: EmailVerificationPurpose) {
    const normalizedEmail = normalizeEmail(email);
    return [...this.emailCodes.values()]
      .filter((item) => item.email === normalizedEmail && item.purpose === purpose)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  }

  async reserveEmailVerificationCooldown(input: { email: string; purpose: EmailVerificationPurpose; reservationId: string; cooldownSeconds: number }) {
    const key = `${normalizeEmail(input.email)}:${input.purpose}`;
    const now = Date.now();
    const latest = await this.getLatestEmailVerificationCode(input.email, input.purpose);
    const latestExpiry = latest ? Date.parse(latest.createdAt) + input.cooldownSeconds * 1000 : 0;
    const reservedExpiry = this.emailCodeCooldowns.get(key)?.expiresAt ?? 0;
    const blockedUntil = Math.max(latestExpiry, reservedExpiry);
    if (blockedUntil > now) return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
    this.emailCodeCooldowns.set(key, { reservationId: input.reservationId, expiresAt: now + input.cooldownSeconds * 1000 });
    return 0;
  }

  async releaseEmailVerificationCooldown(input: { email: string; purpose: EmailVerificationPurpose; reservationId: string }) {
    const key = `${normalizeEmail(input.email)}:${input.purpose}`;
    if (this.emailCodeCooldowns.get(key)?.reservationId === input.reservationId) this.emailCodeCooldowns.delete(key);
  }

  async consumeEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string }) {
    const email = normalizeEmail(input.email);
    const candidates = [...this.emailCodes.values()]
      .filter((item) => item.email === email && item.purpose === input.purpose && !item.consumedAt)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const latest = candidates[0];
    if (!latest || Date.parse(latest.expiresAt) <= Date.now() || latest.attempts >= 5) return false;
    latest.attempts += 1;
    const ok = await bcrypt.compare(input.code, latest.codeHash);
    if (!ok) return false;
    latest.consumedAt = nowIso();
    return true;
  }

  async verifyUser(email: string, password: string) {
    const id = this.usersByEmail.get(normalizeEmail(email));
    if (!id) return null;
    const user = this.users.get(id);
    if (!user?.passwordHash) return null;
    return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
  }

  async getUser(id: string) {
    return this.users.get(id) ?? null;
  }

  async deleteUserByEmail(email: string) {
    const normalized = normalizeEmail(email);
    const id = this.usersByEmail.get(normalized);
    if (!id) return false;
    return this.deleteUserById(id);
  }

  async deleteUserById(id: string) {
    const user = this.users.get(id);
    if (!user) return false;
    const tombstone: DeletionTombstone = {
      id: randomUUID(),
      userHash: deletionIdentifierHash("user", user.id),
      emailHash: user.email ? deletionIdentifierHash("email", user.email) : undefined,
      deletedAt: nowIso()
    };
    this.deletionTombstones.set(tombstone.userHash, tombstone);
    this.users.delete(id);
    if (user.email) this.usersByEmail.delete(normalizeEmail(user.email));
    for (const [key, value] of [...this.oauthAccounts]) if (value.userId === id) this.oauthAccounts.delete(key);
    for (const [key, value] of [...this.sessions]) if (value.userId === id) this.sessions.delete(key);
    for (const [key, value] of [...this.favoriteFolders]) if (value.userId === id) this.favoriteFolders.delete(key);
    for (const [key, value] of [...this.favorites]) if (value.userId === id) this.favorites.delete(key);
    for (const [key, value] of [...this.scores]) if (value.userId === id) this.scores.delete(key);
    for (const [key, value] of [...this.playerBindings]) if (value.userId === id) this.playerBindings.delete(key);
    for (const [key, value] of [...this.inventory]) if (value.userId === id) this.inventory.delete(key);
    for (const [key, value] of [...this.deckConfigs]) if (value.userId === id) this.deckConfigs.delete(key);
    for (const [key, value] of [...this.playerData]) if (value.userId === id) this.playerData.delete(key);
    for (const [key, value] of [...this.idempotencyRecords]) if (value.scope.startsWith(`${id}:`)) this.idempotencyRecords.delete(key);
    for (const key of [...this.legalAcceptances.keys()]) if (key.startsWith(`${id}:`)) this.legalAcceptances.delete(key);
    for (const [key, value] of [...this.deletionIntents]) if (value.userId === id) this.deletionIntents.delete(key);
    return true;
  }

  async findOAuthAccount(provider: OAuthProvider, providerUserId: string) {
    const id = this.oauthByProvider.get(`${provider}:${providerUserId}`);
    return id ? this.oauthAccounts.get(id) ?? null : null;
  }

  async linkOAuthAccount(userId: string, input: CreateOAuthInput) {
    const existing = await this.findOAuthAccount(input.provider, input.providerUserId);
    if (existing && existing.userId !== userId) throw new Error("OAUTH_ACCOUNT_EXISTS");
    const timestamp = nowIso();
    const account: OAuthAccount = {
      id: existing?.id ?? randomUUID(),
      userId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      nickname: input.nickname,
      avatarUrl: input.avatarUrl,
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      expiresAt: input.expiresAt,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    this.oauthAccounts.set(account.id, account);
    this.oauthByProvider.set(`${account.provider}:${account.providerUserId}`, account.id);
    const user = this.users.get(userId);
    if (user) {
      user.nickname ??= input.nickname;
      user.avatarUrl ??= input.avatarUrl;
      user.updatedAt = timestamp;
    }
    return account;
  }

  async unlinkOAuthAccount(userId: string, provider: OAuthProvider) {
    const accounts = await this.listOAuthAccounts(userId);
    const account = accounts.find((item) => item.provider === provider);
    if (!account) return false;
    const user = await this.getUser(userId);
    if (!user?.passwordHash && accounts.length <= 1) throw new Error("LAST_LOGIN_METHOD");
    this.oauthAccounts.delete(account.id);
    this.oauthByProvider.delete(`${account.provider}:${account.providerUserId}`);
    return true;
  }

  async listOAuthAccounts(userId: string) {
    return [...this.oauthAccounts.values()].filter((account) => account.userId === userId);
  }

  async createSession(userId: string, refreshToken: string, expiresAt: string) {
    const session: AuthSession = {
      id: randomUUID(),
      userId,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt,
      createdAt: nowIso()
    };
    this.sessions.set(session.id, session);
    this.sessionsByHash.set(session.refreshTokenHash, session.id);
    return session;
  }

  async getSessionByRefreshToken(refreshToken: string) {
    const id = this.sessionsByHash.get(hashToken(refreshToken));
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) return null;
    return session;
  }

  async revokeSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.revokedAt = nowIso();
    return true;
  }

  async createAuthState(provider: OAuthProvider, state: string, redirectTo: string, expiresAt: string, legal?: { privacyVersion: string; termsVersion: string; ageConfirmed: boolean }) {
    const authState: AuthState = { id: randomUUID(), provider, state, redirectTo, expiresAt, createdAt: nowIso(), ...legal };
    this.authStates.set(`${provider}:${state}`, authState);
    return authState;
  }

  async getLegalAcceptance(userId: string) {
    return [...this.legalAcceptances.values()]
      .filter((item) => item.userId === userId)
      .sort((left, right) => Date.parse(right.acceptedAt) - Date.parse(left.acceptedAt))[0] ?? null;
  }

  async recordLegalAcceptance(userId: string, input: { privacyVersion: string; termsVersion: string; ageConfirmed: true; source: LegalAcceptance["source"] }) {
    const key = `${userId}:${input.privacyVersion}:${input.termsVersion}`;
    const existing = this.legalAcceptances.get(key);
    if (existing) return existing;
    const acceptance: LegalAcceptance = { id: randomUUID(), userId, ...input, acceptedAt: nowIso() };
    this.legalAcceptances.set(key, acceptance);
    return acceptance;
  }

  async createAccountDeletionIntent(userId: string, token: string, expiresAt: string) {
    const intent: AccountDeletionIntent = { id: randomUUID(), userId, tokenHash: hashToken(token), expiresAt, createdAt: nowIso() };
    this.deletionIntents.set(intent.tokenHash, intent);
    return intent;
  }

  async consumeAccountDeletionIntent(userId: string, token: string) {
    const key = hashToken(token);
    const intent = this.deletionIntents.get(key);
    this.deletionIntents.delete(key);
    return Boolean(intent && intent.userId === userId && !intent.consumedAt && Date.parse(intent.expiresAt) > Date.now());
  }

  async consumeAuthState(provider: OAuthProvider, state: string) {
    const key = `${provider}:${state}`;
    const authState = this.authStates.get(key);
    this.authStates.delete(key);
    if (!authState || Date.parse(authState.expiresAt) <= Date.now()) return null;
    return authState;
  }

  async createOAuthHandoff(handoff: string, input: OAuthHandoff, expiresAt: string) {
    this.oauthHandoffs.set(hashToken(handoff), { ...input, expiresAt });
  }

  async consumeOAuthHandoff(handoff: string, kind: OAuthHandoffKind, userId?: string) {
    const key = hashToken(handoff);
    const value = this.oauthHandoffs.get(key);
    if (!value || value.kind !== kind || (userId !== undefined && value.userId !== userId) || Date.parse(value.expiresAt) <= Date.now()) {
      if (value && Date.parse(value.expiresAt) <= Date.now()) this.oauthHandoffs.delete(key);
      return null;
    }
    this.oauthHandoffs.delete(key);
    return { kind: value.kind, userId: value.userId, oauth: value.oauth };
  }

  async listFavoriteFolders(userId: string) {
    return [...this.favoriteFolders.values()]
      .filter((folder) => folder.userId === userId)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  async createFavoriteFolder(input: Omit<FavoriteFolder, "id" | "createdAt" | "updatedAt">) {
    const normalizedName = input.name.trim().toLowerCase();
    if ([...this.favoriteFolders.values()].some((folder) => folder.userId === input.userId && folder.name.trim().toLowerCase() === normalizedName)) {
      throw new Error("FOLDER_EXISTS");
    }
    const timestamp = nowIso();
    const folder: FavoriteFolder = {
      ...input,
      name: input.name.trim(),
      id: randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.favoriteFolders.set(folder.id, folder);
    return folder;
  }

  async updateFavoriteFolder(userId: string, id: string, patch: Pick<FavoriteFolder, "name"> & { description?: string }) {
    const folder = this.favoriteFolders.get(id);
    if (!folder || folder.userId !== userId) return null;
    const normalizedName = patch.name.trim().toLowerCase();
    if ([...this.favoriteFolders.values()].some((item) => item.id !== id && item.userId === userId && item.name.trim().toLowerCase() === normalizedName)) {
      throw new Error("FOLDER_EXISTS");
    }
    const updated: FavoriteFolder = {
      ...folder,
      name: patch.name.trim(),
      description: patch.description,
      updatedAt: nowIso()
    };
    this.favoriteFolders.set(id, updated);
    return updated;
  }

  async deleteFavoriteFolder(userId: string, id: string) {
    const folder = this.favoriteFolders.get(id);
    if (!folder || folder.userId !== userId) return false;
    this.favoriteFolders.delete(id);
    for (const [favoriteId, favorite] of this.favorites) {
      if (!favorite.folderIds.includes(id)) continue;
      this.favorites.set(favoriteId, {
        ...favorite,
        folderIds: favorite.folderIds.filter((folderId) => folderId !== id),
        updatedAt: nowIso()
      });
    }
    return true;
  }

  async listFavorites(userId: string) {
    return [...this.favorites.values()]
      .filter((favorite) => favorite.userId === userId)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  private assertFavoriteFolders(userId: string, folderIds: string[]) {
    const unique = [...new Set(folderIds)];
    if (unique.some((id) => this.favoriteFolders.get(id)?.userId !== userId)) throw new Error("FOLDER_NOT_FOUND");
    return unique;
  }

  async addFavorite(input: Omit<Favorite, "id" | "createdAt" | "updatedAt" | "target">) {
    const folderIds = this.assertFavoriteFolders(input.userId, input.folderIds);
    const existing = [...this.favorites.values()].find((favorite) =>
      favorite.userId === input.userId &&
      favorite.type === input.type &&
      favorite.region === input.region &&
      favorite.targetId === input.targetId
    );
    if (existing) {
      const updated = {
        ...existing,
        label: input.label,
        folderIds: [...new Set([...existing.folderIds, ...folderIds])],
        updatedAt: nowIso()
      };
      this.favorites.set(updated.id, updated);
      return updated;
    }
    const timestamp = nowIso();
    const favorite: Favorite = {
      ...input,
      folderIds,
      id: randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.favorites.set(favorite.id, favorite);
    return favorite;
  }

  async updateFavoriteFolders(userId: string, id: string, folderIds: string[]) {
    const favorite = this.favorites.get(id);
    if (!favorite || favorite.userId !== userId) return null;
    const updated = {
      ...favorite,
      folderIds: this.assertFavoriteFolders(userId, folderIds),
      updatedAt: nowIso()
    };
    this.favorites.set(id, updated);
    return updated;
  }

  async bulkUpdateFavoriteFolders(userId: string, ids: string[], folderIds: string[], mode: "add" | "remove" | "replace") {
    const checkedFolderIds = this.assertFavoriteFolders(userId, folderIds);
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.some((id) => this.favorites.get(id)?.userId !== userId)) throw new Error("FAVORITE_NOT_FOUND");
    const updated: Favorite[] = [];
    for (const id of uniqueIds) {
      const favorite = this.favorites.get(id)!;
      const nextFolderIds = mode === "replace"
        ? checkedFolderIds
        : mode === "add"
          ? [...new Set([...favorite.folderIds, ...checkedFolderIds])]
          : favorite.folderIds.filter((folderId) => !checkedFolderIds.includes(folderId));
      const next = { ...favorite, folderIds: nextFolderIds, updatedAt: nowIso() };
      this.favorites.set(id, next);
      updated.push(next);
    }
    return updated;
  }

  async deleteFavorite(userId: string, id: string) {
    const favorite = this.favorites.get(id);
    if (!favorite || favorite.userId !== userId) return false;
    return this.favorites.delete(id);
  }

  async listScores(userId: string) {
    return [...this.scores.values()].filter((score) => score.userId === userId);
  }

  async getScoreById(id: string) {
    return this.scores.get(id) ?? null;
  }

  async upsertScore(input: Omit<ScoreRecord, "id" | "updatedAt"> & { id?: string }) {
    const id = input.id ?? randomUUID();
    const score: ScoreRecord = { ...input, id, updatedAt: nowIso() };
    this.scores.set(id, score);
    return score;
  }

  async deleteScore(userId: string, id: string) {
    const score = this.scores.get(id);
    if (!score || score.userId !== userId) return false;
    return this.scores.delete(id);
  }

  async listPlayerBindings(userId: string) {
    return [...this.playerBindings.values()].filter((item) => item.userId === userId);
  }

  async addPlayerBinding(input: Omit<PlayerBinding, "id" | "createdAt" | "updatedAt">) {
    const exists = [...this.playerBindings.values()].some(
      (item) => item.userId === input.userId && item.region === input.region && item.playerUid === input.playerUid
    );
    if (exists) throw new Error("PLAYER_BINDING_EXISTS");
    const timestamp = nowIso();
    if (input.isDefault) {
      for (const item of this.playerBindings.values()) {
        if (item.userId === input.userId && item.region === input.region) item.isDefault = false;
      }
    }
    const binding: PlayerBinding = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp };
    this.playerBindings.set(binding.id, binding);
    return binding;
  }

  async updatePlayerBinding(userId: string, id: string, patch: Partial<Omit<PlayerBinding, "id" | "userId" | "createdAt" | "updatedAt">>) {
    const binding = this.playerBindings.get(id);
    if (!binding || binding.userId !== userId) return null;
    if (patch.isDefault) {
      for (const item of this.playerBindings.values()) {
        if (item.userId === userId && item.region === binding.region) item.isDefault = false;
      }
    }
    const updated = { ...binding, ...patch, updatedAt: nowIso() };
    this.playerBindings.set(id, updated);
    return updated;
  }

  async deletePlayerBinding(userId: string, id: string) {
    const binding = this.playerBindings.get(id);
    if (!binding || binding.userId !== userId) return false;
    this.playerBindings.delete(id);
    for (const [key, item] of this.inventory) if (item.userId === userId && item.bindingId === id) this.inventory.delete(key);
    for (const [key, item] of this.playerData) if (item.userId === userId && item.bindingId === id) this.playerData.delete(key);
    for (const [key, item] of this.deckConfigs) if (item.userId === userId && item.bindingId === id) this.deckConfigs.delete(key);
    if (binding.isDefault) {
      const replacement = [...this.playerBindings.values()]
        .filter((item) => item.userId === userId && item.region === binding.region)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
      if (replacement) {
        replacement.isDefault = true;
        replacement.updatedAt = nowIso();
      }
    }
    return true;
  }

  async listInventory(userId: string, bindingId?: string) {
    return [...this.inventory.values()].filter((item) => item.userId === userId && (!bindingId || item.bindingId === bindingId));
  }

  async upsertInventory(inputs: Array<Omit<UserCardInventoryItem, "id" | "createdAt" | "updatedAt">>) {
    const timestamp = nowIso();
    const result: UserCardInventoryItem[] = [];
    for (const input of inputs) {
      const existing = [...this.inventory.values()].find(
        (item) => item.userId === input.userId && item.region === input.region && item.cardId === input.cardId && (item.bindingId ?? "") === (input.bindingId ?? "")
      );
      const record: UserCardInventoryItem = {
        ...existing,
        ...input,
        id: existing?.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      };
      this.inventory.set(record.id, record);
      result.push(record);
    }
    return result;
  }

  async listDeckConfigs(userId: string) {
    return [...this.deckConfigs.values()].filter((item) => item.userId === userId);
  }

  async upsertDeckConfig(input: Omit<DeckConfig, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const existing = input.id ? this.deckConfigs.get(input.id) : undefined;
    if (existing && existing.userId !== input.userId) throw new Error("DECK_CONFIG_NOT_FOUND");
    const timestamp = nowIso();
    const record: DeckConfig = { ...input, id: input.id ?? randomUUID(), createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    this.deckConfigs.set(record.id, record);
    return record;
  }

  async deleteDeckConfig(userId: string, id: string) {
    const config = this.deckConfigs.get(id);
    if (!config || config.userId !== userId) return false;
    return this.deckConfigs.delete(id);
  }

  async getPlayerData(userId: string, bindingId: string, kind: PlayerDataKind) {
    return [...this.playerData.values()].find((item) => item.userId === userId && item.bindingId === bindingId && item.kind === kind) ?? null;
  }

  async upsertPlayerData(input: Omit<PlayerDataRecord, "id" | "createdAt" | "updatedAt">) {
    const timestamp = nowIso();
    const existing = await this.getPlayerData(input.userId, input.bindingId, input.kind);
    const record: PlayerDataRecord = {
      ...existing,
      ...input,
      id: existing?.id ?? randomUUID(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    this.playerData.set(record.id, record);
    return record;
  }

  async listPlayerData(userId: string, bindingId: string) {
    return [...this.playerData.values()].filter((item) => item.userId === userId && item.bindingId === bindingId);
  }

  async saveRankingHistorySamples(inputs: RankingHistoryInput[]) {
    const result: RankingHistorySample[] = [];
    for (const input of inputs) {
      const key = `${input.region}:${input.eventId}:${input.sampleType}:${input.rank}:${input.bucketAt}`;
      const existing = this.rankingHistory.get(key);
      const record: RankingHistorySample = {
        ...existing,
        ...input,
        rawPayload: {},
        id: existing?.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? nowIso()
      };
      this.rankingHistory.set(key, record);
      result.push(record);
    }
    return result;
  }

  async deleteInventoryCard(userId: string, bindingId: string, cardId: string) {
    const entry = [...this.inventory.values()].find((item) => item.userId === userId && item.bindingId === bindingId && item.cardId === cardId);
    return entry ? this.inventory.delete(entry.id) : false;
  }

  async listRankingHistory(query: RankingHistoryQuery) {
    const now = Date.now();
    const fromTime = query.windowHours ? now - query.windowHours * 3_600_000 : query.from ? Date.parse(query.from) : undefined;
    const toTime = query.to ? Date.parse(query.to) : undefined;
    const rows = [...this.rankingHistory.values()]
      .filter((item) => item.region === query.region && item.eventId === query.eventId)
      .filter((item) => !query.sampleType || item.sampleType === query.sampleType)
      .filter((item) => query.rank == null || item.rank === query.rank)
      .filter((item) => fromTime == null || Date.parse(item.sampledAt) >= fromTime)
      .filter((item) => toTime == null || Date.parse(item.sampledAt) <= toTime)
      .sort((a, b) => Date.parse(b.sampledAt) - Date.parse(a.sampledAt));
    return rows.slice(0, query.limit ?? 1000);
  }

  async getIdempotencyRecord(scope: string, key: string) {
    const record = this.idempotencyRecords.get(`${scope}:${key}`) ?? null;
    if (record && Date.parse(record.expiresAt) <= Date.now()) {
      this.idempotencyRecords.delete(`${scope}:${key}`);
      return null;
    }
    return record;
  }

  async saveIdempotencyRecord(record: IdempotencyRecord) {
    this.idempotencyRecords.set(`${record.scope}:${record.key}`, record);
  }

  async cleanupIdempotencyRecords() {
    const now = Date.now();
    for (const [key, value] of this.idempotencyRecords) {
      if (Date.parse(value.expiresAt) <= now) this.idempotencyRecords.delete(key);
    }
  }

  async cleanupExpiredData() {
    const now = Date.now();
    for (const [key, value] of this.emailCodes) if (Date.parse(value.expiresAt) + 24 * 60 * 60 * 1000 <= now) this.emailCodes.delete(key);
    for (const [key, value] of this.authStates) if (Date.parse(value.expiresAt) <= now) this.authStates.delete(key);
    for (const [key, value] of this.oauthHandoffs) if (Date.parse(value.expiresAt) <= now) this.oauthHandoffs.delete(key);
    for (const [key, value] of this.sessions) if (value.revokedAt || Date.parse(value.expiresAt) <= now) this.sessions.delete(key);
    for (const [key, value] of this.deletionIntents) if (Date.parse(value.expiresAt) <= now) this.deletionIntents.delete(key);
    for (const [key, value] of this.rankingHistory) if (Date.parse(value.sampledAt) < now - 14 * 24 * 60 * 60 * 1000) this.rankingHistory.delete(key);
    for (const [key, value] of this.deletionTombstones) if (Date.parse(value.deletedAt) < now - 200 * 24 * 60 * 60 * 1000) this.deletionTombstones.delete(key);
    await this.cleanupIdempotencyRecords();
  }

  async listDeletionTombstones() {
    return [...this.deletionTombstones.values()];
  }

  async reserveIdempotencyRecord(record: IdempotencyRecord) {
    const storageKey = `${record.scope}:${record.key}`;
    const existing = this.idempotencyRecords.get(storageKey);
    if (existing && Date.parse(existing.expiresAt) > Date.now()) return existing;
    this.idempotencyRecords.set(storageKey, record);
    return "reserved" as const;
  }
}

export const store: AuthStore = config.databaseUrl ? new PgStore() : new MemoryStore();

export function scoreInputWithRegion<T extends { region: string }>(input: T): T & { region: RegionId } {
  return input as T & { region: RegionId };
}
