import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { renderShareCard, shareCardCacheControl } from "./shareCard.js";

const data = {
  type: "card" as const,
  id: "4",
  region: "cn",
  title: "黎明前的倾诉",
  subtitle: "星乃一歌 · cute · 星级 4"
};

describe("share card source image retrieval", () => {
  it("uses a later trusted same-region candidate when the primary art request fails", async () => {
    const source = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#d71920" } }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("primary.png")) return new Response("unavailable", { status: 503 });
      if (url.endsWith("fallback.png")) return new Response(source, { headers: { "content-type": "image/png", "content-length": String(source.length) } });
      return new Response("unexpected", { status: 500 });
    });

    const [rendered, template] = await Promise.all([
      renderShareCard({ ...data, sourceImageUrl: "https://sekai-assets.haruki.seiunx.com/cn-assets/primary.png", sourceImageUrls: ["https://sekai-assets.haruki.seiunx.com/cn-assets/fallback.png"] }, fetchImpl),
      renderShareCard(data, fetchImpl)
    ]);

    expect(rendered.sourceImageRequested).toBe(true);
    expect(rendered.sourceImageUsed).toBe(true);
    expect(rendered.image.equals(template.image)).toBe(false);
    const [compositedPixels, templatePixels] = await Promise.all([
      sharp(rendered.image).raw().toBuffer(),
      sharp(template.image).raw().toBuffer()
    ]);
    const centerPixel = (250 * 1200 + 800) * 4;
    expect(compositedPixels[centerPixel + 1]).toBeLessThan(templatePixels[centerPixel + 1] - 10);
    expect(fetchImpl).toHaveBeenCalledWith("https://sekai-assets.haruki.seiunx.com/cn-assets/fallback.png", expect.any(Object));
  });

  it("marks a source failure so callers can avoid caching its template", async () => {
    const rendered = await renderShareCard(
      { ...data, sourceImageUrl: "https://sekai-assets.haruki.seiunx.com/cn-assets/missing.png" },
      vi.fn<typeof fetch>(async () => new Response("unavailable", { status: 503 }))
    );

    expect(rendered.sourceImageRequested).toBe(true);
    expect(rendered.sourceImageUsed).toBe(false);
    expect(shareCardCacheControl(rendered)).toBe("no-store");
  });

  it("continues to the next candidate when the fetched primary payload cannot be decoded", async () => {
    const source = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#d71920" } }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => String(input).endsWith("corrupt.png")
      ? new Response(Buffer.from("not-a-real-image"), { headers: { "content-type": "image/png" } })
      : new Response(source, { headers: { "content-type": "image/png" } })
    );
    const [rendered, template] = await Promise.all([renderShareCard({
      ...data,
      sourceImageUrl: "https://sekai-assets.haruki.seiunx.com/cn-assets/corrupt.png",
      sourceImageUrls: ["https://sekai-assets.haruki.seiunx.com/cn-assets/valid.png"]
    }, fetchImpl), renderShareCard(data, fetchImpl)]);

    expect(rendered.sourceImageUsed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("https://sekai-assets.haruki.seiunx.com/cn-assets/valid.png", expect.any(Object));
    const [compositedPixels, templatePixels] = await Promise.all([
      sharp(rendered.image).raw().toBuffer(),
      sharp(template.image).raw().toBuffer()
    ]);
    const centerPixel = (250 * 1200 + 800) * 4;
    expect(compositedPixels[centerPixel + 1]).toBeLessThan(templatePixels[centerPixel + 1] - 10);
  });
});
