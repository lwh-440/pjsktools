import { Howl } from "howler";
import { apiResourceUrl } from "../api";
import { PreloadQueue } from "./PreloadQueue";
import type { MediaAsset, PreloadProgress, StoryPlaybackContext } from "./types";

function urlOf(asset: MediaAsset) {
  return apiResourceUrl(asset.proxiedUrl ?? asset.url);
}

function image(url: string, signal: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image();
    const abort = () => { value.src = ""; reject(new DOMException("Cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    value.onload = () => { signal.removeEventListener("abort", abort); resolve(value); };
    value.onerror = () => reject(new Error(`Image failed: ${url}`));
    value.crossOrigin = "anonymous";
    value.src = url;
  });
}

function video(url: string, signal: AbortSignal) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const value = document.createElement("video");
    const abort = () => { value.src = ""; reject(new DOMException("Cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    value.onloadedmetadata = () => { signal.removeEventListener("abort", abort); resolve(value); };
    value.onerror = () => reject(new Error(`Video failed: ${url}`));
    value.crossOrigin = "anonymous";
    value.preload = "metadata";
    value.src = url;
  });
}

function audio(url: string, signal: AbortSignal) {
  return new Promise<Howl>((resolve, reject) => {
    const value = new Howl({ src: [url], html5: false, preload: true, onload: () => resolve(value), onloaderror: () => reject(new Error(`Audio failed: ${url}`)) });
    signal.addEventListener("abort", () => { value.unload(); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
  });
}

export async function preloadStory(playback: StoryPlaybackContext, signal: AbortSignal, onProgress: (value: PreloadProgress) => void) {
  const assets = playback.preloadPlan?.media ?? playback.mediaAssets ?? [];
  const cache = new Map<string, HTMLImageElement | HTMLVideoElement | Howl>();
  const tasks = assets.filter((asset) => urlOf(asset)).map((asset) => async () => {
    const url = urlOf(asset);
    const loaded = asset.kind === "video" ? await video(url, signal) : ["voice", "bgm", "se"].includes(asset.kind) ? await audio(url, signal) : await image(url, signal);
    cache.set(`${asset.kind}:${asset.identifier}`, loaded);
    return loaded;
  });
  onProgress({ stage: "media", completed: 0, total: tasks.length, status: "loading" });
  const results = await new PreloadQueue(tasks).run(signal, (completed, total) => onProgress({ stage: "media", completed, total, status: "loading" }));
  const failed = results.filter((item) => item == null).length;
  onProgress({ stage: "media", completed: results.length - failed, total: results.length, status: failed ? "failed" : "loaded", info: failed ? `${failed} resources unavailable` : undefined });
  return cache;
}
