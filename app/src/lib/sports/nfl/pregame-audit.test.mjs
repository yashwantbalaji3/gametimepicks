/**
 * Release A guards (Program 180): the Aug-13 audit is IMMUTABLE, complete, and cannot flatter itself.
 *
 * A retrospective is only worth anything if it could have come out badly. These tests hold the three
 * properties that make that true: the forecast of record is chosen by timestamp rather than by
 * score, every scheduled game stays in the denominator whether or not it had an artifact, and
 * nothing was refit on the six outcomes being reported.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const audit = read("data/internal/nfl/pregame-audit/2026-08-13.json");
const publicSummary = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/pregame-audit-latest.json"), "utf8"));
const src = fs.readFileSync(path.join(APP, "scripts/nfl/audit-nfl-pregame-vs-final.mjs"), "utf8");

/** The official finals, as the charter supplied them. The audit must agree with these exactly. */
const OFFICIAL = {
  "DET @ CIN": { away: 14, home: 16 },
  "GB @ PIT": { away: 9, home: 28 },
  "IND @ NE": { away: 13, home: 13 },
  "LAC @ HOU": { away: 27, home: 7 },
  "ARI @ LV": { away: 27, home: 14 },
  "TEN @ SF": { away: 19, home: 13 },
};

test("EXACTLY the six ET-date games, each reconciled against the official final", () => {
  assert.equal(audit.rows.length, 6);
  assert.equal(audit.accounting.officialFinals, 6);
  assert.equal(audit.accounting.reconciles, true);
  assert.equal(audit.accounting.everyRowConsumedOnce, true);
  for (const r of audit.rows) {
    const o = OFFICIAL[r.matchup];
    assert.ok(o, `${r.matchup} is not one of the six Aug-13 ET games`);
    assert.equal(r.actual.away, o.away, `${r.matchup} away score`);
    assert.equal(r.actual.home, o.home, `${r.matchup} home score`);
  }
  assert.equal(new Set(audit.rows.map((r) => r.matchup)).size, 6);
});

test("A MISSING ARTIFACT STAYS IN THE DENOMINATOR — silent exclusion is what makes retrospectives flattering", () => {
  assert.match(src, /MISSING_PRE_EVENT_ARTIFACT/);
  assert.match(src, /Silent exclusion is the failure mode that makes every retrospective flattering/);
  assert.equal(audit.rows.length + audit.missing.length, audit.accounting.officialFinals);
});

test("THE FORECAST OF RECORD IS CHOSEN BY TIMESTAMP, never by which one scored best", () => {
  assert.match(src, /latest revision generated strictly before kickoff, chosen by/i);
  assert.match(src, /Never the best-looking one/);
  // every scored row used a pre-kickoff receipt, and says how many existed
  for (const r of audit.rows) {
    assert.ok(Date.parse(r.frozen.generatedAt) < Date.parse(r.kickoffUtc), `${r.matchup}: the graded artifact predates its own kickoff`);
    assert.ok(r.frozen.revisionsBeforeKickoff >= 1);
    assert.ok(r.frozen.file, "the exact file graded is named, so the choice is auditable");
  }
});

test("THE AUDIT CANNOT REWRITE WHAT IT SCORES", () => {
  // it never writes into the receipt tree
  assert.ok(!/writeFileSync\([^)]*forecast-receipts/.test(src), "the audit must never write a forecast receipt");
  assert.match(src, /it only READS receipts, never writes to `forecast-receipts\/`/);
  // and re-running with a different verdict for the same slate refuses
  assert.match(src, /REFUSED: \$\{ET_DATE\} is already audited with different results — history is not rewritten/);
  assert.match(audit.immutability, /never writes to forecast-receipts/);
  assert.match(audit.didNotRefit, /No model was fitted, tuned or promoted from these outcomes/);
});

test("A TIE IS NOT A LOSS — and the denominator says so", () => {
  const tieRow = audit.rows.find((r) => r.actual.tie);
  assert.ok(tieRow, "IND @ NE finished 13-13");
  assert.equal(tieRow.scores.winnerCorrect, null, "winner correctness is undefined on a tie, not false");
  assert.equal(tieRow.scores.brier, null);
  assert.equal(audit.cohort.decisiveN, audit.cohort.n - audit.cohort.ties);
  assert.equal(audit.cohort.ties, 1);
});

