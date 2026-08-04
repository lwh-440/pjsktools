import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
process.env.PJSKTOOLS_SILENT_APP_LOGS = "true";
process.env.PUBLIC_WEB_BASE_URL = "https://sekai-tools.cn";
process.env.QQ_CONNECT_APP_ID = "test-app-id";
process.env.QQ_CONNECT_APP_KEY = "test-app-key";
process.env.QQ_CONNECT_REDIRECT_URI = "https://api.sekai-tools.cn/api/auth/qq/callback";

type App = Awaited<ReturnType<typeof import("../src/app.js")["buildApp"]>>;

let buildApp: typeof import("../src/app.js")["buildApp"];
let normalizeRedirectTo: typeof import("../src/app.js")["normalizeRedirectTo"];

beforeAll(async () => {
  ({ buildApp, normalizeRedirectTo } = await import("../src/app.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function installSuccessfulQqFetch(openId: string) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "upstream-access-token", refresh_token: "upstream-refresh-token", expires_in: 3600 }));
    }
    if (url.pathname.endsWith("/me")) {
      return new Response(JSON.stringify({ client_id: "test-app-id", openid: openId }));
    }
    if (url.pathname.endsWith("/get_user_info")) {
      return new Response(JSON.stringify({ ret: 0, nickname: "QQ test user", figureurl_qq_2: "https://q.qlogo.cn/test.png" }));
    }
    throw new Error(`Unexpected QQ URL: ${url.origin}${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function startWebLogin(app: App, redirectTo = "/me") {
  const response = await app.inject({
    method: "GET",
    url: `/api/auth/qq/start?redirectTo=${encodeURIComponent(redirectTo)}`
  });
  expect(response.statusCode).toBe(200);
  const result = response.json() as { state: string; authorizeUrl: string };
  const authorizeUrl = new URL(result.authorizeUrl);
  expect(authorizeUrl.origin).toBe("https://graph.qq.com");
  expect(authorizeUrl.searchParams.get("client_id")).toBe("test-app-id");
  expect(authorizeUrl.searchParams.get("redirect_uri")).toBe("https://api.sekai-tools.cn/api/auth/qq/callback");
  expect(authorizeUrl.searchParams.get("scope")).toBe("get_user_info");
  expect(authorizeUrl.searchParams.get("state")).toBe(result.state);
  return result;
}

async function createUser(app: App, email: string) {
  const response = await app.inject({ method: "POST", url: "/__test/auth/user", payload: { email } });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("QQ web OAuth", () => {
  it("normalizes redirects to the configured web origin and rejects protocol-relative targets", () => {
    expect(normalizeRedirectTo("/me?tab=qq")).toBe("https://sekai-tools.cn/me?tab=qq");
    expect(normalizeRedirectTo("https://sekai-tools.cn/section/songs")).toBe("https://sekai-tools.cn/section/songs");
    expect(normalizeRedirectTo("//attacker.example/callback")).toBe("https://sekai-tools.cn/");
    expect(normalizeRedirectTo("https://attacker.example/callback")).toBe("https://sekai-tools.cn/");
    expect(normalizeRedirectTo("javascript:alert(1)")).toBe("https://sekai-tools.cn/");
  });

  it("redirects the browser with only a web handoff, exchanges once, and rejects replay", async () => {
    const app = await buildApp({ enableTestAuthRoutes: true });
    installSuccessfulQqFetch(`web-login-${Date.now()}`);
    const start = await startWebLogin(app, "/me?tab=qq");

    const callback = await app.inject({ method: "GET", url: `/api/auth/qq/callback?code=test-code&state=${start.state}` });
    expect(callback.statusCode).toBe(302);
    const location = new URL(callback.headers.location!);
    expect(location.origin).toBe("https://sekai-tools.cn");
    expect(location.pathname).toBe("/auth/qq/callback");
    expect(location.searchParams.get("returnTo")).toBe("/me?tab=qq");
    const handoff = location.searchParams.get("handoff")!;
    expect(handoff).toMatch(/^web_[0-9a-f]{32}$/);
    expect(location.href).not.toContain("upstream-access-token");
    expect(location.href).not.toContain("upstream-refresh-token");
    expect(location.href).not.toContain("test-app-key");

    const mobileAttempt = await app.inject({ method: "POST", url: "/api/auth/qq/mobile-exchange", payload: { handoff } });
    expect(mobileAttempt.statusCode).toBe(401);

    const first = await app.inject({ method: "POST", url: "/api/auth/qq/web-exchange", payload: { handoff } });
    expect(first.statusCode).toBe(200);
    expect(first.json().user.nickname).toBe("QQ test user");
    expect(first.json().user.avatarUrl).toBe("https://q.qlogo.cn/test.png");
    expect(first.json().accessToken).toBeTruthy();
    expect(first.json().refreshToken).toBeUndefined();
    expect(first.headers["set-cookie"]).toContain("HttpOnly");

    const replay = await app.inject({ method: "POST", url: "/api/auth/qq/web-exchange", payload: { handoff } });
    expect(replay.statusCode).toBe(401);
    await app.close();
  });

  it("rejects expired, forged, and mobile handoffs on the web exchange", async () => {
    const app = await buildApp({ enableTestAuthRoutes: true });
    const auth = await createUser(app, `qq-web-expired-${Date.now()}@example.com`);
    const expired = "web_22222222222222222222222222222222";
    await app.inject({
      method: "POST",
      url: "/__test/auth/qq/handoff",
      payload: {
        handoff: expired,
        kind: "login",
        userId: auth.user.id,
        providerUserId: "expired-web-user",
        expiresAt: new Date(Date.now() - 1000).toISOString()
      }
    });

    expect((await app.inject({ method: "POST", url: "/api/auth/qq/web-exchange", payload: { handoff: expired } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/auth/qq/web-exchange", payload: { handoff: "web_ffffffffffffffffffffffffffffffff" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/auth/qq/web-exchange", payload: { handoff: "11111111111111111111111111111111" } })).statusCode).toBe(401);
    await app.close();
  });

  it("consumes state on cancellation and returns a readable, non-sensitive web error", async () => {
    const app = await buildApp();
    const start = await startWebLogin(app, "/section/songs");
    const cancelled = await app.inject({
      method: "GET",
      url: `/api/auth/qq/callback?error=access_denied&error_description=${encodeURIComponent("sensitive upstream detail")}&state=${start.state}`
    });
    expect(cancelled.statusCode).toBe(302);
    const location = new URL(cancelled.headers.location!);
    expect(location.searchParams.get("error")).toBe("qq_authorization_cancelled");
    expect(location.searchParams.get("returnTo")).toBe("/section/songs");
    expect(location.href).not.toContain("sensitive");

    const replay = await app.inject({
      method: "GET",
      url: `/api/auth/qq/callback?error=access_denied&state=${start.state}`
    });
    expect(replay.statusCode).toBe(401);
    await app.close();
  });

  it("converts QQ upstream failures to a safe web error without exposing details", async () => {
    const app = await buildApp();
    const start = await startWebLogin(app);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: 100001, error_description: "provider secret detail" }))));
    const response = await app.inject({ method: "GET", url: `/api/auth/qq/callback?code=bad-code&state=${start.state}` });
    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location!);
    expect(location.searchParams.get("error")).toBe("qq_login_failed");
    expect(location.href).not.toContain("provider");
    expect(location.href).not.toContain("test-app-key");
    await app.close();
  });
});
