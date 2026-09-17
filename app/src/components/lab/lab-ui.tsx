"use client";
/**
 * Research Lab UI primitives (v1.5). Client-safe: no server module, no storage, no Live, no provider, no clock.
 *
 * Neutral by design. A sorted column is not a ranking, a matched threshold is not a hit rate, and nothing here
 * badges, colours or highlights a row. Every value is printed as text; a bar's length is factual magnitude only.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { LAB_ASSET_PREFIX, assertLabVersion } from "@/lib/lab/contract.mjs";
import { MONO, PANEL } from "@/components/research-pages/research-primitives";

export const cell: React.CSSProperties = { padding: "8px 10px", fontSize: 13.5, borderTop: "1px solid var(--vault-rule)", verticalAlign: "top" };
export const head: React.CSSProperties = { padding: "6px 10px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--vault-text-faint)", textAlign: "left", fontWeight: 600 };
export const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
export const selectStyle: React.CSSProperties = { minHeight: 44, minWidth: 120, maxWidth: "100%", background: "var(--vault-panel)", color: "var(--vault-text)", border: "1px solid var(--vault-border)", borderRadius: 8, padding: "0 10px", fontSize: 14 };
export const inputStyle: React.CSSProperties = { ...selectStyle, minWidth: 0, width: "100%" };
export const pillStyle = (on: boolean): React.CSSProperties => ({ minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", background: on ? "var(--vault-panel-elevated)" : "transparent", color: "var(--vault-text)", border: `1px solid ${on ? "var(--vault-gold)" : "var(--vault-border)"}`, textDecoration: "none" });

export function NotRecorded({ label = "not recorded" }: { label?: string }) {
  return <span style={{ color: "var(--vault-text-faint)" }}><span aria-hidden>—</span><span className="sr-only">{label}</span></span>;
}

/**
 * Fetch a static Lab asset once per page view, and tell the caller which fetch was the LATEST.
 *
 * Only paths under the public Lab prefix are allowed, and a document of an unknown schemaVersion is refused rather
 * than interpreted. `run` carries a monotonic token: a slower earlier query can resolve after a newer one and must
 * not paint — the caller compares the token it was given with the current one (§89). No abort is needed because
 * the responses are small static files already in flight; the token is what decides the winner.
 */
export function useLabAssets() {
  const cache = useRef(new Map<string, Promise<unknown>>());
  const token = useRef(0);
  const load = useCallback((assetPath: string): Promise<any> => {
    if (!assetPath.startsWith(`${LAB_ASSET_PREFIX}/`)) return Promise.reject(new Error("not a lab asset"));
    if (!cache.current.has(assetPath)) {
      cache.current.set(assetPath, fetch(assetPath, { credentials: "omit" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then((doc) => assertLabVersion(doc, assetPath)).catch((e) => { cache.current.delete(assetPath); throw e; }));
    }
    return cache.current.get(assetPath)!;
  }, []);
  const next = useCallback(() => { token.current += 1; return token.current; }, []);
  const isCurrent = useCallback((t: number) => t === token.current, []);
  return { load, next, isCurrent };
}

/** The query string on the reader's URL, read after mount (static export: no server knows it). */
export function useLocationSearch(): [string | null, (next: string) => void] {
  const [search, setSearch] = useState<string | null>(null);
  useEffect(() => {
    setSearch(window.location.search);
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const write = useCallback((nextSearch: string) => {
    const url = `${window.location.pathname}${nextSearch}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
    setSearch(nextSearch);
  }, []);
  return [search, write];
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "blocked"; title?: string; children: ReactNode }) {
  return (
    <div role={tone === "blocked" ? "status" : undefined} style={{ ...PANEL, marginTop: 14, borderStyle: "dashed" }}>
      {title ? <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{title}</p> : null}
      <div style={{ margin: title ? "4px 0 0" : 0, fontSize: 13.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function CopyLinkButton({ label }: { label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button type="button" onClick={() => {
        navigator.clipboard?.writeText(window.location.href).then(() => setState("copied"), () => setState("failed"));
      }} style={{ ...pillStyle(false), background: "transparent" }}>{label}</button>
      <span aria-live="polite" style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>{state === "copied" ? "Link copied" : state === "failed" ? "Copy the address bar to share" : ""}</span>
    </span>
  );
}

export function EntityCell({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return <Link href={href} style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", textUnderlineOffset: 3 }}>{children}</Link>;
}

/**
 * A horizontally scrollable table region. `position: relative` is load-bearing: an `sr-only` cell inside a
 * NON-positioned scroller is positioned against the page, which made the document wider than a phone screen in
 * v1.4 QA and zoomed the whole page out.
 */
export function TableRegion({ label, minWidth, children }: { label: string; minWidth: number; children: ReactNode }) {
  return (
    <div data-scroll-x role="region" aria-label={label} tabIndex={0} style={{ position: "relative", overflowX: "auto", marginTop: 8 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth }}>{children}</table>
    </div>
  );
}

/** A labelled control. The visible label is the accessible name; a hint is associated by aria-describedby. */
export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 11.5, fontFamily: MONO, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--vault-text-faint)", fontWeight: 600 }}>{label}</label>
      {children}
      {hint ? <span id={`${id}-hint`} style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>{hint}</span> : null}
    </div>
  );
}

/** A group of related controls, announced as one group to a screen reader. */
export function FilterGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={{ fontSize: 12, fontWeight: 700, padding: 0, marginBottom: 8, color: "var(--vault-text)" }}>{legend}</legend>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, alignItems: "end" }}>{children}</div>
    </fieldset>
  );
}

/** An integer bound input. An empty box means "no bound" — never 0 (§28: a bound and a value are different things). */
export function BoundInput({ id, label, value, onChange, placeholder }: { id: string; label: string; value: number | null; onChange: (n: number | null) => void; placeholder?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);
  return (
    <Field id={id} label={label}>
      <input id={id} type="number" inputMode="numeric" step={1} value={text} placeholder={placeholder ?? "any"}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { const t = text.trim(); onChange(t === "" || !/^-?\d+$/.test(t) ? null : Number(t)); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={inputStyle} />
    </Field>
  );
}

/** Pagination. Page is query state, so a page of results is as shareable as the query itself. */
export function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const pages = useMemo(() => {
    const out: number[] = [];
    for (let p = Math.max(1, page - 2); p <= Math.min(pageCount, page + 2); p += 1) out.push(p);
    return out;
  }, [page, pageCount]);
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Result pages" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, alignItems: "center" }}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} style={{ ...pillStyle(false), opacity: page <= 1 ? 0.5 : 1 }}>Previous</button>
      {pages.map((p) => (
        <button key={p} type="button" aria-current={p === page ? "true" : undefined} onClick={() => onPage(p)} style={{ ...pillStyle(p === page), minWidth: 44, justifyContent: "center" }}>
          <span className="sr-only">Page </span>{p}
        </button>
      ))}
      <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} style={{ ...pillStyle(false), opacity: page >= pageCount ? 0.5 : 1 }}>Next</button>
      <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>of {pageCount}</span>
    </nav>
  );
}
