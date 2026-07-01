/**
 * promote-bank-builder-proposal.mjs — safely PROMOTE the operator-approved Bank Builder lanes
 * (mr-dub/bank-builder-approved.json) into the ACTIVE daily paper-lane state so the nightly settlement can
 * grade them from official results.
 *
 *   node --run … (default DRY-RUN, prints the plan + safety checks, writes nothing)
 *   npx tsx app/scripts/promote-bank-builder-proposal.mjs --date 2026-07-01 --apply
 *
 * MONEY-SAFE by construction:
 *   • it never writes canonical portfolio.json — it snapshots that file's md5 BEFORE and AFTER and ABORTS
 *     if it changed (a promotion must never move canonical crown/bankroll; only official settlement does).
 *   • it validates the approved snapshot (date, ≥1 lane, every leg has a settlement-supported market +
 *     selection + numeric odds + a kickoff) and reports each leg's live status honestly (pregame /
 *     in progress / awaiting settlement) — it never asserts a hit/miss.
 *   • --apply just runs activate-daily-portfolio (which now injects the approved lanes as ACTIVE); the
 *     approved snapshot is the durable source of truth, so refreshes keep the lanes pinned.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const DATE = val("--date", new Date().toISOString().slice(0, 10));
const APPLY = has("--apply");

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DATA = path.join(REPO, "app", "public", "data");
const PORTFOLIO = path.join(DATA, "mr-dub", "portfolio.json");
const APPROVED = path.join(DATA, "mr-dub", "bank-builder-approved.json");
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

console.log(`=== promote Bank Builder · date=${DATE} · ${APPLY ? "APPLY" : "DRY-RUN"} ===`);

// ── validate the approved snapshot ──
let doc;
try { doc = JSON.parse(fs.readFileSync(APPROVED, "utf8")); } catch { die(`no approved snapshot at ${APPROVED}`); }
if (doc.date !== DATE) die(`approved snapshot date ${doc.date} ≠ --date ${DATE}`);
if (!Array.isArray(doc.lanes) || !doc.lanes.length) die("approved snapshot has no lanes");

const SETTLEABLE = new Set(["moneyline_90", "double_chance", "draw_no_bet", "match_total_goals", "btts"]);
const GAME_MS = 2.5 * 60 * 60 * 1000;
const now = Date.now();
const legStatus = (ko) => { const t = Date.parse(ko ?? ""); return !Number.isFinite(t) || t > now ? "pregame" : now - t >= GAME_MS ? "awaiting settlement" : "in progress"; };

let legOk = 0, legBad = 0;
for (const lane of doc.lanes) {
  console.log(`\n  ${lane.label}  (+${lane.combinedOdds}, $${lane.stake ?? 100} → $${lane.potentialReturn}, ${lane.confidence})`);
  for (const leg of lane.legs ?? []) {
    const ok = SETTLEABLE.has(leg.market) && leg.selection && typeof leg.americanOdds === "number" && leg.kickoffUtc;
    (ok ? legOk++ : legBad++);
    console.log(`     ${ok ? "✓" : "✗"} ${leg.marketLabel}: ${leg.selection} (${leg.americanOdds}) · ${leg.matchup} → ${legStatus(leg.kickoffUtc)}`);
  }
}
if (legBad) die(`${legBad} leg(s) are not settlement-supported — refusing to promote`);
console.log(`\n  ${legOk} legs validated · all settlement-supported.`);

const moneyBefore = md5(PORTFOLIO);
console.log(`  canonical portfolio md5 (pre) = ${moneyBefore}`);

if (!APPLY) {
  console.log("\n  DRY-RUN — run with --apply to write the active paper lanes (activate-daily-portfolio). No files written.");
  process.exit(0);
}

// ── apply: activate-daily-portfolio injects the approved lanes as ACTIVE (paper). ──
console.log("\n  applying → activate-daily-portfolio --apply …");
execFileSync("npx", ["tsx", path.join(REPO, "app", "scripts", "activate-daily-portfolio.mjs"), "--date", DATE, "--apply"], { cwd: REPO, stdio: "inherit" });

const moneyAfter = md5(PORTFOLIO);
if (moneyBefore !== moneyAfter) die(`canonical portfolio.json CHANGED during promotion (before=${moneyBefore} after=${moneyAfter}) — a promotion must never move canonical money. INVESTIGATE.`);
console.log(`\n  ✓ canonical portfolio md5 unchanged (${moneyAfter}) — promotion is paper-only.`);
console.log("  ✓ PROMOTED — the approved Bank Builder lanes are the active paper ladder; the nightly settlement grades them from official results.");
