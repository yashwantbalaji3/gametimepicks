/**
 * NFL QB PROPS · THE FIVE MARKETS, THEIR STATUS, AND THE PER-SLATE DASHBOARD (founder decision 2026-11-10, no fixed INT
 * gate). PURE: no fs, no clock.
 *
 *   STATUS     three distinct states, never merged: IMPLEMENTED_EXPERIMENTAL → FORWARD_EVALUATION → VALIDATED_OFFICIAL.
 *              Only VALIDATED_OFFICIAL may feed official picks (mayFeedOfficialPicks). A market moves only through the
 *              gates in the pre-registration (FORWARD_EVALUATION: the founder approves the pre-registration hash;
 *              VALIDATED_OFFICIAL: the family's decision is MET on confirmatory rows AND the founder approves the
 *              promotion). The statuses live in QB_MARKET_STATUS, a frozen code constant — no data file or job sets it,
 *              so there is no silent production change.
 *   MARKETS    passing TDs, passing yards, completions, attempts, interceptions — all from ONE simulation (the receipt of
 *              record): the run distribution, exact chances from the run counts, and the QB's actual previous games as
 *              HISTORY (labelled history, never a forecast, never an input to the chances shown).
 *   CHALLENGER a versioned challenger slot (QB_CHALLENGERS): graded beside the incumbent on the same rows, reported on the
 *              dashboard, and never able to change a market's status by itself.
 */

export const MARKET_STATUS = Object.freeze({
  IMPLEMENTED_EXPERIMENTAL: "IMPLEMENTED_EXPERIMENTAL",
  FORWARD_EVALUATION: "FORWARD_EVALUATION",
  VALIDATED_OFFICIAL: "VALIDATED_OFFICIAL",
});
/**
 * The status of each market, changed only by a reviewed commit after its gate. FORWARD_EVALUATION since the founder
 * approved pre-registration v1.3 (2026-11-10T18:55:07Z). VALIDATED_OFFICIAL needs a MET decision AND a founder promotion.
 */
export const QB_MARKET_STATUS = Object.freeze({
  passTd: MARKET_STATUS.FORWARD_EVALUATION,
  passYds: MARKET_STATUS.FORWARD_EVALUATION,
  passCmp: MARKET_STATUS.FORWARD_EVALUATION,
  passAtt: MARKET_STATUS.FORWARD_EVALUATION,
  passInt: MARKET_STATUS.FORWARD_EVALUATION,
});
export const mayFeedOfficialPicks = (status) => status === MARKET_STATUS.VALIDATED_OFFICIAL;
/**
 * R5 (eligibility contract v1), the one rule for the research section AND the grader: a QB line only where the game's
 * official forecast knows its starting-QB situation. QB-blind, UNKNOWN, or no team-input record ⇒ no line.
 */
export const r5Allows = (teamInputs) => Boolean(teamInputs?.state) && teamInputs.state !== "BLIND_TO_STARTING_QB_ABSENCE" && teamInputs.state !== "UNKNOWN";
/** Versioned challengers: { challengerId, version, receiptDir, registeredAt }. Empty: no challenger is registered. */
export const QB_CHALLENGERS = Object.freeze([]);
export const QB_DASHBOARD_SCHEMA = "gtp.nfl.qb-props-dashboard@1";
export const HISTORY_GAMES = 8;

/** The five markets. `atLeast`: the "k or more" chances shown; yards use the pre-registered lines (199.5 ⇒ 200+). */
export const QB_MARKETS = Object.freeze([
  { market: "passTd", stat: "passTd", label: "Passing TDs", atLeast: [1, 2, 3] },
  { market: "passYds", stat: "passYds", label: "Passing yards", atLeast: [200, 225, 250] },
  { market: "passCmp", stat: "cmp", label: "Completions", atLeast: [] },
  { market: "passAtt", stat: "passAtt", label: "Attempts", atLeast: [] },
  { market: "passInt", stat: "int", label: "Interceptions", atLeast: [1, 2] },
]);

