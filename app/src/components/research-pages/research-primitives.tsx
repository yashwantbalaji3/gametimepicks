/**
 * Research page primitives (v1.3). Server-renderable; no state, no clock.
 *
 * The coverage strip is the trust surface: what period the page covers, what is partial, and — in plain
 * words from lib/research-pages/coverage.mjs — what is not available. It never names a provider or a file.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { AVAILABLE_COPY, coverageNoteText } from "@/lib/research-pages/coverage.mjs";
import type { Coverage } from "@/lib/research-pages/projection-store";

export const MONO = "var(--font-mono)";

export const PANEL: React.CSSProperties = {
  background: "var(--vault-panel)",
  border: "1px solid var(--vault-rule)",
  borderRadius: 12,
  padding: "clamp(14px, 2vw, 20px)",
};

export function ResearchShell({ back, children }: { back: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden" style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div className="mb-3">
        <Link href={back.href} className="inline-flex items-center -ml-1 px-1 py-2 font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10, minHeight: 44 }}>
          ← {back.label}
        </Link>
      </div>
      {children}
    </div>
  );
}

export function Eyebrow({ children, color = "var(--vault-gold-bright)" }: { children: ReactNode; color?: string }) {
  return (
    <p className="font-mono uppercase tracking-[0.16em]" style={{ margin: 0, fontSize: 10, color }}>
      {children}
    </p>
  );
}

export function SectionTitle({ id, children, sub }: { id: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ margin: "0 0 10px" }}>
      <h2 id={id} style={{ fontSize: "clamp(16px, 2.4vw, 19px)", fontWeight: 750, margin: 0, color: "var(--vault-text)" }}>{children}</h2>
      {sub ? <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>{sub}</p> : null}
    </div>
  );
}

export function Section({ id, title, sub, children }: { id: string; title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ marginTop: 22 }}>
      <SectionTitle id={id} sub={sub}>{title}</SectionTitle>
      {children}
    </section>
  );
}

export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div style={{ ...PANEL, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--vault-text)", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {detail ? <div style={{ fontSize: 11.5, color: "var(--vault-text-mute)", marginTop: 2, lineHeight: 1.45 }}>{detail}</div> : null}
    </div>
  );
}

/** Data coverage strip. Always rendered: a page with nothing partial still says what period it covers. */
export function CoverageStrip({ coverage, period }: { coverage: Coverage; period: string | null }) {
  const notes = coverage.notes.map((c) => coverageNoteText(c, coverage));
  return (
    <aside aria-label="Data coverage" style={{ ...PANEL, marginTop: 14, borderStyle: coverage.status === "FULL" ? "solid" : "dashed" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-gold-bright)" }}>Data coverage</span>
        {period ? <span style={{ fontSize: 13, color: "var(--vault-text)" }}>{period}</span> : null}
        <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>From GameTime&apos;s canonical sports data</span>
      </div>
      {coverage.available.length ? (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
          <span style={{ color: "var(--vault-text)" }}>Available:</span> {coverage.available.map((k) => AVAILABLE_COPY[k as keyof typeof AVAILABLE_COPY] ?? k).join(" · ")}
          {coverage.unavailable.length ? <> · <span style={{ color: "var(--vault-text)" }}>Not yet available:</span> {coverage.unavailable.map((k) => AVAILABLE_COPY[k as keyof typeof AVAILABLE_COPY] ?? k).join(" · ")}</> : null}
        </p>
      ) : null}
      {notes.length ? (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      ) : null}
    </aside>
  );
}

/** A label that links only when the entity has a research page. Never a broken link. */
export function EntityLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return <Link href={href} style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", textUnderlineOffset: 3 }}>{children}</Link>;
}

/** W / L / T / D letters are always text — colour is decoration, never the only signal. */
export function ResultBadge({ code }: { code: string | null }) {
  if (!code) return null;
  const color = code === "W" ? "var(--vault-success)" : code === "L" ? "var(--vault-danger)" : "var(--vault-text-mute)";
  return (
    <span className="font-mono" style={{ display: "inline-block", minWidth: 18, textAlign: "center", fontWeight: 800, fontSize: 11.5, color, border: `1px solid ${color}`, borderRadius: 4, padding: "0 3px" }}>
      {code}
    </span>
  );
}
