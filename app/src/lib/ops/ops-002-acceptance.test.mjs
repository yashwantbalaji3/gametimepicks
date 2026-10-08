/**
 * OPS-002 — the seven-day acceptance verdict cannot pass on absence of evidence (scripts/ops-002-acceptance.mjs).
 *
 * "0 TEAM_ACCESS_REQUIRED" is also what a window with no bot deployments, or a Production that stopped
 * updating, looks like. Each test below is one way the earlier zero-failures check would have said "clean"
 * without having observed the fix work.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { acceptanceVerdict, normalize, isDataCommit, BOT_EMAIL } = await import(pathToFileURL(path.join(ROOT, "scripts/ops-002-acceptance.mjs")).href);

const H = 3_600_000, DAY = 24 * H;
const CUT = Date.parse("2026-10-08T06:00:00Z");
let n = 0;
/** A Vercel /v6/deployments row as the API returns it. */
function dep({ at, state = "READY", login = "github-actions[bot]", type = "bot", email = BOT_EMAIL, msg = "auto: mlb lineup refresh [skip ci]", block, err, sha }) {
  n++;
  return normalize({
    uid: `dpl_${n}`,
    created: at,
    readyState: state,
    errorMessage: err,
    seatBlock: block ? { blockCode: block } : undefined,
    attribution: { gitUser: { login, type } },
    meta: { githubCommitAuthorEmail: email, githubCommitMessage: msg, githubCommitSha: sha ?? `sha${String(n).padStart(8, "0")}` },
  });
}
/** Seven-plus clean days: one READY bot data deployment every 6 h, Production on the newest. */
function healthy(days = 7.2) {
  const deps = [];
  for (let t = CUT; t < CUT + days * DAY; t += 6 * H) deps.push(dep({ at: t }));
  const last = deps.at(-1);
  return { deployments: deps, cutover: CUT, now: CUT + days * DAY, buildInfoSha: last.sha, mainSha: last.sha };
}
const v = (a) => acceptanceVerdict(a);

test("a full, exercised, fresh window passes", () => {
  const r = v(healthy());
  assert.equal(r.verdict, "PASS", JSON.stringify(r.reasons));
  assert.equal(r.exit, 0);
  assert.equal(r.evidence.readyAsBotPerDay.length, 7);
});

test("zero blocks but ZERO bot deployments is NOT_YET, never PASS", () => {
  const h = healthy();
  const human = dep({ at: h.now - H, login: "yashwantbalaji3", type: "user", email: "x@users.noreply.github.com", msg: "Merge pull request #1" });
  const r = v({ ...h, deployments: [human], buildInfoSha: human.sha, mainSha: human.sha });
  assert.equal(r.verdict, "NOT_YET");
  assert.ok(r.reasons.notYet.some((x) => /no READY github-actions\[bot\] data deployment since cutover/.test(x)));
});

test("a single day without a bot deployment is NOT_YET (that day proved nothing)", () => {
  const h = healthy();
  const deployments = h.deployments.filter((d) => !(d.created >= CUT + 3 * DAY && d.created < CUT + 4 * DAY));
  const r = v({ ...h, deployments });
  assert.equal(r.verdict, "NOT_YET");
  assert.ok(r.reasons.notYet.some((x) => /day 4/.test(x)));
});

test("fewer than seven days is NOT_YET; no cutover is NOT_YET", () => {
  assert.equal(v(healthy(2.5)).verdict, "NOT_YET");
  assert.equal(v({ ...healthy(), cutover: null }).verdict, "NOT_YET");
});

test("Production freshness must be positively verified", () => {
  const h = healthy();
  assert.equal(v({ ...h, buildInfoSha: null }).verdict, "STALE", "build-info unreadable");
  assert.equal(v({ ...h, mainSha: null }).verdict, "STALE", "main unreadable");
  assert.equal(v({ ...h, buildInfoSha: h.deployments.at(-3).sha }).verdict, "STALE", "site behind newest READY");
  assert.equal(v({ ...h, mainSha: "deadbeef" }).verdict, "STALE", "main head never reached Vercel");
  const stuck = dep({ at: h.now - 45 * 60_000, state: "BUILDING" });
  assert.equal(v({ ...h, deployments: [...h.deployments, stuck], mainSha: stuck.sha }).verdict, "STALE", "build stuck > 30 min");
  const errored = dep({ at: h.now - 5 * 60_000, state: "ERROR" });
  assert.equal(v({ ...h, deployments: [...h.deployments, errored], mainSha: errored.sha }).verdict, "STALE");
});

