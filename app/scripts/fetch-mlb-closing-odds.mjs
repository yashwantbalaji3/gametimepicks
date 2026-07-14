#!/usr/bin/env node
/**
 * Fetch MLB CLOSING odds (h2h + totals + run-line spreads) from The Odds API /v4/historical for the settled
 * dates we have linescores for, de-vigged, joined to final scores. For each distinct first-pitch time, one
 * snapshot ~6 min before gives near-closing odds for the games starting then. Strictly pre-game, credit-guarded.
 *
 * Reads: data/internal/mlb/linescores/<date>.json (settled finals — the validation sample).
 * Writes (INTERNAL): data/internal/mlb/reference/mlb-closing-odds.json  (public:false).
 *
 * Usage: node app/scripts/fetch-mlb-closing-odds.mjs [--floor 6000]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const args = process.argv.slice(2);
const floor = Number((args[args.indexOf("--floor") + 1]) || 6000);
const KEY = (fs.readFileSync(path.join(REPO, ".env"), "utf8").match(/^ODDS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^['"]|['"]$/g, "");
if (!KEY) { console.error("no ODDS_API_KEY"); process.exit(1); }

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const LINE_DIR = path.join(REPO, "data/internal/mlb/linescores");
const dates = fs.readdirSync(LINE_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.replace(".json", "")).sort();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deVig2 = (a, b) => { const ia = 1 / a, ib = 1 / b; const s = ia + ib; return { a: ia / s, b: ib / s, overround: +(s - 1).toFixed(4) }; };

// First, discover each date's games + commence times via one snapshot near midday, then snapshot per commence.
const out = [];
let remaining = Infinity;
for (const date of dates) {
  if (remaining < floor) { console.log(`STOP credits ${remaining} < floor ${floor}`); break; }
  const finals = JSON.parse(fs.readFileSync(path.join(LINE_DIR, `${date}.json`), "utf8")).games || [];
  const settled = finals.filter((g) => g.isFinal && g.homeRuns != null && g.awayRuns != null);
  if (!settled.length) continue;
  // discovery snapshot: 16:00Z that day usually predates the first evening slate; use it to read commence times.
  const disc = await fetch(`https://api.the-odds-api.com/v4/historical/sports/baseball_mlb/odds?apiKey=${KEY}&regions=us&markets=h2h&date=${date}T15:00:00Z`).then((r) => { remaining = Number(r.headers.get("x-requests-remaining") ?? remaining); return r.ok ? r.json() : { data: [] }; }).catch(() => ({ data: [] }));
  const commenceByGame = new Map();
  for (const g of disc.data || []) commenceByGame.set(norm(g.home_team) + "|" + norm(g.away_team), g.commence_time);
  // group settled games by commence time (fallback: a fixed evening snapshot when discovery missed it)
  const slots = new Map();
  for (const g of settled) {
    const c = commenceByGame.get(norm(g.homeTeam) + "|" + norm(g.awayTeam)) || `${date}T23:00:00Z`;
    (slots.get(c) ?? slots.set(c, []).get(c)).push(g);
  }
  for (const [commence, games] of slots) {
    if (remaining < floor) break;
    const snapAt = new Date(new Date(commence).getTime() - 6 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const snap = await fetch(`https://api.the-odds-api.com/v4/historical/sports/baseball_mlb/odds?apiKey=${KEY}&regions=us&markets=h2h,totals,spreads&oddsFormat=decimal&date=${snapAt}`).then((r) => { remaining = Number(r.headers.get("x-requests-remaining") ?? remaining); return r.ok ? r.json() : null; }).catch(() => null);
    if (!snap || !(new Date(snap.timestamp) < new Date(commence))) continue;
    for (const g of games) {
      const ev = (snap.data || []).find((e) => norm(e.home_team) === norm(g.homeTeam) && norm(e.away_team) === norm(g.awayTeam));
      if (!ev) continue;
      const h2h = [], tot = [], spr = [];
      for (const bk of ev.bookmakers || []) {
        const mH = (bk.markets || []).find((m) => m.key === "h2h");
        const mT = (bk.markets || []).find((m) => m.key === "totals");
        const mS = (bk.markets || []).find((m) => m.key === "spreads");
        if (mH) { const ho = mH.outcomes.find((o) => norm(o.name) === norm(g.homeTeam))?.price, ao = mH.outcomes.find((o) => norm(o.name) === norm(g.awayTeam))?.price; if (ho && ao) h2h.push(deVig2(ho, ao)); }
        if (mT) { const ov = mT.outcomes.find((o) => /over/i.test(o.name)), un = mT.outcomes.find((o) => /under/i.test(o.name)); if (ov?.price && un?.price && ov.point != null) { const d = deVig2(ov.price, un.price); tot.push({ line: ov.point, over: d.a }); } }
        if (mS) { const hs = mS.outcomes.find((o) => norm(o.name) === norm(g.homeTeam)); if (hs?.point != null && hs.price) { const os = mS.outcomes.find((o) => norm(o.name) === norm(g.awayTeam)); if (os?.price) { const d = deVig2(hs.price, os.price); spr.push({ homeLine: hs.point, homeCover: d.a }); } } }
      }
      if (!h2h.length) continue;
      const avg = (arr, k) => arr.length ? +(arr.reduce((s, x) => s + x[k], 0) / arr.length).toFixed(4) : null;
      out.push({
        date, gamePk: g.gamePk, home: g.homeTeam, away: g.awayTeam, homeRuns: g.homeRuns, awayRuns: g.awayRuns,
        snapshot: snap.timestamp, commence, books: h2h.length,
        closing: {
          homeWinProb: avg(h2h, "a"), awayWinProb: avg(h2h, "b"),
          totalLine: tot.length ? +(tot.reduce((s, x) => s + x.line, 0) / tot.length).toFixed(1) : null, overProb: avg(tot, "over"),
          homeRunLine: spr.length ? +(spr.reduce((s, x) => s + x.homeLine, 0) / spr.length).toFixed(1) : null, homeCoverProb: avg(spr, "homeCover"),
        },
      });
    }
    process.stdout.write(`  ${date} ${commence} → ${out.length} games (credits ${remaining})\r`);
    await sleep(250);
  }
}

const artifact = {
  _source: "The Odds API v4 /historical baseball_mlb h2h+totals+spreads, regions=us, snapshot ~6min before first pitch (closing).",
  _sourceNote: "De-vigged per bookmaker, averaged across books. All snapshots asserted strictly before commence.",
  _internal: true, _public: false, _officialMoneyRecordAffected: false,
  asOf: "2026-07-14", coverage: `${out.length} settled games across ${new Set(out.map((o) => o.date)).size} dates`,
  creditsRemaining: remaining, games: out,
};
fs.mkdirSync(path.join(REPO, "data/internal/mlb/reference"), { recursive: true });
fs.writeFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-closing-odds.json"), JSON.stringify(artifact, null, 2));
console.log(`\n✓ ${out.length} games with closing odds across ${new Set(out.map((o) => o.date)).size} dates · credits ${remaining}`);
