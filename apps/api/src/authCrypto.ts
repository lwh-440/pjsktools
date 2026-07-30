import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function key() {
  return createHash("sha256").update(config.jwtSecret).digest();
}

function decodeHarukiKey(raw: string, label: string) {
  const decoded = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error(`${label} must decode to exactly 32 bytes`);
  return decoded;
}

function currentHarukiKey() {
  const raw = config.harukiTokenEncryptionKey;
  if (!raw) {
    if (config.nodeEnv === "production") throw new Error("HARUKI_TOKEN_ENCRYPTION_KEY is required in production");
    return createHash("sha256").update(`${config.jwtSecret}:haruki-development-only`).digest();
  }
  return decodeHarukiKey(raw, "HARUKI_TOKEN_ENCRYPTION_KEY");
}

function harukiKeyring() {
  const keys = new Map<string, Buffer>([[config.harukiTokenEncryptionKeyVersion, currentHarukiKey()]]);
  for (const entry of config.harukiTokenPreviousEncryptionKeys.split(",").map((value) => value.trim()).filter(Boolean)) {
    const separator = entry.indexOf(":");
    if (separator < 1) throw new Error("HARUKI_TOKEN_PREVIOUS_ENCRYPTION_KEYS must use version:key entries");
    const version = entry.slice(0, separator).trim();
    const raw = entry.slice(separator + 1).trim();
    if (!version || !raw || keys.has(version)) throw new Error(`Invalid or duplicate Haruki key version: ${version}`);
    keys.set(version, decodeHarukiKey(raw, `Haruki key ${version}`));
  }
  return keys;
}

/** Validate the active key and every configured rotation key during startup. */
export function validateHarukiTokenEncryptionConfiguration() {
  currentHarukiKey();
  harukiKeyring();
}

function encryptWithKey(value: string, encryptionKey: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptWithKey(value: string, encryptionKey: Buffer) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf-8");
}

export function encryptSecret(value?: string) {
  if (!value) return undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(value?: string) {
  if (!value) return undefined;
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) return undefined;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64")), decipher.final()]).toString("utf-8");
}

export function encryptHarukiSecret(value: string) {
  return `${config.harukiTokenEncryptionKeyVersion}:${encryptWithKey(value, currentHarukiKey())}`;
}

export function decryptHarukiSecret(value: string) {
  const separator = value.indexOf(":");
  if (separator < 1) throw new Error("Invalid versioned Haruki secret");
  const version = value.slice(0, separator);
  const encryptionKey = harukiKeyring().get(version);
  if (!encryptionKey) throw new Error(`Unsupported Haruki key version: ${version}`);
  return decryptWithKey(value.slice(separator + 1), encryptionKey);
}
