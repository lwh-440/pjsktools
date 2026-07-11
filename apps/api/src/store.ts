import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { hashToken } from "./authCrypto.js";
import { config, type RegionId } from "./config.js";
import { PgStore } from "./pgStore.js";
import type {
  AuthSession,
  AuthState,
  DeckConfig,
  EmailVerificationCode,
  EmailVerificationPurpose,
  Favorite,
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

export type AuthStore = {
  createUser(email: string, password: string, profile?: { nickname?: string; avatarUrl?: string }): Promise<UserAccount>;
  createOAuthUser(input: CreateOAuthInput): Promise<UserAccount>;
  createEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string; expiresAt: string }): Promise<EmailVerificationCode>;
  consumeEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string }): Promise<boolean>;
  verifyUser(email: string, password: string): Promise<UserAccount | null>;
  getUser(id: string): Promise<UserAccount | null>;
  deleteUserByEmail(email: string): Promise<boolean>;
  findOAuthAccount(provider: OAuthProvider, providerUserId: string): Promise<OAuthAccount | null>;
  linkOAuthAccount(userId: string, input: CreateOAuthInput): Promise<OAuthAccount>;
  unlinkOAuthAccount(userId: string, provider: OAuthProvider): Promise<boolean>;
  listOAuthAccounts(userId: string): Promise<OAuthAccount[]>;
  createSession(userId: string, refreshToken: string, expiresAt: string): Promise<AuthSession>;
  getSessionByRefreshToken(refreshToken: string): Promise<AuthSession | null>;
  revokeSession(id: string): Promise<boolean>;
  createAuthState(provider: OAuthProvider, state: string, redirectTo: string, expiresAt: string): Promise<AuthState>;
  consumeAuthState(provider: OAuthProvider, state: string): Promise<AuthState | null>;
  listFavorites(userId: string): Promise<Favorite[]>;
  addFavorite(input: Omit<Favorite, "id" | "createdAt">): Promise<Favorite>;
  deleteFavorite(userId: string, id: string): Promise<boolean>;
  listScores(userId: string): Promise<ScoreRecord[]>;
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
  private emailCodes = new Map<string, EmailVerificationCode>();
  private favorites = new Map<string, Favorite>();
  private scores = new Map<string, ScoreRecord>();
  private playerBindings = new Map<string, PlayerBinding>();
  private inventory = new Map<string, UserCardInventoryItem>();
  private deckConfigs = new Map<string, DeckConfig>();
  private playerData = new Map<string, PlayerDataRecord>();
  private rankingHistory = new Map<string, RankingHistorySample>();

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
    this.users.delete(id);
    this.usersByEmail.delete(normalized);
    for (const [key, value] of [...this.oauthAccounts]) if (value.userId === id) this.oauthAccounts.delete(key);
    for (const [key, value] of [...this.sessions]) if (value.userId === id) this.sessions.delete(key);
    for (const [key, value] of [...this.favorites]) if (value.userId === id) this.favorites.delete(key);
    for (const [key, value] of [...this.scores]) if (value.userId === id) this.scores.delete(key);
    for (const [key, value] of [...this.playerBindings]) if (value.userId === id) this.playerBindings.delete(key);
    for (const [key, value] of [...this.inventory]) if (value.userId === id) this.inventory.delete(key);
    for (const [key, value] of [...this.deckConfigs]) if (value.userId === id) this.deckConfigs.delete(key);
    for (const [key, value] of [...this.playerData]) if (value.userId === id) this.playerData.delete(key);
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

  async createAuthState(provider: OAuthProvider, state: string, redirectTo: string, expiresAt: string) {
    const authState: AuthState = { id: randomUUID(), provider, state, redirectTo, expiresAt, createdAt: nowIso() };
    this.authStates.set(`${provider}:${state}`, authState);
    return authState;
  }

  async consumeAuthState(provider: OAuthProvider, state: string) {
    const key = `${provider}:${state}`;
    const authState = this.authStates.get(key);
    this.authStates.delete(key);
    if (!authState || Date.parse(authState.expiresAt) <= Date.now()) return null;
    return authState;
  }

  async listFavorites(userId: string) {
    return [...this.favorites.values()].filter((favorite) => favorite.userId === userId);
  }

  async addFavorite(input: Omit<Favorite, "id" | "createdAt">) {
    const favorite: Favorite = { ...input, id: randomUUID(), createdAt: nowIso() };
    this.favorites.set(favorite.id, favorite);
    return favorite;
  }

  async deleteFavorite(userId: string, id: string) {
    const favorite = this.favorites.get(id);
    if (!favorite || favorite.userId !== userId) return false;
    return this.favorites.delete(id);
  }

  async listScores(userId: string) {
    return [...this.scores.values()].filter((score) => score.userId === userId);
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
    return this.playerBindings.delete(id);
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
}

export const store: AuthStore = config.databaseUrl ? new PgStore() : new MemoryStore();

export function scoreInputWithRegion<T extends { region: string }>(input: T): T & { region: RegionId } {
  return input as T & { region: RegionId };
}
