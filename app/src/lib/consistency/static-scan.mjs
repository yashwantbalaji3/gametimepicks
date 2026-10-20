/**
 * CROSS-PRODUCT PREDICTION CONSISTENCY · STATIC SOURCE SCAN.
 *
 * The code-level divergences that let two products say different things about the same market: competing lean
 * rules, a hard-coded side, private σ definitions, push mass dropped, de-vig in one path and not another, joins by
 * player name, a board time used as a price time, Theater runs chosen by a shadow simulator's own percentiles.
 *
 * Each rule is an exact literal anchor in a named file (copied from the source, so a scan is a plain substring
 * search — no regex guessing). A finding reports file:line; its fingerprint is rule + file + anchor (never the line
 * number), so unrelated edits that move the line do not create a "new" discrepancy, while a new occurrence (count
 * grows) or a new rule hit does. When a fix removes the anchor, the finding disappears.
 *
 * Generic guards (`GUARDS`) scan whole directories for patterns that must never appear (product code reading
 * scenario / what-if / shadow-simulation outputs).
 */
import fs from "node:fs";
import path from "node:path";

import { CODES, SEVERITY } from "./checks.mjs";

const RO = "release-owner session (producer)";

/** @type {ReadonlyArray<{id, code, sport, file, anchor, description, correction, owner, surface?}>} */
export const STATIC_RULES = Object.freeze([
  // ── lean rules that can reverse a lean for identical inputs ──
  { id: "LEAN_ARGMAX_SCORE_PROP", code: CODES.LEAN_CONTRADICTION, sport: "NBA", file: "pipeline/score_model.py", anchor: "if edge_over >= edge_under:", description: "score_prop picks the side by argmax of edge with no EV minimum (ties → OVER)", correction: "Call the shared evaluator rule (price-aware-ev@1: EV ≥ min and edge ≥ min, else NONE)." },
  { id: "LEAN_ARGMAX_MLB_GRADE", code: CODES.LEAN_CONTRADICTION, sport: "MLB", file: "pipeline/mlb/mlb_model.py", anchor: "if edge_over_pp >= edge_under_pp:", description: "MLB grade() picks the side by argmax of raw-implied edge (ties → OVER)", correction: "Use the shared price-aware lean rule against the no-vig price." },
  { id: "LEAN_PROJECTION_VS_LINE_RESCUE", code: CODES.LEAN_CONTRADICTION, sport: "NBA", file: "pipeline/attach_recent10.py", anchor: "lean[\"lean\"] = \"Over\" if projection > line else \"Under\"", description: "R1 rescue sets the lean from projection vs line (never NONE, ignores price)", correction: "Rescued rows take the shared evaluator lean; projection < line is not an UNDER pick." },
  { id: "LEAN_PROJECTION_VS_LINE_LIVE_PROPS", code: CODES.LEAN_CONTRADICTION, sport: "NFL", file: "app/src/lib/sports/nfl/live-prop-state.mjs", anchor: "const impliedSide = projection > frozenLine ? \"OVER\"", description: "Live Hub / Results grade the side implied by projection median vs line, not a price-aware lean", correction: "Grade the frozen shared-evaluator lean (NONE ⇒ not graded as a forecast side)." },
  { id: "LEAN_HARDCODED_OVER_ENGINE_V2", code: CODES.LEAN_CONTRADICTION, sport: "NFL", file: "app/src/lib/products/engine-v2/sources.mjs", anchor: "side: c.binary ? \"yes\" : \"over\"", description: "receiptFromNflBoardCandidate hard-codes side OVER for every NFL board candidate", correction: "Take the side from the shared evaluation of (player, market, book, line, snapshot)." },
  { id: "LEAN_MARKET_FAVOURITE_MLB_PICKS", code: CODES.LEAN_CONTRADICTION, sport: "MLB", file: "app/src/lib/daily-portfolio/mlb-model-picks.ts", anchor: "fairOver >= 0.5 ? \"over\" : \"under\"", description: "mlb-model-picks takes the de-vigged market favourite as the side", correction: "Side = shared evaluator lean; a market favourite is not a model lean." },
  { id: "LEAN_POVER_HALF_NFL_GAME_SIMS", code: CODES.LEAN_CONTRADICTION, sport: "NFL", file: "app/scripts/nfl/build-nfl-game-simulations.mjs", anchor: "side: pOver >= 0.5 ? \"over\" : \"under\"", description: "NFL game simulations publish OVER whenever pOver ≥ 0.5 (no price)", correction: "Publish probabilities; the side comes from the shared evaluator when a price exists." },
  // ── evaluator divergences (same market, different probability) ──
  { id: "DEVIG_NBA_SCORE_PROP", code: CODES.PROJECTION_MISMATCH, sport: "NBA", file: "pipeline/score_model.py", anchor: "p_over_implied, p_under_implied = devig_two_way(raw_over, raw_under)", description: "NBA scoring de-vigs before edge…", correction: "One implied-probability rule for all boards: edge vs proportional no-vig (shared evaluator)." },
  { id: "DEVIG_NBA_BOARD", code: CODES.PROJECTION_MISMATCH, sport: "NBA", file: "pipeline/generate_daily_board.py", anchor: "p_over_implied, _p_under_implied = devig_two_way(raw_over, raw_under)", description: "…the NBA board de-vigs…", correction: "One implied-probability rule for all boards: edge vs proportional no-vig (shared evaluator)." },
  { id: "RAW_IMPLIED_MLB_ODDS", code: CODES.PROJECTION_MISMATCH, sport: "MLB", file: "pipeline/mlb/mlb_odds.py", anchor: "\"impliedOver\": implied_probability_from_american(", description: "…while MLB stores raw (vig-included) implied…", correction: "Store raw AND no-vig; edges read the no-vig value." },
  { id: "RAW_IMPLIED_MLB_EDGE", code: CODES.PROJECTION_MISMATCH, sport: "MLB", file: "pipeline/mlb/mlb_model.py", anchor: "edge_over_pp = (p_over - implied_over) * 100.0", description: "…and computes edge against the raw implied", correction: "Edge vs no-vig, decisive (push-excluded) model probability." },
  { id: "SIGMA_NBA_LAST10_FLOOR", code: CODES.PROJECTION_MISMATCH, sport: "NBA", file: "pipeline/build_features.py", anchor: "\"dispersion_pts\": _std(last10_pts, floor=", description: "NBA σ = last-10 population std with a floor", correction: "σ (or the full distribution) comes from the official snapshot's distribution, one definition per family." },
  { id: "SIGMA_NBA_DEFAULT_5", code: CODES.PROJECTION_MISMATCH, sport: "NBA", file: "pipeline/score_model.py", anchor: "return features.get(f\"dispersion_{market.lower()}\", 5.0)", description: "NBA σ silently defaults to 5.0 when missing", correction: "Missing dispersion ⇒ NO_DISTRIBUTION (lean NONE), never a default." },
  { id: "SIGMA_MLB_PITCHER_FLOOR", code: CODES.PROJECTION_MISMATCH, sport: "MLB", file: "pipeline/mlb/mlb_model.py", anchor: "sigma = max(_safe_stdev(series, default=1.6), 1.6)", description: "MLB pitcher σ = season std with a 1.6 floor", correction: "One σ definition per family, recorded in the snapshot." },
  { id: "SIGMA_MLB_BATTER_FLOOR", code: CODES.PROJECTION_MISMATCH, sport: "MLB", file: "pipeline/mlb/mlb_model.py", anchor: "sigma = max(_safe_stdev(series, default=floor), floor)", description: "MLB batter σ = season std with per-market floor", correction: "One σ definition per family, recorded in the snapshot." },
  { id: "SIGMA_NFL_EMPIRICAL_STRICT", code: CODES.PROJECTION_MISMATCH, sport: "NFL", file: "app/src/lib/sports/nfl/player-props-v1.mjs", anchor: "probOver: (line) => samples.reduce((a, v) => a + (v > line ? 1 : 0), 0) / n", description: "NFL props P(over) is an empirical strict count (push mass counted as under)", correction: "Use lineProbabilities (exact push for empirical)." },
  { id: "SIGMA_NFL_GAME_FROM_P10_P90", code: CODES.PROJECTION_MISMATCH, sport: "NFL", file: "app/scripts/nfl/build-nfl-game-simulations.mjs", anchor: "const sigMargin = (s.margin.p90 - s.margin.p10) / (2 * zFromP);", description: "NFL game sims back σ out of rounded p10/p90 instead of the receipt's marginSigma", correction: "Read distribution.marginSigma / totalSigma from the official snapshot." },
  { id: "PUSH_DROPPED_NBA_NORMAL", code: CODES.PROJECTION_MISMATCH, sport: "NBA", file: "pipeline/score_model.py", anchor: "p_over_model = 1.0 - _normal_cdf(z)", description: "NBA P(over) = 1 − Φ(z): no push mass on whole lines", correction: "Integer continuity rule (P(push) = F(ℓ+½) − F(ℓ−½))." },
  { id: "PUSH_DROPPED_MLB_NORMAL", code: CODES.PROJECTION_MISMATCH, sport: "MLB", file: "pipeline/mlb/mlb_model.py", anchor: "return 1.0 - _phi(z)", description: "MLB model_over_probability: no push mass", correction: "Report pOver, pUnder and pPush under the integer continuity rule (shared evaluator lineProbabilities)." },
  { id: "PUSH_DROPPED_NFL_GAME_SIMS", code: CODES.PROJECTION_MISMATCH, sport: "NFL", file: "app/scripts/nfl/build-nfl-game-simulations.mjs", anchor: "const overProb = (values, line) => r4(values.filter((v) => v > line).length", description: "NFL game sims: strict > line, push undefined", correction: "Report pOver/pUnder/pPush from exact counts." },
  { id: "PUSH_DROPPED_NFL_JOINT_V1", code: CODES.PROJECTION_MISMATCH, sport: "NFL", file: "app/src/lib/sports/nfl/joint-game-sim.mjs", anchor: "probOverLine: Number((samples.filter((v) => v > line).length", description: "joint-game-sim: strict > line", correction: "Report pOver, pUnder and pPush from exact counts (push is its own mass)." },
  { id: "PUSH_DROPPED_NFL_JOINT_V2", code: CODES.PROJECTION_MISMATCH, sport: "NFL", file: "app/src/lib/sports/nfl/joint-game-sim-v2.mjs", anchor: "filter(v => v > line).length / runs", description: "joint-game-sim-v2: strict > line", correction: "Report pOver, pUnder and pPush from exact counts (push is its own mass)." },
  { id: "PUSH_DROPPED_NFL_JOINT_V3", code: CODES.PROJECTION_MISMATCH, sport: "NFL", file: "app/src/lib/sports/nfl/joint-game-sim-v3.mjs", anchor: "filter(v => v > line).length / runs", description: "joint-game-sim-v3: strict > line", correction: "Report pOver, pUnder and pPush from exact counts (push is its own mass)." },
  { id: "PUSH_AS_MISS_NFL_PROP_EVAL", code: CODES.PROJECTION_MISMATCH, sport: "NFL", file: "app/scripts/nfl/evaluate-nfl-player-props.mjs", anchor: "hit: actual > dist.line ? 1 : 0", description: "prop evaluation scores a push as a miss", correction: "Push is VOID in grading (settlement contract)." },
  { id: "ASK_OVER_PROB_FOR_UNDER", code: CODES.PROJECTION_MISMATCH, sport: "MLB", file: "app/scripts/ask/build-ask-projections.mjs", anchor: "modelProbability: paused ? null : p.total.overProbability ?? null,", description: "Ask labels P(over) as the model probability whatever the pick side (UNDER picks show the OVER probability)", correction: "modelProbability = P(side) from the shared evaluation." },
  { id: "PRICE_TIME_IS_BOARD_TIME_MLB_SIMS", code: CODES.UNQUALIFIED_AS_QUALIFIED, sport: "MLB", file: "app/src/lib/game-simulations/mlb-generator.ts", anchor: "const capturedAt = board.generatedAt || first.commenceTime", description: "board generatedAt used as the price capturedAt — a stale price can pass a freshness gate", correction: "capturedAt is the odds capture's own time; missing ⇒ NO_CAPTURE_TIME (lean NONE)." },
  { id: "PRICE_TIME_IS_ARTIFACT_TIME_INTEL", code: CODES.UNQUALIFIED_AS_QUALIFIED, sport: "ALL", file: "app/src/lib/markets/player-intelligence.ts", anchor: "snapshot: { capturedAt: input.artifact.generatedAt, freshness }", description: "player intelligence stamps the artifact time as the price capture time", correction: "capturedAt is the odds capture's own time; missing ⇒ NO_CAPTURE_TIME (lean NONE)." },
  { id: "PRICE_TIME_FALLBACK_LOAD", code: CODES.UNQUALIFIED_AS_QUALIFIED, sport: "ALL", file: "app/src/lib/markets/load.ts", anchor: "capturedAt: teamMarkets.generatedAt ?? propsFile.generatedAt", description: "market loader falls back to the file's generatedAt as capturedAt", correction: "capturedAt is the odds capture's own time; missing ⇒ NO_CAPTURE_TIME (lean NONE)." },
  // ── identity by name ──
  { id: "NAME_JOIN_ENRICH_DUAL_LEGS", code: CODES.NAME_JOIN, sport: "ALL", file: "pipeline/daily/enrich_dual_legs.py", anchor: "idx[(l[\"playerName\"], l[\"marketKey\"])] = l", description: "dual-leg enrichment indexes legs by player name", correction: "Key by (sport, eventId, playerId, marketKey, line)." },
  { id: "NAME_JOIN_SETTLE_SUGGESTED_CARDS", code: CODES.NAME_JOIN, sport: "ALL", file: "pipeline/daily/settle_suggested_cards.py", anchor: "key = (r.get(\"playerName\"), r.get(\"marketKey\"), r.get(\"lean\"), r.get(\"line\"))", description: "suggested-card settlement keyed by player name", correction: "Key by (sport, eventId, playerId, marketKey, line) — never by name." },
  { id: "NAME_JOIN_SLIP_LEG_KEY", code: CODES.NAME_JOIN, sport: "ALL", file: "app/src/lib/slip/leg-identity.ts", anchor: "[norm(l.sport), norm(l.player), norm(l.marketLabel), norm(l.side)", description: "Smart Betslip leg identity is built from the normalised player name and market label", correction: "Leg identity = evaluation identity key (ids only)." },
  { id: "NAME_JOIN_PROP_JOIN_KEY", code: CODES.NAME_JOIN, sport: "ALL", file: "app/src/lib/markets/player-intelligence.ts", anchor: "return `${playerName}|${gameId}|${marketKey}|${line ?? \"\"}`;", description: "propJoinKey starts with the player name", correction: "Key by (sport, eventId, playerId, marketKey, line) — never by name." },
  { id: "NAME_JOIN_NBA_SETTLE_BOX", code: CODES.NAME_JOIN, sport: "NBA", file: "pipeline/settle_results.py", anchor: "stats = espn_stats_by_game[game_id].get(name)", description: "NBA settlement looks up the ESPN box score by lower-cased name", correction: "Join by providerAthleteId (the box-score corpus carries it)." },
  // ── Theater default chosen by the shadow simulator's own percentiles ──
  { id: "THEATER_SELF_TARGETS_NFL_SIM_V2", code: CODES.PROJECTION_MISMATCH, sport: "NFL", surface: "simulation-theater.selection-rule", file: "app/src/lib/sports/nfl/sim-v2/receipt.mjs", anchor: "[\"MEDIAN_LIKE\", nearest(() => true, qt.p50, qm.p50)]", description: "the Theater's default NFL run is the run nearest the SHADOW batch's own p50 margin/total, not the official snapshot's projections", correction: "Default run = selectOfficialRepresentative(runs, officialTargets(snapshot)); others are labelled Hypothetical." },
].map((r) => Object.freeze({ owner: RO, ...r })));

