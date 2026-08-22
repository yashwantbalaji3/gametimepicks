/**
 * A FINISHED MATCH NEVER BECOMES UNFINISHED.
 *
 * Run: npx tsx --test src/lib/sports/epl/results-monotonicity.test.mjs
 *
 * On 2026-08-22 at 00:12 UTC an epl-settle run overwrote a settled result with an earlier stage:
 * Arsenal 3-0 Coventry City went from STATUS_FULL_TIME back to STATUS_SECOND_HALF, and the
 * artifact's state regressed from RESULTS to NO_RESULTS_YET. The capture was a pure snapshot — it
 * wrote whatever the scoreboard said, over the top of whatever was there.
 *
 * Only the append-only ledger saved the grade. Had the regression landed BEFORE grading, the first
 * Premier League match this project ever settled would have been silently skipped and the next run
 * would have reported a quiet matchday. It is also the artifact the parlay lab's settler reads, so
 * the same regression would have turned a graded card leg back into a pending one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.join(process.cwd(), "scripts/epl/capture-epl-results.mjs"), "utf8");
const ARTIFACT = path.join(process.cwd(), "public/data/soccer/epl/results/latest.json");

/** The merge rule, mirrored from the capture so the behaviour can be exercised without a network. */
const isComplete = (r) => /^STATUS_FULL_TIME|^STATUS_FINAL/.test(r?.statusRaw ?? "") && Number.isInteger(r?.ftHome) && Number.isInteger(r?.ftAway);
function merge(prior, incoming) {
  const priorById = new Map((prior ?? []).filter(isComplete).map((r) => [r.providerEventId, r]));
  const blocked = [];
  const rows = (incoming ?? []).map((r) => {
    const p = priorById.get(r.providerEventId);
    if (p && !isComplete(r)) { blocked.push(r.providerEventId); return p; }
    return r;
  });
  return { rows, blocked };
}

const FINAL = { providerEventId: "1", dateUtc: "2026-08-21T19:00Z", home: "Arsenal", away: "Coventry City", ftHome: 3, ftAway: 0, statusRaw: "STATUS_FULL_TIME" };

test("THE INCIDENT · a completed result survives a provider reporting an earlier stage", () => {
  const { rows, blocked } = merge([FINAL], [{ ...FINAL, statusRaw: "STATUS_SECOND_HALF" }]);
  assert.equal(rows[0].statusRaw, "STATUS_FULL_TIME", "the record wins over a provider that went backwards");
  assert.equal(blocked.length, 1, "and the block is recorded, not applied in silence");
});

test("a genuine SCORE CORRECTION still lands — latest wins when both are complete", () => {
  // The corrections runbook is latest-wins, and a monotonicity rule that blocked corrections would
  // freeze a wrong score permanently. Only INCOMPLETE incoming rows are refused.
  const { rows, blocked } = merge([FINAL], [{ ...FINAL, ftHome: 2 }]);
  assert.equal(rows[0].ftHome, 2, "a corrected full-time score must be able to overwrite");
  assert.equal(blocked.length, 0);
});

test("FULL_TIME without integer goals is not complete, and cannot freeze a fixture", () => {
  // The StatsAPI lesson: a postponed match reports "final" with no score. Treating that as complete
  // would pin a null-scored row in place forever and block the real result when it arrived.
  const nullScored = { ...FINAL, ftHome: null, ftAway: null };
  const { rows } = merge([nullScored], [{ ...FINAL, statusRaw: "STATUS_SECOND_HALF" }]);
  assert.equal(rows[0].statusRaw, "STATUS_SECOND_HALF", "an unscored 'final' is not a record worth protecting");
});

test("the capture implements both protections, not just the one that bit us", () => {
  // A date-windowed scoreboard DELETES yesterday's results by doing nothing wrong at all, which is
  // the same class of loss arriving by a different route.
  assert.match(SRC, /regressionsBlocked/, "status regression must be blocked and reported");
  assert.match(SRC, /RETAIN_COMPLETED_DAYS/, "completed fixtures must survive the window rolling past them");
});

test("LIVE · the committed capture reports its protections rather than applying them silently", () => {
  if (!fs.existsSync(ARTIFACT)) return;
  const a = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
  assert.ok(Array.isArray(a.regressionsBlocked), "the artifact must publish what it refused");
  assert.equal(typeof a.retainedFromEarlierWindow, "number");
  // Every row the artifact calls complete must actually be gradeable.
  for (const r of a.rows ?? []) {
    if (/^STATUS_FULL_TIME|^STATUS_FINAL/.test(r.statusRaw ?? "")) {
      assert.ok(Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway), `${r.home} v ${r.away}: complete without integer goals`);
    }
  }
  // And the declared state must agree with the rows.
  const complete = (a.rows ?? []).filter(isComplete).length;
  if (complete > 0) assert.equal(a.state, "RESULTS", "completed rows present but the state says otherwise");
  assert.equal(a.completedCount, complete);
});
