/**
 * READ-ONLY SWEEP · NFL pre-kickoff artifacts whose INPUTS postdate kickoff (P0, 2026-10-25).
 *
 * The event-window contract (src/lib/sports/nfl/current-event-contract.mjs) refuses an artifact when any
 * evidence stamp sits at/after kickoff. Until this fix, three producers in the same workflow checked only
 * `--now` (the window's logical clock) against kickoff — never their inputs' own `sourceAsOf`. A capture fetched
 * after kickoff inside a window whose `--now` preceded it therefore produced a pre-kickoff-labelled artifact.
 *
 * For every commit that added a forecast-receipt revision or rewrote a player board, this reads the injuries
 * and rosters captures AS THEY WERE IN THAT COMMIT (the workflow commits inputs and outputs together) and
 * reports each artifact that is labelled pre-kickoff (generatedAt < kickoff) while an input's sourceAsOf is at
 * or after kickoff — with whether any displayed value differs from the artifact it replaced.
 *
 * Writes nothing. Usage: node scripts/nfl/audit-nfl-post-kickoff-inputs.mjs [--json out.json]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { postKickoffInputs } from "../../src/lib/sports/nfl/input-stamps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 << 20 });
const show = (c, p) => { try { return JSON.parse(git("show", `${c}:${p}`)); } catch { return null; } };
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : null; };

const RECEIPTS = "data/internal/nfl/forecast-receipts";
const BOARDS = "app/public/data/nfl/player-board";
const INJ = "data/internal/research/injuries/nfl/latest.json";
const ROS = "app/public/data/nfl/rosters/latest.json";

const commits = git("log", "--format=%H %cI", "--reverse", "--", RECEIPTS, BOARDS).trim().split("\n").filter(Boolean).map((l) => l.split(" "));

/** The values a reader sees: the game forecast summary / the board's per-player markets. */
const receiptView = (r) => JSON.stringify(r?.forecastSummary ?? null);
const boardView = (b) => JSON.stringify((b?.players ?? []).map((p) => [p.playerId, p.markets]).sort());

const findings = [];
for (const [c, at] of commits) {
  const changed = git("show", "--format=", "--name-status", c).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
  const rel = changed.filter(([st, p]) => (st === "A" && p.startsWith(`${RECEIPTS}/`) && /\/\d+(-rev-\d{4}Z)?\.json$/.test(p))
    || ((st === "A" || st === "M") && p.startsWith(`${BOARDS}/`) && /\/\d+\.json$/.test(p)));
  if (!rel.length) continue;
  const inputs = { injuries: show(c, INJ), rosters: show(c, ROS) };
  for (const [st, p] of rel) {
    const doc = show(c, p);
    if (!doc?.kickoffUtc || !doc.generatedAt) continue;
    if (!(Date.parse(doc.generatedAt) < Date.parse(doc.kickoffUtc))) continue; // already post-kickoff-labelled: excluded by every reader
    const late = postKickoffInputs(inputs, doc.kickoffUtc);
    if (!late.length) continue;
    const isBoard = p.startsWith(BOARDS);
    let prior = null;
    if (isBoard && st === "M") prior = show(`${c}^`, p);
    if (!isBoard) {
      const dir = path.dirname(p);
      const id = String(doc.providerEventId);
      const siblings = git("ls-tree", "--name-only", `${c}^`, `${dir}/`).trim().split("\n").filter((f) => path.basename(f).startsWith(id));
      const before = siblings.map((f) => ({ f, d: show(`${c}^`, f) })).filter((x) => x.d && Date.parse(x.d.generatedAt) < Date.parse(x.d.kickoffUtc))
        .sort((a, b) => a.d.generatedAt.localeCompare(b.d.generatedAt));
      prior = before.at(-1)?.d ?? null;
      if (prior) findings.push({ kind: "RECEIPT_REVISION", file: p, commit: c, committedAt: at, eventId: id, kickoffUtc: doc.kickoffUtc, generatedAt: doc.generatedAt, late, replaces: before.at(-1).f, displayedValueDiffers: receiptView(prior) !== receiptView(doc) });
      else findings.push({ kind: "RECEIPT_FIRST", file: p, commit: c, committedAt: at, eventId: id, kickoffUtc: doc.kickoffUtc, generatedAt: doc.generatedAt, late, replaces: null, displayedValueDiffers: null });
      continue;
    }
    findings.push({ kind: "BOARD_RESTAMP", file: p, commit: c, committedAt: at, eventId: String(doc.providerEventId), kickoffUtc: doc.kickoffUtc, generatedAt: doc.generatedAt, late, replaces: st === "M" ? `${p}@${c.slice(0, 10)}^` : null, displayedValueDiffers: prior ? boardView(prior) !== boardView(doc) : null });
  }
}

const events = [...new Set(findings.map((f) => f.eventId))].sort();
const summary = {
  commitsScanned: commits.length,
  findings: findings.length,
  receiptRevisions: findings.filter((f) => f.kind === "RECEIPT_REVISION").length,
  firstReceipts: findings.filter((f) => f.kind === "RECEIPT_FIRST").length,
  boardRestamps: findings.filter((f) => f.kind === "BOARD_RESTAMP").length,
  events,
  displayedValueDiffers: findings.filter((f) => f.displayedValueDiffers === true).length,
};
console.log(JSON.stringify(summary, null, 1));
for (const f of findings) console.log(`${f.kind.padEnd(16)} ${f.eventId} kickoff ${f.kickoffUtc} gen ${f.generatedAt} · ${f.late.map((x) => `${x.input}.${x.field} ${x.stamp}`).join(", ")} · differs ${f.displayedValueDiffers} · ${f.file} @ ${f.commit.slice(0, 10)}`);
const out = arg("--json");
if (out) fs.writeFileSync(out, JSON.stringify({ summary, findings }, null, 1) + "\n");
