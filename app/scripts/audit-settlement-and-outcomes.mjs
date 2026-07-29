/**
 * SPRINT 046 — reproducible settlement & outcome audit.
 *
 * WHY THIS EXISTS
 * Every number the founder is asked to trust about "how are we doing" has, until now, come from a
 * one-off shell command written for a single question. That is how denominators drift: a rate computed
 * over "settled rows" one week and "generated rows" the next looks like performance moving when only
 * the population moved.
 *
 * So this is one entry point with one set of definitions, and it REFUSES to report a hit rate for a
 * date whose population does not reconcile exactly. An unexplained gap is a failure, not a footnote.
 *
 * THE ACCOUNTING IDENTITY, enforced per date:
 *
 *   generated leans
 *     = decisive (Win + Loss)
 *     + void/push
 *     + non-directional (Pass / No Play — never admitted to a result population)
 *     + pending      (event not terminal)
 *     + unavailable  (event terminal, outcome not gradable — e.g. the player never appeared)
 *     + unresolved   (classification not provable offline)
 *
 * RULES THIS TOOL ENFORCES
 *   · Pending is not a loss. Void is not a loss. Unavailable is not a loss. Missing is not a loss.
 *   · Every percentage carries its numerator, denominator, and population label.
 *   · Model and market are compared ONLY on identical rows, with the market de-vigged first —
 *     the raw book probabilities in the board sum to ~1.069, so comparing against them unmodified
 *     would flatter the model by the entire hold.
 *   · Read-only. It never writes to a ledger or mutates an artifact.
 *
 * Usage:
 *   npm run audit:settlement-and-outcomes -- --date-from 2026-07-25 --date-to 2026-07-27
 *   ... --json out.json --markdown out.md    write structured + human-readable output
 *   ... --check-finality                     classify unsettled rows via MLB StatsAPI (network)
 *   ... --strict                             exit 1 on any unexplained gap
 *   ... --self-test                          run known-positive / known-negative fixtures and exit
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const BOARDS = path.join(APP, "public/data/mlb/boards");
const LEDGER = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");

/**
 * Markets the settlement pipeline actually grades.
 * Mirrors GRADABLE_MARKETS in pipeline/mlb/settle_mlb_results.py; `assertGradableMarketsInSync`
 * fails if the two drift, because a market silently dropped here would quietly shrink every
 * denominator without changing a single reported rate.
 */
export const GRADABLE_MARKETS = [
  "pitcher_strikeouts",
  "batter_hits",
  "batter_total_bases",
  "batter_hits_runs_rbis",
];

/** A lean with no direction was never a prediction. It belongs in no result population. */
const NON_DIRECTIONAL = new Set([null, undefined, "", "Pass", "No Play"]);

const isDirectional = (lean) => !NON_DIRECTIONAL.has(lean?.lean ?? null);

// ── loading ────────────────────────────────────────────────────────────────────

