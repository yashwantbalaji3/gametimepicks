/**
 * Per-slate v0.7 coverage report: starters and sixth men by team, with a reason code for every missing row.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * No NBA depth chart is committed, so this uses the audit's last-lineup proxy: the starters and top bench player of each
 * team's last game before the instant. It joins no outcome of the slate. Writes ONLY to --out-dir, outside the repo.
 *
 *   npx tsx scripts/nba/research/report-nba-v07-coverage.mjs --date 2026-11-02 --out-dir <dir outside the repo> [--as-of <ISO>]
 *
 * With a frozen v0.1 slate document, inputs are the blobs its latest receipt hashed, and --as-of is ignored. Without one,
 * inputs are the latest committed schedule, rosters and injury feed, and --as-of is required.
 */
import fs from "node:fs";
import path from "node:path";

import { FAMILIES } from "../../../src/lib/sports/nba/experimental-forecast.mjs";
import { foldBoxscores } from "../../../src/lib/sports/nba/season-fold.mjs";
import { buildV07Context, COVERAGE_STATUS, coverageReportV07 } from "../../../src/lib/sports/nba/minutes-model-v07.mjs";
import { APP, NBA, outDirOrRefuse, readBoxDir, readJson, receiptInputs } from "./nba-v07-inputs.mjs";

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
const DATE = arg("--date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) refuse("--date YYYY-MM-DD is required");
let OUT;
try { OUT = outDirOrRefuse(arg("--out-dir")); } catch (e) { refuse(e.message); }

const etDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

let asOf, rosters, injDoc, games, source;
const frozen = path.join(NBA, "experimental-v0.1", "forecasts", `${DATE}.json`);
if (fs.existsSync(frozen)) {
  const doc = readJson(frozen);
  const receipts = doc.games.map((g) => g.receipt);
  const latest = [...receipts].sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0];
  ({ rosters, injuries: injDoc } = receiptInputs([latest])(latest));
  if (!rosters || !injDoc) refuse(`${DATE}: no git blob for the receipt's inputs`);
  asOf = latest.generatedAt;
  games = doc.games;
  source = "FROZEN_RECEIPT_INPUTS";
} else {
  asOf = arg("--as-of");
  if (!asOf) refuse(`no frozen slate for ${DATE}: --as-of <ISO> is required`);
  rosters = readJson(path.join(NBA, "rosters", "latest.json"));
  injDoc = readJson(path.resolve(NBA, "..", "injuries", "nba", "latest.json"));
  games = readJson(path.join(APP, "public", "data", "nba", "schedule", "latest.json")).rows.filter((r) => r.seasonType === 2 && etDate(r.dateUtc) === DATE);
  if (!games.length) refuse(`no regular-season game scheduled on ${DATE}`);
  source = "LATEST_COMMITTED_INPUTS";
}

const corpus = readBoxDir(path.join(NBA, "boxscores"));
const fetched = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores")));
const fold = foldBoxscores(corpus, fetched, { now: asOf });
const context = buildV07Context({ boxscores: fold.docs, injuries: injDoc.entries ?? null, injuriesAsOf: null, asOfDateUtc: asOf });
const report = { ...coverageReportV07({ date: DATE, games, rosters, context }), source, games: games.length };

const L = [`# v0.7 coverage report, slate ${DATE}`, "", `Candidate, unarmed. ${report.proxy} Source ${source}, as of ${asOf}. ${report.games} games, ${report.totals.teams} teams.`, ""];
const line = (k, t) => `- ${k}: ${t.projected} of ${t.total} projected. Missing by reason: ${JSON.stringify(t.reasons)}`;
L.push(line("Starters", report.totals.starters), line("Sixth men", report.totals.sixthMen), line("Other rotation", report.totals.rotation), `- Teams with no lineup: ${report.totals.teamsWithNoLineup}`, "");
L.push("| Team | Starters projected | Sixth man | Unallocated | Missing rows |", "|---|---|---|---:|---|");
for (const t of report.teams) {
  const st = t.starters.filter((c) => c.status === COVERAGE_STATUS.PROJECTED).length;
  const six = t.sixthMen[0];
  const miss = t.missing.map((c) => `${c.name} (${c.role}, ${c.reason})`).join("; ");
  L.push(`| ${t.team} | ${t.teamReason ? t.teamReason : `${st} of ${t.starters.length}`} | ${six ? `${six.name}: ${six.status}` : "none"} | ${t.unallocatedMinutes ?? ""} | ${miss} |`);
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `coverage-${DATE}.json`), JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(OUT, `coverage-${DATE}.md`), L.join("\n"));
console.log(L.join("\n"));
