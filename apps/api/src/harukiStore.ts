import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { config, type RegionId } from "./config.js";
import { hashToken } from "./authCrypto.js";
import { store as baseStore } from "./store.js";
import type {
  HarukiAvailableBinding,
  HarukiConnection,
  HarukiOAuthState,
  HarukiSyncCandidate,
  HarukiSyncReview,
  HarukiRevokeAudit,
  HarukiWebhookEvent,
  PlayerBinding,
  PlayerDataKind
} from "./types.js";

type ConnectionInput = Omit<HarukiConnection, "id" | "createdAt" | "updatedAt">;

export interface HarukiStore {
  saveOAuthState(state: string, value: Omit<HarukiOAuthState, "stateHash">): Promise<void>;
  consumeOAuthState(state: string): Promise<HarukiOAuthState | null>;
  saveMobileHandoff(handoff: string, userId: string, expiresAt: string): Promise<void>;
  consumeMobileHandoff(handoff: string, userId: string): Promise<boolean>;
  getConnection(userId: string): Promise<HarukiConnection | null>;
  saveConnection(input: ConnectionInput): Promise<HarukiConnection>;
  claimTokenRefresh(userId: string, leaseId: string, expiresAt: string): Promise<boolean>;
  finishTokenRefresh(userId: string, leaseId: string, input: ConnectionInput): Promise<HarukiConnection | null>;
  releaseTokenRefresh(userId: string, leaseId: string): Promise<void>;
  cleanupExpiredRecords(): Promise<void>;
  consumeRateLimit(keys: string[], limit: number, windowSeconds: number): Promise<boolean>;
  deleteConnection(userId: string): Promise<boolean>;
  importBindings(userId: string, connectionId: string, bindings: HarukiAvailableBinding[]): Promise<PlayerBinding[]>;
  saveReview(token: string, input: Omit<HarukiSyncReview, "tokenHash">): Promise<void>;
  consumeReview(token: string, userId: string, bindingId: string): Promise<HarukiSyncReview | null>;
  applySync(input: {
    userId: string;
    binding: PlayerBinding;
    candidate: HarukiSyncCandidate;
    updateCards: boolean;
    updateGroups: PlayerDataKind[];
    pendingEmptyGroups: PlayerDataKind[];
  }): Promise<void>;
  updateSyncSettings(userId: string, bindingId: string, autoSyncDaily: boolean): Promise<PlayerBinding | null>;
  updateSyncFailure(userId: string, bindingId: string, status: NonNullable<PlayerBinding["lastSyncStatus"]>, upstreamUploadedAt?: string): Promise<void>;
  claimDueAutoSync(limit: number): Promise<PlayerBinding[]>;
  saveWebhookEvent(event: HarukiWebhookEvent): Promise<boolean>;
  claimWebhookEvents(limit: number): Promise<HarukiWebhookEvent[]>;
  finishWebhookEvent(eventId: string, status: HarukiWebhookEvent["status"]): Promise<void>;
  markWebhookBinding(event: HarukiWebhookEvent): Promise<boolean>;
  resolveWebhookBinding(event: HarukiWebhookEvent): Promise<PlayerBinding | null>;
  saveRevokeAudit(audit: HarukiRevokeAudit): Promise<void>;
}

function nowIso() {
  return new Date().toISOString();
}

