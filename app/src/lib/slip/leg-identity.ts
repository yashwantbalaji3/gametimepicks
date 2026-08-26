/**
 * THE ONE LEG-IDENTITY RULE for the reader's draft (P208 · Release A).
 *
 * Before this module, the slip key was `sport|matchup|player|market|side|line` and the surfaces
 * disagreed on `matchup` for the same selection — the risk ladder passed the opponent abbreviation
 * where the props board passed the full matchup label. Same pick, two identities, duplicate slip
 * entries. Identity must never depend on a display string two surfaces compose differently, so the
 * canonical key is the fields every surface actually agrees on, normalised:
 *
 *     sport | player | marketLabel | side | line
 *
 * `matchup` stays ON the leg for display; it is no longer part of who the leg IS. The one identity
 * this cannot distinguish is the same player/market/side/line across both games of a doubleheader —
 * which no slip surface visually distinguishes either, so merging is the honest reading of what the
 * reader selected. Engine/settlement artifacts keep their own richer legId; this rule is for the
 * reader's browser-local draft only and never enters any ledger.
 *
 * Pure module (no react, no fs) so servers, clients and tests share the exact same rule.
 */

/** The fields that make a draft leg what it is. */
export interface SlipLegIdentity {
  readonly sport: string;
  readonly player: string;
  readonly marketLabel: string;
  readonly side: string;
  readonly line: number | null;
}

/** A full draft leg as surfaces submit it — identity plus display/pricing fields. */
export interface SlipLegInput extends SlipLegIdentity {
  readonly americanOdds: number;
  readonly matchup?: string | null;
  readonly photoUrl?: string | null;
  readonly teamAbbr?: string | null;
  readonly opponentAbbr?: string | null;
}

const norm = (v: unknown): string => String(v ?? "").trim().toLowerCase();

/** Canonical draft-leg key. Case- and whitespace-insensitive; `line` null ⇒ empty segment. */
export const legKey = (l: SlipLegIdentity): string =>
  [norm(l.sport), norm(l.player), norm(l.marketLabel), norm(l.side), l.line == null ? "" : String(l.line)].join("|");

/**
 * Migrate a stored slip to the canonical rule: recompute every key from the leg's own fields and
 * drop duplicates (first occurrence wins — the reader's earlier add). Stakes follow their leg to
 * its new key; stakes for dropped duplicates are discarded with the duplicate.
 */
export function migrateSlipLegs<T extends SlipLegInput & { key: string }>(
  legs: readonly T[],
  stakes: Readonly<Record<string, number>>,
): { legs: T[]; stakes: Record<string, number> } {
  const out: T[] = [];
  const outStakes: Record<string, number> = {};
  const seen = new Set<string>();
  for (const l of legs) {
    const k = legKey(l);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l.key === k ? l : { ...l, key: k });
    const stake = stakes[l.key] ?? stakes[k];
    if (typeof stake === "number") outStakes[k] = stake;
  }
  return { legs: out, stakes: outStakes };
}