/** Directory guards: product code must never read scenario / what-if / shadow simulation outputs. */
export const GUARDS = Object.freeze([
  Object.freeze({
    id: "PRODUCT_READS_SCENARIO", code: CODES.SCENARIO_LEAK, sport: "ALL",
    dirs: ["app/src/lib/products", "app/src/lib/bank-builder", "app/src/lib/slip", "app/src/lib/daily-portfolio", "app/src/lib/parlays"],
    filePrefixes: ["app/src/lib/bank-builder", "app/src/lib/moonshot", "app/src/lib/parlay"],
    pattern: /(world-model-v2|sim-v2|representativeRuns|representativeSamples|sampledWorlds|whatIf|WHAT_IF)/,
    description: "a product module references a scenario / what-if / shadow-simulation output",
    correction: "Products read the official snapshot and the shared evaluator only.",
    owner: "product owner",
  }),
]);

const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;

function listFiles(abs, out = []) {
  if (!fs.existsSync(abs)) return out;
  const st = fs.statSync(abs);
  if (st.isFile()) { out.push(abs); return out; }
  for (const f of fs.readdirSync(abs).sort()) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    listFiles(path.join(abs, f), out);
  }
  return out;
}

/**
 * Scan the repo. Returns static discrepancy-shaped findings (sport/eventId "*"), each with file, line(s), count.
 * @param {string} repoRoot
 */
