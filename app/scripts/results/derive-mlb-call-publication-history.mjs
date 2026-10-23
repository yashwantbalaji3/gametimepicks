#!/usr/bin/env node
/**
 * DERIVE THE MLB CALL PUBLICATION HISTORY FROM GIT (independent audit 2026-10-23, F05). Read-only, $0.
 *
 *   node scripts/results/derive-mlb-call-publication-history.mjs            # prints the history as JSON
 *   node scripts/results/derive-mlb-call-publication-history.mjs --verify   # checks the classifier against served commits
 *
 * Whether an MLB game call was shown to readers or held back as paused is decided at BUILD time by the live-record
 * gate (lib/ops/live-record-gate.mjs) from the model-health scorecard the build reads. The graded ledger does not
 * record it, and the scorecard is overwritten nightly, so the only durable evidence of "what was paused when" is the
 * first-parent history of main: when each piece of gate code landed, and every committed scorecard's states.
 *
 * This script re-derives that evidence; lib/results/mlb-call-publication.mjs holds the committed copy, and
 * mlb-call-publication.test.mjs proves the two are identical whenever the clone has the history (a shallow clone
 * skips that check — it can never confirm the copy, so it never pretends to).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCORECARD = "app/public/data/admin/model-health.json";
const GATED = ["mlb_moneyline", "mlb_total", "mlb_run_line", "mlb_run_line_posted"];

const git = (...args) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).toString();
const iso = (s) => new Date(Date.parse(s)).toISOString().replace(/\.000Z$/, "Z");

/** The first-parent main commit that brought `sha` into main, with its commit time — when Production could serve it. */
function landedOnMain(sha, ref) {
  // First-parent commits oldest → newest; "contains sha" is monotone along that chain, so binary-search the first.
  const lines = git("log", "--first-parent", "--reverse", "--format=%H %cI", ref).trim().split("\n");
  const contains = (h) => { try { execFileSync("git", ["merge-base", "--is-ancestor", sha, h], { cwd: ROOT, stdio: "ignore" }); return true; } catch { return false; } };
  let lo = 0, hi = lines.length - 1;
  if (!contains(lines[hi].split(" ")[0])) return null;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (contains(lines[mid].split(" ")[0])) hi = mid; else lo = mid + 1; }
  const [h, at] = lines[lo].split(" ");
  return { commit: h.slice(0, 10), at: iso(at) };
}

/**
 * @param {{ ref?: string, through?: string | null }} [opts]  through: the last scorecard commit to include (default: newest)
 */
export function deriveMlbCallPublicationHistory({ ref = "origin/main", through = null } = {}) {
  if (git("rev-parse", "--is-shallow-repository").trim() === "true") throw new Error("shallow clone: the history cannot be derived");
  /* The call surface (S009, the Game Report leads with the pick) and each gate's code, as each first reached main. */
  const surfaceLive = landedOnMain("ae7f5849b6", ref);
  const totalGate = landedOnMain("fa60baf1e3", ref);
  const winnerGate = landedOnMain("39650f3e56", ref);
  const postedGate = landedOnMain("a3c1ed42a6", ref);
  const gateLive = { mlb_total: totalGate, mlb_moneyline: winnerGate, mlb_run_line: winnerGate, mlb_run_line_posted: postedGate };

  /* Every committed scorecard reachable from main, by commit time. NOT first-parent: main was fast-forwarded through
     merge-into-branch commits (e.g. 2fc8e7fb86 on 2026-09-18), so the first-parent chain skips the nightly settle
     commits that were pushed straight to main and dates their scorecards hours or days late. The nightly settle pushes
     to main as it commits, so a scorecard's commit time is when a Production build could first read it. */
  const commits = git("log", "--format=%H %cI", ref, "--", SCORECARD).trim().split("\n").filter(Boolean)
    .map((l) => { const [h, at] = l.split(" "); return { h, at: iso(at) }; })
    .sort((x, y) => x.at.localeCompare(y.at) || x.h.localeCompare(y.h));
  const observations = [];
  for (const { h, at } of commits) {
    const doc = JSON.parse(git("show", `${h}:${SCORECARD}`));
    const states = Object.fromEntries((doc.families ?? []).filter((f) => GATED.includes(f.id)).map((f) => [f.id, f.state]));
    observations.push({ at, commit: h.slice(0, 10), generatedAt: doc.generatedAt, breached: GATED.filter((id) => states[id] === "BREACHED") });
    if (through && h.startsWith(through)) break;
  }
  const last = observations.at(-1);
  return {
    surfaceLive,
    gateLive,
    observations,
    recordedThrough: last ? { commit: last.commit, at: last.at, generatedAt: last.generatedAt } : null,
  };
}


