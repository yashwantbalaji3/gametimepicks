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
    const step = steps.find((s) => s.includes(script));
    assert.ok(step, `${script} step exists`);
    assert.match(step, /steps\.board\.outputs\.have_board == 'true'/, `${script} runs only when the board exists`);
  }
});

test("5 · Odds API: key from the CI secret ONLY, credit floor, invalid-key honest no-op, no key leak", () => {
  assert.match(wf, /ODDS_API_KEY:\s*\$\{\{ secrets\.ODDS_API_KEY \}\}/, "key from the secret");
  assert.ok(!/\.env|ODDS_API_KEY=5|last4/.test(wf), "never reads a local .env key");
  assert.match(wf, /ODDS_API_MIN_CREDITS_REMAINING/, "credit floor threaded");
  assert.match(wf, /vars\.ODDS_API_MIN_CREDITS_REMAINING \|\| '2000'/, "floor defaults to 2000");
  assert.match(wf, /honest no-op|nothing fabricated/, "invalid/missing key ⇒ honest no-op, no fabrication");
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
});

test("7 · gate + orchestrator are money-independent; money md5 unchanged", () => {
  // the gate writes only the internal health status; the orchestrator's grep never lets money/public/portfolio through
  assert.ok(!/portfolio\.json|bankroll|crown|openExposure/.test(fs.readFileSync(path.join(app, "scripts/mlb-slate-completeness-gate.mjs"), "utf8").replace(/mr-dub/g, "")), "gate never touches money");
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
