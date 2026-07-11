export type CardImportCatalogItem = {
  cardId: string;
  title: string;
  characterId?: string;
  character?: string;
  unit?: string;
  supportUnit?: string;
  attribute?: string;
  rarity?: number;
  cardRarityType?: string;
  assetbundleName?: string;
  maxPower?: number;
  thumbnails: { normal?: string; afterTraining?: string };
  fingerprints: { normal?: string; afterTraining?: string };
};

export type CardImportManifest = {
  region: string;
  catalog: CardImportCatalogItem[];
  fingerprintStatus: "matched" | "source-unavailable";
  fingerprintWarning?: string;
};

export type ScreenshotCardResult = {
  id: string;
  crop: string;
  status: "matched" | "ambiguous" | "unknown";
  candidates: Array<{ cardId: string; trained: boolean; distance: number }>;
  selectedCardId?: string;
  trained: boolean;
  level: number;
  masterRank: number;
  skillLevel: number;
  ocrText?: string;
};

function canvasFromImage(image: HTMLImageElement, maxWidth = 1400) {
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d", { willReadFrequently: true })?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropCanvas(source: HTMLCanvasElement, x: number, y: number, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d", { willReadFrequently: true })?.drawImage(source, x, y, size, size, 0, 0, size, size);
  return canvas;
}

function imageVariance(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  let sumSquare = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 16) {
    const value = (data[index] + data[index + 1] + data[index + 2]) / 3;
    sum += value;
    sumSquare += value * value;
    count += 1;
  }
  const average = sum / Math.max(1, count);
  return sumSquare / Math.max(1, count) - average * average;
}

export function perceptualHash(canvas: HTMLCanvasElement) {
  const sample = document.createElement("canvas");
  sample.width = 32;
  sample.height = 32;
  sample.getContext("2d", { willReadFrequently: true })?.drawImage(canvas, canvas.width * 0.13, canvas.height * 0.08, canvas.width * 0.74, canvas.height * 0.74, 0, 0, 32, 32);
  const pixels = sample.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, 32, 32).data;
  if (!pixels) return "";
  const values = Array.from({ length: 32 * 32 }, (_, index) => {
    const offset = index * 4;
    return pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
  });
  const coefficients: number[] = [];
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      let sum = 0;
      for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
        sum += values[y * 32 + x] * Math.cos((2 * x + 1) * u * Math.PI / 64) * Math.cos((2 * y + 1) * v * Math.PI / 64);
      }
      coefficients.push(sum);
    }
  }
  const medianValues = coefficients.slice(1).sort((a, b) => a - b);
  const median = medianValues[Math.floor(medianValues.length / 2)] ?? 0;
  return coefficients.map((value) => value >= median ? "1" : "0").join("");
}

async function hashRemoteImage(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = apiResourceUrl(url.startsWith("/api/") ? url : `/api/assets/proxy?url=${encodeURIComponent(url)}`);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d", { willReadFrequently: true })?.drawImage(image, 0, 0);
  return perceptualHash(canvas);
}

async function ensureLocalFingerprints(manifest: CardImportManifest, onProgress?: (completed: number, total: number, stage: string) => void) {
  if (manifest.catalog.some((card) => card.fingerprints.normal || card.fingerprints.afterTraining)) return;
  const cacheKey = `pjsktools-card-fingerprints:${manifest.region}:v1`;
  const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "{}") as Record<string, string>;
  const tasks = manifest.catalog.flatMap((card) => [
    card.thumbnails.normal ? { card, trained: false, url: card.thumbnails.normal, key: `${card.cardId}:normal` } : null,
    card.thumbnails.afterTraining ? { card, trained: true, url: card.thumbnails.afterTraining, key: `${card.cardId}:after` } : null
  ].filter(Boolean) as Array<{ card: CardImportCatalogItem; trained: boolean; url: string; key: string }>);
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      let hash = cached[task.key];
      if (!hash) {
        try { hash = await hashRemoteImage(task.url); } catch { hash = ""; }
        if (hash) cached[task.key] = hash;
      }
      if (hash) task.trained ? task.card.fingerprints.afterTraining = hash : task.card.fingerprints.normal = hash;
      completed += 1;
      onProgress?.(completed, tasks.length, "fingerprint-index");
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, tasks.length) }, worker));
  try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch { /* Browser storage may be restricted; current session still works. */ }
}

