import { getCardAssetDetail } from "./assets.js";
import type { RegionId } from "./config.js";
import { getCards } from "./masterData.js";

const hashSourceUrl = "https://storage.sekai.best/sekai-best-assets/chara_hash.json";
let hashCache: { expiresAt: number; entries: Array<[string, string]> } | null = null;
let hashFailure: { retryAt: number; warning: string } | null = null;

async function loadHashes() {
  if (hashCache && hashCache.expiresAt > Date.now()) return hashCache.entries;
  if (hashFailure && hashFailure.retryAt > Date.now()) throw new Error(hashFailure.warning);
  const response = await fetch(hashSourceUrl, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    hashFailure = { retryAt: Date.now() + 10 * 60 * 1000, warning: `Card fingerprint source returned ${response.status}` };
    throw new Error(hashFailure.warning);
  }
  const payload = await response.json();
  const entries = Array.isArray(payload)
    ? payload.filter((row): row is [string, string] => Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string")
    : [];
  hashCache = { entries, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  hashFailure = null;
  return entries;
}

export async function getCardImportManifest(region: RegionId) {
  const cards = await getCards(region);
  let hashes: Array<[string, string]> = [];
  let fingerprintStatus: "matched" | "source-unavailable" = "matched";
  let fingerprintWarning: string | undefined;
  try {
    hashes = await loadHashes();
  } catch (error) {
    fingerprintStatus = "source-unavailable";
    fingerprintWarning = error instanceof Error ? error.message : String(error);
  }
  const hashByName = new Map(hashes.map(([name, hash]) => [name.toLowerCase(), hash]));
  const catalog = cards.map((card) => {
    const assets = getCardAssetDetail(region, card);
    const bundle = card.assetbundleName ?? "";
    const maxByType = new Map<string, number>();
    for (const parameter of card.cardParameters ?? []) {
      const key = String(parameter.cardParameterType ?? "power");
      maxByType.set(key, Math.max(maxByType.get(key) ?? 0, Number(parameter.power ?? 0)));
    }
    const normalName = `${bundle}_normal.webp`;
    const trainedName = `${bundle}_after_training.webp`;
    return {
      cardId: card.id,
      title: card.title,
      characterId: card.characterId,
      character: card.character,
      unit: card.characterUnit ?? card.supportUnit,
      supportUnit: card.supportUnit,
      attribute: card.attribute,
      rarity: card.rarity,
      cardRarityType: card.cardRarityType,
      assetbundleName: bundle,
      maxPower: [...maxByType.values()].reduce((sum, value) => sum + value, 0),
      thumbnails: {
        normal: assets.normalThumbnailUrl,
        afterTraining: assets.afterTrainingThumbnailUrl
      },
      fingerprints: {
        normal: hashByName.get(normalName.toLowerCase()),
        afterTraining: hashByName.get(trainedName.toLowerCase())
      }
    };
  });
  return {
    region,
    catalog,
    fingerprintStatus,
    fingerprintWarning,
    fingerprintSource: {
      url: hashSourceUrl,
      scope: "global-card-art-fingerprint",
      filteredByRegionMaster: true
    },
    realDataRequired: true
  };
}
