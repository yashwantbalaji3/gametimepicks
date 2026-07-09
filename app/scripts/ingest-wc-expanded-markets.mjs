/**
 * ingest-wc-expanded-markets.mjs — de-vigged EXPANDED World Cup team markets (Asian handicap +
 * team totals) for a slate → public/data/world-cup/expanded-markets/<date>.json.
 *
 * ADDITIVE + MONEY-INDEPENDENT: touches no money artifact, no core WC projection. Reads the slate's
 * matchIds from the committed WC projection (matchId == the Odds event id) and fetches per-event
 * `spreads` + `team_totals` (both clean 2-way markets), de-vigging each with the repo's noVigTwoWay.
 * Credit-guarded (fail-closed). A market a book doesn't post is recorded as unavailable, never invented.
 *
 * Usage (from app/):
 *   npx tsx scripts/ingest-wc-expanded-markets.mjs --dry-run --date 2026-07-09
 *   npx tsx scripts/ingest-wc-expanded-markets.mjs --write   --date 2026-07-09
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noVigTwoWay, americanToImpliedRaw } from "../src/lib/projection-framework.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(APP, "..");
const CREDIT_FLOOR = Number(process.env.ODDS_CREDIT_FLOOR ?? 5000);
const HOST = "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup";

function parseArgs(argv) {
  const a = { write: false, dryRun: false, date: null };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--write") a.write = true;
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--date") a.date = argv[++i];
    else if (t.startsWith("--date=")) a.date = t.slice(7);
  }
  return a;
}
const oddsKey = () => {
  const m = fs.readFileSync(path.join(REPO, ".env"), "utf8").match(/ODDS_API_KEY=([^\r\n]+)/);
  if (!m) throw new Error("ODDS_API_KEY missing from .env");
  return m[1].trim();
};
const round = (n, d = 4) => (typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(d)) : null);
const devig = (a, b) => {
  const nv = noVigTwoWay(a, b);
  return nv ? { sideProb: round(nv.side), otherProb: round(nv.other) } : null;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date) throw new Error("--date YYYY-MM-DD is required");
  if (!args.write && !args.dryRun) throw new Error("pass --write or --dry-run");
  const KEY = oddsKey();

  // Slate matchIds (= Odds event ids) come from the committed WC projection.
  const projPath = path.join(APP, "public", "data", "world-cup", "projections", `${args.date}.json`);
  if (!fs.existsSync(projPath)) throw new Error(`no WC projection for ${args.date} — generate it first`);
  const proj = JSON.parse(fs.readFileSync(projPath, "utf8"));
  const matchIds = [...new Set((proj.matches ?? []).map((m) => String(m.matchId)).filter(Boolean))];
  if (matchIds.length === 0) throw new Error(`WC projection ${args.date} has no matchIds`);

  // Credit guard (fail-closed): read remaining from the FREE events endpoint before any paid odds call.
  const evRes = await fetch(`${HOST}/events/?apiKey=${KEY}`);
  let remaining = evRes.headers.get("x-requests-remaining");
  remaining = remaining != null ? Number(remaining) : null;
  if (remaining != null && remaining < CREDIT_FLOOR) {
    throw new Error(`Odds API credits ${remaining} below floor ${CREDIT_FLOOR} — refusing paid fetch.`);
  }
  const events = evRes.status === 200 ? await evRes.json() : [];
  const evById = new Map(events.map((e) => [e.id, e]));

  const matches = {};
  let totalCost = 0;
  for (const mid of matchIds) {
    const res = await fetch(`${HOST}/events/${mid}/odds/?apiKey=${KEY}&regions=us&oddsFormat=american&markets=spreads,team_totals`);
    totalCost += Number(res.headers.get("x-requests-last") ?? 0);
    remaining = res.headers.get("x-requests-remaining");
    if (res.status !== 200) {
      matches[mid] = { gameId: mid, unavailableMarkets: [{ market: "asian_handicap", reason: `odds_${res.status}` }, { market: "team_totals", reason: `odds_${res.status}` }], markets: {} };
      continue;
    }
    const ev = await res.json();
    const home = ev.home_team, away = ev.away_team;
    const out = { gameId: mid, homeTeam: home, awayTeam: away, kickoff: ev.commence_time, markets: {}, unavailableMarkets: [] };

    // Asian handicap — first book with a valid 2-sided spreads market.
    let ah = null;
    for (const b of ev.bookmakers ?? []) {
      const m = (b.markets ?? []).find((x) => x.key === "spreads");
      const h = m?.outcomes?.find((o) => o.name === home);
      const a = m?.outcomes?.find((o) => o.name === away);
      if (h && a && h.point != null) {
        const nv = devig(h.price, a.price);
        ah = {
          source: b.key,
          line: h.point,
          home: { line: h.point, odds: h.price, impliedProb: round(americanToImpliedRaw(h.price)), noVigProb: nv?.sideProb ?? null },
          away: { line: a.point ?? null, odds: a.price, impliedProb: round(americanToImpliedRaw(a.price)), noVigProb: nv?.otherProb ?? null },
        };
        break;
      }
    }
    if (ah) out.markets.asianHandicap = ah;
    else out.unavailableMarkets.push({ market: "asian_handicap", reason: "not_posted" });

    // Team totals — first book with valid 2-sided over/under for BOTH teams.
    let tt = null;
    for (const b of ev.bookmakers ?? []) {
      const m = (b.markets ?? []).find((x) => x.key === "team_totals");
      if (!m) continue;
      const teamSide = (team) => {
        const ov = m.outcomes.find((o) => /over/i.test(o.name) && o.description === team);
        const un = m.outcomes.find((o) => /under/i.test(o.name) && o.description === team);
        if (!ov || !un || ov.point == null) return null;
        const nv = devig(ov.price, un.price);
        return { team, line: ov.point, over: { odds: ov.price, noVigProb: nv?.sideProb ?? null }, under: { odds: un.price, noVigProb: nv?.otherProb ?? null } };
      };
      const h = teamSide(home), a = teamSide(away);
      if (h && a) { tt = { source: b.key, home: h, away: a }; break; }
    }
    if (tt) out.markets.teamTotals = tt;
    else out.unavailableMarkets.push({ market: "team_totals", reason: "not_posted" });

    matches[mid] = out;
  }

  const artifact = {
    sport: "world-cup",
    date: args.date,
    generatedAt: new Date().toISOString(),
    source: "odds_api",
    method: "market_implied_devig",
    marketsCovered: ["asian_handicap", "team_totals"],
    creditCost: totalCost,
    matchCount: Object.keys(matches).length,
    matches,
  };

  console.log(`[wc-expanded] slate ${args.date}: ${Object.keys(matches).length} matches · ${totalCost} credits · ${remaining} remaining`);
  for (const m of Object.values(matches)) {
    console.log(`  ${m.awayTeam ?? "?"} @ ${m.homeTeam ?? "?"}: AH ${m.markets.asianHandicap ? m.markets.asianHandicap.line + " (" + m.markets.asianHandicap.source + ")" : "—"} · TT ${m.markets.teamTotals ? "✓ (" + m.markets.teamTotals.source + ")" : "—"}${m.unavailableMarkets.length ? " · unavailable: " + m.unavailableMarkets.map((u) => u.market).join(",") : ""}`);
  }

  if (args.dryRun) { console.log("[wc-expanded] --dry-run: nothing written."); return; }
  const outDir = path.join(APP, "public", "data", "world-cup", "expanded-markets");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${args.date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`[wc-expanded] wrote ${path.relative(APP, outPath)}`);
}

main().catch((e) => { console.error("[wc-expanded] ERROR:", e.message); process.exit(1); });
