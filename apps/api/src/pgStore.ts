import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { hashToken } from "./authCrypto.js";
import { config, type RegionId } from "./config.js";
import { deletionIdentifierHash } from "./deletionPrivacy.js";
import type { AuthStore, CreateOAuthInput, OAuthHandoff, OAuthHandoffKind } from "./store.js";
import type {
  AuthSession,
  AuthState,
  AccountDeletionIntent,
  DeckConfig,
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
    passwordHash: row.password_hash ?? (row.has_password ? "configured" : undefined),
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

function rowToSession(row: any, refreshTokenHash = ""): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    refreshTokenHash: row.refresh_token_hash ?? refreshTokenHash,
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
    privacyVersion: row.privacy_version ?? undefined,
    termsVersion: row.terms_version ?? undefined,
    ageConfirmed: Boolean(row.age_confirmed),
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString()
  };
}

function rowToLegalAcceptance(row: any): LegalAcceptance {
  return {
    id: row.id,
    userId: row.user_id,
    privacyVersion: row.privacy_version,
    termsVersion: row.terms_version,
    ageConfirmed: true,
    source: row.source,
    acceptedAt: new Date(row.accepted_at).toISOString()
  };
}

function rowToDeletionIntent(row: any): AccountDeletionIntent {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: new Date(row.expires_at).toISOString(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString()
  };
}


