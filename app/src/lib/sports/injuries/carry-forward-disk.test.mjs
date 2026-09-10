/**
 * DISK TRUTH for the carry-forward — the committed injuries file must account for itself.
 *
 * contract.test.mjs checks that a committed capture is facts-only and reconciles EXACTLY against
 * the feed it came from. Carried rows are not from that feed, so they are accounted beside the
 * reconciliation rather than folded into it: `reconciliation` keeps describing the feed, and
 * `carryForward.carried` names every row that is on disk because the feed forgot it.
 *
 * Written generic on purpose. A fixture pinned to one player rots the day his designation leaves
 * the window; these assertions hold on any day's committed file, including a quiet one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ABSENT_DESIGNATION_CARRY_H, carryForwardDesignations } from "./carry-forward.mjs";
import { isLongTermStatus } from "./contract.mjs";

const read = (sport) =>
  JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "research", "injuries", sport, "latest.json"), "utf8"));

test("DISK TRUTH · entries = the feed's kept rows + the carried rows, and every carried row is auditable", () => {
  for (const sport of ["nfl", "nba"]) {
    const a = read(sport);
    const marked = (a.entries ?? []).filter((e) => e.carriedForward === true);
    const declared = a.carryForward?.carried ?? 0;
    assert.equal(marked.length, declared, `${sport}: the declared carry count matches the rows marked carriedForward`);
    assert.equal(
      a.entries.length,
      a.reconciliation.kept + declared,
      `${sport}: reconciliation still describes the feed exactly; the carry is accounted beside it, never folded in`,
    );
    for (const e of marked) {
      assert.ok(isLongTermStatus(e.status, sport), `${sport}: ${e.athleteName} carried with non-long-term status "${e.status}"`);
      assert.ok(Number.isFinite(Date.parse(e.absentFromFeedSince ?? "")), `${sport}: ${e.athleteName} carried without the moment it went missing`);
    }
  }
});

test("REAL DATA · a recent long-term designation on disk survives a feed that forgets it", () => {
  // Pick ANY long-term designation on today's committed file that is still inside the window, drop
  // it from a synthetic fresh feed, and require the carry to bring it back. No player is pinned.
  const a = read("nfl");
  const now = new Date().toISOString();
  const within = (e) => Date.parse(now) - Date.parse(e.statedAt ?? "") <= ABSENT_DESIGNATION_CARRY_H * 3.6e6;
  const candidate = (a.entries ?? []).find((e) => isLongTermStatus(e.status) && within(e));
  if (!candidate) return; // a quiet fortnight: nothing recent enough to carry, which is a pass, not a skip in disguise
  const fresh = a.entries.filter((e) => e.athleteId !== candidate.athleteId);
  const { entries, carried } = carryForwardDesignations({ previousEntries: a.entries, currentEntries: fresh, nowIso: now });
  assert.ok(carried.some((e) => e.athleteId === candidate.athleteId), `${candidate.athleteName} (${candidate.status}) must survive the feed forgetting him`);
  assert.equal(entries.filter((e) => e.athleteId === candidate.athleteId).length, 1, "exactly once — never duplicated");
});