function connectionFromRow(row: any): HarukiConnection {
  return {
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    scope: Array.isArray(row.scope) ? row.scope.map(String) : [],
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted ?? undefined,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : undefined,
    encryptionKeyVersion: row.encryption_key_version,
    status: row.status,
    availableBindings: Array.isArray(row.available_bindings) ? row.available_bindings : [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function bindingFromRow(row: any): PlayerBinding {
  return {
    id: row.id,
    userId: row.user_id,
    harukiConnectionId: row.haruki_connection_id ?? undefined,
    harukiBindingId: row.haruki_binding_id ?? undefined,
    harukiBindingKey: row.haruki_binding_key ?? undefined,
    region: row.region,
    playerUid: row.player_uid,
    displayName: row.display_name ?? undefined,
    isDefault: Boolean(row.is_default),
    verified: Boolean(row.verified),
    source: row.source ?? undefined,
    upstreamUploadedAt: row.upstream_uploaded_at ? new Date(row.upstream_uploaded_at).toISOString() : undefined,
    upstreamEtag: row.upstream_etag ?? undefined,
    lastWebhookAt: row.last_webhook_at ? new Date(row.last_webhook_at).toISOString() : undefined,
    upstreamUpdateAvailable: Boolean(row.upstream_update_available),
    lastSyncAttemptAt: row.last_sync_attempt_at ? new Date(row.last_sync_attempt_at).toISOString() : undefined,
    lastSyncSucceededAt: row.last_sync_succeeded_at ? new Date(row.last_sync_succeeded_at).toISOString() : undefined,
    lastSyncStatus: row.last_sync_status,
    pendingEmptyGroups: Array.isArray(row.pending_empty_groups) ? row.pending_empty_groups : [],
    autoSyncDaily: Boolean(row.auto_sync_daily),
    note: row.note ?? undefined,
    publicProfileSnapshot: row.public_profile_snapshot ?? undefined,
    refreshedAt: row.refreshed_at ? new Date(row.refreshed_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export class MemoryHarukiStore implements HarukiStore {
  private states = new Map<string, HarukiOAuthState>();
  private handoffs = new Map<string, { userId: string; expiresAt: string }>();
  private connections = new Map<string, HarukiConnection>();
  private reviews = new Map<string, HarukiSyncReview>();
  private refreshLeases = new Map<string, { leaseId: string; expiresAt: string }>();
  private rateLimits = new Map<string, { count: number; expiresAt: string }>();
  private webhookEvents = new Map<string, HarukiWebhookEvent>();
  private revokeAudits: HarukiRevokeAudit[] = [];

  async saveOAuthState(state: string, value: Omit<HarukiOAuthState, "stateHash">) {
    this.states.set(hashToken(state), { ...value, stateHash: hashToken(state) });
  }

  async consumeOAuthState(state: string) {
    const key = hashToken(state);
    const value = this.states.get(key);
    this.states.delete(key);
    return value && Date.parse(value.expiresAt) > Date.now() ? value : null;
  }

  async saveMobileHandoff(handoff: string, userId: string, expiresAt: string) {
    this.handoffs.set(hashToken(handoff), { userId, expiresAt });
  }

  async consumeMobileHandoff(handoff: string, userId: string) {
    const key = hashToken(handoff);
    const value = this.handoffs.get(key);
    this.handoffs.delete(key);
    return Boolean(value && value.userId === userId && Date.parse(value.expiresAt) > Date.now());
  }

  async getConnection(userId: string) {
    return this.connections.get(userId) ?? null;
  }

  async saveConnection(input: ConnectionInput) {
    const conflicting = [...this.connections.values()].find((item) => item.subject === input.subject && item.userId !== input.userId);
    if (conflicting) throw new Error("HARUKI_SUBJECT_EXISTS");
    const existing = this.connections.get(input.userId);
    if (existing && existing.subject !== input.subject) throw new Error("HARUKI_SUBJECT_MISMATCH");
    const timestamp = nowIso();
    const value = { ...existing, ...input, id: existing?.id ?? randomUUID(), createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    this.connections.set(input.userId, value);
    return value;
  }

  async claimTokenRefresh(userId: string, leaseId: string, expiresAt: string) {
    const current = this.refreshLeases.get(userId);
    if (current && Date.parse(current.expiresAt) > Date.now()) return false;
    this.refreshLeases.set(userId, { leaseId, expiresAt });
    return true;
  }

  async finishTokenRefresh(userId: string, leaseId: string, input: ConnectionInput) {
    if (this.refreshLeases.get(userId)?.leaseId !== leaseId) return null;
    const connection = await this.saveConnection(input);
    this.refreshLeases.delete(userId);
    return connection;
  }

  async releaseTokenRefresh(userId: string, leaseId: string) {
    if (this.refreshLeases.get(userId)?.leaseId === leaseId) this.refreshLeases.delete(userId);
  }

  async cleanupExpiredRecords() {
    const now = Date.now();
    for (const [key, state] of this.states) if (Date.parse(state.expiresAt) <= now) this.states.delete(key);
    for (const [key, handoff] of this.handoffs) if (Date.parse(handoff.expiresAt) <= now) this.handoffs.delete(key);
    for (const [key, review] of this.reviews) if (Date.parse(review.expiresAt) <= now) this.reviews.delete(key);
    for (const [key, lease] of this.refreshLeases) if (Date.parse(lease.expiresAt) <= now) this.refreshLeases.delete(key);
    for (const [key, rate] of this.rateLimits) if (Date.parse(rate.expiresAt) <= now) this.rateLimits.delete(key);
  }

  async consumeRateLimit(keys: string[], limit: number, windowSeconds: number) {
    await this.cleanupExpiredRecords();
    if (keys.some((key) => (this.rateLimits.get(key)?.count ?? 0) >= limit)) return false;
    const expiresAt = new Date(Date.now() + windowSeconds * 1000).toISOString();
    for (const key of keys) {
      const current = this.rateLimits.get(key);
      this.rateLimits.set(key, { count: (current?.count ?? 0) + 1, expiresAt: current?.expiresAt ?? expiresAt });
    }
    return true;
  }

  async deleteConnection(userId: string) {
    const connection = this.connections.get(userId);
    if (!connection) return false;
    this.connections.delete(userId);
    this.refreshLeases.delete(userId);
    for (const [key, state] of this.states) if (state.userId === userId) this.states.delete(key);
    for (const [key, handoff] of this.handoffs) if (handoff.userId === userId) this.handoffs.delete(key);
    for (const [key, review] of this.reviews) if (review.userId === userId) this.reviews.delete(key);
    for (const binding of await baseStore.listPlayerBindings(userId)) {
      if (binding.harukiConnectionId === connection.id && binding.source === "haruki-oauth") {
        await baseStore.deletePlayerBinding(userId, binding.id);
      }
    }
    return true;
  }

  async importBindings(userId: string, connectionId: string, inputs: HarukiAvailableBinding[]) {
    const result: PlayerBinding[] = [];
    for (const input of inputs) {
      for (const ownerId of this.connections.keys()) {
        if (ownerId === userId) continue;
        const owned = await baseStore.listPlayerBindings(ownerId);
        if (owned.some((binding) => binding.verified && binding.region === input.region && binding.playerUid === input.playerUid)) {
          throw new Error("PLAYER_BINDING_EXISTS");
        }
      }
      const all = await baseStore.listPlayerBindings(userId);
      const existing = all.find((item) => item.harukiBindingKey === input.bindingKey);
      const patch = {
        harukiConnectionId: connectionId,
        harukiBindingId: input.upstreamBindingId,
        harukiBindingKey: input.bindingKey,
        displayName: input.displayName,
        verified: true,
        source: "haruki-oauth" as const,
        lastSyncStatus: existing?.lastSyncStatus ?? "ready" as const,
        pendingEmptyGroups: existing?.pendingEmptyGroups ?? [],
        autoSyncDaily: existing?.autoSyncDaily ?? false
      };
      const value = existing
        ? await baseStore.updatePlayerBinding(userId, existing.id, patch)
        : await baseStore.addPlayerBinding({
            userId, region: input.region, playerUid: input.playerUid, isDefault: all.length === 0, ...patch
          });
      if (!value) throw new Error("PLAYER_BINDING_NOT_FOUND");
      result.push(value);
    }
    return result;
  }

  async saveReview(token: string, input: Omit<HarukiSyncReview, "tokenHash">) {
    this.reviews.set(hashToken(token), { ...input, tokenHash: hashToken(token) });
  }

  async consumeReview(token: string, userId: string, bindingId: string) {
    const key = hashToken(token);
    const value = this.reviews.get(key);
    this.reviews.delete(key);
    return value && value.userId === userId && value.bindingId === bindingId && Date.parse(value.expiresAt) > Date.now() ? value : null;
  }

  async applySync(input: Parameters<HarukiStore["applySync"]>[0]) {
    const syncedAt = nowIso();
    if (input.updateCards) {
      await baseStore.upsertInventory(input.candidate.cards.map((card) => ({
        ...card, userId: input.userId, bindingId: input.binding.id, region: input.binding.region,
        source: "haruki-oauth" as const, upstreamVersion: input.candidate.upstreamVersion, syncedAt
      })));
    }
    for (const group of input.candidate.playerData) {
      if (input.updateGroups.includes(group.kind)) await baseStore.upsertPlayerData({
        userId: input.userId, bindingId: input.binding.id, region: input.binding.region, kind: group.kind, data: group.data,
        source: "haruki-oauth", upstreamVersion: input.candidate.upstreamVersion, syncedAt
      });
    }
    await baseStore.updatePlayerBinding(input.userId, input.binding.id, {
      displayName: input.candidate.sourceSummary.name ?? input.binding.displayName,
      upstreamUploadedAt: input.candidate.sourceSummary.uploadTime,
      lastSyncAttemptAt: syncedAt,
      lastSyncSucceededAt: syncedAt,
      lastSyncStatus: input.pendingEmptyGroups.length ? "needs-review" : "success",
      pendingEmptyGroups: input.pendingEmptyGroups,
    });
  }

  async updateSyncSettings(userId: string, bindingId: string, autoSyncDaily: boolean) {
    const value = (await baseStore.listPlayerBindings(userId)).find((item) => item.id === bindingId);
    if (!value || value.userId !== userId) return null;
    return baseStore.updatePlayerBinding(userId, bindingId, { autoSyncDaily });
  }

  async updateSyncFailure(userId: string, bindingId: string, status: NonNullable<PlayerBinding["lastSyncStatus"]>, upstreamUploadedAt?: string) {
    await baseStore.updatePlayerBinding(userId, bindingId, { lastSyncAttemptAt: nowIso(), lastSyncStatus: status, ...(upstreamUploadedAt ? { upstreamUploadedAt } : {}) });
  }

  async claimDueAutoSync(limit: number) {
    const now = Date.now();
    for (const [key, state] of this.states) if (Date.parse(state.expiresAt) <= now) this.states.delete(key);
    for (const [key, handoff] of this.handoffs) if (Date.parse(handoff.expiresAt) <= now) this.handoffs.delete(key);
    for (const [key, review] of this.reviews) if (Date.parse(review.expiresAt) <= now) this.reviews.delete(key);
    const due = (await Promise.all([...this.connections.keys()].map((userId) => baseStore.listPlayerBindings(userId))))
      .flat()
      .filter((binding) => binding.verified && binding.autoSyncDaily
        && (!binding.lastSyncAttemptAt || Date.parse(binding.lastSyncAttemptAt) < Date.now() - 24 * 60 * 60_000))
      .slice(0, limit);
    for (const binding of due) await baseStore.updatePlayerBinding(binding.userId, binding.id, { lastSyncAttemptAt: nowIso(), lastSyncStatus: "syncing" });
    return due;
  }

  async saveWebhookEvent(event: HarukiWebhookEvent) {
    if (this.webhookEvents.has(event.eventId)) return false;
    this.webhookEvents.set(event.eventId, event);
    return true;
  }

  async claimWebhookEvents(limit: number) {
    const events = [...this.webhookEvents.values()].filter((event) => event.status === "pending").slice(0, limit);
    for (const event of events) this.webhookEvents.set(event.eventId, { ...event, status: "processing" });
    return events.map((event) => ({ ...event, status: "processing" as const }));
  }

  async finishWebhookEvent(eventId: string, status: HarukiWebhookEvent["status"]) {
    const event = this.webhookEvents.get(eventId);
    if (event) this.webhookEvents.set(eventId, { ...event, status, processedAt: nowIso() });
  }

  async markWebhookBinding(event: HarukiWebhookEvent) {
    const binding = await this.resolveWebhookBinding(event);
    if (!binding) return false;
    await baseStore.updatePlayerBinding(binding.userId, binding.id, { lastWebhookAt: event.receivedAt, upstreamUpdateAvailable: true, lastSyncStatus: "ready" });
    return true;
  }
  async resolveWebhookBinding(event: HarukiWebhookEvent) {
    const matches: PlayerBinding[] = [];
    for (const connection of this.connections.values()) if (connection.status === "active" && connection.scope.includes("game-data:read")) {
      matches.push(...(await baseStore.listPlayerBindings(connection.userId)).filter((item) => item.region === event.region && item.playerUid === event.playerUid && item.verified && item.source === "haruki-oauth" && item.harukiConnectionId === connection.id));
    }
    return matches.length === 1 ? matches[0]! : null;
  }
  async saveRevokeAudit(audit: HarukiRevokeAudit) { this.revokeAudits.push({ ...audit }); }
}

class PgHarukiStore implements HarukiStore {
  private pool: Pool;

  constructor(connectionString = config.harukiDatabaseUrl) {
    if (!config.harukiFeatureEnabled || !connectionString) throw new Error("enabled Haruki requires a dedicated HARUKI_DATABASE_URL");
    this.pool = new Pool({ connectionString });
  }

  async assertRuntimeRoleSafety(forbiddenLogins: string[] = []) {
    const identity=await this.pool.query(`select current_user,rolsuper,rolbypassrls,rolinherit,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user`);
    const role=identity.rows[0];
    if(!role||role.rolsuper||role.rolbypassrls||role.rolinherit||role.rolcreatedb||role.rolcreaterole) throw new Error("unsafe Haruki database runtime login");
    if(forbiddenLogins.includes(role.current_user)) throw new Error("Haruki database runtime login must be distinct");
    const memberships=await this.pool.query(`select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=current_user order by parent.rolname`);
    if(JSON.stringify(memberships.rows.map((row)=>row.rolname))!==JSON.stringify(["pjsktools_haruki_user","pjsktools_haruki_worker"])) throw new Error("unexpected Haruki runtime role membership");
    const owned=await this.pool.query(`select (select count(*) from pg_class where relowner=(select oid from pg_roles where rolname=current_user))+(select count(*) from pg_proc where proowner=(select oid from pg_roles where rolname=current_user)) as count`);
    if(Number(owned.rows[0].count)) throw new Error("Haruki runtime login owns database objects");
    if((await this.pool.query(`select has_schema_privilege(current_user,'public','CREATE') as allowed`)).rows[0].allowed) throw new Error("Haruki runtime login has schema CREATE");
  }

  private async transaction<T>(userId: string, operation: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role pjsktools_haruki_user");
      await client.query(`select set_config('pjsktools.user_id', $1, true)`, [userId]);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async workerTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role pjsktools_haruki_worker");
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveOAuthState(state: string, value: Omit<HarukiOAuthState, "stateHash">) {
    await this.transaction(value.userId, (client) => client.query(
      `insert into haruki_oauth_states (state_hash, user_id, client, redirect_uri, code_verifier_encrypted, expires_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [hashToken(state), value.userId, value.client, value.redirectUri ?? null, value.codeVerifierEncrypted, value.expiresAt]
    ).then(() => undefined));
  }

  async consumeOAuthState(state: string) {
    const stateHash = hashToken(state);
    return this.workerTransaction(async (client) => {
      const result = await client.query(
        `delete from haruki_oauth_states where state_hash = $1 and expires_at > now() returning *`,
        [stateHash]
      );
      const row = result.rows[0];
      return row ? {
        stateHash: row.state_hash,
        userId: row.user_id,
        client: row.client,
        redirectUri: row.redirect_uri ?? undefined,
        codeVerifierEncrypted: row.code_verifier_encrypted,
        expiresAt: new Date(row.expires_at).toISOString()
      } : null;
    });
  }

  async saveMobileHandoff(handoff: string, userId: string, expiresAt: string) {
    await this.transaction(userId, (client) => client.query(
      `insert into haruki_oauth_handoffs (handoff_hash, user_id, expires_at) values ($1, $2, $3)`,
      [hashToken(handoff), userId, expiresAt]
    ).then(() => undefined));
  }

  async consumeMobileHandoff(handoff: string, userId: string) {
    return this.transaction(userId, async (client) => {
      const result = await client.query(
        `delete from haruki_oauth_handoffs where handoff_hash = $1 and user_id = $2 and expires_at > now() returning user_id`,
        [hashToken(handoff), userId]
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async getConnection(userId: string) {
    return this.transaction(userId, async (client) => {
      const result = await client.query(`select * from haruki_connections where user_id = $1`, [userId]);
      return result.rows[0] ? connectionFromRow(result.rows[0]) : null;
    });
  }

  async saveConnection(input: ConnectionInput) {
    return this.transaction(input.userId, async (client) => {
      try {
        const existing = await client.query(`select subject from haruki_connections where user_id=$1`, [input.userId]);
        if (existing.rows[0] && existing.rows[0].subject !== input.subject) throw new Error("HARUKI_SUBJECT_MISMATCH");
        const result = await client.query(
          `insert into haruki_connections
            (user_id, subject, scope, access_token_encrypted, refresh_token_encrypted, token_expires_at, encryption_key_version, status, available_bindings)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (user_id) do update set subject=excluded.subject, scope=excluded.scope,
             access_token_encrypted=excluded.access_token_encrypted, refresh_token_encrypted=excluded.refresh_token_encrypted,
             token_expires_at=excluded.token_expires_at, encryption_key_version=excluded.encryption_key_version,
             status=excluded.status, available_bindings=excluded.available_bindings, updated_at=now()
           returning *`,
          [input.userId, input.subject, input.scope, input.accessTokenEncrypted, input.refreshTokenEncrypted ?? null,
            input.tokenExpiresAt ?? null, input.encryptionKeyVersion, input.status, JSON.stringify(input.availableBindings)]
        );
        return connectionFromRow(result.rows[0]);
      } catch (error: any) {
        if (error?.code === "23505") throw new Error("HARUKI_SUBJECT_EXISTS");
        throw error;
      }
    });
  }

  async claimTokenRefresh(userId: string, leaseId: string, expiresAt: string) {
    return this.transaction(userId, async (client) => {
      const result = await client.query(
        `update haruki_connections
         set refresh_lease_id=$2, refresh_lease_expires_at=$3
         where user_id=$1 and (refresh_lease_id is null or refresh_lease_expires_at <= now())
         returning id`,
        [userId, leaseId, expiresAt]
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async finishTokenRefresh(userId: string, leaseId: string, input: ConnectionInput) {
    return this.transaction(userId, async (client) => {
      const result = await client.query(
        `update haruki_connections set scope=$3, access_token_encrypted=$4, refresh_token_encrypted=$5,
           token_expires_at=$6, encryption_key_version=$7, status=$8, available_bindings=$9,
           refresh_lease_id=null, refresh_lease_expires_at=null, updated_at=now()
         where user_id=$1 and refresh_lease_id=$2 returning *`,
        [userId, leaseId, input.scope, input.accessTokenEncrypted, input.refreshTokenEncrypted ?? null,
          input.tokenExpiresAt ?? null, input.encryptionKeyVersion, input.status, JSON.stringify(input.availableBindings)]
      );
      return result.rows[0] ? connectionFromRow(result.rows[0]) : null;
    });
  }

  async releaseTokenRefresh(userId: string, leaseId: string) {
    await this.transaction(userId, (client) => client.query(
      `update haruki_connections set refresh_lease_id=null,refresh_lease_expires_at=null
       where user_id=$1 and refresh_lease_id=$2`,
      [userId, leaseId]
    ).then(() => undefined));
  }

  async cleanupExpiredRecords() {
    await this.workerTransaction(async (client) => {
      await client.query(`delete from haruki_oauth_states where expires_at <= now()`);
      await client.query(`delete from haruki_oauth_handoffs where expires_at <= now()`);
      await client.query(`delete from player_sync_reviews where expires_at <= now()`);
      await client.query(`update haruki_connections set refresh_lease_id=null,refresh_lease_expires_at=null where refresh_lease_expires_at <= now()`);
      await client.query(`delete from haruki_rate_limits where expires_at <= now()`);
    });
  }

  async consumeRateLimit(keys: string[], limit: number, windowSeconds: number) {
    return this.workerTransaction(async (client) => {
      const hashes = [...new Set(keys.map(hashToken))].sort();
      // Lock every bucket, including buckets that do not exist yet. The stable
      // order prevents deadlocks when requests share only part of their keys.
      for (const bucketHash of hashes) {
        await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [bucketHash]);
      }
      await client.query(
        `delete from haruki_rate_limits where bucket_hash = any($1::text[]) and expires_at <= now()`,
        [hashes]
      );
      const existing = await client.query(
        `select bucket_hash,count from haruki_rate_limits where bucket_hash = any($1::text[])`,
        [hashes]
      );
      if (existing.rows.some((row) => Number(row.count) >= limit)) {
        return false;
      }
      for (const bucketHash of hashes) {
        await client.query(
          `insert into haruki_rate_limits (bucket_hash,count,expires_at)
           values ($1,1,now() + make_interval(secs => $2))
           on conflict (bucket_hash) do update set count=haruki_rate_limits.count+1`,
          [bucketHash, windowSeconds]
        );
      }
      return true;
    });
  }

  async deleteConnection(userId: string) {
    return this.transaction(userId, async (client) => {
      await client.query(`delete from player_sync_reviews where user_id = $1`, [userId]);
      await client.query(`delete from haruki_oauth_handoffs where user_id = $1`, [userId]);
      await client.query(`delete from haruki_oauth_states where user_id = $1`, [userId]);
      const result = await client.query(`delete from haruki_connections where user_id = $1`, [userId]);
      return (result.rowCount ?? 0) > 0;
    });
  }

  async importBindings(userId: string, connectionId: string, bindings: HarukiAvailableBinding[]) {
    return this.transaction(userId, async (client) => {
      const result: PlayerBinding[] = [];
      for (const binding of bindings) {
        try {
          const row = await client.query(
            `insert into user_player_bindings
              (user_id, haruki_connection_id, haruki_binding_id, haruki_binding_key, region, player_uid, display_name, is_default,
               verified, source, last_sync_status)
             values ($1,$2,$3,$4,$5,$6,$7,not exists(select 1 from user_player_bindings where user_id=$1),true,'haruki-oauth','ready')
             on conflict (haruki_connection_id, haruki_binding_key) where haruki_connection_id is not null and haruki_binding_key is not null
             do update set haruki_binding_id=excluded.haruki_binding_id,display_name=excluded.display_name, verified=true, source='haruki-oauth', updated_at=now()
             returning *`,
            [userId, connectionId, binding.upstreamBindingId ?? null, binding.bindingKey, binding.region, binding.playerUid, binding.displayName ?? null]
          );
          result.push(bindingFromRow(row.rows[0]));
        } catch (error: any) {
          if (error?.code === "23505") throw new Error("PLAYER_BINDING_EXISTS");
          throw error;
        }
      }
      return result;
    });
  }

  async saveReview(token: string, input: Omit<HarukiSyncReview, "tokenHash">) {
    await this.transaction(input.userId, (client) => client.query(
      `insert into player_sync_reviews (token_hash,user_id,binding_id,candidate_hash,upstream_version,expires_at)
       values ($1,$2,$3,$4,$5,$6)`,
      [hashToken(token), input.userId, input.bindingId, input.candidateHash, input.upstreamVersion, input.expiresAt]
    ).then(() => undefined));
  }

  async consumeReview(token: string, userId: string, bindingId: string) {
    return this.transaction(userId, async (client) => {
      const result = await client.query(
        `delete from player_sync_reviews where token_hash=$1 and user_id=$2 and binding_id=$3 and expires_at>now() returning *`,
        [hashToken(token), userId, bindingId]
      );
      const row = result.rows[0];
      return row ? {
        tokenHash: row.token_hash,
        userId: row.user_id,
        bindingId: row.binding_id,
        candidateHash: row.candidate_hash,
        upstreamVersion: row.upstream_version,
        expiresAt: new Date(row.expires_at).toISOString()
      } : null;
    });
  }

  async applySync(input: Parameters<HarukiStore["applySync"]>[0]) {
    await this.transaction(input.userId, async (client) => {
      const syncedAt = nowIso();
      if (input.updateCards) {
        for (const card of input.candidate.cards) {
          await client.query(
            `insert into user_card_inventory
              (user_id,binding_id,region,card_id,level,master_rank,skill_level,special_training_status,default_image,episodes_read,episodes,source,upstream_version,synced_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'haruki-oauth',$12,$13)
             on conflict (user_id,region,card_id,coalesce(binding_id,'00000000-0000-0000-0000-000000000000'::uuid))
             do update set level=excluded.level,master_rank=excluded.master_rank,skill_level=excluded.skill_level,
               special_training_status=excluded.special_training_status,default_image=excluded.default_image,
               episodes_read=excluded.episodes_read,episodes=excluded.episodes,source='haruki-oauth',
               upstream_version=excluded.upstream_version,synced_at=excluded.synced_at,updated_at=now()`,
            [input.userId, input.binding.id, input.binding.region, card.cardId, card.level ?? null, card.masterRank ?? null,
              card.skillLevel ?? null, card.specialTrainingStatus ?? null, card.defaultImage ?? null, card.episodesRead ?? null,
              JSON.stringify(card.episodes ?? []), input.candidate.upstreamVersion, syncedAt]
          );
        }
      }
      for (const group of input.candidate.playerData) {
        if (!input.updateGroups.includes(group.kind)) continue;
        await client.query(
          `insert into user_player_data (user_id,binding_id,region,kind,data,source,upstream_version,synced_at)
           values ($1,$2,$3,$4,$5,'haruki-oauth',$6,$7)
           on conflict (user_id,binding_id,kind) do update set data=excluded.data,source='haruki-oauth',
             upstream_version=excluded.upstream_version,synced_at=excluded.synced_at,updated_at=now()`,
          [input.userId, input.binding.id, input.binding.region, group.kind, JSON.stringify(group.data), input.candidate.upstreamVersion, syncedAt]
        );
      }
      await client.query(
        `update user_player_bindings set display_name=coalesce($3,display_name),upstream_uploaded_at=$4,
          last_sync_attempt_at=$5,last_sync_succeeded_at=$5,last_sync_status=$6,pending_empty_groups=$7,refreshed_at=$5,updated_at=now()
         where id=$1 and user_id=$2`,
        [input.binding.id, input.userId, input.candidate.sourceSummary.name ?? null,
          input.candidate.sourceSummary.uploadTime ?? null, syncedAt,
          input.pendingEmptyGroups.length ? "needs-review" : "success", input.pendingEmptyGroups]
      );
    });
  }

  async updateSyncSettings(userId: string, bindingId: string, autoSyncDaily: boolean) {
    return this.transaction(userId, async (client) => {
      const result = await client.query(
        `update user_player_bindings set auto_sync_daily=$3,updated_at=now() where user_id=$1 and id=$2 and verified returning *`,
        [userId, bindingId, autoSyncDaily]
      );
      return result.rows[0] ? bindingFromRow(result.rows[0]) : null;
    });
  }

  async updateSyncFailure(userId: string, bindingId: string, status: NonNullable<PlayerBinding["lastSyncStatus"]>, upstreamUploadedAt?: string) {
    await this.transaction(userId, (client) => client.query(
      `update user_player_bindings set last_sync_attempt_at=now(),last_sync_status=$3,
       upstream_uploaded_at=coalesce($4,upstream_uploaded_at),updated_at=now() where user_id=$1 and id=$2`,
      [userId, bindingId, status, upstreamUploadedAt ?? null]
    ).then(() => undefined));
  }

  async claimDueAutoSync(limit: number) {
    return this.workerTransaction(async (client) => {
      await client.query(`delete from haruki_oauth_states where expires_at <= now()`);
      await client.query(`delete from haruki_oauth_handoffs where expires_at <= now()`);
      await client.query(`delete from player_sync_reviews where expires_at <= now()`);
      const lock = await client.query(`select pg_try_advisory_xact_lock(hashtext('pjsktools-haruki-auto-sync')) as acquired`);
      if (!lock.rows[0]?.acquired) {
        return [];
      }
      const result = await client.query(
        `with due as (
           select id from user_player_bindings
           where verified and auto_sync_daily
             and (last_sync_attempt_at is null or last_sync_attempt_at < now() - interval '24 hours')
           order by last_sync_attempt_at nulls first
           for update skip locked limit $1
         )
         update user_player_bindings b set last_sync_attempt_at=now(),last_sync_status='syncing',updated_at=now()
         from due where b.id=due.id returning b.*`,
        [Math.max(1, Math.min(100, limit))]
      );
      return result.rows.map(bindingFromRow);
    });
  }

  async saveWebhookEvent(event: HarukiWebhookEvent) {
    return this.workerTransaction(async (client) => {
      const result = await client.query(
        `insert into haruki_webhook_events
          (event_id_hash,subject,binding_key,data_type,region,player_uid,upload_time,payload_hash,status,received_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`,
        [hashToken(event.eventId), event.subject || null, event.bindingKey || null, event.dataType, event.region, event.playerUid,
          event.uploadTime ?? null, event.payloadHash, event.status, event.receivedAt]
      );
      return result.rowCount === 1;
    });
  }

  async claimWebhookEvents(limit: number) {
    return this.workerTransaction(async (client) => {
      const result = await client.query(
        `select * from haruki_webhook_events where status='pending' order by received_at
         for update skip locked limit $1`, [limit]
      );
      const hashes = result.rows.map((row) => row.event_id_hash);
      if (hashes.length) await client.query(`update haruki_webhook_events set status='processing' where event_id_hash=any($1::text[])`, [hashes]);
      return result.rows.map((row) => ({
        eventId: row.event_id_hash, subject: row.subject, bindingKey: row.binding_key, region: row.region,
        dataType: (row.data_type === "mysekai" ? "mysekai" : "suite") as "suite" | "mysekai",
        playerUid: row.player_uid, uploadTime: row.upload_time ? new Date(row.upload_time).toISOString() : undefined,
        payloadHash: row.payload_hash, status: "processing" as const, receivedAt: new Date(row.received_at).toISOString()
      }));
    });
  }

  async finishWebhookEvent(eventId: string, status: HarukiWebhookEvent["status"]) {
    await this.workerTransaction(async (client) => {
      await client.query(`update haruki_webhook_events set status=$2,processed_at=now() where event_id_hash=$1`, [eventId, status]);
    });
  }

  async markWebhookBinding(event: HarukiWebhookEvent) {
    return this.workerTransaction(async (client) => {
      const result = await client.query(
        `with target as (
           select b.id from user_player_bindings b join haruki_connections c on c.id=b.haruki_connection_id
           where b.region=$2 and b.player_uid=$3 and b.verified and b.source='haruki-oauth' and c.status='active' and c.scope @> array['game-data:read']::text[]
         ), unique_target as (select min(id) id from target having count(*)=1)
         update user_player_bindings b set last_webhook_at=$1,upstream_update_available=true,last_sync_status='ready',updated_at=now()
         from unique_target t where b.id=t.id returning b.id`, [event.receivedAt, event.region, event.playerUid]
      );
      return result.rowCount === 1;
    });
  }
  async resolveWebhookBinding(event: HarukiWebhookEvent) {
    return this.workerTransaction(async (client) => {
      const result = await client.query(`select b.* from user_player_bindings b join haruki_connections c on c.id=b.haruki_connection_id where b.region=$1 and b.player_uid=$2 and b.verified and b.source='haruki-oauth' and c.status='active' and c.scope @> array['game-data:read']::text[]`, [event.region, event.playerUid]);
      return result.rows.length === 1 ? bindingFromRow(result.rows[0]) : null;
    });
  }
  async saveRevokeAudit(audit: HarukiRevokeAudit) {
    await this.transaction(audit.userId, (client) => client.query(
      `insert into haruki_revoke_audits(user_id,connection_id,subject_hash,failed_hints,status,created_at) values($1,$2,$3,$4,$5,$6)`,
      [audit.userId, audit.connectionId, audit.subjectHash, audit.failedHints, audit.status, audit.createdAt]
    ).then(() => undefined));
  }
}

export const harukiStore: HarukiStore = config.harukiFeatureEnabled ? new PgHarukiStore() : new MemoryHarukiStore();

export async function assertHarukiDatabaseRuntimeRoleSafety(forbiddenLogins: string[] = []) {
  if(harukiStore instanceof PgHarukiStore) await harukiStore.assertRuntimeRoleSafety(forbiddenLogins);
}
