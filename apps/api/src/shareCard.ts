import sharp from "sharp";

export type ShareCardData = {
  type: "profile" | "score" | "event" | "card" | "song";
  id: string;
  region: string;
  title: string;
  subtitle: string;
  detail?: string;
  accent?: string;
  sourceImageUrl?: string;
};

const typeLabels: Record<ShareCardData["type"], string> = {
  profile: "玩家档案",
  score: "歌曲成绩",
  event: "活动资料",
  card: "卡牌资料",
  song: "歌曲资料"
};

const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
const sourceImageMaxBytes = 8 * 1024 * 1024;
const sourceImageMaxRedirects = 3;
const trustedImageHosts = ["storage.sekai.best", "storage.exmeaning.com", "storage.pjsk.moe", "q.qlogo.cn", "thirdqq.qlogo.cn"];

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function trustedImageUrl(value: string | URL | undefined) {
  if (!value) return null;
  try {
    const url = value instanceof URL ? value : new URL(value);
    const trustedHost = trustedImageHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (url.protocol !== "https:" || url.username || url.password || !trustedHost) return null;
    if (url.port && url.port !== "443") return null;
    return url;
  } catch {
    return null;
  }
}

function isRedirect(response: Response) {
  return [301, 302, 303, 307, 308].includes(response.status);
}

export async function fetchSourceImage(url: string | undefined, fetchImpl: typeof fetch = fetch) {
  let currentUrl = trustedImageUrl(url);
  if (!currentUrl) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const visited = new Set<string>();
  try {
    for (let redirectCount = 0; redirectCount <= sourceImageMaxRedirects; redirectCount += 1) {
      const normalizedUrl = currentUrl.href;
      if (visited.has(normalizedUrl)) return undefined;
      visited.add(normalizedUrl);

      const response = await fetchImpl(normalizedUrl, { signal: controller.signal, redirect: "manual" });
      if (isRedirect(response)) {
        if (redirectCount === sourceImageMaxRedirects) return undefined;
        const location = response.headers.get("location");
        if (!location) return undefined;
        currentUrl = trustedImageUrl(new URL(location, currentUrl));
        if (!currentUrl) return undefined;
        continue;
      }

      if (!response.ok) return undefined;
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (!contentType?.startsWith("image/")) return undefined;
      const contentLength = response.headers.get("content-length");
      if (contentLength != null) {
        const declaredLength = Number(contentLength);
        if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 || declaredLength > sourceImageMaxBytes) return undefined;
      }
      const image = Buffer.from(await response.arrayBuffer());
      if (!image.length || image.length > sourceImageMaxBytes) return undefined;
      return image;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function cardSvg(data: ShareCardData, cardOpacity = 1) {
  const title = escapeXml(truncate(data.title, 28));
  const subtitle = escapeXml(truncate(data.subtitle, 54));
  const detail = escapeXml(truncate(data.detail ?? `ID ${data.id}`, 68));
  const label = escapeXml(typeLabels[data.type]);
  const region = escapeXml(data.region.toUpperCase());
  const accent = /^#[0-9a-f]{6}$/i.test(data.accent ?? "") ? data.accent : "#35b8b0";
  return Buffer.from(`
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#f7fbfc"/>
      <rect width="1200" height="18" fill="${accent}"/>
      <rect y="18" width="1200" height="8" fill="#f05b9d"/>
      <rect x="68" y="74" width="1064" height="482" rx="20" fill="#ffffff" fill-opacity="${cardOpacity}" stroke="#cddde2" stroke-width="3"/>
      <path d="M68 446H1132V536C1132 547 1123 556 1112 556H88C77 556 68 547 68 536Z" fill="#e8f7f6"/>
      <circle cx="1020" cy="178" r="78" fill="#fff3a8"/>
      <path d="M975 178L1010 213L1073 143" fill="none" stroke="${accent}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="116" y="142" fill="#238b88" font-size="28" font-weight="700" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">PROJECT SEKAI 玩家助手</text>
      <rect x="116" y="176" width="176" height="54" rx="8" fill="#22333b"/>
      <text x="204" y="212" text-anchor="middle" fill="#ffffff" font-size="25" font-weight="700" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">${label}</text>
      <rect x="310" y="176" width="92" height="54" rx="8" fill="#f05b9d"/>
      <text x="356" y="212" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="700" font-family="sans-serif">${region}</text>
      <text x="116" y="315" fill="#18252b" font-size="54" font-weight="800" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">${title}</text>
      <text x="116" y="374" fill="#526971" font-size="29" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">${subtitle}</text>
      <text x="116" y="420" fill="#71868d" font-size="24" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">${detail}</text>
      <text x="116" y="510" fill="#238b88" font-size="25" font-weight="700" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">pjsktools</text>
      <text x="1082" y="510" text-anchor="end" fill="#526971" font-size="21" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">真实数据分享卡</text>
    </svg>`);
}

export async function renderShareCardPng(data: ShareCardData) {
  const sourceImage = await fetchSourceImage(data.sourceImageUrl);
  const base = sharp(cardSvg(data));
  if (!sourceImage) return base.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();

  try {
    const visual = await sharp(sourceImage)
      .resize(1064, 482, { fit: "cover", position: "attention" })
      .modulate({ brightness: 0.78, saturation: 0.85 })
      .blur(0.8)
      .png()
      .toBuffer();
    const overlay = await sharp(cardSvg(data, 0.72)).png().toBuffer();
    return sharp({ create: { width: 1200, height: 630, channels: 4, background: "#f7fbfc" } })
      .composite([
        { input: visual, left: 68, top: 74 },
        { input: overlay, left: 0, top: 0 }
      ])
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  } catch {
    return base.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  }
}

export function shareCardMetadata(data: ShareCardData, imageUrl: string) {
  return {
    type: data.type,
    id: data.id,
    region: data.region,
    title: data.title,
    imageUrl,
    summary: data.subtitle,
    width: 1200,
    height: 630,
    mimeType: "image/png"
  };
}

export function isPng(buffer: Buffer) {
  return buffer.subarray(0, pngSignature.length).equals(pngSignature);
}
