/**
 * Portfolio allocation — the unified, read-side view of Mr. Dub's FOUR daily products and how the
 * single Mr. Dub bankroll is allocated across them today:
 *
 *   1. Bank Builder        — the dual-lane $10K ladder (seed exposure from the activated daily portfolio)
 *   2. Moonshot            — the higher-volatility $25 → $3,000 ladder
 *   3. World Cup Specials   — 5 suggested WC longshots/day, $20 each → $100/day allocation
 *   4. Homer Nukes (MLB)    — top-5 daily home-run picks, $20 each → $100/day allocation
 *
 * SAFE BY DESIGN: a pure projection. It reads the protected portfolio.json (bankroll + crown, never
 * written) and the per-product artifacts, and computes today's allocation / open exposure / share of
 * bankroll. It NEVER mutates money state — realized P/L only ever changes through official settlement.
 * Products with no posted board (e.g. MLB before odds post) report $0 exposure and a data-gated note.
 */
import fs from "node:fs";
import path from "node:path";
import { buildDailyPortfolio } from "./daily-portfolio";
import { loadWorldCupSpecials } from "../world-cup/world-cup-specials";
import { loadHomerNukes, HOMER_NUKES_STAKE_PER_PICK, HOMER_NUKES_DAILY_ALLOCATION, HOMER_NUKES_PICK_COUNT } from "../mlb/homer-nukes";

export const WC_SPECIALS_STAKE_PER_CARD = 20;
export const WC_SPECIALS_CARDS_PER_DAY = 5;
export const WC_SPECIALS_DAILY_ALLOCATION = WC_SPECIALS_STAKE_PER_CARD * WC_SPECIALS_CARDS_PER_DAY; // $100/day

export type ProductKey = "bank-builder" | "moonshot" | "world-cup-specials" | "homer-nukes";
export type ProductStatus = "active" | "candidate" | "pending" | "no-board";

export interface ProductAllocation {
  key: ProductKey;
  label: string;
  href: string;
  accent: string;
  dailyAllocation: number;          // notional $/day this product is allocated
  openExposure: number;             // open PAPER exposure currently at risk today
  pctOfBankroll: number;            // openExposure / activeBankroll (0..1)
  record: { wins: number; losses: number; pushes: number };
  realizedPnl: number;              // settled-only P/L contribution (0 until official settlement)
  roi: number | null;               // realizedPnl / staked, or null when nothing has settled
  status: ProductStatus;
  statusLabel: string;
  note: string;
}

export interface PortfolioAllocation {
  date: string;
  activeBankroll: number;
  crownBankroll: number;
  totalDailyAllocation: number;
  totalOpenExposure: number;
  availableBankroll: number;        // activeBankroll − totalOpenExposure
  products: ProductAllocation[];
  note: string;
}

const round2 = (n: number) => Number(n.toFixed(2));
const STATUS_LABEL: Record<ProductStatus, string> = {
  active: "Active", candidate: "Candidate", pending: "Pending", "no-board": "Awaiting board",
};

/** Read the protected bankroll + crown (never written). */
function loadCore(root: string): { activeBankroll: number; crownBankroll: number; record: { wins: number; losses: number; voids: number; pending: number } } {
  let activeBankroll = 10176.17, crownBankroll = 10376.17;
  let record = { wins: 0, losses: 0, voids: 0, pending: 0 };
  try {
    const p = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"), "utf8"));
    if (typeof p.currentBankroll === "number") activeBankroll = p.currentBankroll;
    if (typeof p.crownBankroll === "number") crownBankroll = p.crownBankroll;
    if (p.record) record = p.record;
  } catch { /* fail closed → defaults */ }
  return { activeBankroll, crownBankroll, record };
}

/**
 * Build the four-product allocation for the slate. All exposure figures are today's PAPER allocation;
 * realized P/L stays at 0 until official settlement writes it (this projection never does).
 */
