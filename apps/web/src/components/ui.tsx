import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiResourceUrl } from "../api";
import { nextArtImageSource, shouldRetryArtImageOnReentry, shouldStartArtImageLoad } from "../artImageState";

const pageSizeOptions = [12, 24, 48, 96];
const successfulImageSources = new Map<string, string>();

let lockedDialogCount = 0;
let savedBodyOverflow = "";
let savedBodyPaddingRight = "";
const dialogStack: symbol[] = [];

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hasAttribute("hidden") && element.offsetParent !== null);
}

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
  variant?: "square" | "card" | "event" | "honor" | "wide" | "gacha" | "comic" | "avatar";
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
  const [nearViewport, setNearViewport] = useState(eager);
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLSpanElement | null>(null);
  const failedSourcesRef = useRef(new Set<string>());
  const failedRef = useRef(false);

  useEffect(() => {
    const cached = successfulImageSources.get(sourceKey);
    setResolvedSource(cached ?? "");
    setFailed(false);
    failedRef.current = false;
    failedSourcesRef.current.clear();
    setNearViewport(eager || Boolean(cached));
    setAttempt(0);
  }, [eager, sourceKey]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || sources.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    let wasNearViewport = eager || Boolean(successfulImageSources.get(sourceKey));
    const observer = new IntersectionObserver((entries) => {
      const isNearViewport = entries.some((entry) => entry.isIntersecting);
      if (shouldRetryArtImageOnReentry({ failed: failedRef.current, wasNearViewport, nearViewport: isNearViewport })) {
        failedSourcesRef.current.clear();
        failedRef.current = false;
        setFailed(false);
        setAttempt((current) => current + 1);
      }
      wasNearViewport = isNearViewport;
      setNearViewport(isNearViewport);
    }, { rootMargin: "600px 0px" });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [eager, sourceKey, sources.length]);

  useEffect(() => {
    let cancelled = false;
    const cached = successfulImageSources.get(sourceKey);
    if (sources.length === 0) {
      failedRef.current = true;
      setFailed(true);
      return;
    }
    if (!shouldStartArtImageLoad({ eager, cachedSource: cached, nearViewport })) return;
    if (cached) {
      setResolvedSource(cached);
      return;
    }

    const loadNext = (index: number) => {
      if (cancelled) return;
      const source = nextArtImageSource(sources.slice(index), failedSourcesRef.current);
      if (!source) {
        failedRef.current = true;
        setFailed(true);
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
        failedSourcesRef.current.add(source);
        loadNext(sourceIndex + 1);
      };
      image.src = source;
    };
    loadNext(0);

    return () => {
      cancelled = true;
    };
  }, [attempt, eager, nearViewport, sourceKey, sources]);

  const recoverFromDisplayedImageFailure = () => {
    if (!resolvedSource) return;
    if (successfulImageSources.get(sourceKey) === resolvedSource) successfulImageSources.delete(sourceKey);
    failedSourcesRef.current.add(resolvedSource);
    failedRef.current = false;
    setResolvedSource("");
    setFailed(false);
    setAttempt((current) => current + 1);
  };

  if (sources.length === 0) {
    return (
      <span className={`art-fallback ${variant}`} title="重新进入可视区域后会再次尝试加载">
        {fallback ?? <span>图片暂不可用</span>}
      </span>
    );
  }

  return (
    <span ref={frameRef} className={`art-frame ${variant}`}>
      {(!resolvedSource || failed) && (
        <span className={`art-fallback ${variant}`}>
          {failed ? (fallback ?? <span title="重新进入可视区域后会再次尝试加载">图片暂不可用</span>) : <span>图片加载中</span>}
        </span>
      )}
      {resolvedSource && !failed && <img className={`art-image ${variant}`} src={resolvedSource} alt={label} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" onError={recoverFromDisplayedImageFailure} />}
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

function useDialogAccessibility(onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dialogId = useMemo(() => Symbol("detail-drawer"), []);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(dialogId);
    lockedDialogCount += 1;
    if (lockedDialogCount === 1) {
      savedBodyOverflow = document.body.style.overflow;
      savedBodyPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    const timer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      (focusableElements(dialog)[0] ?? dialog).focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialogId) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown, true);
      const stackIndex = dialogStack.lastIndexOf(dialogId);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
      lockedDialogCount = Math.max(0, lockedDialogCount - 1);
      if (lockedDialogCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
        document.body.style.paddingRight = savedBodyPaddingRight;
      }
      openerRef.current?.focus();
    };
  }, []);

  return { dialogRef, titleId, close: () => onCloseRef.current() };
}

export function DetailDrawer({ title, onClose, children, elevated = false, topmost = false }: { title: string; onClose: () => void; children: ReactNode; elevated?: boolean; topmost?: boolean }) {
  const { dialogRef, titleId, close } = useDialogAccessibility(onClose);

  return (
    <div className={`drawer-backdrop ${elevated ? "drawer-backdrop-elevated" : ""} ${topmost ? "drawer-backdrop-topmost" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <aside ref={dialogRef} className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="drawer-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭详情">
            <X size={18} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function ModalDialog({
  label,
  onClose,
  children,
  backdropClassName = "modal-backdrop",
  className = "content-detail-modal"
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  backdropClassName?: string;
  className?: string;
}) {
  const { dialogRef, close } = useDialogAccessibility(onClose);
  return <div className={backdropClassName} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <article ref={dialogRef} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</article>
  </div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="ranking-tools">
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}
