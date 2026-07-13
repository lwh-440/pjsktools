import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { HarukiProfileRequestError, harukiClient } from "./harukiClient.js";
import { store } from "./store.js";

const createdEmails: string[] = [];

async function register(app: Awaited<ReturnType<typeof buildApp>>, prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  createdEmails.push(email);
  const code = "123456";
  await store.createEmailVerificationCode({ email, purpose: "register", code, expiresAt: new Date(Date.now() + 300_000).toISOString() });
  const response = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email, password: "Password123!", code } });
  expect(response.statusCode).toBe(201);
  return { email, token: response.json().accessToken as string };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const email of createdEmails.splice(0)) await store.deleteUserByEmail(email);
});

describe("public player profile failures", () => {
  it("reports an expected missing upload as 404 for read, refresh, and binding refresh", async () => {
    vi.spyOn(harukiClient, "getPlayerProfile").mockRejectedValue(new HarukiProfileRequestError("not-found", 404));
    const app = await buildApp();
    const uid = "990000000000000001";
    try {
      const read = await app.inject({ method: "GET", url: `/api/players/jp/${uid}/profile` });
      const refresh = await app.inject({ method: "POST", url: `/api/players/jp/${uid}/refresh` });
      expect(read.statusCode).toBe(404);
      expect(refresh.statusCode).toBe(404);
      expect(read.json().message).toContain("not in the public database");

      const account = await register(app, "missing-profile");
      const bindingResponse = await app.inject({
        method: "POST",
        url: "/api/me/player-bindings",
        headers: { authorization: `Bearer ${account.token}` },
        payload: { region: "jp", playerUid: uid, isDefault: true }
      });
      expect(bindingResponse.statusCode).toBe(200);
      const bindingRefresh = await app.inject({
        method: "POST",
        url: `/api/me/player-bindings/${bindingResponse.json().id}/refresh-public-profile`,
        headers: { authorization: `Bearer ${account.token}` }
      });
      expect(bindingRefresh.statusCode).toBe(404);
      expect(bindingRefresh.json().message).toContain("not in the public database");
    } finally {
      await app.close();
    }
  });

  it("maps rate limits and network failures to 503 and rejects malformed UIDs", async () => {
    const profile = vi.spyOn(harukiClient, "getPlayerProfile")
      .mockRejectedValueOnce(new HarukiProfileRequestError("rate-limited", 429))
      .mockRejectedValueOnce(new HarukiProfileRequestError("network-error"));
    const app = await buildApp();
    try {
      const rateLimited = await app.inject({ method: "GET", url: "/api/players/jp/990000000000000002/profile" });
      const networkFailure = await app.inject({ method: "GET", url: "/api/players/jp/990000000000000003/profile" });
      const malformed = await app.inject({ method: "GET", url: "/api/players/jp/not-a-uid/profile" });
      expect(rateLimited.statusCode).toBe(503);
      expect(networkFailure.statusCode).toBe(503);
      expect(malformed.statusCode).toBe(400);
      expect(profile).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });

  it("keeps successful cache entries after a failed refresh and isolates regions", async () => {
    const uid = "990000000000000004";
    const profile = vi.spyOn(harukiClient, "getPlayerProfile").mockImplementation(async (region, userId) => ({
      region,
      userId,
      nickname: `${region}-player`,
      rank: region === "jp" ? 100 : 200,
      source: "test-source"
    }));
    const app = await buildApp();
    try {
      const jp = await app.inject({ method: "GET", url: `/api/players/jp/${uid}/profile` });
      const en = await app.inject({ method: "GET", url: `/api/players/en/${uid}/profile` });
      expect(jp.json().nickname).toBe("jp-player");
      expect(en.json().nickname).toBe("en-player");
      expect(profile).toHaveBeenCalledTimes(2);

      profile.mockRejectedValue(new HarukiProfileRequestError("network-error"));
      const failedRefresh = await app.inject({ method: "POST", url: `/api/players/jp/${uid}/refresh` });
      const cached = await app.inject({ method: "GET", url: `/api/players/jp/${uid}/profile` });
      expect(failedRefresh.statusCode).toBe(503);
      expect(cached.statusCode).toBe(200);
      expect(cached.json().nickname).toBe("jp-player");
      expect(profile).toHaveBeenCalledTimes(3);
    } finally {
      await app.close();
    }
  });
});
