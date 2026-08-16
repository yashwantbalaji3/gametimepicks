"use client";
/**
 * SearchableSelect — minimal accessible dropdown with type-to-search.
 *
 * Used by the homepage + Parlay Lab so the team and player pickers
 * stay simple on mobile and fast on desktop. No external dependency.
 *
 * UX rules:
 *   - Button shows the current selection (or placeholder).
 *   - Click opens a panel with a search input + scrollable option list.
 *   - Typing filters case-insensitively over `label` AND `searchText`
 *     (which can include team/full-name aliases — pass that in).
 *   - First explicit option is treated as the "All" clear value when
 *     `clearable` is true.
 *   - Esc closes; Enter selects the focused option; ArrowUp/Down
 *     navigates.
 *   - Closes on outside click and on selection.
 *   - Mobile: full-width panel under the button.
 *
 * Honest: this is a *display* component. It does not filter the data
 * pool itself — the parent passes filtered options based on whatever
 * context applies.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface SearchableOption {
  /** The value passed back to onChange. Use null for the "clear" entry. */
  value: string | null;
  /** What the user sees as the option's main label. */
  label: string;
  /** Optional secondary line shown under the label (e.g. team abbr). */
  sub?: string;
  /** Free-text aliases the search should match against (e.g. full team
   *  name, alt abbreviation). */
  searchText?: string;
  /** Optional renderable leading icon (e.g. PlayerAvatar / TeamLogo).
   *  Rendered in a 28px tall slot to the left of label/sub. Pure
   *  cosmetic — does NOT affect search or value. Use ReactNode so
   *  callers can pass any small component. */
  leadIcon?: ReactNode;
  /** Optional renderable trailing chip (e.g. edge percentage badge). */
  trailIcon?: ReactNode;
}

interface Props {
  label: string;
  placeholder?: string;
  value: string | null;
  options: SearchableOption[];
  onChange: (next: string | null) => void;
  /** Optional disabled state — renders the button but blocks the panel. */
  disabled?: boolean;
  /** Optional empty-pool message. */
  emptyMessage?: string;
  /** Optional max panel height in px. Defaults to 260. */
  maxPanelHeight?: number;
  /** Inline toolbar variant: hides the visible label-above and uses
   *  a shorter button. The label is still applied as `aria-label` for
   *  screen-reader users. Defaults to false. */
  compact?: boolean;
}

export default function SearchableSelect({
  label,
  placeholder = "Select…",
  value,
  options,
  onChange,
  disabled = false,
  emptyMessage = "No matches",
  maxPanelHeight = 260,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const id = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.sub ?? ""} ${o.searchText ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        buttonRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setFocusIdx(0);
      // Focus the search input on open.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  function commit(next: string | null) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[focusIdx]) commit(filtered[focusIdx].value);
    }
  }

  return (
    <div className="relative inline-block w-full">
      {!compact && (
        <span
          className="block font-mono uppercase tracking-[0.16em] mb-1"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {label}
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-label={compact ? label : undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="w-full inline-flex items-center justify-between gap-2 px-3 rounded-[6px]"
        style={{
          background: "rgba(11, 18, 14,0.55)",
          border: "1px solid var(--vault-border)",
          color: selected
            ? "var(--vault-text)"
            : "var(--vault-text-mute)",
          fontSize: 13,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          minHeight: compact ? 34 : 38,
          paddingTop: compact ? 6 : 8,
          paddingBottom: compact ? 6 : 8,
        }}
      >
        <span className="flex flex-col items-start min-w-0">
          <span className="truncate font-display" style={{ fontWeight: 500 }}>
            {selected ? selected.label : placeholder}
          </span>
          {selected?.sub && (
            <span
              className="font-mono truncate"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              {selected.sub}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && !disabled && (
        <div
          ref={panelRef}
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 left-0 right-0 rounded-[6px] overflow-hidden shadow-lg"
          style={{
            background: "rgba(11, 18, 14,0.96)",
            border: "1px solid var(--vault-border)",
            maxWidth: "100%",
          }}
        >
          <div
            className="p-2"
            style={{ borderBottom: "1px solid var(--vault-rule)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocusIdx(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Type to search…"
              className="w-full px-2 py-1.5 rounded-[4px] font-mono"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--vault-rule)",
                color: "var(--vault-text)",
                fontSize: 12,
              }}
              aria-label={`Search ${label.toLowerCase()}`}
            />
          </div>
          <div
            className="overflow-y-auto"
            style={{ maxHeight: maxPanelHeight, scrollbarWidth: "thin" }}
          >
            {filtered.length === 0 ? (
              <div
                className="px-3 py-3 font-mono text-center"
                style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
              >
                {emptyMessage}
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isActive = i === focusIdx;
                const isSelected = opt.value === value;
                return (
                  <button
                    key={`${opt.value ?? "_any"}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setFocusIdx(i)}
                    onClick={() => commit(opt.value)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2.5"
                    style={{
                      background: isActive
                        ? "rgba(52, 211, 153, 0.10)"
                        : "transparent",
                      borderLeft: isSelected
                        ? "3px solid var(--vault-gold-bright)"
                        : "3px solid transparent",
                      color: "var(--vault-text)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {opt.leadIcon ? (
                      <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 28, height: 28 }}>
                        {opt.leadIcon}
                      </span>
                    ) : null}
                    <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="font-display truncate" style={{ fontWeight: 500 }}>
                        {opt.label}
                      </span>
                      {opt.sub && (
                        <span
                          className="font-mono truncate"
                          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                        >
                          {opt.sub}
                        </span>
                      )}
                    </span>
                    {opt.trailIcon ? (
                      <span className="shrink-0 inline-flex items-center">
                        {opt.trailIcon}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
