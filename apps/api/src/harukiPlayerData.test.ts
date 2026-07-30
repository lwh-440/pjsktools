import { describe, expect, it } from "vitest";
import { normalizeHarukiSuite, publicSnapshot } from "./harukiPlayerData.js";

describe("Haruki Suite normalization", () => {
  it("keeps only strict normalized fields and reports unknown key names without values", () => {
    const candidate = normalizeHarukiSuite("jp", {
      userGamedata: { userIdString: "123456789", name: "Player", rank: 100, secret: "do-not-copy" },
      userCards: [{ cardId: 1, level: 60, masterRank: 5, token: "do-not-copy" }],
      userWorldBloomSupportDecks: [{ eventId: 10, gameCharacterId: 2, member1: 1, rawSecret: "do-not-copy" }],
      unexpectedSecretGroup: { password: "do-not-copy" },
      upload_time: "2026-07-29T00:00:00Z"
    });
    const serialized = JSON.stringify(candidate);
    expect(candidate.sourceSummary.userId).toBe("123456789");
    expect(candidate.sourceSummary.unknownKeys).toEqual(["unexpectedSecretGroup"]);
    expect(serialized).not.toContain("do-not-copy");
    expect(serialized).not.toContain("\"raw\"");
  });

  it("distinguishes missing groups from explicit empty groups", () => {
    const candidate = normalizeHarukiSuite("en", { userCards: [], userMaterials: [] });
    expect(candidate.cardsPresent).toBe(true);
    expect(candidate.playerData).toEqual([{ kind: "materials", data: [] }]);
    const snapshot = publicSnapshot("en", "123456", candidate);
    expect(snapshot.completeness.cardsPresent).toBe(true);
    expect(snapshot.completeness.groups.materials.count).toBe(0);
  });

  it("rejects an invalid group as a whole instead of storing a partial subset", () => {
    const candidate = normalizeHarukiSuite("jp", {
      userMaterials: [
        { materialId: 1, quantity: 10 },
        { materialId: 2, quantity: "not-a-number" }
      ],
      userCharacters: [{ characterId: 1, characterRank: 20 }]
    });
    expect(candidate.playerData).toEqual([
      { kind: "character-ranks", data: [{ characterId: "1", rank: 20 }] }
    ]);
    expect(candidate.invalidGroups).toEqual(["materials"]);
  });

  it("does not silently truncate oversized text, arrays, or numeric ranges", () => {
    const candidate = normalizeHarukiSuite("jp", {
      userCards: [{ cardId: 1, level: 101 }],
      userGamedata: { name: "Player" }
    });
    expect(candidate.cardsPresent).toBe(false);
    expect(candidate.cards).toEqual([]);
    expect(candidate.invalidGroups).toContain("cards");
    expect(() => normalizeHarukiSuite("jp", {
      userGamedata: { name: "x".repeat(501) }
    })).toThrow("text-too-long");
  });

  it("uses a fully normalized array representation for every Public data group", () => {
    const snapshot = publicSnapshot("jp", "123456", normalizeHarukiSuite("jp", {
      userChallengeLiveSoloDecks: [],
      userChallengeLiveSoloResults: []
    }));
    expect(snapshot.playerData).toEqual([
      {
        kind: "challenge-live",
        data: [{
          characterId: undefined,
          cardIds: [],
          highScore: undefined,
          stageCount: 0,
          claimedHighScoreRewardCount: 0
        }]
      }
    ]);
  });
});