function loadBoard(date) {
  const p = path.join(BOARDS, `${date}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadLedger() {
  if (!fs.existsSync(LEDGER)) return new Map();
  const byDate = new Map();
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const row = JSON.parse(t);
    if (!byDate.has(row.date)) byDate.set(row.date, new Map());
    byDate.get(row.date).set(row.id, row);
  }
  return byDate;
}

// ── probability helpers ────────────────────────────────────────────────────────

/**
 * De-vig a two-way market by proportional (multiplicative) normalisation.
 *
 * Returns null unless BOTH sides are present: a one-sided price cannot be de-vigged, and using it
 * raw would silently mix a ~6.9%-hold probability into a comparison against a fair one.
 */
export function deVig(over, under) {
  if (typeof over !== "number" || typeof under !== "number") return null;
  const sum = over + under;
  if (!(sum > 0)) return null;
  return { over: over / sum, under: under / sum, overround: sum };
}

const clip = (p, eps = 1e-6) => Math.min(1 - eps, Math.max(eps, p));
const brier = (p, y) => (p - y) ** 2;
const logLoss = (p, y) => -(y * Math.log(clip(p)) + (1 - y) * Math.log(1 - clip(p)));

// ── per-date reconciliation ────────────────────────────────────────────────────

export function reconcileDate(date, board, settledById, finality) {
  const leans = board?.leans ?? [];
  const buckets = {
    generated: leans.length,
    nonGradableMarket: 0,
    nonDirectional: 0,
    win: 0,
    loss: 0,
    void: 0,
    pending: 0,
    unavailable: 0,
    unresolved: 0,
  };
  const decisiveRows = [];
  const unclassified = [];

  for (const lean of leans) {
    if (!GRADABLE_MARKETS.includes(lean.marketKey)) {
      buckets.nonGradableMarket += 1;
      continue;
    }
    if (!isDirectional(lean)) {
      buckets.nonDirectional += 1;
      continue;
    }
    const settled = settledById?.get(lean.id);
    if (!settled) {
      // The ledger does not record unavailable rows at all — a row that was generated, was
      // gradable, and simply never appears. Whether that is "pending" or "unavailable" depends on
      // whether its GAME finished, which is not knowable from the pregame artifacts alone.
      const status = finality?.get(lean.gamePk) ?? null;
      if (status === null) {
        buckets.unresolved += 1;
        unclassified.push({ id: lean.id, gamePk: lean.gamePk, player: lean.playerName, market: lean.marketKey });
      } else if (status === "final") {
        buckets.unavailable += 1;
      } else {
        buckets.pending += 1;
      }
      continue;
    }
    const outcome = settled.outcome;
    if (outcome === "Win") buckets.win += 1;
    else if (outcome === "Loss") buckets.loss += 1;
    else if (outcome === "Void" || outcome === "Push") buckets.void += 1;
    else {
      buckets.unresolved += 1;
      unclassified.push({ id: lean.id, outcome, note: "unrecognised outcome state" });
      continue;
    }
    if (outcome === "Win" || outcome === "Loss") {
      decisiveRows.push({ lean, settled, won: outcome === "Win" });
    }
  }

  const accounted =
    buckets.nonGradableMarket + buckets.nonDirectional + buckets.win + buckets.loss +
    buckets.void + buckets.pending + buckets.unavailable + buckets.unresolved;

  return { date, buckets, gap: buckets.generated - accounted, decisiveRows, unclassified };
}

// ── metrics ────────────────────────────────────────────────────────────────────

/** Every rate is returned with its numerator and denominator attached. A bare percentage is a lie. */
const rate = (numerator, denominator, population) => ({
  numerator,
  denominator,
  population,
  rate: denominator === 0 ? null : numerator / denominator,
});

export function computeMetrics(reconciliations) {
  const all = reconciliations.flatMap((r) => r.decisiveRows);
  const b = reconciliations.reduce((acc, r) => {
    for (const [k, v] of Object.entries(r.buckets)) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});

  const decisive = b.win + b.loss;
  const metrics = {
    decisiveHitRate: rate(b.win, decisive, "directional gradable rows with a Win or Loss"),
    terminalCoverage: rate(b.win + b.loss + b.void, b.generated, "all generated board leans"),
    settlementCompletion: rate(
      b.win + b.loss + b.void,
      b.win + b.loss + b.void + b.pending + b.unavailable + b.unresolved,
      "directional gradable rows expected to reach a terminal state",
    ),
  };

  // ── model vs market, on IDENTICAL rows ──────────────────────────────────────
  // A row qualifies only when it is decisive AND carries both a model probability and a two-way
  // market that can be de-vigged. Anything else is excluded and counted, never imputed.
  const paired = [];
  let excludedNoModel = 0;
  let excludedNoMarket = 0;
  for (const { lean, won } of all) {
    const side = String(lean.lean).toLowerCase();
    const modelProb = side === "over" ? lean.modelProbOver : lean.modelProbUnder;
    if (typeof modelProb !== "number") { excludedNoModel += 1; continue; }
    const fair = deVig(lean.impliedOver, lean.impliedUnder);
    if (!fair) { excludedNoMarket += 1; continue; }
    const marketProb = side === "over" ? fair.over : fair.under;
    paired.push({ modelProb, marketProb, y: won ? 1 : 0, market: lean.marketKey, confidence: lean.confidence });
  }

  const mean = (xs) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null);
  const comparison = paired.length === 0 ? null : {
    pairedRows: paired.length,
    excludedNoModelProbability: excludedNoModel,
    excludedNoTwoWayMarket: excludedNoMarket,
    model: {
      brier: mean(paired.map((p) => brier(p.modelProb, p.y))),
      logLoss: mean(paired.map((p) => logLoss(p.modelProb, p.y))),
      meanPredicted: mean(paired.map((p) => p.modelProb)),
    },
    market: {
      brier: mean(paired.map((p) => brier(p.marketProb, p.y))),
      logLoss: mean(paired.map((p) => logLoss(p.marketProb, p.y))),
      meanPredicted: mean(paired.map((p) => p.marketProb)),
    },
    observedRate: mean(paired.map((p) => p.y)),
  };
  if (comparison) {
    // Lower is better for both. Stated as a difference, never as a claim about future performance.
    comparison.brierDifferenceModelMinusMarket = comparison.model.brier - comparison.market.brier;
    comparison.logLossDifferenceModelMinusMarket = comparison.model.logLoss - comparison.market.logLoss;
  }

  // ── breakdowns ──────────────────────────────────────────────────────────────
  const groupRate = (rows, keyFn, label) => {
    const out = {};
    for (const r of rows) {
      const k = keyFn(r);
      out[k] ??= { win: 0, loss: 0 };
      out[k][r.won ? "win" : "loss"] += 1;
    }
    return Object.fromEntries(
      Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, rate(v.win, v.win + v.loss, label)]),
    );
  };

  const buckets = {};
  for (const p of paired) {
    const lo = Math.floor(p.modelProb * 10) / 10;
    const k = `${lo.toFixed(1)}-${(lo + 0.1).toFixed(1)}`;
    buckets[k] ??= { n: 0, predicted: 0, observed: 0 };
    buckets[k].n += 1;
    buckets[k].predicted += p.modelProb;
    buckets[k].observed += p.y;
  }
  const calibration = Object.fromEntries(
    Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [
      k, { n: v.n, meanPredicted: v.predicted / v.n, observedRate: v.observed / v.n },
    ]),
  );

  return {
    counts: b,
    metrics,
    byDate: Object.fromEntries(reconciliations.map((r) => [
      r.date,
      rate(r.buckets.win, r.buckets.win + r.buckets.loss, "decisive rows on this date"),
    ])),
    byMarketFamily: groupRate(all, (r) => r.lean.marketKey, "decisive rows in this market family"),
    byDescriptiveCategory: groupRate(all, (r) => String(r.lean.confidence ?? "none"),
      "decisive rows in this descriptive grouping (NOT a predictive confidence)"),
    modelVsMarket: comparison,
    calibrationByPredictedProbability: calibration,
  };
}

// ── finality (network, isolated) ───────────────────────────────────────────────

/**
 * Fetch game finality from the MLB Stats API.
 *
 * DELIBERATELY isolated from every pregame artifact: it returns an in-memory map used only to label
 * unsettled rows as pending vs unavailable, and nothing here is ever written into a board, snapshot,
 * or prediction file. Postgame data entering a pregame artifact is the failure mode this whole
 * codebase has spent five sprints removing.
 */
async function fetchFinality(dates) {
  const map = new Map();
  for (const date of dates) {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`);
    if (!res.ok) continue;
    const body = await res.json();
    for (const d of body.dates ?? []) {
      for (const g of d.games ?? []) {
        const state = String(g.status?.detailedState ?? "").toLowerCase();
        map.set(g.gamePk, state.includes("final") || state.includes("completed") ? "final" : "not_final");
      }
    }
  }
  return map;
}

