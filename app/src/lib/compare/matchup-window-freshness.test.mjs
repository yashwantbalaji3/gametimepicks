/**
 * THE MATCHUP WINDOW MUST NOT EXPIRE WHILE THE SEASON IS LIVE (R0 · 2026-09-24).
 *
 * WHAT HAPPENED. `data/compare-projection/v1/matchups/*.jsonl.gz` was generated on 2026-09-17 and
 * carries a FORWARD window of scheduled games. Nothing ran the producer again, so on 2026-09-24 the
 * MLB window ran out: 93 entries, **zero** of them still in the future, while twelve MLB games were
 * being played that day. `/matchups`, `/compare`, `/players`, `/teams`, `/research/lab` and
 * `/following` all read that artifact, and MF1 went red because not one registry id could join a
 * current game detail.
 *
 * WHY THIS GUARD IS NOT `entries.length > 0`. It was never empty — it had 93 rows. Cardinality says
 * nothing here; the property that broke is FORWARD COVERAGE, and it has to be judged against whether
 * the season is actually running:
 *
 *   LIVE SEASON, FUTURE GAMES PRESENT  → valid current projection          (pass)
 *   LIVE SEASON, NO FUTURE GAMES       → the window expired                (FAIL — the incident)
 *   NO RECENT GAMES EITHER             → season over or not started        (pass, legitimately)
 *   SPORT NOT IN MATCHUP_SPORTS        → unsupported                       (skipped, not asserted)
 *
 * ⚠ A SIBLING TRAP, PROVEN THE SAME DAY. Each producer in the chain ships a `--check` that rebuilds
 * in memory and exits 1 when the committed output differs. Run against the frozen 2026-09-17 tree,
 * `data-platform --check` correctly exited 1 — but research, compare and lab all exited **0**,
 * because each matched its own equally-frozen upstream. Downstream checks go transitively blind when
 * the whole chain freezes together, so a `--check` on the projections alone would NOT have caught
 * this. Only the platform's check reaches artifacts that actually move.
 *
 * Run: npx tsx --test src/lib/compare/matchup-window-freshness.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { matchupEntries } from "./compare-store.ts";
import { MATCHUP_SPORTS } from "./contract.mjs";

/** A season is "live" if the registry holds a game that started within this many days. */
const RECENT_DAYS = 4;
const DAY_MS = 86_400_000;

test("a matchup registry with recent games must also carry future ones — the window cannot expire under a live season", () => {
  assert.ok(MATCHUP_SPORTS.length > 0, "no matchup sports declared — this guard would assert nothing");

  const now = Date.now();
  const verdicts = [];

  for (const sport of MATCHUP_SPORTS) {
    const entries = matchupEntries(sport);
    const starts = entries
      .map((e) => Date.parse(e.startUtc))
      .filter((t) => Number.isFinite(t));

    // A registry that cannot be read at all is a different failure, and a loud one.
    assert.ok(starts.length === entries.length,
      `${sport}: ${entries.length - starts.length} registry entries have no parseable startUtc`);

    const future = starts.filter((t) => t > now).length;
    const recent = starts.filter((t) => t <= now && t > now - RECENT_DAYS * DAY_MS).length;

    if (recent === 0) {
      // Season over, not yet started, or a genuine off-window. Nothing to claim.
      verdicts.push(`${sport}: NO_RECENT_GAMES (${entries.length} entries) — not asserted`);
      continue;
    }

    assert.ok(future > 0,
      `${sport}: the matchup window has EXPIRED — ${recent} game(s) started in the last ${RECENT_DAYS} days ` +
      `but the registry holds ${future} in the future, across ${entries.length} entries. ` +
      `The compare projection producer has not run recently enough; regenerate the chain ` +
      `(platform → research → compare → lab) rather than relaxing this guard.`);

    verdicts.push(`${sport}: LIVE (${recent} recent, ${future} future, ${entries.length} entries)`);
  }

  // Non-vacuity: at least one sport must have been genuinely judged, or this proves nothing today.
  assert.ok(verdicts.some((v) => v.includes("LIVE")),
    `no matchup sport was in a live season, so this guard asserted nothing:\n  ${verdicts.join("\n  ")}`);
});

/**
 * EXACTLY ONE LIFECYCLE OWNER (R0 · 2026-09-24).
 *
 * The window expired because the four builders had NO owner. The opposite failure is just as bad:
 * two owners racing, or a second schedule quietly regenerating the same artifacts out of dependency
 * order. So the wiring itself is pinned — one workflow runs each builder, exactly once, in the order
 * their own refusals require, with no `continue-on-error` and no swallowed exit code.
 *
 * This reads the workflow files rather than trusting a comment, because "nobody runs this" is
 * precisely the class of defect a comment cannot detect.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.cwd(), "..");
const WORKFLOWS = path.join(REPO, ".github", "workflows");
/** The chain, in the order each builder's own upstream refusal requires. */
const CHAIN = [
  "scripts/data-platform/build.mjs",
  "scripts/research/build-research-projections.mjs",
  "scripts/compare/build-compare-projections.mjs",
  "scripts/lab/build-lab-projections.mjs",
  /* The Ask projection is the fifth artifact with the same shape: a currency guard in CI
     (`npm run ask:check`) and, until now, no producer staging it. */
  "npm run ask:build",
];
const OWNER = "daily-products.yml";

test("each projection builder has exactly one workflow owner, invoked in dependency order", () => {
  const files = fs.readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  assert.ok(files.length > 0, "no workflows found — this guard would scan nothing");

  const owners = new Map(CHAIN.map((b) => [b, []]));
  for (const f of files) {
    const text = fs.readFileSync(path.join(WORKFLOWS, f), "utf8");
    for (const b of CHAIN) if (text.includes(b)) owners.get(b).push(f);
  }

  for (const b of CHAIN) {
    const who = owners.get(b);
    assert.deepEqual(who, [OWNER],
      `${b} must be owned by exactly one workflow (${OWNER}); found: ${who.length ? who.join(", ") : "NOBODY — this is the 2026-09-24 defect"}`);
  }

  // Dependency order, inside the owning workflow, as it is actually written.
  const owner = fs.readFileSync(path.join(WORKFLOWS, OWNER), "utf8");
  const at = CHAIN.map((b) => owner.indexOf(b));
  for (let i = 1; i < at.length; i += 1) {
    assert.ok(at[i] > at[i - 1],
      `${CHAIN[i]} is invoked before ${CHAIN[i - 1]}; each builder refuses a stale upstream, so order is a dependency, not a preference`);
  }

  // The step must fail loudly. A swallowed failure is how a week-old projection survives.
  const step = /- name: Refresh the canonical projection chain[\s\S]*?(?=\n      - name:)/.exec(owner)?.[0];
  assert.ok(step, "the refresh step is no longer identifiable by name — this guard would scan nothing");
  assert.match(step, /set -euo pipefail/, "the refresh step must abort on the first failure");
  assert.ok(!/continue-on-error/.test(step), "the refresh step must not be continue-on-error");
  assert.ok(!/\|\|\s*true/.test(step), "the refresh step must not swallow a non-zero exit");
  assert.match(step, /build\.mjs --all --check/, "the post-condition check must run after the build, or a silent no-op passes");
});
