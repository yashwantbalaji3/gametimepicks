"use client";
/**
 * Compare UI primitives (v1.4). Client-safe: no server module, no storage, no Live, no provider.
 *
 * Neutral by design: both sides use the same colour and weight. Nothing here highlights the larger number, badges a
 * side, or colours a difference — a bar's length is factual magnitude only, and every value is also printed as text.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { COMPARE_ASSET_PREFIX, assertCompareVersion } from "@/lib/compare/contract.mjs";
import { MONO, PANEL } from "@/components/research-pages/research-primitives";

export const cell: React.CSSProperties = { padding: "8px 10px", fontSize: 13.5, borderTop: "1px solid var(--vault-rule)", verticalAlign: "top" };
export const head: React.CSSProperties = { padding: "6px 10px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--vault-text-faint)", textAlign: "left", fontWeight: 600 };
export const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
export const selectStyle: React.CSSProperties = { minHeight: 44, minWidth: 120, maxWidth: "100%", background: "var(--vault-panel)", color: "var(--vault-text)", border: "1px solid var(--vault-border)", borderRadius: 8, padding: "0 10px", fontSize: 14 };

export function NotRecorded({ label = "not recorded" }: { label?: string }) {
  return <span style={{ color: "var(--vault-text-faint)" }}><span aria-hidden>—</span><span className="sr-only">{label}</span></span>;
}

/**
 * Fetch a static compare asset once per page view. Only paths under the public compare prefix are allowed, and a
 * document of an unknown schemaVersion is refused rather than interpreted.
 */
export function useCompareAssets() {
  const cache = useRef(new Map<string, Promise<unknown>>());
  return useCallback((assetPath: string): Promise<any> => {
    if (!assetPath.startsWith(`${COMPARE_ASSET_PREFIX}/`)) return Promise.reject(new Error("not a compare asset"));
    if (!cache.current.has(assetPath)) {
      cache.current.set(assetPath, fetch(assetPath, { credentials: "omit" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then((doc) => assertCompareVersion(doc, assetPath)));
    }
    return cache.current.get(assetPath)!;
  }, []);
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
  const write = useCallback((next: string) => {
    const url = `${window.location.pathname}${next}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
    setSearch(next);
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

export function CopyLinkButton() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button type="button" onClick={() => {
        navigator.clipboard?.writeText(window.location.href).then(() => setState("copied"), () => setState("failed"));
      }} style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", background: "transparent", color: "var(--vault-text)", border: "1px solid var(--vault-border)" }}>
        Copy link to this comparison
      </button>
      <span aria-live="polite" style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>{state === "copied" ? "Link copied" : state === "failed" ? "Copy the address bar to share" : ""}</span>
    </span>
  );
}

export function SideLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return <Link href={href} style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", textUnderlineOffset: 3 }}>{children}</Link>;
}

/**
 * Game-by-game bars for ONE side, in relative order (1 = most recent) with each game's own date as text. Two
 * sides render as two separate labelled charts sharing one scale, so no date axis ever implies games were played together.
 */
export function RelativeBars({ title, unit, points, scaleMax }: { title: string; unit: string; points: Array<{ id: string; date: string; value: number }>; scaleMax: number }) {
  const max = Math.max(1, scaleMax);
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <figcaption style={{ fontSize: 13, fontWeight: 650, marginBottom: 6, overflowWrap: "anywhere" }}>{title}</figcaption>
      {points.length ? (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
          {points.map((p, i) => (
            <li key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(78px, auto) 1fr 3.5em", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>
                <span className="sr-only">Game {i + 1}, </span>{p.date}
              </span>
              <span aria-hidden style={{ display: "block", height: 10, borderRadius: 3, background: "var(--vault-rule)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(100, (p.value / max) * 100))}%`, background: "var(--vault-text-mute)" }} />
              </span>
              <span style={{ ...num, fontWeight: 650 }}>{p.value}<span className="sr-only"> {unit}</span></span>
            </li>
          ))}
        </ol>
      ) : <p style={{ margin: 0, fontSize: 12.5, color: "var(--vault-text-mute)" }}>No recorded games.</p>}
    </figure>
  );
}

export function SizeButtons({ sizes, value, onChange, label }: { sizes: readonly number[]; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {sizes.map((n) => (
        <button key={n} type="button" aria-pressed={n === value} onClick={() => onChange(n)}
          style={{ minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: 999, fontSize: 13, cursor: "pointer", background: n === value ? "var(--vault-panel-elevated)" : "transparent", color: "var(--vault-text)", border: `1px solid ${n === value ? "var(--vault-gold)" : "var(--vault-border)"}` }}>
          Last {n}
        </button>
      ))}
    </div>
  );
}
