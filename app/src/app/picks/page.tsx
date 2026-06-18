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
import SectionHeader from "@/components/section-header";
import Link from "next/link";
import { loadOfficialPublishedCandidate } from "@/lib/bank-builder-official-candidate";
import { formatAmerican } from "@/lib/odds-math";

export const metadata = {
  title: "Parlay Lab · GameTime Picks",
  description:
    "Every suggested paper card in one place — World Cup, MLB and more, by sport and risk. Enter any stake to see the projected paper return. Educational, paper-only.",
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
  const today = currentEtDate();
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
      <Link
        href="/parlays"
        className="gtp-card-hover relative block overflow-hidden rounded-2xl px-5 py-4"
        style={{ border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)", background: "rgba(26,16,11,0.5)", textDecoration: "none" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Methodology engine parlays</span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>Open engine view →</span>
        </div>
        <div className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          World Cup, MLB, and <span style={{ color: "var(--vault-text)" }}>Mixed</span> suggested parlays by risk (low · medium · high · longshot), plus same-game cards and the eligible-leg marketplace — leakage-validated, pre-event.
        </div>
      </Link>
      <SectionHeader
        eyebrow={`Parlay Lab · ${new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })} · ${cards.length} curated`}
        title="Parlay Lab"
        sub="The model's curated paper cards across every sport, by goal and risk. Odds, returns, and results are tracked for research — educational, paper-only."
      />
      <PicksExperience cards={cards} />
    </div>
  );
}
