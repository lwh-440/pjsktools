import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const recommend = vi.hoisted(() => vi.fn(async (_input: any) => ({ recommendedCards: [] })));
vi.mock("./tools.js", async (original) => ({ ...await original<typeof import("./tools.js")>(), recommendDeck: recommend }));

describe("bound deck area-item selection", () => {
  let app: Awaited<ReturnType<typeof import("./app.js")["buildApp"]>>;
  let store: typeof import("./store.js")["store"];
  let userId: string;
  let email: string;
  let bindingId: string;
  let otherBindingId: string;
  let token: string;
  const originalAreas = [{ areaItemId: "one", level: 4 }, { id: "two", areaItemLevel: 7 }, { areaItemId: "unowned", level: 0 }];

  beforeAll(async () => {
    process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
    process.env.PJSKTOOLS_SILENT_APP_LOGS = "true";
    app = await (await import("./app.js")).buildApp();
    store = (await import("./store.js")).store;
    email = `area-selection-${Date.now()}@example.invalid`;
    const user = await store.createUser(email, "Area-selection-password-123!");
    userId = user.id;
    token = app.jwt.sign({ sub: userId });
    bindingId = (await store.addPlayerBinding({ userId, region: "jp", playerUid: "123456789", isDefault: true })).id;
    otherBindingId = (await store.addPlayerBinding({ userId, region: "en", playerUid: "234567890", isDefault: false })).id;
    await store.upsertInventory([{ userId, bindingId, region: "jp", cardId: "1", level: 20 }]);
    await store.upsertInventory([{ userId, bindingId: otherBindingId, region: "en", cardId: "1", level: 20 }]);
    await store.upsertPlayerData({ userId, bindingId, region: "jp", kind: "area-items", data: originalAreas });
    await store.upsertPlayerData({ userId, bindingId: otherBindingId, region: "en", kind: "area-items", data: [{ areaItemId: "foreign", level: 5 }] });
    await store.upsertPlayerData({ userId, bindingId, region: "jp", kind: "character-ranks", data: [{ characterId: "1", rank: 10 }] });
  });
  afterAll(async () => { await store.deleteUserByEmail(email); await app.close(); });
  beforeEach(() => recommend.mockClear());
  const post = (payload: Record<string, unknown>, accessToken = token) => app.inject({ method: "POST", url: "/api/me/tools/deck-recommend", headers: { authorization: `Bearer ${accessToken}` }, payload: { region: "jp", bindingId, ...payload } });

  it("keeps legacy no-selection calls and result shape unchanged", async () => {
    const response = await post({});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ recommendedCards: [] });
    expect(recommend.mock.calls[0][0].playerAssets["area-items"]).toEqual(originalAreas);
  });
  it("passes only selected current levels to the real recommendation boundary without writing store data", async () => {
    const before = structuredClone(await store.listPlayerData(userId, bindingId));
    const response = await post({ selectedAreaItemIds: ["two", "two"] });
    expect(response.statusCode).toBe(200);
    expect(response.json().appliedAreaItemSelection).toEqual({ bindingId, ids: ["two"], levelMode: "current" });
    expect(recommend.mock.calls[0][0].playerAssets).toEqual({ "area-items": [originalAreas[1]], "character-ranks": [{ characterId: "1", rank: 10 }] });
    expect(await store.listPlayerData(userId, bindingId)).toEqual(before);
  });
  it("treats an explicit empty selection as no area-item bonuses", async () => {
    const response = await post({ selectedAreaItemIds: [] });
    expect(response.statusCode).toBe(200);
    expect(recommend.mock.calls[0][0].playerAssets["area-items"]).toEqual([]);
  });
  it("rejects missing, level-zero and other-binding item IDs before recommendation", async () => {
    for (const id of ["missing", "unowned", "foreign"]) expect((await post({ selectedAreaItemIds: [id] })).statusCode).toBe(400);
    expect(recommend).not.toHaveBeenCalled();
  });
  it("requires an owned binding and matching region for every selected calculation", async () => {
    expect((await post({ bindingId: undefined, selectedAreaItemIds: [] })).statusCode).toBe(400);
    expect((await post({ bindingId: otherBindingId, selectedAreaItemIds: [] })).statusCode).toBe(400);
    expect((await post({ selectedAreaItemIds: [] }, app.jwt.sign({ sub: "another-user" }))).statusCode).toBe(404);
    expect(recommend).not.toHaveBeenCalled();
  });
});
