/**
 * THE FOUR-SPORT AVAILABILITY AUDIT — that it keeps answering the question, and keeps refusing to
 * answer it flatteringly (2026-09-25).
 *
 * The audit exists because "can a participant who cannot play still enter the simulation?" had to
 * be re-derived by reading four producers in four vocabularies. These guards pin the two ways such
 * a report goes bad: silently dropping a sport, and reporting a missing feed as a clean sheet.
 *
 * Run: npx tsx --test src/lib/ops/availability-audit.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(process.cwd(), "..");
function runAudit(nowIso) {
  const out = path.join(os.tmpdir(), `avail-${Date.now()}.json`);
  execFileSync("node", [path.join(REPO, "app/scripts/ops/availability-audit.mjs"), "--now", nowIso, "--json", path.relative(REPO, out)], { cwd: REPO, encoding: "utf8" });
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

test("all four sports are reported, and none may go missing quietly", () => {
  const r = runAudit(new Date().toISOString());
  assert.deepEqual(Object.keys(r.sports).sort(), ["epl", "mlb", "nfl", "ufc"],
    "a sport that drops out of this report is a sport nobody is auditing");
  for (const [sport, s] of Object.entries(r.sports)) {
    assert.ok(s.owner, `${sport} must name the producer that owns its availability`);
    assert.ok(typeof s.state === "string" && s.state.length, `${sport} must carry a state`);
  }
});

test("a sport with no exclusion mechanism is NOT reported as having nobody excluded", () => {
  /*
   * ⚠ THE FLATTERING READING THIS FORBIDS. EPL publishes conditional player rows and has no injury
   * or suspension feed, so its excluded list is empty — and an empty excluded list looks exactly
   * like a healthy week. `hardExclusionReachable: false` is what separates them, and it must travel
   * with the zero.
   */
  const r = runAudit(new Date().toISOString());
  for (const [sport, s] of Object.entries(r.sports)) {
    if (s.hardExclusionReachable === false) {
      assert.ok((s.gaps ?? []).length > 0,
        `${sport} cannot exclude anyone and must therefore carry a named gap — a zero without one reads as good news`);
      assert.ok((s.gaps ?? []).some((g) => /injur|suspen|unavailab|feed|provider/i.test(g)),
        `${sport}'s gap must name what is missing, not merely that something is`);
    }
  }
});

test("EPL still carries the measurement that the free feed cannot close its gap", () => {
  /* Evidence, not opinion: 149 athletes across five clubs, zero non-active, zero injuries. If a
     provider starts populating it, this test should be re-read rather than deleted. */
  const r = runAudit(new Date().toISOString());
  const gaps = (r.sports.epl.gaps ?? []).join(" ");
  assert.match(gaps, /ZERO non-active statuses/, "the EPL gap must carry the measurement behind it");
  assert.equal(r.sports.epl.hardExclusionReachable, false);
});

test("NFL's exclusions are real, attributed and dated", () => {
  const r = runAudit(new Date().toISOString());
  const nfl = r.sports.nfl;
  if (nfl.state !== "ACTIVE") return;
  const excluded = nfl.events.flatMap((e) => e.excluded ?? []);
  assert.ok(excluded.length > 0, "an NFL slate with no exclusions at all would mean the injuries feed stopped being read");
  for (const e of excluded) {
    assert.ok(e.id && e.name, "an excluded player must be identified");
    assert.ok(e.state, "an exclusion must name the status that caused it");
    assert.ok(e.statedAt, "an exclusion must carry when that status was stated — an undated one cannot be audited");
    assert.ok(e.reason && e.reason.length > 20, "an exclusion must explain itself");
  }
});

test("the audit's output is in the commit allowlist — a report nobody keeps is not a report", () => {
  /*
   * ⚠ THE 62-HOUR-OUTAGE SHAPE, and the workflow's own comment says this repo has hit it twice: a
   * step generates an artifact, the commit step adds an explicit list of files, the new one is not
   * on it, and the artifact is rebuilt and thrown away every run while the board reads healthy.
   */
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/cron-watchdog.yml"), "utf8");
  assert.match(wf, /availability-audit\.mjs/, "the audit must actually be run by a workflow, not merely exist");
  const addBlock = /git add ([\s\S]*?)2>\/dev\/null/.exec(wf);
  assert.ok(addBlock, "the commit step must still use an explicit allowlist");
  assert.match(addBlock[1], /data\/internal\/research\/ops\/availability-audit\.json/,
    "the audit writes this path and the commit step must add it, or every run rebuilds it and discards it");
});
