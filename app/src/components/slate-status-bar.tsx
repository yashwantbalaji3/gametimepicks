/**
 * SlateStatusBar — the global product header strip (under the nav).
 *
 * June-12 rebrand: the old version read like internal metadata ("today
 * 2026-06-12 · active slate · bank $100 paper · EDUCATIONAL · PAPER ONLY")
 * and showed a stale hardcoded $100 bank label. It is now a row of polished,
 * clickable chips in plain English:
 *
 *   Today · Jun 12   |   Pregame slate   |   Bank Builder $1,423.64 · Step 4 · 3–0   |   Settled Jun 11
 *
 * Every value is read from the SAME public loaders the rest of the app uses —
 * the Bank Builder chip shows the REAL current public bankroll/step/record
 * (never the $100 ladder base), and the responsible-use disclosure stays, in
 * sentence case. Server component; chips wrap cleanly on mobile.
 */
import Link from "next/link";

import { getLatestOptimizerSnapshot } from "@/lib/data-parlays";
import { getOptimizerGradedDates } from "@/lib/parlay-results";
import { currentEtDate } from "@/lib/freshness";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Chip({
  href,
  children,
  accent,
}: {
  href?: string;
  children: React.ReactNode;
  accent?: string;
}) {
  const style: React.CSSProperties = {
    border: `1px solid ${accent ? `color-mix(in srgb, ${accent} 45%, transparent)` : "var(--vault-rule)"}`,
    background: "rgba(7,11,26,0.5)",
    color: "var(--vault-text-mute)",
    fontSize: 12,
    textDecoration: "none",
  };
  const cls = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 whitespace-nowrap";
  return href ? (
    <Link href={href} className={`${cls} vault-press`} style={style}>
      {children}
    </Link>
  ) : (
    <span className={cls} style={style}>{children}</span>
  );
}

export default function SlateStatusBar() {
  const today = currentEtDate();
  const activeDate = getLatestOptimizerSnapshot()?.date ?? null;
  const gradedDates = getOptimizerGradedDates();
  const latestSettled = gradedDates.length ? [...gradedDates].sort().slice(-1)[0] : null;
  const activeIsSettled = !!activeDate && !!latestSettled && activeDate <= latestSettled;
  const bank = loadPublicBankBuilderSummary();
  const bankLabel = bank
    ? `$${bank.currentBankrollUnits.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  return (
    <div
      className="gtp-slate-status flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 sm:px-6 py-2"
      style={{ background: "rgba(7, 11, 26, 0.6)", borderBottom: "1px solid var(--vault-border)" }}
    >
      <Chip href="/today">
        <span style={{ color: "var(--vault-text)" }}>Today</span>
        <span>· {fmtShort(today)}</span>
      </Chip>
      <Chip accent="var(--vault-gold-bright)">
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: activeIsSettled ? "var(--vault-success)" : "var(--vault-gold-bright)" }} />
        <span style={{ color: activeIsSettled ? "var(--vault-success)" : "var(--vault-gold-bright)" }}>
          {activeIsSettled ? "Slate settled" : "Pregame slate"}
        </span>
      </Chip>
      {bank && bankLabel ? (
        <Chip href="/bank-builder" accent="var(--vault-gold-bright)">
          <span aria-hidden>🏦</span>
          <span style={{ color: "var(--vault-gold-bright)", fontWeight: 600 }}>{bankLabel}</span>
          <span>· Step {bank.currentProgressionStep} · {bank.record.wins}–{bank.record.losses}</span>
        </Chip>
      ) : null}
      <Chip href="/results" accent="var(--vault-success)">
        <span style={{ color: "var(--vault-success)" }}>Settled</span>
        <span>· {fmtShort(latestSettled)}</span>
      </Chip>
      <span className="ml-auto hidden sm:inline" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
        Paper-only · educational
      </span>
    </div>
  );
}
