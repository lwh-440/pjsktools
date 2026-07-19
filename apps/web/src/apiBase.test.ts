import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "./apiBase";

describe("resolveApiBaseUrl", () => {
  it("keeps the configured local development API", () => {
    expect(resolveApiBaseUrl("http://127.0.0.1:4000", "http://127.0.0.1:5173")).toBe("http://127.0.0.1:4000");
  });

  it("uses the production API when the production site has no build-time value", () => {
    expect(resolveApiBaseUrl(undefined, "https://sekai-tools.cn/catalog")).toBe("https://api.sekai-tools.cn");
  });

  it("repairs a stale HTTP production build value on the HTTPS site", () => {
    expect(resolveApiBaseUrl("http://192.0.2.10", "https://www.sekai-tools.cn/")).toBe("https://api.sekai-tools.cn");
  });

  it("repairs a stale localhost build value on the HTTPS production site", () => {
    expect(resolveApiBaseUrl("http://127.0.0.1:4000", "https://sekai-tools.cn/")).toBe("https://api.sekai-tools.cn");
  });

  it("keeps the temporary HTTP IP deployment paired with its HTTP API", () => {
    expect(resolveApiBaseUrl("http://192.0.2.10", "http://192.0.2.10/catalog")).toBe("http://192.0.2.10");
  });
});