test("legitimate in-flight and ignored deployments after the newest READY stay fresh", () => {
  const h = healthy();
  const skip = dep({ at: h.now - 20 * 60_000, state: "CANCELED", err: "The deployment was canceled because the Ignored Build Step command returned exit code 0." });
  const building = dep({ at: h.now - 10 * 60_000, state: "BUILDING" });
  assert.equal(v({ ...h, deployments: [...h.deployments, skip, building], mainSha: building.sha }).verdict, "PASS");
  assert.equal(v({ ...h, deployments: [...h.deployments, skip], mainSha: skip.sha }).verdict, "PASS");
});

test("a TEAM_ACCESS_REQUIRED block or a foreign identity after cutover is FAIL, even with everything else green", () => {
  const h = healthy();
  const blocked = dep({ at: CUT + DAY, state: "BLOCKED", login: "bot", type: "user", email: "bot@users.noreply.github.com", block: "TEAM_ACCESS_REQUIRED" });
  assert.equal(v({ ...h, deployments: [...h.deployments, blocked] }).verdict, "FAIL");
  const legacy = dep({ at: CUT + 2 * DAY, login: "bot", type: "user", email: "bot@users.noreply.github.com" });
  const r = v({ ...h, deployments: [...h.deployments, legacy] });
  assert.equal(r.verdict, "FAIL");
  assert.equal(r.exit, 2);
  // the login alone is not the identity: Vercel's account type and the id-bound email must match too
  for (const odd of [{ type: "user" }, { email: "github-actions@users.noreply.github.com" }]) {
    const x = dep({ at: CUT + 3 * DAY, ...odd });
    assert.equal(v({ ...h, deployments: [...h.deployments, x] }).verdict, "FAIL", JSON.stringify(odd));
  }
});

test("pre-cutover legacy commits (runs that started before the merge) do not count against acceptance", () => {
  const h = healthy();
  const before = dep({ at: CUT - H, login: "bot", type: "user", email: "bot@users.noreply.github.com" });
  assert.equal(v({ ...h, deployments: [before, ...h.deployments] }).verdict, "PASS");
});

test("the roll-forward convention counts as a data commit; a retired identity fails even under an unknown subject", () => {
  const h = healthy();
  const roll = dep({ at: CUT + DAY, login: "bot", type: "user", email: "bot@users.noreply.github.com", msg: "Daily roll-forward 2026-10-09 (settled 2026-10-08) — automated" });
  assert.equal(v({ ...h, deployments: [...h.deployments, roll] }).verdict, "FAIL");
  const odd = dep({ at: CUT + DAY, login: "web-flow", type: "user", email: "noreply@github.com", msg: "refresh things" });
  assert.equal(v({ ...h, deployments: [...h.deployments, odd] }).verdict, "FAIL");
  const human = dep({ at: CUT + DAY, login: "yashwantbalaji3", type: "user", email: "117693418+yashwantbalaji3@users.noreply.github.com", msg: "Merge pull request #2" });
  assert.equal(v({ ...h, deployments: [...h.deployments, human] }).verdict, "PASS", "human merges are not data commits");
});

/**
 * Coverage: every commit subject a producer can write must be recognised as a data commit, or the identity check
 * silently skips it. Reads the literal subjects in the workflows and commit scripts: `git commit -m "<lit>"`,
 * `commit-generated.sh "<lit>"`, and for `git commit -m "$MSG"` the nearest preceding `MSG="…"`.
 */
test("every automated commit subject in the workflows and commit scripts is classified as a data commit", () => {
  const files = [
    ...fs.readdirSync(path.join(ROOT, ".github/workflows")).filter((f) => /\.ya?ml$/.test(f)).map((f) => path.join(ROOT, ".github/workflows", f)),
    path.join(ROOT, "scripts/roll_to_next_day.sh"),
  ];
  const subjects = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      const lit = line.match(/git\s+commit\b[^"\n]*-m\s+"([^"$][^"]*)"/) ?? line.match(/commit-generated\.sh\s+"([^"]+)"/);
      if (lit) subjects.push([path.basename(file), lit[1]]);
      if (/git\s+commit\b.*-m\s+"\$MSG"/.test(line)) {
        const prev = lines.slice(0, i).reverse().find((l) => /^\s*MSG="/.test(l));
        assert.ok(prev, `${path.basename(file)}:${i + 1} commits $MSG with no MSG= before it`);
        subjects.push([path.basename(file), prev.match(/MSG="([^"]*)"/)[1]]);
      }
    });
  }
  assert.ok(subjects.length >= 40, `parsed ${subjects.length} commit subjects`);
  const unknown = subjects.filter(([, m]) => !isDataCommit({ message: m })).map(([f, m]) => `${f}: ${m}`);
  assert.deepEqual(unknown, []);
});