test("BASELINE ROWS ARE SCORED AS BASELINE DIAGNOSTICS, not retroactively promoted to picks", () => {
  assert.equal(audit.cohort.baselineOnlyRows, audit.cohort.n, "every Aug-13 forecast came from the shared prior");
  for (const r of audit.rows) {
    assert.equal(r.frozen.readiness, "BASELINE_ONLY");
    assert.ok(r.attribution.some((a) => a.startsWith("SHARED_PRIOR")));
    assert.equal(r.products.selected, false, "no product selected anything — an experimental forecast may never be a leg");
  }
  assert.match(publicSummary.whatThisIs, /baseline/i);
});

test("THE RESULT IS REPORTED HONESTLY — worse than the market, with its denominator", () => {
  assert.equal(audit.cohort.modelBeatsMarketBrier, false);
  assert.ok(audit.cohort.modelBrier > audit.cohort.marketBrier);
  assert.match(publicSummary.versusSportsbooks, /WORSE than the sportsbook consensus/);
  assert.match(publicSummary.honestLimit, /says almost nothing about a model/);
  // n is present everywhere a rate is
  assert.equal(publicSummary.n, 6);
  assert.ok(publicSummary.decisiveGames < publicSummary.n, "the tie is visible in the denominator");
});

test("THE DIAGNOSTIC THAT MATTERS · totals were calibrated, margins were not", () => {
  // This is the finding the possession engine has to fix, so it is pinned rather than left in prose.
  assert.equal(audit.cohort.totalInterval80Coverage, 1, "every total landed inside the 80% interval");
  assert.ok(audit.cohort.marginInterval80Coverage < 0.8, "the margin interval missed its target");
  const blowouts = audit.rows.filter((r) => !r.scores.marginInInterval80);
  assert.ok(blowouts.length >= 1);
  for (const b of blowouts) {
    assert.ok(Math.abs(b.actual.margin) >= 19, `${b.matchup}: the interval misses are blowouts — a shared prior cannot produce one`);
    assert.ok(b.attribution.some((a) => a.startsWith("INTERVAL_MISS_MARGIN")));
  }
});

test("RESIDUALS BECOME TICKETS, NOT WEIGHTS", () => {
  assert.ok(audit.tickets.length >= 3);
  for (const t of audit.tickets) {
    assert.ok(t.hypothesis && t.evidence && t.acceptanceTest && t.owner && t.candidateRelease, `${t.id} is fully specified`);
    assert.ok(!/tune|refit on these|adjust the weight/i.test(t.acceptanceTest), `${t.id}: acceptance may not be "tune it"`);
  }
  const ids = audit.tickets.map((t) => t.id);
  assert.ok(ids.includes("INTERVAL-WIDTH-MARGIN"));
  assert.ok(ids.includes("MARKET-GAP"));
  assert.ok(ids.includes("NO-EVENT-SPECIFIC-SIGNAL"));
  // and the interval ticket explicitly refuses to be fixed by turning a knob today
  const iv = audit.tickets.find((t) => t.id === "INTERVAL-WIDTH-MARGIN");
  assert.match(iv.candidateRelease, /not a knob to turn now/);
});

test("PUBLIC BOUNDARY · the reader summary carries no research payload", () => {
  const blob = JSON.stringify(publicSummary);
  for (const leak of ["inputHash", "data/internal", "PRIVATE_RESEARCH", "muTotal", "marginSlope", "tickets", "attribution"]) {
    assert.ok(!blob.includes(leak), `the public summary must not carry "${leak}"`);
  }
  assert.equal(publicSummary.dataClass, "PUBLIC_DERIVED");
  for (const banned of ["edge", "lock", "guaranteed", "profitable"]) {
    assert.doesNotMatch(blob, new RegExp(`\\b${banned}\\b`, "i"));
  }
});

test("the console reads the NEWEST audit, never a pinned date", () => {
  const table = fs.readFileSync(path.join(APP, "src/app/ops/nfl-event-table.tsx"), "utf8");
  assert.match(table, /function newestAuditPath\(\)/);
  const code = table.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.deepEqual(code.match(/\b20\d\d-\d\d-\d\d\b/g) ?? [], [], "the console must not pin an audit date");
});
