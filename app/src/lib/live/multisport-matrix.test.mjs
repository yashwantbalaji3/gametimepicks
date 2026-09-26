import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildMultisportMatrix } from "./multisport-matrix.mjs";

/*
 * ⚠ IMPORTED, NOT SPAWNED. The first cut shelled out to `npx tsx <script> --json` and parsed the
 * output. Two things went wrong and both were artefacts of the harness rather than the code: npx
 * truncated a 9,434-byte document at 8,130 bytes so `JSON.parse` threw "Unterminated string", and
 * `node_modules/.bin/tsx` does not exist — tsx is fetched per invocation. The rules moved into a
 * module and the CLI became a printer, which is the split `lifecycle-trace.mjs` already uses.
 */
const APP = process.cwd();
const M = buildMultisportMatrix({ date: "2026-09-27" });

test("the matrix runs and emits parseable rows for every sport", () => {
  assert.equal(M.artifact, "multisport-live-matrix");
  assert.ok(M.rows.length >= 10, `expected a populated matrix, got ${M.rows.length} rows`);
  for (const sport of ["NFL", "MLB", "UFC", "EPL"]) {
    assert.ok(M.rows.some((r) => r.sport === sport), `${sport} is missing from the matrix`);
  }
});

test("§3 · a DEMOTED market can NEVER be reported live-trackable", () => {
  /*
   * ⚠ THE RULE THIS FILE EXISTS FOR. Today's MLB board is the best live substrate in the product —
   * gamePk on 569 of 569 leans, a StatsAPI player id on 526, a complete frozen market on every row
   * and a model probability on 523. All four of its markets lose to the market on Brier AND log
   * loss across 18,659 settled leans. Engineering readiness is not product eligibility, and the
   * moment those two columns are allowed to merge, a demoted model ships as a validated forecast.
   */
  const demoted = M.rows.filter((r) => r.modelState === "DEMOTE_TO_MARKET_CONTEXT");
  assert.ok(demoted.length >= 4, `expected the four demoted MLB markets, found ${demoted.length}`);
  for (const r of demoted) {
    assert.equal(r.trackable, false, `${r.sport} ${r.family} is DEMOTED and was reported trackable`);
    assert.equal(r.eligible, false, `${r.sport} ${r.family} is DEMOTED and was reported eligible`);
    assert.match(r.trackableReason ?? "", /DEMOTE|demoted/, "the refusal must name the reason");
  }
});

test("a family that is not PUBLISHED on EVERY board of the slate is not eligible", () => {
  /*
   * ⚠ AND THE FIRST CUT SAMPLED ONE BOARD OUT OF FOURTEEN. `readdirSync` handed back a board from
   * an older week, and the matrix reported `player_rush_yds` as ESTIMATE with no frozen market
   * while all fourteen of the slate's boards publish it with a real DraftKings line. An audit that
   * silently samples one artifact is a coin toss with a table around it.
   */
  const nfl = M.rows.filter((r) => r.sport === "NFL");
  assert.ok(nfl.length >= 4);
  for (const r of nfl) {
    if (!r.eligible) assert.match(r.eligibleReason ?? "", /published on \d+ of \d+|state is/,
      `${r.family} must say how many boards published it`);
    // The slate size must be stated, so a one-board sample is visible on its face.
    assert.match(r.identity ?? "", /\d+ boards on slate \d{4}-\d{2}-\d{2}/);
  }
  const boardCounts = new Set(nfl.map((r) => (r.identity.match(/(\d+) boards/) ?? [])[1]));
  assert.equal(boardCounts.size, 1, "every NFL row must be measured over the same slate");
  assert.notEqual([...boardCounts][0], "1", "a single-board NFL audit is the defect, not a result");
});

test("§7 · the three live-measurable NFL families are trackable and anytime_td is not", () => {
  const byFamily = Object.fromEntries(M.rows.filter((r) => r.sport === "NFL").map((r) => [r.family, r]));
  for (const f of ["player_rush_yds", "player_reception_yds", "player_receptions"]) {
    assert.equal(byFamily[f]?.trackable, true, `${f} should be live-trackable`);
  }
  const td = byFamily.anytime_td;
  assert.equal(td.eligible, true, "anytime_td is a published, validated prediction");
  assert.equal(td.trackable, false, "and it is not live-measurable");
  assert.match(td.trackableReason, /scorer by id|prose/);
});

test("§9 · UFC winner is trackable; method is refused for a stated reason", () => {
  const ufc = Object.fromEntries(M.rows.filter((r) => r.sport === "UFC").map((r) => [r.family, r]));
  assert.equal(ufc.winner?.trackable, true);
  assert.equal(ufc.method?.trackable, false);
  assert.match(ufc.method?.trackableReason ?? "", /no KO\/SUB\/DEC|name-matching/);
  // Nothing may claim a settlement owner it does not have.
  assert.equal(ufc.method?.settlementOwner, null);
});

test("§10 · EPL is architecture-only and says so rather than showing fabricated parity", () => {
  const epl = M.rows.filter((r) => r.sport === "EPL");
  assert.ok(epl.length >= 1);
  for (const r of epl) {
    assert.equal(r.trackable, false);
    assert.equal(r.eligible, false);
  }
});

test("the matrix is READ-ONLY — it may not write or call a provider", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/live/multisport-matrix.mjs"), "utf8");
  assert.equal(/writeFileSync|mkdirSync|appendFileSync/.test(src), false, "an audit that writes is not read-only");
  assert.equal(/\bfetch\(/.test(src), false, "an audit that refetches can make a record agree with the present");
});
