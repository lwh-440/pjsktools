import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.sequential("public API contracts", () => {
  let app: Awaited<ReturnType<typeof import("./app.js")["buildApp"]>>;
  let store: typeof import("./store.js")["store"];
  let token = "";
  let userId = "";

  beforeAll(async () => {
    process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
    process.env.PJSKTOOLS_SILENT_APP_LOGS = "true";
    const appModule = await import("./app.js");
    const storeModule = await import("./store.js");
    store = storeModule.store;
    app = await appModule.buildApp();
    const user = await store.createUser(`contract-${Date.now()}@example.com`, "Contract123!");
    userId = user.id;
    token = app.jwt.sign({ sub: user.id, email: user.email, tokenType: "access" });
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      const user = await store.getUser(userId);
      if (user?.email) await store.deleteUserByEmail(user.email);
    }
    await app.close();
  });

  it("publishes a complete OpenAPI route inventory", async () => {
    const response = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/api/share/cards/{type}/{id}.png"].get).toBeTruthy();
    expect(document.components.schemas.SongPage.required).toContain("hasNextPage");
    expect(document.paths["/api/master/{region}/catalogs/songs"].get.operationId).toBe("getSongCatalog");
    expect(document.paths["/api/master/{region}/catalogs/cards"].get.operationId).toBe("getCardCatalog");
    expect(document.paths["/api/master/{region}/catalogs/events"].get.operationId).toBe("getEventCatalog");
    expect(document.components.schemas.CardPage.properties.filterMeta.$ref).toContain("CatalogFilterMeta");
    expect(document.paths["/api/me/favorite-folders"].get.operationId).toBe("getFavoriteFolders");
    expect(document.paths["/api/me/favorites"].get.responses["200"].content["application/json"].schema.$ref).toContain("FavoritePage");
    expect(document.components.schemas.AssetCandidates.properties.normalThumbnailCandidates.items.type).toBe("string");
    expect(document.components.schemas.AssetCandidates.properties.afterTrainingThumbnailCandidates.items.type).toBe("string");
    expect(JSON.stringify(document.components.schemas.SongSummary.properties.publishedAt)).toContain("date-time");
    expect(JSON.stringify(document.components.schemas.ChartDetail.properties.sekaiViewerChartSvgUrl)).toContain("string");
    expect(document.paths["/api/assets/resolve"].get.operationId).toBe("resolveAsset");
    expect(document.paths["/api/assets/resolve"].get.responses["200"].content["image/*"]).toBeTruthy();
    expect(document.components.schemas.CardSkill.properties.formattedDescriptions.properties).toMatchObject({
      "1": { type: "string" }, "2": { type: "string" }, "3": { type: "string" }, "4": { type: "string" }
    });
    expect(document.components.schemas.CardDetail.properties.relations.properties.relatedEvents.items.additionalProperties).toBeUndefined();
    const catalogOperations = {
      gachas: "getGachaCatalog", honors: "getHonorCatalog", materials: "getMaterialCatalog",
      costumes: "getCostumeCatalog", stamps: "getStampCatalog", comics: "getComicCatalog"
    };
    for (const [type, operationId] of Object.entries(catalogOperations)) {
      expect(document.paths[`/api/master/{region}/catalogs/${type}`].get.operationId).toBe(operationId);
      expect(document.paths[`/api/master/{region}/catalogs/${type}/{itemId}`].get.operationId).toBe(`${operationId}Item`);
      const schemaName = `${operationId.slice(3, -7)}Page`;
      expect(document.components.schemas[schemaName].properties.items.items.additionalProperties).toBeUndefined();
    }
    expect(document.components.parameters.IdempotencyKey).toBeTruthy();
    const gachaSort = document.paths["/api/master/{region}/catalogs/gachas"].get.parameters.find((parameter: any) => parameter.name === "sort");
    expect(gachaSort.schema.enum).toEqual(expect.arrayContaining(["start-asc", "start-desc"]));
  });

  it("allows every upstream chart host emitted by song details", async () => {
    const { isAllowedExternalAssetUrl } = await import("./externalData.js");
    expect(isAllowedExternalAssetUrl("https://charts-new.unipjsk.com/moe/svg/710/master.svg")).toBe(true);
    expect(isAllowedExternalAssetUrl("https://storage.sekai.best/sekai-music-charts/jp/0710/master.svg")).toBe(true);
  });

  it("renders an actual PNG share card", async () => {
    const response = await app.inject({ method: "GET", url: "/api/share/cards/score/test-score.png?region=jp" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.rawPayload.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(response.headers.etag).toBeTruthy();
  }, 20_000);

  it("uses the uniform pagination envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/api/events/jp/none/ranking-top100?page=1&pageSize=12" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], page: 1, pageSize: 12, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
  });

  it("publishes concrete Android milestone catalogs", async () => {
    const [songs, cards, events] = await Promise.all([
      app.inject({ method: "GET", url: "/api/master/jp/catalogs/songs?page=1&pageSize=2&q=test&unit=piapro" }),
      app.inject({ method: "GET", url: "/api/master/jp/catalogs/cards?page=1&pageSize=2&rarity=4&attribute=cool" }),
      app.inject({ method: "GET", url: "/api/master/jp/catalogs/events?page=1&pageSize=2" })
    ]);
    for (const response of [songs, cards, events]) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        page: 1, pageSize: 2, hasNextPage: expect.any(Boolean), hasPreviousPage: expect.any(Boolean),
        filterMeta: { groups: expect.any(Array) }, appliedFilters: expect.any(Object)
      });
    }
  }, 30_000);

  it("keeps facet options visible when filtering their own dimension", async () => {
    const initial = await app.inject({ method: "GET", url: "/api/master/jp/catalogs/cards?page=1&pageSize=2" });
    expect(initial.statusCode).toBe(200);
    const group = initial.json().filterMeta.groups.find((item: any) => item.options.length > 1);
    if (!group) return;
    const selected = group.options[0].value;
    const filtered = await app.inject({ method: "GET", url: `/api/master/jp/catalogs/cards?page=1&pageSize=2&${group.key}=${encodeURIComponent(selected)}` });
    expect(filtered.statusCode).toBe(200);
    const nextGroup = filtered.json().filterMeta.groups.find((item: any) => item.key === group.key);
    expect(nextGroup.options.length).toBeGreaterThan(1);
    expect(filtered.json().appliedFilters[group.key]).toContain(String(selected));
  }, 30_000);

  it("publishes typed Android collection catalogs without raw payloads", async () => {
    const types = ["gachas", "honors", "materials", "costumes", "stamps", "comics"];
    const responses = await Promise.all(types.map((type) => app.inject({ method: "GET", url: `/api/master/jp/catalogs/${type}?page=1&pageSize=1` })));
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload).toMatchObject({ region: "jp", page: 1, pageSize: 1, hasNextPage: expect.any(Boolean), hasPreviousPage: expect.any(Boolean) });
      for (const item of payload.items) {
        expect(item.raw).toBeUndefined();
        expect(item.assets.imageCandidates.every((url: string) => url.startsWith("/api/assets/proxy"))).toBe(true);
      }
    }
  }, 120_000);

  it("keeps typed collection versions stable across requests and pages", async () => {
    const first = await app.inject({ method: "GET", url: "/api/master/en/catalogs/costumes?page=1&pageSize=100" });
    const second = await app.inject({ method: "GET", url: "/api/master/en/catalogs/costumes?page=2&pageSize=100" });
    const repeated = await app.inject({ method: "GET", url: "/api/master/en/catalogs/costumes?page=1&pageSize=100" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(repeated.statusCode).toBe(200);
    expect(second.json().masterVersion).toBe(first.json().masterVersion);
    expect(repeated.json().masterVersion).toBe(first.json().masterVersion);
  }, 60_000);

  it("changes a typed collection version only when its content changes", async () => {
    const { stableCatalogMasterVersion } = await import("./masterData.js");
    const initial = [{ id: "1", name: "First", raw: { rarity: 1, nested: { b: 2, a: 1 } } }];
    const reordered = [{ id: "1", name: "First", raw: { nested: { a: 1, b: 2 }, rarity: 1 } }];
    const changed = [{ id: "1", name: "Updated", raw: { rarity: 1, nested: { a: 1, b: 2 } } }];

    expect(stableCatalogMasterVersion("costumes", reordered)).toBe(stableCatalogMasterVersion("costumes", initial));
    expect(stableCatalogMasterVersion("costumes", changed)).not.toBe(stableCatalogMasterVersion("costumes", initial));
  });

  it("replays idempotent writes and rejects payload changes", async () => {
    const headers = { authorization: `Bearer ${token}`, "idempotency-key": "contract-favorite-1" };
    const payload = { type: "card", region: "jp", targetId: "1", label: "Favorite" };
    const [first, replay] = await Promise.all([
      app.inject({ method: "POST", url: "/api/me/favorites", headers, payload }),
      app.inject({ method: "POST", url: "/api/me/favorites", headers, payload })
    ]);
    const conflict = await app.inject({ method: "POST", url: "/api/me/favorites", headers, payload: { ...payload, targetId: "2" } });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect([first.headers["idempotency-replayed"], replay.headers["idempotency-replayed"]]).toContain("true");
    expect(replay.json().id).toBe(first.json().id);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("creates folders, merges duplicate favorite targets, and preserves unfiled favorites", async () => {
    const authorization = { authorization: `Bearer ${token}` };
    const firstFolder = await app.inject({
      method: "POST", url: "/api/me/favorite-folders",
      headers: { ...authorization, "idempotency-key": "folder-create-first" },
      payload: { name: "Main" }
    });
    const secondFolder = await app.inject({
      method: "POST", url: "/api/me/favorite-folders",
      headers: { ...authorization, "idempotency-key": "folder-create-second" },
      payload: { name: "Later" }
    });
    expect(firstFolder.statusCode).toBe(200);
    expect(secondFolder.statusCode).toBe(200);

    const payload = { type: "song", region: "jp", targetId: "1", folderIds: [firstFolder.json().id] };
    const first = await app.inject({
      method: "POST", url: "/api/me/favorites",
      headers: { ...authorization, "idempotency-key": "favorite-folder-first" }, payload
    });
    const merged = await app.inject({
      method: "POST", url: "/api/me/favorites",
      headers: { ...authorization, "idempotency-key": "favorite-folder-second" },
      payload: { ...payload, folderIds: [secondFolder.json().id] }
    });
    expect(merged.statusCode).toBe(200);
    expect(merged.json().id).toBe(first.json().id);
    expect(merged.json().folderIds).toEqual(expect.arrayContaining([firstFolder.json().id, secondFolder.json().id]));

    const unfiled = await app.inject({
      method: "PATCH", url: `/api/me/favorites/${first.json().id}`,
      headers: { ...authorization, "idempotency-key": "favorite-unfiled" }, payload: { folderIds: [] }
    });
    expect(unfiled.statusCode).toBe(200);
    expect(unfiled.json().folderIds).toEqual([]);
    const listing = await app.inject({ method: "GET", url: "/api/me/favorites?unfiled=true&pageSize=100", headers: authorization });
    expect(listing.json().items.map((item: any) => item.id)).toContain(first.json().id);
  }, 30_000);

  it("bulk-organizes favorites and rejects folders owned by another user", async () => {
    const authorization = { authorization: `Bearer ${token}` };
    const folder = await app.inject({
      method: "POST", url: "/api/me/favorite-folders",
      headers: { ...authorization, "idempotency-key": "folder-bulk" }, payload: { name: "Bulk" }
    });
    const favorites = await app.inject({ method: "GET", url: "/api/me/favorites?pageSize=100", headers: authorization });
    const ids = favorites.json().items.slice(0, 2).map((item: any) => item.id);
    const bulk = await app.inject({
      method: "PATCH", url: "/api/me/favorites/bulk",
      headers: { ...authorization, "idempotency-key": "favorite-bulk-add" },
      payload: { favoriteIds: ids, folderIds: [folder.json().id], mode: "add" }
    });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json().every((item: any) => item.folderIds.includes(folder.json().id))).toBe(true);

    const other = await store.createUser(`contract-other-${Date.now()}@example.com`, "Contract123!");
    try {
      const otherToken = app.jwt.sign({ sub: other.id, email: other.email, tokenType: "access" });
      const rejected = await app.inject({
        method: "PATCH", url: `/api/me/favorites/${ids[0]}`,
        headers: { authorization: `Bearer ${otherToken}`, "idempotency-key": "cross-user-folder" },
        payload: { folderIds: [folder.json().id] }
      });
      expect(rejected.statusCode).toBe(404);
    } finally {
      if (other.email) await store.deleteUserByEmail(other.email);
    }
  }, 30_000);

  it("rejects stale optimistic-concurrency versions", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/me/scores",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "contract-score-create" },
      payload: { region: "jp", songId: "1", difficulty: "easy", clearStatus: "clear", score: 100 }
    });
    expect(create.headers.etag).toBeTruthy();
    const update = await app.inject({
      method: "PATCH",
      url: `/api/me/scores/${create.json().id}`,
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "contract-score-update", "if-match": '"stale"' },
      payload: { region: "jp", songId: "1", difficulty: "easy", clearStatus: "clear", score: 101 }
    });
    expect(update.statusCode).toBe(412);
    expect(update.json().code).toBe("VERSION_CONFLICT");
    expect(update.json().currentVersion).toBe(create.headers.etag);
  });
});
