/**
 * THE SEARCH INDEX (P251 · F7).
 *
 * 377 pages and no way to answer "what does the model say about Ja'Marr Chase" or "show me the
 * Yankees" without first knowing which page to open. Nineteen pages carried a filter box, each
 * scoped to one board; there was no way in from outside.
 *
 * The index is built at export time from the SAME artifacts the pages render, so it can only ever
 * point at something that exists, and every entry carries the destination it was derived from
 * rather than a guessed URL. Nothing is invented: a player is in the index because a published
 * board names him, and his link is the report that names him.
 *
 * Deliberately small. Players are deduped to one entry each (a player on four boards is one row,
 * not four), the payload carries no probabilities — a search result is a way IN, not a second
 * surface that could disagree with the page it opens.
 *
 * Usage: node scripts/build-search-index.mjs --now <iso>
 * Writes: app/public/data/search/index.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Run under tsx (package.json): the MLB page owner is TypeScript, and the index must ask IT which games
   have pages rather than re-derive the answer beside it. */
import { activeMlbDate } from "../src/lib/data-mlb.ts";
import { buildAllGameDetails } from "../src/lib/game-detail.ts";
import { soccerLeaguePages } from "../src/lib/sports/soccer/leagues.mjs";
import { familyHref, ledgerFamilies } from "../src/lib/results/v2/forecast-ledger-reader.ts";
import { FAMILY_LABELS, SPORT_LABELS } from "../src/lib/results/v2/forecast-record.mjs";
import { PLAYER_COMPARE_SPORTS, TEAM_COMPARE_SPORTS } from "../src/lib/compare/contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());

const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

/** kind → how the UI groups it. Order here is the order a reader sees. */
const KINDS = ["event", "player", "team", "page"];

const entries = new Map(); // href+label → entry, so a repeat cannot double-list
const add = (kind, label, sub, href, terms = []) => {
  if (!label || !href) return;
  const key = `${kind}|${label}|${href}`;
  if (entries.has(key)) return;
  entries.set(key, { k: KINDS.indexOf(kind), l: label, s: sub ?? "", h: href, t: [...new Set([label, ...terms])].join(" ").toLowerCase() });
};

// ── EVENTS ─────────────────────────────────────────────────────────────────────────────────────
for (const f of read("nfl/forecasts/latest.json")?.forecasts ?? []) {
  add("event", f.matchup, `NFL · ${f.week ? `Week ${f.week}` : "this week"}`, `/nfl/game/${f.providerEventId}/`,
    [f.home?.name, f.away?.name, f.home?.abbr, f.away?.abbr, "nfl", "football"].filter(Boolean));
}
/*
 * ⚠ AN INDEX ENTRY MAY ONLY POINT AT A PAGE THAT EXISTS (2026-09-28).
 *
 * This used to take the NEWEST dated simulation file. The MLB game pages are built by a different
 * owner — `buildAllGameDetails()` over the ACTIVE slate (`activeMlbDate()`). The day after the regular
 * season ended the active slate was 2026-09-28 with no games, the newest simulation file was still
 * 09-27, and the index shipped 300 entries (events, teams, players) pointing at 15 game pages the export
 * did not contain. Two owners of one answer disagree the first time the calendar moves.
 *
 * So the date is the page owner's date, and every MLB entry is filtered to a slug the page owner
 * actually builds — an index entry without a page is impossible by construction.
 */
const mlbSimDate = activeMlbDate();
const mlbPageSlugs = new Set(buildAllGameDetails().filter((d) => d.sport === "mlb").map((d) => d.slug));
const mlbSimsRaw = mlbSimDate ? read(`mlb/game-simulations/${mlbSimDate}.json`) : null;
const mlbSims = mlbSimsRaw ? { ...mlbSimsRaw, games: (mlbSimsRaw.games ?? []).filter((g) => g.slug && mlbPageSlugs.has(g.slug)) } : null;
for (const g of mlbSims?.games ?? []) {
  const [away, home] = [g.teams?.away, g.teams?.home];
  if (!g.slug) continue;
  add("event", `${away} @ ${home}`, "MLB", `/games/mlb/${g.slug}/`, [away, home, "mlb", "baseball"].filter(Boolean));
}
for (const b of read("ufc/card-latest.json")?.bouts ?? []) {
  add("event", `${b.red?.name} vs ${b.blue?.name}`, `UFC · ${b.weightClass ?? ""}`.trim(), `/ufc/bout/${b.boutId}/`,
    [b.red?.name, b.blue?.name, "ufc", "mma"].filter(Boolean));
}
for (const r of read("soccer/epl/forecasts/latest.json")?.rows ?? []) {
  if (!r.slug) continue;
  add("event", r.matchup, `Premier League${r.matchweek ? ` · Matchweek ${r.matchweek}` : ""}`, `/epl/match/${r.slug}/`,
    [r.homeClub, r.awayClub, "epl", "premier league", "soccer", "football"].filter(Boolean));
}

