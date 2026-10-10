/**
 * Risk-ladder reader — today's card per tier plus the tier-by-tier record.
 *
 * Fail-closed on the date like every other slate reader here: a ladder built for another day is not
 * this day's ladder, and the surface renders nothing rather than yesterday's picks under today's
 * heading.
 *
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";

import type { LadderCard, LadderSkip } from "@/components/parlays/risk-ladder-board";
import type { BettorTier } from "@/components/parlays/parlay-lab-entry";
import { buildLegRecord } from "@/lib/parlays/lab/leg-record.mjs";
import { buildShapeRecord } from "@/lib/parlays/lab/card-shape.mjs";
import { publishedBandRecord } from "@/lib/parlays/published-band-record.mjs";

export interface TierRecord {
  readonly wins: number;
  readonly losses: number;
  readonly pushes: number;
  readonly pending: number;
  readonly decisive: number;
  readonly hitRate: number | null;
  readonly roi: number | null;
  readonly staked: number;
  readonly returned: number | null;
}

/** The live ledger — restarted at the policy change, with the prior policy preserved beside it. */
export interface LabLedger {
  readonly policy: { readonly version: number; readonly since: string; readonly summary: string };
  readonly streams: readonly {
    readonly id: string; readonly label: string; readonly live: boolean; readonly blocked?: string;
    readonly settledDays: number;
    readonly record: { readonly wins: number; readonly losses: number; readonly hitRate: number | null; readonly roi: number | null };
  }[];
  readonly priorPolicy: {
    readonly label: string; readonly summary: string; readonly gradedDays: number;
    readonly wins: number; readonly losses: number; readonly roi: number | null; readonly note: string;
    readonly firstDay: string | null; readonly lastDay: string | null;
  };
}

/**
 * D1 (Session 5) · the PUBLISHED cards' record by band — the only band record a public surface shows (builder,
 * slip reader, chance meter). The candidate pool (`loadRiskLadderRecord`) is model detail.
 */
export function loadPublishedBandRecord(root: string, sport = "mlb"): PublishedBandRecord | null {
  return publishedBandRecord(loadLabLedger(root), sport) as PublishedBandRecord | null;
}
export interface PublishedBandRecord {
  readonly population: "PUBLISHED_CARDS";
  readonly sport: string;
  readonly since: string | null;
  readonly settledDays: number;
  readonly record: { readonly wins: number; readonly losses: number; readonly pushes: number; readonly hitRate: number | null; readonly roi: number | null };
  readonly byTier: Readonly<Record<string, { readonly wins: number; readonly losses: number; readonly pushes: number; readonly hitRate: number | null; readonly roi: number | null; readonly population: string; readonly since: string | null }>>;
}

export function loadLabLedger(root: string): LabLedger | null {
  try { return JSON.parse(fs.readFileSync(path.join(root, "parlays", "lab-ledger.json"), "utf8")); }
  catch { return null; }
}

/** One day's settled lab cards, narrowed to what the style replay reads (P260). */
export interface LabSettledDoc {
  readonly date: string;
  readonly policyVersion?: number;
  readonly cards: readonly { readonly sport: string; readonly tier: string; readonly result: string; readonly combinedDecimal: number }[];
}

/**
 * Every settled day of the lab, from the same receipts the ledger is re-derived from. An unreadable
 * day is skipped, never guessed at; an unreadable directory is an empty list (the replay then says
 * there is nothing settled to replay rather than drawing a flat line).
 */
export function loadLabSettled(root: string): LabSettledDoc[] {
  const dir = path.join(root, "parlays", "lab-settled");
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { return []; }
  const out: LabSettledDoc[] = [];
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      out.push({
        date: String(d.date), policyVersion: d.policyVersion,
        cards: (d.cards ?? []).map((c: Record<string, unknown>) => ({
          sport: String(c.sport ?? ""), tier: String(c.tier ?? ""), result: String(c.result ?? ""), combinedDecimal: Number(c.combinedDecimal),
        })),
      });
    } catch { /* a torn receipt is not a result */ }
  }
  return out;
}

/**
 * The settled leg record (P268), read from the graded card receipts.
 *
 * Server-only and read at build time, so the page ships the aggregate rather than 74 days of legs.
 * Dates the reader never sees are still needed for the dedupe — a leg counts once per day — so the
 * whole corpus is parsed here and only the summary crosses into the component.
 */
export function loadGradedLegRecord(root: string, sport = "mlb", minDecided = 30) {
  const docs: unknown[] = [];
  /* BOTH graded streams: the daily suggested-card set and the risk-band cards. They are different
     populations of card, but they are one population of LEG — and the band cards' own families are
     only in the second file. buildLegRecord dedupes across them. */
  for (const stream of ["graded", "optimizer-graded"]) {
    const dir = path.join(root, "parlays", stream);
    let files: string[] = [];
    try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { continue; }
    for (const f of files) {
      try { docs.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); } catch { /* a torn receipt is not a result */ }
    }
  }
  if (docs.length === 0) return null;
  const record = buildLegRecord(docs as never[], { sport, minDecided });
  return record.families.length ? record : null;
}

/**
 * The card-shape record (P271) — our published cards by how many legs they carried.
 *
 * Same two streams and the same build-time read as the leg record: the page ships six rows, not
 * seventy-three days of cards.
 */
