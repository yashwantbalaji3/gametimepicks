/**
 * alternate-lines — pure, deterministic helpers for (future) alternate-line
 * ladders. NO network, NO paid calls, NO public data writes, NO optimizer
 * wiring. These exist so that when alternate-market data is approved + fetched
 * shadow-only, there is tested plumbing to de-vig, validate, and group it. None
 * of this is imported by the optimizer, projections, Suggested Parlays, or UI.
 *
 * Alternate lines are NOT live. No "safe"/"guaranteed"/"better hit rate" copy.
 * The honest framing for a lower line is "higher de-vigged probability / lower
 * payout" — a number, not a claim.
 */

export interface AlternateLineRecord {
  sport: string;
  date: string;
  gameId: string;
  playerId: number | string;
  playerName?: string;
  team?: string;
  opponent?: string;
  market: string;
  /** the standard/main line for this player+market */
  mainLine: number;
  /** the specific alternate line this record prices */
  alternateLine: number;
  /** side this record is keyed for ("Over" | "Under"); ladders carry both */
  side?: string;
  overOdds: number | null;
  underOdds: number | null;
  devigOver?: number | null;
  devigUnder?: number | null;
  provider?: string;
  asOf?: string;
}

/** American odds → implied probability (vig-inclusive). null if invalid. */
export function americanToImplied(odds: number | null | undefined): number | null {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/** Two-sided de-vig: devigSide = impliedSide / (impliedOver + impliedUnder).
 *  Returns null if either side is missing (cannot de-vig one-sided). */
export function deVigAlternateLine(
  overOdds: number | null | undefined,
  underOdds: number | null | undefined,
): { devigOver: number; devigUnder: number } | null {
  const io = americanToImplied(overOdds);
  const iu = americanToImplied(underOdds);
  if (io == null || iu == null) return null;
  const sum = io + iu;
  if (sum <= 0) return null;
  return { devigOver: io / sum, devigUnder: iu / sum };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate an alternate-line record has the fields needed to grade + de-vig. */
export function validateAlternateLineRecord(rec: Partial<AlternateLineRecord> | null | undefined): ValidationResult {
  const errors: string[] = [];
  if (!rec || typeof rec !== "object") return { valid: false, errors: ["record missing"] };
  if (!rec.sport) errors.push("sport missing");
  if (!rec.date) errors.push("date missing");
  if (!rec.gameId) errors.push("gameId missing");
  if (rec.playerId == null || rec.playerId === "") errors.push("playerId missing");
  if (!rec.market) errors.push("market missing");
  if (typeof rec.alternateLine !== "number" || !Number.isFinite(rec.alternateLine)) errors.push("alternateLine not numeric");
  const hasOver = typeof rec.overOdds === "number" && Number.isFinite(rec.overOdds);
  const hasUnder = typeof rec.underOdds === "number" && Number.isFinite(rec.underOdds);
  if (!hasOver && !hasUnder) errors.push("no odds (need at least one side; two-way required to de-vig)");
  return { valid: errors.length === 0, errors };
}

export type AltCompleteness = "complete" | "partial" | "missing";

/**
 * complete  = two-way odds present (de-viggable) + ids + numeric line.
 * partial   = one-sided odds or missing de-vig but otherwise identifiable.
 * missing   = no odds at all / unusable.
 */
export function classifyAlternateLineCompleteness(rec: Partial<AlternateLineRecord> | null | undefined): AltCompleteness {
  if (!rec) return "missing";
  const hasOver = typeof rec.overOdds === "number" && Number.isFinite(rec.overOdds);
  const hasUnder = typeof rec.underOdds === "number" && Number.isFinite(rec.underOdds);
  const identifiable =
    !!rec.gameId && rec.playerId != null && rec.playerId !== "" && !!rec.market &&
    typeof rec.alternateLine === "number" && Number.isFinite(rec.alternateLine);
  if (!hasOver && !hasUnder) return "missing";
  if (hasOver && hasUnder && identifiable) return "complete";
  return "partial";
}

/** Group alternate-line records into per-(playerId|market) ladders, each sorted
 *  ascending by alternateLine. Deterministic. */
export function groupAlternateLinesByPlayerMarket(
  records: AlternateLineRecord[],
): Record<string, AlternateLineRecord[]> {
  const out: Record<string, AlternateLineRecord[]> = {};
  for (const r of records ?? []) {
    if (!r || r.playerId == null || !r.market) continue;
    const key = `${r.playerId}|${r.market}`;
    (out[key] ||= []).push(r);
  }
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => a.alternateLine - b.alternateLine);
  }
  return out;
}
