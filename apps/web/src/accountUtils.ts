import type { InventoryItem } from "./accountTypes";

export function parseInventoryInput(value: string): InventoryItem[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const cards = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cards) ? parsed.cards : [];
    return cards.map((item: any) => (typeof item === "string" || typeof item === "number" ? { cardId: String(item) } : { ...item, cardId: String(item.cardId ?? item.id) }));
  }
  return trimmed.split(/[,\s]+/).filter(Boolean).map((cardId) => ({ cardId }));
}

export function formatJson(value: unknown) {
  return JSON.stringify(value ?? [], null, 2);
}

