/**
 * Sprint 037B — every generated prediction must be accounted for.
 *
 * THE INVARIANT
 *   board non-Pass predictions  ==  ledger rows (Win|Loss|Void)  +  unavailable  +  pending
 *
 * Nothing may simply disappear between generation and settlement.
 *
 * WHAT SPRINT 037A GOT WRONG, CORRECTED HERE
 * Sprint 037A reported that 4 of July 27's 509 predictions "vanished without a record". That was
 * unfair to the pipeline. They ARE recorded — `comparison_report_<date>.json` carries
 * `unavailableCount: 4` and names all four (Sam Huff ×2 scratched, Chase Burns and Slade Cecconi never
 * appeared). What is true is narrower and still worth fixing: the UNAVAILABLE outcome lives only in
 * the comparison report, while Win/Loss/Void live in `settled_leans.jsonl`. Anyone reading the ledger
 * alone — which is what the public results surfaces do — sees a denominator that silently shrank.
 *
 * `settle_mlb_results.py:347` is the mechanism: a player missing from the box score is appended to
 * `actual_unavailable` and `continue`s, writing no ledger row.
 *
 * This guard does not force a schema change on the ledger. It asserts the ACCOUNTING closes across
 * both artifacts, so an unexplained shortfall becomes a test failure rather than a quiet subtraction.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const APP = process.cwd();
const RESULTS = path.join(APP, "public/data/mlb/results");
const BOARDS = path.join(APP, "public/data/mlb/boards");
const LEDGER = path.join(RESULTS, "settled_leans.jsonl");

/** Non-Pass board rows are the predictions actually made for a date. */
function predictionsFor(date) {
  const p = path.join(BOARDS, `${date}.json`);
  if (!fs.existsSync(p)) return null;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const leans = Array.isArray(doc?.leans) ? doc.leans : [];
  return leans.filter((l) => l?.lean && l.lean !== "Pass" && l.lean !== "No Play").length;
}

