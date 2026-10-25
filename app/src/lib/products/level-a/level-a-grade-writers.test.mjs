/**
 * Level A grading with TWO WRITERS (2026-10-25): nightly-settle grades every entry; nba-results-refresh grades the all-NBA
 * entries (`--only-sport nba`) inside the commit that adds their finals, so a card is graded when its last final lands
 * (10-24: last final 04:34Z) rather than at the next nightly run (10-24 slate graded 09:26Z).
 *
 * Run: npx tsx --test src/lib/products/level-a/level-a-grade-writers.test.mjs
 * Entries and finals marked FIXTURE are test inputs; the REAL-DATA test regrades the committed record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { allLegsAre, runGrade } from "../../../../scripts/products/grade-level-a-suggestions.mjs";
import { gradeViolations } from "./grade.mjs";

const REPO = path.resolve(process.cwd(), "..");
const RESOLVER = path.join(REPO, "scripts/ci/regrade-level-a-on-conflict.sh");
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const lines = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

/** FIXTURE entries and finals. */
const leg = (sport, eventId, code = "home") => ({ sport, eventId, selection: { code, label: code }, market: "winner", startUtc: "2026-10-23T19:00:00Z" });
const entry = (id, legs) => ({ schema: "gtp.level-a.suggestion@1", id, productDay: "2026-10-23", policy: "parlay-lab-suggest@1", tier: "high", legs, jointProbability: 0.2 });
const FINALS = { mlb: (l) => (l.eventId === "m1" ? { homeRuns: 5, awayRuns: 2, isFinal: true } : null), soccer: () => null, nba: () => null };

test("SCOPE: --only-sport grades only entries whose EVERY leg is that sport; a mixed card is left to the full writer", () => {
  assert.equal(allLegsAre("nba")(entry("a", [leg("nba", "1"), leg("nba", "2")])), true);
  assert.equal(allLegsAre("nba")(entry("b", [leg("nba", "1"), leg("mlb", "m1")])), false, "mixed");
  assert.equal(allLegsAre("nba")(entry("c", [])), false, "no legs is never in scope");
  const dir = tmp("la-scope-");
  const recordFile = path.join(dir, "suggestions.jsonl"), gradesFile = path.join(dir, "graded.jsonl");
  fs.writeFileSync(recordFile, [entry("mlb-only", [leg("mlb", "m1")]), entry("mixed", [leg("mlb", "m1", "away"), leg("nba", "9")])].map((e) => JSON.stringify(e)).join("\n") + "\n");
  const scoped = runGrade({ now: "2026-10-24T05:00:00Z", write: true, recordFile, gradesFile, finals: FINALS, onlySport: "nba" });
  assert.deepEqual([scoped.added, scoped.inScope, fs.existsSync(gradesFile)], [0, 0, false], "an NBA-scoped run grades no MLB entry — not even a decidable loss on a mixed card");
  const full = runGrade({ now: "2026-10-24T09:00:00Z", write: true, recordFile, gradesFile, finals: FINALS });
  assert.deepEqual(lines(gradesFile).map((g) => [g.entryId, g.result]), [["mlb-only", "win"], ["mixed", "loss"]], "the full writer still grades both");
  assert.equal(full.added, 2);
  assert.throws(() => runGrade({ now: "2026-10-24T09:00:00Z", recordFile, gradesFile, finals: FINALS, onlySport: "" }), /--only-sport/);
});

