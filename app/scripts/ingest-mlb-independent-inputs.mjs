/**
 * ingest-mlb-independent-inputs.mjs — an INTERNAL snapshot of INDEPENDENT (non-market) baseball context
 * per MLB game — the first step toward moving the full-game model beyond market anchoring. Honest by
 * construction: every input is either genuinely sourced or marked `unavailable` (never fabricated), and
 * the artifact declares `usableForIndependentModel: false` while the coverage is thin.
 *
 * Sources used (all FREE):
 *   • probable pitchers — StatsAPI schedule `hydrate=probablePitcher` (network; a probable, may differ
 *     from the actual starter).
 *   • team run rates — computed from the COMMITTED linescore caches (data/internal/mlb/linescores/*),
 *     averaging runs scored per team over the cached final dates (deterministic; thin sample).
 *   • park factor / bullpen rest / weather — NOT available (no free committed source) ⇒ marked missing.
 *
 * Output: data/internal/mlb/model-inputs/<date>.json (public:false, NOT web-served). Never touches money.
 * Usage: npx tsx scripts/ingest-mlb-independent-inputs.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const LINESCORES = path.join(REPO, "data", "internal", "mlb", "linescores");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "model-inputs");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

function latestBoardDate() {
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}

/** Team → {runs scored samples} from the committed linescore caches (keyed by team NAME, as the caches store). */
function teamRunRates() {
  const runs = new Map();
  if (!fs.existsSync(LINESCORES)) return { rates: new Map(), dates: 0 };
  const files = fs.readdirSync(LINESCORES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  for (const f of files) {
    for (const g of (JSON.parse(fs.readFileSync(path.join(LINESCORES, f), "utf8")).games || [])) {
      if (!g.isFinal) continue;
      if (typeof g.homeRuns === "number") { const a = runs.get(g.homeTeam) ?? []; a.push(g.homeRuns); runs.set(g.homeTeam, a); }
      if (typeof g.awayRuns === "number") { const a = runs.get(g.awayTeam) ?? []; a.push(g.awayRuns); runs.set(g.awayTeam, a); }
    }
  }
  const rates = new Map();
  for (const [team, xs] of runs) rates.set(team, { runsPerGame: Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2)), games: xs.length });
  return { rates, dates: files.length };
}

async function fetchProbables(date) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`, { headers: { accept: "application/json" } });
    const games = (await res.json())?.dates?.[0]?.games ?? [];
    const map = new Map();
    for (const g of games) map.set(g.gamePk, { away: g.teams?.away?.probablePitcher?.fullName ?? null, home: g.teams?.home?.probablePitcher?.fullName ?? null, awayTeam: g.teams?.away?.team?.name, homeTeam: g.teams?.home?.team?.name });
    return map;
  } catch { return new Map(); }
}

async function main() {
  const date = DATE ?? latestBoardDate();
  if (!date) { console.error("[indep-inputs] no date"); process.exit(1); }

  const board = JSON.parse(fs.readFileSync(path.join(BOARDS, `${date}.json`), "utf8"));
  const gamesByPk = new Map();
  for (const l of board.leans || []) if (l.gamePk != null && !gamesByPk.has(l.gamePk)) gamesByPk.set(l.gamePk, { gameId: l.gameId, awayName: l.awayTeamName, homeName: l.homeTeamName, awayAbbr: l.awayTeamAbbr, homeAbbr: l.homeTeamAbbr });

  const probables = await fetchProbables(date);
  const { rates, dates: rateDates } = teamRunRates();
  const probablesAvailable = [...probables.values()].some((p) => p.away || p.home);

  const games = [];
  for (const [gamePk, info] of gamesByPk) {
    const pp = probables.get(gamePk);
    const awayName = pp?.awayTeam ?? info.awayName;
    const homeName = pp?.homeTeam ?? info.homeName;
    const awayRate = rates.get(awayName) ?? null;
    const homeRate = rates.get(homeName) ?? null;
    const missing = [];
    if (!pp?.away || !pp?.home) missing.push("probable pitchers");
    if (!awayRate || !homeRate) missing.push("team run rates (thin/absent committed finals)");
    missing.push("pitcher strength ratings", "park factor", "bullpen rest / usage", "lineup handedness", "weather");
    games.push({
      date, gamePk, gameId: info.gameId, awayTeam: awayName, homeTeam: homeName,
      inputs: {
        probablePitchers: { away: pp?.away ?? null, home: pp?.home ?? null, source: pp?.away || pp?.home ? "statsapi_probable" : "unavailable" },
        teamRunRates: { away: awayRate?.runsPerGame ?? null, home: homeRate?.runsPerGame ?? null, sampleGames: { away: awayRate?.games ?? 0, home: homeRate?.games ?? 0 }, source: awayRate || homeRate ? "computed_from_committed_linescores" : "unavailable" },
        parkFactor: { value: null, source: "unavailable" },
        bullpenRestProxy: { away: null, home: null, source: "unavailable" },
        weather: { value: null, source: "unavailable" },
      },
      coverage: {
        independentInputsAvailable: !!(pp?.away && pp?.home) || !!(awayRate && homeRate),
        missing,
        // A probable-pitcher NAME + a thin run rate is NOT enough for an independent predictive model —
        // that needs pitcher strength, park, bullpen. Honest: not usable yet.
        usableForIndependentModel: false,
      },
    });
  }

  const out = {
    sport: "MLB", date, asOf: date, public: false, internal: true,
    kind: "model-inputs-snapshot",
    officialMoneyRecordAffected: false, exposureCreated: 0, activationStatus: "internal_only",
    coverageSummary: { games: games.length, probablesAvailable, runRateDates: rateDates, usableForIndependentModel: false },
    verdict: "INDEPENDENT inputs are only partially available (probable pitchers + thin team run rates). Pitcher strength, park factor, bullpen, and weather are missing — NOT enough for an independent predictive model. The engine stays market-anchored.",
    games,
    note: "INTERNAL model-inputs snapshot. Probable pitchers are a StatsAPI probable (may differ from the actual starter); run rates are computed from committed final linescores (thin). Nothing fabricated. NOT web-served, never touches money.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[indep-inputs] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · ${games.length} games · probables ${probablesAvailable ? "available" : "unavailable"} · runRate dates ${rateDates} · usableForIndependentModel false`);
  if (!WRITE) console.log("  (dry run — pass --write)");
}

main();
