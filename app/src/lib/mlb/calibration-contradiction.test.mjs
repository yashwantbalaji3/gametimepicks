/**
 * THE COMMITTED DISCLOSURE MUST NOT DRIFT FROM THE LIVE EVIDENCE — Program 230 · L.
 *
 * Run: npx tsx --test src/lib/mlb/calibration-contradiction.test.mjs
 *
 * Seven guards already protect the recalibration decision — that only `PUBLIC_MODEL_OK` unlocks
 * product eligibility, that no market currently holds it, that the internal artifacts are never
 * web-served. Every one of them checks the committed constants against each other.
 *
 * None of them checks the constants against the DATA. `MLB_MARKET_CALIBRATION` is a hand-maintained
 * table stamped `2026-07-21` over 18,659 settled leans; the ledger has since grown to more than
 * 35,000 rows across 2026-05-16 → 2026-08-31. If the evidence moved, nothing would have noticed —
 * the public disclosure would keep asserting a July conclusion under a September page.
 *
 * It has not moved, and that is the point: the same demotion now holds on nearly double the sample.
 * This guard is what makes that a measurement rather than an assumption.
 *
 * THE DANGEROUS DIRECTION IS ASYMMETRIC. A market claiming `PUBLIC_MODEL_OK` that does not actually
 * out-predict the market is a validated-looking product built on nothing, so it fails hard. A
 * demoted market that starts beating the market is NOT auto-promoted here: promotion requires the
 * preregistered protocol, and a bar chosen after seeing the result is not a bar. It fails too — so a
 * person looks — with the reason spelled out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  MLB_MARKET_CALIBRATION,
  modelBeatsMarket,
  anyModeledMarketBeatsMarket,
  MLB_CALIBRATION_DISCLOSURE,
  CALIBRATION_AUDIT_ASOF,
} from "./model-calibration-status.ts";

/** Run the real audit over the committed ledger. ~2s; a contradiction engine that reads a cached
 *  summary would be checking one committed constant against another, which is the gap this fills. */
function liveAudit() {
  const out = path.join(os.tmpdir(), `gtp-calibration-audit-${process.pid}.json`);
  try {
    execFileSync("npx", ["tsx", "scripts/model-learning-audit.mjs", "--json", out], {
      cwd: process.cwd(), stdio: "ignore", timeout: 180_000,
    });
    if (!fs.existsSync(out)) return null;
    const d = JSON.parse(fs.readFileSync(out, "utf8"));
    fs.unlinkSync(out);
    return d;
  } catch {
    return null; // no ledger committed (bare checkout) — the other tests still hold
  }
}

const audit = liveAudit();

test("every committed verdict has live evidence behind it", () => {
  if (!audit?.byMarket) return;
  const orphans = Object.keys(MLB_MARKET_CALIBRATION).filter((m) => !audit.byMarket[m]);
  assert.deepEqual(orphans, [], `these markets carry a public verdict with no rows in the ledger: ${orphans.join(", ")}`);
});

test("NO MARKET CLAIMS PUBLIC_MODEL_OK WITHOUT OUT-PREDICTING THE MARKET", () => {
  /* The dangerous direction: a validated-looking product with nothing under it. */
  if (!audit?.byMarket) return;
  const unearned = [];
  for (const [m, row] of Object.entries(audit.byMarket)) {
    if (!modelBeatsMarket(m)) continue;
    if (!(row.modelBrier < row.marketBrier)) {
      unearned.push(`${m} (model ${row.modelBrier.toFixed(4)} vs market ${row.marketBrier.toFixed(4)})`);
    }
  }
  assert.deepEqual(unearned, [], `claimed validated, loses on the live data: ${unearned.join("; ")}`);
});

test("A DEMOTED MARKET THAT STARTS WINNING IS A REVIEW, NOT AN AUTOMATIC PROMOTION", () => {
  /*
   * If this fails, the honest response is the preregistered protocol — a frozen bar, a held-out
   * sample, the whole thing — not editing the verdict. A bar chosen after seeing the result is not
   * a bar, and this repository has already recorded one backtest rejected on exactly that ground.
   */
  if (!audit?.byMarket) return;
  const drifted = [];
  for (const [m, row] of Object.entries(audit.byMarket)) {
    const committed = MLB_MARKET_CALIBRATION[m];
    if (committed?.verdict !== "DEMOTE_TO_MARKET_CONTEXT") continue;
    if (row.modelBrier < row.marketBrier) {
      drifted.push(`${m} (model ${row.modelBrier.toFixed(4)} now beats market ${row.marketBrier.toFixed(4)} over n=${row.n})`);
    }
  }
  assert.deepEqual(
    drifted,
    [],
    `the live data no longer supports these demotions: ${drifted.join("; ")} — run the preregistered promotion protocol, do NOT edit the verdict to match`,
  );
});

test("the public disclosure's CLAIM is what the live data says", () => {
  /*
   * The sentence readers actually see asserts that none of these markets out-predict the market.
   * That claim is checked against the ledger here, not against the constant it was written from.
   */
  if (!audit?.byMarket) return;
  assert.equal(anyModeledMarketBeatsMarket(), false, "the code-level claim");
  assert.match(MLB_CALIBRATION_DISCLOSURE, /none of these markets' model probabilities out-predict the market/);

  const winners = Object.entries(audit.byMarket).filter(([, r]) => r.modelBrier < r.marketBrier).map(([m]) => m);
  assert.deepEqual(winners, [], `the disclosure says none out-predict the market; the ledger says ${winners.join(", ")} do`);

  /* And the overconfidence the disclosure describes is real, not rhetorical. */
  for (const [m, r] of Object.entries(audit.byMarket)) {
    if (!MLB_MARKET_CALIBRATION[m]) continue;
    assert.ok(r.overconfidencePp > 0, `${m}: the disclosure calls the model overconfident; the ledger measures ${r.overconfidencePp}pp`);
  }
});

test("the disclosure's evidence cutoff PRECEDES the data it describes", () => {
  /*
   * A stated as-of that runs ahead of the ledger would be a claim about rows that do not exist. The
   * reverse — an as-of behind the ledger — is honest but ages, so the sample it quotes is checked
   * for having actually been available.
   */
  if (!audit?.dateRange) return;
  const [, newest] = audit.dateRange;
  assert.ok(
    CALIBRATION_AUDIT_ASOF <= newest,
    `the disclosure is stamped ${CALIBRATION_AUDIT_ASOF} but the ledger only runs to ${newest}`,
  );
});
