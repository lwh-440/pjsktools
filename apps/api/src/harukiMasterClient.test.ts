import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previousEnv = {
  base: process.env.HARUKI_MASTER_BASE_URL,
  token: process.env.HARUKI_MASTER_TOKEN,
  timeout: process.env.HARUKI_MASTER_TIMEOUT_MS
};

beforeEach(() => {
  vi.resetModules();
  process.env.HARUKI_MASTER_BASE_URL = "https://haruki.test";
  process.env.HARUKI_MASTER_TOKEN = "";
  process.env.HARUKI_MASTER_TIMEOUT_MS = "1000";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  for (const [key, value] of Object.entries({
    HARUKI_MASTER_BASE_URL: previousEnv.base,
    HARUKI_MASTER_TOKEN: previousEnv.token,
    HARUKI_MASTER_TIMEOUT_MS: previousEnv.timeout
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Haruki master registry client", () => {
  it("resolves manifest files through immutable sha256 blobs", async () => {
    const digest = "a".repeat(64);
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/v1/master/jp/current")) {
        return new Response(JSON.stringify({
          server: "jp",
          dataVersion: "5.6.1.11",
          files: [{ name: "cards.json", size: 10, sha256: digest }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith(`/v1/master/jp/blob/${digest}`)) {
        return new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("missing", { status: 404 });
    }));

    const { fetchHarukiMasterJson } = await import("./harukiMasterClient.js");
    const result = await fetchHarukiMasterJson<Array<{ id: number }>>("jp", ["master/cards.json"]);

    expect(result.value).toEqual([{ id: 1 }]);
    expect(result.fileName).toBe("cards.json");
    expect(result.digest).toBe(digest);
    expect(result.manifestDataVersion).toBe("5.6.1.11");
    expect(requested).toEqual([
      "https://haruki.test/v1/master/jp/current",
      `https://haruki.test/v1/master/jp/blob/${digest}`
    ]);
  });

  it("falls back to the mutable files endpoint when no manifest is published", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v1/master/jp/current")) return new Response("missing", { status: 404 });
      if (url.endsWith("/v1/master/jp/files/events.json")) {
        return new Response(JSON.stringify([{ id: 210 }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("missing", { status: 404 });
    }));

    const { fetchHarukiMasterJson } = await import("./harukiMasterClient.js");
    const result = await fetchHarukiMasterJson<Array<{ id: number }>>("jp", ["master/events.json"]);

    expect(result.value).toEqual([{ id: 210 }]);
    expect(result.sourceUrl).toBe("https://haruki.test/v1/master/jp/files/events.json");
  });

  it("uses the dedicated Haruki music_metas endpoint and forwards the registry token", async () => {
    process.env.HARUKI_MASTER_TOKEN = "registry-token";
    const headers: Array<Record<string, string>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      headers.push((init?.headers ?? {}) as Record<string, string>);
      const url = String(input);
      if (url.endsWith("/v1/master/jp/current")) {
        return new Response(JSON.stringify({ server: "jp", files: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/v1/metas/jp/music_metas.json")) {
        return new Response(JSON.stringify([{ music_id: 1, bpm: 120 }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("missing", { status: 404 });
    }));

    const { fetchHarukiMasterJson } = await import("./harukiMasterClient.js");
    const result = await fetchHarukiMasterJson<Array<{ music_id: number; bpm: number }>>("jp", ["master/musicMetas.json"]);

    expect(result.value).toEqual([{ music_id: 1, bpm: 120 }]);
    expect(result.sourceUrl).toBe("https://haruki.test/v1/metas/jp/music_metas.json");
    expect(headers.every((value) => value.Authorization === "Bearer registry-token")).toBe(true);
  });
});
