#!/usr/bin/env node
/**
 * Public model-only match forecasts for an ACCEPTED soccer league (P257 · Phase A-live). $0, free sources.
 *
 *   node scripts/soccer/build-league-forecasts.mjs --league ligue-1 --now <ISO> [--days 8]
 *
 * REFUSES unless the league's registry stage is ACCEPTED_V1 or LIVE — a league publishes only after its
 * preregistered backtest accepted it (docs/SOCCER_LEAGUE_EXPANSION.md). The model is the one EPL publishes
 * (lib/sports/epl/strength-state.mjs, committed defaults), fit on the league's own football-data.co.uk history
 * strictly before --now. Fixtures come from ESPN's public scoreboard (next --days days, pre-kickoff only).
 *
 * CLUB NAMES: ESPN and football-data name clubs differently ("Paris Saint-Germain" / "Paris SG"). Every ESPN
 * club must map to a club in the corpus — through the league's alias table or an exact name — or its fixture
 * is REFUSED with the reason. A club silently treated as unseen would get league-average strength: a guess
 * dressed as a forecast. A genuinely new club (no corpus rows at all) is flagged coldStart, as EPL does.
 *
 * Writes public/data/soccer/<league>/forecasts/latest.json and a dated copy <YYYY-MM-DD>.json (the record the
 * forward grading reads). Exit 0 with an empty set between rounds; exit 3 on a refusal of the whole run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { league as leagueOf } from "../../src/lib/sports/soccer/leagues.mjs";
import { fitEplStrength, scoreMatrix, sparseSplitFlags, normalizeClubName, EPL_MODEL_ID } from "../../src/lib/sports/epl/strength-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const KEY = arg("--league"); const NOW = arg("--now"); const DAYS = Number(arg("--days", "8"));
if (!KEY || !Number.isFinite(Date.parse(NOW ?? ""))) { console.error("usage: --league <key> --now <ISO> [--days 8]"); process.exit(2); }
const L = leagueOf(KEY);
if (!["ACCEPTED_V1", "LIVE"].includes(L.stage)) { console.error(`REFUSED: ${L.name} is ${L.stage} — only an accepted league publishes forecasts`); process.exit(3); }

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/soccer", L.key, "corpus-football-data-v1.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/soccer", L.key, "reports/walk-forward-v1.json"), "utf8"));
const state = fitEplStrength({ rows: corpus.rows, cutoffIso: NOW });
const known = new Set([...state.knownClubs]);
const aliases = Object.fromEntries(Object.entries(L.aliases ?? {}).map(([k, v]) => [normalizeClubName(k), v]));

/** ESPN display name → corpus club name, or null when it cannot be mapped honestly. */
function corpusName(espnName) {
  const n = normalizeClubName(espnName);
  if (aliases[n]) return aliases[n];
  const exact = [...known].find((c) => c === n);
  return exact ? state.displayName(exact) : null;
}

const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
const from = Date.parse(NOW), to = from + DAYS * 86_400_000;
const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${L.espn}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=200`;
const res = await fetch(url);
if (!res.ok) { console.error(`REFUSED: ESPN scoreboard HTTP ${res.status}`); process.exit(3); }
const events = (await res.json()).events ?? [];

const slugify = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const r6 = (x) => Number(x.toFixed(6));
const rows = [], refused = [];
for (const e of events) {
  const comp = e.competitions?.[0];
  const side = (ha) => comp?.competitors?.find((c) => c.homeAway === ha)?.team;
  const home = side("home"), away = side("away");
  const kickoffUtc = e.date ? new Date(e.date).toISOString() : null;
  const base = { eventId: `soccer:${L.key}:${e.id}`, providerEventId: e.id, kickoffUtc, homeEspnId: home?.id ?? null, awayEspnId: away?.id ?? null };
  if (!home || !away || !kickoffUtc) { refused.push({ ...base, reason: "fixture is missing a side or a kickoff time" }); continue; }
  if (e.status?.type?.state !== "pre" || Date.parse(kickoffUtc) <= from) continue; // pre-kickoff only — a started match is never forecast
  const h = corpusName(home.displayName), a = corpusName(away.displayName);
  if (!h || !a) { refused.push({ ...base, matchup: `${home.displayName} v ${away.displayName}`, reason: `club name does not map to the league history (${!h ? home.displayName : away.displayName}) — add it to the ${L.key} alias table after checking it is the same club` }); continue; }
  const m = scoreMatrix(state, h, a);
  const flags = sparseSplitFlags(state, h, a);
  rows.push({
    ...base,
    matchup: `${home.displayName} v ${away.displayName}`, homeClub: home.displayName, awayClub: away.displayName,
    historyNames: { home: h, away: a },
    slug: `${slugify(home.displayName)}-v-${slugify(away.displayName)}-${kickoffUtc.slice(0, 10)}`,
    modelOnly: true, modelId: EPL_MODEL_ID,
    probs: m.oneXTwo, expectedGoals: m.totals?.expected ?? null, lambdas: m.lambdas,
    over25: m.totals?.over25 ?? null,
    btts: m.btts ?? null, doubleChance: m.doubleChance ?? null,
    topScorelines: (m.topScorelines ?? []).slice(0, 5), topScorelinesMass: m.topScorelinesMass ?? null,
    coldStart: m.coldStart ?? null, sparseInput: flags,
  });
}
rows.sort((x, y) => x.kickoffUtc.localeCompare(y.kickoffUtc) || x.matchup.localeCompare(y.matchup));

const h = report.scores.poisson.bySeason["2025-26"];
const artifact = {
  schemaVersion: 1, artifact: "soccer-league-forecasts", dataClass: "PUBLIC", public: true,
  league: L.key, competition: L.name, country: L.country, generatedAt: NOW,
  model: { id: EPL_MODEL_ID, fitThrough: NOW, matchesFitted: state.matchesFitted, description: "the model the Premier League page publishes, fit on this league's own results" },
  validation: {
    verdict: report.verdict,
    holdout: { season: "2025-26", matches: h.n, logLoss: h.logLoss, empiricalLogLoss: report.scores.empirical.bySeason["2025-26"].logLoss, drawEceAllScored: report.scores.poisson.overall.drawEce },
    limitations: {
      closingMarketBetterBy: report.reportedNotGating.poissonMinusMarket,
      eloBetterBy: report.reportedNotGating.poissonMinusElo,
      note: "Over the 2025-26 holdout the sportsbook closing line was more accurate than this model, and so was a plain Elo rating. These are model-only forecasts for research and entertainment — not betting advice.",
    },
  },
  sources: { fixtures: "ESPN public scoreboard", history: "football-data.co.uk (results)" },
  counts: { forecast: rows.length, refused: refused.length },
  rows, refused,
};
const outDir = path.join(APP, "public/data/soccer", L.key, "forecasts");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(artifact, null, 1) + "\n");
if (rows.length) fs.writeFileSync(path.join(outDir, `${NOW.slice(0, 10)}.json`), JSON.stringify(artifact, null, 1) + "\n");
console.log(`[forecasts] ${L.name}: ${rows.length} fixtures forecast, ${refused.length} refused · fit on ${state.matchesFitted} matches`);
for (const r of refused) console.log(`  REFUSED ${r.matchup ?? r.eventId}: ${r.reason}`);
if (refused.length && !rows.length) process.exit(3);
