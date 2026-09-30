import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReference, getReferenceMaster } from "./referenceMaster.js";
import { config } from "./config.js";
import { resetHarukiMasterClientStateForTests } from "./harukiMasterClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reference master loading", () => {
  it("deduplicates concurrent cold loads for the same region and collection", async () => {
    const results = await Promise.all(Array.from({ length: 32 }, () => getReferenceMaster("kr", "eventHonorBonuses")));
    expect(results.every((rows) => rows === results[0])).toBe(true);
  });

  it("falls back from both metadata sources to the same-region Team-Haruki raw source", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("raw.githubusercontent.com")) {
        return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }));

    const result = await fetchReference("en", "eventHonorBonuses");

    expect(requested).toEqual([
      "https://metadata.exmeaning.com/en/master/eventHonorBonuses.json",
      "https://metadata.pjsk.moe/en/master/eventHonorBonuses.json",
      "https://raw.githubusercontent.com/Team-Haruki/haruki-sekai-en-master/main/master/eventHonorBonuses.json"
    ]);
    expect(result).toMatchObject({ status: "available", rows: [{ id: 1 }], sourceUrl: requested[2] });
  });

  it("does not fall back to legacy sources when configured Haruki returns 503", async () => {
    const previousBaseUrl = config.harukiMasterBaseUrl;
    config.harukiMasterBaseUrl = "https://master.test";
    resetHarukiMasterClientStateForTests();
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/v1/master/en/current")) return new Response(JSON.stringify({ files: [] }), { status: 200 });
      return new Response("upstream unavailable", { status: 503 });
    }));

    try {
      const result = await fetchReference("en", "eventHonorBonuses");
      expect(result.status).toBe("source-unavailable");
      expect(result.error).toContain("HTTP 503");
      expect(requested).toEqual([
        "https://master.test/v1/master/en/current",
        "https://master.test/v1/master/en/files/eventHonorBonuses.json"
      ]);
      expect(requested.some((url) => url.includes("metadata.exmeaning") || url.includes("raw.githubusercontent"))).toBe(false);
    } finally {
      config.harukiMasterBaseUrl = previousBaseUrl;
      resetHarukiMasterClientStateForTests();
    }
  });

  it("does not fall back to legacy sources when configured Haruki has a network failure", async () => {
    const previousBaseUrl = config.harukiMasterBaseUrl;
    config.harukiMasterBaseUrl = "https://master.test";
    resetHarukiMasterClientStateForTests();
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requested.push(String(input));
      throw new Error("connection reset");
    }));

    try {
      const result = await fetchReference("en", "eventHonorBonuses");
      expect(result.status).toBe("source-unavailable");
      expect(result.error).toContain("connection reset");
      expect(requested).toEqual([
        "https://master.test/v1/master/en/current",
        "https://master.test/v1/master/en/files/eventHonorBonuses.json"
      ]);
    } finally {
      config.harukiMasterBaseUrl = previousBaseUrl;
      resetHarukiMasterClientStateForTests();
    }
  });
});
