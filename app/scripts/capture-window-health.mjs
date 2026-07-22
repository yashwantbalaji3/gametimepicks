/**
 * capture-window-health.mjs — CAPTURE-WINDOW health (Phase 2). For every game, did a leakage-safe pregame feature
 * capture land BEFORE first pitch? Surfaces the exact cadence risk that made pitcher_workload/team_offensive_form
 * 0% on 2026-07-22 (captures ran once, late). Read-only; writes status/capture-window-health.json (public:false).
 * NO modeling, NO money, NO fabricated timestamps, NO retroactive eligibility — only reports what exists.
 *
 *   node app/scripts/capture-window-health.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const PA = path.join(REPO, "data/internal/mlb/pregame-archive");
const STATUS = path.join(PA, "status");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const lsdirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
const lsfiles = (p) => { try { return fs.readdirSync(p).filter((f) => f.endsWith(".json")); } catch { return []; } };

// the multi-cadence, per-game feature families whose timing tells us the capture window
const WINDOW_FAMILIES = ["lineup", "pitcher-workload", "team-offensive-form", "bullpen", "matchup"];

function main() {
  const joinBase = path.join(PA, "settlement-joins");
  const featBase = path.join(PA, "pregame-features");
  const perDate = [];
  for (const d of lsdirs(joinBase).sort()) {
    // game → eventStartTime, from the joins
    const games = {};
    for (const f of lsfiles(path.join(joinBase, d))) { const j = readJson(path.join(joinBase, d, f)); if (j?.gamePk && j.eventStartTime) games[j.gamePk] = j.eventStartTime; }
    const gamePks = Object.keys(games);
    if (!gamePks.length) continue;
    // earliest ELIGIBLE (pregame) capture time per game across the window families
    const earliestEligibleCapture = {};
    for (const fam of WINDOW_FAMILIES) {
      const dir = path.join(featBase, fam, d);
      for (const f of lsfiles(dir)) {
        const gamePk = f.split("-")[0];
        if (!games[gamePk]) continue;
        const r = readJson(path.join(dir, f));
        if (r?.researchEligible === true && r.capturedAt) {
          if (!earliestEligibleCapture[gamePk] || r.capturedAt < earliestEligibleCapture[gamePk]) earliestEligibleCapture[gamePk] = r.capturedAt;
        }
      }
    }
    const withPregame = gamePks.filter((pk) => earliestEligibleCapture[pk] && earliestEligibleCapture[pk] < games[pk]);
    const firstPitches = gamePks.map((pk) => games[pk]).sort();
    const captures = Object.values(earliestEligibleCapture).sort();
    perDate.push({
      date: d, games: gamePks.length,
      gamesWithPregameCapture: withPregame.length,
      windowHealthScore: +(withPregame.length / gamePks.length).toFixed(3),
      earliestFirstPitch: firstPitches[0] ?? null,
      earliestEligibleCapture: captures[0] ?? null,
      gamesMissingPregameCapture: gamePks.length - withPregame.length,
    });
  }
  const avg = perDate.length ? +(perDate.reduce((a, x) => a + x.windowHealthScore, 0) / perDate.length).toFixed(3) : null;
  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-capture-window-health",
    lastUpdated: new Date().toISOString(),
    datesTracked: perDate.length,
    averageWindowHealthScore: avg,
    latestWindowHealthScore: perDate.length ? perDate[perDate.length - 1].windowHealthScore : null,
    perDate,
    note: "windowHealthScore = games with a leakage-safe pregame capture BEFORE first pitch / total games. A low score = a cadence risk (captures landing after first pitch → ineligible → 0% attachment). Remedy is an EARLIER capture cron, never retroactive eligibility or fabricated timestamps.",
  };
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(path.join(STATUS, "capture-window-health.json"), JSON.stringify(report, null, 2));

  console.log(`\n=== CAPTURE WINDOW HEALTH ===`);
  for (const x of perDate) console.log(`  ${x.date}: ${x.gamesWithPregameCapture}/${x.games} games captured pregame · window ${x.windowHealthScore}${x.gamesMissingPregameCapture ? `  ⚠️ ${x.gamesMissingPregameCapture} missed` : ""}`);
  console.log(`  average window health: ${avg ?? "-"}`);
  console.log(`  → data/internal/mlb/pregame-archive/status/capture-window-health.json`);
  process.exit(0);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
