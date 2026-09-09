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
/* MLB has no `latest.json` for simulations — the newest dated file IS the latest, the same way
   every MLB surface resolves it. */
const mlbSimDate = (() => {
  const d = path.join(DATA, "mlb", "game-simulations");
  if (!fs.existsSync(d)) return null;
  const dates = fs.readdirSync(d).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
  return dates.length ? dates[dates.length - 1].replace(/\.json$/, "") : null;
})();
const mlbSims = mlbSimDate ? read(`mlb/game-simulations/${mlbSimDate}.json`) : null;
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
   that names him. No roster is walked: being rostered is not being published. */
const boardDir = path.join(DATA, "nfl", "player-board");
if (fs.existsSync(boardDir)) {
  for (const file of fs.readdirSync(boardDir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = JSON.parse(fs.readFileSync(path.join(boardDir, file), "utf8"));
    const eventId = file.replace(/\.json$/, "");
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

// ── PAGES ──────────────────────────────────────────────────────────────────────────────────────
for (const [label, sub, href, terms] of [
  ["Today's Picks", "The day's model reads", "/today/", ["slate", "daily"]],
  ["Simulations", "Pick a game, open its report", "/simulate/", ["simulate", "games"]],
  ["Picks", "Model probabilities beside the sportsbook price", "/markets/", ["markets", "odds", "prices"]],
  ["Parlay Center", "Suggested cards, or build your own", "/build/", ["parlay", "cards", "builder"]],
  ["Results", "The settled record", "/results/", ["record", "receipts", "settled"]],
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
]) add("page", label, sub, href, terms);

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