test("REAL DATA: the NBA-scoped writer reproduces every committed all-NBA grade exactly, and writes nothing else", () => {
  const dir = tmp("la-real-");
  const recordFile = path.join(REPO, "data/internal/products/level-a/suggestions.jsonl");
  const committed = lines(path.join(REPO, "data/internal/products/level-a/graded.jsonl"));
  const nbaIds = new Set(lines(recordFile).filter(allLegsAre("nba")).map((e) => e.id));
  const removed = committed.filter((g) => nbaIds.has(g.entryId));
  assert.ok(removed.length >= 17, `the committed record must hold the graded 10-23/10-24 NBA entries, or this test is vacuous (${removed.length})`);
  const gradesFile = path.join(dir, "graded.jsonl");
  fs.writeFileSync(gradesFile, committed.filter((g) => !nbaIds.has(g.entryId)).map((g) => JSON.stringify(g)).join("\n") + "\n");
  const out = runGrade({ now: "2026-10-26T12:00:00Z", write: true, recordFile, gradesFile, onlySport: "nba" });
  assert.deepEqual(out.conflicts, []);
  const after = lines(gradesFile);
  const added = after.slice(after.length - out.added);
  for (const g of added) assert.ok(nbaIds.has(g.entryId), `${g.entryId} is not an all-NBA entry`);
  const byId = new Map(added.map((g) => [g.entryId, g]));
  for (const r of removed) {
    const g = byId.get(r.entryId);
    assert.ok(g, `${r.entryId} (${r.productDay} ${r.policy}/${r.tier}) was not regraded`);
    assert.equal(g.result, r.result, `${r.entryId}: result`);
    assert.deepEqual(g.legs.map((l) => [l.eventId, l.side, l.result]), r.legs.map((l) => [l.eventId, l.side, l.result]), `${r.entryId}: legs`);
    assert.equal(g.id, r.id, "the same grade id (entry + grader version)");
  }
  assert.deepEqual(gradeViolations({ beforeText: "", afterText: fs.readFileSync(gradesFile, "utf8") }), [], "no entry graded twice");
});

/* ─── the race: both writers append, nightly-settle's push must not be lost ───────────────────────────────────────── */

