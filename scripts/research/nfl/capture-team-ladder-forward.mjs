#!/usr/bin/env node
/**
 * NFL-002 TEAM LADDER — FORWARD SHADOW CAPTURE (private; never published).
 *
 * The preregistration (reports/nfl-002-team-ladder-preregistration.json, "forwardEvidence") commits L6
 * nfl-team-stack-v1 to a frozen pre-kickoff receipt for every 2026 Week 5+ regular-season game,
 * independent of its held-out verdict. This writes them, with the dev-frozen fits from the committed
 * dev report, beside the published forecast's own numbers for a paired forward comparison.
 *
 *   node scripts/research/nfl/capture-team-ladder-forward.mjs --now <ISO> --week <n> [--season 2026]
 *
 * Refusals: a game at/after kickoff is never captured; an existing capture for the week is never
 * overwritten (a later capture is a new file with lineage). L6 is QB-blind like the incumbent; each row
 * carries the same team-input coherence state the published forecast carries.
 * Lives outside app/ on purpose: research captures never trigger an app build.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { foldTeamLadder, predictStack, spreadProbabilities, totalProbabilities, L6_ID } from "../../../app/src/lib/sports/nfl/team-ladder-v2.mjs";
import { rowsFromTable, neutralSiteOf, GAMES_HISTORY_V2 } from "../../../app/src/lib/sports/nfl/win-margin-heads.mjs";
import { EFFICIENCY_HISTORY, CURRENT_SEASON, toNflverseAbbr } from "../../../app/src/lib/sports/nfl/totals-play-efficiency.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
const NOW = argOf("--now");
const WEEK = Number(argOf("--week"));
const SEASON = Number(argOf("--season", "2026"));
if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
if (Date.parse(NOW) > Date.now() + 60_000) refuse("--now is in the future; forward captures use the real clock");
if (!Number.isInteger(WEEK)) refuse("--week <n> required");

const prereg = read("data/internal/research/nfl/reports/nfl-002-team-ladder-preregistration.json");
const dev = read("data/internal/research/nfl/reports/nfl-002-team-ladder-dev.json");
const fit = dev.fits[L6_ID];
const params = { ...dev.eloFixed, ...dev.selected };
const history = read(GAMES_HISTORY_V2);
const current = read(CURRENT_SEASON);
if (current.state !== "CAPTURED") refuse("current-season capture is not CAPTURED");
const games = [...rowsFromTable(history), ...rowsFromTable(current).filter((g) => g.season > history.seasons[1])];
const eff = [...read(EFFICIENCY_HISTORY).rows, ...(current.efficiencyRows ?? []).filter((r) => r.season > history.seasons[1])];
const neutral = new Set((current.neutralEspnIds ?? []).map(String));

const schedule = read("app/public/data/nfl/schedule/latest.json");
const targets = (schedule.rows ?? []).filter((r) => r.seasonType === 2 && r.week === WEEK && r.statusRaw === "STATUS_SCHEDULED");
if (!targets.length) refuse(`no scheduled regular-season week ${WEEK} games`);
const published = new Map((read("app/public/data/nfl/forecasts/latest.json").forecasts ?? []).map((f) => [f.providerEventId, f]));

// Rest = days since the team's previous game this season (schedule-derived, known in advance; 7 for an opener).
const seasonDates = new Map();
for (const g of games.filter((x) => x.season === SEASON)) for (const t of [g.home, g.away]) (seasonDates.get(t) ?? seasonDates.set(t, []).get(t)).push(g.date);
const etDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const restOf = (team, dateEt) => {
  const prev = (seasonDates.get(team) ?? []).filter((d) => d < dateEt).sort().pop();
  return prev ? Math.round((Date.parse(dateEt) - Date.parse(prev)) / 86_400_000) : 7;
};

const rows = [];
const refused = [];
for (const r of targets) {
  if (Date.parse(r.dateUtc) <= Date.parse(NOW)) { refused.push({ providerEventId: r.providerEventId, reason: "at or after kickoff" }); continue; }
  const home = toNflverseAbbr(r.home.abbr);
  const away = toNflverseAbbr(r.away.abbr);
  const dateEt = etDate(r.dateUtc);
  const gameId = `${SEASON}_${String(WEEK).padStart(2, "0")}_${away}_${home}`;
  const rest = new Map([[gameId, { homeRest: restOf(home, dateEt), awayRest: restOf(away, dateEt) }]]);
  const fold = foldTeamLadder({ games, efficiencyRows: eff, frozen: { franchiseMap: prereg.replayMechanics.franchiseMap }, params, rest, restCap: prereg.frozen.restCap, beforeDate: dateEt });
  const f = fold.featuresForward({ gameId, season: SEASON, date: dateEt, home, away, neutral: neutralSiteOf(r, neutral) === true ? 1 : 0 });
  if (!f.rated) { refused.push({ providerEventId: r.providerEventId, reason: "a team has no rating history" }); continue; }
  const p = predictStack(fit, f);
  const pub = published.get(r.providerEventId) ?? null;
  const ptsH = (p.muT + p.muM) / 2;
  const ptsA = (p.muT - p.muM) / 2;
  rows.push({
    providerEventId: r.providerEventId, matchup: r.shortName, kickoffUtc: r.dateUtc, gameId, neutral: f.hInd === 0,
    foldedThrough: fold.lastDateFolded, rest: rest.get(gameId),
    features: Object.fromEntries(["hInd", "eloD", "epaEdge", "ptsEdge", "restDiff", "ptsTotal", "epaSum"].map((k) => [k, Number(f[k].toFixed(6))])),
    l6: {
      pHome: Number(p.pHome.toFixed(6)), marginMean: Number(p.muM.toFixed(3)), marginSigma: Number(p.sigmaM.toFixed(4)),
      totalMean: Number(p.muT.toFixed(3)), totalSigma: Number(p.sigmaT.toFixed(4)),
      meanScore: { home: Number(ptsH.toFixed(2)), away: Number(ptsA.toFixed(2)) },
      ...(pub?.marketComparison?.marketSpreadHome != null ? { atPublishedMarketSpread: { homeLine: pub.marketComparison.marketSpreadHome, ...spreadProbabilities(p, pub.marketComparison.marketSpreadHome) } } : {}),
      ...(pub?.marketComparison?.marketTotal != null ? { atPublishedMarketTotal: { line: pub.marketComparison.marketTotal, ...totalProbabilities(p, pub.marketComparison.marketTotal) } } : {}),
    },
    publishedForecast: pub ? { inputHash: pub.model?.inputHash ?? null, generatedAt: pub.generatedAt, pHome: pub.forecastSummary?.winProbability?.home ?? null, marginMedian: pub.forecastSummary?.margin?.median ?? null, totalMedian: pub.forecastSummary?.total?.median ?? null, teamInputs: pub.teamInputs?.state ?? null } : null,
  });
}

const doc = {
  schemaVersion: 1,
  artifact: "nfl-002-team-ladder-forward",
  dataClass: "PRIVATE_RESEARCH",
  modelId: L6_ID,
  verdictAtCapture: read("data/internal/research/nfl/reports/nfl-002-team-ladder-evaluation.json").verdicts[L6_ID],
  capturedAt: NOW,
  season: SEASON, week: WEEK,
  inputs: {
    devReportSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/reports/nfl-002-team-ladder-dev.json"))).digest("hex"),
    currentSeasonCapturedAt: current.capturedAt, currentSeasonFinals: current.counts?.finals ?? null, scheduleGeneratedAt: schedule.generatedAt,
  },
  notPublished: "Shadow evidence only. L6's win head was REJECTED on the held-out look; nothing here reaches a public surface or a product.",
  rows, refused,
};
const dir = path.join(ROOT, "data/internal/research/nfl/team-ladder-forward");
fs.mkdirSync(dir, { recursive: true });
const base = path.join(dir, `${SEASON}-week${String(WEEK).padStart(2, "0")}.json`);
const out = fs.existsSync(base) ? base.replace(/\.json$/, `-${NOW.replace(/[-:]/g, "").slice(0, 13)}Z.json`) : base;
if (fs.existsSync(out)) refuse(`${path.relative(ROOT, out)} exists`);
fs.writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
console.log(`wrote ${path.relative(ROOT, out)}: ${rows.length} game(s), ${refused.length} refused`);
for (const r of rows) console.log(`  ${r.matchup.padEnd(10)} L6 home ${(r.l6.pHome * 100).toFixed(1)}%  margin ${r.l6.marginMean.toFixed(1)}  total ${r.l6.totalMean.toFixed(1)}  | published ${r.publishedForecast ? (r.publishedForecast.pHome * 100).toFixed(1) + "%" : "—"}  ${r.publishedForecast?.teamInputs ?? ""}`);
