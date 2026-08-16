/**
 * MrDubTodayCard — compact Mr. Dub portfolio module for the Today / homepage. Current paper bankroll,
 * latest-day P/L, open exposure + record, with a CTA to /mr-dub. Reads the committed mr-dub JSON so the
 * numbers are always the current portfolio (never stale). Paper-only.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import MrDubAvatar from "@/components/mr-dub/mr-dub-avatar";

function read(rel: string): any {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", rel), "utf8")); } catch { return null; }
}
const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MrDubTodayCard() {
  const p = read("portfolio.json");
  if (!p) return null;
  const daily = read("daily-summary.json");
  const latest = daily?.days?.length ? daily.days[daily.days.length - 1] : null;
  const rec = p.record ?? {};
  const pl = latest?.pl ?? 0;
  const plColor = pl > 0 ? "var(--vault-success)" : pl < 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)";
  return (
    <Link href="/mr-dub" className="gtp-card-hover flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3.5" style={{ border: "1px solid var(--vault-border)", borderTop: "2px solid var(--vault-gold-bright)", background: "linear-gradient(135deg, rgba(217,164,65,0.08), rgba(11, 18, 14,0.3))", textDecoration: "none" }}>
      <MrDubAvatar size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold" style={{ color: "var(--vault-text)" }}>Mr. Dub today</span>
          <span className="font-mono uppercase tracking-[0.1em] text-[9px]" style={{ color: "var(--vault-gold-bright)" }}>paper portfolio</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
          <span>Bankroll <span className="font-mono" style={{ color: "var(--vault-gold-bright)" }}>{usd(p.currentBankroll)}</span></span>
          {latest ? <span>{latest.date} P/L <span className="font-mono" style={{ color: plColor }}>{pl >= 0 ? "+" : ""}{usd(pl)}</span></span> : null}
          <span>Exposure <span className="font-mono" style={{ color: "var(--vault-text)" }}>{usd(p.openExposure)}</span></span>
          <span>Record <span style={{ color: "var(--vault-text)" }}>{rec.wins ?? 0}–{rec.losses ?? 0}</span></span>
        </div>
      </div>
      <span className="shrink-0 font-mono uppercase tracking-[0.1em] text-[10px]" style={{ color: "var(--vault-gold-bright)" }}>Open Mr. Dub →</span>
    </Link>
  );
}
