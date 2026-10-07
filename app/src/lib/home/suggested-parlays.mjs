/**
 * Homepage suggested-parlays preview — a RENDERING of the risk-coverage matrix, never a second
 * evaluation (Program 200 · Release B).
 *
 * The coverage matrix (public/data/parlays/coverage-matrix.json, schemaVersion 2, owner
 * scripts/parlays/build-risk-coverage.mjs) is the day's evaluation of record: five lanes × four
 * risk tiers, every cell typed. This module reshapes that artifact for the homepage strip and adds
 * NOTHING — no re-ranking, no re-eligibility, no invented cards. Four risk levels are four daily
 * evaluations, not four forced bets, so a NO_PLAY cell is a first-class rendering, not a gap.
 *
 * Fail-closed: a missing or pre-v2 artifact returns null and the homepage section renders nothing,
 * rather than showing a stale or relic grid as today's product.
 */
import fs from "node:fs";
import path from "node:path";

import { RISK_ORDER } from "../prefs/bettor-tiers.mjs";
import { PUBLIC_RISK_LABELS } from "../parlays/risk-odds-bands.mjs";

export const LANE_LABEL = {
  mlb: "MLB",
  epl: "Premier League",
  ufc: "UFC",
  nfl: "NFL",
  multi: "Mixed-sport",
};

/** Public tier language (Program 200 A3) — surfaced as chip titles, kept in one place. */
export const TIER_INTENT = {
  low: `${PUBLIC_RISK_LABELS.low} — strongest qualified combination`,
  medium: `${PUBLIC_RISK_LABELS.medium} — balanced card`,
  high: `${PUBLIC_RISK_LABELS.high} — higher variance`,
  longshot: `${PUBLIC_RISK_LABELS.longshot} — high variance, low hit rate`,
}; // D2: the label is the one public taxonomy's

export function loadSuggestedParlaysPreview(dataRoot) {
  let matrix;
  try {
    matrix = JSON.parse(fs.readFileSync(path.join(dataRoot, "parlays", "coverage-matrix.json"), "utf8"));
  } catch {
    return null;
  }
  if (matrix?.schemaVersion !== 2 || !Array.isArray(matrix.rows)) return null;

  // One honest line per closed lane. The gate's own reason, clipped for a strip — the full
  // sentence stays in the artifact and on the Lab record page.
  const clip = (s) => (s.length > 110 ? `${s.slice(0, 110).trimEnd()}…` : s);
  /*
   * The coverage producer writes a refused lane evaluation as "lane evaluation of record refused
   * (CAPABILITY_GATED) at <ISO time>; …" — an internal state name and a raw timestamp, which reached
   * the homepage and /today verbatim. Say the same thing in the reader's words; the artifact keeps
   * its own sentence. Any other reason passes through unchanged.
   */
  const publicReason = (s) => {
    const m = /^lane evaluation of record refused \(([A-Z_]+)\)(?: at (\d{4})-(\d{2})-(\d{2})T[^;]*)?/.exec(s);
    if (!m) return s;
    const why = m[1] === "CAPABILITY_GATED"
      ? "not cleared for model-built cards yet"
      : "today's card evaluation did not complete";
    const when = m[2]
      ? ` (checked ${new Date(Date.UTC(+m[2], +m[3] - 1, +m[4])).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })})`
      : "";
    return `${why}${when}; the next scheduled run checks again`;
  };

  const live = [];
  const closed = [];
  for (const row of matrix.rows) {
    const label = LANE_LABEL[row.lane] ?? row.lane;
    if (row.laneState === "CLOSED") {
      closed.push({ lane: row.lane, label, reason: clip(publicReason(row.laneReason ?? "closed by the eligibility gate")) });
      continue;
    }
    /*
     * A lane can be nominally LIVE while its evaluation of record REFUSED every tier (the lane
     * artifact carried state !== PUBLISHED at its own build time; LANE_CLOSED cells). Rendering
     * those chips as "no play" would claim an evaluation ran and nothing qualified — a different
     * and stronger claim than the truth. Fold the whole lane into the closed line instead, with
     * the cell's own reason.
     */
    const cells = RISK_ORDER.map((tier) => row.tiers?.[tier] ?? { state: "MISSING" });
    if (cells.every((c) => c.state === "LANE_CLOSED")) {
      closed.push({ lane: row.lane, label, reason: clip(publicReason(cells[0].reason ?? "the lane evaluation refused")) });
      continue;
    }
    const tiers = RISK_ORDER.map((tier) => {
      const cell = row.tiers?.[tier] ?? { state: "MISSING" };
      return {
        tier,
        state: cell.state,
        slipId: cell.state === "PUBLISHED" ? (cell.slipId ?? null) : null,
      };
    });
    live.push({
      lane: row.lane,
      label,
      date: row.date ?? null,
      tiers,
      publishedCount: tiers.filter((t) => t.state === "PUBLISHED").length,
    });
  }

  return {
    generatedAt: matrix.generatedAt ?? null,
    counts: matrix.counts ?? null,
    live,
    closed,
  };
}
