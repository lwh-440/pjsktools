import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { RegionId } from "./config.js";

type ChartEngine = typeof import("./vendor/pjsekai-scores/pjsekai_scores_rs.js");
type FetchLike = typeof fetch;

const HARUKI_ASSET_BASE = "https://sekai-assets.haruki.seiunx.com";
const NOTE_HOST = "https://asset3.pjsekai.moe/live/note/custom01";
const CACHE_TTL_MS = 60 * 60_000;
const MAX_CACHE_ENTRIES = 8;
const MAX_CONCURRENT_RENDERS = 1;
const MAX_RENDER_QUEUE = 12;
const MAX_SUS_BYTES = 4 * 1024 * 1024;
const MAX_NOTE_BYTES = 4 * 1024 * 1024;
const allowedDifficulties = new Set(["easy", "normal", "hard", "expert", "master", "append"]);

let enginePromise: Promise<ChartEngine> | undefined;
let activeRenderCount = 0;
const renderWaiters: Array<() => void> = [];

async function withRenderSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeRenderCount < MAX_CONCURRENT_RENDERS && renderWaiters.length === 0) {
    activeRenderCount += 1;
  } else {
    if (renderWaiters.length >= MAX_RENDER_QUEUE) throw new ChartRenderError(503, "Chart renderer is busy; retry shortly");
    await new Promise<void>((resolve) => renderWaiters.push(resolve));
  }
  try {
    return await work();
  } finally {
    const next = renderWaiters.shift();
    if (next) next();
    else activeRenderCount -= 1;
  }
}

export type RenderedChart = { svg: Buffer; png: Buffer; susUrl: string; cacheKey: string };

export class ChartRenderError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function normalizeChartDifficulty(value: string) {
  const normalized = value.trim().toLowerCase();
  return allowedDifficulties.has(normalized) ? normalized : undefined;
}

export function buildHarukiMusicScoreUrl(region: RegionId, musicId: string | number, difficulty: string) {
  const numericId = Number(musicId);
  const normalizedDifficulty = normalizeChartDifficulty(difficulty);
  if (!Number.isInteger(numericId) || numericId <= 0 || !normalizedDifficulty) return undefined;
  return `${HARUKI_ASSET_BASE}/${region}-assets/startapp/music/music_score/${String(numericId).padStart(4, "0")}_01/${normalizedDifficulty}.txt?v=2`;
}

async function loadEngine(): Promise<ChartEngine> {
  if (!enginePromise) {
    enginePromise = Promise.all([
      import("./vendor/pjsekai-scores/pjsekai_scores_rs.js"),
      readFile(new URL("./vendor/pjsekai-scores/pjsekai_scores_rs_bg.wasm", import.meta.url))
    ]).then(([engine, wasmBytes]) => {
      engine.initSync({ module: wasmBytes });
      return engine;
    });
    enginePromise.catch(() => { enginePromise = undefined; });
  }
  return enginePromise;
}

function safeUrl(value: string, noteHost: string) {
  try {
    const candidate = new URL(value);
    const host = new URL(noteHost);
    return candidate.origin === host.origin && candidate.pathname.startsWith(`${host.pathname.replace(/\/+$/, "")}/`);
  } catch { return false; }
}

async function responseBytes(fetchImpl: FetchLike, url: string, accept: string, maxBytes: number, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: accept, "User-Agent": "pjsktools-chart-renderer" } });
    if (!response.ok) throw new ChartRenderError(502, `Haruki chart asset returned ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > maxBytes) throw new ChartRenderError(502, "Chart asset exceeds the renderer size limit");
    return { body, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
  } catch (error) {
    if (error instanceof ChartRenderError) throw error;
    throw new ChartRenderError(503, `Chart asset request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally { clearTimeout(timeout); }
}

