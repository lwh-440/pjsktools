import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [masterBaseUrl = "", assetBaseUrl = "", masterToken = ""] = process.argv.slice(2).map((value) => value.trim());

if (!masterBaseUrl && !assetBaseUrl) {
  console.error("Usage: node scripts/set-haruki-data-sources.mjs <master-base-url> [asset-base-url] [master-token]");
  console.error("Pass an empty quoted value to leave a field unchanged.");
  process.exit(1);
}

function normalizeBaseUrl(value, name) {
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    console.error(`${name} must be a valid http/https URL.`);
    process.exit(1);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    console.error(`${name} must use http or https.`);
    process.exit(1);
  }
  return url.toString().replace(/\/+$/, "");
}

const updates = {
  ...(masterBaseUrl ? { HARUKI_MASTER_BASE_URL: normalizeBaseUrl(masterBaseUrl, "HARUKI_MASTER_BASE_URL") } : {}),
  ...(assetBaseUrl ? { HARUKI_ASSET_BASE_URL: normalizeBaseUrl(assetBaseUrl, "HARUKI_ASSET_BASE_URL") } : {}),
  ...(masterToken ? { HARUKI_MASTER_TOKEN: masterToken } : {})
};

const envPath = path.join(process.cwd(), ".env");
const lines = existsSync(envPath) ? readFileSync(envPath, "utf-8").split(/\r?\n/) : [];
const replaced = new Set();
const nextLines = lines.map((line) => {
  const separator = line.indexOf("=");
  if (separator <= 0) return line;
  const key = line.slice(0, separator).trim();
  if (!(key in updates)) return line;
  replaced.add(key);
  return `${key}=${updates[key]}`;
});

for (const [key, value] of Object.entries(updates)) {
  if (!replaced.has(key)) nextLines.push(`${key}=${value}`);
}

writeFileSync(envPath, `${nextLines.filter((line, index, all) => line || index < all.length - 1).join("\n")}\n`, "utf-8");
console.log(`Updated ${Object.keys(updates).join(", ")} in ${envPath}`);
