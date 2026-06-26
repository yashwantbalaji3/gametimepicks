/**
 * /mr-dub — Mr. Dub's paper portfolio dashboard. Order: hero/standings → today strip → Dual Bank
 * Builder (visual ladders) + stopped-lane history → active/awaiting cards → daily ledger (expandable to
 * exact cards) → exposure & bankroll health → full ledger. Server component; reads committed mr-dub/
 * JSON + the active engine preview. Paper-only educational tracking — not a sportsbook, not advice.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import SectionHeader from "@/components/section-header";
import MrDubAvatar from "@/components/mr-dub/mr-dub-avatar";
import MoneyPath from "@/components/ui/money-path";
import DualLadderBoard from "@/components/bank-builder/dual-ladder-board";
import MoonshotLaneTracker from "@/components/moonshot/moonshot-lane-tracker";
import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";
import { loadTodaySlate, currentSlateDate } from "@/lib/parlays/ui-loader";
import { currentEtDate } from "@/lib/freshness";
import DailyPortfolioSection from "@/components/mr-dub/daily-portfolio-section";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import PortfolioAllocationSection from "@/components/mr-dub/portfolio-allocation";
import { buildPortfolioAllocation } from "@/lib/mr-dub/product-allocation";
import MasterLedgerSection from "@/components/mr-dub/master-ledger-section";
import AchievementBanner from "@/components/achievement-banner";
import { buildMasterLedger } from "@/lib/mr-dub/master-ledger";
import LedgerCalendar from "@/components/mr-dub/ledger-calendar";
import { buildLedgerCalendar } from "@/lib/mr-dub/ledger-calendar";

export const metadata = {
  title: "Mr. Dub · Paper Portfolio · GameTime Picks",
  description: "Mr. Dub's paper portfolio — bankroll, daily P/L, dual Bank Builder ladders, expandable ledger, exposure & bankroll health, and official-result transparency. Educational, paper-only; not financial advice.",
};

function read(rel: string): any {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", rel), "utf8")); } catch { return null; }
}
const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US")}`;
const plColor = (n: number) => n > 0 ? "var(--vault-success)" : n < 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)";

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl px-3 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
      <div className="font-display tracking-tight" style={{ color: accent ?? "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{label}</div>
      {sub ? <div className="mt-0.5 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</div> : null}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  ladder_step_won: "Ladder rung won", ladder_step_settled: "Ladder rung", lane_step_won: "Lane step won",
  lane_stopped: "Lane stopped", lane_step_open: "Lane step open", lane_restarted: "Lane restarted",
  lane_advanced: "Lane advanced", lane_relaunch_blocked: "Relaunch blocked (audit)",
};
const CTAS = [
  { href: "/bank-builder", label: "Bank Builder" },
  { href: "/results", label: "Results" },
  { href: "/picks", label: "Picks" },
  { href: "/build", label: "Build" },
];

function LegList({ legs }: { legs: any[] }) {
  if (!legs?.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
      {legs.map((l: any, i: number) => <span key={i}>· {l.selection}{l.result && !["win", "settled", "pending"].includes(l.result) ? ` — ${l.result}` : ""}{l.officialResult ? ` (${l.officialResult})` : ""}{l.source ? ` · ${l.source}` : ""}</span>)}
    </div>
  );
}

function EventCard({ e }: { e: any }) {
  const won = e.result === "won" || e.result === "win";
  const lost = e.result === "lost";
  const open = e.status === "open" || e.status === "queued";
  const tone = won ? "var(--vault-success)" : lost ? "var(--gtp-bank-heat)" : open ? "var(--vault-gold-bright)" : "var(--vault-text-faint)";
  return (
    <div className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)", borderLeft: `2px solid ${tone}` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>
          {e.date ?? e.timestamp?.slice(0, 10)} · {TYPE_LABEL[e.type] ?? e.type}{e.step ? ` · Step ${e.step}` : ""}
        </span>
        <span className="font-mono text-[11.5px]" style={{ color: tone }}>
          {e.status === "open" ? `open ${usd(e.paperStake)} → ${usd(e.projectedReturn)}` : e.status === "queued" ? `queued ${usd(e.paperStake)}` : `${(e.paperProfit ?? 0) >= 0 ? "+" : ""}${usd(e.paperProfit)}${e.rolled ? " (rolls)" : ""}`}
        </span>
      </div>
      <LegList legs={e.legs} />
      {e.accountingNote ? <div className="mt-1 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{e.accountingNote}</div> : null}
      {e.notes ? <div className="mt-1 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>{e.notes}{e.publicBankBuilderVisible === false ? " · hidden from public Bank Builder" : ""}</div> : null}
    </div>
  );
}

function ExposureBars({ title, rows, total }: { title: string; rows: { key: string; amount: number }[]; total: number }) {
  if (!rows?.length) return null;
  return (
    <div>
      <div className="mb-1 font-mono uppercase tracking-[0.1em] text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{title}</div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{r.key}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--vault-rule)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.amount / Math.max(1, total)) * 100)}%`, background: "var(--gtp-bank-heat)" }} />
            </div>
            <span className="w-16 shrink-0 text-right font-mono text-[11px]" style={{ color: "var(--vault-text)" }}>{usd(r.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MrDubPage() {
  const portfolio = read("portfolio.json");
  const ledger = read("ledger.json");
  const daily = read("daily-summary.json");
  const moonshotLane = loadMoonshotLane();
  if (!portfolio) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-10"><p style={{ color: "var(--vault-text-mute)" }}>Mr. Dub portfolio is being generated.</p></main>;
  }
  const events = (ledger?.events ?? []);
  const rec = portfolio.record ?? {};
  const intel = portfolio.intelligence ?? {};
  const exp = portfolio.exposure ?? {};
  const health = portfolio.bankrollHealth ?? { score: 100, label: "No open exposure", reasons: [] };
  const days = daily?.days ?? [];
  const latestDay = days.length ? days[days.length - 1] : null;
  const stoppedEvents = events.filter((e: any) => e.type === "lane_stopped");
  const preview = loadTodaySlate().bankBuilderPreview;
  // Today's derived daily portfolio — four model-built CANDIDATE lanes ($0 placed until activated).
  const today = currentSlateDate() ?? currentEtDate();
  const dailyPortfolio = buildDailyPortfolio(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  // Top-level portfolio allocation across all four products (Bank Builder · Moonshot · WC Specials · Homer Nukes).
  const allocation = buildPortfolioAllocation(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  // Authoritative master ledger — every product's settled paper track record + overall totals.
  const masterLedger = buildMasterLedger(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  // Ledger calendar model — a presentation-only transform of the canonical daily-summary days.
  const ledgerCal = buildLedgerCalendar(days, portfolio.startingBankroll ?? 100);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:pt-8 flex flex-col gap-6 overflow-x-hidden">
      {/* 0 — Track-record social proof: 2× $100→$10K completed (factual, from the canonical ledger). */}
      <AchievementBanner />

      {/* 1 — Hero / current standings — the page LEADS with the money story (one story, not a wall of
            dashboards). The broader cross-product views (allocation, master ledger, today's plan) follow
            below, after the Bank Builder journey itself. */}
      <section className="rounded-2xl px-5 py-5" style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(135deg, rgba(212,175,55,0.10), rgba(26,16,11,0.4))" }}>
        <div className="flex items-center gap-3.5">
          <MrDubAvatar size={64} />
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold sm:text-[26px]" style={{ color: "var(--vault-text)" }}>Mr. Dub&rsquo;s Paper Portfolio</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em] text-[9.5px]" style={{ color: "var(--vault-gold-bright)", background: "rgba(217,164,65,0.12)", border: "1px solid rgba(217,164,65,0.35)" }}>
              <span aria-hidden>⚗</span> Paper Portfolio Scientist
            </span>
          </div>
        </div>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          Paper-only bankroll tracking for GameTimePicks model cards — Mr. Dub tracks every paper card, every official result, and every bankroll move. No wagers are placed. Not financial advice.
        </p>
        {/* The money path — start → bankroll → realized profit → ROI, in one glance (no mental math). */}
        <div className="mt-3 rounded-xl px-4 py-3.5" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.025)" }}>
          <div className="font-mono uppercase tracking-[0.12em] text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>The money path · paper · official results only</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-display tabular" style={{ fontSize: 17, fontWeight: 700, color: "var(--vault-text-mute)" }}>{usd(portfolio.startingBankroll)}</span>
            <span aria-hidden style={{ color: "var(--vault-text-faint)", fontSize: 15 }}>→</span>
            <span className="font-display tabular tracking-tight" style={{ fontSize: 27, fontWeight: 800, color: "var(--vault-text)", lineHeight: 1 }}>{usd(portfolio.currentBankroll)}</span>
            <span className="font-display tabular" style={{ fontSize: 17, fontWeight: 800, color: plColor(portfolio.settledProfit) }}>{(portfolio.settledProfit ?? 0) >= 0 ? "+" : ""}{usd(portfolio.settledProfit)}</span>
            <span className="font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>realized · {portfolio.roiMultiple ?? portfolio.roi}× ROI</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
            <span>Starting <span style={{ color: "var(--vault-text-mute)" }}>{usd(portfolio.startingBankroll)}</span></span>
            <span>High-water <span style={{ color: "var(--vault-text-mute)" }}>{usd(portfolio.highWaterMark)}</span></span>
            <span>Drawdown <span style={{ color: (portfolio.drawdown ?? 0) > 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-mute)" }}>{usd(portfolio.drawdown)} · {((portfolio.drawdownPct ?? 0) * 100).toFixed(2)}%</span></span>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="Record" value={`${rec.wins ?? 0}–${rec.losses ?? 0}`} sub={`${rec.voids ?? 0} void · ${rec.pending ?? 0} pending`} accent="var(--vault-success)" />
          <Tile label="Open exposure" value={usd(portfolio.openExposure)} sub={`${rec.pending ?? 0} open · ${(portfolio.awaitingCards ?? []).length} awaiting`} />
          <Tile label="High-water mark" value={usd(portfolio.highWaterMark)} sub="peak bankroll" accent="var(--vault-gold-bright)" />
          <Tile label="Bankroll health" value={String(health.score)} sub={health.label} accent="var(--vault-success)" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CTAS.map((c) => (
            <Link key={c.href} href={c.href} className="vault-press rounded-full px-3.5 py-1.5 font-mono uppercase tracking-[0.1em] text-[10.5px]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", textDecoration: "none" }}>{c.label} →</Link>
          ))}
        </div>
      </section>

      {/* 2 — Today / latest-day status strip */}
      {latestDay ? (
        <section className="rounded-xl px-4 py-3" style={{ border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono uppercase tracking-[0.12em] text-[10px]" style={{ color: "var(--gtp-bank-heat)" }}>Latest day · {latestDay.date}</span>
            <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>updated {portfolio.generatedAt?.slice(0, 16).replace("T", " ")}Z · official settlement</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
            <span style={{ color: "var(--vault-text-mute)" }}>Net P/L <span className="font-mono" style={{ color: plColor(latestDay.pl) }}>{latestDay.pl >= 0 ? "+" : ""}{usd(latestDay.pl)}</span></span>
            <span style={{ color: "var(--vault-text-mute)" }}>Settled <span style={{ color: "var(--vault-text)" }}>{latestDay.wins}W · {latestDay.losses}L · {latestDay.voids}V</span></span>
            <span style={{ color: "var(--vault-text-mute)" }}>Active exposure <span className="font-mono" style={{ color: "var(--vault-text)" }}>{usd(portfolio.openExposure)}</span></span>
            <span style={{ color: "var(--vault-text-mute)" }}>Awaiting <span style={{ color: "var(--vault-text)" }}>{(portfolio.awaitingCards ?? []).length} card(s)</span></span>
          </div>
        </section>
      ) : null}

      {/* 3 — Mr. Dub's Dual Bank Builder (visual ladders) + stopped-lane transparency */}
      <section>
        <SectionHeader eyebrow="Paper Dual Bank Builder" title="Mr. Dub's two lanes" sub="The same visual ladders as the public Bank Builder — plus a transparent history of stopped lanes the public page keeps clean." />
        <div className="mt-2"><DualLadderBoard preview={preview} /></div>
        {stoppedEvents.length ? (
          <details className="mt-3 rounded-xl" style={{ background: "rgba(242,54,69,0.04)", border: "1px solid var(--vault-border)" }}>
            <summary className="cursor-pointer px-3.5 py-2.5 text-[12.5px]" style={{ color: "var(--vault-text-mute)", listStyle: "none" }}>
              Stopped-lane history · {stoppedEvents.length} — the real settled losses (hidden from the public Bank Builder, tracked here) ▾
            </summary>
            <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
              {stoppedEvents.map((e: any) => <EventCard key={e.eventId} e={e} />)}
            </div>
          </details>
        ) : null}
      </section>

      {/* 4 — Active / awaiting cards */}
      <section>
        <SectionHeader eyebrow="Open & awaiting" title="Active and awaiting cards" sub="Currently placed paper cards plus lanes awaiting the next qualified card." />
        {portfolio.openExposure > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {events.filter((e: any) => e.status === "open").map((e: any) => <EventCard key={e.eventId} e={e} />)}
          </div>
        ) : (
          <div className="mt-2 rounded-xl px-4 py-3 text-[12.5px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>
            No active paper exposure right now. Next qualified cards will appear after the next slate generation.
            <ul className="mt-1.5 flex flex-col gap-1">
              {(portfolio.awaitingCards ?? []).map((a: any, i: number) => (
                <li key={i} className="font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
                  · Lane {a.laneId?.slice(-1).toUpperCase()} · {a.kind === "queued_restart" ? `starting path ($${a.stake ?? 100})` : `Step ${a.step} awaiting next card`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 4b — Moonshot: a SEPARATE high-volatility paper product (independent daily longshot cards). */}
      {portfolio.moonshot ? (
        <section>
          <SectionHeader eyebrow="Separate · high-volatility" title="Moonshot" sub="Independent daily World Cup longshot cards — tracked apart from the core Dual Bank Builder. Higher variance by design, not a ladder." />
          <p className="mt-1 mb-2 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
            🌙 Moonshot exposure <span className="font-mono" style={{ color: "#8b7bf0" }}>{usd(portfolio.moonshot.exposure)}</span> · separate from the {usd(portfolio.openExposure)} core lanes (total {usd(portfolio.totalOpenExposure ?? portfolio.openExposure + portfolio.moonshot.exposure)}). Does not affect the core Lane A/B record. Paper-only · settles from official sources.
          </p>
          {moonshotLane ? (
            <MoonshotLaneTracker lane={moonshotLane} record={portfolio.moonshot.record} exposure={portfolio.moonshot.exposure} mode="compact" />
          ) : (
            <Link href="/moonshot" className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "#b9a8ff" }}>
              Open the Moonshot Lane daily tracker →
            </Link>
          )}
        </section>
      ) : null}

      {/* 5 — Daily ledger as a CALENDAR: P/L cells + product dots + running bankroll; tap a day for the
            exact tickets. Presentation-only (buildLedgerCalendar reads the canonical daily-summary). */}
      <section>
        <SectionHeader eyebrow={`Ledger calendar · ${days.length} settled days`} title="Bankroll calendar" sub="Each day's paper P/L at a glance — green up, red down. Tap a day for every ticket, its result, and the bankroll movement." />
        <div className="mt-2">
          <LedgerCalendar months={ledgerCal.months} stats={ledgerCal.stats} />
        </div>
      </section>

      {/* 6 — Exposure & bankroll health */}
      <section>
        <SectionHeader eyebrow="Risk & exposure" title="Exposure and bankroll health" sub="Paper exposure, drawdown and bankroll health — educational tracking, not financial advice." />
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="High-water mark" value={usd(portfolio.highWaterMark)} />
          <Tile label="Drawdown" value={usd(portfolio.drawdown)} sub={`${((portfolio.drawdownPct ?? 0) * 100).toFixed(2)}%`} accent={(portfolio.drawdown ?? 0) > 0 ? "var(--gtp-bank-heat)" : undefined} />
          <Tile label="Win rate" value={intel.winRate != null ? `${Math.round(intel.winRate * 100)}%` : "—"} accent="var(--vault-success)" sub={`streak ${intel.longestWinStreak ?? 0}W`} />
          <Tile label="Largest open card" value={usd(intel.largestOpenCard)} />
        </div>
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>Bankroll health · {health.label}</span>
            <span className="font-mono text-[13px]" style={{ color: "var(--vault-success)" }}>{health.score}/100</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "var(--vault-rule)" }}>
            <div className="h-full rounded-full" style={{ width: `${health.score}%`, background: "var(--vault-success)" }} />
          </div>
          {(health.reasons ?? []).length ? (
            <ul className="mt-2 flex flex-col gap-0.5">
              {health.reasons.map((r: string, i: number) => <li key={i} className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>· {r}</li>)}
            </ul>
          ) : null}
        </div>
        {(exp.bySport?.length || exp.byMarket?.length || exp.byLane?.length) ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ExposureBars title="By sport" rows={exp.bySport} total={portfolio.openExposure} />
            <ExposureBars title="By market" rows={exp.byMarket} total={portfolio.openExposure} />
            <ExposureBars title="By team / player" rows={exp.byTeamOrPlayer} total={portfolio.openExposure} />
            <ExposureBars title="By lane" rows={exp.byLane} total={portfolio.openExposure} />
          </div>
        ) : (
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>No open exposure to break down right now — the exposure dashboard populates when a paper card is placed.</p>
        )}
      </section>

      {/* 7 — Full ledger */}
      <section>
        <SectionHeader eyebrow={`Full ledger · ${events.length} events`} title="Every paper event" sub="Newest first — wins, losses, voids, stopped lanes, advances, restarts, and open cards with official settlement references." />
        <div className="mt-2 flex flex-col gap-2">
          {events.slice().reverse().map((e: any) => <EventCard key={e.eventId} e={e} />)}
        </div>
      </section>

      {/* 8 — Broader four-product platform (supporting detail, below the Bank Builder story): how the one
            bankroll is allocated, the cross-product master ledger, and today's full candidate plan. */}
      <div className="mt-2 flex flex-col gap-6 border-t pt-6" style={{ borderColor: "var(--vault-rule)" }}>
        <p className="-mb-2 font-mono uppercase tracking-[0.14em] text-[10px]" style={{ color: "var(--vault-text-faint)" }}>The wider platform · all four products</p>
        <MasterLedgerSection ledger={masterLedger} />
        <PortfolioAllocationSection allocation={allocation} />
        <DailyPortfolioSection portfolio={dailyPortfolio} />
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only educational tracking. No wagers are placed. Mr. Dub is not a sportsbook and this is not financial advice.
        Bank Builder shows active paths and successful completed ladders; Mr. Dub tracks the full paper performance, including stopped lanes and restarts.
      </p>
    </main>
  );
}
