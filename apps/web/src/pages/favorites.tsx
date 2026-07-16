import { FolderPlus, Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiResourceUrl } from "../api";
import { useAuth } from "../AuthContext";
import type { Favorite, FavoriteFolder, FavoriteType } from "../sharedTypes";

type FavoritePageResponse = { items: Favorite[]; page: number; pageSize: number; total: number; totalPages: number };
type FolderView = "all" | "unfiled" | string;

const typeLabels: Record<FavoriteType, string> = {
  player: "玩家", event: "活动", song: "歌曲", card: "卡牌", gacha: "卡池",
  honor: "称号", material: "素材", costume: "服装", stamp: "贴纸", comic: "漫画"
};

export function FavoritesPage() {
  const auth = useAuth();
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [pageData, setPageData] = useState<FavoritePageResponse>({ items: [], page: 1, pageSize: 48, total: 0, totalPages: 1 });
  const [view, setView] = useState<FolderView>("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [region, setRegion] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<"add" | "remove" | "replace">("add");
  const [bulkFolderId, setBulkFolderId] = useState("");
  const [message, setMessage] = useState("");

  const params = useMemo(() => {
    const value = new URLSearchParams({ pageSize: "100" });
    if (view === "unfiled") value.set("unfiled", "true");
    else if (view !== "all") value.set("folderId", view);
    if (query.trim()) value.set("q", query.trim());
    if (type) value.set("type", type);
    if (region) value.set("region", region);
    return value;
  }, [view, query, type, region]);

  async function load() {
    const [nextFolders, nextFavorites] = await Promise.all([
      apiGet<FavoriteFolder[]>("/api/me/favorite-folders", auth.token),
      apiGet<FavoritePageResponse>(`/api/me/favorites?${params}`, auth.token)
    ]);
    setFolders(nextFolders);
    setPageData(nextFavorites);
    setSelected((current) => current.filter((id) => nextFavorites.items.some((item) => item.id === id)));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => setMessage(error instanceof Error ? error.message : "加载失败")), 180);
    return () => window.clearTimeout(timer);
  }, [auth.token, params.toString()]);

  async function createFolder() {
    const name = newFolder.trim();
    if (!name) return;
    const optimistic: FavoriteFolder = { id: `pending-${Date.now()}`, name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setFolders((current) => [...current, optimistic]);
    setNewFolder("");
    try {
      await apiPost("/api/me/favorite-folders", { name }, auth.token);
      await load();
    } catch (error) {
      setFolders((current) => current.filter((folder) => folder.id !== optimistic.id));
      setMessage(error instanceof Error ? error.message : "创建收藏夹失败");
    }
  }

  async function renameFolder(folder: FavoriteFolder) {
    const name = window.prompt("收藏夹名称", folder.name)?.trim();
    if (!name || name === folder.name) return;
    const previous = folders;
    setFolders((current) => current.map((item) => item.id === folder.id ? { ...item, name } : item));
    try {
      await apiPatch(`/api/me/favorite-folders/${folder.id}`, { name, description: folder.description }, auth.token, folder.version ? { ifMatch: folder.version } : {});
      await load();
    } catch (error) {
      setFolders(previous);
      setMessage(error instanceof Error ? error.message : "重命名失败");
    }
  }

  async function deleteFolder(folder: FavoriteFolder) {
    if (!window.confirm(`删除收藏夹“${folder.name}”？收藏内容会保留到未分类。`)) return;
    const previous = folders;
    setFolders((current) => current.filter((item) => item.id !== folder.id));
    if (view === folder.id) setView("unfiled");
    try {
      await apiDelete(`/api/me/favorite-folders/${folder.id}`, auth.token, folder.version ? { ifMatch: folder.version } : {});
      await load();
      await auth.reloadProfile();
    } catch (error) {
      setFolders(previous);
      setMessage(error instanceof Error ? error.message : "删除收藏夹失败");
    }
  }

  async function deleteFavorite(favorite: Favorite) {
    const previous = pageData;
    setPageData((current) => ({ ...current, total: Math.max(0, current.total - 1), items: current.items.filter((item) => item.id !== favorite.id) }));
    try {
      await apiDelete(`/api/me/favorites/${favorite.id}`, auth.token, favorite.version ? { ifMatch: favorite.version } : {});
      await auth.reloadProfile();
      await load();
    } catch (error) {
      setPageData(previous);
      setMessage(error instanceof Error ? error.message : "删除收藏失败");
    }
  }

  async function applyBulk() {
    if (!selected.length || ((bulkMode === "add" || bulkMode === "remove") && !bulkFolderId)) return;
    const folderIds = bulkFolderId ? [bulkFolderId] : [];
    const previous = pageData;
    setPageData((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (!selected.includes(item.id)) return item;
        const next = bulkMode === "replace"
          ? folderIds
          : bulkMode === "add" ? [...new Set([...item.folderIds, ...folderIds])] : item.folderIds.filter((id) => !folderIds.includes(id));
        return { ...item, folderIds: next };
      })
    }));
    try {
      await apiPatch("/api/me/favorites/bulk", { favoriteIds: selected, folderIds, mode: bulkMode }, auth.token);
      setSelected([]);
      await Promise.all([load(), auth.reloadProfile()]);
    } catch (error) {
      setPageData(previous);
      setMessage(error instanceof Error ? error.message : "批量整理失败");
    }
  }

  return (
    <section className="favorites-page">
      <aside className="panel favorite-folders">
        <div className="panel-heading compact-heading"><div><h2>收藏夹</h2><p>删除收藏夹不会删除收藏。</p></div></div>
        <button type="button" className={view === "all" ? "active" : ""} onClick={() => setView("all")}>全部 <small>{auth.meProfile?.favorites.length ?? 0}</small></button>
        <button type="button" className={view === "unfiled" ? "active" : ""} onClick={() => setView("unfiled")}>未分类 <small>{auth.meProfile?.favorites.filter((item) => !item.folderIds.length).length ?? 0}</small></button>
        {folders.map((folder) => (
          <div className={view === folder.id ? "favorite-folder-row active" : "favorite-folder-row"} key={folder.id}>
            <button type="button" onClick={() => setView(folder.id)}>{folder.name}<small>{folder.itemCount ?? 0}</small></button>
            <button type="button" aria-label="重命名" onClick={() => void renameFolder(folder)}><Pencil size={14} /></button>
            <button type="button" aria-label="删除" onClick={() => void deleteFolder(folder)}><Trash2 size={14} /></button>
          </div>
        ))}
        <form className="favorite-folder-create" onSubmit={(event) => { event.preventDefault(); void createFolder(); }}>
          <input value={newFolder} maxLength={80} onChange={(event) => setNewFolder(event.target.value)} placeholder="新收藏夹名称" />
          <button type="submit" disabled={!newFolder.trim()}><FolderPlus size={16} />创建</button>
        </form>
      </aside>

      <div className="panel favorite-items">
        <div className="panel-heading"><div><h2>我的收藏</h2><p>{pageData.total} 项 · 失效项目仍可整理或删除</p></div></div>
        <div className="favorite-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或 ID" /></label>
          <select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部类型</option>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <select value={region} onChange={(event) => setRegion(event.target.value)}><option value="">全部区服</option>{["jp", "en", "tw", "kr", "cn"].map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select>
        </div>
        {selected.length > 0 && (
          <div className="favorite-bulk-bar">
            <strong>已选 {selected.length} 项</strong>
            <select value={bulkMode} onChange={(event) => setBulkMode(event.target.value as typeof bulkMode)}>
              <option value="add">添加到</option><option value="remove">从中移除</option><option value="replace">替换为</option>
            </select>
            <select value={bulkFolderId} onChange={(event) => setBulkFolderId(event.target.value)}>
              <option value="">{bulkMode === "replace" ? "未分类" : "选择收藏夹"}</option>
              {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
            </select>
            <button type="button" onClick={() => void applyBulk()}>应用</button>
          </div>
        )}
        {message && <p className="warning-text">{message}</p>}
        <div className="favorite-list">
          {pageData.items.map((favorite) => {
            const title = favorite.target?.displayName ?? favorite.label ?? `${typeLabels[favorite.type]} ${favorite.targetId}`;
            return (
              <article className={!favorite.target?.available ? "favorite-item unavailable" : "favorite-item"} key={favorite.id}>
                <input type="checkbox" checked={selected.includes(favorite.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, favorite.id] : current.filter((id) => id !== favorite.id))} />
                {favorite.target?.imageCandidates?.[0] ? <img src={apiResourceUrl(favorite.target.imageCandidates[0])} alt="" loading="lazy" /> : <span className="favorite-placeholder">{typeLabels[favorite.type].slice(0, 1)}</span>}
                <div><strong>{title}</strong><span>{favorite.target?.secondaryText ?? `${favorite.region.toUpperCase()} · ID ${favorite.targetId}`}</span><small>{favorite.target?.available === false ? "目标已失效" : favorite.folderIds.length ? `${favorite.folderIds.length} 个收藏夹` : "未分类"}</small></div>
                <button type="button" className="danger secondary" onClick={() => void deleteFavorite(favorite)}><Trash2 size={15} />删除</button>
              </article>
            );
          })}
        </div>
        {!pageData.items.length && <p className="empty-state">当前视图没有收藏。</p>}
      </div>
    </section>
  );
}