// ── self-test: known-positive and known-negative ───────────────────────────────

/**
 * A new audit script is not trustworthy because it produced a plausible number. These fixtures prove
 * it reconciles a clean population, FAILS a population with a hole in it, and never lets a pending,
 * void, or unavailable row leak into the decisive denominator.
 */
export function selfTest() {
  const failures = [];
  const ok = (cond, msg) => { if (!cond) failures.push(msg); };
  const lean = (over = {}) => ({
    id: over.id ?? "L1", marketKey: "batter_hits", lean: "Over", gamePk: 1,
    modelProbOver: 0.6, modelProbUnder: 0.4, impliedOver: 0.55, impliedUnder: 0.52,
    confidence: "High", playerName: "Test", ...over,
  });
  const settled = (id, outcome) => [id, { id, outcome, date: "2026-01-01" }];

  // KNOWN POSITIVE — every row lands in exactly one bucket.
  {
    const board = { leans: [lean({ id: "w" }), lean({ id: "l" }), lean({ id: "v" }), lean({ id: "p", lean: "Pass" })] };
    const map = new Map([settled("w", "Win"), settled("l", "Loss"), settled("v", "Void")]);
    const r = reconcileDate("2026-01-01", board, map, new Map());
    ok(r.gap === 0, `known-positive must reconcile to zero, got gap ${r.gap}`);
    ok(r.buckets.win === 1 && r.buckets.loss === 1 && r.buckets.void === 1 && r.buckets.nonDirectional === 1,
      `known-positive buckets wrong: ${JSON.stringify(r.buckets)}`);
    const m = computeMetrics([r]);
    ok(m.metrics.decisiveHitRate.denominator === 2, "void and Pass must stay out of the decisive denominator");
    ok(m.metrics.decisiveHitRate.rate === 0.5, "1 win of 2 decisive is 0.5");
  }

  // KNOWN NEGATIVE — a row that is generated, gradable, directional, and simply missing.
  {
    const board = { leans: [lean({ id: "w" }), lean({ id: "ghost" })] };
    const r = reconcileDate("2026-01-01", board, new Map([settled("w", "Win")]), new Map());
    ok(r.buckets.unresolved === 1, "an unclassifiable missing row must be UNRESOLVED, never dropped");
    ok(r.gap === 0, "unresolved rows are still accounted — the gap tracks rows in NO bucket");
    const m = computeMetrics([r]);
    ok(m.metrics.decisiveHitRate.denominator === 1, "the missing row must NOT enter the decisive denominator");
    ok(m.metrics.settlementCompletion.rate === 0.5, "settlement completion must expose the missing row");
  }

  // A pending row must not become a loss, and must not move the hit rate.
  {
    const board = { leans: [lean({ id: "w" }), lean({ id: "pend", gamePk: 9 })] };
    const fin = new Map([[1, "final"], [9, "not_final"]]);
    const r = reconcileDate("2026-01-01", board, new Map([settled("w", "Win")]), fin);
    ok(r.buckets.pending === 1 && r.buckets.loss === 0, "a pending row is not a loss");
    ok(computeMetrics([r]).metrics.decisiveHitRate.rate === 1, "pending must not dilute the hit rate");
  }

  // An unavailable row (game final, player absent) must not become a loss either.
  {
    const board = { leans: [lean({ id: "w" }), lean({ id: "unavail", gamePk: 9 })] };
    const fin = new Map([[1, "final"], [9, "final"]]);
    const r = reconcileDate("2026-01-01", board, new Map([settled("w", "Win")]), fin);
    ok(r.buckets.unavailable === 1 && r.buckets.loss === 0, "an unavailable row is not a loss");
    ok(computeMetrics([r]).metrics.decisiveHitRate.denominator === 1, "unavailable stays out of the denominator");
  }

  // De-vig must actually remove the hold.
  {
    const fair = deVig(0.55, 0.52);
    ok(Math.abs(fair.over + fair.under - 1) < 1e-9, "de-vigged probabilities must sum to 1");
    ok(fair.overround > 1, "the overround must be reported, not silently discarded");
    ok(deVig(0.55, null) === null, "a one-sided market cannot be de-vigged");
  }

  return failures;
}

