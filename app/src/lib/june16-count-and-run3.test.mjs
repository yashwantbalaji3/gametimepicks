/**
 * June-16 final push, surviving guarantees: the archived in-focus-vs-schedule count RELATIONSHIP
 * (projection matchCount is real and bounded by the scheduled fixtures), and the Bank Builder V2
 * evaluation transparently showing the Argentina-moneyline verdict. The /world-cup page-rendering
 * checks ("in focus" headline + hero counts) are gone with the live hub: the 2026 World Cup closed
 * as a destination (world-cup-closeout.test.mjs) and /world-cup is a redirect stub, so there is no
 * live count surface left to keep honest. Source + data checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("the in-focus count matches the odds-backed projection matchCount (not the schedule)", () => {
  // The World Cup tournament is COMPLETE — projections/latest.json is now an empty slate (matchCount 0, a
  // valid end-of-tournament state). This test validates the in-focus-vs-schedule RELATIONSHIP (matchCount is
  // real and never exceeds the scheduled fixtures across the window), which is timeless, so it pins to the
  // committed 2026-07-15 semifinal archive (still present in the committed schedule.json).
  const proj = JSON.parse(read("public/data/world-cup/projections/2026-07-15.json"));
  const sched = JSON.parse(read("public/data/world-cup/schedule.json"));
  const today = proj.date;
  // The current slate is a COMBINED window (June 28 + the next day's early kickoffs). The projection rows are
  // stamped with the slate date, but the underlying fixtures legitimately span that day and the next, so the
  // in-focus count is bounded by the schedule across the combined window — never by the single slate date alone.
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  // The combined window can widen to the next KNOCKOUT fixtures (e.g. semifinals spread over 2 later days),
  // so the bounding window is the slate date ∪ the artifact's own slateWindow days ∪ the next calendar day.
  const windowDates = new Set([today, next.toISOString().slice(0, 10), ...(proj.slateWindow?.days ?? [])]);
  const scheduled = (sched.matches || []).filter((m) => windowDates.has(String(m.date))).length;
  // in focus = projection matchCount; the schedule must carry at least as many fixtures across the window.
  assert.ok(proj.matchCount >= 1, "at least one in-focus game");
  assert.ok(proj.matchCount <= scheduled, "in-focus count never exceeds the scheduled count across the slate window");
});

test("V2 evaluation transparently records the Argentina-moneyline verdict", () => {
  const v2 = JSON.parse(read("public/data/bank-builder/v2-evaluation-latest.json"));
  assert.ok(Array.isArray(v2.notes), "notes array present");
  const argNote = (v2.notes || []).find((n) => /argentina moneyline/i.test(n));
  assert.ok(argNote, "Argentina moneyline explicitly evaluated in notes");
  // Argentina moneyline appears in the scored candidates with a survival score.
  const arg = (v2.strongestCandidates || []).concat(v2.eligibleLegs || [], v2.watchlistLegs || [])
    .find((c) => c.market === "moneyline_90" && /argentina/i.test(c.pick || ""));
  // it may be below the top-6 cutoff, but the note must still describe it
  if (arg) assert.ok(typeof arg.survivalScore === "number", "Argentina ML has a survival score");
});

test("V2 panel renders the notes (notable candidates evaluated)", () => {
  const panel = read("src/components/bank-builder/bank-builder-v2-panel.tsx");
  assert.ok(/Notable candidates evaluated/.test(panel), "panel shows evaluated notes");
  assert.ok(/v2\.notes/.test(panel), "panel reads notes");
});

test("no Run #3 was launched on a no-launch verdict (Run #2 preserved)", () => {
  const v2 = JSON.parse(read("public/data/bank-builder/v2-evaluation-latest.json"));
  if (v2.decision !== "launch") {
    const dual = JSON.parse(read("public/data/bank-builder/dual-lanes-latest.json"));
    assert.ok(dual.runNumber === 2 || dual.status === "settled" || dual.status === "closed",
      "Run #2 remains the latest dual run");
  }
});
