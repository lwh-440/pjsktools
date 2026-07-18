import { beforeAll, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
process.env.PJSKTOOLS_SILENT_APP_LOGS = "true";

type App = Awaited<ReturnType<typeof import("../src/app.js")["buildApp"]>>;

let buildApp: typeof import("../src/app.js")["buildApp"];
let normalizeRedirectTo: typeof import("../src/app.js")["normalizeRedirectTo"];

beforeAll(async () => {
  ({ buildApp, normalizeRedirectTo } = await import("../src/app.js"));
});

async function createUser(app: App, email: string) {
  const registration = await app.inject({
    method: "POST",
    url: "/__test/auth/user",
    payload: { email }
  });
  expect(registration.statusCode).toBe(201);
  return registration.json();
}

async function seedHandoff(app: App, input: { handoff: string; kind: "login" | "link"; userId: string; providerUserId: string; expiresAt?: string }) {
  const response = await app.inject({
    method: "POST",
    url: "/__test/auth/qq/handoff",
    payload: { ...input, expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000).toISOString() }
  });
  expect(response.statusCode).toBe(201);
}

describe("QQ mobile handoff", () => {
  it("allowlists only the exact mobile callback URL", () => {
    expect(normalizeRedirectTo("pjsktools://auth/qq")).toBe("mobile-login");
    for (const value of [
      "pjsktools://auth/qq?handoff=attacker",
      "pjsktools://auth/qq/extra",
      "pjsktools://evil/qq",
      "PJSKTOOLS://auth/qq",
      "https://attacker.example/callback"
    ]) expect(normalizeRedirectTo(value)).not.toBe("mobile-login");
  });

  it("issues auth once for a login handoff and rejects replay", async () => {
    const app = await buildApp({ enableTestAuthRoutes: true });
    const auth = await createUser(app, `qq-login-${Date.now()}@example.com`);
    const handoff = "11111111111111111111111111111111";
    await seedHandoff(app, { handoff, kind: "login", userId: auth.user.id, providerUserId: "qq-login-openid" });

    const first = await app.inject({ method: "POST", url: "/api/auth/qq/mobile-exchange", payload: { handoff } });
    expect(first.statusCode).toBe(200);
    expect(first.json().user.id).toBe(auth.user.id);
    expect(first.json().accessToken).toBeTruthy();
    expect(first.json().refreshToken).toBeTruthy();

    const replay = await app.inject({ method: "POST", url: "/api/auth/qq/mobile-exchange", payload: { handoff } });
    expect(replay.statusCode).toBe(401);
    await app.close();
  });

  it("rejects invalid, expired and wrong-kind handoffs", async () => {
    const app = await buildApp({ enableTestAuthRoutes: true });
    const auth = await createUser(app, `qq-invalid-${Date.now()}@example.com`);
    const expired = "22222222222222222222222222222222";
    const linkOnly = "33333333333333333333333333333333";
    await seedHandoff(app, { handoff: expired, kind: "login", userId: auth.user.id, providerUserId: "expired", expiresAt: new Date(Date.now() - 1_000).toISOString() });
    await seedHandoff(app, { handoff: linkOnly, kind: "link", userId: auth.user.id, providerUserId: "link-only" });

    for (const handoff of [expired, linkOnly, "ffffffffffffffffffffffffffffffff"]) {
      const response = await app.inject({ method: "POST", url: "/api/auth/qq/mobile-exchange", payload: { handoff } });
      expect(response.statusCode).toBe(401);
    }
    await app.close();
  });

  it("links only to the authenticated target, consumes once and never switches login", async () => {
    const app = await buildApp({ enableTestAuthRoutes: true });
    const owner = await createUser(app, `qq-owner-${Date.now()}@example.com`);
    const other = await createUser(app, `qq-other-${Date.now()}@example.com`);
    const handoff = "44444444444444444444444444444444";
    await seedHandoff(app, { handoff, kind: "link", userId: owner.user.id, providerUserId: "qq-link-openid" });

    const wrongUser = await app.inject({
      method: "POST", url: "/api/auth/qq/mobile-link/exchange",
      headers: { authorization: `Bearer ${other.accessToken}` }, payload: { handoff }
    });
    expect(wrongUser.statusCode).toBe(401);

    const linked = await app.inject({
      method: "POST", url: "/api/auth/qq/mobile-link/exchange",
      headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { handoff }
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().oauthAccounts).toHaveLength(1);
    expect(linked.json().accessToken).toBeUndefined();
    expect(linked.json().refreshToken).toBeUndefined();

    const replay = await app.inject({
      method: "POST", url: "/api/auth/qq/mobile-link/exchange",
      headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { handoff }
    });
    expect(replay.statusCode).toBe(401);
    await app.close();
  });

  it("rejects linking a QQ identity that belongs to another account", async () => {
    const app = await buildApp({ enableTestAuthRoutes: true });
    const first = await createUser(app, `qq-conflict-a-${Date.now()}@example.com`);
    const second = await createUser(app, `qq-conflict-b-${Date.now()}@example.com`);
    const firstHandoff = "55555555555555555555555555555555";
    const secondHandoff = "66666666666666666666666666666666";
    await seedHandoff(app, { handoff: firstHandoff, kind: "link", userId: first.user.id, providerUserId: "shared-qq-openid" });
    await seedHandoff(app, { handoff: secondHandoff, kind: "link", userId: second.user.id, providerUserId: "shared-qq-openid" });
    expect((await app.inject({
      method: "POST", url: "/api/auth/qq/mobile-link/exchange",
      headers: { authorization: `Bearer ${first.accessToken}` }, payload: { handoff: firstHandoff }
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "POST", url: "/api/auth/qq/mobile-link/exchange",
      headers: { authorization: `Bearer ${second.accessToken}` }, payload: { handoff: secondHandoff }
    })).statusCode).toBe(409);
    await app.close();
  });

  it("does not expose test handoff creation without explicit test opt-in", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/__test/auth/qq/handoff", payload: {} });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
