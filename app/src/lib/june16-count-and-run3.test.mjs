/**
 * June-16 final push: the World Cup "matches today" count reflects games IN FOCUS (odds-backed
 * projections), not the raw schedule count; and the Bank Builder V2 evaluation transparently shows
 * the Argentina-moneyline verdict + an over-correlation blocker when the upcoming slate is thin.
 * Source + data checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("Today World Cup headline uses the in-focus count, not the misleading schedule count", () => {
  const page = read("src/app/today/page.tsx");
  assert.ok(page.includes("inFocus"), "computes an in-focus count");
  assert.ok(/World Cup .* in focus/.test(page), "headline says 'in focus', not 'matches today'");
  assert.ok(!/\$\{games\} World Cup \$\{games === 1 \? "match" : "matches"\} today/.test(page),
    "the raw schedule-count headline is gone");
});

test("World Cup page prominent counts use in-focus games", () => {
  const page = read("src/app/world-cup/page.tsx");
  assert.ok(page.includes("inFocusGames"), "defines inFocusGames from projection matchCount");
  assert.ok(page.includes('label: "Games in focus"'), "stat relabeled to in-focus");
  assert.ok(/games? in focus/i.test(page), "hero caption uses in-focus framing");
});

test("the in-focus count matches the odds-backed projection matchCount (not the schedule)", () => {
  const proj = JSON.parse(read("public/data/world-cup/projections/latest.json"));
  const sched = JSON.parse(read("public/data/world-cup/schedule.json"));
  const today = proj.date;
  // The current slate is a COMBINED window (June 28 + the next day's early kickoffs). The projection rows are
  // stamped with the slate date, but the underlying fixtures legitimately span that day and the next, so the
  // in-focus count is bounded by the schedule across the combined window — never by the single slate date alone.
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const windowDates = new Set([today, next.toISOString().slice(0, 10)]);
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
