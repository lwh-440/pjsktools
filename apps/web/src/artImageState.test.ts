import { describe, expect, it } from "vitest";
import { nextArtImageSource, shouldRetryArtImageOnReentry, shouldStartArtImageLoad } from "./artImageState";

describe("ArtImage loading state", () => {
  it("only starts non-eager images after they approach the viewport", () => {
    expect(shouldStartArtImageLoad({ eager: false, nearViewport: false })).toBe(false);
    expect(shouldStartArtImageLoad({ eager: false, nearViewport: true })).toBe(true);
    expect(shouldStartArtImageLoad({ eager: true, nearViewport: false })).toBe(true);
  });

  it("tries a later candidate after failure and allows a fresh attempt on viewport re-entry", () => {
    const attempted = new Set(["first"]);
    expect(nextArtImageSource(["first", "second"], attempted)).toBe("second");
    expect(nextArtImageSource(["first"], attempted)).toBeNull();
    expect(shouldRetryArtImageOnReentry({ failed: true, wasNearViewport: false, nearViewport: true })).toBe(true);
    expect(shouldRetryArtImageOnReentry({ failed: true, wasNearViewport: true, nearViewport: true })).toBe(false);
  });
});
