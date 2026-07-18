import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { hashToken } from "./authCrypto.js";
import { config, type RegionId } from "./config.js";
import type { AuthStore, CreateOAuthInput, OAuthHandoff, OAuthHandoffKind } from "./store.js";
import type {
  AuthSession,
  AuthState,
  DeckConfig,
  EmailVerificationCode,
  EmailVerificationPurpose,
  Favorite,
  FavoriteFolder,
  IdempotencyRecord,
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

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function jsonbValue(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

function rowToUser(row: any): UserAccount {
  return {
    id: row.id,
    email: row.email ?? undefined,
    passwordHash: row.password_hash ?? undefined,
    nickname: row.nickname ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToOAuth(row: any): OAuthAccount {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    nickname: row.nickname ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    accessTokenEncrypted: row.access_token_encrypted ?? undefined,
    refreshTokenEncrypted: row.refresh_token_encrypted ?? undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToSession(row: any): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    refreshTokenHash: row.refresh_token_hash,
    expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function rowToAuthState(row: any): AuthState {
  return {
    id: row.id,
    provider: row.provider,
    state: row.state,
    redirectTo: row.redirect_to,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString()
  };
}


function rowToEmailCode(row: any): EmailVerificationCode {
  return {
    id: row.id,
    email: row.email,
    purpose: row.purpose,
    codeHash: row.code_hash,
    expiresAt: new Date(row.expires_at).toISOString(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : undefined,
    attempts: Number(row.attempts),
    createdAt: new Date(row.created_at).toISOString()
  };
}

function rowToPlayerBinding(row: any): PlayerBinding {
  return {
    id: row.id,
    userId: row.user_id,
    region: row.region,
    playerUid: row.player_uid,
    displayName: row.display_name ?? undefined,
    isDefault: Boolean(row.is_default),
    note: row.note ?? undefined,
    publicProfileSnapshot: row.public_profile_snapshot ?? undefined,
    refreshedAt: row.refreshed_at ? new Date(row.refreshed_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToInventory(row: any): UserCardInventoryItem {
  return {
    id: row.id,
    userId: row.user_id,
    bindingId: row.binding_id ?? undefined,
    region: row.region,
    cardId: row.card_id,
    level: row.level == null ? undefined : Number(row.level),
    masterRank: row.master_rank == null ? undefined : Number(row.master_rank),
    skillLevel: row.skill_level == null ? undefined : Number(row.skill_level),
    specialTrainingStatus: row.special_training_status ?? undefined,
    defaultImage: row.default_image ?? undefined,
    episodes: Array.isArray(row.episodes) ? row.episodes.map((episode: any) => ({
      cardEpisodeId: String(episode.cardEpisodeId ?? episode.card_episode_id ?? ""),
      scenarioStatus: String(episode.scenarioStatus ?? episode.scenario_status ?? ""),
      scenarioStatusReasons: Array.isArray(episode.scenarioStatusReasons ?? episode.scenario_status_reasons)
        ? (episode.scenarioStatusReasons ?? episode.scenario_status_reasons).map(String)
        : undefined,
      isNotSkipped: episode.isNotSkipped ?? episode.is_not_skipped
    })).filter((episode: any) => episode.cardEpisodeId) : undefined,
    episodesRead: row.episodes_read == null ? undefined : Boolean(row.episodes_read),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToDeckConfig(row: any): DeckConfig {
  return {
    id: row.id,
    userId: row.user_id,
    bindingId: row.binding_id ?? undefined,
    region: row.region,
    name: row.name,
    eventId: row.event_id ?? undefined,
    leaderCardId: row.leader_card_id ?? undefined,
    cardIds: row.card_ids ?? [],
    note: row.note ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToPlayerData(row: any): PlayerDataRecord {
  return {
    id: row.id,
    userId: row.user_id,
    bindingId: row.binding_id,
    region: row.region,
    kind: row.kind,
    data: row.data,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToFavorite(row: any): Favorite {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    region: row.region,
    targetId: row.target_id,
    label: row.label,
    folderIds: Array.isArray(row.folder_ids) ? row.folder_ids.map(String) : [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at ?? row.created_at).toISOString()
  };
}

function rowToFavoriteFolder(row: any): FavoriteFolder {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToScore(row: any): ScoreRecord {
  return {
    id: row.id,
    userId: row.user_id,
    region: row.region,
    songId: row.song_id,
    difficulty: row.difficulty,
    clearStatus: row.clear_status,
    score: Number(row.score),
    targetScore: row.target_score == null ? undefined : Number(row.target_score),
    note: row.note ?? undefined,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToRankingHistory(row: any): RankingHistorySample {
  return {
    id: row.id,
    region: row.region,
    eventId: row.event_id,
    sampleType: row.sample_type,
    rank: Number(row.rank),
    score: Number(row.score),
    sampledAt: new Date(row.sampled_at).toISOString(),
    bucketAt: new Date(row.bucket_at).toISOString(),
    playerName: row.player_name ?? undefined,
    userId: row.user_id ?? undefined,
    leaderCardId: row.leader_card_id ?? undefined,
    leaderCardImageUrl: row.leader_card_image_url ?? undefined,
    rawPayload: row.raw_payload,
    sourceMetadata: row.source_metadata,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export class PgStore implements AuthStore {
  private pool = new Pool({ connectionString: config.databaseUrl });

  async createUser(email: string, password: string, profile: { nickname?: string; avatarUrl?: string } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const result = await this.pool.query(
        `insert into users (email, password_hash, nickname, avatar_url)
         values ($1, $2, $3, $4)
         returning *`,
        [normalizedEmail, passwordHash, profile.nickname ?? null, profile.avatarUrl ?? null]
      );
      return rowToUser(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("EMAIL_EXISTS");
      throw error;
    }
  }

  async createOAuthUser(input: CreateOAuthInput) {
    const existing = await this.findOAuthAccount(input.provider, input.providerUserId);
    if (existing) {
      const user = await this.getUser(existing.userId);
      if (user) return user;
    }
    const result = await this.pool.query(
      `insert into users (nickname, avatar_url) values ($1, $2) returning *`,
      [input.nickname ?? null, input.avatarUrl ?? null]
    );
    const user = rowToUser(result.rows[0]);
    await this.linkOAuthAccount(user.id, input);
    return user;
  }

  async createEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string; expiresAt: string }) {
    const result = await this.pool.query(
      `insert into email_verification_codes (email, purpose, code_hash, expires_at) values ($1, $2, $3, $4) returning *`,
      [normalizeEmail(input.email), input.purpose, await bcrypt.hash(input.code, 10), input.expiresAt]
    );
    return rowToEmailCode(result.rows[0]);
  }

  async consumeEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string }) {
    const result = await this.pool.query(
      `select * from email_verification_codes
       where email = $1 and purpose = $2 and consumed_at is null and expires_at > now() and attempts < 5
       order by created_at desc limit 1`,
      [normalizeEmail(input.email), input.purpose]
    );
    const row = result.rows[0];
    if (!row) return false;
    await this.pool.query(`update email_verification_codes set attempts = attempts + 1 where id = $1`, [row.id]);
    const ok = await bcrypt.compare(input.code, row.code_hash);
    if (!ok) return false;
    await this.pool.query(`update email_verification_codes set consumed_at = now() where id = $1`, [row.id]);
    return true;
  }

  async verifyUser(email: string, password: string) {
    const result = await this.pool.query(`select * from users where email = $1`, [normalizeEmail(email)]);
    const row = result.rows[0];
    if (!row?.password_hash) return null;
    return (await bcrypt.compare(password, row.password_hash)) ? rowToUser(row) : null;
  }

  async getUser(id: string) {
    const result = await this.pool.query(`select * from users where id = $1`, [id]);
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }

  async deleteUserByEmail(email: string) {
    const result = await this.pool.query(`delete from users where email = $1`, [normalizeEmail(email)]);
    return (result.rowCount ?? 0) > 0;
  }

  async findOAuthAccount(provider: OAuthProvider, providerUserId: string) {
    const result = await this.pool.query(`select * from oauth_accounts where provider = $1 and provider_user_id = $2`, [
      provider,
      providerUserId
    ]);
    return result.rows[0] ? rowToOAuth(result.rows[0]) : null;
  }

  async linkOAuthAccount(userId: string, input: CreateOAuthInput) {
    try {
      const result = await this.pool.query(
        `insert into oauth_accounts
          (user_id, provider, provider_user_id, nickname, avatar_url, access_token_encrypted, refresh_token_encrypted, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (provider, provider_user_id) do update set
          nickname = excluded.nickname,
          avatar_url = excluded.avatar_url,
          access_token_encrypted = excluded.access_token_encrypted,
          refresh_token_encrypted = excluded.refresh_token_encrypted,
          expires_at = excluded.expires_at,
          updated_at = now()
         where oauth_accounts.user_id = excluded.user_id
         returning *`,
        [
          userId,
          input.provider,
          input.providerUserId,
          input.nickname ?? null,
          input.avatarUrl ?? null,
          input.accessTokenEncrypted ?? null,
          input.refreshTokenEncrypted ?? null,
          input.expiresAt ?? null
        ]
      );
      if (!result.rows[0]) throw new Error("OAUTH_ACCOUNT_EXISTS");
      await this.pool.query(`update users set nickname = coalesce(nickname, $2), avatar_url = coalesce(avatar_url, $3), updated_at = now() where id = $1`, [
        userId,
        input.nickname ?? null,
        input.avatarUrl ?? null
      ]);
      return rowToOAuth(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23503") throw new Error("USER_NOT_FOUND");
      throw error;
    }
  }

  async unlinkOAuthAccount(userId: string, provider: OAuthProvider) {
    const user = await this.getUser(userId);
    const accounts = await this.listOAuthAccounts(userId);
    if (!user?.passwordHash && accounts.length <= 1) throw new Error("LAST_LOGIN_METHOD");
    const result = await this.pool.query(`delete from oauth_accounts where user_id = $1 and provider = $2`, [userId, provider]);
    return (result.rowCount ?? 0) > 0;
  }

  async listOAuthAccounts(userId: string) {
    const result = await this.pool.query(`select * from oauth_accounts where user_id = $1 order by created_at`, [userId]);
    return result.rows.map(rowToOAuth);
  }

  async createSession(userId: string, refreshToken: string, expiresAt: string) {
    const result = await this.pool.query(
      `insert into auth_sessions (user_id, refresh_token_hash, expires_at) values ($1, $2, $3) returning *`,
      [userId, hashToken(refreshToken), expiresAt]
    );
    return rowToSession(result.rows[0]);
  }

  async getSessionByRefreshToken(refreshToken: string) {
    const result = await this.pool.query(
      `select * from auth_sessions where refresh_token_hash = $1 and revoked_at is null and expires_at > now()`,
      [hashToken(refreshToken)]
    );
    return result.rows[0] ? rowToSession(result.rows[0]) : null;
  }

  async revokeSession(id: string) {
    const result = await this.pool.query(`update auth_sessions set revoked_at = now() where id = $1 and revoked_at is null`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async createAuthState(provider: OAuthProvider, state: string, redirectTo: string, expiresAt: string) {
    const result = await this.pool.query(
      `insert into auth_states (provider, state, redirect_to, expires_at) values ($1, $2, $3, $4) returning *`,
      [provider, state, redirectTo, expiresAt]
    );
    return rowToAuthState(result.rows[0]);
  }

  async consumeAuthState(provider: OAuthProvider, state: string) {
    const result = await this.pool.query(
      `delete from auth_states where id in (
        select id from auth_states where provider = $1 and state = $2 and expires_at > now() limit 1
      ) returning *`,
      [provider, state]
    );
    return result.rows[0] ? rowToAuthState(result.rows[0]) : null;
  }

  async createOAuthHandoff(handoff: string, input: OAuthHandoff, expiresAt: string) {
    await this.pool.query(
      `insert into oauth_handoffs (handoff_hash, provider, kind, user_id, oauth_payload, expires_at)
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [hashToken(handoff), input.oauth.provider, input.kind, input.userId ?? null, JSON.stringify(input.oauth), expiresAt]
    );
  }

  async consumeOAuthHandoff(handoff: string, kind: OAuthHandoffKind, userId?: string) {
    const result = await this.pool.query(
      `delete from oauth_handoffs where id in (
         select id from oauth_handoffs
         where handoff_hash = $1 and kind = $2 and ($3::uuid is null or user_id = $3) and expires_at > now()
         limit 1
       ) returning *`,
      [hashToken(handoff), kind, userId ?? null]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { kind: row.kind, userId: row.user_id ?? undefined, oauth: row.oauth_payload } as OAuthHandoff;
  }

  async listFavoriteFolders(userId: string) {
    const result = await this.pool.query(
      `select folder.*
       from favorite_folders folder
       where folder.user_id = $1
       order by folder.updated_at desc`,
      [userId]
    );
    return result.rows.map(rowToFavoriteFolder);
  }

  async createFavoriteFolder(input: Omit<FavoriteFolder, "id" | "createdAt" | "updatedAt">) {
    try {
      const result = await this.pool.query(
        `insert into favorite_folders (user_id, name, description)
         values ($1, trim($2), $3)
         returning *`,
        [input.userId, input.name, input.description ?? null]
      );
      return rowToFavoriteFolder(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("FOLDER_EXISTS");
      throw error;
    }
  }

  async updateFavoriteFolder(userId: string, id: string, patch: Pick<FavoriteFolder, "name"> & { description?: string }) {
    try {
      const result = await this.pool.query(
        `update favorite_folders
         set name = trim($3), description = $4, updated_at = now()
         where user_id = $1 and id = $2
         returning *`,
        [userId, id, patch.name, patch.description ?? null]
      );
      return result.rows[0] ? rowToFavoriteFolder(result.rows[0]) : null;
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("FOLDER_EXISTS");
      throw error;
    }
  }

  async deleteFavoriteFolder(userId: string, id: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const affected = await client.query(
        `select items.favorite_id
         from favorite_folder_items items
         join favorite_folders folder on folder.id = items.folder_id
         where folder.user_id = $1 and folder.id = $2`,
        [userId, id]
      );
      const result = await client.query(`delete from favorite_folders where user_id = $1 and id = $2`, [userId, id]);
      const favoriteIds = affected.rows.map((row) => row.favorite_id);
      if (favoriteIds.length) await client.query(`update favorites set updated_at = now() where id = any($1::uuid[])`, [favoriteIds]);
      await client.query("commit");
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listFavorites(userId: string) {
    const result = await this.pool.query(
      `select favorite.*,
        coalesce(array_agg(items.folder_id) filter (where items.folder_id is not null), '{}') as folder_ids
       from favorites favorite
       left join favorite_folder_items items on items.favorite_id = favorite.id
       where favorite.user_id = $1
       group by favorite.id
       order by favorite.updated_at desc`,
      [userId]
    );
    return result.rows.map(rowToFavorite);
  }

  async addFavorite(input: Omit<Favorite, "id" | "createdAt" | "updatedAt" | "target">) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const folderIds = [...new Set(input.folderIds)];
      if (folderIds.length) {
        const owned = await client.query(
          `select id from favorite_folders where user_id = $1 and id = any($2::uuid[])`,
          [input.userId, folderIds]
        );
        if (owned.rowCount !== folderIds.length) throw new Error("FOLDER_NOT_FOUND");
      }
      const result = await client.query(
        `insert into favorites (user_id, type, region, target_id, label, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (user_id, type, region, target_id)
         do update set label = excluded.label, updated_at = now()
         returning *`,
        [input.userId, input.type, input.region, input.targetId, input.label]
      );
      const favoriteId = result.rows[0].id;
      for (const folderId of folderIds) {
        await client.query(
          `insert into favorite_folder_items (folder_id, favorite_id)
           values ($1, $2)
           on conflict do nothing`,
          [folderId, favoriteId]
        );
      }
      await client.query("commit");
      return (await this.listFavorites(input.userId)).find((favorite) => favorite.id === favoriteId)!;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateFavoriteFolders(userId: string, id: string, folderIds: string[]) {
    const rows = await this.bulkUpdateFavoriteFolders(userId, [id], folderIds, "replace");
    return rows[0] ?? null;
  }

  async bulkUpdateFavoriteFolders(userId: string, ids: string[], folderIds: string[], mode: "add" | "remove" | "replace") {
    const uniqueIds = [...new Set(ids)];
    const uniqueFolderIds = [...new Set(folderIds)];
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const favorites = await client.query(
        `select id from favorites where user_id = $1 and id = any($2::uuid[]) for update`,
        [userId, uniqueIds]
      );
      if (favorites.rowCount !== uniqueIds.length) throw new Error("FAVORITE_NOT_FOUND");
      if (uniqueFolderIds.length) {
        const folders = await client.query(
          `select id from favorite_folders where user_id = $1 and id = any($2::uuid[])`,
          [userId, uniqueFolderIds]
        );
        if (folders.rowCount !== uniqueFolderIds.length) throw new Error("FOLDER_NOT_FOUND");
      }
      if (mode === "replace") {
        await client.query(`delete from favorite_folder_items where favorite_id = any($1::uuid[])`, [uniqueIds]);
      } else if (mode === "remove" && uniqueFolderIds.length) {
        await client.query(
          `delete from favorite_folder_items
           where favorite_id = any($1::uuid[]) and folder_id = any($2::uuid[])`,
          [uniqueIds, uniqueFolderIds]
        );
      }
      if ((mode === "replace" || mode === "add") && uniqueFolderIds.length) {
        await client.query(
          `insert into favorite_folder_items (folder_id, favorite_id)
           select folder_id, favorite_id
           from unnest($1::uuid[]) folder_id
           cross join unnest($2::uuid[]) favorite_id
           on conflict do nothing`,
          [uniqueFolderIds, uniqueIds]
        );
      }
      await client.query(`update favorites set updated_at = now() where id = any($1::uuid[])`, [uniqueIds]);
      await client.query("commit");
      const updated = await this.listFavorites(userId);
      return updated.filter((favorite) => uniqueIds.includes(favorite.id));
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteFavorite(userId: string, id: string) {
    const result = await this.pool.query(`delete from favorites where user_id = $1 and id = $2`, [userId, id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listScores(userId: string) {
    const result = await this.pool.query(`select * from scores where user_id = $1 order by updated_at desc`, [userId]);
    return result.rows.map(rowToScore);
  }

  async getScoreById(id: string) {
    const result = await this.pool.query(`select * from scores where id = $1`, [id]);
    return result.rows[0] ? rowToScore(result.rows[0]) : null;
  }

  async upsertScore(input: Omit<ScoreRecord, "id" | "updatedAt"> & { id?: string }) {
    const result = await this.pool.query(
      `insert into scores (id, user_id, region, song_id, difficulty, clear_status, score, target_score, note, updated_at)
       values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (id) do update set
        region = excluded.region,
        song_id = excluded.song_id,
        difficulty = excluded.difficulty,
        clear_status = excluded.clear_status,
        score = excluded.score,
        target_score = excluded.target_score,
        note = excluded.note,
        updated_at = now()
       returning *`,
      [
        input.id ?? null,
        input.userId,
        input.region as RegionId,
        input.songId,
        input.difficulty,
        input.clearStatus,
        input.score,
        input.targetScore ?? null,
        input.note ?? null
      ]
    );
    return rowToScore(result.rows[0]);
  }

  async deleteScore(userId: string, id: string) {
    const result = await this.pool.query(`delete from scores where user_id = $1 and id = $2`, [userId, id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listPlayerBindings(userId: string) {
    const result = await this.pool.query(`select * from user_player_bindings where user_id = $1 order by is_default desc, updated_at desc`, [userId]);
    return result.rows.map(rowToPlayerBinding);
  }

  async addPlayerBinding(input: Omit<PlayerBinding, "id" | "createdAt" | "updatedAt">) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (input.isDefault) {
        await client.query(`update user_player_bindings set is_default = false, updated_at = now() where user_id = $1 and region = $2`, [input.userId, input.region]);
      }
      const result = await client.query(
        `insert into user_player_bindings
          (user_id, region, player_uid, display_name, is_default, note, public_profile_snapshot, refreshed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [
          input.userId,
          input.region,
          input.playerUid,
          input.displayName ?? null,
          input.isDefault,
          input.note ?? null,
          jsonbValue(input.publicProfileSnapshot),
          input.refreshedAt ?? null
        ]
      );
      await client.query("commit");
      return rowToPlayerBinding(result.rows[0]);
    } catch (error: any) {
      await client.query("rollback");
      if (error?.code === "23505") throw new Error("PLAYER_BINDING_EXISTS");
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePlayerBinding(userId: string, id: string, patch: Partial<Omit<PlayerBinding, "id" | "userId" | "createdAt" | "updatedAt">>) {
    const current = await this.pool.query(`select * from user_player_bindings where user_id = $1 and id = $2`, [userId, id]);
    if (!current.rows[0]) return null;
    if (patch.isDefault) {
      await this.pool.query(`update user_player_bindings set is_default = false, updated_at = now() where user_id = $1 and region = $2`, [userId, current.rows[0].region]);
    }
    const merged = { ...rowToPlayerBinding(current.rows[0]), ...patch };
    const result = await this.pool.query(
      `update user_player_bindings set display_name = $3, is_default = $4, note = $5, public_profile_snapshot = $6, refreshed_at = $7, updated_at = now()
       where user_id = $1 and id = $2 returning *`,
      [userId, id, merged.displayName ?? null, merged.isDefault, merged.note ?? null, jsonbValue(merged.publicProfileSnapshot), merged.refreshedAt ?? null]
    );
    return result.rows[0] ? rowToPlayerBinding(result.rows[0]) : null;
  }

  async deletePlayerBinding(userId: string, id: string) {
    const result = await this.pool.query(`delete from user_player_bindings where user_id = $1 and id = $2`, [userId, id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listInventory(userId: string, bindingId?: string) {
    const result = await this.pool.query(
      `select * from user_card_inventory where user_id = $1 and ($2::uuid is null or binding_id = $2::uuid) order by updated_at desc`,
      [userId, bindingId ?? null]
    );
    return result.rows.map(rowToInventory);
  }

  async upsertInventory(inputs: Array<Omit<UserCardInventoryItem, "id" | "createdAt" | "updatedAt">>) {
    const result: UserCardInventoryItem[] = [];
    for (const input of inputs) {
      const row = await this.pool.query(
        `insert into user_card_inventory
          (user_id, binding_id, region, card_id, level, master_rank, skill_level, special_training_status, default_image, episodes_read, episodes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (user_id, region, card_id, coalesce(binding_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set
          level = excluded.level,
          master_rank = excluded.master_rank,
          skill_level = excluded.skill_level,
          special_training_status = excluded.special_training_status,
           default_image = excluded.default_image,
           episodes_read = excluded.episodes_read,
           episodes = excluded.episodes,
          updated_at = now()
         returning *`,
        [
          input.userId,
          input.bindingId ?? null,
          input.region,
          input.cardId,
          input.level ?? null,
          input.masterRank ?? null,
          input.skillLevel ?? null,
          input.specialTrainingStatus ?? null,
          input.defaultImage ?? null,
          input.episodesRead ?? (input.episodes?.some((episode) => episode.scenarioStatus.toLowerCase().includes("read")) || null),
          jsonbValue(input.episodes ?? [])
        ]
      );
      result.push(rowToInventory(row.rows[0]));
    }
    return result;
  }

  async listDeckConfigs(userId: string) {
    const result = await this.pool.query(`select * from user_deck_configs where user_id = $1 order by updated_at desc`, [userId]);
    return result.rows.map(rowToDeckConfig);
  }

  async upsertDeckConfig(input: Omit<DeckConfig, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const result = await this.pool.query(
      `insert into user_deck_configs (id, user_id, binding_id, region, name, event_id, leader_card_id, card_ids, note)
       values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (id) do update set
        binding_id = excluded.binding_id,
        region = excluded.region,
        name = excluded.name,
        event_id = excluded.event_id,
        leader_card_id = excluded.leader_card_id,
        card_ids = excluded.card_ids,
        note = excluded.note,
        updated_at = now()
       returning *`,
      [input.id ?? null, input.userId, input.bindingId ?? null, input.region, input.name, input.eventId ?? null, input.leaderCardId ?? null, input.cardIds, input.note ?? null]
    );
    if (result.rows[0].user_id !== input.userId) throw new Error("DECK_CONFIG_NOT_FOUND");
    return rowToDeckConfig(result.rows[0]);
  }

  async deleteDeckConfig(userId: string, id: string) {
    const result = await this.pool.query(`delete from user_deck_configs where user_id = $1 and id = $2`, [userId, id]);
    return (result.rowCount ?? 0) > 0;
  }

  async getPlayerData(userId: string, bindingId: string, kind: PlayerDataKind) {
    const result = await this.pool.query(
      `select * from user_player_data where user_id = $1 and binding_id = $2 and kind = $3`,
      [userId, bindingId, kind]
    );
    return result.rows[0] ? rowToPlayerData(result.rows[0]) : null;
  }

  async upsertPlayerData(input: Omit<PlayerDataRecord, "id" | "createdAt" | "updatedAt">) {
    const result = await this.pool.query(
      `insert into user_player_data (user_id, binding_id, region, kind, data)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, binding_id, kind) do update set
        region = excluded.region,
        data = excluded.data,
        updated_at = now()
       returning *`,
      [input.userId, input.bindingId, input.region, input.kind, JSON.stringify(input.data)]
    );
    return rowToPlayerData(result.rows[0]);
  }

  async listPlayerData(userId: string, bindingId: string) {
    const result = await this.pool.query(
      `select * from user_player_data where user_id = $1 and binding_id = $2 order by kind`,
      [userId, bindingId]
    );
    return result.rows.map(rowToPlayerData);
  }

  async saveRankingHistorySamples(inputs: RankingHistoryInput[]) {
    const result: RankingHistorySample[] = [];
    for (const input of inputs) {
      const row = await this.pool.query(
        `insert into ranking_history_samples
          (region, event_id, sample_type, rank, score, sampled_at, bucket_at, player_name, user_id, leader_card_id, leader_card_image_url, raw_payload, source_metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (region, event_id, sample_type, rank, bucket_at) do update set
          score = excluded.score,
          sampled_at = excluded.sampled_at,
          player_name = excluded.player_name,
          user_id = excluded.user_id,
          leader_card_id = excluded.leader_card_id,
          leader_card_image_url = excluded.leader_card_image_url,
          raw_payload = excluded.raw_payload,
          source_metadata = excluded.source_metadata
         returning *`,
        [
          input.region,
          input.eventId,
          input.sampleType,
          input.rank,
          input.score,
          input.sampledAt,
          input.bucketAt,
          input.playerName ?? null,
          input.userId ?? null,
          input.leaderCardId ?? null,
          input.leaderCardImageUrl ?? null,
          JSON.stringify(input.rawPayload ?? {}),
          JSON.stringify(input.sourceMetadata ?? {})
        ]
      );
      result.push(rowToRankingHistory(row.rows[0]));
    }
    return result;
  }

  async deleteInventoryCard(userId: string, bindingId: string, cardId: string) {
    const result = await this.pool.query(
      `delete from user_card_inventory where user_id = $1 and binding_id = $2 and card_id = $3`,
      [userId, bindingId, cardId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listRankingHistory(query: RankingHistoryQuery) {
    const result = await this.pool.query(
      `select * from ranking_history_samples
       where region = $1
        and event_id = $2
        and ($3::text is null or sample_type = $3)
        and ($4::integer is null or rank = $4)
        and ($5::timestamptz is null or sampled_at >= $5)
        and ($6::timestamptz is null or sampled_at <= $6)
        and ($7::numeric is null or sampled_at >= now() - (($7::text || ' hours')::interval))
       order by sampled_at desc
       limit $8`,
      [
        query.region,
        query.eventId,
        query.sampleType ?? null,
        query.rank ?? null,
        query.from ?? null,
        query.to ?? null,
        query.windowHours ?? null,
        query.limit ?? 1000
      ]
    );
    return result.rows.map(rowToRankingHistory);
  }

  async getIdempotencyRecord(scope: string, key: string) {
    const result = await this.pool.query(
      `select * from api_idempotency_records where scope = $1 and idempotency_key = $2 and expires_at > now()`,
      [scope, key]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      scope: row.scope,
      key: row.idempotency_key,
      requestHash: row.request_hash,
      statusCode: Number(row.status_code),
      responseBody: row.response_body,
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString()
    } satisfies IdempotencyRecord;
  }

  async saveIdempotencyRecord(record: IdempotencyRecord) {
    await this.pool.query(
      `insert into api_idempotency_records
        (scope, idempotency_key, request_hash, status_code, response_body, created_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (scope, idempotency_key) do update set
        status_code = excluded.status_code,
        response_body = excluded.response_body,
        expires_at = excluded.expires_at
       where api_idempotency_records.request_hash = excluded.request_hash`,
      [record.scope, record.key, record.requestHash, record.statusCode, JSON.stringify(record.responseBody), record.createdAt, record.expiresAt]
    );
  }

  async reserveIdempotencyRecord(record: IdempotencyRecord) {
    const reserved = await this.pool.query(
      `insert into api_idempotency_records
        (scope, idempotency_key, request_hash, status_code, response_body, created_at, expires_at)
       values ($1, $2, $3, 0, '{}'::jsonb, $4, $5)
       on conflict (scope, idempotency_key) do update set
        request_hash = excluded.request_hash,
        status_code = 0,
        response_body = '{}'::jsonb,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
       where api_idempotency_records.expires_at <= now()
       returning scope`,
      [record.scope, record.key, record.requestHash, record.createdAt, record.expiresAt]
    );
    if (reserved.rows[0]) return "reserved" as const;
    return (await this.getIdempotencyRecord(record.scope, record.key)) ?? "reserved";
  }

}
