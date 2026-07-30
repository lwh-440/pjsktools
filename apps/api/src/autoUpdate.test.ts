import { describe, expect, it } from "vitest";
import { safeBackgroundError } from "./autoUpdate.js";

describe("background error redaction", () => {
  it("does not include nested error payloads or tokens", () => {
    const safe = safeBackgroundError({ name: "UpstreamError", code: "HARUKI_UPSTREAM", token: "secret", response: { suite: "raw" } });
    expect(safe).toEqual({ category: "HARUKI_UPSTREAM", statusCode: undefined });
    expect(JSON.stringify(safe)).not.toContain("secret");
    expect(JSON.stringify(safe)).not.toContain("raw");
  });
});