function distance(left?: string, right?: string) {
  if (!left || !right || left.length !== right.length) return 64;
  let value = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) value += 1;
  return value;
}

async function readFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return canvasFromImage(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function recognizeCardScreenshot(
  file: File,
  manifest: CardImportManifest,
  options: { columns: number; topCropPercent: number; gapPercent: number; ocr: boolean },
  onProgress?: (completed: number, total: number, stage: string) => void
) {
  const source = await readFile(file);
  await ensureLocalFingerprints(manifest, onProgress);
  const columns = Math.max(3, Math.min(8, Math.round(options.columns)));
  const top = Math.round(source.height * Math.max(0, Math.min(0.5, options.topCropPercent / 100)));
  const gap = Math.max(0, Math.round(source.width * options.gapPercent / 100));
  const size = Math.floor((source.width - gap * (columns + 1)) / columns);
  const rows = Math.max(1, Math.min(15, Math.floor((source.height - top - gap) / Math.max(1, size + gap))));
  const crops: HTMLCanvasElement[] = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const crop = cropCanvas(source, gap + column * (size + gap), top + gap + row * (size + gap), size);
    if (imageVariance(crop) > 180) crops.push(crop);
  }
  const fingerprints = manifest.catalog.flatMap((card) => [
    card.fingerprints.normal ? { cardId: card.cardId, trained: false, hash: card.fingerprints.normal } : null,
    card.fingerprints.afterTraining ? { cardId: card.cardId, trained: true, hash: card.fingerprints.afterTraining } : null
  ].filter(Boolean) as Array<{ cardId: string; trained: boolean; hash: string }>);
  let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;
  if (options.ocr) {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng");
  }
  const results: ScreenshotCardResult[] = [];
  try {
    for (let index = 0; index < crops.length; index += 1) {
      const crop = crops[index];
      onProgress?.(index, crops.length, "fingerprint");
      const hash = perceptualHash(crop);
      const candidates = fingerprints.map((item) => ({ cardId: item.cardId, trained: item.trained, distance: distance(hash, item.hash) })).sort((a, b) => a.distance - b.distance).slice(0, 5);
      const best = candidates[0];
      const status = !best || best.distance > 24 ? "unknown" : best.distance <= 10 && (candidates[1]?.distance ?? 64) - best.distance >= 2 ? "matched" : "ambiguous";
      let ocrText = "";
      let level = 1;
      let masterRank = 0;
      if (worker) {
        onProgress?.(index, crops.length, "ocr");
        const ocrCanvas = document.createElement("canvas");
        ocrCanvas.width = crop.width;
        ocrCanvas.height = Math.max(20, Math.round(crop.height * 0.28));
        ocrCanvas.getContext("2d")?.drawImage(crop, 0, crop.height - ocrCanvas.height, crop.width, ocrCanvas.height, 0, 0, crop.width, ocrCanvas.height);
        ocrText = (await worker.recognize(ocrCanvas)).data.text.trim();
        level = Number(ocrText.match(/Lv\.?\s*(\d{1,2})/i)?.[1] ?? 1);
        masterRank = Math.min(5, Number(ocrText.match(/(?:MR|MASTER)\s*(\d)/i)?.[1] ?? 0));
      }
      results.push({
        id: `${index + 1}`,
        crop: crop.toDataURL("image/webp", 0.82),
        status,
        candidates,
        selectedCardId: status === "matched" ? best?.cardId : undefined,
        trained: status === "matched" ? Boolean(best?.trained) : false,
        level: Number.isFinite(level) ? level : 1,
        masterRank,
        skillLevel: 1,
        ocrText
      });
    }
  } finally {
    await worker?.terminate();
  }
  onProgress?.(crops.length, crops.length, "complete");
  return results;
}
import { apiResourceUrl } from "./api";
