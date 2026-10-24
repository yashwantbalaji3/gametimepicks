/**
 * LEVEL A · NBA GAME-WINNER TIERS — THE ADAPTER (§9 step 2). Node-only, read-only. Turns the NBA display's ONE accessor
 * (sports/nba/elo-win-probability.mjs eloWinProbabilityOf, owned by the NBA model session) into the DisplayProbability
 * shape nba-game-winner-tiers.mjs reads, for the lane day's games:
 *   pHome          view.home — the receipt's exact forecast.elo.pHome as stored (never re-derived from a % string)
 *   shown          `${view.homePct}%` / `${view.awayPct}%` — the display's own whole-percent text, verbatim
 *   label          view.label (ELO_WIN_PROBABILITY_LABEL)
 *   frozenAt, payloadSha256, source   view.provenance
 * plus `receiptOf(eventId)`: the side's own receipt, from the SAME lane game, for the §1.4 cross-check, and the
 * display's accuracy disclosure (shown once per block).
 * The display's own switch is honoured by passing its context's `enabled` (never a literal true): display OFF → the
 * accessor returns null for every game → no tier, with nothing else changed.
 */
import fs from "node:fs";
import path from "node:path";
import { eloWinProbabilityOf } from "../../sports/nba/elo-win-probability.mjs";
import { loadEloWinProbabilityContext } from "../../sports/nba/elo-win-probability-context.mjs";

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

/** @returns {{ enabled: boolean, accessor: (eventId: string) => object | null, receiptOf: (eventId: string) => object | null, disclosure: string | null }} */
export function nbaGameWinnerDisplay({ repoRoot, date, ctx = null, lane = undefined }) {
  const doc = lane !== undefined ? lane : readJson(path.join(repoRoot, "app", "public", "data", "nba", "experimental-public", `${date}.json`));
  const c = ctx ?? loadEloWinProbabilityContext({ appDir: path.join(repoRoot, "app") });
  const byId = new Map((doc && doc.date === date ? doc.games ?? [] : []).map((g) => [String(g.providerEventId), g]));
  const accessor = (eventId) => {
    const g = byId.get(String(eventId));
    const v = g ? eloWinProbabilityOf(g, { enabled: c.enabled }) : null;
    if (!v) return null;
    return { eventId: v.eventId, pHome: v.home, shown: { home: `${v.homePct}%`, away: `${v.awayPct}%` }, decimals: 0, frozenAt: v.provenance.frozenAt, payloadSha256: v.provenance.receiptPayloadSha256, label: v.label, source: v.provenance.source };
  };
  const receiptOf = (eventId) => byId.get(String(eventId))?.receipt ?? null;
  return { enabled: c.enabled === true, accessor, receiptOf, disclosure: c.enabled ? c.disclosure ?? null : null };
}
