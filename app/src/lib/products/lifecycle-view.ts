/**
 * What the two product pages say about settlement.
 *
 * Both pages showed a card frozen on 2026-08-17 with no outcome beside it, for nineteen days,
 * because nothing settled it. Now that the lifecycle ledger exists, the pages read the settled
 * record from it — the legs, the official numbers they were graded against, the resulting outcome,
 * and where the ladder stands afterwards.
 *
 * The ledger is the only source here. A page that recomputes an outcome can disagree with the
 * record; this one renders what was settled or says nothing was.
 */
import fs from "node:fs";
import path from "node:path";

export interface LifecycleLeg {
  player: string; market: string; side: string; line: number;
  actual: number | null; result: string; note?: string;
}
export interface LifecycleCard {
  product: string; lane: string; id: string; sourceCardId?: string | null; result: string;
  transition: string; applied: boolean; reason: string;
  nextCycle?: number; nextStep?: number; legs: LifecycleLeg[];
}
export interface LifecyclePosition { cycle: number; step: number; afterCard: string; result: string; transition: string }
export interface LifecycleLedger {
  generatedAt: string;
  settled: number;
  held: number;
  positions: Record<string, LifecyclePosition>;
  withheldWrite?: { target: string; via: string; reason: string };
  cards: LifecycleCard[];
}

const FILE = path.join(process.cwd(), "public", "data", "products", "lifecycle", "latest.json");

export function loadLifecycleLedger(): LifecycleLedger | null {
  try {
    const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(doc?.cards) ? doc : null;
  } catch { return null; }
}

/** The settled cards belonging to one product, newest ledger first. `applied` cards only — a held
 *  card has no outcome to show, and rendering its "reason" as a result would be a lie. */
export function settledCardsFor(ledger: LifecycleLedger | null, product: string): LifecycleCard[] {
  return (ledger?.cards ?? []).filter((c) => c.product === product && c.applied);
}

/** Where a lane stands after its last settled card. `key` is "bank-builder-lane-A" or "moonshot". */
export function positionFor(ledger: LifecycleLedger | null, key: string): LifecyclePosition | null {
  return ledger?.positions?.[key] ?? null;
}

/** Card ids the ledger has graded, for a deriver that must not count a settled card as open. The
 *  settler never rewrites the lane artifact — it feeds the protected bankroll — so without this the
 *  lane reports a graded card as pending for ever. */
export function settledCardIds(ledger: LifecycleLedger | null, product?: string): string[] {
  return (ledger?.cards ?? [])
    .filter((c) => c.applied && (!product || c.product === product))
    .map((c) => c.sourceCardId)
    .filter((id): id is string => Boolean(id));
}

/** Plain-English summary of one settled card, for a caption. Never says "safe", never promises. */
export function cardSummary(c: LifecycleCard): string {
  const decided = c.legs.filter((l) => l.result === "won" || l.result === "lost");
  const won = decided.filter((l) => l.result === "won").length;
  const outcome = c.result === "won" ? "won" : c.result === "lost" ? "lost" : c.result === "void" ? "was refunded" : "is unsettled";
  const move = c.transition === "advance" ? `moved to step ${c.nextStep}`
    : c.transition === "restart" ? `ended that run — the next one starts at step 1`
    : c.transition === "neutral" ? "left the ladder where it was" : "changed nothing yet";
  return `${won} of ${decided.length} legs landed, so the card ${outcome} and ${move}.`;
}
