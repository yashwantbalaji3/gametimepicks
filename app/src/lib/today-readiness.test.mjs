/**
 * Sprint 037A — the "is today ready?" signal must stay honest and correctly attributed.
 *
 * WHY IT EXISTS
 * `workflowHealth` answers "did the last workflow finish?". On 2026-07-28 at 09:28 ET it read
 * `{status:"pass", phase:"nightly-settle"}` while ZERO artifacts existed for the day. That is correct
 * on its own terms and useless to a founder asking whether the site is current — the two questions are
 * different, and only one of them was being answered.
 *
 * WHY IT IS SCHEDULE-AWARE
 * A naive "artifact missing => broken" check is RED every morning until the pipeline runs, which trains
 * the reader to ignore it. `pending` (absent, not yet due) is a real third state and the normal state
 * for most of the morning.
 *
 * WHY THE ATTRIBUTIONS ARE GUARDED
 * The first draft credited `mlb/schedule` to mlb-pregame-capture (07:00 ET) and produced a false "late"
 * at 09:30. git history and the workflows' own `git add` lines show morning-projections writes it. A
 * wrong due-time makes this block worse than nothing — it manufactures alarms — so the mapping is
 * checked against the workflows rather than trusted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const script = fs.readFileSync(path.join(APP, "scripts/build-admin-status.mjs"), "utf8");
const wf = (f) => fs.readFileSync(path.join(REPO, ".github/workflows", f), "utf8");

/** Parse the READINESS_STAGES table out of the builder so the test reads the real config. */
function stages() {
  const block = /const READINESS_STAGES = \[([\s\S]*?)\];/.exec(script);
  assert.ok(block, "READINESS_STAGES must exist");
  return [...block[1].matchAll(
    /\{\s*key:\s*"([^"]+)",\s*dir:\s*"([^"]+)",\s*dueEtHour:\s*(\d+),\s*dueEtMinute:\s*(\d+),\s*by:\s*"([^"]+)"/g,
  )].map((m) => ({ key: m[1], dir: m[2], hour: Number(m[3]), minute: Number(m[4]), by: m[5] }));
}

test("every readiness stage names a workflow that actually stages that path", () => {
  for (const st of stages()) {
    const file = `${st.by}.yml`;
    const yml = wf(file);
    assert.ok(
      yml.includes(`app/public/data/${st.dir}/`),
      `${st.key}: claims to be produced by ${file}, but that workflow never stages app/public/data/${st.dir}/`,
    );
  }
});

test("every stage's due time matches a real cron in its workflow", () => {
  for (const st of stages()) {
    const yml = wf(`${st.by}.yml`);
    const crons = [...yml.matchAll(/cron:\s*"(\d+)\s+(\d+)/g)].map(([, m, h]) => {
      // EDT = UTC-4. The pipeline runs in-season; this is the same conversion the builder documents.
      const et = (Number(h) - 4 + 24) % 24;
      return et * 60 + Number(m);
    });
    assert.ok(crons.length > 0, `${st.by}.yml must declare at least one cron`);
    const due = st.hour * 60 + st.minute;
    assert.ok(
      crons.some((c) => c === due),
      `${st.key}: due ${st.hour}:${String(st.minute).padStart(2, "0")} ET does not match any cron in ${st.by}.yml (ET crons: ${crons.map((c) => `${Math.floor(c / 60)}:${String(c % 60).padStart(2, "0")}`).join(", ")})`,
    );
  }
});

test("the signal has an honest pending state and does not cry wolf", () => {
  assert.match(script, /"pending"/, "absent-but-not-yet-due must be its own state");
  assert.match(script, /READINESS_GRACE_MINUTES/, "a workflow needs time to run before it is called late");
  // GREEN must require every stage, not a majority.
  assert.match(
    script,
    /readyStages\.length === todayReadinessStages\.length \? "GREEN"/,
    "GREEN must mean every stage is present",
  );
});

test("readiness is reported separately from workflowHealth, not merged into it", () => {
  // Merging them would reintroduce the exact confusion this block exists to remove.
  assert.match(script, /todayReadiness,/, "status must expose todayReadiness");
  assert.match(script, /workflowHealth,/, "and must keep workflowHealth as its own answer");
  assert.match(
    script,
    /distinct from workflowHealth/i,
    "the note must say plainly that these answer different questions",
  );
});

test("the emitted status file, when present, carries a well-formed readiness block", () => {
  const p = path.join(APP, "public/data/admin/status.json");
  if (!fs.existsSync(p)) return;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!doc.todayReadiness) return; // predates this block — regenerated on the next run

  const t = doc.todayReadiness;
  assert.match(t.etDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(["GREEN", "YELLOW", "RED"].includes(t.signal), `unexpected signal ${t.signal}`);
  assert.equal(t.stages.length, t.totalStages);
  for (const s of t.stages) {
    assert.ok(["ready", "pending", "late"].includes(s.state), `${s.stage}: bad state ${s.state}`);
  }
  // The signal must agree with the stages it summarises.
  const late = t.stages.filter((s) => s.state === "late").length;
  const ready = t.stages.filter((s) => s.state === "ready").length;
  const expected = late > 0 ? "RED" : ready === t.stages.length ? "GREEN" : "YELLOW";
  assert.equal(t.signal, expected, "signal must be derivable from the stage states");
});