/**
 * --verify: for every game the deployment evidence found SERVED, read the served commit itself — does it contain each
 * gate's code, and what did ITS scorecard say? — and compare with the classifier. A PUBLIC/PAUSED answer must equal
 * the exact one; UNKNOWN is allowed (it claims nothing). Local only: it reads hundreds of historical blobs.
 */
export async function verifyAgainstServedCommits() {
  const fs = await import("node:fs");
  const { mlbCallPublication, servedEvidence, MLB_CALL_FAMILY } = await import("../../src/lib/results/mlb-call-publication.mjs");
  const APP = path.join(ROOT, "app");
  const classification = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/ops/forecast-of-record-shadow/classification.json"), "utf8"));
  const evidence = servedEvidence(classification);
  const scorecard = JSON.parse(fs.readFileSync(path.join(APP, "public/data/admin/model-health.json"), "utf8"));
  const rows = fs.readFileSync(path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const games = new Map(classification.games.filter((g) => g.status === "SERVED" && g.deployment?.sha).map((g) => [`${g.gamePk}|${g.date}`, g.deployment]));
  const GATE_CODE = { mlb_total: "fa60baf1e3", mlb_moneyline: "39650f3e56", mlb_run_line: "39650f3e56", mlb_run_line_posted: "a3c1ed42a6" };
  const memo = new Map();
  const exactAt = (sha, readyAt) => {
    if (memo.has(sha)) return memo.get(sha);
    const has = (c) => { try { execFileSync("git", ["merge-base", "--is-ancestor", c, sha], { cwd: ROOT, stdio: "ignore" }); return true; } catch { return false; } };
    let doc = null;
    try { doc = JSON.parse(git("show", `${sha}:${SCORECARD}`)); } catch { /* no scorecard yet */ }
    const fresh = doc && Date.parse(readyAt) - Date.parse(doc.generatedAt) <= 72 * 3600e3;
    const breached = new Set(fresh ? (doc.families ?? []).filter((f) => f.state === "BREACHED").map((f) => f.id) : []);
    const out = Object.fromEntries(Object.keys(GATE_CODE).map((f) => [f, has(GATE_CODE[f]) && (breached.has(f) || (f === "mlb_run_line_posted" && breached.has("mlb_run_line")))]));
    memo.set(sha, out);
    return out;
  };
  const tally = { checked: 0, agree: 0, unknown: 0, disagree: [] };
  for (const r of rows) {
    const d = games.get(`${r.gamePk}|${r.date}`);
    if (!d || !MLB_CALL_FAMILY[r.market]) continue;
    const exact = exactAt(d.sha, d.readyAt)[MLB_CALL_FAMILY[r.market]] ? "PAUSED" : "PUBLIC";
    const got = mlbCallPublication(r, { scorecard, evidence }).status;
    tally.checked += 1;
    if (got === "UNKNOWN") tally.unknown += 1;
    else if (got === exact) tally.agree += 1;
    else tally.disagree.push({ gamePk: r.gamePk, date: r.date, market: r.market, exact, got, sha: d.sha.slice(0, 10) });
  }
  return { ...tally, servedCommits: memo.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv.includes("--verify") ? await verifyAgainstServedCommits() : deriveMlbCallPublicationHistory();
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