export function staticScan(repoRoot, { rules = STATIC_RULES, guards = GUARDS } = {}) {
  const findings = [];
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) { try { cache.set(rel, fs.readFileSync(path.join(repoRoot, rel), "utf8")); } catch { cache.set(rel, null); } }
    return cache.get(rel);
  };
  for (const r of rules) {
    const text = read(r.file);
    if (text == null) continue;
    const lines = [];
    let i = text.indexOf(r.anchor);
    while (i >= 0) { lines.push(lineOf(text, i)); i = text.indexOf(r.anchor, i + r.anchor.length); }
    if (!lines.length) continue;
    findings.push(staticFinding(r, r.file, lines, r.anchor));
  }
  for (const g of guards) {
    const files = new Set();
    for (const d of g.dirs) for (const f of listFiles(path.join(repoRoot, d))) files.add(f);
    for (const pfx of g.filePrefixes ?? []) {
      const dir = path.join(repoRoot, path.dirname(pfx));
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) if (path.join(path.dirname(pfx), f).startsWith(pfx)) for (const x of listFiles(path.join(dir, f))) files.add(x);
    }
    for (const abs of [...files].sort()) {
      if (!/\.(mjs|ts|tsx|js)$/.test(abs) || /\.test\./.test(abs)) continue;
      const rel = path.relative(repoRoot, abs);
      const text = read(rel);
      if (text == null) continue;
      const hits = [];
      text.split("\n").forEach((ln, k) => { if (g.pattern.test(ln)) hits.push({ line: k + 1, text: ln.trim() }); });
      if (hits.length) findings.push(staticFinding(g, rel, hits.map((h) => h.line), hits[0].text));
    }
  }
  return findings;
}

function staticFinding(rule, file, lines, anchor) {
  const d = {
    code: rule.code, severity: SEVERITY.WARN, sport: rule.sport, eventId: "*", snapshotId: null,
    surface: rule.surface ?? "source", identity: { subjectId: rule.id, family: null, field: file },
    sources: [file], expected: null, actual: anchor, count: lines.length,
    examples: lines.map((l) => ({ file, line: l })), location: lines.map((l) => `${file}:${l}`),
    correction: rule.correction, owner: rule.owner, detail: rule.description, ruleId: rule.id, static: true,
  };
  d.fingerprint = `STATIC|${rule.id}|${file}|${anchor}`;
  return d;
}
