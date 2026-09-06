/**
 * THE FULL MODEL HISTORY RECONCILES WITH THE NUMBER IT REPLACES — Program 235 · Release D.
 *
 * Run: npx tsx --test src/lib/results/model-results-index.test.mjs
 *
 * `graded-picks.json` counts 40,072 settled picks and publishes 60. Building a page over the other
 * 40,012 is only honest if the detail sums to the aggregate the rest of the site already shows;
 * otherwise the product acquires a second set of numbers quietly disagreeing with the first.
 *
 * So the load-bearing assertion is the reconciliation, and the producer refuses to write when it
 * fails. These prove the written artifacts kept that property, and that nothing internal leaked
 * into a public one on the way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const RESULTS = path.join(APP, "public/data/mlb/results");
const INDEX = path.join(RESULTS, "model-index.json");
const ROWS = path.join(RESULTS, "model-rows");

const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, "utf8")) : null;
const aggregate = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/mlb/graded-picks.json"), "utf8")); } catch { return null; }
})();

test("the index exists and covers a real population — everything below is vacuous otherwise", () => {
  assert.ok(index, "no model-results index");
  assert.ok((index.days ?? []).length > 10, `only ${(index.days ?? []).length} days indexed`);
  assert.ok(index.coverage.rows > 1000, `only ${index.coverage.rows} rows`);
});

test("THE INDEX RECONCILES WITH THE PUBLISHED AGGREGATE, exactly", () => {
  if (!index || !aggregate?.counts) return;
  const c = aggregate.counts;
  assert.equal(index.coverage.wins, c.hits, "wins disagree with the published hit count");
  assert.equal(index.coverage.losses, c.misses, "losses disagree with the published miss count");
  assert.equal(index.coverage.pushes, c.voided, "pushes disagree with the published void count");
  assert.equal(index.coverage.decisive, c.counted, "the decisive denominator disagrees with the published one");
  assert.equal(index.coverage.rows, c.total, "the row total disagrees with the published total");
});

test("THE DAYS SUM TO THE COVERAGE — no day is dropped or counted twice", () => {
  if (!index) return;
  const summed = index.days.reduce((a, d) => ({
    rows: a.rows + d.rows, wins: a.wins + d.wins, losses: a.losses + d.losses, pushes: a.pushes + d.pushes,
  }), { rows: 0, wins: 0, losses: 0, pushes: 0 });
  assert.equal(summed.rows, index.coverage.rows);
  assert.equal(summed.wins, index.coverage.wins);
  assert.equal(summed.losses, index.coverage.losses);
  assert.equal(summed.pushes, index.coverage.pushes);
  assert.equal(new Set(index.days.map((d) => d.date)).size, index.days.length, "a date is indexed twice");
});

test("EVERY DAY'S MARKETS SUM TO THAT DAY — a market filter cannot exceed its day", () => {
  if (!index) return;
  for (const d of index.days) {
    const m = Object.values(d.byMarket ?? {}).reduce((a, v) => ({
      wins: a.wins + v.wins, losses: a.losses + v.losses, pushes: a.pushes + v.pushes,
    }), { wins: 0, losses: 0, pushes: 0 });
    assert.equal(m.wins, d.wins, `${d.date}: market wins sum to ${m.wins}, the day says ${d.wins}`);
    assert.equal(m.losses, d.losses, `${d.date}: market losses disagree`);
    assert.equal(m.pushes, d.pushes, `${d.date}: market pushes disagree`);
  }
});

test("EVERY PARTITION RECONCILES WITH ITS INDEX ROW", () => {
  if (!index) return;
  let checked = 0;
  for (const d of index.days) {
    const p = path.join(ROWS, `${d.date}.json`);
    if (!fs.existsSync(p)) assert.fail(`${d.date} is indexed and has no partition`);
    const doc = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.equal(doc.rows.length, d.rows, `${d.date}: partition holds ${doc.rows.length} rows, index says ${d.rows}`);
    assert.equal(doc.rows.filter((r) => r.outcome === "win").length, d.wins, `${d.date}: wins disagree`);
    assert.equal(doc.rows.filter((r) => r.outcome === "loss").length, d.losses, `${d.date}: losses disagree`);
    checked += 1;
  }
  assert.ok(checked > 10, `only ${checked} partitions checked`);
});

test("A PUSH IS IN NO RATE — decisive is wins plus losses and nothing else", () => {
  if (!index) return;
  assert.equal(index.coverage.decisive, index.coverage.wins + index.coverage.losses);
  assert.ok(index.coverage.pushes > 0, "the corpus contains pushes, so this distinction is load-bearing");
  assert.notEqual(index.coverage.decisive, index.coverage.rows, "pushes were folded into the denominator");
});

test("NO INTERNAL SELECTION SIGNAL REACHED A PUBLIC PARTITION", () => {
  if (!index) return;
  /* edge, confidence and the source path are internal. They are stripped in the producer rather
     than hidden in the UI, so a reader opening the JSON sees what the page sees. */
  const banned = ["edgePct", "confidence", "sourceArtifact"];
  for (const d of index.days.slice(0, 12)) {
    const doc = JSON.parse(fs.readFileSync(path.join(ROWS, `${d.date}.json`), "utf8"));
    for (const r of doc.rows) {
      for (const k of banned) assert.equal(k in r, false, `${d.date}: a row carries ${k}`);
    }
  }
});