async function inlineNoteAssets(svg: string, noteHost: string, fetchImpl: FetchLike) {
  const matches = [...svg.matchAll(/\b(?:href|xlink:href)=(?:"([^"]+)"|'([^']+)')/g)];
  const urls = [...new Set(matches.map((match) => match[1] ?? match[2]).filter((url) => safeUrl(url, noteHost)))];
  if (urls.length > 48) throw new ChartRenderError(502, "Chart references too many note assets");
  const replacements = await Promise.all(urls.map(async (url) => {
    const asset = await responseBytes(fetchImpl, url, "image/png,image/webp,image/*", MAX_NOTE_BYTES, 8_000);
    if (!asset.contentType.toLowerCase().startsWith("image/")) throw new ChartRenderError(502, "Chart note asset is not an image");
    return [url, `data:${asset.contentType.split(";", 1)[0]};base64,${asset.body.toString("base64")}`] as const;
  }));
  let embedded = svg;
  for (const [url, dataUri] of replacements) embedded = embedded.replaceAll(url, dataUri);
  // The upstream renderer includes a decorative remote portrait by default. It is not score data; omit it so the chart is self-contained.
  embedded = embedded.replace(/<image\b[^>]*\b(?:href|xlink:href)=(?:"|')https?:\/\/[^>]*\/?>(?:<\/image>)?/gi, "");
  if (/<image\b[^>]*\b(?:href|xlink:href)=(?:"|')https?:\/\//i.test(embedded)) throw new ChartRenderError(502, "Rendered chart still contains an external image reference");
  return embedded;
}

export class ChartRenderer {
  private readonly cache = new Map<string, { expiresAt: number; chart: RenderedChart }>();
  private readonly inflight = new Map<string, Promise<RenderedChart>>();

  constructor(private readonly options: { fetchImpl?: FetchLike; noteHost?: string } = {}) {}

  async render(region: RegionId, musicId: string | number, difficulty: string, meta: { title?: string; playLevel?: number } = {}) {
    const susUrl = buildHarukiMusicScoreUrl(region, musicId, difficulty);
    const normalizedDifficulty = normalizeChartDifficulty(difficulty);
    if (!susUrl || !normalizedDifficulty) throw new ChartRenderError(400, "Unsupported chart music ID or difficulty");
    const cacheKey = createHash("sha256").update(`${region}:${musicId}:${normalizedDifficulty}`).digest("hex");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.chart;
    if (cached) this.cache.delete(cacheKey);
    const pending = this.inflight.get(cacheKey);
    if (pending) return pending;
    const task = (async () => {
      const sus = await responseBytes(this.options.fetchImpl ?? fetch, susUrl, "text/plain,text/*", MAX_SUS_BYTES, 12_000);
      const chart = await this.renderSus(sus.body.toString("utf8"), { ...meta, difficulty: normalizedDifficulty, susUrl, cacheKey });
      this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, chart });
      while (this.cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = this.cache.keys().next().value;
        if (!oldestKey) break;
        this.cache.delete(oldestKey);
      }
      return chart;
    })().finally(() => this.inflight.delete(cacheKey));
    this.inflight.set(cacheKey, task);
    return task;
  }

  async renderSus(sus: string, meta: { title?: string; difficulty?: string; playLevel?: number; susUrl?: string; cacheKey?: string } = {}): Promise<RenderedChart> {
    if (!sus.trim()) throw new ChartRenderError(400, "Empty SUS chart");
    return withRenderSlot(async () => {
      const engine = await loadEngine();
      const score = engine.Score.fromSus(sus);
      try {
        if (meta.title) score.setMetaField("title", meta.title);
        if (meta.difficulty) score.setMetaField("difficulty", meta.difficulty);
        if (meta.playLevel != null) score.setMetaField("playlevel", String(meta.playLevel));
        const drawing = new engine.Drawing();
        try {
          drawing.clearMusicMeta();
          drawing.setGenerator("pjsktools / pjsekai-scores-rs v0.4.3");
          drawing.setNoteHost(this.options.noteHost ?? NOTE_HOST);
          drawing.setNoteAssetExtension("png");
          const svg = await inlineNoteAssets(drawing.svg(score), this.options.noteHost ?? NOTE_HOST, this.options.fetchImpl ?? fetch);
          const png = await sharp(Buffer.from(svg), { density: 96, limitInputPixels: 100_000_000 }).png().toBuffer();
          return { svg: Buffer.from(svg), png, susUrl: meta.susUrl ?? "", cacheKey: meta.cacheKey ?? createHash("sha256").update(sus).digest("hex") };
        } finally { drawing.free(); }
      } catch (error) {
        if (error instanceof ChartRenderError) throw error;
        throw new ChartRenderError(502, `SUS rendering failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally { score.free(); }
    });
  }
}