// ── PLAYERS ────────────────────────────────────────────────────────────────────────────────────
/* A player is in the index because a PUBLISHED board names him, and his destination is the report
   that names him. No roster is walked: being rostered is not being published.

   AND THE REPORT HAS TO EXIST. An index entry is a promise that a page is there. Player boards
   outlive the forecast window — a board file for NE @ SEA sat on disk after the game was played and
   the forecast rolled forward, so every player on it pointed at /nfl/game/401872656/, a route that
   is no longer generated. Twice in one day this index shipped destinations that 404 (the MLB game
   pages this morning were the same shape), so the events that actually generate a page are the
   only ones a row may point at. */
const forecastEventIds = new Set(
  (read("nfl/forecasts/latest.json")?.forecasts ?? []).map((f) => String(f.providerEventId)),
);
const boardDir = path.join(DATA, "nfl", "player-board");
if (fs.existsSync(boardDir)) {
  for (const file of fs.readdirSync(boardDir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = JSON.parse(fs.readFileSync(path.join(boardDir, file), "utf8"));
    const eventId = file.replace(/\.json$/, "");
    if (!forecastEventIds.has(eventId)) continue; // no report page for this event — no promise made
    for (const p of b.players ?? []) {
      add("player", p.name, `NFL · ${p.team} · ${b.matchup}`, `/nfl/game/${eventId}/`, [p.team, "nfl", "football"]);
    }
    for (const a of b.newArrivals ? Object.values(b.newArrivals).flat() : []) {
      add("player", a.name, `NFL · ${a.team} · ${b.matchup}`, `/nfl/game/${eventId}/`, [a.team, "nfl"]);
    }
  }
}
for (const b of read("ufc/card-latest.json")?.bouts ?? []) {
  for (const side of [b.red, b.blue]) {
    if (side?.name) add("player", side.name, `UFC · ${b.weightClass ?? "bout"}`, `/ufc/bout/${b.boutId}/`, ["ufc", "mma", "fighter"]);
  }
}
/*
 * P252: EPL players were missing entirely. The player layer shipped after this index was written
 * and the generator never learned about it, so searching a Premier League striker found nothing
 * while his projection was live on three surfaces. Same rule as everywhere else here: a player is
 * indexed because a PUBLISHED projection names him, and his destination is the page that names
 * him — the fixture report.
 */
/*
 * The match page renders the 12 likeliest of its 64 squad rows, so only those 12 are indexed:
 * a result whose destination does not name the player is a promise the page cannot keep, and
 * that is the rule this whole index is held to.
 */
const EPL_PLAYERS_RENDERED = 12;
// P257 · soccer leagues beyond the Premier League (accepted by their preregistered backtest). Soccer V2 · C-3:
// the list is the registry's, the same one the /soccer/[league] route is generated from — never a second list.
for (const lg of soccerLeaguePages().map((l) => l.key)) {
  const set = read(`soccer/${lg}/forecasts/latest.json`);
  for (const r of set?.rows ?? []) {
    add("event", r.matchup, `${set.competition} · model forecast`, `/soccer/${lg}/`,
      [r.homeClub, r.awayClub, String(set.competition ?? "").toLowerCase(), "soccer", "football"].filter(Boolean));
  }
}
for (const f of read("soccer/epl/player-projections/latest.json")?.fixtures ?? []) {
  if (!f.slug) continue;
  const shown = [...(f.players ?? [])]
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
    .slice(0, EPL_PLAYERS_RENDERED);
  for (const p of shown) {
    if (!p.name) continue;
    add("player", p.name, `Premier League · ${p.teamName ?? ""} · ${f.matchup}`.replace(" ·  ·", " ·"),
      `/epl/match/${f.slug}/`, [p.teamName, "epl", "premier league", "soccer", "football"].filter(Boolean));
  }
}

const mlbBoard = mlbSimDate ? read(`mlb/boards/${mlbSimDate}.json`) : null;
for (const l of mlbBoard?.leans ?? []) {
  if (!l.playerName || !l.gamePk) continue;
  const g = (mlbSims?.games ?? []).find((x) => x.gamePk === l.gamePk);
  if (!g?.slug) continue;
  add("player", l.playerName, `MLB · ${l.playerTeamAbbr ?? ""} · ${g.teams?.away} @ ${g.teams?.home}`.replace(" ·  ·", " ·"),
    `/games/mlb/${g.slug}/`, [l.playerTeamAbbr, "mlb", "baseball"].filter(Boolean));
}

// ── TEAMS ──────────────────────────────────────────────────────────────────────────────────────
/* A team's destination is the game it is actually in this week — the most useful answer to typing
   a club name. Clubs with no current event are not listed, because there is nothing to open. */
/* Explicit, per sport. Splitting an event LABEL on " vs " turned every UFC fighter into a
   "team" — a bout is two people, and the index should not learn its taxonomy from a string. */
const teamSeen = new Set();
const addTeam = (name, abbr, sub, href, terms) => {
  const key = (name ?? abbr ?? "").toLowerCase();
  if (!key || teamSeen.has(key)) return;
  teamSeen.add(key);
  add("team", name ?? abbr, sub, href, [abbr, ...terms].filter(Boolean));
};
for (const f of read("nfl/forecasts/latest.json")?.forecasts ?? []) {
  const href = `/nfl/game/${f.providerEventId}/`;
  addTeam(f.home?.name, f.home?.abbr, `NFL · ${f.matchup}`, href, ["nfl", "football"]);
  addTeam(f.away?.name, f.away?.abbr, `NFL · ${f.matchup}`, href, ["nfl", "football"]);
}
for (const g of mlbSims?.games ?? []) {
  if (!g.slug) continue;
  const href = `/games/mlb/${g.slug}/`;
  addTeam(g.teams?.home, null, `MLB · ${g.teams?.away} @ ${g.teams?.home}`, href, ["mlb", "baseball"]);
  addTeam(g.teams?.away, null, `MLB · ${g.teams?.away} @ ${g.teams?.home}`, href, ["mlb", "baseball"]);
}
for (const r of read("soccer/epl/forecasts/latest.json")?.rows ?? []) {
  if (!r.slug) continue;
  const href = `/epl/match/${r.slug}/`;
  addTeam(r.homeClub, null, `Premier League · ${r.matchup}`, href, ["epl", "soccer"]);
  addTeam(r.awayClub, null, `Premier League · ${r.matchup}`, href, ["epl", "soccer"]);
}

// ── RESEARCH (v1.3) ────────────────────────────────────────────────────────────────────────────
/* Team and player research pages, from the committed research PROJECTION registry (never the Data Platform store).
   Every entry is a page the export generates from that same registry (dynamicParams=false), so the promise holds.
   Kept small: label, sport and the team hint only — no stats. Measured: all 1,853 research pages took the index from
   121 KB to 365 KB, past its 260 KB fetch-on-demand budget, so only TEAM pages and INDEXABLE NFL PLAYER pages are indexed here (209 KB measured); MLB/EPL/UFC player pages are reached from their team, bout and match pages. */
const researchIndex = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(APP, "..", "data", "research-projection", "v1", "index.json"), "utf8")); } catch { return null; }
})();
if (researchIndex && researchIndex.schemaVersion === 1) {
  const SPORT = { MLB: ["MLB", "mlb"], NFL: ["NFL", "nfl"], EPL: ["Premier League", "epl"], UFC: ["UFC", "ufc"] };
  for (const e of researchIndex.entries) {
    if (!(e.kind === "team" || (e.sport === "NFL" && e.indexable))) continue;
    const [name, terms] = SPORT[e.sport] ?? [e.sport, ""];
    const what = e.kind === "team" ? "Team research" : e.sport === "UFC" ? "Fighter research" : "Player research";
    add(e.kind, e.label, `${what} · ${name}${e.hint ? ` · ${e.hint}` : ""}`, e.path, [e.hint, ...terms.split(" ")].filter(Boolean));
  }
}

