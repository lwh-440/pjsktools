import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildHarukiMusicScoreUrl, ChartRenderer } from "./chartRenderer.js";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9VJZZQAAAABJRU5ErkJggg==", "base64");
const sus = ['#TITLE "renderer test"', "#REQUEST \"ticks_per_beat 480\"", "#00008:00", "#00011:11"].join("\n");

describe("Haruki SUS chart renderer", () => {
  it("builds the required Haruki music_score path", () => {
    expect(buildHarukiMusicScoreUrl("jp", 1, "EXPERT")).toBe("https://sekai-assets.haruki.seiunx.com/jp-assets/startapp/music/music_score/0001_01/expert.txt?v=2");
    expect(buildHarukiMusicScoreUrl("tw", 11012, "master")).toBe("https://sekai-assets.haruki.seiunx.com/tw-assets/startapp/music/music_score/11012_01/master.txt?v=2");
    expect(buildHarukiMusicScoreUrl("jp", 1, "invalid")).toBeUndefined();
  });

  it("renders SUS as a standalone SVG and decodable PNG", async () => {
    const upstream = vi.fn(async () => new Response(tinyPng, { headers: { "content-type": "image/png" } }));
    const renderer = new ChartRenderer({ fetchImpl: upstream as typeof fetch });
    const chart = await renderer.renderSus(sus, { title: "renderer test", difficulty: "expert" });
    expect(chart.svg.toString("utf8")).toContain("data:image/png;base64,");
    expect(chart.svg.toString("utf8")).not.toMatch(/<image\b[^>]*\b(?:href|xlink:href)=(?:"|')https?:\/\//i);
    expect(chart.png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    await expect(sharp(chart.png).metadata()).resolves.toMatchObject({ format: "png" });
    expect(upstream).toHaveBeenCalled();
  });
});
