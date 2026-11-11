#!/usr/bin/env node
/**
 * NBA PROP PRICES · ONE LOCAL TICK on the release owner's machine (receipt
 * docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11.md; Program Director decision 2026-11-11, option B: the
 * founder's 2026-10-22 storage rule stands, so the capture never runs on a GitHub-hosted runner). Run through `npx tsx`
 * (it imports .ts modules; Node 20 cannot strip types), by node, so a launchd job can run it (bash/git launchd jobs
 * cannot read ~/Downloads; app/scripts/nba/launchd/README.md).
 *
 *   npx tsx app/scripts/nba/run-nba-props-local-tick.mjs --repo /abs/dedicated/checkout --private ~/gtp-private
 *        --key-env-file /abs/.env [--key-file /abs/private/odds.key] [--now ISO] [--apply] [--commit-ledger]
 *
 * THE KEY (founder 2026-11-11: no duplicate key file): --key-env-file names the existing dotenv file; only its
 * ODDS_API_KEY line is parsed (key-env-file.mjs), it must be mode 600, and no other variable of it enters this process's
 * environment or the capture's. --key-file (a file holding only the key, also mode 600) is an optional override. The key
 * is never logged, never written to the state file or the ledger.
 *
 * Every tick, in order (nothing paid before step 6):
 *   1. KILL SWITCH: <private>/odds/nba/STOP exists → exit 0, no network call.
 *   2. The dedicated checkout is synced to origin/main (refused unless it carries a `.gtp-capture-checkout` marker, so a
 *      development worktree is never reset). Schedule, ledger and receipt are read from it.
 *   3. MISSED_WINDOW: period games whose tip passed with no capture are recorded once in the private state (no spend).
 *   4. Targets: games 20–75 min before tip not yet captured (preflight.mjs tickTargets). None → exit 0, no network call.
 *   5. PREFLIGHT (free `/v4/sports`): receipt, plan balance, certain cost, ceiling, 2,000 floor, shared weekly cap
 *      (nbaPropsPreflight). A refusal records its reason; an action-needing one raises scripts/ops_alert.sh.
 *   6. Only with --apply and a passing preflight: the authorized capture (scripts/nba/capture-nba-props-odds.mjs: price
 *      records ONLY to <private>/odds/nba/props/, every call booked in the ledger, stop on any failure, no blind retry).
 *   7. With --commit-ledger: the ledger alone (credits, status, balance; no line, no price) is committed and pushed. It is
 *      an internal path, not a Vercel build input.
 * Without --apply the tick plans and preflights only (the free call is made only when --apply is also given).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { tickTargets, missedWindows, nbaPropsPreflight } from "../../src/lib/sports/odds/nba-props/preflight.mjs";
import { parseNbaPropsReceipt } from "../../src/lib/sports/odds/nba-props/credits.mjs";
import { resolvePrivateDataDir } from "../../src/lib/ops/private-data-dir.mjs";
import { readOddsKeyFromEnvFile } from "../../src/lib/sports/odds/nba-props/key-env-file.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../../src/lib/sports/odds/eligible-operators.mjs";
import { LEDGER_RELPATH } from "../../src/lib/sports/odds/p171-authorization.mjs";

export const RECEIPT_REL = "docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11.md";
export const MARKETS = Object.freeze(["player_points", "player_rebounds", "player_assists", "player_threes"]);
export const PERIOD = Object.freeze({ startUtc: "2026-11-11T05:00:00Z", endUtc: "2026-11-18T04:59:59Z" }); // 11-11 00:00 → 11-17 23:59 ET (EST)
export const CHECKOUT_MARKER = ".gtp-capture-checkout";

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const home = (p) => (p ? path.resolve(String(p).replace(/^~/, os.homedir())) : null);
const log = (o) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));

const SELF_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REPO = home(arg("--repo")) ?? SELF_REPO;
const NOW = arg("--now") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const priv = resolvePrivateDataDir({ cliDir: home(arg("--private")), repoRoot: REPO });
if (!priv.ok) { log({ state: "REFUSED", reason: priv.reason }); process.exit(2); }
const STATE_DIR = path.join(priv.dir, "odds", "nba", "props-runner");
const STATE_FILE = path.join(STATE_DIR, "state.json");

function alert(errorLine) {
  // scripts/ops_alert.sh never exits non-zero and carries only the redacted contract (docs/OPS_ALERTING_CONTRACT.md).
  spawnSync("bash", [path.join(REPO, "scripts", "ops_alert.sh")], { env: { ...process.env, PHASE: "nba-props-local-tick", EXIT_STATUS: "1", OPS_ALERT_KIND: "warning", ERROR_LINE: errorLine }, stdio: "ignore" });
}
const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const writeState = (s) => { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 1)}\n`, { mode: 0o600 }); };

// 1. kill switch
if (fs.existsSync(path.join(priv.dir, "odds", "nba", "STOP"))) { log({ state: "KILL_SWITCH", note: "STOP file present — no network call" }); process.exit(0); }

// A previous tick that booked credits it could not push would be forgotten by the reset below (and could re-price a game):
// such a tick blocks every later paid tick until a person resolves it and clears `ledgerUnpushed` in the state file.
const prior = readJson(STATE_FILE, null);
if (prior?.ledgerUnpushed) { log({ state: "REFUSED", reason: `the ledger of the tick at ${prior.ledgerUnpushed} was never pushed — resolve it, then clear ledgerUnpushed in ${STATE_FILE}` }); alert("NBA props: an earlier tick's ledger was never pushed; paid ticks are blocked until it is resolved"); process.exit(2); }
if (has("--apply") && !has("--commit-ledger")) { log({ state: "REFUSED", reason: "--apply needs --commit-ledger: the next tick resets the checkout, so an uncommitted ledger would be lost" }); process.exit(2); }

// 2. dedicated checkout, synced to origin/main
if (!fs.existsSync(path.join(REPO, CHECKOUT_MARKER))) { log({ state: "REFUSED", reason: `${REPO} has no ${CHECKOUT_MARKER} marker — the runner resets its checkout, so it only runs in a dedicated one` }); process.exit(2); }
const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" }).trim();
try { git("fetch", "-q", "origin", "main"); git("reset", "-q", "--hard", "origin/main"); }
catch (e) { log({ state: "STOPPED", reason: `could not sync the checkout: ${e.message.split("\n")[0]}` }); process.exit(1); }
const receiptPath = path.join(REPO, RECEIPT_REL);
const receiptText = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath, "utf8") : null;
if (!receiptText || !parseNbaPropsReceipt(receiptText, { now: NOW }).ok) { log({ state: "REFUSED", reason: `receipt ${RECEIPT_REL} absent or not valid at ${NOW} (expired, ceiling, or missing)` }); process.exit(0); }
const schedule = readJson(path.join(REPO, "app/public/data/nba/schedule/latest.json"), { rows: [] });
const ledgerPath = path.join(REPO, LEDGER_RELPATH.nba);
const ledger = readJson(ledgerPath);
const nowMs = Date.parse(NOW);

// 3. missed windows (recorded once each, private state only)
const state = readJson(STATE_FILE, { receipt: RECEIPT_REL, baselineUsed: null, baselineAt: null, missed: [], ticks: 0 });
const missed = missedWindows(schedule.rows, nowMs, ledger, { periodStartMs: Date.parse(PERIOD.startUtc), periodEndMs: Date.parse(PERIOD.endUtc), recorded: new Set(state.missed.map((m) => m.providerEventId)) });
state.missed.push(...missed.map((m) => ({ ...m, recordedAt: NOW })));
state.ticks += 1;
if (missed.length) log({ state: "MISSED_WINDOW", games: missed.map((m) => m.providerEventId) });

// 4. targets — none: no network call at all
const targets = tickTargets(schedule.rows, nowMs, ledger);
if (!targets.length) { writeState(state); log({ state: "NOTHING_TO_PRICE", now: NOW }); process.exit(0); }
if (!has("--apply")) { writeState(state); log({ state: "PLANNED", targets: targets.map((t) => t.providerEventId), note: "no --apply: no network call" }); process.exit(0); }

// 5. preflight on the free plan check
const keyFile = home(arg("--key-file")), keyEnvFile = home(arg("--key-env-file"));
let apiKey = "", keyRefusal = null;
if (keyFile) {
  try {
    const st = fs.statSync(keyFile);
    if ((st.mode & 0o077) !== 0) keyRefusal = `the --key-file is readable or writable by group or others (mode ${(st.mode & 0o777).toString(8)}); it must be 600`;
    else apiKey = fs.readFileSync(keyFile, "utf8").trim();
  } catch { keyRefusal = "the --key-file does not exist"; }
} else if (keyEnvFile) {
  const k = readOddsKeyFromEnvFile(keyEnvFile);
  if (k.ok) apiKey = k.key; else keyRefusal = k.reason;
} else apiKey = (process.env.ODDS_API_KEY ?? "").trim();
if (!apiKey) { writeState(state); log({ state: "REFUSED", reason: keyRefusal ?? "no API key (--key-env-file, --key-file or ODDS_API_KEY)" }); alert("NBA props tick: the Odds API key could not be read"); process.exit(2); }
let reply;
try {
  const r = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(apiKey)}`);
  reply = { status: r.status, headers: { "x-requests-used": r.headers.get("x-requests-used"), "x-requests-remaining": r.headers.get("x-requests-remaining"), "x-requests-last": r.headers.get("x-requests-last") } };
} catch (e) { reply = { status: 0, headers: {} }; }
const pf = nbaPropsPreflight({ now: NOW, receiptText, ledger, targets, markets: [...MARKETS], bookmakers: [...ELIGIBLE_OPERATOR_KEYS], reply, baselineUsed: state.baselineUsed, minCreditsRemaining: Number(process.env.ODDS_API_MIN_CREDITS_REMAINING ?? "2000") });
if (state.baselineUsed == null && reply.status === 200 && Number.isFinite(Number(reply.headers["x-requests-used"]))) { state.baselineUsed = Number(reply.headers["x-requests-used"]); state.baselineAt = NOW; }
writeState(state);
if (!pf.paidCallAllowed) {
  log({ state: "PREFLIGHT_REFUSED", reasons: pf.reasons, worstCase: pf.worstCase ?? null });
  if (pf.actionable) alert(`NBA props preflight refused: ${pf.reasons.join("; ").slice(0, 200)}`);
  process.exit(0);
}
log({ state: "PREFLIGHT_OK", worstCase: pf.worstCase, remaining: pf.remaining, weekSpend: pf.weekSpend, booked: pf.booked, ceiling: pf.ceiling });

// 6. the authorized capture (prices only to the private directory; every call on the ledger)
// process.execArgv carries tsx's loader flags (the runner is started through `npx tsx`), so the capture — which imports
// .ts modules — runs on any Node, not only on Node 22's type stripping.
const cap = spawnSync(process.execPath, [...process.execArgv, path.join(REPO, "app/scripts/nba/capture-nba-props-odds.mjs"), "--now", NOW, "--authorized", "--receipt", RECEIPT_REL,
  "--markets", MARKETS.join(","), "--lead-minutes", "20,75", "--phase", "pregame", "--apply", "--out-dir", priv.dir], {
  cwd: path.join(REPO, "app"), encoding: "utf8",
  env: { ...process.env, ODDS_API_KEY: apiKey, ODDS_MAX_EVENTS_PER_RUN: String(targets.length), ODDS_API_MIN_CREDITS_REMAINING: String(pf.minCreditsRemaining) },
});
let summary = null;
try { summary = JSON.parse(cap.stdout); } catch { summary = null; }
log({ state: "CAPTURE_EXIT", exit: cap.status, capture: summary ? { state: summary.state, records: summary.records, cumulativeCredits: summary.cumulativeCredits, refusals: summary.refusalCount ?? undefined } : null });
if (cap.status === 1 || cap.status === 4) alert(`NBA props capture ${cap.status === 4 ? "reached the ceiling" : "stopped"} (exit ${cap.status}); see the local tick log`);

// 7. commit the ledger alone (no line, no price), when asked
if (has("--commit-ledger") && git("status", "--porcelain", "--", LEDGER_RELPATH.nba)) {
  try {
    git("add", "--", LEDGER_RELPATH.nba);
    git("commit", "-q", "-m", `auto: nba props local tick ledger ${NOW} (credits only, receipt ${path.basename(RECEIPT_REL, ".md")}) [skip ci]`);
    git("push", "-q", "origin", "HEAD:main");
    log({ state: "LEDGER_COMMITTED" });
  } catch (e) {
    writeState({ ...state, ledgerUnpushed: NOW });
    log({ state: "LEDGER_NOT_PUSHED", reason: e.message.split("\n")[0] });
    alert("NBA props ledger could not be pushed; paid ticks are blocked until it is resolved");
  }
}
process.exit(cap.status === 0 ? 0 : 1);
