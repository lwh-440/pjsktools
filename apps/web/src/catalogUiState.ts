export type CatalogUiState = "loading" | "error" | "empty" | "ready";

export function resolveCatalogUiState({
  status,
  itemCount
}: {
  status: "idle" | "loading" | "ready" | "error";
  itemCount?: number;
}): CatalogUiState {
  if (status === "error") return "error";
  if (status === "idle" || status === "loading") return "loading";
  return (itemCount ?? 0) === 0 ? "empty" : "ready";
}
