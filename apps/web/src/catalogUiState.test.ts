import { describe, expect, it } from "vitest";
import { resolveCatalogUiState } from "./catalogUiState";

describe("resolveCatalogUiState", () => {
  it("keeps a not-yet-loaded catalog out of the empty state", () => {
    expect(resolveCatalogUiState({ status: "idle" })).toBe("loading");
    expect(resolveCatalogUiState({ status: "loading", itemCount: 0 })).toBe("loading");
  });

  it("only presents empty after a successful response", () => {
    expect(resolveCatalogUiState({ status: "ready", itemCount: 0 })).toBe("empty");
    expect(resolveCatalogUiState({ status: "ready", itemCount: 3 })).toBe("ready");
    expect(resolveCatalogUiState({ status: "error" })).toBe("error");
  });
});