// ── PAGES ──────────────────────────────────────────────────────────────────────────────────────
for (const [label, sub, href, terms] of [
  ["Today's Picks", "The day's model reads", "/today/", ["slate", "daily"]],
  ["Simulations", "Pick a game, open its report", "/simulate/", ["simulate", "games"]],
  ["Picks", "Model probabilities beside the sportsbook price", "/markets/", ["markets", "odds", "prices"]],
  ["Parlay Center", "Suggested cards, or build your own", "/build/", ["parlay", "cards", "builder"]],
  ["Results", "The settled record", "/results/", ["record", "receipts", "settled"]],
  ["Forecast record", "Every published forecast, measured against the result", "/results/forecasts/", ["accuracy", "how accurate", "calibration", "track record", "brier", "forecast history"]],
  ["Model Lab", "What is live, being tested or paused", "/models/", ["models", "model status", "calibration", "experiments"]],
  ["NFL", "Football hub", "/nfl/", ["football"]],
  ["MLB", "Baseball hub", "/mlb/", ["baseball"]],
  ["Premier League", "Soccer hub", "/epl/", ["epl", "soccer", "football"]],
  ["UFC", "Fight card and archive", "/ufc/", ["mma", "fights"]],
  ["Endzone Vault", "Who reaches the end zone today", "/endzone-vault/", ["touchdown", "td", "scorer"]],
  ["Cage Chaos", "How each fight ends", "/cage-chaos/", ["ufc", "method", "round"]],
  ["Homer Nukes", "Today's likeliest home runs", "/homer-nukes/", ["home run", "hr", "power"]],
  ["Bank Builder", "The paper ladder", "/bank-builder/", ["ladder", "bankroll"]],
  ["Moonshot", "High-variance paper longshots", "/moonshot/", ["longshot"]],
  ["Methodology", "How every number is built", "/methodology/", ["method", "how it works"]],
  ["How It Works", "A two-minute guide", "/learn/", ["learn", "guide", "help"]],
  ["System status", "What is running right now", "/system-status/", ["status", "health"]],
  // 2026-10-05: the Research tools, which search did not reach before.
  ["Research", "Every team and player with a research page", "/research/", ["research", "teams", "players", "stats", "directory"]],
  ["Research Lab", "Search recorded games, player games and season results", "/research/lab/", ["game finder", "player stats", "season results", "filter"]],
  ["Compare", "Two teams or players, side by side", "/compare/", ["compare", "head to head", "versus", "vs"]],
  ["Ask GameTime", "Ask about games, players, forecasts and the site", "/ask/", ["ask", "question", "help"]],
  ["Live", "Games in progress", "/live/", ["live", "scores", "in progress"]],
]) add("page", label, sub, href, terms);

