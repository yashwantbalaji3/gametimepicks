/**
 * BUILT · the ladder a reader actually sees must obey the ladder's own rule.
 *
 * The unit guards beside this prove the arithmetic. They could not have caught what shipped, because
 * nothing was wrong with the arithmetic — the stake came from one place, the price from a second and
 * the ladder's projection from a third, and each was internally consistent. Only the rendered page
 * put them side by side, where "Step 2 · from $200" sat next to "$100.00 Stake" and, at one point in
 * the fix, next to a $928 return on a +207 card.
 *
 * So this reads the built page. Every number checked here is one a reader can see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { decimalFromAmerican } from "./rung-economics.mjs";

const OUT = path.join(process.cwd(), "out");
const PAGE = path.join(OUT, "bank-builder", "index.html");
const hasBuild = fs.existsSync(PAGE);

const text = () =>
  fs.readFileSync(PAGE, "utf8")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/[\u2018\u2019]/g, "'")   // the page renders a real curly apostrophe, not an entity
    .replace(/&amp;/g, "&").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

const money = (s) => Number(String(s).replace(/[$,]/g, ""));

/** Each lane's rendered block. */
/*
 * A LANE ENDS WHERE THE NEXT LANE BEGINS — not 1,400 characters later (P294).
 *
 * This sliced a fixed 1,400-character window from each lane's heading. That held only while a lane's
 * rendered block stayed under that length. On 2026-09-13 Lane A was carrying two legs with full
 * matchup lines and kickoff times, so its window ran past its own rungs and into Lane B's — and Lane
 * B was standing on step 1, so its "Upcoming Step 2" was read as an unfinished rung beneath Lane A's
 * active step 3. The page was correct throughout:
 *
 *     Lane A   Upcoming 5 · Upcoming 4 · You are here 3 · Cleared 2 · Cleared 1
 *     Lane B   Upcoming 5 · Upcoming 4 · Upcoming 3 · Upcoming 2 · You are here 1
 *
 * A false failure on a money surface is expensive in a way a false pass is not: it trains a reader of
 * the gate to discount it, and the next real ladder defect arrives looking identical to this one.
 * The boundary is structural, so it is read structurally.
 */
function lanes() {
  const t = text();
  const LABELS = ["Lane A", "Lane B"];
  const starts = LABELS
    .map((label) => ({ label, i: t.indexOf(`${label} Active`) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  return starts.map((x, n) => ({
    label: x.label,
    /* To the next lane's heading, or to the end of the ladder's own block. */
    seg: t.slice(x.i, n + 1 < starts.length ? starts[n + 1].i : x.i + 1400),
  }));
}

test("BUILT · a lane never stakes the seed on a rung it did not enter at the seed", () => {
  if (!hasBuild) return;
  for (const { label, seg } of lanes()) {
    /* P257: amounts may carry cents — since P255 a won step carries its REAL payout into the next rung
       ($307.93, not the template's $200), and the rung prints what the lane actually entered with. */
    const here = /(?:✓ )?\$([\d,]+) You are here Step (\d) · from \$([\d,]+(?:\.\d\d)?)/.exec(seg)
      ?? /Step (\d) · from \$([\d,]+(?:\.\d\d)?)/.exec(seg);
    const stake = /\$([\d,]+\.\d\d) Stake/.exec(seg);
    if (!here || !stake) continue;
    const step = Number(here[2] ?? here[1]);
    const from = money(here[3] ?? here[2]);
    if (step <= 1) continue;
    assert.equal(
      money(stake[1]), from,
      `${label}: standing on step ${step} entered at $${from} but staking $${stake[1]} — the ladder is not compounding`,
    );
  }
});

test("BUILT · stake, price and return describe ONE bet", () => {
  if (!hasBuild) return;
  for (const { label, seg } of lanes()) {
    const stake = /\$([\d,]+\.\d\d) Stake/.exec(seg);
    const win = /Stake \$([\d,]+\.\d\d) To win/.exec(seg);
    const odds = /Combined ([+-]\d+)/.exec(seg);
    if (!stake || !win || !odds) continue;
    const expected = money(stake[1]) * decimalFromAmerican(Number(odds[1]));
    assert.ok(
      Math.abs(expected - money(win[1])) < 1.5,
      `${label}: $${stake[1]} at ${odds[1]} returns $${expected.toFixed(2)}, page says $${win[1]} — three numbers, two different bets`,
    );
  }
});

test("BUILT · no rung sits unfinished beneath the one a lane is standing on", () => {
  if (!hasBuild) return;
  for (const { label, seg } of lanes()) {
    const here = /You are here Step (\d)/.exec(seg);
    if (!here) continue;
    const step = Number(here[1]);
    for (let below = 1; below < step; below += 1) {
      assert.ok(
        !new RegExp(`Upcoming Step ${below} ·`).test(seg),
        `${label}: step ${below} renders as Upcoming beneath an active step ${step} — a rung is only reached by clearing the one below it`,
      );
    }
  }
});

test("BUILT · a card short of its rung target says so rather than printing the target alone", () => {
  if (!hasBuild) return;
  for (const { label, seg } of lanes()) {
    const win = /Stake \$([\d,]+\.\d\d) To win/.exec(seg);
    const goal = /You are here Step \d · from \$[\d,]+/.exec(seg);
    if (!win || !goal) continue;
    // Whenever a return is shown, the page must commit to whether it clears the step.
    assert.ok(
      /Clears this step's \$[\d,]+\.\d\d target|Clears at \$[\d,]+\.\d\d — \$[\d,]+\.\d\d under this step's/.test(seg),
      `${label}: shows a projected return with no statement about whether it reaches the step's target`,
    );
  }
});
