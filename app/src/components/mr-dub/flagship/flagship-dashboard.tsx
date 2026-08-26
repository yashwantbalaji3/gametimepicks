/**
 * Executive dashboard (Phase 2) + Today's status strip (Phase 7). Server-rendered, pure display of the
 * canonical flagship KPIs. Bloomberg-terminal feel: a headline money band + a dense responsive grid of
 * KPI cells. Every value comes from the reconciled flagship model — no recomputation here.
 */
import Link from "next/link";
import type { FlagshipKpis, TodayStatus, BankBuilderJourney } from "@/lib/mr-dub/flagship";

const usd = (n: number | null | undefined, dp = 2) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const usd0 = (n: number | null | undefined) => usd(n, 0);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
const plColor = (n: number) => n > 0 ? "var(--vault-success)" : n < 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-mute)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function longDate(iso: string): string { const [y, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; }

function Kpi({ label, value, sub, accent, glow, span }: { label: string; value: string; sub?: string; accent?: string; glow?: boolean; span?: boolean }) {
  return (
    <div className={`gtp-card-hover rounded-xl px-3.5 py-3 ${span ? "col-span-2" : ""}`} style={{ background: "var(--gtp-card-sunken, var(--vault-wash-faint))", border: "1px solid var(--vault-border)" }}>
      <div className="font-mono uppercase tracking-[0.11em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{label}</div>
      <div className={`font-display tabular tracking-tight ${glow ? "gtp-stat-value" : ""}`} style={{ color: accent ?? "var(--vault-text)", fontSize: span ? 26 : 20, fontWeight: 800, lineHeight: 1.05, marginTop: 3 }}>{value}</div>
      {sub ? <div className="mt-0.5 text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</div> : null}
    </div>
  );
}

export function ExecutiveDashboard({ kpis, journey, todayStatus }: { kpis: FlagshipKpis; journey: BankBuilderJourney; todayStatus: TodayStatus }) {
  const activeLane = journey.activeLanes.find((l) => l.lane === "A") ?? journey.activeLanes[0] ?? null;
  const activeLabel = activeLane ? `Lane ${activeLane.lane} · Step ${activeLane.step}` : "—";
  return (
    <section className="gtp-cinematic-rise flex flex-col gap-3">
      {/* Headline money band — the one-glance proof. */}
      <div className="relative overflow-hidden rounded-2xl px-5 py-5 sm:px-6 sm:py-6" style={{ border: "1px solid var(--vault-edge-gold, var(--vault-border))", background: "linear-gradient(135deg, color-mix(in srgb, var(--vault-warn) 10%, transparent), rgba(20,14,10,0.55) 60%)" }}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="font-mono uppercase tracking-[0.14em] text-[9.5px]" style={{ color: "var(--vault-gold)" }}>Paper bankroll · official settlement only</div>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="font-display tabular tracking-tight gtp-stat-value" style={{ fontSize: 44, fontWeight: 850, color: "var(--vault-text)", lineHeight: 0.95 }}>{usd(kpis.bankroll)}</span>
              <span className="mb-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold" style={{ color: "var(--vault-success)", background: "var(--gtp-success-soft, color-mix(in srgb, var(--vault-success) 10%, transparent))", border: "1px solid var(--vault-success-dim)" }}>{signed(kpis.profit)}</span>
              {/* Sprint 035: a return figure never renders without its sample size adjacent. */}
              <span className="mb-1 font-mono text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{kpis.roiMultiple}× on {kpis.record.wins + kpis.record.losses} settled bets</span>
            </div>
            <div className="mt-1.5 font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
              {usd0(kpis.startingBankroll)} on {longDate(kpis.startingDate)} → {usd(kpis.bankroll)} · {kpis.settledDays} settled days
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-display tabular" style={{ fontSize: 30, fontWeight: 850, color: "var(--vault-success)", lineHeight: 1 }}>{kpis.record.wins}–{kpis.record.losses}</span>
            <span className="font-mono uppercase tracking-[0.1em] text-[9px]" style={{ color: "var(--vault-text-faint)" }}>official record · {kpis.winRate}% win</span>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px]" style={{ color: todayStatus.pendingExposure > 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: todayStatus.pendingExposure > 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)", display: "inline-block" }} />
              {todayStatus.settlementStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Dense KPI grid. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Peak bankroll" value={usd(kpis.peak)} sub="all-time high-water mark" accent="var(--vault-gold)" glow />
        <Kpi label="Current drawdown" value={usd(kpis.drawdown)} sub={`${(kpis.drawdownPct * 100).toFixed(2)}% off peak`} accent={kpis.drawdown > 0 ? "var(--gtp-bank-heat)" : "var(--vault-text)"} />
        <Kpi label="Total ROI" value={`${kpis.roiMultiple}×`} sub={`${kpis.record.wins + kpis.record.losses} settled bets · paper only`} accent="var(--vault-text)" />
        <Kpi label="Win rate" value={`${kpis.winRate}%`} sub={`${kpis.record.wins}W · ${kpis.record.losses}L`} accent="var(--vault-success)" />
        <Kpi label="Largest winning day" value={kpis.largestWinDay ? signed(kpis.largestWinDay.pl) : "—"} sub={kpis.largestWinDay ? longDate(kpis.largestWinDay.date) : undefined} accent="var(--vault-success)" />
        <Kpi label="Largest losing day" value={kpis.largestLossDay ? signed(kpis.largestLossDay.pl) : "—"} sub={kpis.largestLossDay ? longDate(kpis.largestLossDay.date) : undefined} accent="var(--gtp-bank-heat)" />
        <Kpi label="Longest win streak" value={`${kpis.longestWinStreak}`} sub={`consecutive wins of ${kpis.record.wins + kpis.record.losses} settled`} accent="var(--vault-text)" />
        <Kpi label="Longest losing streak" value={`${kpis.longestLossStreak}`} sub={`consecutive losses of ${kpis.record.wins + kpis.record.losses} settled`} accent={kpis.longestLossStreak > 0 ? "var(--gtp-bank-heat)" : "var(--vault-text)"} />
        <Kpi label="Active ladder" value={activeLabel} sub={activeLane?.kind === "value" ? "value lane" : "survival lane"} accent="var(--vault-gold)" />
        <Kpi label="Pending exposure" value={usd(todayStatus.pendingExposure)} sub={`${todayStatus.products.filter((p) => p.live).length} product(s) live`} accent={todayStatus.pendingExposure > 0 ? "var(--gtp-bank-heat)" : "var(--vault-text)"} />
        <Kpi label="Products active today" value={`${todayStatus.products.filter((p) => p.live).length}`} sub={todayStatus.products.filter((p) => p.live).map((p) => p.glyph).join(" ") || "settlement pending"} />
        <Kpi label="As of" value={longDate(kpis.currentDate).replace(`, ${kpis.currentDate.slice(0, 4)}`, "")} sub={kpis.currentDate} />
      </div>
    </section>
  );
}

