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
    expect(document.components.schemas.Pagination.required).toContain("hasNextPage");
    expect(document.components.parameters.IdempotencyKey).toBeTruthy();
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
