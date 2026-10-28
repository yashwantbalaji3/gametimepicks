"use client";
/**
 * SITE SEARCH (P251 · F7).
 *
 * The site had nineteen filter boxes, each scoped to one board, and no way in from outside: a
 * reader who wanted "Ja'Marr Chase" or "the Yankees" had to already know which of 377 pages to
 * open. This is the way in.
 *
 * THE INDEX IS FETCHED, NOT BUNDLED. 108 KB of rows would be dead weight on every page for the
 * majority of readers who never search, so it loads on first open and is cached for the session.
 * Until it arrives the field says so rather than silently matching nothing.
 *
 * A RESULT IS A DOOR, NOT A SECOND SURFACE. Rows carry a label, a context line and a destination —
 * no probabilities, no prices. A search result that quoted a number could disagree with the page
 * it opens, and there is no version of that which is worth the convenience.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/a11y/use-dialog-focus";
import { useScrollLock } from "@/components/nav/use-scroll-lock";

/*
 * OVERNIGHT 2026-10-28 (W3) · THE DIALOG IS PORTALED TO <body>. Both places this search lives paint a backdrop filter —
 * the desktop rail (blur 12px) and the phone header (backdrop-blur-xl) — and a filtered element is the containing block
 * of every `position: fixed` descendant. So the "full-screen" dialog resolved to its host: on desktop it opened inside
 * the 232px rail (results 231px wide), on a phone inside the header strip. The phone Menu sheet hit the same trap and
 * fixed it the same way (mobile-bottom-nav.tsx). It mounts only after a click, so the server HTML is unaffected.
 *
 * ONE INSTANCE ANSWERS "/". The rail (desktop) and the phone header each mount a SiteSearch on every page, one of them
 * display:none at any width. Once the dialog left its host, both would open on "/", one over the other — so only a
 * VISIBLE trigger opens on the shortcut.
 *
 * On a phone the results are a full-screen sheet; from 640px a centred panel. The input is a combobox over a listbox,
 * so a screen reader hears the active result as the arrows move.
 */

interface Row { k: number; l: string; s: string; h: string; t: string }
interface Index { kinds: string[]; rows: Row[] }

const KIND_LABEL: Record<string, string> = { event: "Games & fights", player: "Players", team: "Teams", page: "Pages" };

