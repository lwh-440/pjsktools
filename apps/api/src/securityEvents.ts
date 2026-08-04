import { createHmac } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { config } from "./config.js";

export type SecurityEventName =
  | "login_succeeded" | "login_failed" | "verification_requested" | "rate_limited"
  | "qq_oauth_failed" | "data_exported" | "qq_unlinked" | "deletion_started"
  | "account_deleted" | "master_sync_rejected";

export function buildSecurityEvent(input: {
  event: SecurityEventName;
  requestId?: string;
  ip?: string;
  accountIdentifier?: string;
  at?: string;
}) {
  return {
    event: input.event,
    at: input.at ?? new Date().toISOString(),
    requestId: String(input.requestId ?? "").slice(0, 100),
    ip: String(input.ip ?? "unknown").slice(0, 128),
    ...(input.accountIdentifier ? {
      accountHash: createHmac("sha256", config.securityEventHmacKey).update(input.accountIdentifier.trim().toLowerCase()).digest("hex")
    } : {})
  };
}

export async function writeSecurityEvent(request: any, event: SecurityEventName, accountIdentifier?: string) {
  const record = buildSecurityEvent({ event, requestId: request.id, ip: request.ip, accountIdentifier });
  if (config.securityEventLogPath) {
    await appendFile(config.securityEventLogPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    return;
  }
  request.log.info({ securityEvent: record }, "security event");
}
