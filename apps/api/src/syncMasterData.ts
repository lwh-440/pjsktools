import { isRegion, regions } from "./config.js";
import { syncAllMasterRegions, syncMasterRegion } from "./masterData.js";
import { syncReferenceMasterRegion } from "./referenceMaster.js";

const target = process.argv[2] ?? "all";

if (target === "reference-all") {
  const results = await Promise.all(regions.map(async (region) => {
    try {
      const manifest = await syncReferenceMasterRegion(region.id);
      return `${region.id}: ${Object.values(manifest.collections).filter((item) => item.count > 0).length} reference collections`;
    } catch (error) {
      return `${region.id}: reference sync failed - ${error instanceof Error ? error.message : String(error)}`;
    }
  }));
  results.forEach((result) => console.log(result));
} else if (target === "all") {
  const results = await syncAllMasterRegions();
  for (const result of results) {
    console.log(result.cache
      ? `${result.region}: ${result.cache.songs.length} songs, ${result.cache.cards.length} cards`
      : `${result.region}: failed - ${result.error}`);
  }
  if (results.every((result) => !result.cache)) process.exitCode = 1;
} else if (target.startsWith("reference-") && isRegion(target.slice("reference-".length))) {
  const region = target.slice("reference-".length) as (typeof regions)[number]["id"];
  const result = await syncReferenceMasterRegion(region);
  console.log(`${region}: ${Object.values(result.collections).filter((item) => item.count > 0).length} reference collections`);
} else if (isRegion(target)) {
  const result = await syncMasterRegion(target);
  console.log(`${result.region}: ${result.songs.length} songs, ${result.cards.length} cards`);
} else {
  const supported = regions.map((region) => region.id).join(", ");
  throw new Error(`Unknown region "${target}". Use one of: all, reference-all, ${supported}, reference-${supported.replaceAll(", ", ", reference-")}`);
}
