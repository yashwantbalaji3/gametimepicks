/**
 * P252 — A STAMPED LIFECYCLE MUST NOT OUTLIVE THE KICKOFF.
 *
 * Found by an end-to-end re-verification at 2026-09-10T03:29Z, three hours after NE @ SEA kicked
 * off. The NFL index had been generated at 22:57Z and still said `lifecycle: UPCOMING`, so:
 *   · /nfl listed the game as "scheduled"
 *   · /simulate offered it under today's events with no started marker
 *   · the HOMEPAGE ranked "Seattle Seahawks to beat New England Patriots" inside "The model's
 *     strongest reads today"
 * and the next event-window run was eleven hours away.
 *
 * This is the defect lib/sports/event-lifecycle.mjs was written for on /ufc — "no surface compared
 * the event's own start time to the clock before calling it next" — which NFL never adopted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { effectiveLifecycle, hasStarted, NFL_DURATION_HOURS } from "./effective-lifecycle.mjs";

const APP = process.cwd();
const NOW = "2026-09-10T03:29:00Z";

test("a kickoff that has passed beats a stamp that says UPCOMING", () => {
  assert.equal(effectiveLifecycle({ lifecycle: "UPCOMING", kickoffUtc: "2026-09-10T00:20Z" }, NOW), "STARTED");
  assert.equal(hasStarted({ lifecycle: "UPCOMING", kickoffUtc: "2026-09-10T00:20Z" }, NOW), true);
});

test("THE CLOCK MAY ONLY ADVANCE A STAMP, NEVER REWIND IT", () => {
  /*
   * The producer may know something the clock cannot — a postponement is the obvious case, and
   * P215 recorded exactly that failure for MLB. So a stamp that has already advanced stands even
   * when the kickoff time looks future; only UPCOMING can lose to the clock.
   */
  assert.equal(effectiveLifecycle({ lifecycle: "SETTLED", kickoffUtc: "2026-09-20T00:00Z" }, NOW), "SETTLED");
  assert.equal(effectiveLifecycle({ lifecycle: "STARTED", kickoffUtc: "2026-09-20T00:00Z" }, NOW), "STARTED");
  assert.equal(effectiveLifecycle({ lifecycle: "UPCOMING", kickoffUtc: "2026-09-11T00:35Z" }, NOW), "UPCOMING");
});

test("an unreadable kickoff never advances a stamp", () => {
  /* Guessing "started" hides a real upcoming game, which is the harm in the other direction. */
  for (const kickoffUtc of [null, undefined, "", "not-a-date"]) {
    assert.equal(effectiveLifecycle({ lifecycle: "UPCOMING", kickoffUtc }, NOW), "UPCOMING");
  }
});

test("a game still in progress is STARTED, not left upcoming", () => {
  const justKicked = new Date(Date.parse(NOW) - 30 * 60_000).toISOString();
  assert.equal(effectiveLifecycle({ lifecycle: "UPCOMING", kickoffUtc: justKicked }, NOW), "STARTED");
  const longOver = new Date(Date.parse(NOW) - (NFL_DURATION_HOURS + 5) * 3_600_000).toISOString();
  assert.equal(effectiveLifecycle({ lifecycle: "UPCOMING", kickoffUtc: longOver }, NOW), "STARTED");
});

test("no NFL surface reads the raw stamp to decide whether a game has started", () => {
  /*
   * The claim that actually protects a reader. Nine call sites compared `lifecycle` to a literal;
   * each one was a place a played game could be framed as upcoming for up to eleven hours.
   */
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      const rel = path.relative(APP, p);
      /* The owner itself, and the producers that WRITE the stamp, are allowed to name it. */
      if (rel.includes("effective-lifecycle") || rel.startsWith("scripts/")) continue;
      /*
       * Two readers are legitimate, and each is listed with the reason rather than waved through:
       *
       *   simulate-eligibility.ts  its early return is `stamp === "SETTLED"`, which is the safe
       *                            direction — the clock may advance a stamp and never rewind one,
       *                            so a SETTLED stamp needs no clock to confirm it. Everything in
       *                            that file that could conclude "not started" already goes through
       *                            the owner.
       *   day-view.ts              reads `lifecycle` off the ELIGIBILITY output, which is already
       *                            the effective value — the raw stamp never reaches it.
       */
      if (rel === "src/lib/sports/nfl/simulate-eligibility.ts" || rel === "src/lib/simulate/day-view.ts") continue;
      const body = fs.readFileSync(p, "utf8");
      if (!/nfl/i.test(rel) && !/nfl/i.test(body.slice(0, 400))) continue;
      for (const m of body.matchAll(/\.lifecycle\s*(?:===|!==)\s*"(UPCOMING|STARTED|SETTLED)"/g)) {
        offenders.push(`${rel}: ${m[0]}`);
      }
    }
  };
  walk(path.join(APP, "src"));
  assert.deepEqual(offenders, [],
    `these decide tense from the stamp instead of effectiveLifecycle():\n  ${offenders.join("\n  ")}`);
});

test("LIVE · nothing on the current index is stamped UPCOMING past its own kickoff without the clock catching it", () => {
  const idx = (() => { try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/index.json"), "utf8")); } catch { return null; } })();
  if (!idx?.events?.length) return;
  const now = new Date().toISOString();
  for (const e of idx.events) {
    if (!e?.kickoffUtc || Date.parse(e.kickoffUtc) >= Date.parse(now)) continue;
    assert.equal(hasStarted(e, now), true,
      `${e.matchup} kicked off at ${e.kickoffUtc} and still resolves as upcoming`);
  }
});
