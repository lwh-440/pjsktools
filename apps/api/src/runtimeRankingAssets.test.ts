import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./masterData.js", () => ({
  getCards: vi.fn(),
  requestRankingAssetMasterSync: vi.fn()
}));

import { getCards, requestRankingAssetMasterSync } from "./masterData.js";
import { enrichRankingAssets } from "./runtimeData.js";
import type { RegionId } from "./config.js";
import type { RealtimeRankingEntry } from "./realtimeRankingClient.js";

const regions: RegionId[] = ["jp", "en", "tw", "kr", "cn"];

function rankingEntry(region: RegionId, leaderCardId = 100): RealtimeRankingEntry {
  return {
    rank: 1,
    score: 123456,
    region,
    eventId: "1",
    updatedAt: "2026-07-15T00:00:00.000Z",
    source: "test",
    leaderCardId,
    leaderCardDefaultImage: "original"
  };
}

describe("ranking leader assets", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const region of regions) {
    it(`keeps ${region} leader card candidates in the same region`, async () => {
      vi.mocked(getCards).mockResolvedValue([{
        id: "100",
        characterId: "1",
        character: "Test Character",
        title: "Test Card",
        rarity: 4,
        attribute: "cool",
        assets: {
          normalThumbnailCandidates: [
            `https://storage.exmeaning.com/sekai-${region}-assets/thumbnail/chara/test_normal.webp`
          ]
        }
      }]);

      const [entry] = await enrichRankingAssets(region, [rankingEntry(region)]);

      expect(entry.leaderAssetStatus).toBe("matched");
      expect(entry.leaderCardImageCandidates).toEqual([
        `https://storage.exmeaning.com/sekai-${region}-assets/thumbnail/chara/test_normal.webp`
      ]);
      expect(entry.leaderCardImageCandidates?.every((url) => url.includes(`sekai-${region}-assets`))).toBe(true);
      expect(requestRankingAssetMasterSync).not.toHaveBeenCalled();
    });
  }

  it("requests a same-region master refresh for an unknown leader card", async () => {
    vi.mocked(getCards).mockResolvedValue([]);

    const [entry] = await enrichRankingAssets("cn", [rankingEntry("cn", 1422)]);

    expect(entry.leaderAssetStatus).toBe("card-master-missing");
    expect(entry.leaderCardImageCandidates).toEqual([]);
    expect(requestRankingAssetMasterSync).toHaveBeenCalledOnce();
    expect(requestRankingAssetMasterSync).toHaveBeenCalledWith("cn");
  });
});
