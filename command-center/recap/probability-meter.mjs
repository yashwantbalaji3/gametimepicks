/**
 * MATCHUP METER (V2.3) — which game-winner numbers a social graphic may show, from which published field, with which
 * label and rounding. One rule per sport; anything not eligible returns null and the graphic shows the winner only.
 * Nothing here computes, infers or reverse-engineers a probability: every number is copied from the published forecast
 * the website itself reads, and refused when its own checks fail.
 *
 *   NBA  the website's ONE accessor, eloWinProbabilityOf (app/src/lib/sports/nba/elo-win-probability.mjs), loaded from
 *        the SAME data commit the package reads, over the published lane game. Eligible only when it returns a view (the
 *        switch is on at that commit, the field's provenance is this game's own freeze and receipt, the numbers agree
 *        with the published side). Label and rounding are the site's: "Elo-derived game-winner estimate" — never called
 *        a probability (founder wording, Release G 2026-10-23) — whole percents, decimals only to break a tie, "<1"/">99".
 *        Two outcomes, complements by construction.
 *   NFL  the frozen receipt's forecastSummary.winProbability {home, away, tieMass} (the version the freeze-time verifier
 *        checked). Three outcomes: home / tie / away. Must sum to 1 (±0.002) and agree with the published side. Shown to
 *        one decimal, as the site formats them; the tie keeps its own segment (never folded into either team).
 *   EPL  the published forecast row's probs {home, draw, away}. Three outcomes, must sum to 1 (±0.002). One decimal.
 *   MLB / UFC  no eligible published game-winner probability feeds the social graphics: winner-only (or no graphic).
 *
 * Segment widths are the published shares themselves (normalised for drawing only); labels are the published values
 * rounded by the stated rule, so a bar never disagrees with its numbers by more than the rounding.
 */
import crypto from "node:crypto";

/** The one heading every meter shows (founder 2026-10-28, V2.3.1); each source's own classification stays in provenance. */
export const METER_HEADING = "Game winner estimate";
export const METER_RULES = Object.freeze({
  NBA: { source: "app/public/data/nba/experimental-public/<date>.json · game.elo.winProbability via the site accessor eloWinProbabilityOf", outcomes: 2, label: "Elo-derived game-winner estimate", rounding: "site rule: whole %, decimals only to break a tie, <1 / >99", note: "Not an independently validated probability · accuracy not yet established" },
  NFL: { source: "frozen receipt forecastSummary.winProbability {home, away, tieMass} (the verified version)", outcomes: 3, label: "Win probability", rounding: "one decimal, (p × 100).toFixed(1), as on the site", note: null },
  EPL: { source: "app/public/data/soccer/epl/forecasts/<date>.json · row.probs {home, draw, away}", outcomes: 3, label: "Win probability", rounding: "one decimal", note: null },
  MLB: { source: null, outcomes: null, label: null, rounding: null, note: "no eligible published game-winner probability for social graphics: winner only" },
  UFC: { source: null, outcomes: null, label: null, rounding: null, note: "no independent UFC model: no prediction graphic" },
});

