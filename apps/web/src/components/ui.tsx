import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiResourceUrl } from "../api";

const pageSizeOptions = [12, 24, 48, 96];
const successfulImageSources = new Map<string, string>();
const failedImageSources = new Set<string>();

export function ArtImage({
  src,
  srcCandidates,
  label,
  variant = "square",
  eager = false,
  fallback
}: {
  src?: string;
  srcCandidates?: Array<string | undefined>;
  label: string;
  variant?: "square" | "card" | "wide" | "gacha" | "avatar";
  eager?: boolean;
  fallback?: ReactNode;
}) {
  const sources = useMemo(
    () => [...new Set([src, ...(srcCandidates ?? [])].filter((value): value is string => Boolean(value && value.trim())).map(apiResourceUrl))],
    [src, JSON.stringify(srcCandidates ?? [])]
  );
  const sourceKey = sources.join("|");
  const [resolvedSource, setResolvedSource] = useState(() => successfulImageSources.get(sourceKey) ?? "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    if (sources.length === 0) {
      setFailed(true);
      return;
    }

    const cached = successfulImageSources.get(sourceKey);
    if (cached) {
      setResolvedSource(cached);
      return;
    }

    const loadNext = (index: number) => {
      if (cancelled) return;
      const source = sources.slice(index).find((candidate) => !failedImageSources.has(candidate));
      if (!source) {
        if (!resolvedSource) setFailed(true);
        return;
      }
      const sourceIndex = sources.indexOf(source);
      const image = new Image();
      image.decoding = "async";
      image.onload = async () => {
        try { await image.decode(); } catch { /* onload is sufficient when decode is unavailable */ }
        if (!cancelled) {
          successfulImageSources.set(sourceKey, source);
          setResolvedSource(source);
        }
      };
      image.onerror = () => {
        failedImageSources.add(source);
        loadNext(sourceIndex + 1);
      };
      image.src = source;
    };
    loadNext(0);

    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  if (failed || sources.length === 0) {
    return (
      <div className={`art-fallback ${variant}`}>
        {fallback ?? <span>图片暂不可用</span>}
      </div>
    );
  }

  return (
    <span className={`art-frame ${variant}`}>
      {!resolvedSource && (
        <span className={`art-fallback ${variant}`}>
          <span>图片加载中</span>
        </span>
      )}
      {resolvedSource && <img className={`art-image ${variant}`} src={resolvedSource} alt={label} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" />}
    </span>
  );
}

export function Pagination({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <div className="pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft size={16} />
        上一页
      </button>
      <span>
        第 {page} / {totalPages} 页
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        下一页
        <ChevronRight size={16} />
      </button>
      <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
        {pageSizeOptions.map((size) => (
          <option key={size} value={size}>
            每页 {size}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DetailDrawer({ title, onClose, children, elevated = false }: { title: string; onClose: () => void; children: ReactNode; elevated?: boolean }) {
  return (
    <div className={`drawer-backdrop ${elevated ? "drawer-backdrop-elevated" : ""}`} onClick={onClose}>
      <aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭详情">
            <X size={18} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="ranking-tools">
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}
