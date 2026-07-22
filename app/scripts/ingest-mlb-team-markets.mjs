/**
 * ingest-mlb-team-markets.mjs — fetch de-vigged MLB TEAM markets (moneyline / run
 * line / game total) for a slate and write `public/data/mlb/team-markets/<date>.json`.
 *
 * ADDITIVE + MONEY-INDEPENDENT: touches no player-prop ingest, no board, no money
 * artifact. It only writes the new team-markets file. The Odds event `id` is the same
 * `gameId` our sim artifact + board leans use, so the full-market generator joins by id.
 *
 * Credit-guarded (fail-closed): a FREE `/v4/sports` probe reads x-requests-remaining
 * before the one paid `/odds` call; aborts below the floor. One bulk request
 * (`markets=h2h,spreads,totals&regions=us`) covers the whole slate for ~3 credits.
 * De-vig via the repo's `noVigTwoWay` (proportional overround strip) — no fabrication:
 * a market absent from the book is simply omitted (the generator shows it unavailable).
 *
 * Usage (from app/):
 *   npx tsx scripts/ingest-mlb-team-markets.mjs --dry-run --date 2026-07-09   # fetch + print, no write
 *   npx tsx scripts/ingest-mlb-team-markets.mjs --write   --date 2026-07-09   # fetch + write artifact
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noVigTwoWay, americanToImpliedRaw } from "../src/lib/projection-framework.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(APP, "..");
const BOOK = "draftkings";
const CREDIT_FLOOR = Number(process.env.ODDS_CREDIT_FLOOR ?? 5000);
const HOST = "https://api.the-odds-api.com/v4/sports/baseball_mlb";

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

function oddsKey() {
  // Prefer the environment (CI provides ODDS_API_KEY as a secret; no .env exists there). Fall back to repo-root
  // .env for local dev. Never logged. Mirrors ingest-mlb-slate.mjs (process.env.ODDS_API_KEY).
  const fromEnv = (process.env.ODDS_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const env = fs.readFileSync(path.join(REPO, ".env"), "utf8");
    const m = env.match(/ODDS_API_KEY=([^\r\n]+)/);
    if (m) return m[1].trim();
  } catch { /* no .env in CI — the env var is the source there */ }
  throw new Error("ODDS_API_KEY missing (set the env var, or add ODDS_API_KEY= to .env for local dev)");
}

function round(n, d = 4) {
  return typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(d)) : null;
}