// Compare builders, from the Compare owner's own lists of what ships (a blocked shell is not offered as a tool).
for (const s of TEAM_COMPARE_SPORTS) {
  const name = SPORT_LABELS[s] ?? s;
  add("page", `Compare ${name} teams`, "Two teams side by side", `/compare/teams/${s.toLowerCase()}/`, ["compare", "teams", "head to head", s.toLowerCase()]);
}
for (const s of PLAYER_COMPARE_SPORTS) {
  const name = SPORT_LABELS[s] ?? s;
  add("page", `Compare ${name} players`, "Two players side by side", `/compare/players/${s.toLowerCase()}/`, ["compare", "players", "head to head", s.toLowerCase()]);
}

// ── FORECAST RECORD (Session 13): one entry per forecast type the ledger measures, from the page owner's own reader,
// so "receiving yards accuracy" lands on that family's record. Families with no ledger rows have no page and no entry.
for (const { sport, family } of ledgerFamilies()) {
  const label = FAMILY_LABELS[family] ?? family;
  const sportName = SPORT_LABELS[sport] ?? sport;
  add("page", `${sportName} ${label} — forecast record`, `How every published ${label.toLowerCase()} forecast did`, familyHref(sport, family),
    [...label.toLowerCase().split(/\s+/), "accuracy", "record", "results", sport.toLowerCase()]);
}

const rows = [...entries.values()].sort((a, b) => a.k - b.k || a.l.localeCompare(b.l));
const out = {
  schemaVersion: 1,
  artifact: "site-search-index",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  kinds: KINDS,
  counts: Object.fromEntries(KINDS.map((k, i) => [k, rows.filter((r) => r.k === i).length])),
  rows,
};
const dir = path.join(DATA, "search");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "index.json"), `${JSON.stringify(out)}\n`);
const kb = (fs.statSync(path.join(dir, "index.json")).size / 1024).toFixed(0);
console.log(`search index: ${rows.length} rows (${Object.entries(out.counts).map(([k, n]) => `${n} ${k}`).join(" · ")}) · ${kb} KB`);
