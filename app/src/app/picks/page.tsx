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

export const metadata = {
  title: "Picks · GameTime Picks",
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

export default function PicksPage() {
  const today = currentEtDate();
  const cards: PublicSuggestedCard[] = [
    ...loadDailyMixedCards(),
    ...normalizeWcCards(loadWorldCupParlays()),
    ...normalizeOptimizerSlips(getSuggestedParlaysForDate(today)?.slips ?? null, { date: today }),
    ...normalizeUfcCards(loadUfc() as Parameters<typeof normalizeUfcCards>[0], today),
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <SectionHeader
        eyebrow={`Suggested cards · ${new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })} · ${cards.length} live`}
        title="Picks"
        sub="Browse paper cards by goal. Odds, returns, and results are tracked for research — educational, paper-only."
      />
      <PicksExperience cards={cards} />
    </div>
  );
}
