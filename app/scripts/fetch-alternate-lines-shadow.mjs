/**
 * fetch-alternate-lines-shadow — SHADOW-ONLY MLB alternate-line fetch.
 *
 * Makes a SMALL, cost-capped paid Odds API call for MLB alternate player-prop
 * markets and writes the result to a NON-public, gitignored shadow cache. It
 * does NOT touch official boards, optimizer, snapshots, projections, public
 * data, or UI. Dry-run by default.
 *
 * SAFETY:
 *   - Requires ODDS_API_KEY in env (source .env first). Exits if missing.
 *   - Cost model = (#markets × #regions) per event. Estimates BEFORE any paid
 *     call; aborts if estimate > --maxCredits.
 *   - After the FIRST paid event call, reads x-requests-last (actual per-event
 *     cost) and aborts the rest if the projected total would exceed the cap.
 *   - Output: pipeline/cache/odds/alternate-lines/mlb/<date>.json (gitignored).
 *
 * Usage:
 *   source .env   (so ODDS_API_KEY is set)
 *   cd app
 *   npx tsx scripts/fetch-alternate-lines-shadow.mjs --date 2026-06-04 --dryRun true
 *   npx tsx scripts/fetch-alternate-lines-shadow.mjs --date 2026-06-04 --dryRun false --maxCredits 50
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deVigAlternateLine, validateAlternateLineRecord, classifyAlternateLineCompleteness } from "../src/lib/alternate-lines.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const DATA = resolve(__dirname, "..", "public", "data");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DATE = arg("date", "2026-06-04");
const MARKETS = arg("markets", "batter_hits_alternate,batter_total_bases_alternate").split(",").map((s) => s.trim()).filter(Boolean);
const REGIONS = arg("regions", "us").split(",").map((s) => s.trim()).filter(Boolean);
const BOOKMAKERS = arg("bookmakers", "draftkings,fanduel");
const MAX_CREDITS = Number(arg("maxCredits", "50"));
const DRY_RUN = String(arg("dryRun", "true")).toLowerCase() !== "false";
const SPORT_KEY = "baseball_mlb";
const API = "https://api.the-odds-api.com/v4";
const KEY = process.env.ODDS_API_KEY || "";
const DEST = resolve(ROOT, "pipeline", "cache", "odds", "alternate-lines", "mlb", `${DATE}.json`);

function fail(msg) { console.error(`STOP: ${msg}`); process.exit(2); }
if (!KEY) fail("ODDS_API_KEY not set (source .env first). No fetch performed.");

// Board playerName -> playerId/team/opponent/gameId for resolution.
function boardIndex(date) {
  try {
    const b = JSON.parse(readFileSync(resolve(DATA, "mlb", "boards", `${date}.json`), "utf8"));
    const idx = new Map();
    for (const l of b.leans || []) {
      if (l.playerName && !idx.has(l.playerName)) {
        idx.set(l.playerName, { playerId: l.playerId, team: l.playerTeamAbbr, opponent: l.opponentAbbr, gameId: l.gameId });
      }
    }
    return idx;
  } catch { return new Map(); }
}

async function getJSON(url) {
  const res = await fetch(url);
  const last = res.headers.get("x-requests-last");
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  const body = await res.json().catch(() => null);
  return { status: res.status, body, last: last != null ? Number(last) : null, remaining: remaining != null ? Number(remaining) : null, used: used != null ? Number(used) : null };
}

async function main() {
  console.log("ALTERNATE-LINES SHADOW FETCH (MLB only) —", DRY_RUN ? "DRY RUN" : "LIVE");
  console.log(`date=${DATE} sport=${SPORT_KEY} markets=[${MARKETS.join(", ")}] regions=[${REGIONS.join(", ")}] books=${BOOKMAKERS} maxCredits=${MAX_CREDITS}`);
  console.log(`destination (gitignored, non-public): ${DEST}`);

  // FREE: list upcoming events for the slate window.
  const from = `${DATE}T00:00:00Z`;
  const to = `${DATE}T23:59:59Z`;
  // MLB games can commence just after midnight UTC the next day; widen the upper bound.
  const toWide = new Date(`${DATE}T00:00:00Z`); toWide.setUTCDate(toWide.getUTCDate() + 1); toWide.setUTCHours(12);
  void to;
  const evUrl = `${API}/sports/${SPORT_KEY}/events?apiKey=${KEY}&commenceTimeFrom=${from}&commenceTimeTo=${toWide.toISOString().slice(0, 19)}Z&dateFormat=iso`;
  const ev = await getJSON(evUrl);
  if (ev.status !== 200 || !Array.isArray(ev.body)) fail(`events listing failed (HTTP ${ev.status})`);
  const events = ev.body;
  console.log(`upcoming events: ${events.length} · balance remaining: ${ev.remaining}`);

  const perEventEstimate = MARKETS.length * REGIONS.length;
  const estimate = events.length * perEventEstimate;
  console.log(`estimated cost: ${events.length} events × ${MARKETS.length} markets × ${REGIONS.length} regions = ${estimate} credits`);

  if (estimate > MAX_CREDITS) fail(`estimate ${estimate} > maxCredits ${MAX_CREDITS}. Reduce markets/events.`);
  if (ev.remaining != null && ev.remaining < estimate) fail(`balance ${ev.remaining} < estimate ${estimate}.`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no /odds calls, no credits spent, no file written.");
    console.log("Events that WOULD be fetched:");
    for (const e of events) console.log(`  ${e.id} | ${e.commence_time} | ${e.away_team} @ ${e.home_team}`);
    return;
  }

  // LIVE — fetch per event, verify cost after the first.
  const idx = boardIndex(DATE);
  const records = [];
  let spent = 0;
  const asOf = new Date().toISOString();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const url = `${API}/sports/${SPORT_KEY}/events/${e.id}/odds?apiKey=${KEY}&regions=${REGIONS.join(",")}&markets=${MARKETS.join(",")}&oddsFormat=american&bookmakers=${BOOKMAKERS}&dateFormat=iso`;
    const r = await getJSON(url);
    if (r.status !== 200) { console.warn(`  event ${e.id}: HTTP ${r.status} — skipping`); continue; }
    if (r.last != null) spent += r.last;
    // After the FIRST call, verify actual per-event cost won't blow the cap.
    if (i === 0 && r.last != null) {
      const projected = r.last * events.length;
      console.log(`  [verify] first event actual cost=${r.last}; projected total=${projected}`);
      if (projected > MAX_CREDITS) fail(`actual projected ${projected} > maxCredits ${MAX_CREDITS} — stopping after 1 event (spent ${spent}).`);
    }
    // Parse alternate ladders: collect over/under by (player, market, line).
    const book = (r.body?.bookmakers || [])[0];
    for (const mk of book?.markets || []) {
      const ladder = new Map(); // `${player}|${point}` -> {over, under}
      for (const o of mk.outcomes || []) {
        const player = o.description;
        const point = o.point;
        if (player == null || point == null) continue;
        const k = `${player}|${point}`;
        const cur = ladder.get(k) || { over: null, under: null };
        if ((o.name || "").toLowerCase() === "over") cur.over = o.price;
        else if ((o.name || "").toLowerCase() === "under") cur.under = o.price;
        ladder.set(k, cur);
      }
      for (const [k, sides] of ladder) {
        const [player, pointStr] = k.split("|");
        const resolved = idx.get(player) || {};
        const dv = deVigAlternateLine(sides.over, sides.under);
        const rec = {
          sport: "mlb", date: DATE, gameId: resolved.gameId ?? null, commenceTime: e.commence_time,
          playerId: resolved.playerId ?? null, playerName: player, team: resolved.team ?? null, opponent: resolved.opponent ?? null,
          market: mk.key.replace(/_alternate$/, ""), sourceMarketKey: mk.key,
          line: Number(pointStr), side: "both", overOdds: sides.over ?? null, underOdds: sides.under ?? null,
          devigOver: dv?.devigOver ?? null, devigUnder: dv?.devigUnder ?? null,
          provider: book?.key || "the-odds-api", asOf, source: "the-odds-api/v4",
          validationStatus: "", blockedReason: "",
        };
        const completeness = classifyAlternateLineCompleteness({ ...rec, mainLine: rec.line, alternateLine: rec.line });
        const v = validateAlternateLineRecord({ ...rec, mainLine: rec.line, alternateLine: rec.line });
        rec.validationStatus = completeness === "complete" && v.valid ? "valid" : completeness;
        rec.blockedReason = v.valid ? "" : v.errors.join("; ");
        records.push(rec);
      }
    }
  }

  mkdirSync(dirname(DEST), { recursive: true });
  const out = { sport: "mlb", date: DATE, fetchedAt: asOf, markets: MARKETS, regions: REGIONS, bookmakers: BOOKMAKERS, eventsFetched: events.length, creditsSpent: spent, recordCount: records.length, records };
  writeFileSync(DEST, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nLIVE fetch complete. credits spent: ${spent}. records: ${records.length}. wrote ${DEST}`);
}

main().catch((e) => fail(e?.message || String(e)));
