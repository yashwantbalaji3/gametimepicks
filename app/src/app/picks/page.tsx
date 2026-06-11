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
    ...normalizeWcCards(loadWorldCupParlays()),
    ...normalizeOptimizerSlips(getSuggestedParlaysForDate(today)?.slips ?? null, { date: today }),
    ...normalizeUfcCards(loadUfc() as Parameters<typeof normalizeUfcCards>[0], today),
  ];
  const byRisk = (["Low", "Medium", "High", "Longshot"] as const).map(
    (r) => `${r} ${cards.filter((c) => c.riskTier === r).length}`,
  );

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <SectionHeader
        eyebrow={`Suggested cards · ${cards.length} live`}
        title="Picks"
        sub={`Every suggested paper card across sports, by sport and risk (${byRisk.join(" · ")}). Filter, then enter any stake to see the projected paper return.`}
      />
      <PicksExperience cards={cards} />
    </div>
  );
}