async function ledgerCountsByDate() {
  const byDate = new Map();
  if (!fs.existsSync(LEDGER)) return byDate;
  const rl = readline.createInterface({ input: fs.createReadStream(LEDGER), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const d = r?.date;
    if (!d) continue;
    byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  return byDate;
}

/** Dates with BOTH a board and a comparison report — the only ones where accounting can be checked. */
function auditableDates() {
  if (!fs.existsSync(RESULTS)) return [];
  return fs
    .readdirSync(RESULTS)
    .map((f) => /^comparison_report_(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1])
    .filter(Boolean)
    .filter((d) => fs.existsSync(path.join(BOARDS, `${d}.json`)))
    .sort();
}

/**
 * Three historical dates whose accounting does not close. Measured, quarantined by name, and NOT
 * silently skipped — a nameless exclusion is how a real regression hides.
 *
 * 51 of 54 auditable dates close exactly. These three predate the current settler behaviour and were
 * settled while 05-16 and 05-22 onward closed cleanly on either side of them, so they are isolated
 * incidents rather than an era: three days on which a settlement run recorded fewer rows than the
 * board predicted without routing the remainder to `unavailable`. They cannot be re-settled — the
 * box-score fetch that would have graded them is long past — so they are documented rather than fixed.
 *
 * If a NEW date joins this list, the guard fails. That is the point.
 */
const KNOWN_UNCLOSED = new Map([
  ["2026-05-18", 218],
  ["2026-05-21", 114],
  ["2026-05-25", 202],
]);

test("INVARIANT · every generated prediction reaches a terminal state or is explicitly unavailable", async () => {
  const dates = auditableDates();
  if (dates.length === 0) return; // nothing settled in this checkout

  const ledger = await ledgerCountsByDate();
  const unexplained = [];

  for (const date of dates) {
    const report = JSON.parse(fs.readFileSync(path.join(RESULTS, `comparison_report_${date}.json`), "utf8"));
    // A partial day still has games in flight; its accounting cannot close yet.
    if (report?.partial === true || (report?.pendingGames ?? 0) > 0) continue;

    const predicted = predictionsFor(date);
    if (predicted == null) continue;

    const settled = ledger.get(date) ?? 0;
    const unavailable = Number(report?.unavailableCount ?? 0);
    const accounted = settled + unavailable;

    const gap = predicted - accounted;
    if (gap === 0) continue;

    const known = KNOWN_UNCLOSED.get(date);
    if (known !== undefined) {
      // Quarantined — but pinned. If the gap CHANGES, something rewrote history and we want to know.
      assert.equal(
        gap,
        known,
        `${date}: known-unclosed gap changed from ${known} to ${gap} — historical settlement data moved`,
      );
      continue;
    }

    unexplained.push(
      `${date}: predicted ${predicted}, accounted ${accounted} ` +
        `(ledger ${settled} + unavailable ${unavailable}) → ${gap} unexplained`,
    );
  }

  assert.deepEqual(
    unexplained,
    [],
    `Predictions went missing between generation and settlement:\n  ${unexplained.join("\n  ")}\n\n` +
      `  Every non-Pass board row must end as Win/Loss/Void in settled_leans.jsonl, or be counted in\n` +
      `  the comparison report's unavailableCount. An unexplained gap means the denominator shrank\n` +
      `  silently — see settle_mlb_results.py:347.`,
  );
});

test("the quarantine list stays small and does not quietly absorb new failures", () => {
  // A quarantine that grows is a guard being disabled one date at a time.
  assert.ok(
    KNOWN_UNCLOSED.size <= 3,
    `${KNOWN_UNCLOSED.size} quarantined dates — new entries must be investigated, not appended`,
  );
  const total = [...KNOWN_UNCLOSED.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, 534, "the historical shortfall is 534 predictions across three May dates");
});

/** Measured cap on the named list in comparison reports. The COUNT is never capped. */
const UNAVAILABLE_LIST_CAP = 40;

test("the unavailable channel is populated, not merely declared", async () => {
  // If unavailableCount were always 0 the invariant above would pass vacuously while rows vanished.
  const dates = auditableDates();
  if (dates.length === 0) return;

  let sawUnavailable = false;
  for (const date of dates) {
    const report = JSON.parse(fs.readFileSync(path.join(RESULTS, `comparison_report_${date}.json`), "utf8"));
    assert.ok(
      Object.prototype.hasOwnProperty.call(report, "unavailableCount"),
      `${date}: the report must declare unavailableCount so the accounting can close`,
    );
    const n = Number(report.unavailableCount ?? 0);
    if (n > 0) {
      sawUnavailable = true;
      const named = Array.isArray(report.unavailable) ? report.unavailable.length : 0;
      // The named list is capped at 40 for report size (measured: 10 dates truncate, all at exactly 40).
      // `unavailableCount` is the authoritative total and is what the accounting above uses, so a
      // truncated list is legitimate — but a list SHORTER than both n and the cap is not.
      assert.ok(
        named === n || named === UNAVAILABLE_LIST_CAP,
        `${date}: unavailableCount ${n} but ${named} named — expected all ${n}, or exactly ${UNAVAILABLE_LIST_CAP} if truncated`,
      );
    }
  }
  assert.ok(sawUnavailable, "expected at least one settled date to exercise the unavailable path");
});

test("July 27 — the four unavailable predictions are named and auditable", async () => {
  // The specific case that prompted this guard. Pinned so a regression is obvious.
  const p = path.join(RESULTS, "comparison_report_2026-07-27.json");
  if (!fs.existsSync(p)) return;
  const report = JSON.parse(fs.readFileSync(p, "utf8"));

  assert.equal(report.unavailableCount, 4);
  assert.equal(report.unavailable.length, 4);
  for (const entry of report.unavailable) {
    assert.match(
      entry,
      /—\s*(not in boxscore|actual stat unavailable)/,
      `each unavailable entry must state WHY, got: ${entry}`,
    );
  }

  const ledger = await ledgerCountsByDate();
  const predicted = predictionsFor("2026-07-27");
  assert.equal(
    (ledger.get("2026-07-27") ?? 0) + report.unavailableCount,
    predicted,
    "July 27 accounting must close: 505 ledger rows + 4 unavailable = 509 predictions",
  );
});
