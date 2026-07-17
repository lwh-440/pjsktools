import { Heart } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiDelete, apiPatch, apiPost } from "../api";
import { useAuth } from "../AuthContext";
import type { Favorite, FavoriteType } from "../sharedTypes";

export function FavoriteButton({
  type,
  region,
  targetId,
  label,
  compact = false
}: {
  type: FavoriteType;
  region: string;
  targetId: string;
  label?: string;
  compact?: boolean;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const stored = auth.meProfile?.favorites.find((item) => item.type === type && item.region === region && item.targetId === targetId);
  const [favorite, setFavorite] = useState<Favorite | undefined>(stored);
  const [folderIds, setFolderIds] = useState<string[]>(stored?.folderIds ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFavorite(stored);
    setFolderIds(stored?.folderIds ?? []);
  }, [stored?.id, stored?.updatedAt]);

  function requireLogin() {
    navigate(`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
  }

  async function toggleFavorite(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!auth.isAuthenticated) return requireLogin();
    if (busy) return;
    setBusy(true);
    const previous = favorite;
    try {
      if (favorite) {
        setFavorite(undefined);
        await apiDelete(`/api/me/favorites/${favorite.id}`, auth.token, favorite.version ? { ifMatch: favorite.version } : {});
      } else {
        const optimistic = { id: "pending", type, region, targetId, label, folderIds, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Favorite;
        setFavorite(optimistic);
        setFavorite(await apiPost<Favorite>("/api/me/favorites", { type, region, targetId, label, folderIds }, auth.token));
      }
      await auth.reloadProfile();
    } catch (error) {
      setFavorite(previous);
      auth.setAuthMessage(error instanceof Error ? error.message : "收藏操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function changeFolder(folderId: string, checked: boolean) {
    if (!auth.isAuthenticated) return requireLogin();
    const previousIds = folderIds;
    const nextIds = checked ? [...new Set([...folderIds, folderId])] : folderIds.filter((id) => id !== folderId);
    setFolderIds(nextIds);
    setBusy(true);
    try {
      const current = favorite ?? await apiPost<Favorite>("/api/me/favorites", { type, region, targetId, label, folderIds: [] }, auth.token);
      const updated = await apiPatch<Favorite>(`/api/me/favorites/${current.id}`, { folderIds: nextIds }, auth.token, current.version ? { ifMatch: current.version } : {});
      setFavorite(updated);
      await auth.reloadProfile();
    } catch (error) {
      setFolderIds(previousIds);
      auth.setAuthMessage(error instanceof Error ? error.message : "整理收藏夹失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`favorite-control ${compact ? "compact" : ""}`} onClick={(event) => event.stopPropagation()}>
      <button type="button" className={favorite ? "favorite-toggle active" : "favorite-toggle"} disabled={busy} onClick={toggleFavorite} aria-label={favorite ? "取消收藏" : "收藏"}>
        <Heart size={compact ? 16 : 18} fill={favorite ? "currentColor" : "none"} />
        {!compact && (favorite ? "已收藏" : "收藏")}
      </button>
      {auth.isAuthenticated && favorite && (
        <details className="favorite-folder-picker">
          <summary>收藏夹</summary>
          <div>
            {(auth.meProfile?.favoriteFolders ?? []).map((folder) => (
              <label key={folder.id}>
                <input type="checkbox" checked={folderIds.includes(folder.id)} disabled={busy} onChange={(event) => void changeFolder(folder.id, event.target.checked)} />
                {folder.name}
              </label>
            ))}
            {!auth.meProfile?.favoriteFolders?.length && <small>暂无收藏夹，可在“我的收藏”中创建。</small>}
            <a href="/me/favorites">管理收藏夹</a>
          </div>
        </details>
      )}
    </span>
  );
}
