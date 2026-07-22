/**
 * ingest-mlb-slate.mjs — the daily MLB ingestion pipeline. Fetches the MLB slate + prop odds from The
 * Odds API and writes the committed artifacts the app reads:
 *   public/data/mlb/schedule/<date>.json
 *   public/data/mlb/player-props/<date>.json        (hits / total bases / strikeouts / RBI / runs / HR)
 *   public/data/mlb/home-run-props/<date>.json      (HR subset, what Homer Nukes prefers)
 *
 * READ-ONLY to money: this NEVER touches bankroll / crown / exposure / portfolio.json / results — it only writes the
 * read-only daily MLB market artifacts. It writes nothing it didn't fetch from a real provider, so it
 * cannot fabricate a board. Requires ODDS_API_KEY.
 *
 * Usage:
 *   ODDS_API_KEY=… npx tsx app/scripts/ingest-mlb-slate.mjs --date 2026-06-23            # write artifacts
 *   ODDS_API_KEY=… npx tsx app/scripts/ingest-mlb-slate.mjs --date 2026-06-23 --dry-run  # fetch + report, write nothing
 *   npx tsx app/scripts/ingest-mlb-slate.mjs --date 2026-06-23 --dry-run                 # no key → reports the blocker, exits 0
 *
 * Data sources (documented):
 *   • The Odds API  — https://api.the-odds-api.com/v4/sports/baseball_mlb/events            (schedule)
 *   •                 …/events/{id}/odds?markets=batter_home_runs,batter_hits,batter_total_bases,
 *                      batter_rbis,batter_runs_scored,pitcher_strikeouts,pitcher_outs,pitcher_earned_runs
 *   • (Homer Score modeling inputs — Statcast/park/weather — are a separate enrichment step; the engine
 *      falls back to edge-ranking until they are wired.)
 */
import fs from "node:fs";
import path from "node:path";
import {
  normalizeMlbSchedule, normalizeMlbProps, extractHomeRunProps, MLB_INGEST_MARKET_KEYS,
} from "../src/lib/mlb/ingest-normalize.ts";

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DRY = args.includes("--dry-run");
const DATE = getArg("date", new Date().toISOString().slice(0, 10));
const KEY = process.env.ODDS_API_KEY;
const DATA = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app", "public", "data", "mlb");
const BASE = "https://api.the-odds-api.com/v4/sports/baseball_mlb";
const log = (...m) => console.log("[ingest-mlb]", ...m);

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url.replace(KEY ?? "", "***")}`);
  return res.json();
}

function writeArtifact(rel, obj) {
  if (DRY) { log(`DRY-RUN would write ${rel} (${JSON.stringify(obj).length} bytes)`); return; }
  const full = path.join(DATA, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj, null, 2));
  log(`wrote ${rel}`);
}

async function main() {
  log(`slate ${DATE}${DRY ? " (dry-run)" : ""}`);
  if (!KEY) {
    log("BLOCKED: ODDS_API_KEY is not set. The MLB board cannot be ingested without Odds API credentials.");
    log("Set ODDS_API_KEY (paid plan with MLB player-prop coverage) and re-run. No artifacts written; nothing fabricated.");
    process.exit(0); // honest no-op, not a failure
  }
  const generatedAt = new Date().toISOString();

  // 1) Schedule (events).
  const events = await getJson(`${BASE}/events?apiKey=${KEY}`);
  const schedule = normalizeMlbSchedule(events, DATE, generatedAt);
  log(`schedule: ${schedule.games.length} games for ${DATE}`);
  if (schedule.games.length === 0) {
    log("No MLB games for this date from the provider — writing empty schedule, no props to fetch.");
    writeArtifact(`schedule/${DATE}.json`, schedule);
    process.exit(0);
  }

  // 1b) Credit guard (fail-closed): a FREE /v4/sports probe reads x-requests-remaining BEFORE the paid per-event
  // odds calls, and aborts (honest no-op) below the floor so daily automation can never silently drain the budget.
  // Floor from ODDS_API_MIN_CREDITS_REMAINING (CI) / ODDS_CREDIT_FLOOR; default 0 ⇒ disabled for local dev.
  const CREDIT_FLOOR = Number(process.env.ODDS_API_MIN_CREDITS_REMAINING ?? process.env.ODDS_CREDIT_FLOOR ?? 0);
  if (CREDIT_FLOOR > 0) {
    try {
      const probe = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${KEY}`);
      const rem = probe.headers.get("x-requests-remaining");
      const remaining = rem != null ? Number(rem) : null;
      if (remaining != null && remaining < CREDIT_FLOOR) {
        log(`BLOCKED: Odds API credits ${remaining} below floor ${CREDIT_FLOOR} — refusing paid prop fetch. No artifacts written; nothing fabricated.`);
        process.exit(0); // honest no-op, not a failure
      }
      if (remaining != null) {
        log(`credits: ${remaining} remaining (floor ${CREDIT_FLOOR})`);
        // Sidecar so the completeness gate can report creditsRemaining (props runs last, so this is the freshest post-ingest value).
        try {
          const REPO = process.cwd().endsWith("app") ? path.dirname(process.cwd()) : process.cwd();
          const sd = path.join(REPO, "data/internal/mlb/pregame-archive/status");
          fs.mkdirSync(sd, { recursive: true });
          fs.writeFileSync(path.join(sd, "odds-credits.json"), JSON.stringify({ remaining, at: new Date().toISOString(), source: "player-props" }, null, 2) + "\n");
        } catch { /* best-effort */ }
      }
    } catch (e) { log(`credit probe failed (${e.message}) — proceeding (the paid call will surface a real error if out of credits).`); }
  }

  // 2) Per-event odds for the ingested prop markets.
  const markets = MLB_INGEST_MARKET_KEYS.join(",");
  const eventsOdds = [];
  for (const g of schedule.games) {
    try {
      const od = await getJson(`${BASE}/events/${g.gameId}/odds?apiKey=${KEY}&regions=us&oddsFormat=american&markets=${markets}`);
      eventsOdds.push(od);
    } catch (e) { log(`event ${g.gameId} odds failed: ${e.message}`); }
  }
  const props = normalizeMlbProps(eventsOdds, DATE, generatedAt);
  const hr = extractHomeRunProps(props);
  log(`props: ${props.props.length} total · ${hr.props.length} home-run`);

  // 3) Write artifacts.
  writeArtifact(`schedule/${DATE}.json`, schedule);
  writeArtifact(`player-props/${DATE}.json`, props);
  writeArtifact(`home-run-props/${DATE}.json`, hr);
  log("done.");
}

main().catch((e) => { console.error("[ingest-mlb] FAILED:", e.message); process.exit(1); });