const NBA_ACCESSOR = "app/src/lib/sports/nba/elo-win-probability.mjs";
const accessorCache = new Map();
/** The website's NBA accessor module AS OF the data commit (the source is pure, with no imports). */
export async function siteNbaAccessor(src) {
  const code = src.read(NBA_ACCESSOR);
  if (code == null) return null;
  const key = crypto.createHash("sha256").update(code).digest("hex");
  if (!accessorCache.has(key)) accessorCache.set(key, import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`));
  return accessorCache.get(key);
}

const isP = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
/** A team's bar colour: its primary colour, or its accent when the primary is too dark to read on the dark stage. */
const lum = (hex) => { const h = String(hex ?? "").replace("#", ""); if (h.length !== 6) return 0; const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const barColor = (t) => (lum(t.color) >= 0.045 ? t.color : t.accent ?? t.color);
const one = (p) => `${(p * 100).toFixed(1)}%`;

/** NBA: the site accessor's view, or null (winner-only). `game` is the published lane game. */
export async function nbaMeter({ src, game, away, home }) {
  const acc = await siteNbaAccessor(src);
  const view = acc?.eloWinProbabilityOf?.(game) ?? null;
  if (!view) return null;
  return {
    kind: "two", sport: "NBA", label: METER_HEADING, footnote: "Model estimate · Historical accuracy not yet established",
    segments: [
      { side: "away", name: away.name, color: barColor(away), ink: away.ink, share: view.away, display: `${view.awayPct}%` },
      { side: "home", name: home.name, color: barColor(home), ink: home.ink, share: view.home, display: `${view.homePct}%` },
    ],
    provenance: { ...view.provenance, sourceLabel: acc.ELO_WIN_PROBABILITY_LABEL ?? METER_RULES.NBA.label, qualification: METER_RULES.NBA.note, accessor: NBA_ACCESSOR, accessorId: acc.ELO_WIN_PROBABILITY?.id ?? null, text: acc.eloWinProbabilityText?.(view) ?? null },
  };
}

/** NFL: home / tie / away from the frozen, verified receipt; null if the numbers don't hold together. */
export function nflMeter({ winProbability: wp, favoured, away, home }) {
  if (!wp || !isP(wp.home) || !isP(wp.away) || !isP(wp.tieMass ?? 0)) return null;
  const tie = wp.tieMass ?? 0;
  if (Math.abs(wp.home + wp.away + tie - 1) > 0.002) return null;
  if ((favoured === "home" && !(wp.home > wp.away)) || (favoured === "away" && !(wp.away > wp.home))) return null;
  return {
    kind: tie > 0 ? "three" : "two", sport: "NFL", label: METER_HEADING, footnote: "Model estimate",
    segments: [
      { side: "away", name: away.name, color: barColor(away), ink: away.ink, share: wp.away, display: one(wp.away) },
      ...(tie > 0 ? [{ side: "tie", name: "Tie", color: "#9AA19A", ink: "#050706", share: tie, display: one(tie) }] : []),
      { side: "home", name: home.name, color: barColor(home), ink: home.ink, share: wp.home, display: one(wp.home) },
    ],
    provenance: { sourceLabel: METER_RULES.NFL.label, field: "forecastSummary.winProbability", values: { home: wp.home, away: wp.away, tieMass: tie } },
  };
}

/** Soccer (EPL): home / draw / away, never forced to two outcomes. */
export function soccerMeter({ probs, away, home, label = METER_HEADING }) {
  if (!probs || !isP(probs.home) || !isP(probs.draw) || !isP(probs.away)) return null;
  if (Math.abs(probs.home + probs.draw + probs.away - 1) > 0.002) return null;
  return {
    kind: "three", sport: "EPL", label, footnote: "Model estimate",
    segments: [
      { side: "home", name: home.name, color: barColor(home), ink: home.ink, share: probs.home, display: one(probs.home) },
      { side: "draw", name: "Draw", color: "#9AA19A", ink: "#050706", share: probs.draw, display: one(probs.draw) },
      { side: "away", name: away.name, color: barColor(away), ink: away.ink, share: probs.away, display: one(probs.away) },
    ],
    provenance: { sourceLabel: METER_RULES.EPL.label, field: "row.probs", values: probs },
  };
}

/** The winner wording from the published distribution (> 50% → Predicted Winner; most likely but ≤ 50% → Most Likely Winner). */
export function winnerLabelFromShares(meter, side) {
  if (!meter) return "Predicted Winner";
  const seg = meter.segments.find((s) => s.side === side);
  const top = Math.max(...meter.segments.map((s) => s.share));
  if (!seg || seg.share < top) return null;
  return seg.share > 0.5 ? "Predicted Winner" : "Most Likely Winner";
}
