import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HarukiRequestError, harukiClient, resetHarukiRequestStateForTests } from "./harukiClient.js";

beforeEach(() => {
  process.env.HARUKI_REQUEST_INTERVAL_MS = "0";
  process.env.HARUKI_RATE_LIMIT_COOLDOWN_MS = "60000";
  resetHarukiRequestStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HARUKI_REQUEST_INTERVAL_MS;
  delete process.env.HARUKI_RATE_LIMIT_COOLDOWN_MS;
  resetHarukiRequestStateForTests();
});

describe.sequential("Haruki request controls", () => {
  it("deduplicates identical in-flight profile requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ userId: "990000000000000001", nickname: "real-player" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      harukiClient.getPlayerProfile("jp", "990000000000000001"),
      harukiClient.getPlayerProfile("jp", "990000000000000001")
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("opens a circuit after 429 and avoids another upstream request", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(harukiClient.getPlayerProfile("jp", "990000000000000002")).rejects.toMatchObject({ kind: "rate-limited", status: 429 });
    await expect(harukiClient.getPlayerProfile("en", "990000000000000003")).rejects.toBeInstanceOf(HarukiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
