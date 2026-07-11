import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { classifyInformationDetail } from "../src/contentData.js";

describe("pjsktools api", () => {
  it("lists supported regions", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/regions" });
    expect(response.statusCode).toBe(200);
    expect(response.json().map((region: { id: string }) => region.id)).toContain("jp");
  });

  it("rejects unsupported regions", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/master/xx/songs" });
    expect(response.statusCode).toBe(400);
  });

  it("classifies JP and CN information details without cross-region URL rules", () => {
    expect(classifyInformationDetail("jp", {
      browseType: "internal",
      path: "/information/index.html?id=notice_123"
    })).toMatchObject({
      detailKind: "jp-static-id",
      embedStatus: "ready",
      staticContentId: "notice_123",
      contentSourceUrl: "https://production-web.sekai.colorfulpalette.org/html/notice_123.html"
    });
    expect(classifyInformationDetail("jp", {
      browseType: "external",
      path: "https://pjsekai.sega.jp/"
    })).toMatchObject({ detailKind: "external", embedStatus: "external-only", detailUrl: "https://pjsekai.sega.jp/" });
    expect(classifyInformationDetail("jp", {
      browseType: "external",
      detailUrl: "https://production-web.sekai.colorfulpalette.org/https://pjsekai.sega.jp/"
    })).toMatchObject({ detailUrl: "https://pjsekai.sega.jp/", embedStatus: "external-only" });

    expect(classifyInformationDetail("cn", {
      browseType: "internal",
      path: "https://lf3-cdn-tos.draftstatic.com/obj/pjsk/example.html"
    })).toMatchObject({ detailKind: "cn-static-url", embedStatus: "ready" });
    expect(classifyInformationDetail("cn", {
      browseType: "external",
      path: "weixin://dl/business/?appid=test"
    })).toMatchObject({ detailKind: "external", embedStatus: "external-only" });
    expect(classifyInformationDetail("cn", {
      browseType: "internal",
      path: "https://example.com/untrusted.html"
    })).toMatchObject({ detailKind: "external", embedStatus: "missing-resource" });
  });

  it("returns a real-data asset config", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/assets/jp/config" });
    expect(response.statusCode).toBe(200);
    expect(response.json().rules.fakeChartPreviewAllowed).toBe(false);
    expect(response.json().sources.moeChartSvg).toContain("charts-new.unipjsk.com");
  });

  it("returns real chart asset urls for music difficulties", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/master/jp/music/1/charts/easy" });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.realDataRequired).toBe(true);
    expect(payload.chartSvgUrl).toBe("https://charts-new.unipjsk.com/moe/svg/1/easy.svg");
    expect(payload.susUrl).toContain("/music/music_score/0001_01/easy.txt");
  }, 20_000);

  it("registers, reads me, refreshes and logs out", async () => {
    const app = await buildApp();
    const email = `user-${Date.now()}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "password123" }
    });
    expect(register.statusCode).toBe(201);
    const auth = register.json();
    expect(auth.accessToken).toBeTruthy();
    expect(auth.refreshToken).toBeTruthy();
    expect(auth.user.email).toBe(email);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${auth.accessToken}` }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);

    const refresh = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: auth.refreshToken }
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().refreshToken).not.toBe(auth.refreshToken);

    const reused = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: auth.refreshToken }
    });
    expect(reused.statusCode).toBe(401);

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refreshToken: refresh.json().refreshToken }
    });
    expect(logout.statusCode).toBe(200);
  });

  it("rejects duplicate registration and invalid login", async () => {
    const app = await buildApp();
    const email = `dup-${Date.now()}@example.com`;
    await app.inject({ method: "POST", url: "/api/auth/register", payload: { email, password: "password123" } });
    const duplicate = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email, password: "password123" } });
    expect(duplicate.statusCode).toBe(409);
    const badLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "wrongpass" } });
    expect(badLogin.statusCode).toBe(401);
  });

  it("returns a clear error when QQ login is not configured", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/auth/qq/start" });
    expect(response.statusCode).toBe(503);
  });

  it("exposes master collections without placeholder planned responses", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/master/jp/gachas" });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.type).toBe("gachas");
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items[0].assets.logoUrl).toContain("/gacha/");
    expect(payload.items[0].assets.imageCandidates.length).toBeGreaterThan(0);
    expect(payload.status).toBeUndefined();
  }, 20_000);

  it("returns asset details and relations for catalog entities", async () => {
    const app = await buildApp();
    const musicAssets = await app.inject({ method: "GET", url: "/api/master/jp/music/1/assets" });
    expect(musicAssets.statusCode).toBe(200);
    expect(musicAssets.json().jacketUrl).toContain("/music/jacket/");

    const cardAssets = await app.inject({ method: "GET", url: "/api/master/jp/cards/1/assets" });
    expect(cardAssets.statusCode).toBe(200);
    expect(cardAssets.json().normalUrl).toContain("/character/member/");

    const musicRelations = await app.inject({ method: "GET", url: "/api/master/jp/music/1/relations" });
    expect(musicRelations.statusCode).toBe(200);
    expect(Array.isArray(musicRelations.json().musicVocals)).toBe(true);
  }, 20_000);

  it("returns full aggregate details for music, cards, events and collection items", async () => {
    const app = await buildApp();
    const music = await app.inject({ method: "GET", url: "/api/master/jp/music/1/full" });
    expect(music.statusCode).toBe(200);
    expect(music.json().assets.jacketUrl).toContain("/music/jacket/");
    expect(Array.isArray(music.json().charts)).toBe(true);
    expect(music.json().realDataRequired).toBe(true);

    const card = await app.inject({ method: "GET", url: "/api/master/jp/cards/1/full" });
    expect(card.statusCode).toBe(200);
    expect(card.json().assets.normalUrl).toContain("/character/member/");
    expect(Array.isArray(card.json().relations.relatedEvents)).toBe(true);

    const event = await app.inject({ method: "GET", url: "/api/master/jp/events/1/full" });
    expect(event.statusCode).toBe(200);
    expect(Array.isArray(event.json().relations.relatedCards)).toBe(true);

    const gacha = await app.inject({ method: "GET", url: "/api/master/jp/gachas/1/full" });
    expect(gacha.statusCode).toBe(200);
    expect(gacha.json().item.assets).toBeTruthy();
    expect(gacha.json().assets.logoUrl).toContain("/gacha/");
    expect(gacha.json().assets.bannerUrl).toContain("/home/banner/banner_gacha1/");

    const honor = await app.inject({ method: "GET", url: "/api/master/jp/honors/1/full" });
    expect(honor.statusCode).toBe(200);
    expect(honor.json().assets.degreeMainUrl).toContain("/honor/");
    expect(honor.json().assets.imageCandidates.length).toBeGreaterThan(0);
  }, 20_000);

  it("calculates score-control and conservative deck recommendations", async () => {
    const app = await buildApp();
    const scoreControl = await app.inject({
      method: "POST",
      url: "/api/tools/score-control",
      payload: { currentPt: 0, targetPt: 100000, remainingMinutes: 120, ptPerRun: 25000 }
    });
    expect(scoreControl.statusCode).toBe(200);
    expect(scoreControl.json().requiredRuns).toBe(4);
    expect(scoreControl.json().realDataRequired).toBe(true);

    const deck = await app.inject({
      method: "POST",
      url: "/api/tools/deck-recommend",
      payload: { region: "jp", ownedCardIds: ["1", "2", "3"] }
    });
    expect(deck.statusCode).toBe(200);
    expect(Array.isArray(deck.json().recommendedCards)).toBe(true);
    expect(deck.json().missingFields.length).toBeGreaterThan(0);
  }, 20_000);
});
