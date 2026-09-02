/**
 * A TIER GRID MAY NOT REFUSE ON EVIDENCE OLDER THAN THE SLATE — Program 230 · G.
 *
 * Run: npx tsx --test src/lib/parlays/tier-grid-freshness.test.mjs
 *
 * `build-tier-grid.mjs` builds all five sports, and it was scheduled ONLY by `ufc-fight-week` and
 * `epl-matchweek`. So MLB's four-tier grid was evaluated on another sport's cron, and its published
 * state tracked what time that cron happened to fire rather than anything about MLB:
 *
 *     08-27  22:44Z → PUBLISHED, 16 cells        08-26  13:58Z → NOT_ELIGIBLE, 0 cells
 *     08-30  23:20Z → PUBLISHED, 16 cells        09-01  15:25Z → NOT_ELIGIBLE, 0 cells
 *
 * On 2026-09-01 it refused with "no price capture for 2026-09-01 yet … only 0 priced games" while
 * the board carried 373 priced legs across 15 games, captured at 17:50Z. The refusal was accurate
 * at 15:25 and simply never re-asked — which is the failure mode that matters here, because a stale
 * refusal is indistinguishable from a considered one. Both say "not eligible" and neither says when.
 *
 * The generator is network-free and derives from committed artifacts, so re-resolving costs nothing
 * and no credits. MLB now re-resolves in its own production workflow, after its prices land.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);

test("EVERY SPORT'S GRID IS RE-RESOLVED BY A WORKFLOW THAT OWNS THAT SPORT", () => {
  /*
   * The structural fix. A sport whose grid is only ever built by a DIFFERENT sport's workflow is
   * evaluated on a cadence that has nothing to do with its own evidence.
   */
  const wfDir = path.join(ROOT, ".github", "workflows");
  /*
   * Strip YAML comments FIRST. The step this guard requires carries a comment block explaining the
   * defect, and that block NAMES `build-tier-grid.mjs` — so a scan of the raw text matched the
   * explanation and reported the workflow as compliant after the step itself had been deleted. The
   * probe caught it: removing the step left the guard green. A guard satisfied by prose about the
   * bug is not a guard.
   */
  const stripComments = (t) => t.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "$1")).join("\n");
  const yml = fs.readdirSync(wfDir).filter((f) => f.endsWith(".yml"))
    .map((f) => ({ name: f, text: stripComments(fs.readFileSync(path.join(wfDir, f), "utf8")) }));

  const builders = yml.filter((w) => w.text.includes("build-tier-grid.mjs"));
  assert.ok(builders.length > 0, "something builds the tier grid");

  /* MLB is the platform's daily sport and the one this defect was found on: its grid must be
     re-resolved by an MLB-owned workflow, not only by UFC's and EPL's. */
  const mlbOwned = builders.some((w) => /^mlb-/.test(w.name));
  assert.ok(
    mlbOwned,
    `the MLB tier grid is only built by ${builders.map((w) => w.name).join(", ")} — none of which run on MLB's cadence`,
  );
});

test("LIVE · a grid that refuses must not be refusing on evidence the slate has already overtaken", () => {
  const grid = read(path.join(APP, "public/data/parlays/tier-grid/mlb-latest.json"));
  if (!grid) return;

  const board = read(path.join(APP, "public/data/parlays/lab-ledger.json"));
  const mlb = (board?.streams ?? []).find((s) => s.id === "mlb");
  const capturedAt = mlb?.evidence?.pricesCapturedAt;
  if (!capturedAt || !grid.generatedAt) return;

  /*
   * THE CLAIM: if the grid refused, it must have been asked at least as recently as the prices it
   * says are missing. A refusal generated BEFORE the capture it complains about is stale, not
   * considered — and the artifact carries no way for a reader to tell those apart.
   */
  if (grid.state === "NOT_ELIGIBLE" && grid.date === (mlb?.evidence?.date ?? grid.date)) {
    assert.ok(
      Date.parse(grid.generatedAt) >= Date.parse(capturedAt),
      `the MLB grid refused at ${grid.generatedAt} citing missing prices, but prices for its date were captured at ${capturedAt} — it never re-asked`,
    );
  }
});

test("LIVE · a published grid states sixteen cells, and does not pretend they are sixteen cards", () => {
  const grid = read(path.join(APP, "public/data/parlays/tier-grid/mlb-latest.json"));
  if (!grid || grid.state !== "PUBLISHED") return;

  assert.equal((grid.cells ?? []).length, 16, "four bankroll tiers by four risk bands");
  const filled = (grid.cells ?? []).filter((c) => c.card || c.slipId).length;
  /*
   * Sixteen cells are NOT sixteen distinct cards — the cards a reader sees must be leg-disjoint, so
   * the grid legitimately fills fewer. What must never happen is a cell claiming a card it does not
   * have, or the grid reporting a fill count it cannot show.
   */
  assert.ok(filled > 0, "a PUBLISHED grid has at least one real card");
  assert.ok(filled <= 16, "a cell cannot hold more than one card");
  for (const c of grid.cells ?? []) {
    if (!c.card && !c.slipId) {
      assert.ok(c.reason || c.substitute || c.state, "an unfilled cell names why — never a blank");
    }
  }
});

test("REFUSAL · a refusing grid always names its reason", () => {
  for (const sport of ["mlb", "nfl", "ufc", "epl", "multi"]) {
    const grid = read(path.join(APP, `public/data/parlays/tier-grid/${sport}-latest.json`));
    if (!grid || grid.state === "PUBLISHED") continue;
    assert.ok(
      typeof grid.reason === "string" && grid.reason.trim().length > 10,
      `${sport}: a grid that publishes nothing must say why, substantively`,
    );
  }
});
