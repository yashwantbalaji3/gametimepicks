/**
 * build-mlb-model-inputs.mjs — the EXTENDED independent-input builder for the internal full-game engine.
 * Emits (all internal-only, money-independent, append-only unless --force):
 *
 *   • data/internal/mlb/model-inputs/pitcher-strength/<date>.json — probable pitchers + NEUTRAL ratings.
 *     Honest: no committed as-of-date per-start data exists, and live season stats fetched now would
 *     include post-date games (leakage for a past-date backtest) ⇒ ratings stay neutral (0), source
 *     `neutral_default`, usableForIndependentModel:false. Nothing invented.
 *   • data/internal/mlb/model-inputs/full-game/<date>.json — per-game roll-up: probables, pitcher
 *     ratings, team run rates (LEAKAGE-SAFE: only linescore dates strictly earlier than <date>), the
 *     static park factor, the missing inputs, a transparent modelInputCompletenessScore, and an honest
 *     usableForIndependentModel flag.
 *
 * Sources (all FREE): StatsAPI probables (network); committed linescores (data/internal/mlb/linescores);
 * the static park table (data/internal/mlb/model-inputs/park-factors/static.json). NOT web-served,
 * never touches money.
 *
 * Usage: npx tsx scripts/build-mlb-model-inputs.mjs [--date 2026-07-09] [--write] [--force]
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const LINESCORES = path.join(REPO, "data", "internal", "mlb", "linescores");
const MI_DIR = path.join(REPO, "data", "internal", "mlb", "model-inputs");
const PARK_TABLE = path.join(MI_DIR, "park-factors", "static.json");
const PS_DIR = path.join(MI_DIR, "pitcher-strength");
const FG_DIR = path.join(MI_DIR, "full-game");

const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force") || process.argv.includes("--refresh");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

function latestBoardDate() {
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}

/** LEAKAGE-SAFE team run rates: average runs scored per team over committed final linescores BEFORE `date`. */
function teamRunRatesBefore(date) {
  const runs = new Map();
  let usedDates = 0;
  if (!fs.existsSync(LINESCORES)) return { rates: new Map(), dates: 0 };
  for (const f of fs.readdirSync(LINESCORES).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const fDate = f.replace(".json", "");
    if (fDate >= date) continue; // strictly earlier only — never use same/future dates
    usedDates += 1;
    for (const g of (JSON.parse(fs.readFileSync(path.join(LINESCORES, f), "utf8")).games || [])) {
      if (!g.isFinal) continue;
      if (typeof g.homeRuns === "number") { const a = runs.get(g.homeTeam) ?? []; a.push(g.homeRuns); runs.set(g.homeTeam, a); }
      if (typeof g.awayRuns === "number") { const a = runs.get(g.awayTeam) ?? []; a.push(g.awayRuns); runs.set(g.awayTeam, a); }
    }
  }
  const rates = new Map();
  for (const [team, xs] of runs) rates.set(team, { runsPerGame: Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2)), games: xs.length });
  return { rates, dates: usedDates };
}

