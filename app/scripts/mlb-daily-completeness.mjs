/**
 * mlb-daily-completeness.mjs — INTERNAL per-game data completeness audit for a slate date. Reports what has been
 * captured and what late pregame information is still missing, per game, WITHOUT filling any missing value. No
 * modeling, no prediction. Writes data/internal/mlb/pregame-archive/status/completeness-<date>.json (public:false).
 *
 *   node app/scripts/mlb-daily-completeness.mjs --date 2026-07-22
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const FEAT = path.join(ARCH, "pregame-features");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const exists = (p) => fs.existsSync(p);
const BATTER_MARKETS = new Set(["batter_hits", "batter_total_bases", "batter_home_runs", "batter_rbis", "batter_runs_scored", "batter_hits_runs_rbis"]);
const GAME_FAMILIES = ["pitcher_status", "environment", "umpire", "pitcher_workload", "bullpen_availability", "batter_matchup", "park_factors", "confirmed_lineup"];

function latestLineup(date, gamePk) {
  const dir = path.join(FEAT, "lineup", date);
  if (!exists(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${gamePk}-`) && f.endsWith(".json")).sort();
  for (let i = files.length - 1; i >= 0; i--) { const r = readJson(path.join(dir, files[i])); if (r?.researchEligible) return r; }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const freezeDir = path.join(ARCH, "freezes", date);
  if (!exists(freezeDir)) { console.log(`[completeness] no freezes for ${date}`); return; }

  const games = [];
  for (const ff of fs.readdirSync(freezeDir).filter((f) => f.endsWith(".json"))) {
    const freeze = readJson(path.join(freezeDir, ff));
    if (!freeze) continue;
    const gamePk = freeze.gamePk;
    const elig = freeze.coverageSummary?.eligibleFamilies || [];
    // a representative snapshot for team names
    const snapDir = path.join(ARCH, "snapshots", date);
    let snap = null;
    if (exists(snapDir)) { const sf = fs.readdirSync(snapDir).filter((f) => f.startsWith(`${gamePk}-`)).sort(); snap = sf.length ? readJson(path.join(snapDir, sf[0])) : null; }
    const lineup = latestLineup(date, gamePk);
    const join = readJson(path.join(ARCH, "settlement-joins", date, `${gamePk}.json`));
    const marketRows = join?.marketRows || [];
    const propRows = marketRows.filter((r) => r.playerId != null);
    const batterIds = [...new Set(marketRows.filter((r) => BATTER_MARKETS.has(r.market) && r.playerId != null).map((r) => r.playerId))];
    const batterFam = (fam) => batterIds.filter((id) => exists(path.join(FEAT, fam, date, `${id}.json`))).length;

    // per-game family presence
    const present = {
      pitcher_status: elig.includes("pitcher_status"),
      environment: elig.includes("environment"),
      umpire: elig.includes("umpire"),
      pitcher_workload: exists(path.join(FEAT, "pitcher-workload", date, `${gamePk}.json`)),
      bullpen_availability: exists(path.join(FEAT, "bullpen", date, `${gamePk}.json`)),
      batter_matchup: exists(path.join(FEAT, "matchup", date, `${gamePk}.json`)),
      park_factors: exists(path.join(FEAT, "park-factors", date, `${gamePk}.json`)),
      confirmed_lineup: !!(lineup && lineup.lineupPosted),
    };
    const missingFamilies = GAME_FAMILIES.filter((f) => !present[f]);
    const featureCoverageScore = +(GAME_FAMILIES.filter((f) => present[f]).length / GAME_FAMILIES.length).toFixed(3);

    games.push({
      gamePk, teams: snap ? `${snap.awayTeam} @ ${snap.homeTeam}` : (freeze.eventId ?? null), startTime: freeze.eventStartTime ?? null,
      pitcherStatus: present.pitcher_status ? "captured" : "missing",
      lineupStatus: lineup ? (lineup.lineupPosted ? `posted (${lineup.window})` : `not-posted (${lineup.window})`) : "no snapshot",
      marketStatus: marketRows.length ? `captured (${marketRows.length} leans)` : "none",
      playerPropCount: propRows.length,
      batterFeatureCoverage: { splits: batterFam("batter-splits"), form: batterFam("batter-form"), vsPitcher: batterFam("batter-vs-pitcher"), paOpp: batterFam("pa-opportunity"), ofBatters: batterIds.length },
      featureCoverageScore, missingFamilies,
    });
  }
  games.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  const readyForResearch = games.filter((g) => g.featureCoverageScore >= 0.75 && g.marketStatus !== "none").length;
  const missingLate = games.filter((g) => g.lineupStatus.startsWith("not-posted") || g.lineupStatus === "no snapshot").length;
  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-daily-completeness", date, gameCount: games.length,
    readyForResearch, missingLateInformation: missingLate,
    avgFeatureCoverageScore: games.length ? +(games.reduce((a, g) => a + g.featureCoverageScore, 0) / games.length).toFixed(3) : 0,
    lineupsPosted: games.filter((g) => g.lineupStatus.startsWith("posted")).length,
    marketsCaptured: games.filter((g) => g.marketStatus !== "none").length,
    games,
    note: "Missing values are NOT filled — late information (lineups) fills as it posts. featureCoverageScore counts game-level families only.",
  };
  fs.mkdirSync(path.join(ARCH, "status"), { recursive: true });
  fs.writeFileSync(path.join(ARCH, "status", `completeness-${date}.json`), JSON.stringify(report, null, 2));

  console.log(`\n=== MLB ${date} DATA COMPLETENESS (${games.length} games) ===`);
  for (const g of games) console.log(`  ${g.gamePk} ${g.teams ?? ""} @ ${g.startTime?.slice(11, 16) ?? "?"}Z · pitcher ${g.pitcherStatus} · lineup ${g.lineupStatus} · market ${g.marketStatus} · props ${g.playerPropCount} · coverage ${g.featureCoverageScore} · missing [${g.missingFamilies.join(",")}]`);
  console.log(`— ready-for-research ${readyForResearch}/${games.length} · missing-late-info ${missingLate} · lineups-posted ${report.lineupsPosted} · markets ${report.marketsCaptured} · avg coverage ${report.avgFeatureCoverageScore}`);
  console.log(`report → ${path.relative(REPO, path.join(ARCH, "status", `completeness-${date}.json`))}`);
}
main();
