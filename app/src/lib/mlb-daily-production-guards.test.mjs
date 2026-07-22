/**
 * MLB DAILY PRODUCTION — guards (2026-07-22).
 *
 * Pins the automated MLB slate-completion pipeline: the completeness gate (honest slate status, never a fake ready
 * state) and the orchestrator workflow (fail-closed on missing board, path-scoped money-safe commit, Odds key from
 * the CI secret only, credit floor, non-blocking, never on PR). Money-independent.
 *
 * Run: npx tsx --test src/lib/mlb-daily-production-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { deriveSlateStatus } from "../../scripts/mlb-slate-completeness-gate.mjs";

const app = process.cwd();
const repo = path.dirname(app);
const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-daily-production.yml"), "utf8");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("1 · deriveSlateStatus never fabricates a ready state", () => {
  assert.deepEqual(deriveSlateStatus({ hasBoard: false, boardGames: 0, hasSim: false, hasTeamMarkets: false, hasPlayerProps: false }), { slateStatus: "NO_BOARD", readyToPublish: false, publicLabel: "Board pending" });
  assert.equal(deriveSlateStatus({ hasBoard: true, boardGames: 0 }).slateStatus, "NO_GAMES");
  assert.deepEqual(deriveSlateStatus({ hasBoard: true, boardGames: 17, hasSim: false }), { slateStatus: "SIMULATION_PENDING", readyToPublish: false, publicLabel: "Simulation pending" });
  assert.deepEqual(deriveSlateStatus({ hasBoard: true, boardGames: 17, hasSim: true, hasTeamMarkets: false, hasPlayerProps: false }), { slateStatus: "AWAITING_MARKET_DATA", readyToPublish: true, publicLabel: "Awaiting market data" });
  assert.equal(deriveSlateStatus({ hasBoard: true, boardGames: 17, hasSim: true, hasTeamMarkets: true, hasPlayerProps: true }).slateStatus, "READY");
  // a board WITHOUT a sim is NEVER publishable (the core honesty rule)
  assert.equal(deriveSlateStatus({ hasBoard: true, boardGames: 17, hasSim: false, hasTeamMarkets: true, hasPlayerProps: true }).readyToPublish, false);
});

test("2 · the live health report reflects the real slate state (July-22 pending, July-21 ready if present)", () => {
  const h = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/mlb-production-health.json"));
  if (!h) { console.log("  (skip — no health report generated in this checkout)"); return; }
  assert.equal(h.public, false);
  assert.ok(["NO_BOARD", "NO_GAMES", "SIMULATION_PENDING", "AWAITING_MARKET_DATA", "READY"].includes(h.slateStatus));
  // publishable ⇒ board + sim both present
  if (h.readyToPublish && h.slateStatus !== "NO_GAMES") { assert.equal(h.artifacts.board.present, true); assert.equal(h.artifacts.simulation.present, true); }
});

test("3 · orchestrator: chains after morning-projections + backstop cron + dispatch; never on PR; non-blocking", () => {
  assert.match(wf, /workflows:\s*\["morning-projections"\]/, "chains after the board workflow");
  assert.match(wf, /workflow_dispatch:/, "manual dispatch");
  assert.match(wf, /schedule:\s*\n\s*- cron:/, "backstop cron");
  assert.ok(!/^\s*pull_request:/m.test(wf), "no pull_request trigger");
  assert.match(wf, /github\.event_name != 'pull_request'/, "explicit PR guard");
  assert.ok((wf.match(/continue-on-error:\s*true/g) || []).length >= 4, "paid + commit steps are non-blocking");
});

test("4 · fail-closed on a missing board; the 3 completion steps run only when the board exists", () => {
  assert.match(wf, /FAIL-CLOSED/, "documents the fail-closed board precheck");
  assert.match(wf, /have_board=false/, "detects a missing board");
  // team markets / player props / simulations gated on have_board == true (match each script's enclosing step)
  const steps = wf.split(/\n\s*- name:/);
  for (const script of ["ingest-mlb-team-markets", "ingest-mlb-slate", "generate-mlb-game-simulations"]) {
    const step = steps.find((s) => s.includes(`app/scripts/${script}`)); // the invocation, not a doc-comment mention
    assert.ok(step, `${script} step exists`);
    assert.match(step, /steps\.board\.outputs\.have_board == 'true'/, `${script} runs only when the board exists`);
  }
});

test("5 · Odds API: key from the CI secret ONLY, credit floor, invalid-key honest no-op, no key leak", () => {
  assert.match(wf, /ODDS_API_KEY:\s*\$\{\{ secrets\.ODDS_API_KEY \}\}/, "key from the secret");
  assert.ok(!/\.env|ODDS_API_KEY=5|last4/.test(wf), "never reads a local .env key");
  assert.match(wf, /ODDS_API_MIN_CREDITS_REMAINING/, "credit floor threaded (props var)");
  assert.match(wf, /ODDS_CREDIT_FLOOR:/, "credit floor threaded under the team-markets var too");
  assert.match(wf, /vars\.ODDS_API_MIN_CREDITS_REMAINING \|\| '2000'/, "floor defaults to 2000");
  assert.match(wf, /honest no-op|nothing fabricated/, "invalid/missing key ⇒ honest no-op, no fabrication");
});

test("9 · both paid ingests: env-first key (CI secret) + fail-closed credit-floor pre-flight probe", () => {
  const tm = fs.readFileSync(path.join(app, "scripts/ingest-mlb-team-markets.mjs"), "utf8");
  const pp = fs.readFileSync(path.join(app, "scripts/ingest-mlb-slate.mjs"), "utf8");
  // key sourced from the environment (CI secret) — team-markets must NOT be .env-only (regression: ENOENT in CI)
  assert.match(pp, /process\.env\.ODDS_API_KEY/, "props reads the key from the environment");
  assert.match(tm, /process\.env\.ODDS_API_KEY/, "team-markets prefers the environment (CI secret), .env only a local fallback");
  // credit floor: a real remaining-credits probe that aborts below the floor, on BOTH ingests
  for (const [name, src, floorVar] of [["team-markets", tm, /ODDS_CREDIT_FLOOR/], ["props", pp, /ODDS_API_MIN_CREDITS_REMAINING/]]) {
    assert.match(src, /x-requests-remaining/, `${name} probes remaining credits`);
    assert.match(src, /below floor/, `${name} aborts below the floor`);
    assert.match(src, floorVar, `${name} reads its floor env var`);
  }
});

test("6 · the persist step is PATH-SCOPED to public MLB slate dirs + money-safe (never portfolio/settlement/product)", () => {
  const step = wf.slice(wf.indexOf("Persist completed slate"));
  const addLine = step.split("\n").find((l) => /^\s*git add /.test(l));
  assert.ok(addLine, "has a git add");
  assert.ok(!/git add\s+(-A|--all|\.|-u)(\s|$)/.test(addLine), "no blanket add");
  assert.match(addLine, /mlb\/team-markets|mlb\/player-props|mlb\/game-simulations/, "scoped to public MLB slate dirs");
  assert.match(step, /grep -iE 'portfolio\|mr-dub\|settled_leans\|bank-builder\|moonshot/, "safety-assert blocks money/settlement/product");
  assert.match(step, /ABORT/, "aborts on forbidden paths");
  assert.ok(!/push\s+.*(--force|-f\b)/.test(step), "no force push");
  assert.match(step, /\[skip ci\]/, "skips CI to avoid loops");
});

test("8 · .ts-importing ingest steps run via `npx tsx`, never bare `node` (regression: ERR_UNKNOWN_FILE_EXTENSION)", () => {
  // ingest-mlb-team-markets + ingest-mlb-slate import .ts libs (e.g. projection-framework.ts) → bare `node` throws
  // "Unknown file extension .ts". They MUST be invoked with `npx tsx`. (The pure gate/health .mjs may use `node`.)
  for (const s of ["ingest-mlb-team-markets.mjs", "ingest-mlb-slate.mjs"]) {
    const esc = s.replace(/\./g, "\\.");
    assert.ok(!new RegExp(`(^|[^x]\\s)node\\s+app/scripts/${esc}`, "m").test(wf), `${s} must NOT run via bare node (it imports .ts)`);
    assert.match(wf, new RegExp(`npx tsx app/scripts/${esc}`), `${s} runs via npx tsx`);
  }
  // ingest-mlb-team-markets REFUSES to run without --write | --dry-run (unlike ingest-mlb-slate, which writes by default).
  const tmStep = wf.split(/\n\s*- name:/).find((s) => s.includes("app/scripts/ingest-mlb-team-markets"));
  assert.match(tmStep, /ingest-mlb-team-markets\.mjs --write /, "team-markets ingest must pass --write (else it errors out and no market data is written)");
});

test("10 · daily health monitor carries the founder-facing ops fields + buildStatus finalize + credits sidecar", () => {
  const gate = fs.readFileSync(path.join(app, "scripts/mlb-slate-completeness-gate.mjs"), "utf8");
  // the gate emits the flat at-a-glance monitor fields the mission requires
  for (const f of ["boardGenerated", "teamMarketsGenerated", "playerPropsGenerated", "simulationGenerated", "creditsRemaining", "buildStatus", "missingArtifacts", "slateStatus"])
    assert.match(gate, new RegExp(f), `health report tracks ${f}`);
  assert.match(gate, /process\.env\.MLB_BUILD_STATUS/, "buildStatus is env-driven (pending until the post-build finalize pass)");
  assert.match(gate, /odds-credits\.json/, "creditsRemaining is read from the ingest sidecar (the gate never calls the paid API)");
  // workflow: build step has an id; a post-build finalize pass records the real build outcome
  assert.match(wf, /id: build/, "build step has an id for outcome reference");
  assert.match(wf, /MLB_BUILD_STATUS:\s*\$\{\{ steps\.build\.outcome \}\}/, "finalize records the build outcome");
  // regression: `npm run build` exited 127 (next not found) because deps were never installed → npm ci must precede it
  const depsIdx = wf.indexOf("npm ci"), buildIdx = wf.indexOf("npm run build");
  assert.ok(depsIdx > 0 && depsIdx < buildIdx, "npm ci installs deps BEFORE npm run build (else next: command not found → exit 127)");
  // both paid ingests write the credits sidecar the gate reads
  for (const s of ["ingest-mlb-team-markets.mjs", "ingest-mlb-slate.mjs"])
    assert.match(fs.readFileSync(path.join(app, "scripts", s), "utf8"), /odds-credits\.json/, `${s} writes the credits sidecar`);
  // if a live report exists in this checkout, it must carry the flat fields (never a fabricated ready state)
  const h = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/mlb-production-health.json"));
  if (h) for (const f of ["boardGenerated", "simulationGenerated", "slateStatus", "buildStatus", "missingArtifacts"]) assert.ok(f in h, `live report has ${f}`);
});

test("11 · production-history dashboard: expanded per-run fields + committed daily history + dated credits sidecar", () => {
  const gate = fs.readFileSync(path.join(app, "scripts/mlb-slate-completeness-gate.mjs"), "utf8");
  // expanded reliability fields the mission requires for the 30-day "how reliable is the pipeline?" answer
  for (const f of ["workflowRunId", "creditsBefore", "creditsAfter", "creditsSpent", "artifactCounts", "failureReason"])
    assert.match(gate, new RegExp(f), `health report tracks ${f}`);
  assert.match(gate, /process\.env\.GITHUB_RUN_ID/, "workflowRunId from GITHUB_RUN_ID (auto in Actions)");
  assert.match(gate, /production-history/, "gate writes a persisted daily history file");
  // the persist step commits the history dir (path-scoped, money-safe)
  const step = wf.slice(wf.indexOf("Persist completed slate"));
  assert.match(step.split("\n").find((l) => /^\s*git add /.test(l)), /production-history/, "history dir is committed");
  // ingests write a DATED readings sidecar so before/after/spent are per-slate-date (no stale-credit reporting)
  for (const s of ["ingest-mlb-team-markets.mjs", "ingest-mlb-slate.mjs"]) {
    const src = fs.readFileSync(path.join(app, "scripts", s), "utf8");
    assert.match(src, /readings/, `${s} writes a readings array`);
    assert.match(src, /date:\s*(args\.date|DATE)/, `${s} stamps the slate date on the sidecar`);
  }
  // gate only trusts a same-date sidecar
  assert.match(gate, /creditsSidecar\.date === date|sidecarFresh/, "gate ignores a stale (other-date) sidecar");
  // if a live history file exists, it carries the expanded fields
  const files = (() => { try { return fs.readdirSync(path.join(repo, "data/internal/mlb/production-history")); } catch { return []; } })();
  const hf = files.find((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (hf) { const h = readJson(path.join(repo, "data/internal/mlb/production-history", hf)); for (const f of ["workflowRunId", "artifactCounts", "creditsSpent", "failureReason"]) assert.ok(f in h, `history file has ${f}`); }
});

test("7 · gate + orchestrator are money-independent; money md5 unchanged", () => {
  // the gate writes only the internal health status; the orchestrator's grep never lets money/public/portfolio through
  assert.ok(!/portfolio\.json|bankroll|crown|openExposure/.test(fs.readFileSync(path.join(app, "scripts/mlb-slate-completeness-gate.mjs"), "utf8").replace(/mr-dub/g, "")), "gate never touches money");
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
