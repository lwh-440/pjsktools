import sharp from "sharp";

export type ShareCardData = {
  type: "profile" | "score" | "event" | "card" | "song";
  id: string;
  region: string;
  title: string;
  subtitle: string;
  detail?: string;
};

const typeLabels: Record<ShareCardData["type"], string> = {
  profile: "玩家档案",
  score: "歌曲成绩",
  event: "活动资料",
  card: "卡牌资料",
  song: "歌曲资料"
};

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export async function renderShareCardPng(data: ShareCardData) {
  const title = escapeXml(truncate(data.title, 28));
  const subtitle = escapeXml(truncate(data.subtitle, 52));
  const detail = escapeXml(truncate(data.detail ?? `ID ${data.id}`, 62));
  const label = escapeXml(typeLabels[data.type]);
  const region = escapeXml(data.region.toUpperCase());
  const svg = `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#f7fbfc"/>
      <rect x="0" y="0" width="1200" height="18" fill="#35b8b0"/>
      <rect x="0" y="18" width="1200" height="8" fill="#f05b9d"/>
      <rect x="68" y="74" width="1064" height="482" rx="20" fill="#ffffff" stroke="#cddde2" stroke-width="3"/>
      <path d="M68 446H1132V536C1132 547 1123 556 1112 556H88C77 556 68 547 68 536Z" fill="#e8f7f6"/>
      <circle cx="1020" cy="178" r="78" fill="#fff3a8"/>
      <path d="M975 178L1010 213L1073 143" fill="none" stroke="#35b8b0" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="116" y="142" fill="#238b88" font-size="28" font-weight="700" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">PROJECT SEKAI 玩家助手</text>
      <rect x="116" y="176" width="176" height="54" rx="8" fill="#22333b"/>
      <text x="204" y="212" text-anchor="middle" fill="#ffffff" font-size="25" font-weight="700" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">${label}</text>
      <rect x="310" y="176" width="92" height="54" rx="8" fill="#f05b9d"/>
      <text x="356" y="212" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="700" font-family="sans-serif">${region}</text>
      <text x="116" y="315" fill="#18252b" font-size="54" font-weight="800" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">${title}</text>
      <text x="116" y="374" fill="#526971" font-size="29" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">${subtitle}</text>
      <text x="116" y="420" fill="#71868d" font-size="24" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">${detail}</text>
      <text x="116" y="510" fill="#238b88" font-size="25" font-weight="700" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">pjsktools</text>
      <text x="1082" y="510" text-anchor="end" fill="#526971" font-size="21" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">生成于 ${escapeXml(new Date().toISOString().slice(0, 10))}</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

export function shareCardMetadata(data: ShareCardData, imageUrl: string) {
  return {
    ...data,
    typeLabel: typeLabels[data.type],
    imageUrl,
    width: 1200,
    height: 630,
    mimeType: "image/png",
    summary: data.subtitle
  };
}
