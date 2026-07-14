#!/usr/bin/env node
/**
 * Fetch 2022 World Cup CLOSING 1X2 odds from The Odds API /v4/historical, de-vigged, for the model-vs-market
 * baseline. For each distinct kickoff time, one snapshot ~6 min BEFORE kickoff gives near-closing odds for every
 * match starting then. Strictly pre-match (asserts snapshot.timestamp < kickoff). Credit-guarded.
 *
 * Writes (INTERNAL ONLY): data/internal/world-cup/reference/wc-2022-closing-odds-baseline.json
 * Usage: node app/scripts/fetch-wc-2022-closing-odds.mjs [--floor 5500]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const args = process.argv.slice(2);
const floor = Number((args[args.indexOf("--floor") + 1]) || 5500);

const env = fs.readFileSync(path.join(REPO, ".env"), "utf8");
const KEY = (env.match(/^ODDS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^['"]|['"]$/g, "");
if (!KEY) { console.error("no ODDS_API_KEY"); process.exit(1); }

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const results = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/world-cup/reference/wc-2022-results.json"), "utf8")).matches;

// Group matches by kickoff timestamp.
const byKick = new Map();
for (const m of results) {
  const t = m.date;
  if (!byKick.has(t)) byKick.set(t, []);
  byKick.get(t).push(m);
}
const kickoffs = [...byKick.keys()].sort();
console.log(`${results.length} matches across ${kickoffs.length} distinct kickoff slots`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deVig = (outcomes) => {
  // outcomes: {home, draw, away} decimal → implied, de-vig by dividing by overround.
  const imp = { home: 1 / outcomes.home, draw: 1 / outcomes.draw, away: 1 / outcomes.away };
  const s = imp.home + imp.draw + imp.away;
  return { home: imp.home / s, draw: imp.draw / s, away: imp.away / s, overround: +(s - 1).toFixed(4) };
};

const out = [];
let unmatched = [];
let remaining = Infinity;
for (const T of kickoffs) {
  if (remaining < floor) { console.log(`STOP: credits ${remaining} < floor ${floor}`); break; }
  const snapAt = new Date(new Date(T).getTime() - 6 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const url = `https://api.the-odds-api.com/v4/historical/sports/soccer_fifa_world_cup/odds?apiKey=${KEY}&regions=us&markets=h2h&oddsFormat=decimal&date=${snapAt}`;
  let resp;
  try { resp = await fetch(url); } catch (e) { console.log(`  fetch error @ ${T}: ${e.message}`); continue; }
  remaining = Number(resp.headers.get("x-requests-remaining") ?? remaining);
  if (!resp.ok) { console.log(`  HTTP ${resp.status} @ ${snapAt}`); continue; }
  const snap = await resp.json();
  const snapTs = snap.timestamp;
  if (!(new Date(snapTs) < new Date(T))) { console.log(`  SKIP lookahead: snap ${snapTs} !< kickoff ${T}`); continue; }
  for (const m of byKick.get(T)) {
    const game = (snap.data || []).find((g) => (norm(g.home_team) === norm(m.home) && norm(g.away_team) === norm(m.away)) || (norm(g.home_team) === norm(m.away) && norm(g.away_team) === norm(m.home)));
    if (!game) { unmatched.push(`${m.home} v ${m.away}`); continue; }
    const swap = norm(game.home_team) !== norm(m.home); // odds provider may list teams in the other order
    const perBook = [];
    for (const bk of game.bookmakers || []) {
      const mk = (bk.markets || []).find((x) => x.key === "h2h");
      if (!mk) continue;
      const find = (name) => mk.outcomes.find((o) => norm(o.name) === norm(name))?.price;
      const homeP = find(m.home), awayP = find(m.away), drawP = find("Draw");
      if (!homeP || !awayP || !drawP) continue;
      perBook.push(deVig({ home: homeP, draw: drawP, away: awayP }));
    }
    if (!perBook.length) { unmatched.push(`${m.home} v ${m.away} (no h2h)`); continue; }
    const avg = (k) => +(perBook.reduce((a, b) => a + b[k], 0) / perBook.length).toFixed(4);
    out.push({
      home: m.home, away: m.away, kickoff: T, snapshotTimestamp: snapTs, books: perBook.length,
      closingDeVig: { home: avg("home"), draw: avg("draw"), away: avg("away") },
      meanOverround: +(perBook.reduce((a, b) => a + b.overround, 0) / perBook.length).toFixed(4),
    });
  }
  process.stdout.write(`  ${T} → ${out.length} matched (credits ${remaining})\r`);
  await sleep(250);
}

const artifact = {
  _source: "The Odds API v4 /historical soccer_fifa_world_cup h2h, regions=us, snapshot ~6min before each kickoff (closing).",
  _sourceNote: "De-vigged per bookmaker (implied/overround), then averaged across books. All snapshots asserted strictly before kickoff (no lookahead).",
  _internal: true, _public: false, _officialMoneyRecordAffected: false,
  asOf: "2026-07-14", coverage: `${out.length}/${results.length} matches`, oddsTimestampMeaning: "last snapshot < kickoff (closing consensus)",
  limitations: ["US-region books only", "h2h/1X2 only (no totals/BTTS this pass)", "consensus = simple mean of de-vigged book probs"],
  creditsRemaining: remaining, matches: out,
};
fs.writeFileSync(path.join(REPO, "data/internal/world-cup/reference/wc-2022-closing-odds-baseline.json"), JSON.stringify(artifact, null, 2));
console.log(`\n✓ ${out.length}/${results.length} matches with closing odds · credits remaining ${remaining}`);
if (unmatched.length) console.log(`  unmatched (${unmatched.length}): ${unmatched.slice(0, 12).join(" | ")}`);
