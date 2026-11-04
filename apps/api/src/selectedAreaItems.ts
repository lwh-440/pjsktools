// Restrict a single calculation to current, uploaded area items. Never mutate
// the stored asset map or invent levels for unowned items.
export function selectCurrentAreaItems(assets: Record<string, unknown>, selectedIds: string[]) {
  const rows = Array.isArray(assets["area-items"]) ? assets["area-items"].filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
  const owned = new Set(rows.filter((row) => Number(row.level ?? row.areaItemLevel) > 0).map((row) => String(row.areaItemId ?? row.id ?? "")));
  const ids = [...new Set(selectedIds)];
  if (ids.some((id) => !owned.has(id))) throw new Error("所选区域道具未在当前绑定的已同步库存中找到，请重新选择。");
  return { ...assets, "area-items": rows.filter((row) => ids.includes(String(row.areaItemId ?? row.id ?? ""))).map((row) => structuredClone(row)) };
}
