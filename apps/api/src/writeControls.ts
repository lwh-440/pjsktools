import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthStore } from "./store.js";
import type { IdempotencyRecord } from "./types.js";

type RequestState = {
  scope: string;
  key: string;
  requestHash: string;
};

const keyPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function shouldProtect(request: FastifyRequest) {
  const path = request.url.split("?", 1)[0];
  return mutationMethods.has(request.method) && path.startsWith("/api/me/")
    && path !== "/api/me/account"
    // These responses contain short-lived OAuth state or player data and must
    // never be persisted in the generic idempotency response table.
    && path !== "/api/me/haruki/public/preview"
    && path !== "/api/me/haruki/oauth/start"
    && !path.startsWith("/api/me/tools/") && !path.endsWith("/validate") && !path.endsWith("/review");
}

export function entityTag(value: unknown) {
  const version = value && typeof value === "object"
    ? (value as any).updatedAt ?? (value as any).createdAt ?? value
    : value;
  return `"${createHash("sha256").update(stableJson(version)).digest("base64url")}"`;
}

export function assertIfMatch(request: FastifyRequest, reply: FastifyReply, current: unknown) {
  const supplied = request.headers["if-match"];
  const currentTag = entityTag(current);
  reply.header("etag", currentTag);
  if (!supplied || supplied === "*") return true;
  const matches = String(supplied).split(",").map((item) => item.trim()).includes(currentTag);
  if (matches) return true;
  reply.code(412).send({
    statusCode: 412,
    code: "VERSION_CONFLICT",
    error: "Precondition Failed",
    message: "The resource changed after it was loaded. Refresh it and retry with the latest ETag.",
    currentVersion: currentTag,
    retryable: true
  });
  return false;
}

export function setEntityTag(reply: FastifyReply, value: unknown) {
  const version = entityTag(value);
  reply.header("etag", version);
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value, version } : value;
}

export function withEntityVersion<T extends object>(value: T): T & { version: string } {
  return { ...value, version: entityTag(value) };
}

export function createWriteControls(store: AuthStore) {
  const states = new WeakMap<FastifyRequest, RequestState>();

  return {
    async before(request: FastifyRequest, reply: FastifyReply, userId: string) {
      if (!shouldProtect(request)) return;
      reply.header("idempotency-policy", "optional; ttl=24h");
      reply.header("concurrency-policy", "If-Match");
      const rawKey = request.headers["idempotency-key"];
      if (!rawKey) return;
      const key = String(rawKey);
      if (!keyPattern.test(key)) {
        return reply.code(400).send({ statusCode: 400, code: "INVALID_IDEMPOTENCY_KEY", error: "Bad Request", message: "Idempotency-Key must be 8-128 URL-safe characters." });
      }
      const path = request.url.split("?", 1)[0];
      const scope = `${userId}:${request.method}:${path}`;
      const requestHash = createHash("sha256").update(`${request.method}\n${path}\n${stableJson(request.body)}`).digest("base64url");
      const createdAt = new Date();
      const pendingRecord: IdempotencyRecord = {
        scope,
        key,
        requestHash,
        statusCode: 0,
        responseBody: {},
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
      };
      let existing = await store.reserveIdempotencyRecord(pendingRecord);
      if (existing !== "reserved") {
        if (existing.requestHash !== requestHash) {
          return reply.code(409).send({ statusCode: 409, code: "IDEMPOTENCY_KEY_REUSED", error: "Conflict", message: "This Idempotency-Key was already used with another request." });
        }
        if (existing.statusCode === 0) {
          const deadline = Date.now() + 30_000;
          while (existing.statusCode === 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            existing = (await store.getIdempotencyRecord(scope, key)) ?? existing;
          }
          if (existing.statusCode === 0) {
            return reply.code(409).send({ statusCode: 409, code: "IDEMPOTENCY_REQUEST_IN_PROGRESS", error: "Conflict", message: "A request with this Idempotency-Key is still in progress.", retryable: true });
          }
        }
        reply.header("idempotency-replayed", "true");
        return reply.code(existing.statusCode).send(existing.responseBody);
      }
      states.set(request, { scope, key, requestHash });
    },

    async after(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
      const state = states.get(request);
      if (!state) return payload;
      let responseBody = payload;
      if (typeof payload === "string") {
        try { responseBody = JSON.parse(payload); } catch { return payload; }
      }
      const createdAt = new Date();
      const record: IdempotencyRecord = {
        ...state,
        statusCode: reply.statusCode,
        responseBody,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
      };
      await store.saveIdempotencyRecord(record);
      reply.header("idempotency-replayed", "false");
      return payload;
    }
  };
}
