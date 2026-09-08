export function shouldStartArtImageLoad({ eager, cachedSource, nearViewport }: { eager: boolean; cachedSource?: string; nearViewport: boolean }) {
  return eager || Boolean(cachedSource) || nearViewport;
}

export function nextArtImageSource(sources: string[], attemptedSources: ReadonlySet<string>) {
  return sources.find((source) => !attemptedSources.has(source)) ?? null;
}

export function shouldRetryArtImageOnReentry({ failed, wasNearViewport, nearViewport }: { failed: boolean; wasNearViewport: boolean; nearViewport: boolean }) {
  return failed && !wasNearViewport && nearViewport;
}