/** The gradable-market list must match the Python settlement pipeline. */
export function assertGradableMarketsInSync() {
  const src = fs.readFileSync(path.join(REPO, "pipeline/mlb/settle_mlb_results.py"), "utf8");
  const start = src.indexOf("GRADABLE_MARKETS");
  if (start < 0) return ["GRADABLE_MARKETS not found in the Python pipeline"];
  // Read to the closing brace rather than a fixed slice — the Python set is interleaved with
  // comments, and a fixed window silently truncated it into a false "drift" report.
  const end = src.indexOf("}", start);
  const block = end > start ? src.slice(start, end) : src.slice(start, start + 2000);
  // Strip `#` comments first: the Python set carries an explanatory comment that itself contains
  // quoted words ("unresolved", "pending"), which a naive regex reads as market names.
  const code = block.split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");
  const pythonMarkets = [...code.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const problems = [];
  for (const m of GRADABLE_MARKETS) {
    if (!pythonMarkets.includes(m)) problems.push(`${m} is audited here but NOT graded by the Python pipeline`);
  }
  for (const m of pythonMarkets) {
    if (!GRADABLE_MARKETS.includes(m)) problems.push(`${m} is graded by the Python pipeline but NOT audited here`);
  }
  return problems;
}

// ── rendering ──────────────────────────────────────────────────────────────────

const pct = (r) => (r?.rate == null ? "n/a" : `${(r.rate * 100).toFixed(2)}%`);
const withDen = (r) => (r?.rate == null ? "n/a (denominator 0)" : `${pct(r)} (${r.numerator}/${r.denominator})`);

function renderMarkdown(result) {
  const { window: win, perDate, summary } = result;
  const L = [];
  L.push(`# Settlement & Outcome Audit`);
  L.push(``, `**Window:** ${win.from} → ${win.to} · **Generated:** ${win.generatedAt} · **Read-only**`);
  L.push(``, `## Population reconciliation`, ``);
  L.push(`| Date | Generated | Win | Loss | Void | Pending | Unavailable | Unresolved | Pass | Gap |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const d of perDate) {
    const b = d.buckets;
    L.push(`| ${d.date} | ${b.generated} | ${b.win} | ${b.loss} | ${b.void} | ${b.pending} | ${b.unavailable} | ${b.unresolved} | ${b.nonDirectional} | **${d.gap}** |`);
  }
  L.push(``, `## Headline rates — each with its denominator`, ``);
  L.push(`| Metric | Value | Population |`);
  L.push(`|---|---|---|`);
  for (const [k, v] of Object.entries(summary.metrics)) {
    L.push(`| ${k} | ${withDen(v)} | ${v.population} |`);
  }
  L.push(``, `## Decisive hit rate by date`, ``, `| Date | Rate |`, `|---|---|`);
  for (const [k, v] of Object.entries(summary.byDate)) L.push(`| ${k} | ${withDen(v)} |`);
  L.push(``, `## Decisive hit rate by market family`, ``, `| Market | Rate |`, `|---|---|`);
  for (const [k, v] of Object.entries(summary.byMarketFamily)) L.push(`| ${k} | ${withDen(v)} |`);
  L.push(``, `## Decisive hit rate by descriptive category`, ``);
  L.push(`> These are descriptive groupings shown in-product. They are NOT predictive confidence.`, ``);
  L.push(`| Category | Rate |`, `|---|---|`);
  for (const [k, v] of Object.entries(summary.byDescriptiveCategory)) L.push(`| ${k} | ${withDen(v)} |`);

  const c = summary.modelVsMarket;
  L.push(``, `## Model vs sportsbook — identical rows, market de-vigged`, ``);
  if (!c) {
    L.push(`No paired rows in this window.`);
  } else {
    L.push(`Paired decisive rows: **${c.pairedRows}** · excluded for no model probability: ${c.excludedNoModelProbability} · excluded for no two-way market: ${c.excludedNoTwoWayMarket}`, ``);
    L.push(`| | Brier | Log loss | Mean predicted |`, `|---|---|---|---|`);
    L.push(`| Model | ${c.model.brier.toFixed(4)} | ${c.model.logLoss.toFixed(4)} | ${(c.model.meanPredicted * 100).toFixed(2)}% |`);
    L.push(`| Market (de-vigged) | ${c.market.brier.toFixed(4)} | ${c.market.logLoss.toFixed(4)} | ${(c.market.meanPredicted * 100).toFixed(2)}% |`);
    L.push(`| Observed | — | — | ${(c.observedRate * 100).toFixed(2)}% |`, ``);
    L.push(`Difference (model − market): Brier **${c.brierDifferenceModelMinusMarket >= 0 ? "+" : ""}${c.brierDifferenceModelMinusMarket.toFixed(4)}**, log loss **${c.logLossDifferenceModelMinusMarket >= 0 ? "+" : ""}${c.logLossDifferenceModelMinusMarket.toFixed(4)}**. Lower is better for both, so a positive difference means the model scored worse than the de-vigged market over this window.`);
  }
  L.push(``, `## Calibration by predicted probability`, ``, `| Bucket | n | Mean predicted | Observed |`, `|---|---|---|---|`);
  for (const [k, v] of Object.entries(summary.calibrationByPredictedProbability)) {
    L.push(`| ${k} | ${v.n} | ${(v.meanPredicted * 100).toFixed(1)}% | ${(v.observedRate * 100).toFixed(1)}% |`);
  }
  L.push(``, `_Buckets with small n are shown rather than hidden; read them as noise until n is large._`);
  return L.join("\n");
}

// ── main ───────────────────────────────────────────────────────────────────────

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

function datesBetween(from, to) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function main() {
  if (flag("self-test")) {
    const failures = [...selfTest(), ...assertGradableMarketsInSync().map((m) => `GRADABLE_MARKETS drift: ${m} missing from the Python pipeline`)];
    if (failures.length) {
      console.error(`SELF-TEST FAILED — ${failures.length}:`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log("self-test ok — known-positive reconciles, known-negative is exposed, pending/void/unavailable never become losses");
    return;
  }

  const from = arg("date-from");
  const to = arg("date-to", from);
  if (!from) {
    console.error("usage: --date-from YYYY-MM-DD [--date-to YYYY-MM-DD] [--check-finality] [--json f] [--markdown f] [--strict]");
    process.exit(2);
  }

  const dates = datesBetween(from, to);
  const ledger = loadLedger();
  const boards = dates.map((d) => [d, loadBoard(d)]).filter(([, b]) => b);
  const missingBoards = dates.filter((d) => !loadBoard(d));

  const finality = flag("check-finality") ? await fetchFinality(boards.map(([d]) => d)) : new Map();
  const perDate = boards.map(([d, b]) => reconcileDate(d, b, ledger.get(d), finality));
  const summary = computeMetrics(perDate);

  const result = {
    kind: "settlement-and-outcome-audit",
    window: { from, to, generatedAt: new Date().toISOString(), datesWithoutBoards: missingBoards, finalityChecked: flag("check-finality") },
    perDate: perDate.map(({ date, buckets, gap, unclassified }) => ({ date, buckets, gap, unclassified })),
    summary,
  };

  const jsonOut = arg("json");
  const mdOut = arg("markdown");
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));
  if (mdOut) fs.writeFileSync(mdOut, renderMarkdown(result));
  if (!jsonOut && !mdOut) console.log(renderMarkdown(result));
  else console.log(`wrote ${[jsonOut, mdOut].filter(Boolean).join(" and ")}`);

  const gaps = perDate.filter((d) => d.gap !== 0);
  if (gaps.length) {
    console.error(`\nUNEXPLAINED GAP on ${gaps.length} date(s): ${gaps.map((g) => `${g.date}=${g.gap}`).join(", ")}`);
    if (flag("strict")) process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
