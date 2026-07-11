import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMasterRegionStatus } from "../apps/api/dist/masterData.js";

const regions = ["jp", "en", "tw", "kr", "cn"];
const expectedSchemaVersion = 16;
const allowedStatuses = new Set(["available", "available-empty", "not-released", "source-unavailable", "cache-stale"]);
const failures = [];
const matrix = {};

for (const region of regions) {
  const cachePath = path.resolve("apps", "api", "data", "master-cache", `${region}.json`);
  let cache;
  try {
    cache = JSON.parse(await readFile(cachePath, "utf-8"));
  } catch (error) {
    failures.push(`${region}: master cache is missing or invalid JSON (${error.message})`);
    continue;
  }
  if (cache.region !== region) failures.push(`${region}: cache contains region ${cache.region}`);
  if (cache.schemaVersion !== expectedSchemaVersion) failures.push(`${region}: schema ${cache.schemaVersion}, expected ${expectedSchemaVersion}`);
  const status = await getMasterRegionStatus(region);
  for (const [key, health] of Object.entries(status.referenceMaster.collections)) {
    if (!allowedStatuses.has(health.status)) failures.push(`${region}:${key}: unknown reference status ${health.status}`);
    if (!health.sourceUrl.includes(`/${region}/`)) failures.push(`${region}:${key}: cross-region reference source ${health.sourceUrl}`);
  }
  for (const [key, health] of Object.entries(status.sourceHealth.collections)) {
    if (!allowedStatuses.has(health.status)) failures.push(`${region}:${key}: unknown collection status ${health.status}`);
    if (health.scope !== "global-reference-constant" && /metadata\.exmeaning\.com\/(jp|en|tw|kr|cn)\//.test(health.source) && !health.source.includes(`/${region}/`)) {
      failures.push(`${region}:${key}: cross-region collection source ${health.source}`);
    }
  }
  for (const [name, capability] of Object.entries(status.formulaCapabilities)) {
    if (!capability.status) failures.push(`${region}:${name}: capability status is missing`);
    if (capability.status === "matched" && (capability.referenceMissing.length || capability.collectionMissing.length)) {
      failures.push(`${region}:${name}: matched with missing collections`);
    }
  }
  matrix[region] = {
    schemaVersion: status.schemaVersion,
    referenceMaster: status.referenceMaster.status,
    formulaCapabilities: Object.fromEntries(Object.entries(status.formulaCapabilities).map(([name, value]) => [name, value.status])),
    staleCollections: status.staleCollections,
    unavailableCollections: status.unavailableCollections
  };
}

console.log(JSON.stringify({ regions: matrix }, null, 2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Five-region master verification passed.");
