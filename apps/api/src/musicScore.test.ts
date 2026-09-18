import { describe, expect, it } from "vitest";
import { musicScoreUrl } from "./musicScore.js";

describe("Haruki Exact-score SUS source", () => {
  it("uses the same verified Haruki score paths as the chart renderer", () => {
    expect(musicScoreUrl("jp", "1", "EXPERT")).toBe("https://sekai-assets.haruki.seiunx.com/jp-assets/startapp/music/music_score/0001_01/expert.txt?v=2");
    expect(musicScoreUrl("tw", "11012", "master")).toBe("https://sekai-assets.haruki.seiunx.com/tw-assets/startapp/music/music_score/11012_01/master.txt?v=2");
  });
});