function fromCounts(counts) {
  const vs = Object.entries(counts).map(([v, c]) => [Number(v), c]).sort((a, b) => a[0] - b[0]);
  const n = vs.reduce((a, [, c]) => a + c, 0);
  const q = (p) => { let s = 0; for (const [v, c] of vs) { s += c; if (s / n >= p - 1e-12) return v; } return vs[vs.length - 1][0]; };
  return { n, p10: q(0.1), p50: q(0.5), p90: q(0.9), atLeast: (k) => vs.reduce((a, [v, c]) => a + (v >= k ? c : 0), 0) / n };
}

/**
 * One QB's five markets from one receipt row. Chances come only from the exact run counts (@2.2) or, for the counts,
 * the count PMF (@2.1); without either a market shows its run quantiles and no chance (never approximated).
 */
export function qbMarketViews(row) {
  return QB_MARKETS.map((m) => {
    const exact = row.exactCounts?.[m.stat];
    const pmf = row.countPmf?.[m.stat];
    const q = row.stats?.[m.stat] ?? null;
    let distribution = q ? { p10: q.p10, p50: q.p50, p90: q.p90, source: "receipt quantiles" } : null;
    let chances = null;
    if (exact) {
      const d = fromCounts(exact);
      distribution = { p10: d.p10, p50: d.p50, p90: d.p90, source: "exact run counts" };
      chances = m.atLeast.map((k) => ({ atLeast: k, p: d.atLeast(k) }));
    } else if (pmf && m.atLeast.every((k) => k < pmf.length)) {
      chances = m.atLeast.map((k) => ({ atLeast: k, p: pmf.slice(k).reduce((a, b) => a + b, 0) }));
    }
    return { market: m.market, label: m.label, status: QB_MARKET_STATUS[m.market], distribution, chances };
  });
}

const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };

/** HISTORY: the QB's actual results in his previous games played (passAtt ≥ 1) before `kickoff`, most recent first. */
export function qbHistory(games, playerId, kickoff, n = HISTORY_GAMES) {
  const k = ms(kickoff);
  const out = [];
  for (const g of games.filter((x) => ms(x.dateUtc) != null && ms(x.dateUtc) < k).sort((a, b) => ms(b.dateUtc) - ms(a.dateUtc))) {
    const p = g.players?.find((x) => x.playerId === playerId && (x.passAtt ?? 0) >= 1);
    if (!p) continue;
    const opp = g.home?.abbr === p.teamAbbr ? g.away?.abbr : g.home?.abbr;
    out.push({ season: g.season, week: g.week, date: String(g.dateUtc).slice(0, 10), opponent: opp ?? null, passCmp: p.passCmp, passAtt: p.passAtt, passYds: p.passYds, passTd: p.passTd, passInt: p.passInt });
    if (out.length === n) break;
  }
  return out;
}

/**
 * The per-slate dashboard (written after every slate by the grader job). While grading is LOCKED it carries status,
 * forward counts and the challenger slot only — no outcome, no metric.
 */
export function buildDashboard({ counts, ledger = null, gradingLocked, incumbent }) {
  return {
    schema: QB_DASHBOARD_SCHEMA,
    grading: gradingLocked ? "LOCKED — real outcomes are not graded until the founder approves the final pre-registration hash" : "APPROVED",
    incumbent,
    challengers: QB_CHALLENGERS.map((c) => ({ ...c, effectOnStatus: "none — reported beside the incumbent; promotion only through the gates" })),
    markets: Object.fromEntries(QB_MARKETS.map((m) => [m.market, {
      label: m.label,
      status: QB_MARKET_STATUS[m.market],
      mayFeedOfficialPicks: mayFeedOfficialPicks(QB_MARKET_STATUS[m.market]),
      forwardRows: counts.total[m.market],
      withModelDistribution: counts.withModelDistribution[m.market],
      byKickoffDate: Object.fromEntries(Object.entries(counts.byKickoffDate).map(([d, c]) => [d, c[m.market]])),
      ...(ledger && !gradingLocked ? { confirmatory: ledger.confirmatory[m.market] } : {}),
    }])),
  };
}
