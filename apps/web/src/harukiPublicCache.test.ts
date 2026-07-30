import { describe, expect, it } from "vitest";
import { publicSnapshotCacheKey } from "./harukiPublicCache";

describe("Haruki Public cache namespace", () => {
  it("isolates the same player UID by pjsktools user", () => {
    expect(publicSnapshotCacheKey("user-a", "jp", "123456789")).not.toBe(
      publicSnapshotCacheKey("user-b", "jp", "123456789")
    );
  });

  it("isolates the same UID by region", () => {
    expect(publicSnapshotCacheKey("user-a", "jp", "123456789")).not.toBe(
      publicSnapshotCacheKey("user-a", "en", "123456789")
    );
  });

  it("returns a stable key for the same user, region and UID", () => {
    expect(publicSnapshotCacheKey("user-a", "tw", "123456789")).toBe(
      publicSnapshotCacheKey("user-a", "tw", "123456789")
    );
  });
});

