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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Row { k: number; l: string; s: string; h: string; t: string }
interface Index { kinds: string[]; rows: Row[] }

const KIND_LABEL: Record<string, string> = { event: "Games & fights", player: "Players", team: "Teams", page: "Pages" };

export default function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<Index | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (index || loading) return;
    setLoading(true);
    fetch("/data/search/index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Index) => setIndex(j))
      .catch(() => setIndex({ kinds: [], rows: [] }))
      .finally(() => setLoading(false));
  }, [index, loading]);

  /* "/" opens it from anywhere, unless the reader is already typing somewhere. Escape closes. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing && !open) { e.preventDefault(); setOpen(true); }
      else if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
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
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active].h); }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={load}
        aria-label="Search players, teams and games"
        className="gtp-site-search-trigger inline-flex items-center gap-2 rounded-full"
        style={{
          border: "1px solid var(--vault-rule)", background: "transparent", color: "var(--vault-text-mute)",
          fontSize: 12, padding: "0 12px", minHeight: 34, width: "100%", justifyContent: "flex-start",
        }}
      >
        <span aria-hidden style={{ fontSize: 12 }}>⌕</span>
        <span>Search</span>
        <span aria-hidden className="font-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", borderRadius: 4, padding: "0 4px" }}>/</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 120, display: "flex", justifyContent: "center",
            alignItems: "flex-start", padding: "10vh 16px 16px",
            background: "color-mix(in srgb, var(--vault-ink-black) 72%, transparent)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div style={{ width: "min(620px, 100%)", background: "var(--vault-panel)", border: "1px solid var(--vault-border-strong)", borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 70px -30px var(--vault-ink-black)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--vault-rule)" }}>
              <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>⌕</span>
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search players, teams and games…"
                aria-label="Search players, teams and games"
                style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--vault-text)", fontSize: 15 }}
              />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close search"
                className="font-mono" style={{ background: "transparent", border: "1px solid var(--vault-rule)", borderRadius: 6, color: "var(--vault-text-faint)", fontSize: 10, padding: "2px 6px" }}>ESC</button>
            </div>

            <div ref={listRef} style={{ maxHeight: "min(52vh, 460px)", overflowY: "auto" }}>
              {loading && !index ? (
                <p style={{ margin: 0, padding: "18px 16px", fontSize: 13, color: "var(--vault-text-mute)" }}>Loading the index…</p>
              ) : q.trim().length < 2 ? (
                <p style={{ margin: 0, padding: "18px 16px", fontSize: 13, color: "var(--vault-text-mute)" }}>
                  Type at least two letters. {index ? `${index.rows.length.toLocaleString()} players, teams, games and pages are indexed.` : ""}
                </p>
              ) : results.length === 0 ? (
                /* An empty result says what was searched, so a reader can tell "not here" from
                   "not published" — the same distinction the rest of the site keeps. */
                <p style={{ margin: 0, padding: "18px 16px", fontSize: 13, color: "var(--vault-text-mute)" }}>
                  Nothing published right now matches &ldquo;{q.trim()}&rdquo;. Only players and games on a current board are indexed.
                </p>
              ) : (
                results.map((r, i) => (
                  <a
                    key={`${r.h}-${r.l}`}
                    href={r.h}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    style={{
                      display: "flex", alignItems: "baseline", gap: 10, padding: "9px 14px",
                      textDecoration: "none", color: "inherit",
                      background: i === active ? "var(--vault-gold-dim)" : "transparent",
                      borderTop: i === 0 ? "none" : "1px solid var(--vault-rule)",
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--vault-text)" }}>{r.l}</span>
                    <span style={{ fontSize: 11.5, color: "var(--vault-text-faint)", marginLeft: "auto", textAlign: "right" }}>{r.s}</span>
                  </a>
                ))
              )}
            </div>

            {results.length ? (
              <div className="font-mono" style={{ padding: "7px 14px", borderTop: "1px solid var(--vault-rule)", fontSize: 10, color: "var(--vault-text-faint)", display: "flex", gap: 14 }}>
                <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
                <span style={{ marginLeft: "auto" }}>{KIND_LABEL[index?.kinds[results[active]?.k] ?? ""] ?? ""}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
