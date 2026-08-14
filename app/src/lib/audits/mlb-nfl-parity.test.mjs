/**
 * Parity guards (Program 175): the committed MLB→NFL ledger has zero unexplained gaps, NFL joins
 * SHARED owners rather than forking them, and MLB's own output is unchanged by every extension.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/audits/mlb-nfl-parity-ledger.json"), "utf8"));

test("EVERY ledger row names an owner or an explicit gap — nothing is hand-waved", () => {
  assert.ok(ledger.rows.length >= 20, `expected a full inventory, got ${ledger.rows.length}`);
  const valid = new Set(Object.keys(ledger.statusVocabulary));
  for (const r of ledger.rows) {
    assert.ok(r.capability, "every row names a capability");
    assert.ok(r.mlbOwner, `${r.capability}: the MLB owner must be named`);
    assert.ok(valid.has(r.status), `${r.capability}: status ${r.status} outside the vocabulary`);
    assert.ok(r.decision, `${r.capability}: shared-vs-adapter decision required`);
    // an unowned row must be explicitly OPEN or ADAPTER_NEEDED — never silently blank
    if (!r.nflOwner) {
      assert.ok(["OPEN", "ADAPTER_NEEDED", "NOT_APPLICABLE"].includes(r.status),
        `${r.capability}: no NFL owner, so status must be OPEN/ADAPTER_NEEDED/NOT_APPLICABLE, got ${r.status}`);
    }
  }
});

test("NOT_APPLICABLE requires a football-specific reason AND a named replacement", () => {
  const na = ledger.rows.filter((r) => r.status === "NOT_APPLICABLE");
  assert.ok(na.length > 0, "the ledger should be honest that some MLB concepts do not map");
  for (const r of na) {
    assert.ok(r.replacement && r.replacement.length > 30, `${r.capability}: NOT_APPLICABLE needs a named replacement of equal value`);
    assert.match(r.decision, /football-specific|NFL-NATIVE|as-is/i, `${r.capability}: needs a football-specific reason`);
  }
});

test("the summary reconciles with the rows and reports ZERO unexplained gaps", () => {
  const s = ledger.summary;
  assert.equal(s.totalRows, ledger.rows.length);
  const count = (st) => ledger.rows.filter((r) => r.status === st).length;
  assert.equal(s.shipped, count("SHIPPED"));
  assert.equal(s.adoptedShared, count("ADOPTED_SHARED"));
  assert.equal(s.adapterNeeded, count("ADAPTER_NEEDED"));
  assert.equal(s.notApplicableWithReplacement, count("NOT_APPLICABLE"));
  assert.equal(s.open, count("OPEN"));
  assert.equal(s.unexplainedGaps, 0);
  assert.equal(s.shipped + s.adoptedShared + s.adapterNeeded + s.notApplicableWithReplacement + s.open, s.totalRows,
    "every row lands in exactly one bucket");
  // the open count must be VISIBLE, not hidden behind a completion claim
  assert.match(ledger.honesty.join(" "), /hidden behind the word 'complete'/);
});

test("NFL joins SHARED owners — and MLB's own entries are untouched by each extension", () => {
  const coverage = fs.readFileSync(path.join(APP, "src/lib/market-coverage.ts"), "utf8");
  assert.match(coverage, /export type MarketSport = "mlb" \| "nfl" \| "soccer" \| "ufc"/, "the shared union includes nfl");
  assert.match(coverage, /key: "nfl"/, "nfl is in the shared COVERAGE_SPORTS registry");
  // MLB's registry entry is byte-identical to what it was
  assert.match(coverage, /\{ key: "mlb", label: "MLB", note: "market-anchored \+ 10k player-prop sim" \}/);
  const methodology = fs.readFileSync(path.join(APP, "src/components/sport-methodology-panel.tsx"), "utf8");
  assert.match(methodology, /type Sport = "mlb" \| "nfl" \| "soccer" \| "ufc"/);
  assert.match(methodology, /How the MLB simulation works/, "MLB copy untouched");
  assert.match(methodology, /How the NFL simulation works/);
  const matrix = fs.readFileSync(path.join(APP, "src/components/simulation-coverage-matrix.tsx"), "utf8");
  assert.match(matrix, /sport\?: "mlb" \| "nfl" \| "soccer" \| "ufc"/);
});

test("NFL coverage states are honest per market — no blanket 'supported'", () => {
  const coverage = fs.readFileSync(path.join(APP, "src/lib/market-coverage.ts"), "utf8");
  const block = coverage.slice(coverage.indexOf("export const NFL_COVERAGE"), coverage.indexOf("/** A market may enter"));
  // the model markets are experimental, never plain supported
  for (const m of ["team_score", "moneyline", "totals"]) {
    const row = block.slice(block.indexOf(`market: "${m}"`));
    assert.match(row.slice(0, 260), /status: "experimental"/, `${m} must be experimental, not supported`);
  }
  assert.match(block, /market: "player_props"[\s\S]{0,300}status: "provider_needed"/, "player props must be provider_needed");
  assert.match(block, /market: "anytime_touchdown"[\s\S]{0,300}status: "settlement_blocked"/);
  assert.match(block, /coin flip/, "the honest limit travels with the coverage row");
  assert.doesNotMatch(block, /\b(edge|lock|best bet|profitable)\b/i);
});

test("the cheapest-parity finding is recorded so a future author does not fork the page tree", () => {
  assert.match(ledger.honesty.join(" "), /not forking the \/mlb page tree/);
  // the finding lives at LEDGER level, not in a row note — a row note legitimately changes when
  // that row is closed, and the lesson must outlive the gap it describes
  assert.match(ledger.keyFinding, /900px document|1440px application shell/);
  assert.match(ledger.keyFinding, /not\s+forking the \/mlb page tree/);
  const gameRow = ledger.rows.find((r) => /Per-game deep route/.test(r.capability));
  assert.match(gameRow.note, /cheapest parity path/);
});