export function buildPortfolioAllocation(root: string, nowIso: string, date: string): PortfolioAllocation {
  const { activeBankroll, crownBankroll } = loadCore(root);
  const daily = buildDailyPortfolio(root, nowIso, date);

  // 1 + 2 — Bank Builder + Moonshot: seed exposure from the activated daily portfolio.
  const bbExposure = round2(daily.exposure.core);
  const moonExposure = round2(daily.exposure.moonshot);
  const bbActive = daily.cards.some((c) => c.product === "bank-builder" && c.status === "active");
  const moonActive = daily.cards.some((c) => c.product === "moonshot" && c.status === "active");

  // 3 — World Cup Specials: 5 suggested cards/day × $20 = $100/day. Open exposure only when today's
  // pre-event cards are posted; realized P/L comes from official settlement (0 here, pending).
  const specials = loadWorldCupSpecials();
  const specialsLive = !!specials && specials.date === date && (specials.cards?.length ?? 0) > 0;
  const specialsCards = specialsLive ? Math.min(WC_SPECIALS_CARDS_PER_DAY, specials!.cards.length) : 0;
  const specialsExposure = round2(specialsCards * WC_SPECIALS_STAKE_PER_CARD);

  // 4 — Homer Nukes (MLB): top-5 HR picks/day × $20 = $100/day. Data-gated — $0 until MLB HR props post.
  const homer = loadHomerNukes(root, date);
  const homerPicks = homer.available ? Math.min(HOMER_NUKES_PICK_COUNT, homer.picks.length) : 0;
  const homerExposure = round2(homerPicks * HOMER_NUKES_STAKE_PER_PICK);

  const pct = (x: number) => (activeBankroll > 0 ? round2(x / activeBankroll) : 0);
  const products: ProductAllocation[] = [
    {
      key: "bank-builder", label: "Bank Builder", href: "/bank-builder", accent: "var(--vault-gold-bright)",
      dailyAllocation: bbExposure, openExposure: bbExposure, pctOfBankroll: pct(bbExposure),
      record: { wins: 0, losses: 0, pushes: 0 }, realizedPnl: 0, roi: null,
      status: bbActive ? "active" : "candidate", statusLabel: STATUS_LABEL[bbActive ? "active" : "candidate"],
      note: "Dual-lane ladder toward $10K — settled P/L rolls the ladder; the seed is the open exposure.",
    },
    {
      key: "moonshot", label: "Moonshot", href: "/moonshot", accent: "#8b7bf0",
      dailyAllocation: moonExposure, openExposure: moonExposure, pctOfBankroll: pct(moonExposure),
      record: { wins: 0, losses: 0, pushes: 0 }, realizedPnl: 0, roi: null,
      status: moonActive ? "active" : "candidate", statusLabel: STATUS_LABEL[moonActive ? "active" : "candidate"],
      note: "Higher-volatility $25 → $3,000 ladder — kept apart from the core lanes.",
    },
    {
      key: "world-cup-specials", label: "World Cup Specials", href: "/world-cup-specials", accent: "#e7b15a",
      dailyAllocation: WC_SPECIALS_DAILY_ALLOCATION, openExposure: specialsExposure, pctOfBankroll: pct(specialsExposure),
      record: { wins: 0, losses: 0, pushes: 0 }, realizedPnl: 0, roi: null,
      status: specialsLive ? "active" : "pending", statusLabel: STATUS_LABEL[specialsLive ? "active" : "pending"],
      note: specialsLive
        ? `${specialsCards} suggested World Cup parlays today · $${WC_SPECIALS_STAKE_PER_CARD} each · settled P/L from official results.`
        : "No World Cup Specials posted for this slate yet.",
    },
    {
      key: "homer-nukes", label: "Homer Nukes", href: "/homer-nukes", accent: "var(--gtp-bank-heat)",
      dailyAllocation: HOMER_NUKES_DAILY_ALLOCATION, openExposure: homerExposure, pctOfBankroll: pct(homerExposure),
      record: { wins: 0, losses: 0, pushes: 0 }, realizedPnl: 0, roi: null,
      status: homer.available ? "active" : "no-board", statusLabel: STATUS_LABEL[homer.available ? "active" : "no-board"],
      note: homer.available
        ? `Top ${homerPicks} MLB home-run picks today · $${HOMER_NUKES_STAKE_PER_PICK} each.`
        : "MLB home-run board not posted yet — $0 placed until the Odds API posts today's props.",
    },
  ];

  const totalOpenExposure = round2(products.reduce((s, p) => s + p.openExposure, 0));
  const totalDailyAllocation = round2(products.reduce((s, p) => s + p.dailyAllocation, 0));
  return {
    date, activeBankroll, crownBankroll, totalDailyAllocation, totalOpenExposure,
    availableBankroll: round2(activeBankroll - totalOpenExposure),
    products,
    note: "Today's paper allocation across all four products, drawn from the single Mr. Dub bankroll. Realized P/L and records update only on official settlement; the crown ladder is historical and separate.",
  };
}
