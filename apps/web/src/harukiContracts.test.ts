import { describe, expect, it } from "vitest";
import {
  normalizeConnection,
  normalizePublicSnapshot,
  normalizeReview
} from "./components/HarukiConnectionCenter";

describe("Haruki Web contract mapping", () => {
  it("uses availableBindings from the connection response", () => {
    const connection = normalizeConnection({
      connected: true,
      oauthConfigured: true,
      status: "active",
      scope: ["game-data:read"],
      availableBindings: [{
        id: "binding-jp",
        bindingKey: "binding-key-jp",
        region: "jp",
        playerUid: "123456789",
        displayName: "Test",
        verified: true
      }]
    });

    expect(connection.availableBindings).toHaveLength(1);
    expect(connection.availableBindings[0]?.id).toBe("binding-jp");
  });

  it("maps the nested sync review and record groups", () => {
    const review = normalizeReview({
      reviewToken: "review-token",
      expiresIn: 600,
      review: {
        upstreamVersion: "suite-v1",
        sourceSummary: { uploadTime: "2026-07-29T10:00:00.000Z" },
        cards: {
          present: true,
          incomingCount: 10,
          addedCount: 2,
          changedCount: 5,
          missingCardsWillBePreserved: true
        },
        groups: {
          materials: {
            present: true,
            incomingCount: 0,
            currentCount: 12,
            emptyRequiresConfirmation: true
          }
        }
      }
    });

    expect(review.reviewToken).toBe("review-token");
    expect(review.cards).toMatchObject({ added: 2, updated: 3, unchanged: 5 });
    expect(review.groups).toEqual([expect.objectContaining({
      kind: "materials",
      itemCount: 0,
      currentCount: 12,
      empty: true
    })]);
  });

  it("maps cards, player data and upstream time from the public snapshot", () => {
    const snapshot = normalizePublicSnapshot({
      snapshot: {
        schemaVersion: 1,
        source: "haruki-public",
        region: "en",
        playerUid: "987654321",
        fetchedAt: "2026-07-29T11:00:00.000Z",
        upstreamUploadedAt: "2026-07-29T10:55:00.000Z",
        profile: { name: "Player", rank: 400 },
        cards: [{ cardId: "1" }, { cardId: "2" }],
        playerData: [
          { kind: "materials", data: [{ materialId: "coin" }] },
          { kind: "challenge-live", data: { characterId: "1" } }
        ],
        completeness: { ready: true }
      }
    }, "en", "987654321");

    expect(snapshot.uploadTime).toBe("2026-07-29T10:55:00.000Z");
    expect(snapshot.inventoryCount).toBe(2);
    expect(snapshot.dataGroups).toEqual([
      { kind: "materials", count: 1, available: true },
      { kind: "challenge-live", count: 1, available: true }
    ]);
  });
});
