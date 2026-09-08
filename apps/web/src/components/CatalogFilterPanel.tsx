import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { apiResourceUrl } from "../api";
import { catalogFilterOptionLabel } from "../playerLabels";

export type CatalogFilterOption = {
  value: string;
  label: string;
  count: number;
  iconKey?: string;
  iconCandidates?: string[];
  color?: string;
};

export type CatalogFilterGroup = {
  key: string;
  label: string;
  selection: "multi";
  match: "any" | "all";
  options: CatalogFilterOption[];
};

export type CatalogFilterMeta = {
  groups?: CatalogFilterGroup[];
  toggles?: Array<{ key: string; label: string; value: boolean }>;
};

type ActiveFilter = { key: string; value: string; label: string; toggle?: boolean };

function OptionIcon({ option }: { option: CatalogFilterOption }) {
  const image = option.iconCandidates?.[0];
  if (image) return <img className="catalog-filter-icon" src={apiResourceUrl(image)} alt="" loading="lazy" />;
  if (option.color) return <span className="catalog-filter-swatch" style={{ backgroundColor: option.color }} aria-hidden="true" />;
  if (option.iconKey?.startsWith("rarity:")) {
    const number = option.value.match(/\d+/)?.[0];
    return <span className="catalog-filter-symbol" aria-hidden="true">{number ? `${number}★` : "★"}</span>;
  }
  if (option.iconKey?.startsWith("unit:")) return <span className="catalog-filter-symbol" aria-hidden="true">{option.label.slice(0, 2)}</span>;
  return null;
}

export function CatalogFilterPanel({
  meta,
  selected,
  toggles,
  total,
  onToggle,
  onToggleBoolean,
  onClear
}: {
  meta?: CatalogFilterMeta;
  selected: Record<string, string[]>;
  toggles: Record<string, boolean>;
  total: number;
  onToggle: (key: string, value: string) => void;
  onToggleBoolean: (key: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = meta?.groups ?? [];
  const toggleOptions = meta?.toggles ?? [];
  const activeCount = Object.values(selected).reduce((sum, values) => sum + values.length, 0) + Object.values(toggles).filter(Boolean).length;
  const activeFilters: ActiveFilter[] = [
    ...groups.flatMap((group) => group.options.filter((option) => selected[group.key]?.includes(option.value)).map((option) => ({ key: group.key, value: option.value, label: `${group.label}：${catalogFilterOptionLabel(group.key, option.value, option.label)}` }))),
    ...toggleOptions.filter((toggle) => toggles[toggle.key]).map((toggle) => ({ key: toggle.key, value: "", label: toggle.label, toggle: true }))
  ];
  if (!groups.length && !toggleOptions.length) return null;
  return (
    <details
      className="catalog-filter-panel"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next !== open) setOpen(next);
      }}
      >
      <summary>
        <span><SlidersHorizontal size={17} />筛选</span>
        <span className="catalog-filter-summary-meta"><small>{total} 条结果{activeCount ? ` · 已选 ${activeCount}` : ""}</small>{activeFilters.slice(0, 2).map((filter) => <i key={`${filter.key}:${filter.value}`}>{filter.label}</i>)}{activeFilters.length > 2 && <i>另 {activeFilters.length - 2} 项</i>}</span>
      </summary>
      <div className="catalog-filter-content">
        {activeFilters.length > 0 && <div className="catalog-filter-chips" aria-label="已选筛选条件">
          {activeFilters.map((filter) => <button type="button" key={`${filter.key}:${filter.value}`} onClick={() => filter.toggle ? onToggleBoolean(filter.key) : onToggle(filter.key, filter.value)}>{filter.label}<X size={13} aria-hidden="true" /></button>)}
        </div>}
        {groups.map((group) => (
          <fieldset className="catalog-filter-group" key={group.key}>
            <legend>{group.label}{group.match === "all" && <small>需同时满足</small>}</legend>
            <div className="catalog-filter-options">
              {group.options.map((option) => {
                const active = selected[group.key]?.includes(option.value) ?? false;
                const optionLabel = catalogFilterOptionLabel(group.key, option.value, option.label);
                return (
                  <button
                    type="button"
                    className={active ? "active" : ""}
                    aria-pressed={active}
                    key={option.value}
                    onClick={() => onToggle(group.key, option.value)}
                  >
                    <OptionIcon option={option} />
                    <span>{optionLabel}</span>
                    <small>{option.count}</small>
                    {active && <Check size={13} />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        {toggleOptions.length > 0 && (
          <div className="catalog-filter-toggles">
            {toggleOptions.map((toggle) => (
              <label key={toggle.key}>
                <input type="checkbox" checked={Boolean(toggles[toggle.key])} onChange={() => onToggleBoolean(toggle.key)} />
                {toggle.label}
              </label>
            ))}
          </div>
        )}
        <div className="catalog-filter-actions">
          {activeCount > 0 && <button type="button" className="secondary catalog-filter-clear" onClick={onClear}><RotateCcw size={15} />清空筛选</button>}
          <button type="button" onClick={() => setOpen(false)}>查看 {total} 条结果</button>
        </div>
      </div>
    </details>
  );
}