async function fetchProbables(date) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`, { headers: { accept: "application/json" } });
    const games = (await res.json())?.dates?.[0]?.games ?? [];
    const map = new Map();
    for (const g of games) map.set(g.gamePk, {
      away: g.teams?.away?.probablePitcher?.fullName ?? null, home: g.teams?.home?.probablePitcher?.fullName ?? null,
      awayId: g.teams?.away?.probablePitcher?.id ?? null, homeId: g.teams?.home?.probablePitcher?.id ?? null,
      awayTeam: g.teams?.away?.team?.name, homeTeam: g.teams?.home?.team?.name,
    });
    return map;
  } catch { return new Map(); }
}

function loadParkTable() {
  if (!fs.existsSync(PARK_TABLE)) return { byAbbr: new Map(), byName: new Map(), maxNudgePct: 0 };
  const t = JSON.parse(fs.readFileSync(PARK_TABLE, "utf8"));
  const byAbbr = new Map(); const byName = new Map();
  for (const e of t.factors || []) { byAbbr.set(e.team, e); byName.set(e.name, e); }
  return { byAbbr, byName, maxNudgePct: t.maxTotalNudgePct ?? 0 };
}

/** gamePk → { homeAbbr, awayAbbr } from the board leans. */
function abbrsByPk(date) {
  const p = path.join(BOARDS, `${date}.json`);
  const m = new Map();
  if (!fs.existsSync(p)) return m;
  for (const l of (JSON.parse(fs.readFileSync(p, "utf8")).leans || [])) if (l.gamePk != null && !m.has(l.gamePk)) m.set(l.gamePk, { homeAbbr: l.homeTeamAbbr ?? "", awayAbbr: l.awayTeamAbbr ?? "", gameId: l.gameId });
  return m;
}

function writeGuarded(dir, date, obj, label) {
  const target = path.join(dir, `${date}.json`);
  if (!WRITE) return { wrote: false, dry: true };
  if (fs.existsSync(target) && !FORCE) return { wrote: false, skippedExisting: true };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(obj, null, 2) + "\n");
  return { wrote: true };
}

async function main() {
  const date = DATE ?? latestBoardDate();
  if (!date) { console.error("[model-inputs] no date"); process.exit(1); }

  const boardPk = abbrsByPk(date);
  const probables = await fetchProbables(date);
  const { rates, dates: rateDates } = teamRunRatesBefore(date);
  const park = loadParkTable();

  // Union of games from the board + probables (never fabricate a game).
  const pks = new Set([...boardPk.keys(), ...probables.keys()]);
  const parkFor = (abbr, name) => park.byAbbr.get(abbr) ?? park.byName.get(name) ?? null;

  // ── Pitcher-strength artifact (neutral, honest) ──
  const pitchers = [];
  for (const pk of pks) {
    const pp = probables.get(pk);
    for (const side of ["away", "home"]) {
      const nm = pp?.[side] ?? null;
      pitchers.push({
        gamePk: pk, team: side === "away" ? (pp?.awayTeam ?? boardPk.get(pk)?.awayAbbr ?? null) : (pp?.homeTeam ?? boardPk.get(pk)?.homeAbbr ?? null),
        side, pitcherId: pp?.[`${side}Id`] ?? null, pitcherName: nm,
        normalizedRating: 0, ratingScale: "z-score vs league mean; 0 = neutral (no real rating available)",
        source: "neutral_default",
        missingReason: nm ? "no committed as-of-date per-start data; live season stats would leak future games into a past-date backtest — rating kept neutral" : "no probable pitcher published",
      });
    }
  }
  const pitcherStrength = {
    sport: "MLB", date, asOf: date, public: false, internal: true, kind: "pitcher-strength",
    officialMoneyRecordAffected: false, exposureCreated: 0, activationStatus: "internal_only",
    usableForIndependentModel: false,
    method: "PROBABLE-PITCHER-ONLY with NEUTRAL ratings (Path B). No strength is invented.",
    verdict: "Pitcher strength is NEUTRAL — a leakage-safe rating needs committed as-of-date per-start data we do not have. Not usable for an independent model.",
    pitchers,
    note: "INTERNAL. Probable pitchers are a StatsAPI probable (may differ from the actual starter). Ratings are neutral by design. NOT web-served, never touches money.",
  };

  // ── Full-game roll-up (per game) ──
  const games = [];
  for (const pk of pks) {
    const pp = probables.get(pk);
    const ab = boardPk.get(pk) ?? {};
    const awayName = pp?.awayTeam ?? ab.awayAbbr ?? null;
    const homeName = pp?.homeTeam ?? ab.homeAbbr ?? null;
    const awayRate = rates.get(awayName) ?? null;
    const homeRate = rates.get(homeName) ?? null;
    const parkEntry = parkFor(ab.homeAbbr, homeName);
    const parkMapped = !!parkEntry;
    const parkNonNeutral = parkMapped && parkEntry.confidence !== "neutral_default";

    const missing = [];
    if (!pp?.away || !pp?.home) missing.push("probable pitchers");
    if (!awayRate || !homeRate) missing.push("team run rates (thin/absent committed finals)");
    missing.push("pitcher strength ratings (neutral)", "bullpen rest / usage", "lineup handedness", "weather", "injuries");

    // Transparent completeness score (documented weights). Pitcher strength is the heavy term and is 0.
    const w = {
      probables: pp?.away && pp?.home ? 0.15 : 0,
      runRates: awayRate && homeRate ? 0.15 : 0,
      park: parkNonNeutral ? 0.10 : parkMapped ? 0.05 : 0,
      pitcherStrength: 0, // neutral — the biggest missing term
      bullpen: 0, lineup: 0, weather: 0,
    };
    const completeness = Number(Object.values(w).reduce((s, x) => s + x, 0).toFixed(2));

    games.push({
      date, gamePk: pk, gameId: ab.gameId ?? null, awayTeam: awayName, homeTeam: homeName,
      inputs: {
        probablePitchers: { away: pp?.away ?? null, home: pp?.home ?? null, source: pp?.away || pp?.home ? "statsapi_probable" : "unavailable" },
        pitcherRatings: { away: 0, home: 0, source: "neutral_default", note: "neutral — no leakage-safe rating available" },
        teamRunRates: { away: awayRate?.runsPerGame ?? null, home: homeRate?.runsPerGame ?? null, sampleGames: { away: awayRate?.games ?? 0, home: homeRate?.games ?? 0 }, source: awayRate || homeRate ? "computed_from_committed_linescores_before_date" : "unavailable" },
        parkFactor: parkMapped
          ? { venue: parkEntry.venue, runFactor: parkEntry.runFactor, homeRunFactor: parkEntry.homeRunFactor ?? null, confidence: parkEntry.confidence, source: "static_approximate" }
          : { runFactor: 1.0, confidence: "neutral_default", source: "neutral_fallback" },
        bullpenRestProxy: { away: null, home: null, source: "unavailable" },
        weather: { value: null, source: "unavailable" },
      },
      coverage: {
        missing,
        modelInputCompletenessScore: completeness,
        // Honest gate: a real independent model needs pitcher strength (missing) — never true here.
        usableForIndependentModel: false,
      },
    });
  }

  const fullGame = {
    sport: "MLB", date, asOf: date, public: false, internal: true, kind: "model-inputs-full-game",
    officialMoneyRecordAffected: false, exposureCreated: 0, activationStatus: "internal_only",
    leakageNote: "Team run rates use ONLY committed linescore dates strictly earlier than this date. Park factors are static structural constants. Pitcher ratings are neutral. No same-date or future data enters a pregame input.",
    coverageSummary: {
      games: games.length,
      probablesAvailable: [...probables.values()].some((p) => p.away || p.home),
      runRateDatesUsed: rateDates,
      parkFactorsMapped: games.filter((g) => g.inputs.parkFactor.source === "static_approximate").length,
      meanCompleteness: games.length ? Number((games.reduce((s, g) => s + g.coverage.modelInputCompletenessScore, 0) / games.length).toFixed(2)) : 0,
      usableForIndependentModel: false,
    },
    verdict: "Independent inputs remain INSUFFICIENT for a non-market model: probables + thin run rates + approximate park factors only; pitcher strength / bullpen / lineup / weather are missing. The engine stays market-anchored.",
    games,
    note: "INTERNAL full-game model-inputs roll-up. Nothing fabricated. NOT web-served, never touches money.",
  };

  const psRes = writeGuarded(PS_DIR, date, pitcherStrength, "pitcher-strength");
  const fgRes = writeGuarded(FG_DIR, date, fullGame, "full-game");
  const act = (r) => (!WRITE ? "DRY-RUN" : r.wrote ? "WROTE" : r.skippedExisting ? "SKIPPED (exists)" : "NO-OP");
  console.log(`[model-inputs] ${date} · games ${games.length} · runRate dates<${date}: ${rateDates} · parks mapped ${fullGame.coverageSummary.parkFactorsMapped} · meanCompleteness ${fullGame.coverageSummary.meanCompleteness} · usable false`);
  console.log(`  pitcher-strength: ${act(psRes)} · full-game: ${act(fgRes)}`);
  if (!WRITE) console.log("  (dry run — pass --write; append-only unless --force)");
}

main();
