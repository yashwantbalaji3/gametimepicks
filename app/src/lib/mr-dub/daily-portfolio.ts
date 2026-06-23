/**
 * Mr. Dub DAILY PORTFOLIO — a derived view of the day's four paper lanes (Bank Builder A/B +
 * Moonshot A/B) generated from the unified model-pick pool.
 *
 * SAFE BY DESIGN: this is a pure read-side projection. It does NOT mutate the historical bankroll
 * formula, the crown, or any money field. The four lanes are CANDIDATES ($0 placed) until a separate,
 * tested activation step places exposure — so:
 *   activeBankroll    = portfolio.currentBankroll      (unchanged)
 *   openExposure      = Σ ACTIVE lane stakes           ($0 while candidates)
 *   availableBankroll = activeBankroll − openExposure
 *   potentialReturn   = Σ candidate potential returns  (informational, if activated + won)
 * Crown is reported separately and never blended with active bankroll.
 */
import fs from "node:fs";
import path from "node:path";
import { loadWorldCupModelPicks, buildDailyLaneCandidates, type LaneCandidate } from "../world-cup/model-qualified-picks";

export interface DailyPortfolioLeg { selection: string; marketLabel: string; matchup: string; odds: number }
export interface DailyPortfolioCard {
  id: string;
  product: "bank-builder" | "moonshot";
  productLabel: string;
  lane: "A" | "B";
  status: "candidate" | "active" | "pending" | "won" | "lost" | "void";
  stake: number;
  combinedOdds: number;
  potentialReturn: number;
  legCount: number;
  targetLegs: number;
  legs: DailyPortfolioLeg[];
  correlationNote: string | null;
  shortfallNote: string | null;
}
export interface DailyPortfolio {
  date: string;
  startingBankroll: number;
  activeBankroll: number;
  crownBankroll: number;     // historical completed ladder — separate
  openExposure: number;      // Σ ACTIVE stakes (0 while candidates)
  availableBankroll: number;
  potentialReturn: number;   // Σ candidate potential returns if activated + won
  exposure: { core: number; moonshot: number; total: number };
  cards: DailyPortfolioCard[];
  anyActive: boolean;
  note: string;
}

const PRODUCT_LABEL: Record<string, string> = { "bank-builder": "Bank Builder", moonshot: "Moonshot" };

function toCard(l: LaneCandidate): DailyPortfolioCard {
  return {
    id: l.id, product: l.product, productLabel: PRODUCT_LABEL[l.product] ?? l.product, lane: l.lane,
    status: l.status, stake: l.stake, combinedOdds: l.combinedOdds, potentialReturn: l.potentialReturn,
    legCount: l.legCount, targetLegs: l.targetLegs,
    legs: l.legs.map((p) => ({ selection: p.selection, marketLabel: p.marketLabel, matchup: p.matchup, odds: p.odds })),
    correlationNote: l.correlationNote, shortfallNote: l.shortfallNote,
  };
}

/** Build the derived daily portfolio for a slate. Never mutates money state. */
export function buildDailyPortfolio(root: string, nowIso: string, date: string): DailyPortfolio {
  let activeBankroll = 10176.17, crownBankroll = 10376.17;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"), "utf8"));
    if (typeof p.currentBankroll === "number") activeBankroll = p.currentBankroll;
    if (typeof p.crownBankroll === "number") crownBankroll = p.crownBankroll;
  } catch { /* fail closed → defaults */ }

  const pool = loadWorldCupModelPicks(root, nowIso, date);
  const lanes = buildDailyLaneCandidates(pool, date);
  const cards = [lanes.bankBuilderA, lanes.bankBuilderB, lanes.moonshotA, lanes.moonshotB].map(toCard);

  // Exposure counts ACTIVE stakes only; candidates carry $0 placed exposure.
  const coreExposure = cards.filter((c) => c.product === "bank-builder" && c.status === "active").reduce((s, c) => s + c.stake, 0);
  const moonshotExposure = cards.filter((c) => c.product === "moonshot" && c.status === "active").reduce((s, c) => s + c.stake, 0);
  const openExposure = Number((coreExposure + moonshotExposure).toFixed(2));
  const potentialReturn = Number(cards.reduce((s, c) => s + (c.potentialReturn || 0), 0).toFixed(2));
  const anyActive = cards.some((c) => c.status === "active");

  return {
    date, startingBankroll: activeBankroll, activeBankroll, crownBankroll,
    openExposure, availableBankroll: Number((activeBankroll - openExposure).toFixed(2)),
    potentialReturn,
    exposure: { core: coreExposure, moonshot: moonshotExposure, total: openExposure },
    cards, anyActive,
    note: anyActive
      ? "Today's paper portfolio — active lanes place paper exposure; settled P/L updates the active bankroll. Crown is the historical completed ladder, shown separately."
      : "Today's paper portfolio — four model-built CANDIDATE lanes. No exposure is placed until a lane is activated; active bankroll and crown are unchanged.",
  };
}
