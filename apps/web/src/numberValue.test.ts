import { describe, expect, it } from "vitest";
import { finiteNumber } from "./numberValue";

describe("finiteNumber", () => {
  it("keeps real zero while treating missing and nonnumeric values as unknown", () => {
    expect(finiteNumber(0)).toBe(0);
    expect(finiteNumber("0")).toBe(0);
    expect(finiteNumber(null)).toBeNull();
    expect(finiteNumber(undefined)).toBeNull();
    expect(finiteNumber("  ")).toBeNull();
    expect(finiteNumber(false)).toBeNull();
  });
});
