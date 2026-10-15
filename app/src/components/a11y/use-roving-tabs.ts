"use client";
/**
 * GTP-13 (UX Release 2B) — ONE keyboard model for every `role="tablist"` on the site.
 *
 * The MLB game report and the /live sport switcher rendered `role="tab"` buttons that only answered clicks:
 * a keyboard user had to Tab through every tab, ArrowRight did nothing, and no tab named the panel it
 * controls. This is the WAI-ARIA tabs pattern, generalised from parlay-lab-mode-tabs (which already did
 * ArrowLeft/Right) and extended with Home/End, a single tab stop (roving tabindex) and the
 * `aria-controls` / `aria-labelledby` pairing.
 *
 * Activation follows focus ("automatic activation"), which suits tabs whose panels are already rendered on
 * the page — every tablist that uses this hook.
 *
 * Usage:
 *   const tabs = useRovingTabs({ keys, active, onChange, idBase });
 *   <div {...tabs.listProps} aria-label="…">{keys.map((k) => <button {...tabs.tabProps(k)}>…</button>)}</div>
 *   <div {...tabs.panelProps(active)}>…</div>
 */
import { useCallback, useRef, type KeyboardEvent } from "react";

export interface RovingTabsOptions<K extends string> {
  keys: readonly K[];
  active: K;
  onChange: (next: K) => void;
  /** A stable id prefix (React `useId()` output is fine). Tab ids are `${idBase}-tab-${key}`. */
  idBase: string;
}

/** Pure: which key a navigation key moves to. Exported for tests. */
export function nextTabKey<K extends string>(keys: readonly K[], active: K, key: string): K | null {
  const i = keys.indexOf(active);
  if (i === -1 || keys.length === 0) return null;
  switch (key) {
    case "ArrowRight": return keys[(i + 1) % keys.length];
    case "ArrowLeft": return keys[(i - 1 + keys.length) % keys.length];
    case "Home": return keys[0];
    case "End": return keys[keys.length - 1];
    default: return null;
  }
}

export function useRovingTabs<K extends string>({ keys, active, onChange, idBase }: RovingTabsOptions<K>) {
  const refs = useRef(new Map<K, HTMLElement | null>());
  const tabId = (k: K) => `${idBase}-tab-${k}`;
  const panelId = (k: K) => `${idBase}-panel-${k}`;

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    /* Navigate from the tab that HAS focus (a click or script can focus a tab that is not selected), falling back
       to the selected one. */
    const focused = keys.find((k) => refs.current.get(k) === e.target) ?? active;
    const next = nextTabKey(keys, focused, e.key);
    if (next == null) return;
    e.preventDefault();
    onChange(next);
    refs.current.get(next)?.focus();
  }, [keys, active, onChange]);

  return {
    listProps: { role: "tablist" as const, onKeyDown },
    tabProps: (k: K) => ({
      ref: (el: HTMLElement | null) => { refs.current.set(k, el); },
      id: tabId(k),
      role: "tab" as const,
      type: "button" as const,
      "aria-selected": k === active,
      "aria-controls": panelId(k),
      tabIndex: k === active ? 0 : -1,
      onClick: () => onChange(k),
    }),
    panelProps: (k: K) => ({
      id: panelId(k),
      role: "tabpanel" as const,
      "aria-labelledby": tabId(k),
      tabIndex: 0,
    }),
  };
}