function race({ settleExtra = {}, refreshGrades, settleGrades, wanted }) {
  const root = tmp("la-race-");
  const sh = (cwd, ...args) => spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  const git = (cwd, ...a) => { const r = sh(cwd, "git", ...a); if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const F = "data/internal/products/level-a/graded.jsonl";
  const write = (cwd, rel, text) => { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), text); };
  const append = (cwd, ids) => fs.appendFileSync(path.join(cwd, F), ids.map((id) => JSON.stringify({ entryId: id, result: "win" }) + "\n").join(""));
  git(root, "init", "-q", "--bare", "-b", "main", "origin.git");
  const seed = path.join(root, "seed");
  git(root, "clone", "-q", path.join(root, "origin.git"), "seed");
  git(seed, "checkout", "-q", "-b", "main");
  write(seed, F, JSON.stringify({ entryId: "old", result: "loss" }) + "\n");
  write(seed, "data/internal/mlb/linescores/2026-10-24.json", "{}\n");
  git(seed, "add", "-A"); git(seed, "commit", "-q", "-m", "base"); git(seed, "push", "-q", "origin", "main");
  for (const n of ["refresh", "settle"]) git(root, "clone", "-q", path.join(root, "origin.git"), n);
  const settle = path.join(root, "settle"), refresh = path.join(root, "refresh");
  append(refresh, refreshGrades); write(refresh, "app/public/data/nba/results/finals.json", "{\"new\":1}\n");
  git(refresh, "add", "-A"); git(refresh, "commit", "-q", "-m", "refresh: finals + nba grades"); git(refresh, "push", "-q", "origin", "main");
  append(settle, settleGrades); for (const [rel, text] of Object.entries(settleExtra)) write(settle, rel, text);
  write(settle, "data/internal/mlb/linescores/2026-10-24.json", "{\"final\":true}\n");
  git(settle, "add", "-A"); git(settle, "commit", "-q", "-m", "nightly settle");
  /* the regrade stand-in: an idempotent, append-only grader that grades `wanted` — what the real one does from finals */
  const fake = `node -e 'const fs=require("fs");const f=${JSON.stringify(F)};const have=new Set(fs.readFileSync(f,"utf8").split("\\n").filter(Boolean).map(l=>JSON.parse(l).entryId));for(const id of ${JSON.stringify(wanted)})if(!have.has(id))fs.appendFileSync(f,JSON.stringify({entryId:id,result:"win"})+"\\n")'`;
  const plain = sh(settle, "git", "pull", "-q", "--rebase", "--autostash", "origin", "main");
  const r = plain.status === 0 ? { status: 0, stdout: "", stderr: "" } : spawnSync("bash", [RESOLVER], { cwd: settle, encoding: "utf8", env: { ...process.env, LEVEL_A_REGRADE_CMD: fake, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  const inRebase = fs.existsSync(path.join(settle, ".git/rebase-merge")) || fs.existsSync(path.join(settle, ".git/rebase-apply"));
  const ids = fs.readFileSync(path.join(settle, F), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).entryId);
  const pushed = r.status === 0 ? sh(settle, "git", "push", "-q", "origin", "HEAD:main").status : null;
  return { plainFailed: plain.status !== 0, r, inRebase, ids, pushed, git: (...a) => git(settle, ...a), settle };
}

test("RACE: both writers appended different grades — the plain rebase stops, the resolver keeps BOTH and the settlement commit is pushed", () => {
  const x = race({ refreshGrades: ["nba-1"], settleGrades: ["mlb-1"], wanted: ["mlb-1"] });
  assert.equal(x.plainFailed, true, "the two appends really conflict (otherwise this test proves nothing)");
  assert.equal(x.r.status, 0, x.r.stdout + x.r.stderr);
  assert.equal(x.inRebase, false);
  assert.deepEqual(x.ids, ["old", "nba-1", "mlb-1"], "main's lines first, each grade once");
  assert.equal(x.pushed, 0, "the settlement commit reaches main");
  assert.equal(x.git("show", "HEAD:data/internal/mlb/linescores/2026-10-24.json"), "{\"final\":true}", "the rest of the settlement commit is intact");
});

test("RACE: both writers graded the SAME entry — regenerating on main's copy writes it once, never twice", () => {
  const x = race({ refreshGrades: ["nba-1"], settleGrades: ["nba-1", "mlb-1"], wanted: ["nba-1", "mlb-1"] });
  assert.equal(x.plainFailed, true);
  assert.equal(x.r.status, 0, x.r.stdout + x.r.stderr);
  assert.deepEqual(x.ids, ["old", "nba-1", "mlb-1"]);
  assert.equal(x.pushed, 0);
});

test("RACE: a conflict on ANY other file is not resolved — the rebase is aborted and the step fails, exactly as before", () => {
  const root = race({ refreshGrades: ["nba-1"], settleGrades: ["mlb-1"], wanted: ["mlb-1"], settleExtra: { "app/public/data/nba/results/finals.json": "{\"other\":2}\n" } });
  assert.equal(root.plainFailed, true);
  assert.equal(root.r.status, 1);
  assert.match(root.r.stdout, /not only the Level A grade file/);
  assert.equal(root.inRebase, false, "aborted, not left half-rebased");
});

test("WIRING: nightly-settle's push loop calls the resolver; nba-results-refresh grades all-NBA cards in its finals commit, non-fatally", () => {
  const wf = (n) => fs.readFileSync(path.join(REPO, ".github/workflows", n), "utf8");
  assert.match(wf("nightly-settle.yml"), /git pull --rebase --autostash origin main \|\| bash scripts\/ci\/regrade-level-a-on-conflict\.sh \|\| exit 1/);
  const refresh = wf("nba-results-refresh.yml");
  const finals = refresh.indexOf("build-nba-finals-record.mjs"), grade = refresh.indexOf("grade-level-a-suggestions.mjs"), add = refresh.indexOf('git add "$RESULTS/"');
  assert.ok(finals > 0 && finals < grade && grade < add, "after the finals are built, before they are staged — one commit");
  assert.match(refresh, /grade-level-a-suggestions\.mjs --now "\$NOW" --only-sport nba --write\) \\\n\s+\|\| echo "::warning::/, "non-fatal");
  assert.match(refresh, /git add data\/internal\/products\/level-a\/graded\.jsonl/);
  assert.doesNotMatch(refresh, /suggestions\.jsonl/, "the record itself is never written by the refresh");
  /* No build of its own: the grade file is not a Vercel BUILD_INPUT (it rides a finals commit, which builds anyway). */
  assert.doesNotMatch(fs.readFileSync(path.join(REPO, "app/scripts/vercel-ignore-build.sh"), "utf8"), /data\/internal\/products/);
});

/* ─── acceptance (2026-10-26 release readiness): repeat runs and late corrections, on the REAL record ─────────────── */

import { committedFinals } from "../../../../scripts/products/grade-level-a-suggestions.mjs";

const realCopy = () => {
  const dir = tmp("la-accept-");
  const gradesFile = path.join(dir, "graded.jsonl");
  fs.copyFileSync(path.join(REPO, "data/internal/products/level-a/graded.jsonl"), gradesFile);
  return { gradesFile, recordFile: path.join(REPO, "data/internal/products/level-a/suggestions.jsonl") };
};

test("REPEAT: the NBA-scoped writer run again on the same committed finals appends nothing and changes no byte", () => {
  const { gradesFile, recordFile } = realCopy();
  runGrade({ now: "2026-10-26T05:00:00Z", write: true, recordFile, gradesFile, onlySport: "nba" });
  const once = fs.readFileSync(gradesFile, "utf8");
  for (const now of ["2026-10-26T05:15:00Z", "2026-10-26T09:30:00Z"]) {
    const again = runGrade({ now, write: true, recordFile, gradesFile, onlySport: "nba" });
    assert.equal(again.added, 0, `${now}: a repeated run added ${again.added}`);
    assert.equal(fs.readFileSync(gradesFile, "utf8"), once, `${now}: the file changed`);
  }
  /* …and the full (nightly) writer after it adds no second row for any NBA entry. */
  runGrade({ now: "2026-10-26T09:40:00Z", write: true, recordFile, gradesFile });
  assert.deepEqual(gradeViolations({ afterText: fs.readFileSync(gradesFile, "utf8") }), [], "no entry graded twice");
});

test("LATE CORRECTION: a final that would flip a graded NBA result is a CONFLICT — reported, never rewritten", () => {
  const { gradesFile, recordFile } = realCopy();
  const before = fs.readFileSync(gradesFile, "utf8");
  const real = committedFinals({ repoRoot: REPO, nowIso: "2026-10-26T05:00:00Z" });
  const EVENT = "401909860"; // GSW @ PHX, 10-24: committed final 122-131 (home win), in 6 graded entries: 3 won, 3 already lost via another leg
  assert.equal(real.nba(EVENT)?.homePointsFT, 131, "the committed final this test corrects");
  const flipped = { ...real, nba: (id) => (String(id) === EVENT ? { ...real.nba(id), homePointsFT: 120, awayPointsFT: 122 } : real.nba(id)) };
  const out = runGrade({ now: "2026-10-26T05:00:00Z", write: true, recordFile, gradesFile, finals: flipped, onlySport: "nba" });
  const touched = new Set(lines(recordFile).filter((e) => e.legs.some((l) => String(l.eventId).endsWith(EVENT))).map((e) => e.id));
  /* A conflict is a CARD whose grade would change. A card already lost through another leg stays lost when this leg
     flips too, so it is (correctly) not a conflict; every card this game won becomes a conflict. */
  const gradeOf = new Map(lines(gradesFile).map((g) => [g.entryId, g.result]));
  const expected = [...touched].filter((id) => gradeOf.get(id) === "win").sort();
  const stillLost = [...touched].filter((id) => gradeOf.get(id) === "loss");
  assert.ok(expected.length >= 3 && stillLost.length >= 1, `the record holds won and lost entries with this game (${expected.length}/${stillLost.length}), or the test is vacuous`);
  assert.deepEqual(out.conflicts.map((c) => c.entryId).sort(), expected, "every won card the correction would flip is reported, and only those");
  assert.ok(fs.readFileSync(gradesFile, "utf8").startsWith(before), "every line already written is byte-identical (append-only)");
  /* A correction that keeps the winner (PHX by 8, not 9) changes nothing and conflicts nothing. */
  const same = { ...real, nba: (id) => (String(id) === EVENT ? { ...real.nba(id), homePointsFT: 130 } : real.nba(id)) };
  const out2 = runGrade({ now: "2026-10-26T05:10:00Z", write: true, recordFile, gradesFile, finals: same, onlySport: "nba" });
  assert.deepEqual(out2.conflicts, []);
});