/** De-vig a 2-way market: returns {sideProb, otherProb} rounded, or null if a price is missing. */
function devig(oddsSide, oddsOther) {
  const nv = noVigTwoWay(oddsSide, oddsOther);
  return nv ? { sideProb: round(nv.side), otherProb: round(nv.other) } : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date) throw new Error("--date YYYY-MM-DD is required");
  if (!args.write && !args.dryRun) throw new Error("pass --write or --dry-run");
  const KEY = oddsKey();

  // The slate's gameIds (= Odds event ids) come from the committed board — only slate
  // events are kept, so we never store team markets for other days' games.
  const boardPath = path.join(APP, "public", "data", "mlb", "boards", `${args.date}.json`);
  if (!fs.existsSync(boardPath)) throw new Error(`no MLB board for ${args.date} — generate the board first`);
  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  const slateIds = new Set((board.leans ?? board.picks ?? []).map((l) => l.gameId).filter(Boolean));
  if (slateIds.size === 0) throw new Error(`board ${args.date} has no gameIds`);

  // ── credit guard (fail-closed) — FREE /sports probe reads remaining before paid call ──
  const probe = await fetch(`${HOST}/odds/?apiKey=${KEY}&regions=us&markets=h2h&dateFormat=iso&_probe=1`, { method: "HEAD" }).catch(() => null);
  // HEAD may not be supported by the API; fall back to reading the header on the real GET.
  let remaining = probe?.headers?.get?.("x-requests-remaining");
  remaining = remaining != null ? Number(remaining) : null;
  const creditsBefore = remaining; // reading BEFORE any paid call this run (team-markets runs first in the pipeline)
  if (remaining != null && remaining < CREDIT_FLOOR) {
    throw new Error(`Odds API credits ${remaining} below floor ${CREDIT_FLOOR} — refusing paid fetch. Override with ODDS_CREDIT_FLOOR.`);
  }

  // ── one bulk paid call: h2h + spreads + totals for every MLB event (us region) ──
  const url = `${HOST}/odds/?apiKey=${KEY}&regions=us&oddsFormat=american&markets=h2h,spreads,totals`;
  const res = await fetch(url);
  const cost = res.headers.get("x-requests-last");
  remaining = res.headers.get("x-requests-remaining");
  if (res.status !== 200) throw new Error(`Odds API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.log(`[team-markets] fetched · this request cost ${cost} credits · ${remaining} remaining`);
  // Credits sidecar the completeness gate reads (the gate never calls the paid API). team-markets runs FIRST, so it
  // RESETS the sidecar for this run's slate date; ingest-mlb-slate appends its readings after. before/after ⇒ creditsSpent.
  try {
    const sd = path.join(REPO, "data/internal/mlb/pregame-archive/status");
    fs.mkdirSync(sd, { recursive: true });
    const now = new Date().toISOString();
    const after = remaining != null ? Number(remaining) : null;
    const readings = [];
    if (creditsBefore != null) readings.push({ source: "team-markets:before", remaining: creditsBefore, at: now });
    if (after != null) readings.push({ source: "team-markets:after", remaining: after, at: now });
    fs.writeFileSync(path.join(sd, "odds-credits.json"), JSON.stringify({ date: args.date, readings, remaining: after, updatedAt: now }, null, 2) + "\n");
  } catch { /* sidecar is best-effort; never block the ingest */ }
  const events = await res.json();

  const games = {};
  let kept = 0;
  for (const ev of events) {
    if (!slateIds.has(ev.id)) continue; // slate events only
    const bk = (ev.bookmakers ?? []).find((b) => b.key === BOOK) ?? (ev.bookmakers ?? [])[0];
    if (!bk) continue;
    const mk = Object.fromEntries((bk.markets ?? []).map((m) => [m.key, m]));
    const home = ev.home_team, away = ev.away_team;
    const out = { gameId: ev.id, homeTeam: home, awayTeam: away, commenceTime: ev.commence_time, bookmaker: bk.key };

    // moneyline (h2h) — 2-way, no draw in MLB
    if (mk.h2h) {
      const h = mk.h2h.outcomes.find((o) => o.name === home);
      const a = mk.h2h.outcomes.find((o) => o.name === away);
      if (h && a) {
        const nv = devig(h.price, a.price);
        out.moneyline = {
          home: { odds: h.price, impliedProb: round(americanToImpliedRaw(h.price)), noVigProb: nv?.sideProb ?? null },
          away: { odds: a.price, impliedProb: round(americanToImpliedRaw(a.price)), noVigProb: nv?.otherProb ?? null },
          draw: null,
        };
      }
    }
    // run line (spreads) — home cover vs away cover
    if (mk.spreads) {
      const h = mk.spreads.outcomes.find((o) => o.name === home);
      const a = mk.spreads.outcomes.find((o) => o.name === away);
      if (h && a) {
        const nv = devig(h.price, a.price);
        out.runLine = {
          line: h.point ?? null,
          home: { line: h.point ?? null, odds: h.price, coverNoVigProb: nv?.sideProb ?? null },
          away: { line: a.point ?? null, odds: a.price, coverNoVigProb: nv?.otherProb ?? null },
        };
      }
    }
    // game total (totals) — over vs under
    if (mk.totals) {
      const ov = mk.totals.outcomes.find((o) => /over/i.test(o.name));
      const un = mk.totals.outcomes.find((o) => /under/i.test(o.name));
      if (ov && un) {
        const nv = devig(ov.price, un.price);
        out.total = {
          line: ov.point ?? null,
          over: { odds: ov.price, noVigProb: nv?.sideProb ?? null },
          under: { odds: un.price, noVigProb: nv?.otherProb ?? null },
        };
      }
    }
    games[ev.id] = out;
    kept += 1;
  }

  const artifact = {
    sport: "mlb",
    date: args.date,
    generatedAt: new Date().toISOString(),
    source: "odds_api",
    bookmaker: BOOK,
    method: "market_implied_devig",
    marketsCovered: ["moneyline", "run_line", "total"],
    gameCount: kept,
    games,
  };

  console.log(`[team-markets] slate ${args.date}: ${kept}/${slateIds.size} slate games have team markets`);
  const sample = Object.values(games)[0];
  if (sample) {
    console.log(`  e.g. ${sample.awayTeam} @ ${sample.homeTeam}: ML home ${sample.moneyline?.home.noVigProb} · total ${sample.total?.line} (O ${sample.total?.over.noVigProb}) · RL ${sample.runLine?.line}`);
  }

  if (args.dryRun) {
    console.log("[team-markets] --dry-run: nothing written.");
    return;
  }
  const outDir = path.join(APP, "public", "data", "mlb", "team-markets");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${args.date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`[team-markets] wrote ${path.relative(APP, outPath)}`);
}

main().catch((e) => {
  console.error("[team-markets] ERROR:", e.message);
  process.exit(1);
});
