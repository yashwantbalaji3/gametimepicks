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
function lanes() {
  const t = text();
  const out = [];
  for (const label of ["Lane A", "Lane B"]) {
    const i = t.indexOf(`${label} Active`);
    if (i < 0) continue;
    out.push({ label, seg: t.slice(i, i + 1400) });
  }
  return out;
}

test("BUILT · a lane never stakes the seed on a rung it did not enter at the seed", () => {
  if (!hasBuild) return;
  for (const { label, seg } of lanes()) {
    const here = /(?:✓ )?\$([\d,]+) You are here Step (\d) · from \$([\d,]+)/.exec(seg)
      ?? /Step (\d) · from \$([\d,]+)/.exec(seg);
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
