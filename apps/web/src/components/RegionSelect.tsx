import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import "./RegionSelect.css";

type RegionOption = { id: string; name: string };
type MenuPosition = { left: number; top: number; width: number; maxHeight: number };

type RegionSelectProps = {
  value: string;
  options: RegionOption[];
  onChange: (region: string) => void;
  ariaLabel?: string;
  className?: string;
};

function clampIndex(index: number, count: number) {
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

export function RegionSelect({ value, options, onChange, ariaLabel = "选择区服", className = "" }: RegionSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = useMemo(() => Math.max(0, options.findIndex((option) => option.id === value)), [options, value]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const menuReady = Boolean(position);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= viewportHeight) {
      close();
      return;
    }
    const availableWidth = Math.max(120, viewportWidth - 24);
    const width = Math.min(Math.max(rect.width, 144), availableWidth);
    const maxHeight = Math.max(44, Math.min(280, viewportHeight - 24));
    const fullMenuHeight = Math.min(maxHeight, options.length * 44 + 8);
    const fitsBelow = viewportHeight - rect.bottom >= Math.min(fullMenuHeight + 8, 120);
    const top = fitsBelow
      ? Math.min(rect.bottom + 6, viewportHeight - maxHeight - 12)
      : Math.max(12, rect.top - fullMenuHeight - 6);
    const left = Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12));
    setPosition({ left, top, width, maxHeight });
  }, [close, options.length]);

  const openAt = useCallback((index = selectedIndex) => {
    if (!options.length) return;
    setActiveIndex(clampIndex(index, options.length));
    setOpen(true);
  }, [options.length, selectedIndex]);

  const choose = useCallback((index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    close(true);
  }, [close, onChange, options]);

  const moveActive = useCallback((nextIndex: number) => {
    setActiveIndex(clampIndex(nextIndex, options.length));
  }, [options.length]);

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!options.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(open ? activeIndex + 1 : selectedIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(open ? activeIndex - 1 : selectedIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      openAt(options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) close(); else openAt();
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveActive(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      triggerRef.current?.focus();
      close();
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onScrollOrResize);
    if (triggerRef.current) observer?.observe(triggerRef.current);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      observer?.disconnect();
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [close, open]);

  useEffect(() => {
    if (!open || !menuReady) return;
    const option = optionRefs.current[activeIndex];
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, menuReady, open]);

  useEffect(() => {
    if (!open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  const selectedOption = options.find((option) => option.id === value) ?? options[0];
  const rootClassName = ["region-select", className].filter(Boolean).join(" ");

  return <div className={rootClassName}>
    <button
      ref={triggerRef}
      type="button"
      className="region-select__trigger"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      onClick={() => open ? close() : openAt()}
      onKeyDown={onTriggerKeyDown}
    >
      <span>{selectedOption?.name ?? "区服"}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && position && typeof document !== "undefined" && createPortal(
      <div
        ref={menuRef}
        id={listboxId}
        className="region-select__menu"
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={`${listboxId}-option-${activeIndex}`}
        style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
        onKeyDown={onMenuKeyDown}
      >
        {options.map((option, index) => <button
          ref={(element) => { optionRefs.current[index] = element; }}
          id={`${listboxId}-option-${index}`}
          key={option.id}
          type="button"
          role="option"
          aria-selected={option.id === value}
          className="region-select__option"
          tabIndex={index === activeIndex ? 0 : -1}
          onMouseMove={() => setActiveIndex(index)}
          onClick={() => choose(index)}
        >
          <span>{option.name}</span>
          {option.id === value && <span className="region-select__check" aria-hidden="true">✓</span>}
        </button>)}
      </div>,
      document.body
    )}
  </div>;
}