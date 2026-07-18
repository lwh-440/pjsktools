process.env.NODE_ENV = "test";
process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
process.env.PJSKTOOLS_SILENT_APP_LOGS = "true";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchSourceImage } from "../src/shareCard.js";

type App = Awaited<ReturnType<typeof import("../src/app.js")["buildApp"]>>;

let app: App;
let eventId: string;
let scoreId: string;
let cardId: string;
let songId: string;

beforeAll(async () => {
  const [{ buildApp }, { getCards, getEvents, getSongs }, { store }] = await Promise.all([
    import("../src/app.js"),
    import("../src/masterData.js"),
    import("../src/store.js")
  ]);
  const event = (await getEvents("jp"))[0];
  if (!event) throw new Error("JP event master data is required for the share-card test");
  eventId = event.id;
  const [card] = await getCards("jp");
  const [song] = await getSongs("jp");
  if (!card || !song) throw new Error("JP card and song master data are required for the share-card test");
  cardId = card.id;
  songId = song.id;
  scoreId = (await store.upsertScore({
    userId: "share-card-test-user",
    region: "jp",
    songId: "1",
    difficulty: "expert",
    clearStatus: "fc",
    score: 987654,
    note: "API share-card rendering test"
  })).id;
  app = await buildApp({
    shareCardProfileResolver: async (region, userId) => ({
      region,
      userId,
      nickname: "Share Card Test Player",
      rank: 321,
      comment: "Public profile source",
      updatedAt: new Date().toISOString(),
      source: "share-card-test-profile"
    })
  });
});

afterAll(async () => {
  await app.close();
});

async function expectMetadataAndPng(type: "profile" | "event" | "score" | "card" | "song", id: string) {
  const metadata = await app.inject({ method: "GET", url: `/api/share/cards/${type}/${id}?region=jp` });
  expect(metadata.statusCode).toBe(200);
  const payload = metadata.json();
  expect(payload).toMatchObject({ type, id, region: "jp", mimeType: "image/png", width: 1200, height: 630 });
  expect(payload.imageUrl).toBe(`/api/share/cards/${type}/${id}.png?region=jp`);
  expect(payload.title).toBeTruthy();
  expect(payload.summary).toBeTruthy();

  const image = await app.inject({ method: "GET", url: payload.imageUrl });
  expect(image.statusCode).toBe(200);
  expect(image.headers["content-type"]).toBe("image/png");
  expect(image.headers["cache-control"]).toContain("max-age=3600");
  expect(image.headers.etag).toBeTruthy();
  expect(image.rawPayload.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
}

describe("share-card image routes", () => {
  it("renders a public player profile without placeholder data", async () => {
    const playerId = "123456789012345678";
    const metadata = await app.inject({ method: "GET", url: `/api/share/cards/profile/${playerId}?region=jp` });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.json()).toMatchObject({
      type: "profile",
      id: playerId,
      title: "Share Card Test Player",
      summary: "玩家等级 321"
    });
    await expectMetadataAndPng("profile", playerId);
  }, 30_000);

  it("returns metadata whose event image URL serves a real PNG", async () => {
    await expectMetadataAndPng("event", eventId);
  }, 30_000);

  it("renders a persisted score instead of invented score data", async () => {
    await expectMetadataAndPng("score", scoreId);
  }, 30_000);

  it("renders card and song share cards offered by the web client", async () => {
    await expectMetadataAndPng("card", cardId);
    await expectMetadataAndPng("song", songId);
  }, 30_000);

  it("rejects unsupported types and missing source IDs", async () => {
    const invalidType = await app.inject({ method: "GET", url: "/api/share/cards/unknown/1?region=jp" });
    const missingMetadata = await app.inject({ method: "GET", url: "/api/share/cards/event/not-an-event?region=jp" });
    const missingImage = await app.inject({ method: "GET", url: "/api/share/cards/score/not-a-score.png?region=jp" });
    expect(invalidType.statusCode).toBe(400);
    expect(missingMetadata.statusCode).toBe(404);
    expect(missingImage.statusCode).toBe(404);
  });
});

describe("share-card source image redirects", () => {
  const image = Buffer.from("89504e470d0a1a0a", "hex");
  const imageResponse = () => new Response(image, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(image.length) }
  });

  it("allows a bounded redirect between trusted HTTPS image hosts", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://storage.exmeaning.com/share/final.png" } }))
      .mockResolvedValueOnce(imageResponse());
    const result = await fetchSourceImage("https://storage.sekai.best/share/start.png", fetchMock);
    expect(result).toEqual(image);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((call) => call[1]?.redirect === "manual")).toBe(true);
  });

  it("rejects a redirect to a non-trusted or downgraded host before requesting it", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
    expect(await fetchSourceImage("https://storage.sekai.best/share/start.png", fetchMock)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects missing locations, userinfo and non-standard HTTPS ports", async () => {
    const missingLocation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302 }));
    expect(await fetchSourceImage("https://storage.sekai.best/share/start.png", missingLocation)).toBeUndefined();
    expect(missingLocation).toHaveBeenCalledTimes(1);

    const userInfo = vi.fn<typeof fetch>();
    const customPort = vi.fn<typeof fetch>();
    expect(await fetchSourceImage("https://user:pass@storage.sekai.best/share.png", userInfo)).toBeUndefined();
    expect(await fetchSourceImage("https://storage.sekai.best:8443/share.png", customPort)).toBeUndefined();
    expect(userInfo).not.toHaveBeenCalled();
    expect(customPort).not.toHaveBeenCalled();
  });

  it("rejects redirect loops", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/share/b.png" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/share/a.png" } }));
    expect(await fetchSourceImage("https://storage.sekai.best/share/a.png", fetchMock)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects redirect chains beyond the configured limit", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    for (let index = 1; index <= 4; index += 1) {
      fetchMock.mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: `https://storage.sekai.best/share/${index}.png` }
      }));
    }
    fetchMock.mockResolvedValueOnce(imageResponse());
    expect(await fetchSourceImage("https://storage.sekai.best/share/start.png", fetchMock)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
