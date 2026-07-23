/**
 * /picks — the unified suggested-card lobby across every sport. Aggregates real, eligible cards
 * (World Cup, MLB/NBA optimizer, UFC moneyline) via the shared normalizers + renders them through
 * the shared SuggestedCard with sport/risk/Bank-eligible filters. Public-data only.
 */
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "@/lib/freshness";
import { loadWorldCupParlays } from "@/lib/world-cup/projections";
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";
import {
  normalizeWcCards,
  normalizeOptimizerSlips,
  normalizeUfcCards,
  loadDailyMixedCards,
  type PublicSuggestedCard,
} from "@/lib/normalize";
import PicksExperience from "@/components/picks-experience";
import ParlaysExplorer from "@/components/parlays/parlays-explorer";
import HowToRead from "@/components/how-to-read";
import { loadTodaySlate, currentSlateDate } from "@/lib/parlays/ui-loader";
import SlateLivenessBanner from "@/components/slate-liveness-banner";
import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";
import { buildCoverageMatrix } from "@/lib/parlays/coverage-matrix";
import PicksSurfaceHeader from "@/components/picks-surface-header";
import Top10BoardSection from "@/components/top10/top10-board";
import { buildTop10Board } from "@/lib/top10/top10-picks";
import Link from "next/link";
import { loadOfficialPublishedCandidate } from "@/lib/bank-builder-official-candidate";
import { formatAmerican } from "@/lib/odds-math";

export const metadata = {
  title: "Picks Lab · GameTimePicks",
  description:
    "Every suggested paper card in one place — MLB and more, by sport and risk. Enter any stake to see the projected paper return. Educational, paper-only.",
};

function loadUfc(): unknown {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "suggested-parlays-latest.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

/** True once the UFC event has been officially settled — its cards are then a result, not an
 *  active pick, so /picks must stop showing them in the live slate. */
function ufcSettled(): boolean {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "results-settled-latest.json"), "utf8"));
    return s?.status === "final";
  } catch {
    return false;
  }
}

export default function PicksPage() {
  // Frame on the latest generated slate (equals the wall clock once an overnight slate exists).
  const today = currentSlateDate() ?? currentEtDate();
  const engineSlate = loadTodaySlate(); // canonical methodology-engine cards (WC + Mixed + by-risk)
  // Only TODAY's slate is an active pick. Stale daily-mixed + World Cup artifacts (last
  // generated on an earlier date) are date-gated out so /picks never leads with old cards.
  // Order = tonight's focus first: UFC, then MLB, then any still-current WC/mixed.
  const wcParlays = loadWorldCupParlays();
  const freshWcParlays = wcParlays && wcParlays.date === today ? wcParlays : null;
  // Settled UFC cards are a result, not an active pick — gate them out of the live slate.
  const ufcCardsForToday = ufcSettled() ? null : (loadUfc() as Parameters<typeof normalizeUfcCards>[0]);
  const cards: PublicSuggestedCard[] = [
    ...normalizeUfcCards(ufcCardsForToday, today),
    ...normalizeOptimizerSlips(getSuggestedParlaysForDate(today)?.slips ?? null, { date: today }),
    ...normalizeWcCards(freshWcParlays),
    ...loadDailyMixedCards(today),
  ];

  // Bank Builder final step leads the Picks lobby when an official candidate is published.
  const step5 = loadOfficialPublishedCandidate();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      {/* Slate liveness (real ET clock) — no-play framing when the slate isn't today's live action. */}
      <SlateLivenessBanner
        buildTimeToday={currentEtDate()}
        latestSlate={today}
        latestSlateHasGames={engineSlate.gameSpecific.length > 0 || engineSlate.allSuggested.length > 0}
        archiveHref="/results"
        archiveLabel="See results & receipts"
        includeMlbNote
      />
      <HowToRead preset="picks" title="How to read Picks Lab — explore model-qualified legs, build a paper-only card" />
      {step5 ? (
        <Link
          href="/bank-builder"
          className="gtp-card-hover relative block overflow-hidden rounded-2xl px-5 py-4"
          style={{ border: "1px solid rgba(242, 54, 69,0.4)", background: "linear-gradient(135deg, rgba(225, 29, 42,0.12), rgba(26, 16, 11,0.4))", textDecoration: "none" }}
        >
          <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-24 w-24 translate-x-6 -translate-y-8 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(8px)", opacity: 0.5 }} />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--gtp-bank-heat)" }}>Bank Builder · Final step · Road to $10K</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] rounded-full px-2 py-0.5" style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)" }}>Official Step 5 Candidate · pending</span>
          </div>
          <div className="relative mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>
              {step5.legs.map((l) => l.label).join("  +  ")}
            </span>
          </div>
          <div className="relative mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
            <span style={{ color: "var(--vault-gold-bright)" }}>{formatAmerican(step5.combinedAmericanOdds)}</span>
            <span>·</span>
            <span>${step5.stake.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → ${step5.projectedReturn.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span style={{ color: "var(--gtp-bank-heat)" }}>View final step →</span>
          </div>
        </Link>
      ) : null}
      <PicksSurfaceHeader
        eyebrow="Picks Lab"
        title="Picks Lab"
        slateDate={today}
        status={engineSlate.available ? "pregame" : "data_pending"}
        counts={{ suggestedCards: engineSlate.allSuggested.length, games: engineSlate.gameSpecific.length }}
        primaryAction={{ label: "How it works", href: "/methodology" }}
        secondaryAction={{ label: "Market Guide", href: "/market-guide" }}
        note="Build a paper parlay from today's top model-qualified picks. Only qualified model reads appear here — we hide raw props that don't clear the model's reliability, data and settlement filters. Paper-only; no bet is placed."
      />
      {/* MODEL TOP 10 — the universal cross-sport board (same derived model as /today), so the Parlay Lab
          leads with the model's strongest single legs before the pre-built cards. */}
      <section>
        <h2 className="mb-2 font-semibold" style={{ color: "var(--vault-text)", fontSize: 16 }}>Model Top 10 picks · {today}</h2>
        <Top10BoardSection board={buildTop10Board(path.join(process.cwd(), "public", "data"), today, Date.now())} />
      </section>

      {/* Advanced — the full optimizer coverage marketplace (by-risk cards + eligible-leg matrix). Moved
          behind a collapsed disclosure so Picks Lab LEADS with the model's top picks, not raw inventory. */}
      <details className="rounded-xl" style={{ border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.02)" }}>
        <summary className="cursor-pointer select-none px-4 py-3 text-[13px]" style={{ color: "var(--vault-text-mute)", minHeight: 44 }}>
          Advanced — optimizer coverage &amp; the full eligible-leg marketplace (by risk). Tap to expand.
        </summary>
        <div className="px-1 pb-2 pt-1">
          <ParlaysExplorer slate={engineSlate} coverage={buildCoverageMatrix(engineSlate, loadMoonshotLane(), new Date().toISOString())} />
        </div>
      </details>

      {/* Legacy curated cards kept as a secondary, collapsed reference (optimizer + native WC). */}
      {cards.length > 0 ? (
        <details className="rounded-xl" style={{ border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.02)" }}>
          <summary className="cursor-pointer px-4 py-3 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
            Legacy curated cards ({cards.length}) — the older optimizer/native set. Tap to view.
          </summary>
          <div className="px-1 pb-2"><PicksExperience cards={cards} /></div>
        </details>
      ) : null}
    </div>
  );
}