export function TodayStatusStrip({ todayStatus }: { todayStatus: TodayStatus }) {
  const t = todayStatus;
  const live = t.products.filter((p) => p.live);
  return (
    <section className="gtp-cinematic-rise gtp-cinematic-rise-d1 rounded-xl px-4 py-3.5" style={{ border: "1px solid var(--vault-border)", background: "var(--gtp-card, var(--vault-wash-faint))" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.12em] text-[10px]" style={{ color: "var(--gtp-bank-heat)" }}>
          <span aria-hidden className="gtp-verified-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--gtp-bank-heat)", display: "inline-block" }} />
          Today · {longDate(t.date)}
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{t.settlementStatus}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-stretch gap-2">
        {t.activeBankBuilder.length ? t.activeBankBuilder.map((ln) => (
          <Link key={ln.lane} href="/bank-builder" className="gtp-pressable min-w-0 flex-1 rounded-lg px-3 py-2" style={{ border: "1px solid var(--vault-rule)", background: "color-mix(in srgb, var(--vault-warn) 5%, transparent)", textDecoration: "none" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono uppercase tracking-[0.08em] text-[9px]" style={{ color: "var(--vault-gold)" }}>🏦 Bank Builder · Lane {ln.lane}</span>
              <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-mute)" }}>Step {ln.step}</span>
            </div>
            <div className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--vault-text)" }}>{ln.legs.map((l) => l.selection).join(" + ")}</div>
            <div className="mt-1 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{usd(ln.stake)} → {ln.potentialReturn != null ? usd(ln.potentialReturn) : "—"} · {ln.confidence ?? "—"}</div>
          </Link>
        )) : (
          <div className="flex-1 rounded-lg px-3 py-2 text-[11.5px]" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>No active Bank Builder card for today yet — the next qualified card appears after slate generation.</div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono uppercase tracking-[0.1em] text-[9px]" style={{ color: "var(--vault-text-faint)" }}>Exposure {usd(t.pendingExposure)}</span>
        {t.products.map((p) => (
          <Link key={p.productId} href={p.href} className="font-mono text-[10.5px]" style={{ color: p.live ? "var(--vault-text-mute)" : "var(--vault-text-faint)", textDecoration: "none" }}>
            <span aria-hidden>{p.glyph}</span> {p.label.replace(" Specials", "").replace(" Nukes", "")} <span style={{ color: p.live ? "var(--vault-text)" : "var(--vault-text-faint)" }}>{usd(p.exposure)}</span>
          </Link>
        ))}
        {live.length === 0 ? <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>· nothing at risk right now</span> : null}
      </div>
    </section>
  );
}