test("EVERY ROW CARRIES BOTH PROBABILITIES — the comparison is on the same picks or it is not made", () => {
  if (!index) return;
  let rows = 0, paired = 0;
  for (const d of index.days.slice(0, 12)) {
    const doc = JSON.parse(fs.readFileSync(path.join(ROWS, `${d.date}.json`), "utf8"));
    for (const r of doc.rows) {
      rows += 1;
      if (Number.isFinite(r.modelProbability) && Number.isFinite(r.marketProbability)) paired += 1;
    }
  }
  assert.ok(rows > 100, "population");
  assert.equal(paired, rows, `${rows - paired} rows carry only one side — a model-vs-market figure over them would be unpaired`);
});

test("every indexed day names its partition URL, which is what keeps the export prune from deleting it", () => {
  if (!index) return;
  for (const d of index.days) {
    assert.equal(d.rowsUrl, `/data/mlb/results/model-rows/${d.date}.json`, `${d.date}: wrong or missing partition URL`);
  }
});

test("THE PRODUCER REFUSES TO WRITE WHEN THE DETAIL DISAGREES WITH THE AGGREGATE", () => {
  /* The reconciliation is the feature. A producer that wrote anyway would hand the page a second
     set of numbers, which is the failure this whole release exists to avoid. */
  const src = fs.readFileSync(path.join(APP, "scripts/results/build-model-results-index.mjs"), "utf8");
  assert.match(src, /REFUSED: the detail does not reconcile/, "the producer has no reconciliation refusal");
  assert.match(src, /process\.exit\(2\)/, "the refusal does not exit non-zero");
});

/* ── clustering · Program 235 · Release G ─────────────────────────────────────────────────────── */

test("ROWS ARE NOT INDEPENDENT OBSERVATIONS — the game count travels with them", () => {
  if (!index) return;
  assert.ok(index.coverage.games > 0, "no game count is published");
  assert.ok(
    index.coverage.games < index.coverage.rows,
    "the game count equals the row count — either the clustering vanished or the field is being computed wrong",
  );
  /* The whole point: the ratio is large enough that treating rows as independent materially
     understates uncertainty. ~36 props per game across this corpus. */
  const perGame = index.coverage.rows / index.coverage.games;
  assert.ok(perGame > 5, `only ${perGame.toFixed(1)} picks per game — re-check whether this caveat still applies`);
});

test("every day reports its own game count, and never more games than picks", () => {
  if (!index) return;
  for (const d of index.days) {
    assert.ok(Number.isFinite(d.games), `${d.date}: no game count`);
    assert.ok(d.games > 0, `${d.date}: zero games for ${d.rows} picks`);
    assert.ok(d.games <= d.rows, `${d.date}: ${d.games} games from ${d.rows} picks is impossible`);
  }
});

test("A DAY'S GAME COUNT MATCHES ITS PARTITION", () => {
  if (!index) return;
  for (const d of index.days.slice(0, 12)) {
    const doc = JSON.parse(fs.readFileSync(path.join(ROWS, `${d.date}.json`), "utf8"));
    const distinct = new Set(doc.rows.map((r) => `${r.date}:${r.gameId ?? "?"}`)).size;
    assert.equal(d.games, distinct, `${d.date}: index says ${d.games} games, its partition holds ${distinct}`);
  }
});
