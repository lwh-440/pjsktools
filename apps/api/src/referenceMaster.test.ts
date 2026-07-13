import { describe, expect, it } from "vitest";
import { getReferenceMaster } from "./referenceMaster.js";

describe("reference master loading", () => {
  it("deduplicates concurrent cold loads for the same region and collection", async () => {
    const results = await Promise.all(Array.from({ length: 32 }, () => getReferenceMaster("kr", "eventHonorBonuses")));
    expect(results.every((rows) => rows === results[0])).toBe(true);
  });
});
