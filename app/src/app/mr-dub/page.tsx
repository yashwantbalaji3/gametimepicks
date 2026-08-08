/**
 * /mr-dub — Mr. Dub's flagship paper portfolio. A COMPLETE, AUDITABLE RECORD of a paper ladder — not
 * evidence that the methodology works. Sprint 035: the record stands on 33 settled bets, two 5-leg
 * ladders produced essentially all of the profit, and across all four paper products the record is
 * 19-39. A 189x return on that sample is a variance outcome, not a demonstrated skill. An executive
 * dashboard (KPIs), today's status, the visual $100 → $19.5K Bank Builder journey, performance analytics,
 * an expandable day-by-day timeline, and every wager attributed to its product.
 *
 * Server component. Everything is DERIVED at build time from the canonical settlement artifacts via
 * buildFlagship() — portfolio.json (money), daily-summary.json (day-by-day), master-ledger, banked-ladders
 * and the approved card. Nothing is hand-authored, nothing is recomputed: the nightly settlement rebuilds
 * the artifacts and this page re-derives on redeploy. Paper-only educational tracking — not advice.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import SectionHeader from "@/components/section-header";
import MrDubAvatar from "@/components/mr-dub/mr-dub-avatar";
import AchievementBanner from "@/components/achievement-banner";
import { buildFlagship } from "@/lib/mr-dub/flagship";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { currentEtDate } from "@/lib/freshness";
import { deriveProductState, productStateLabel, isLive } from "@/lib/products/product-state.mjs";
import { currentEtHour } from "@/lib/daily-freshness-slo.mjs";
import FreshnessBadge from "@/components/ui/freshness-badge";
import { ExecutiveDashboard, TodayStatusStrip } from "@/components/mr-dub/flagship/flagship-dashboard";
import BankBuilderJourneySection from "@/components/mr-dub/flagship/bank-builder-journey";
import InteractiveTimeline from "@/components/mr-dub/flagship/interactive-timeline";
import AnalyticsCharts from "@/components/mr-dub/flagship/analytics-charts";
import ProductAttribution from "@/components/mr-dub/flagship/product-attribution";
// Wider-platform appendix: today's full four-product plan + the separate Moonshot side lane.
import DailyPortfolioSection from "@/components/mr-dub/daily-portfolio-section";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { strongestSlatePicks } from "@/lib/world-cup/structured-moonshot";
import { buildBankBuilderProposal } from "@/lib/world-cup/bank-builder-proposal";
import MoonshotLaneTracker from "@/components/moonshot/moonshot-lane-tracker";
import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";

const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const metadata = {
  title: "Mr. Dub's Portfolio · GameTime Picks",
  description: "Mr. Dub's flagship paper portfolio — the $100 → $19.5K journey in full: executive KPIs, the visual Bank Builder ladder, performance analytics, an expandable day-by-day timeline, and every wager by product. Official results only. Educational, paper-only; not financial advice.",
};

const CTAS = [
  { href: "/bank-builder", label: "Bank Builder" },
  { href: "/results", label: "Results" },
  { href: "/picks", label: "Picks" },
  { href: "/mlb", label: "MLB" },
];

export default function MrDubPage() {
  const today = currentSlateDate() ?? currentEtDate();
  const root = path.join(process.cwd(), "public", "data");
  const f = buildFlagship(root, new Date().toISOString(), today);
  // Wider-platform appendix data — today's four-product candidate plan + the separate Moonshot side lane.
  const portfolio = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"), "utf8")); } catch { return null; } })();
  const dailyPortfolio = buildDailyPortfolio(root, new Date().toISOString(), today);
  const bankBuilderAlternatives = strongestSlatePicks(root, today, 3);
  const bbProposal = buildBankBuilderProposal(root, today);
  const moonshotLane = loadMoonshotLane();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 sm:pt-8 flex flex-col gap-6 overflow-x-hidden">
      {/* 0 — Completed ladders, stated factually from the canonical ledger. Not framed as proof of skill:
          two ladders is a sample of two, and the banner copy says so. */}
      <AchievementBanner />

      {/* 1 — Flagship brand header (slim) — the avatar + who Mr. Dub is, then straight into the terminal. */}
      <header className="gtp-cinematic-rise flex items-center gap-3.5">
        <MrDubAvatar size={56} />
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <h1 className="text-[21px] font-semibold sm:text-[25px]" style={{ color: "var(--vault-text)" }}>Mr. Dub&rsquo;s Paper Portfolio</h1>
            {/* Honest settlement age — client badge re-computes with the real browser clock, so a stale
                build reads "Latest settlement · N days ago" instead of a frozen date. */}
            <FreshnessBadge slateDate={f.todayStatus.lastSettledDate} serverToday={currentEtDate()} noun="settlement" />
            {/* Current-operations state (Program 144 · Release G). The settlement badge above is the
                PROTECTED history — the last official grading, 30+ days ago, correct and untouched.
                Without this second marker the page read as abandoned: historical truth needs
                today's run status beside it, from the product's OWN artifact per the Program 140
                rule. */}
            {(() => {
              try {
                const dp = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", "daily-portfolio.json"), "utf8")) as { date?: string; lanes?: Array<{ status?: string }> };
                const st = deriveProductState({
                  productDate: currentEtDate(),
                  artifactDate: typeof dp.date === "string" ? dp.date : null,
                  publishedCards: (dp.lanes ?? []).filter((l) => l.status === "active").length,
                });
                return (
                  <span className="font-mono uppercase tracking-[0.1em]" style={{ color: isLive(st) ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 10 }}>
                    {productStateLabel(st, { artifactDate: dp.date ?? null, productDate: currentEtDate(), etHour: currentEtHour() })}
                  </span>
                );
              } catch { return null; }
            })()}
          </span>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
            <span className="mr-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em] text-[9px]" style={{ color: "var(--vault-gold)", background: "rgba(217,164,65,0.12)", border: "1px solid rgba(217,164,65,0.35)" }}><span aria-hidden>⚗</span> Paper Portfolio Scientist</span>
            Every paper card, every official result, every bankroll move — no wagers placed, not advice.
          </p>
        </div>
      </header>

      {/* 2 — Executive dashboard (Bloomberg-terminal KPI band + grid). Phase 2. */}
      <ExecutiveDashboard kpis={f.kpis} journey={f.journey} todayStatus={f.todayStatus} />

      {/* 3 — Today's status (pending cards, current Bank Builder, exposure, settlement window). Phase 7. */}
      <TodayStatusStrip todayStatus={f.todayStatus} />

      {/* 4 — The Bank Builder journey — the visual $100 → $19.5K ladder. Phase 4. */}
      <section>
        <SectionHeader eyebrow="The methodology, proven" title="The $100 → $19.5K journey" sub="Two completed $100→$10K Bank Builder ladders banked the crown; today's lane climbs toward the next rung. Tap any rung for the approved card and its official result." />
        <div className="mt-2"><BankBuilderJourneySection journey={f.journey} /></div>
      </section>

      {/* 5 — Performance analytics (charts, all derived from settled history). Phase 5. */}
      <section>
        <SectionHeader eyebrow="Performance analytics" title="How the bankroll moved" sub="Bankroll over time, daily P/L, drawdown, product attribution and a calendar heatmap — every series derived from official settlements. No fabricated metrics." />
        <div className="mt-2"><AnalyticsCharts charts={f.charts} /></div>
      </section>

      {/* 6 — Interactive day-by-day timeline (expandable to every wager). Phase 3. */}
      <section>
        <SectionHeader eyebrow={`${f.timeline.length} settled days`} title="Day-by-day timeline" sub="The complete story, newest first. Each day shows the record after settlement, the bankroll move and ROI; expand for every wager, its official result and payout." />
        <div className="mt-2"><InteractiveTimeline timeline={f.timeline} /></div>
      </section>

      {/* 7 — Product attribution (every wager tagged to its flagship, filterable). Phase 6. */}
      <section>
        <SectionHeader eyebrow="Attribution" title="Every wager, by product" sub="Which flagship generated each settled paper wager — filter by product. Bank Builder is the canonical bankroll; the side lanes are separate flat-stake paper." />
        <div className="mt-2"><ProductAttribution wagers={f.wagers} /></div>
      </section>

      {/* 8 — Wider platform appendix: today's full four-product plan + the separate Moonshot side lane.
            Answers "what's pending / what happens next" and keeps the side lanes discoverable, below the
            premium flagship story. */}
      <div className="mt-2 flex flex-col gap-6 border-t pt-6" style={{ borderColor: "var(--vault-rule)" }}>
        <p className="-mb-2 font-mono uppercase tracking-[0.14em] text-[10px]" style={{ color: "var(--vault-text-faint)" }}>The wider platform · side lanes &amp; today&rsquo;s plan</p>
        <DailyPortfolioSection portfolio={dailyPortfolio} bankBuilderAlternatives={bankBuilderAlternatives} bankBuilderProposal={bbProposal} />
        {portfolio?.moonshot ? (
          <section>
            <SectionHeader eyebrow="Separate · high-volatility" title="Moonshot Lane" sub="Independent daily high-volatility longshot cards (current MLB player props) — tracked apart from the core ladder. Higher variance by design; settles from official box scores." />
            <p className="mt-1 mb-2 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
              🌙 Moonshot exposure <span className="font-mono" style={{ color: "#b9a8ff" }}>{usd(portfolio.moonshot.exposure)}</span> · separate from the core lanes. Record {portfolio.moonshot.record?.wins ?? 0}–{portfolio.moonshot.record?.losses ?? 0}. Does not affect the core Bank Builder record. Paper-only.
            </p>
            {moonshotLane ? (
              <MoonshotLaneTracker lane={moonshotLane} record={portfolio.moonshot.record} exposure={portfolio.moonshot.exposure} mode="compact" />
            ) : (
              <Link href="/moonshot" className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "#b9a8ff", textDecoration: "none" }}>Open the Moonshot Lane daily tracker →</Link>
            )}
          </section>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {CTAS.map((c) => (
          <Link key={c.href} href={c.href} className="gtp-pressable rounded-full px-3.5 py-1.5 font-mono uppercase tracking-[0.1em] text-[10.5px]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", textDecoration: "none" }}>{c.label} →</Link>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only educational tracking. No wagers are placed. Mr. Dub is not a sportsbook and this is not financial advice. Canonical money moves only through official settlement; every figure on this page is derived from the settled ledger and reconciles to the {`$${f.kpis.bankroll.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} paper bankroll.
      </p>
    </main>
  );
}