function rowToEmailCode(row: any): EmailVerificationCode {
  return {
    id: row.id,
    email: row.email,
    purpose: row.purpose,
    codeHash: row.code_hash ?? "",
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
    harukiConnectionId: row.haruki_connection_id ?? undefined,
    harukiBindingId: row.haruki_binding_id ?? undefined,
    region: row.region,
    playerUid: row.player_uid,
    displayName: row.display_name ?? undefined,
    isDefault: Boolean(row.is_default),
    verified: Boolean(row.verified),
    source: row.source ?? undefined,
    upstreamUploadedAt: row.upstream_uploaded_at ? new Date(row.upstream_uploaded_at).toISOString() : undefined,
    lastSyncAttemptAt: row.last_sync_attempt_at ? new Date(row.last_sync_attempt_at).toISOString() : undefined,
    lastSyncSucceededAt: row.last_sync_succeeded_at ? new Date(row.last_sync_succeeded_at).toISOString() : undefined,
    lastSyncStatus: row.last_sync_status ?? undefined,
    pendingEmptyGroups: Array.isArray(row.pending_empty_groups) ? row.pending_empty_groups : [],
    autoSyncDaily: Boolean(row.auto_sync_daily),
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
    source: row.source ?? undefined,
    upstreamVersion: row.upstream_version ?? undefined,
    syncedAt: row.synced_at ? new Date(row.synced_at).toISOString() : undefined,
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
    source: row.source ?? undefined,
    upstreamVersion: row.upstream_version ?? undefined,
    syncedAt: row.synced_at ? new Date(row.synced_at).toISOString() : undefined,
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
  private pool: Pool;
  private authPool: Pool;
  private compliancePool: Pool;

  constructor(connectionString = config.databaseUrl, complianceConnectionString = config.complianceDatabaseUrl, authConnectionString = config.authDatabaseUrl) {
    if (!connectionString || !authConnectionString || !complianceConnectionString) throw new Error("distinct application, authentication and compliance database URLs are required");
    this.pool = new Pool({ connectionString });
    this.authPool = new Pool({ connectionString: authConnectionString });
    this.compliancePool = new Pool({ connectionString: complianceConnectionString });
  }

  async close() {
    await Promise.all([this.pool.end(), this.authPool.end(), this.compliancePool.end()]);
  }

  async assertRuntimeRoleSafety() {
    const expected = new Map<Pool, string[]>([
      [this.pool, ["pjsktools_app_user","pjsktools_idempotency_service","pjsktools_ranking_service"]],
      [this.authPool, ["pjsktools_auth_api"]],
      [this.compliancePool, ["pjsktools_compliance_maintenance","pjsktools_compliance_user"]]
    ]);
    const identities: string[] = [];
    for (const [pool, membershipsExpected] of expected) {
      const identity = await pool.query(`select current_user, rolsuper, rolbypassrls, rolinherit, rolcreatedb, rolcreaterole from pg_roles where rolname=current_user`);
      const role = identity.rows[0];
      if (!role || role.rolsuper || role.rolbypassrls || role.rolinherit || role.rolcreatedb || role.rolcreaterole) throw new Error("unsafe database runtime login");
      identities.push(role.current_user);
      const memberships = await pool.query(`select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=current_user order by parent.rolname`);
      if (JSON.stringify(memberships.rows.map(r=>r.rolname)) !== JSON.stringify(membershipsExpected)) throw new Error("unexpected runtime role membership");
      const owned = await pool.query(`select (select count(*) from pg_class where relowner=(select oid from pg_roles where rolname=current_user))+(select count(*) from pg_proc where proowner=(select oid from pg_roles where rolname=current_user)) as count`);
      if (Number(owned.rows[0].count)) throw new Error("runtime login owns database objects");
      if ((await pool.query(`select has_schema_privilege(current_user,'public','CREATE') as allowed`)).rows[0].allowed) throw new Error("runtime login has schema CREATE");
    }
    if (new Set(identities).size !== identities.length) throw new Error("database runtime logins must be distinct");
    for (const pool of [this.pool,this.compliancePool]) {
      const privilege=await pool.query(`select has_function_privilege(current_user,'public.pjsktools_auth_get_password(text)','EXECUTE') as allowed`);
      if(privilege.rows[0]?.allowed) throw new Error("non-auth runtime login can execute authentication functions");
    }
    const authTables=await this.authPool.query(`select bool_or(has_table_privilege(current_user,table_name,privilege)) as allowed from unnest(array['public.users','public.oauth_accounts','public.auth_sessions','public.auth_states','public.email_verification_codes','public.email_verification_cooldowns','public.oauth_handoffs']) table_name cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege`);
    if(authTables.rows[0]?.allowed) throw new Error("authentication runtime login has direct table privileges");
    return identities;
  }

  private async withRole<T>(pool: Pool, role: string, userId: string | undefined, operation: (client: PoolClient)=>Promise<T>) {
    const client=await pool.connect();
    try { await client.query("begin"); await client.query(`set local role ${role}`); if(userId) await client.query(`select set_config('pjsktools.user_id',$1,true)`,[userId]); const value=await operation(client); await client.query("commit"); return value; }
    catch(error){ await client.query("rollback"); throw error; } finally { client.release(); }
  }

  private withAuthApi<T>(operation: (client: PoolClient)=>Promise<T>) {
    return this.withRole(this.authPool,"pjsktools_auth_api",undefined,async(client)=>{
      return operation(client);
    });
  }

  private withAppUser<T>(userId: string, operation: (client: PoolClient)=>Promise<T>) {
    return this.withRole(this.pool,"pjsktools_app_user",userId,operation);
  }

  private withRankingService<T>(operation: (client: PoolClient)=>Promise<T>) {
    return this.withRole(this.pool,"pjsktools_ranking_service",undefined,operation);
  }

  private withIdempotencyService<T>(scope: string, operation: (client: PoolClient)=>Promise<T>) {
    return this.withRole(this.pool,"pjsktools_idempotency_service",undefined,async (client)=>{
      await client.query(`select set_config('pjsktools.idempotency_scope',$1,true)`,[scope]);
      return operation(client);
    });
  }

  private withComplianceUser<T>(userId: string, operation: (client: PoolClient)=>Promise<T>) {
    return this.withRole(this.compliancePool,"pjsktools_compliance_user",userId,operation);
  }

  private withComplianceMaintenance<T>(operation: (client: PoolClient)=>Promise<T>) {
    return this.withRole(this.compliancePool,"pjsktools_compliance_maintenance",undefined,operation);
  }

  private async withPlayerUser<T>(userId: string, operation: (client: PoolClient) => Promise<T>) {
    return this.withAppUser(userId,operation);
  }

  async createUser(email: string, password: string, profile: { nickname?: string; avatarUrl?: string } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const result = await this.withAuthApi((client) => client.query(
        `select * from public.pjsktools_auth_create_user($1,$2,$3,$4)`,
        [normalizedEmail, passwordHash, profile.nickname ?? null, profile.avatarUrl ?? null]
      ));
      return rowToUser(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("EMAIL_EXISTS");
      throw error;
    }
  }

  async createOAuthUser(input: CreateOAuthInput) {
    const userId=randomUUID();
    return this.withAuthApi(async(client)=>{
      const result = await client.query(
        `select * from public.pjsktools_auth_create_oauth_user($1,$2,$3,$4,$5,$6,$7,$8)`,
        [userId,input.provider,input.providerUserId,input.nickname??null,input.avatarUrl??null,input.accessTokenEncrypted??null,input.refreshTokenEncrypted??null,input.expiresAt??null]
      );
      return rowToUser(result.rows[0]);
    });
  }

  async createEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string; expiresAt: string }) {
    const codeHash=await bcrypt.hash(input.code,10);
    const email=normalizeEmail(input.email);
    const result = await this.withAuthApi((client)=>client.query(
      `select * from public.pjsktools_auth_create_email_code($1,$2,$3,$4)`,
      [email, input.purpose, codeHash, input.expiresAt]
    ));
    return rowToEmailCode(result.rows[0]);
  }

  async getLatestEmailVerificationCode(email: string, purpose: EmailVerificationPurpose) {
    const normalizedEmail=normalizeEmail(email);
    const result = await this.withAuthApi((client)=>client.query(
      `select * from public.pjsktools_auth_latest_email_code($1,$2)`,
      [normalizedEmail, purpose]
    ));
    return result.rows[0] ? rowToEmailCode(result.rows[0]) : null;
  }

  async reserveEmailVerificationCooldown(input: { email: string; purpose: EmailVerificationPurpose; reservationId: string; cooldownSeconds: number }) {
    const email = normalizeEmail(input.email);
    return this.withAuthApi(async(client)=>{
      const result=await client.query(`select public.pjsktools_auth_reserve_email_cooldown($1,$2,$3,$4) as retry_after`,[email,input.purpose,input.reservationId,input.cooldownSeconds]);
      return Number(result.rows[0].retry_after);
    });
  }

  async releaseEmailVerificationCooldown(input: { email: string; purpose: EmailVerificationPurpose; reservationId: string }) {
    const email=normalizeEmail(input.email);
    await this.withAuthApi((client)=>client.query(
      `select public.pjsktools_auth_release_email_cooldown($1,$2,$3)`,
      [email, input.purpose, input.reservationId]
    ));
  }

  async consumeEmailVerificationCode(input: { email: string; purpose: EmailVerificationPurpose; code: string }) {
    const email=normalizeEmail(input.email);
    return this.withAuthApi(async(client)=>{
      const result=await client.query(`select * from public.pjsktools_auth_lock_email_code($1,$2)`,[email,input.purpose]);
      const row=result.rows[0];
      if(!row) return false;
      const success=await bcrypt.compare(input.code,row.code_hash);
      const finished=await client.query(`select public.pjsktools_auth_finish_email_code($1,$2,$3,$4) as consumed`,[row.id,email,input.purpose,success]);
      return finished.rows[0].consumed===true;
    });
  }

  async verifyUser(email: string, password: string) {
    const normalizedEmail=normalizeEmail(email);
    const result = await this.withAuthApi((client)=>client.query(`select * from public.pjsktools_auth_get_password($1)`, [normalizedEmail]));
    const row = result.rows[0];
    if (!row?.password_hash) return null;
    return await bcrypt.compare(password,row.password_hash) ? rowToUser(row) : null;
  }

  async getUser(id: string) {
    const result = await this.withAuthApi((client)=>client.query(`select * from public.pjsktools_auth_get_user($1)`, [id]));
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }

  async deleteUserByEmail(email: string) {
    void email;
    return Promise.reject<boolean>(new Error("DELETE_USER_BY_EMAIL_UNAVAILABLE_IN_POSTGRES"));
  }

  async deleteUserById(id: string) {
    return this.withComplianceUser(id, async (client) => {
      const userResult = await client.query(`select user_id as id, email from public.pjsktools_lock_account_deletion_identity($1)`, [id]);
      const user = userResult.rows[0];
      if (!user) return false;
      const result=await client.query(`select public.pjsktools_delete_account_with_tombstone($1,$2,$3) as deleted`,[
        id,deletionIdentifierHash("user",user.id),user.email?deletionIdentifierHash("email",user.email):null
      ]);
      return result.rows[0]?.deleted === true;
    });
  }

  async findOAuthAccount(provider: OAuthProvider, providerUserId: string) {
    const result = await this.withAuthApi((client)=>client.query(`select * from public.pjsktools_auth_find_oauth($1,$2)`, [
      provider,
      providerUserId
    ]));
    return result.rows[0] ? rowToOAuth(result.rows[0]) : null;
  }

  async linkOAuthAccount(userId: string, input: CreateOAuthInput) {
    try {
      const result = await this.withAuthApi((client)=>client.query(
        `select * from public.pjsktools_auth_link_oauth($1,$2,$3,$4,$5,$6,$7,$8)`,
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
      ));
      if (!result.rows[0]) throw new Error("OAUTH_ACCOUNT_EXISTS");
      return rowToOAuth(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23503") throw new Error("USER_NOT_FOUND");
      throw error;
    }
  }

  async unlinkOAuthAccount(userId: string, provider: OAuthProvider) {
    try {
      const result=await this.withAuthApi((client)=>client.query(`select public.pjsktools_auth_unlink_oauth($1,$2) as deleted`,[userId,provider]));
      return result.rows[0]?.deleted===true;
    } catch(error:any) {
      if(error?.message?.includes("LAST_LOGIN_METHOD")) throw new Error("LAST_LOGIN_METHOD");
      throw error;
    }
  }

  async listOAuthAccounts(userId: string) {
    const result = await this.withAuthApi((client)=>client.query(`select * from public.pjsktools_auth_list_oauth($1)`, [userId]));
    return result.rows.map(rowToOAuth);
  }

  async createSession(userId: string, refreshToken: string, expiresAt: string) {
    const result = await this.withAuthApi((client)=>client.query(
      `select * from public.pjsktools_auth_create_session($1,$2,$3)`,
      [userId, hashToken(refreshToken), expiresAt]
    ));
    return rowToSession(result.rows[0],hashToken(refreshToken));
  }

  async getSessionByRefreshToken(refreshToken: string) {
    const refreshHash=hashToken(refreshToken);
    const result = await this.withAuthApi((client)=>client.query(
      `select * from public.pjsktools_auth_get_session($1)`,
      [refreshHash]
    ));
    return result.rows[0] ? rowToSession(result.rows[0],refreshHash) : null;
  }

  async revokeSession(id: string) {
    const result = await this.withAuthApi((client)=>client.query(`select public.pjsktools_auth_revoke_session($1) as revoked`, [id]));
    return result.rows[0].revoked===true;
  }

  async createAuthState(provider: OAuthProvider, state: string, redirectTo: string, expiresAt: string, legal?: { privacyVersion: string; termsVersion: string; ageConfirmed: boolean }) {
    const result = await this.withAuthApi((client) => client.query(
      `select * from public.pjsktools_auth_create_state($1,$2,$3,$4,$5,$6,$7)`,
      [provider, state, redirectTo, expiresAt, legal?.privacyVersion ?? null, legal?.termsVersion ?? null, legal?.ageConfirmed ?? false]
    ));
    return rowToAuthState(result.rows[0]);
  }

  async listDeletionTombstones() {
    const result = await this.withComplianceMaintenance((client)=>client.query(`select * from account_deletion_tombstones order by deleted_at`));
    return result.rows.map((row) => ({
      id: row.id,
      userHash: row.user_hash,
      emailHash: row.email_hash ?? undefined,
      deletedAt: new Date(row.deleted_at).toISOString()
    }));
  }

  async getLegalAcceptance(userId: string) {
    const result = await this.withComplianceUser(userId,(client)=>client.query(`select * from legal_acceptances where user_id = $1 order by accepted_at desc limit 1`, [userId]));
    return result.rows[0] ? rowToLegalAcceptance(result.rows[0]) : null;
  }

  async recordLegalAcceptance(userId: string, input: { privacyVersion: string; termsVersion: string; ageConfirmed: true; source: LegalAcceptance["source"] }) {
    const result = await this.withComplianceUser(userId,(client)=>client.query(
      `insert into legal_acceptances (user_id, privacy_version, terms_version, age_confirmed, source)
       values ($1, $2, $3, true, $4)
       on conflict (user_id, privacy_version, terms_version) do nothing
       returning *`,
      [userId, input.privacyVersion, input.termsVersion, input.source]
    ));
    if (result.rows[0]) return rowToLegalAcceptance(result.rows[0]);
    const existing = await this.withComplianceUser(userId,(client)=>client.query(
      `select * from legal_acceptances where user_id = $1 and privacy_version = $2 and terms_version = $3`,
      [userId, input.privacyVersion, input.termsVersion]
    ));
    return rowToLegalAcceptance(existing.rows[0]);
  }

  async createAccountDeletionIntent(userId: string, token: string, expiresAt: string) {
    const result = await this.withComplianceUser(userId, (client) => client.query(
      `insert into account_deletion_intents (user_id, token_hash, expires_at) values ($1, $2, $3) returning *`,
      [userId, hashToken(token), expiresAt]
    ));
    return rowToDeletionIntent(result.rows[0]);
  }

  async consumeAccountDeletionIntent(userId: string, token: string) {
    const result = await this.withComplianceUser(userId, (client) => client.query(
      `update account_deletion_intents set consumed_at = now()
       where id in (select id from account_deletion_intents where user_id = $1 and token_hash = $2
         and consumed_at is null and expires_at > now() limit 1) returning id`,
      [userId, hashToken(token)]
    ));
    return Boolean(result.rows[0]);
  }

  async consumeAuthState(provider: OAuthProvider, state: string) {
    const result = await this.withAuthApi((client)=>client.query(
      `select * from public.pjsktools_auth_consume_state($1,$2)`,
      [provider, state]
    ));
    return result.rows[0] ? rowToAuthState(result.rows[0]) : null;
  }

  async createOAuthHandoff(handoff: string, input: OAuthHandoff, expiresAt: string) {
    const handoffHash=hashToken(handoff);
    await this.withAuthApi((client)=>client.query(
      `select public.pjsktools_auth_create_handoff($1,$2,$3,$4,$5::jsonb,$6)`,
      [handoffHash, input.oauth.provider, input.kind, input.userId ?? null, JSON.stringify(input.oauth), expiresAt]
    ));
  }

  async consumeOAuthHandoff(handoff: string, kind: OAuthHandoffKind, userId?: string) {
    const handoffHash=hashToken(handoff);
    const result = await this.withAuthApi((client)=>client.query(
      `select * from public.pjsktools_auth_consume_handoff($1,$2,$3)`,
      [handoffHash, kind, userId ?? null]
    ));
    const row = result.rows[0];
    if (!row) return null;
    return { kind: row.kind, userId: row.user_id ?? undefined, oauth: row.oauth_payload } as OAuthHandoff;
  }

  async listFavoriteFolders(userId: string) {
    const result = await this.withAppUser(userId,(client)=>client.query(
      `select folder.*
       from favorite_folders folder
       where folder.user_id = $1
       order by folder.updated_at desc`,
      [userId]
    ));
    return result.rows.map(rowToFavoriteFolder);
  }

  async createFavoriteFolder(input: Omit<FavoriteFolder, "id" | "createdAt" | "updatedAt">) {
    try {
      const result = await this.withAppUser(input.userId,(client)=>client.query(
        `insert into favorite_folders (user_id, name, description)
         values ($1, trim($2), $3)
         returning *`,
        [input.userId, input.name, input.description ?? null]
      ));
      return rowToFavoriteFolder(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("FOLDER_EXISTS");
      throw error;
    }
  }

  async updateFavoriteFolder(userId: string, id: string, patch: Pick<FavoriteFolder, "name"> & { description?: string }) {
    try {
      const result = await this.withAppUser(userId,(client)=>client.query(
        `update favorite_folders
         set name = trim($3), description = $4, updated_at = now()
         where user_id = $1 and id = $2
         returning *`,
        [userId, id, patch.name, patch.description ?? null]
      ));
      return result.rows[0] ? rowToFavoriteFolder(result.rows[0]) : null;
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("FOLDER_EXISTS");
      throw error;
    }
  }

  async deleteFavoriteFolder(userId: string, id: string) {
    return this.withAppUser(userId,async(client)=>{
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
      return (result.rowCount ?? 0) > 0;
    });
  }

  async listFavorites(userId: string) {
    const result = await this.withAppUser(userId,(client)=>client.query(
      `select favorite.*,
        coalesce(array_agg(items.folder_id) filter (where items.folder_id is not null), '{}') as folder_ids
       from favorites favorite
       left join favorite_folder_items items on items.favorite_id = favorite.id
       where favorite.user_id = $1
       group by favorite.id
       order by favorite.updated_at desc`,
      [userId]
    ));
    return result.rows.map(rowToFavorite);
  }

  async addFavorite(input: Omit<Favorite, "id" | "createdAt" | "updatedAt" | "target">) {
    return this.withAppUser(input.userId,async(client)=>{
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
      const updated=await client.query(`select favorite.*,coalesce(array_agg(items.folder_id) filter(where items.folder_id is not null),'{}') as folder_ids from favorites favorite left join favorite_folder_items items on items.favorite_id=favorite.id where favorite.id=$1 group by favorite.id`,[favoriteId]);
      return rowToFavorite(updated.rows[0]);
    });
  }

  async updateFavoriteFolders(userId: string, id: string, folderIds: string[]) {
    const rows = await this.bulkUpdateFavoriteFolders(userId, [id], folderIds, "replace");
    return rows[0] ?? null;
  }

  async bulkUpdateFavoriteFolders(userId: string, ids: string[], folderIds: string[], mode: "add" | "remove" | "replace") {
    const uniqueIds = [...new Set(ids)];
    const uniqueFolderIds = [...new Set(folderIds)];
    return this.withAppUser(userId,async(client)=>{
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
      const updated=await client.query(`select favorite.*,coalesce(array_agg(items.folder_id) filter(where items.folder_id is not null),'{}') as folder_ids from favorites favorite left join favorite_folder_items items on items.favorite_id=favorite.id where favorite.id=any($1::uuid[]) group by favorite.id`,[uniqueIds]);
      return updated.rows.map(rowToFavorite);
    });
  }

  async deleteFavorite(userId: string, id: string) {
    const result = await this.withAppUser(userId,(client)=>client.query(`delete from favorites where user_id = $1 and id = $2`, [userId, id]));
    return (result.rowCount ?? 0) > 0;
  }

  async listScores(userId: string) {
    const result = await this.withAppUser(userId,(client)=>client.query(`select * from scores where user_id = $1 order by updated_at desc`, [userId]));
    return result.rows.map(rowToScore);
  }

  async getScoreById(id: string) {
    // Score sharing resolves an opaque UUID and returns one record; use the
    // ranking/read service rather than fabricating a user's identity.
    const result = await this.withRankingService((client)=>client.query(`select * from scores where id = $1`, [id]));
    return result.rows[0] ? rowToScore(result.rows[0]) : null;
  }

  async upsertScore(input: Omit<ScoreRecord, "id" | "updatedAt"> & { id?: string }) {
    const result = await this.withAppUser(input.userId,(client)=>client.query(
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
    ));
    return rowToScore(result.rows[0]);
  }

  async deleteScore(userId: string, id: string) {
    const result = await this.withAppUser(userId,(client)=>client.query(`delete from scores where user_id = $1 and id = $2`, [userId, id]));
    return (result.rowCount ?? 0) > 0;
  }

  async listPlayerBindings(userId: string) {
    return this.withPlayerUser(userId, async (client) => {
      const result = await client.query(`select * from user_player_bindings where user_id = $1 order by is_default desc, updated_at desc`, [userId]);
      return result.rows.map(rowToPlayerBinding);
    });
  }

  async addPlayerBinding(input: Omit<PlayerBinding, "id" | "createdAt" | "updatedAt">) {
    try {
      return await this.withPlayerUser(input.userId, async (client) => {
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
        return rowToPlayerBinding(result.rows[0]);
      });
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("PLAYER_BINDING_EXISTS");
      throw error;
    }
  }

  async updatePlayerBinding(userId: string, id: string, patch: Partial<Omit<PlayerBinding, "id" | "userId" | "createdAt" | "updatedAt">>) {
    return this.withPlayerUser(userId, async (client) => {
      const current = await client.query(`select * from user_player_bindings where user_id = $1 and id = $2`, [userId, id]);
      if (!current.rows[0]) return null;
      if (patch.isDefault) {
        await client.query(`update user_player_bindings set is_default = false, updated_at = now() where user_id = $1 and region = $2`, [userId, current.rows[0].region]);
      }
      const merged = { ...rowToPlayerBinding(current.rows[0]), ...patch };
      const result = await client.query(
        `update user_player_bindings set display_name = $3, is_default = $4, note = $5, public_profile_snapshot = $6, refreshed_at = $7,
         haruki_connection_id=$8, haruki_binding_id=$9, verified=$10, source=$11, upstream_uploaded_at=$12,
         last_sync_attempt_at=$13, last_sync_succeeded_at=$14, last_sync_status=$15, pending_empty_groups=$16,
         auto_sync_daily=$17, updated_at = now()
         where user_id = $1 and id = $2 returning *`,
        [userId, id, merged.displayName ?? null, merged.isDefault, merged.note ?? null, jsonbValue(merged.publicProfileSnapshot), merged.refreshedAt ?? null,
         merged.harukiConnectionId ?? null, merged.harukiBindingId ?? null, merged.verified ?? false, merged.source ?? null,
         merged.upstreamUploadedAt ?? null, merged.lastSyncAttemptAt ?? null, merged.lastSyncSucceededAt ?? null,
         merged.lastSyncStatus ?? "never", merged.pendingEmptyGroups ?? [], merged.autoSyncDaily ?? false]
      );
      return result.rows[0] ? rowToPlayerBinding(result.rows[0]) : null;
    });
  }

  async deletePlayerBinding(userId: string, id: string) {
    return this.withPlayerUser(userId, async (client) => {
      const result = await client.query(
        `delete from user_player_bindings where user_id = $1 and id = $2 returning region, is_default`,
        [userId, id]
      );
      const deleted = result.rows[0];
      if (!deleted) return false;
      if (deleted.is_default) {
        await client.query(
          `update user_player_bindings set is_default=true,updated_at=now()
           where id = (
             select id from user_player_bindings
             where user_id=$1 and region=$2
             order by created_at asc limit 1
           )`,
          [userId, deleted.region]
        );
      }
      return true;
    });
  }

  async listInventory(userId: string, bindingId?: string) {
    return this.withPlayerUser(userId, async (client) => {
      const result = await client.query(
        `select * from user_card_inventory where user_id = $1 and ($2::uuid is null or binding_id = $2::uuid) order by updated_at desc`,
        [userId, bindingId ?? null]
      );
      return result.rows.map(rowToInventory);
    });
  }

  async upsertInventory(inputs: Array<Omit<UserCardInventoryItem, "id" | "createdAt" | "updatedAt">>) {
    if (!inputs.length) return [];
    const userId = inputs[0].userId;
    if (inputs.some((input) => input.userId !== userId)) throw new Error("PLAYER_DATA_USER_MISMATCH");
    return this.withPlayerUser(userId, async (client) => {
      const result: UserCardInventoryItem[] = [];
      for (const input of inputs) {
        const row = await client.query(
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
    });
  }

  async listDeckConfigs(userId: string) {
    const result = await this.withAppUser(userId,(client)=>client.query(`select * from user_deck_configs where user_id = $1 order by updated_at desc`, [userId]));
    return result.rows.map(rowToDeckConfig);
  }

  async upsertDeckConfig(input: Omit<DeckConfig, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const result = await this.withAppUser(input.userId,(client)=>client.query(
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
    ));
    if (result.rows[0].user_id !== input.userId) throw new Error("DECK_CONFIG_NOT_FOUND");
    return rowToDeckConfig(result.rows[0]);
  }

  async deleteDeckConfig(userId: string, id: string) {
    const result = await this.withAppUser(userId,(client)=>client.query(`delete from user_deck_configs where user_id = $1 and id = $2`, [userId, id]));
    return (result.rowCount ?? 0) > 0;
  }

  async getPlayerData(userId: string, bindingId: string, kind: PlayerDataKind) {
    return this.withPlayerUser(userId, async (client) => {
      const result = await client.query(
        `select * from user_player_data where user_id = $1 and binding_id = $2 and kind = $3`,
        [userId, bindingId, kind]
      );
      return result.rows[0] ? rowToPlayerData(result.rows[0]) : null;
    });
  }

  async upsertPlayerData(input: Omit<PlayerDataRecord, "id" | "createdAt" | "updatedAt">) {
    return this.withPlayerUser(input.userId, async (client) => {
      const result = await client.query(
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
    });
  }

  async listPlayerData(userId: string, bindingId: string) {
    return this.withPlayerUser(userId, async (client) => {
      const result = await client.query(
        `select * from user_player_data where user_id = $1 and binding_id = $2 order by kind`,
        [userId, bindingId]
      );
      return result.rows.map(rowToPlayerData);
    });
  }

  async saveRankingHistorySamples(inputs: RankingHistoryInput[]) {
    return this.withRankingService(async (client)=>{
    const result: RankingHistorySample[] = [];
    for (const input of inputs) {
      const row = await client.query(
        `insert into ranking_history_samples
          (region, event_id, sample_type, rank, score, sampled_at, bucket_at, player_name, user_id, leader_card_id, leader_card_image_url, raw_payload, source_metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{}'::jsonb, $12)
         on conflict (region, event_id, sample_type, rank, bucket_at) do update set
          score = excluded.score,
          sampled_at = excluded.sampled_at,
          player_name = excluded.player_name,
          user_id = excluded.user_id,
          leader_card_id = excluded.leader_card_id,
          leader_card_image_url = excluded.leader_card_image_url,
          raw_payload = '{}'::jsonb,
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
          JSON.stringify(input.sourceMetadata ?? {})
        ]
      );
      result.push(rowToRankingHistory(row.rows[0]));
    }
    return result;
    });
  }

  async deleteInventoryCard(userId: string, bindingId: string, cardId: string) {
    return this.withPlayerUser(userId, async (client) => {
      const result = await client.query(
        `delete from user_card_inventory where user_id = $1 and binding_id = $2 and card_id = $3`,
        [userId, bindingId, cardId]
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async listRankingHistory(query: RankingHistoryQuery) {
    const result = await this.withRankingService((client)=>client.query(
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
    ));
    return result.rows.map(rowToRankingHistory);
  }

  async getIdempotencyRecord(scope: string, key: string) {
    return this.withIdempotencyService(scope,async(client)=>{
    await client.query(`delete from api_idempotency_records where expires_at <= now()`);
    const result = await client.query(
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
    });
  }

  async saveIdempotencyRecord(record: IdempotencyRecord) {
    await this.withIdempotencyService(record.scope,(client)=>client.query(
      `insert into api_idempotency_records
        (scope, idempotency_key, request_hash, status_code, response_body, created_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (scope, idempotency_key) do update set
        status_code = excluded.status_code,
        response_body = excluded.response_body,
        expires_at = excluded.expires_at
       where api_idempotency_records.request_hash = excluded.request_hash`,
      [record.scope, record.key, record.requestHash, record.statusCode, JSON.stringify(record.responseBody), record.createdAt, record.expiresAt]
    ));
  }

  async cleanupIdempotencyRecords() {
    // Per-scope cleanup occurs on every idempotency operation; global cleanup
    // belongs to the separately privileged maintenance job.
  }

  async cleanupExpiredData() {
    await this.withAuthApi((client)=>client.query(`select public.pjsktools_auth_cleanup_expired()`).then(()=>undefined));
    await this.withComplianceMaintenance(async(client)=>{
      await client.query(`delete from account_deletion_intents where expires_at <= now() or consumed_at < now() - interval '24 hours'`);
      await client.query(`delete from account_deletion_tombstones where deleted_at < now() - interval '200 days'`);
    await this.cleanupIdempotencyRecords();
    await client.query(
      `insert into ranking_history_minute_rollups
        (region, event_id, sample_type, rank, minute_at, score_min, score_max, score_avg, sample_count)
       select region, event_id, sample_type, rank, date_trunc('minute', sampled_at), min(score), max(score), round(avg(score)), count(*)
       from ranking_history_samples where sampled_at < now() - interval '14 days'
       group by region, event_id, sample_type, rank, date_trunc('minute', sampled_at)
       on conflict (region, event_id, sample_type, rank, minute_at) do update set
        score_min = least(ranking_history_minute_rollups.score_min, excluded.score_min),
        score_max = greatest(ranking_history_minute_rollups.score_max, excluded.score_max),
        score_avg = excluded.score_avg, sample_count = excluded.sample_count`
    );
    await client.query(`delete from ranking_history_samples where sampled_at < now() - interval '14 days'`);
    });
  }

  async reserveIdempotencyRecord(record: IdempotencyRecord) {
    return this.withIdempotencyService(record.scope,async(client)=>{
    await client.query(`delete from api_idempotency_records where expires_at <= now()`);
    const reserved = await client.query(
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
    const current=await client.query(`select * from api_idempotency_records where scope=$1 and idempotency_key=$2 and expires_at>now()`,[record.scope,record.key]);
    const row=current.rows[0];
    return row ? {scope:row.scope,key:row.idempotency_key,requestHash:row.request_hash,statusCode:Number(row.status_code),responseBody:row.response_body,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString()} : "reserved";
    });
  }

}