export function loadCardShapeRecord(root: string, sport = "mlb", minCards = 30) {
  const docs: unknown[] = [];
  for (const stream of ["graded", "optimizer-graded"]) {
    const dir = path.join(root, "parlays", stream);
    let files: string[] = [];
    try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { continue; }
    for (const f of files) {
      try { docs.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); } catch { /* a torn receipt is not a result */ }
    }
  }
  if (docs.length === 0) return null;
  const record = buildShapeRecord(docs as never[], { sport, minCards });
  return record.sizes.length ? record : null;
}

export interface RiskLadder {
  readonly date: string;
  readonly generatedAt: string;
  readonly cards: readonly LadderCard[];
  readonly skipped: readonly LadderSkip[];
  /** F-1: what the card-leg eligibility rule withheld (absent on ladders built before the rule). */
  readonly eligibility?: { readonly rule: string; readonly source: string; readonly withheldMarketContext: number; readonly withheldFamilies: readonly string[] };
  readonly bettorTiers: readonly BettorTier[];
  readonly record: {
    readonly gradedDays: number;
    readonly firstDay: string | null;
    readonly lastDay: string | null;
    readonly byTier: Record<string, TierRecord>;
    readonly overall: {
      readonly wins: number;
      readonly losses: number;
      readonly staked: number;
      readonly returned: number | null;
      readonly roi: number | null;
    };
  };
}

/**
 * D3 (Session 5) · MLB's own season state (mlb/season-state.json, capture-mlb-season-state.mjs), or null.
 * Read by every MLB card surface so an off-season never shows last season's cards as a current slate.
 */
export interface MlbSeasonStateDoc { readonly date: string; readonly state: string; readonly reason: string; readonly generatedAt?: string }
export function loadMlbSeasonState(root: string): MlbSeasonStateDoc | null {
  try { return JSON.parse(fs.readFileSync(path.join(root, "mlb", "season-state.json"), "utf8")) as MlbSeasonStateDoc; }
  catch { return null; }
}

/**
 * The ladder a page may show as MLB's current card set. Once StatsAPI says the season is over (OFF_SEASON, derived
 * from no game remaining), a ladder dated on or before that capture is not shown (on the day itself it can only be an empty no-slate ladder) — the tiers carry the
 * season reason instead. UNKNOWN / missing evidence changes nothing (fail closed to the existing behaviour).
 */
export function inSeasonLadder(ladder: RiskLadder | null, season: MlbSeasonStateDoc | null): { ladder: RiskLadder | null; offSeasonReason: string | null } {
  return isOffSeasonFor(ladder?.date ?? null, season)
    ? { ladder: null, offSeasonReason: `The MLB season is over — ${season!.reason}. Cards return when games do.` }
    : { ladder, offSeasonReason: null };
}
export function isOffSeasonFor(cardDate: string | null, season: MlbSeasonStateDoc | null): boolean {
  return season?.state === "OFF_SEASON" && typeof season.date === "string" && (cardDate == null || cardDate <= season.date);
}

/** The ladder for `date`, or null when none was published for it. */
/**
 * Whether the risk-ladder producer ran for `date` (its artifact exists for that date, with or without cards).
 * A yes/no about the PRODUCER, not a card source: pages that must not compose a second seed map (/build/custom)
 * use this to tell "no qualifying card" from "data pending" (TRUTH-001) without loading ladder cards themselves.
 */
export function riskLadderProducerRan(root: string, date: string): boolean {
  return loadRiskLadder(root, date) != null;
}

export function loadRiskLadder(root: string, date: string): RiskLadder | null {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(root, "parlays", "risk-ladder", `${date}.json`), "utf8")) as RiskLadder;
    return doc?.date === date ? doc : null;
  } catch {
    return null;
  }
}

/**
 * The lifetime record on its own, for surfaces that report the stream without carding today —
 * /results reads this even on a day with no slate.
 */
export function loadRiskLadderRecord(root: string): RiskLadder["record"] | null {
  try {
    return (JSON.parse(fs.readFileSync(path.join(root, "parlays", "risk-ladder", "latest.json"), "utf8")) as RiskLadder).record ?? null;
  } catch {
    return null;
  }
}

/**
 * The precomputed 4x4 tier grid for one sport.
 *
 * Returns null for any sport whose stream is closed as well as for a missing file — a page that
 * cannot show a grid behaves the same either way, and the REASON a stream is closed belongs on the
 * artifact for a surface that reports coverage, not in the render path.
 */
export interface TierGridDoc {
  readonly state: string;
  readonly tiers: readonly {
    readonly id: string;
    readonly cardsPerDay: number;
    readonly bands: readonly string[];
    readonly offered: number;
    readonly emptyToday: boolean;
    readonly substitute: { readonly band: string; readonly slipId: string | null; readonly reason: string } | null;
  }[];
  readonly cells: readonly { readonly tier: string; readonly band: string; readonly state: string; readonly slipId: string | null; readonly reason: string | null }[];
}

export function loadTierGrid(root: string, sport: string): TierGridDoc | null {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(root, "parlays", "tier-grid", `${sport}-latest.json`), "utf8")) as TierGridDoc;
    return doc?.state === "PUBLISHED" ? doc : null;
  } catch {
    return null;
  }
}
