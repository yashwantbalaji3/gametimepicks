#!/usr/bin/env node
/**
 * SESSION 12 · APPEND-ONLY WITHDRAWALS FOR FROZEN TOP-5 ROWS. $0 — reads committed artifacts only.
 *
 *   node scripts/results/record-top-board-withdrawals.mjs --now <ISO> [--dry-run]
 *   node scripts/results/record-top-board-withdrawals.mjs --verify-staged     (commit-time guard)
 *
 * For each frozen day (results/top-boards/<day>.json) with a row kicking off within [now − 3 days, now + 2 days],
 * reads the receipt's own recorded participation and each game's per-game player board, and APPENDS to
 * results/top-board-withdrawals/<day>.json any WITHDRAWN / REINSTATED event that pre-kickoff evidence newly
 * justifies. The frozen receipt is never opened for writing. Rules: src/lib/results/v2/top-board-withdrawals.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { appendWithdrawals, observeRows, verifyAppendOnly } from "../../src/lib/results/v2/top-board-withdrawals.mjs";

const APP = process.cwd();
const RECEIPTS = path.join(APP, "public/data/results/top-boards");
const OUT_DIR = path.join(APP, "public/data/results/top-board-withdrawals");
const BOARDS = path.join(APP, "public/data/nfl/player-board");
const BACK_MS = 3 * 24 * 3600 * 1000;
const AHEAD_MS = 2 * 24 * 3600 * 1000;

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function verifyStaged() {
  const rel = "app/public/data/results/top-board-withdrawals/";
  const repo = path.resolve(APP, "..");
  const staged = execFileSync("git", ["diff", "--cached", "--name-status", "--", rel], { cwd: repo, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  let bad = 0;
  for (const line of staged) {
    const [st, file] = line.split(/\s+/);
    if (st !== "A" && st !== "M") { console.error(`REFUSED: ${file} is ${st} — a withdrawal log is only ever added or appended`); bad += 1; continue; }
    let prev = null;
    if (st === "M") prev = JSON.parse(execFileSync("git", ["show", `HEAD:${file}`], { cwd: repo, encoding: "utf8" }));
    const next = JSON.parse(fs.readFileSync(path.join(repo, file), "utf8"));
    const v = verifyAppendOnly(prev, next);
    if (!v.ok) { console.error(`REFUSED: ${file} — ${v.reason}`); bad += 1; } else console.log(`${file}: append-only ✓ (${(prev?.events?.length ?? 0)} → ${next.events.length} events)`);
  }
  process.exit(bad ? 1 : 0);
}

function main() {
  if (process.argv.includes("--verify-staged")) return verifyStaged();
  const NOW = arg("--now");
  const DRY = process.argv.includes("--dry-run");
  const now = Date.parse(NOW ?? "");
  if (!Number.isFinite(now)) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
  const boardsByEvent = {};
  if (fs.existsSync(BOARDS)) for (const f of fs.readdirSync(BOARDS).filter((x) => /^\d+\.json$/.test(x))) {
    const b = read(path.join(BOARDS, f));
    if (b?.providerEventId) boardsByEvent[String(b.providerEventId)] = b;
  }
  let wrote = 0;
  const days = fs.existsSync(RECEIPTS) ? fs.readdirSync(RECEIPTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  for (const f of days) {
    const receipt = read(path.join(RECEIPTS, f));
    const kicks = (receipt?.boards ?? []).flatMap((b) => (b.rows ?? []).map((r) => Date.parse(String(r.kickoffUtc).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"))));
    if (!kicks.some((k) => Number.isFinite(k) && k >= now - BACK_MS && k <= now + AHEAD_MS)) continue;
    const file = path.join(OUT_DIR, f);
    const prev = read(file);
    const next = appendWithdrawals(prev, receipt, observeRows(receipt, boardsByEvent), NOW);
    const v = verifyAppendOnly(prev, next);
    if (!v.ok) { console.error(`REFUSED: ${f} — ${v.reason}`); process.exit(1); }
    const added = next.events.length - (prev?.events?.length ?? 0);
    if (!added) { console.log(`${f}: no new withdrawal evidence (${next.events.length} event(s))`); continue; }
    for (const e of next.events.slice(-added)) console.log(`${f}: ${e.status} ${e.name ?? e.playerId} · ${e.reason} · ${e.source} @ ${e.observedAt} (kickoff ${e.kickoffUtc})`);
    if (DRY) continue;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    wrote += 1;
  }
  if (!wrote && !DRY) console.log("nothing to append");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