export default function SiteSearch({ onOpenChange }: {
  /** The tablet Menu sheet hosts a SiteSearch and must stand down its own focus trap while search is open. */
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const [open, setOpenState] = useState(false);
  /* Called from the event that opens or closes, so the host's state lands in the SAME commit as ours — the host's focus
     trap then hands over without a frame in which both trap the Tab key. */
  const setOpen = useCallback((next: boolean) => { setOpenState(next); onOpenChange?.(next); }, [onOpenChange]);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<Index | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const load = useCallback(() => {
    if (index || loading) return;
    setLoading(true);
    fetch("/data/search/index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Index) => setIndex(j))
      .catch(() => setIndex({ kinds: [], rows: [] }))
      .finally(() => setLoading(false));
  }, [index, loading]);

  /* "/" opens it from anywhere, unless the reader is already typing somewhere. Escape, Tab
     containment and focus return are the shared dialog primitive's, not this component's. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      /* offsetParent is null for a trigger inside a display:none host (the rail on a phone, the phone header on desktop). */
      const visible = triggerRef.current?.offsetParent != null;
      if (e.key === "/" && !typing && !open && visible) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const closeSearch = useCallback(() => setOpen(false), [setOpen]);
  useDialogFocus(dialogRef, { onClose: closeSearch, active: open, initialFocus: inputRef });
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!index || query.length < 2) return [];
    const words = query.split(/\s+/);
    const scored: Array<Row & { score: number }> = [];
    for (const r of index.rows) {
      if (!words.every((w) => r.t.includes(w))) continue;
      /* A name that STARTS with what was typed is what the reader meant; kind order breaks ties,
         which is why events and players sit above pages. */
      const lower = r.l.toLowerCase();
      const score = (lower.startsWith(query) ? 0 : lower.includes(query) ? 1 : 2) * 10 + r.k;
      scored.push({ ...r, score });
      if (scored.length > 400) break;
    }
    return scored.sort((a, b) => a.score - b.score || a.l.localeCompare(b.l)).slice(0, 24);
  }, [q, index]);

  useEffect(() => { setActive(0); }, [q]);

  const go = (href: string) => { setOpen(false); window.location.href = href; };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Home" && results.length) { e.preventDefault(); setActive(0); }
    else if (e.key === "End" && results.length) { e.preventDefault(); setActive(results.length - 1); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active].h); }
  };
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={load}
        aria-label="Search players, teams and games"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="gtp-site-search-trigger inline-flex items-center gap-2 rounded-full"
        style={{
          border: "1px solid var(--vault-rule)", background: "transparent", color: "var(--vault-text-mute)",
          /* 44px: the phone header and the Menu sheet carry this trigger, and a finger needs the full target. */
          fontSize: 12, padding: "0 12px", minHeight: 44, width: "100%", justifyContent: "flex-start",
        }}
      >
        <span aria-hidden style={{ fontSize: 12 }}>⌕</span>
        <span>Search</span>
        <span aria-hidden className="font-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", borderRadius: 4, padding: "0 4px" }}>/</span>
      </button>

      {open ? createPortal(
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Search players, teams, games and pages"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          className="fixed inset-0 flex justify-center items-stretch sm:items-start p-0 sm:px-4 sm:pb-4 sm:pt-[10vh]"
          style={{
            zIndex: 120,
            background: "color-mix(in srgb, var(--vault-ink-black) 72%, transparent)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            className="flex flex-col w-full sm:w-[min(620px,100%)] h-full sm:h-auto overflow-hidden sm:rounded-[14px]"
            style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border-strong)", boxShadow: "0 30px 70px -30px var(--vault-ink-black)", paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 14px", borderBottom: "1px solid var(--vault-rule)" }}>
              <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>⌕</span>
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={results.length > 0}
                aria-controls={listId}
                aria-activedescendant={results[active] ? optionId(active) : undefined}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search players, teams and games…"
                aria-label="Search players, teams and games"
                autoComplete="off"
                /* 16px: iOS zooms the page into any focused field set smaller. */
                style={{ flex: 1, minWidth: 0, minHeight: 44, background: "transparent", border: 0, outline: "none", color: "var(--vault-text)", fontSize: 16 }}
              />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close search (Esc)"
                className="font-mono shrink-0" style={{ background: "transparent", border: "1px solid var(--vault-rule)", borderRadius: 6, color: "var(--vault-text-faint)", fontSize: 11, minHeight: 44, minWidth: 44, padding: "0 8px" }}>
                <span className="sm:hidden">Close</span><span className="hidden sm:inline">ESC</span>
              </button>
            </div>

            <div ref={listRef} className="flex-1 sm:flex-none overflow-y-auto sm:max-h-[min(52vh,460px)]" style={{ overscrollBehavior: "contain" }}>
              {loading && !index ? (
                <p role="status" style={{ margin: 0, padding: "18px 16px", fontSize: 13, color: "var(--vault-text-mute)" }}>Loading search…</p>
              ) : q.trim().length < 2 ? (
                <p style={{ margin: 0, padding: "18px 16px", fontSize: 13, color: "var(--vault-text-mute)" }}>
                  Type at least two letters. {index ? `${index.rows.length.toLocaleString("en-US")} players, teams, games and pages to search.` : ""}
                </p>
              ) : results.length === 0 ? (
                /* An empty result says what was searched, so a reader can tell "not here" from
                   "not published" — the same distinction the rest of the site keeps. */
                <p role="status" style={{ margin: 0, padding: "18px 16px", fontSize: 13, color: "var(--vault-text-mute)" }}>
                  Nothing published right now matches &ldquo;{q.trim()}&rdquo;. Search covers current games, the teams and players on them, and every page in the menu.
                </p>
              ) : (
                <div id={listId} role="listbox" aria-label="Search results">
                {results.map((r, i) => (
                  <a
                    key={`${r.h}-${r.l}`}
                    id={optionId(i)}
                    href={r.h}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    /* Wraps instead of squeezing: on a phone a long subtitle drops under the name rather than pushing it
                       off the row. 44px rows — a result is a tap target. */
                    className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5"
                    style={{
                      minHeight: 44, padding: "9px 14px",
                      textDecoration: "none", color: "inherit",
                      background: i === active ? "var(--vault-gold-dim)" : "transparent",
                      borderTop: i === 0 ? "none" : "1px solid var(--vault-rule)",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--vault-text)" }}>{r.l}</span>
                    <span style={{ fontSize: 12, color: "var(--vault-text-faint)", marginLeft: "auto", textAlign: "right" }}>{r.s}</span>
                  </a>
                ))}
                </div>
              )}
            </div>

            {results.length ? (
              <div className="font-mono" style={{ padding: "7px 14px", borderTop: "1px solid var(--vault-rule)", fontSize: 11, color: "var(--vault-text-faint)", display: "flex", gap: 14 }}>
                <span className="hidden sm:inline">↑↓ move</span><span className="hidden sm:inline">↵ open</span><span className="hidden sm:inline">esc close</span>
                <span role="status" className="sr-only">{`${results.length} result${results.length === 1 ? "" : "s"}`}</span>
                <span style={{ marginLeft: "auto" }}>{KIND_LABEL[index?.kinds[results[active]?.k] ?? ""] ?? ""}</span>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
