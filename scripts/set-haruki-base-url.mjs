import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const value = process.argv[2]?.trim();
if (!value) {
  console.error("Usage: node scripts/set-haruki-base-url.mjs http://127.0.0.1:9999");
  process.exit(1);
}

let url;
try {
  url = new URL(value);
} catch {
  console.error("HARUKI_API_BASE_URL must be a valid http/https URL.");
  process.exit(1);
}

if (!["http:", "https:"].includes(url.protocol)) {
  console.error("HARUKI_API_BASE_URL must use http or https.");
  process.exit(1);
}

const envPath = path.join(process.cwd(), ".env");
const lines = existsSync(envPath) ? readFileSync(envPath, "utf-8").split(/\r?\n/) : [];
let replaced = false;
const nextLines = lines.map((line) => {
  if (line.trim().startsWith("HARUKI_API_BASE_URL=")) {
    replaced = true;
    return `HARUKI_API_BASE_URL=${url.toString().replace(/\/$/, "")}`;
  }
  return line;
});

if (!replaced) nextLines.push(`HARUKI_API_BASE_URL=${url.toString().replace(/\/$/, "")}`);
writeFileSync(envPath, `${nextLines.filter((line, index, all) => line || index < all.length - 1).join("\n")}\n`, "utf-8");
console.log(`HARUKI_API_BASE_URL=${url.toString().replace(/\/$/, "")}`);
