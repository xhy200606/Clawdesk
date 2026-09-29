import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n/index.ts";

// ─── Types ───────────────────────────────────────────────────

export type DropdownItem = {
  value: string;
  label: string;
};

export type DropdownGroup = {
  label: string;
  items: DropdownItem[];
};

export type DropdownProps = {
  value: string | null;
  placeholder?: string;
  items?: DropdownItem[];
  groups?: DropdownGroup[];
  open: boolean;
  disabled?: boolean;
  expandedGroups?: Set<string>;
  onSelect: (value: string) => void;
  onToggle: () => void;
  onGroupToggle?: (label: string) => void;
};

// ─── Helpers ─────────────────────────────────────────────────

function findLabel(value: string, items?: DropdownItem[], groups?: DropdownGroup[]): string {
  if (items) {
    const found = items.find((i) => i.value === value);
    if (found) return found.label;
  }
  if (groups) {
    for (const group of groups) {
      const found = group.items.find((i) => i.value === value);
      if (found) return found.label;
    }
  }
  return value;
}

// ─── Component ───────────────────────────────────────────────

export function Dropdown(props: DropdownProps) {
  const {
    value,
    placeholder,
    items,
    groups,
    open,
    disabled,
    expandedGroups,
    onSelect,
    onToggle,
    onGroupToggle,
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);

  const placePanel = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const showAbove = below < 220 && above > below;
    const maxHeight = Math.max(1, Math.min(320, showAbove ? above : below));
    const width = Math.min(rect.width, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const top = showAbove ? Math.max(margin, rect.top - maxHeight - 4) : rect.bottom + 4;
    setPanelStyle({ position: "fixed", top, left, right: "auto", width, maxHeight, zIndex: 1000 });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placePanel();
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [open, placePanel]);

  const displayLabel = value
    ? findLabel(value, items, groups)
    : (placeholder ?? t("shared.select"));

  const hasItems =
    (items && items.length > 0) || (groups && groups.some((g) => g.items.length > 0));

  const expanded = expandedGroups ?? new Set<string>();

  // Cierra el dropdown al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        !panelRef.current?.contains(e.target as Node)
      ) {
        onToggle();
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [open, onToggle]);

  const handleTriggerClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle();
    },
    [onToggle],
  );

  const cls = ["oc-dropdown", open && "oc-dropdown--open", disabled && "oc-dropdown--disabled"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} ref={ref}>
      <button
        type="button"
        className="oc-dropdown__trigger"
        disabled={disabled}
        onClick={handleTriggerClick}
      >
        <span className={`oc-dropdown__label${!value ? " oc-dropdown__label--placeholder" : ""}`}>
          {displayLabel}
        </span>
        <span className="oc-dropdown__chevron">{open ? "▴" : "▾"}</span>
      </button>

      {open &&
        panelStyle &&
        createPortal(
          <div
            ref={panelRef}
            className="oc-dropdown__panel"
            style={panelStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {!hasItems && (
              <div className="oc-dropdown__empty">{t("agentsView.noConfiguredModels")}</div>
            )}

            {/* Flat items */}
            {items?.map((item) => {
              const active = item.value === value;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`oc-dropdown__item${active ? " oc-dropdown__item--active" : ""}`}
                  onClick={() => onSelect(item.value)}
                >
                  <span className="oc-dropdown__check">{active ? "✓" : ""}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* Grouped items */}
            {groups?.map((group) => {
              const isExpanded = expanded.has(group.label);
              return (
                <div className="oc-dropdown__group" key={group.label}>
                  <button
                    type="button"
                    className="oc-dropdown__group-header"
                    onClick={() => onGroupToggle?.(group.label)}
                  >
                    <span
                      className={`oc-dropdown__group-chevron${isExpanded ? " oc-dropdown__group-chevron--open" : ""}`}
                    >
                      ▸
                    </span>
                    <span className="oc-dropdown__group-label">{group.label}</span>
                    <span className="oc-dropdown__group-count">{group.items.length}</span>
                  </button>
                  {isExpanded &&
                    group.items.map((item) => {
                      const active = item.value === value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          className={`oc-dropdown__item oc-dropdown__item--grouped${active ? " oc-dropdown__item--active" : ""}`}
                          onClick={() => onSelect(item.value)}
                        >
                          <span className="oc-dropdown__check">{active ? "✓" : ""}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
