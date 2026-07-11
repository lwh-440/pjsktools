import { getCardImportManifest } from "../apps/api/dist/cardImportManifest.js";

const assetDirs = { jp: "sekai-jp-assets", en: "sekai-en-assets", tw: "sekai-tc-assets", kr: "sekai-kr-assets", cn: "sekai-cn-assets" };
const failures = [];
for (const [region, assetDir] of Object.entries(assetDirs)) {
  const manifest = await getCardImportManifest(region);
  if (manifest.region !== region || !Array.isArray(manifest.catalog) || !manifest.catalog.length) failures.push(`${region}: empty import catalog`);
  for (const card of manifest.catalog.slice(0, 50)) {
    const urls = Object.values(card.thumbnails).filter(Boolean);
    if (!urls.length) failures.push(`${region}:${card.cardId}: thumbnail missing`);
    if (urls.some((url) => !url.includes(`/${assetDir}/`))) failures.push(`${region}:${card.cardId}: cross-region thumbnail`);
    if (!card.title || !card.attribute || card.rarity == null) failures.push(`${region}:${card.cardId}: lookup metadata missing`);
  }
  console.log(`${region}: cards=${manifest.catalog.length} fingerprints=${manifest.catalog.filter((card) => card.fingerprints.normal || card.fingerprints.afterTraining).length} source=${manifest.fingerprintStatus}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Five-region visual inventory/import manifest verification passed.");
