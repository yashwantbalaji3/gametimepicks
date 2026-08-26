/**
 * Shared V2 report shell — the common grammar for the clean simulation reports (soccer + MLB). One numbered
 * Section chrome, one StatTile, one Monogram, one pct formatter, so the two sports can't drift apart. Pure
 * presentational; honesty lives in the callers (what they choose to render).
 */

export const pct = (p: number | null | undefined) => (typeof p === "number" ? `${(p * 100).toFixed(0)}%` : "—");

export function Section({ n, title, subtitle, tone = "default", children }: { n: number; title: string; subtitle?: string; tone?: "default" | "muted"; children: React.ReactNode }) {
  const muted = tone === "muted";
  return (
    <section className="rounded-[16px] px-4 sm:px-6 py-5 flex flex-col gap-3" style={{ background: muted ? "rgba(10, 17, 13,0.4)" : "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{String(n).padStart(2, "0")}</span>
        <div className="flex flex-col gap-0.5">
          <h3 className="font-display tracking-tight m-0" style={{ color: muted ? "var(--vault-text-mute)" : "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{title}</h3>
          {subtitle ? <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{subtitle}</span> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1" style={{ background: "color-mix(in srgb, var(--vault-scrim-warm) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{label}</span>
      <span style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{value}</span>
      {sub ? <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>{sub}</span> : null}
    </div>
  );
}

export function Monogram({ code, name }: { code?: string | null; name: string }) {
  const label = (code && code.length <= 3 ? code : name.slice(0, 3)).toUpperCase();
  return (
    <div className="flex items-center justify-center rounded-[10px] shrink-0" style={{ width: 44, height: 44, background: "color-mix(in srgb, var(--vault-crown) 10%, transparent)", border: "1px solid var(--vault-border-strong)" }}>
      <span className="font-display" style={{ color: "var(--vault-gold)", fontSize: 15, fontWeight: 800 }}>{label}</span>
    </div>
  );
}

/** The collapsed "advanced / full detail" block that lives at the very bottom of a V2 report. */
export function AdvancedDisclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="rounded-[14px] px-4 sm:px-5 py-3" style={{ background: "color-mix(in srgb, var(--vault-scrim-warm) 35%, transparent)", border: "1px solid var(--vault-border)" }}>
      <summary className="cursor-pointer font-mono uppercase tracking-[0.08em] select-none" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>{label} ▾</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
