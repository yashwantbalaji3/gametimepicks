/**
 * SPRINT 052 — canonical outcome accounting for /results.
 *
 * THE PROBLEM THIS SOLVES
 * The settled ledger is authoritative for what was GRADED, and it is silent about everything else.
 * Rows that were generated but never gradable — a batter who never took a plate appearance — are not
 * written to it at all (Sprint 046). A page that starts from the ledger therefore reports a smaller
 * population than actually existed, and the missing rows read as if they never happened.
 *
 * So accounting starts from the GENERATED population — the board — and every row must land in exactly
 * one bucket:
 *
 *     generated = wins + losses + voids + pending + unavailable + passes + gap
 *
 * `gap` must be zero for a clean completed date. A non-zero gap is a defect to report, never a
 * rounding difference to absorb.
 *
 * WHAT IT REFUSES TO DO
 *   · treat a missing row as a loss;
 *   · report a hit rate for a quarantined slate;
 *   · silently stamp legacy rows with lineage they never had;
 *   · fold the paper-money record into model-universe numbers.
 *
 * Data-only: pure functions over already-loaded artifacts, so the whole thing is testable without I/O.
 */

/** Terminal and non-terminal states a generated row can occupy. */
export type OutcomeState =
  | "WIN"
  | "LOSS"
  | "VOID"
  | "PENDING"
  | "UNAVAILABLE"
  | "PASS"
  | "QUARANTINED";

/**
 * How much we can say about a row's identity chain.
 *
 * Legacy rows predate the lineage fields and must be labelled as such rather than presented as
 * verified — retro-stamping them would manufacture evidence that never existed.
 */
export type LineageState = "VERIFIED_LINEAGE" | "LEGACY_LINEAGE" | "QUARANTINED" | "UNKNOWN_WITH_REASON";

export interface GeneratedRow {
  readonly id: string;
  readonly marketKey: string;
  /** "Over" / "Under", or a non-directional marker like "Pass". */
  readonly lean: string | null;
}

export interface SettledRow {
  readonly id: string;
  readonly outcome: string;
  readonly eventId?: string | null;
  readonly settlementSource?: string | null;
}

export interface DateAccounting {
  readonly date: string;
  readonly integrity: "CLEAN" | "PARTIAL" | "QUARANTINED" | "UNAVAILABLE";
  readonly generated: number;
  readonly wins: number;
  readonly losses: number;
  readonly voids: number;
  readonly pending: number;
  readonly unavailable: number;
  readonly passes: number;
  readonly decisive: number;
  readonly terminal: number;
  readonly accounted: number;
  readonly gap: number;
  /** Null whenever a rate would be misleading — quarantined, or no decisive rows. */
  readonly decisiveHitRate: number | null;
  readonly terminalCoverage: number | null;
  readonly settlementCompletion: number | null;
  readonly lineage: LineageState;
  readonly notes: readonly string[];
}

/** Markets the settlement pipeline grades. A row outside this set was never gradable. */
export const GRADABLE_MARKETS: readonly string[] = [
  "pitcher_strikeouts",
  "batter_hits",
  "batter_total_bases",
  "batter_hits_runs_rbis",
];

const NON_DIRECTIONAL = new Set(["", "Pass", "No Play"]);

const isPass = (r: GeneratedRow): boolean => NON_DIRECTIONAL.has(r.lean ?? "");

/** A rate is only returned when its denominator is real. Never 0/0 rendered as 0%. */
const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export interface ReconcileInput {
  readonly date: string;
  /** Every row the board generated for this slate. The authoritative population. */
  readonly generated: readonly GeneratedRow[];
  /** Ledger rows for this date, keyed by id. Silent about ungradable rows by design. */
  readonly settled: ReadonlyMap<string, SettledRow>;
  /**
   * Ids the comparison report classified as unavailable — rows that were generated and gradable but
   * produced no stat. Supplied separately BECAUSE the ledger never writes them.
   */
  readonly unavailableIds?: ReadonlySet<string>;
  /** True when the settlement gate refused this slate. */
  readonly quarantined?: boolean;
  /** True when the slate's events have all finished. A pending row on a live slate is not a defect. */
  readonly slateComplete?: boolean;
}

/**
 * Reconcile one slate.
 *
 * A quarantined date short-circuits: it reports its generated population and nothing else, because
 * every outcome-shaped number for it would be a fabrication.
 */
export function reconcile(input: ReconcileInput): DateAccounting {
  const { date, generated, settled } = input;
  const unavailableIds = input.unavailableIds ?? new Set<string>();
  const notes: string[] = [];

  if (input.quarantined) {
    return {
      date,
      integrity: "QUARANTINED",
      generated: generated.length,
      wins: 0, losses: 0, voids: 0, pending: 0, unavailable: 0, passes: 0,
      decisive: 0, terminal: 0, accounted: 0, gap: 0,
      // Explicitly null, not zero. Zero is a measurement; this is an absence of one.
      decisiveHitRate: null, terminalCoverage: null, settlementCompletion: null,
      lineage: "QUARANTINED",
      notes: [
        "Settlement was withheld because the event mapping failed an integrity check before any write.",
        "No outcomes were published for this slate, so no hit rate exists for it.",
      ],
    };
  }

  let wins = 0, losses = 0, voids = 0, pending = 0, unavailable = 0, passes = 0;

  for (const row of generated) {
    if (!GRADABLE_MARKETS.includes(row.marketKey)) { passes += 1; continue; }
    if (isPass(row)) { passes += 1; continue; }

    const s = settled.get(row.id);
    if (!s) {
      // Not in the ledger. Either the comparison report classified it unavailable, or the event has
      // not resolved. Never a loss — a missing row is missing, not lost.
      if (unavailableIds.has(row.id)) unavailable += 1;
      else pending += 1;
      continue;
    }
    const o = String(s.outcome).toUpperCase();
    if (o === "WIN") wins += 1;
    else if (o === "LOSS") losses += 1;
    else if (o === "VOID" || o === "PUSH") voids += 1;
    else pending += 1;
  }

  const decisive = wins + losses;
  const terminal = decisive + voids;
  const accounted = terminal + pending + unavailable + passes;
  const gap = generated.length - accounted;

  if (gap !== 0) {
    notes.push(`${gap} generated row(s) could not be placed in any bucket — this is a defect, not a rounding difference.`);
  }
  if (unavailable > 0) {
    notes.push(`${unavailable} row(s) were generated and gradable but produced no stat. They are recovered from the comparison report because the ledger does not record them.`);
  }
  if (pending > 0 && input.slateComplete) {
    notes.push(`${pending} row(s) remain unresolved on a completed slate.`);
  }

  const integrity: DateAccounting["integrity"] =
    gap !== 0 ? "PARTIAL"
      : pending > 0 && input.slateComplete ? "PARTIAL"
        : "CLEAN";

  // Lineage: verified only when every settled row carries it. Anything less is legacy, stated plainly.
  const settledRows = [...settled.values()];
  const withLineage = settledRows.filter((r) => r.eventId).length;
  const lineage: LineageState =
    settledRows.length === 0 ? "UNKNOWN_WITH_REASON"
      : withLineage === settledRows.length ? "VERIFIED_LINEAGE"
        : "LEGACY_LINEAGE";
  if (lineage === "LEGACY_LINEAGE") {
    notes.push(`${settledRows.length - withLineage} settled row(s) predate canonical event lineage and are labelled legacy rather than retro-stamped.`);
  }

  return {
    date, integrity,
    generated: generated.length,
    wins, losses, voids, pending, unavailable, passes,
    decisive, terminal, accounted, gap,
    decisiveHitRate: rate(wins, decisive),
    terminalCoverage: rate(terminal, generated.length),
    settlementCompletion: rate(terminal, terminal + pending + unavailable),
    lineage, notes,
  };
}

/** Human labels for the outcome states, so every surface uses the same words. */
export const OUTCOME_LABEL: Readonly<Record<OutcomeState, string>> = {
  WIN: "Win",
  LOSS: "Loss",
  VOID: "Void",
  PENDING: "Pending",
  UNAVAILABLE: "Unavailable",
  PASS: "No play",
  QUARANTINED: "Withheld",
};

/** What each state means, in words a first-time reader can use. */
export const OUTCOME_MEANING: Readonly<Record<OutcomeState, string>> = {
  WIN: "The official box score resolved above or below the line, on the side we took.",
  LOSS: "The official box score resolved against the side we took.",
  VOID: "The result landed exactly on the line, or the player never came to bat. Not a loss.",
  PENDING: "The event has not produced a gradable result yet. Not a loss.",
  UNAVAILABLE: "The game finished but this row never produced a gradable stat. Not a loss.",
  PASS: "We generated no directional call here, so there is nothing to grade.",
  QUARANTINED: "Settlement was withheld because the data failed an integrity check. No outcome was published.",
};
