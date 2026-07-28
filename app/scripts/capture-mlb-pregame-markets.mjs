/**
 * capture-mlb-pregame-markets.mjs — INTERNAL, forward-only, credit-guarded MLB pregame MARKET snapshot capture
 * (paid the-odds-api). Extends the pregame research archive with team markets (+ player props if the credit
 * budget allows). Immutable, timestamp-safe, leakage-safe. Never public, never a product, never money.
 *
 * SAFETY: dry-run is the DEFAULT (0 credits — it checks remaining credits via the free /sports endpoint and
 * estimates the plan, but does NOT fetch odds). `--write` fetches odds and is credit-guarded (floor + max) and
 * skips started games. A market record is research-eligible only if capturedAt < eventStartTime.
 *
 * CLI:
 *   node app/scripts/capture-mlb-pregame-markets.mjs --date 2026-07-22                 # dry-run (default)
 *   node app/scripts/capture-mlb-pregame-markets.mjs --date 2026-07-22 --markets h2h,spreads,totals
 *   node app/scripts/capture-mlb-pregame-markets.mjs --date 2026-07-22 --max-credits 200 --write
 *
 * Writes (internal, public:false): data/internal/mlb/pregame-archive/market-snapshots/<date>/<captureId>/
 *   { raw.json, normalized.json, manifest.json }  — new capture = new immutable directory.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive/market-snapshots");
const API = "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const nowIso = () => new Date().toISOString();
const hash = (o) => crypto.createHash("sha256").update(typeof o === "string" ? o : JSON.stringify(o)).digest("hex").slice(0, 32);

const DATE = getArg("--date", new Date().toISOString().slice(0, 10));
const MARKETS = getArg("--markets", "h2h,spreads,totals").split(",").map((s) => s.trim()).filter(Boolean);
const REGIONS = getArg("--regions", "us");
const WRITE = has("--write");                     // default: dry-run (no credit spend)
const MAX_CREDITS = Number(getArg("--max-credits", "0")) || 0;

/** .env loader (manual — no dotenv). Values are read-only; never logged. */
function envVal(name) {
  if (process.env[name]) return process.env[name];
  try { return (fs.readFileSync(path.join(REPO, ".env"), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] || "").trim().replace(/^['"]|['"]$/g, ""); } catch { return ""; }
}
const KEY = envVal("ODDS_API_KEY");
const CREDIT_FLOOR = Number(envVal("ODDS_API_MIN_CREDITS_REMAINING")) || 100;

const americanToProb = (a) => (a == null ? null : a < 0 ? -a / (-a + 100) : 100 / (a + 100));
const americanToDecimal = (a) => (a == null ? null : a > 0 ? a / 100 + 1 : 100 / -a + 1);

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const remaining = Number(r.headers.get("x-requests-remaining"));
  const used = Number(r.headers.get("x-requests-used"));
  if (!r.ok) return { ok: false, status: r.status, remaining, used, error: `HTTP ${r.status}` };
  return { ok: true, status: r.status, remaining, used, body: await r.json() };
}

/** Free credit probe — the /sports list endpoint does not consume credits but returns the usage headers. */
async function checkCredits() {
  if (!KEY) return { available: false, reason: "ODDS_API_KEY not set" };
  try { const r = await getJson(`${API}/sports/?apiKey=${KEY}`); return { available: r.ok, remaining: r.remaining, used: r.used }; }
  catch (e) { return { available: false, reason: String(e.message || e) }; }
}

/** StatsAPI schedule → games + first-pitch times (free), used to skip started games + map event → gamePk. */
async function schedule() {
  try { const r = await getJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}&hydrate=team`); return (r.body?.dates?.[0]?.games ?? []).map((g) => ({ gamePk: g.gamePk, commenceTime: g.gameDate, home: g.teams?.home?.team?.name, away: g.teams?.away?.team?.name, status: g.status?.detailedState })); }
  catch { return []; }
}

/** Normalize one provider event's bookmaker odds → immutable, timestamp-safe records with de-vig (paired only). */
function normalizeEvent(ev, gamePk, capturedAt) {
  const eventStartTime = ev.commence_time;
  const capturedPregame = eventStartTime ? Date.parse(capturedAt) < Date.parse(eventStartTime) : false;
  const records = [];
  for (const bk of ev.bookmakers ?? []) {
    const lastUpdate = bk.last_update ?? null;
    const availableAt = lastUpdate && Date.parse(lastUpdate) < Date.parse(capturedAt) ? lastUpdate : capturedAt;
    const availPregame = eventStartTime ? Date.parse(availableAt) < Date.parse(eventStartTime) : false;
    for (const mk of bk.markets ?? []) {
      const outs = mk.outcomes ?? [];
      // pairing for de-vig: h2h (2 teams), totals/spreads (Over/Under or ± at same point)
      const byPoint = new Map();
      for (const o of outs) { const k = mk.key === "h2h" ? "ml" : `${o.point ?? ""}`; if (!byPoint.has(k)) byPoint.set(k, []); byPoint.get(k).push(o); }
      for (const o of outs) {
        const grpKey = mk.key === "h2h" ? "ml" : `${o.point ?? ""}`;
        const grp = byPoint.get(grpKey) || [];
        const other = grp.find((x) => x !== o);
        const impliedProbability = americanToProb(o.price);
        const paired = grp.length >= 2 && !!other;
        const noVigProbability = paired && Number.isFinite(americanToProb(other.price)) ? +(impliedProbability / (impliedProbability + americanToProb(other.price))).toFixed(4) : null;
        records.push({
          schemaVersion: "mlb-market-snapshot-1", public: false, sport: "mlb", date: DATE,
          gamePk: gamePk ?? null, providerEventId: ev.id, homeTeam: ev.home_team, awayTeam: ev.away_team,
          eventStartTime, capturedAt, availableAt, sourceLastUpdate: lastUpdate,
          bookmaker: bk.key, market: mk.key, selection: o.name, line: o.point ?? null,
          oddsAmerican: o.price, oddsDecimal: +Number(americanToDecimal(o.price)).toFixed(4), impliedProbability: +Number(impliedProbability).toFixed(4),
          noVigProbability, paired, deVigStatus: paired ? "paired" : (mk.key === "h2h" ? "incomplete" : "over_only_or_unpaired"),
          researchEligible: capturedPregame && availPregame,
          eligibilityReason: !capturedPregame ? "captured at/after first pitch" : !availPregame ? "provider last_update at/after first pitch" : "captured + available pregame",
          provenance: { source: "the-odds-api", endpoint: `${API}/sports/${SPORT}/odds`, sportKey: SPORT, marketKey: mk.key, bookmaker: bk.key, regions: REGIONS, sourceLastUpdate: lastUpdate, requestedAt: capturedAt },
        });
      }
    }
  }
  return records;
}

async function main() {
  const sched = await schedule();
  const notStarted = sched.filter((g) => !["In Progress", "Final", "Game Over", "Completed Early"].some((s) => (g.status || "").includes(s)));
  const credits = await checkCredits();
  // credit estimate: main odds endpoint costs ~1 credit per market per region (covers all games in one call).
  const estMainCredits = MARKETS.length * REGIONS.split(",").length;
  const captureId = `mk-${hash(nowIso())}`;

  const summary = {
    public: false, approvedForProduction: false, productEligible: false,
    kind: "mlb-pregame-market-capture", date: DATE, captureId, mode: WRITE ? "write" : "dry-run",
    keyPresent: !!KEY, creditsRemaining: credits.remaining ?? null, creditFloor: CREDIT_FLOOR,
    gamesScheduled: sched.length, gamesNotStarted: notStarted.length, markets: MARKETS, regions: REGIONS,
    estimatedCreditsMain: estMainCredits, wrote: 0, skippedStarted: sched.length - notStarted.length,
  };

  if (!WRITE) {
    summary.decision = "DRY_RUN — no odds fetched, 0 credits spent";
    console.log(`\n=== MLB pregame MARKET capture (DRY-RUN) ${DATE} ===`);
    console.log(`key present: ${!!KEY} · credits remaining: ${credits.remaining ?? "unknown"} (floor ${CREDIT_FLOOR})`);
    console.log(`games scheduled ${sched.length} · not-started ${notStarted.length} · markets [${MARKETS.join(",")}] · regions ${REGIONS}`);
    console.log(`estimated credits for a --write of team markets: ~${estMainCredits} (1 per market×region; player props would add per-event cost)`);
    console.log(`decision: ${summary.decision}. Re-run with --write (credit-guarded) to persist.`);
    return;
  }

  // ── WRITE path (credit-guarded; skips started games; immutable) ──
  if (!KEY) { console.error("ODDS_API_KEY not set — cannot --write."); process.exit(1); }
  if (credits.available && Number.isFinite(credits.remaining) && credits.remaining < CREDIT_FLOOR + estMainCredits) {
    console.error(`credit guard: remaining ${credits.remaining} < floor ${CREDIT_FLOOR} + est ${estMainCredits}. Aborting write.`); process.exit(1);
  }
  if (MAX_CREDITS && estMainCredits > MAX_CREDITS) { console.error(`--max-credits ${MAX_CREDITS} < est ${estMainCredits}. Aborting.`); process.exit(1); }
  const capturedAt = nowIso();
  const res = await getJson(`${API}/sports/${SPORT}/odds/?apiKey=${KEY}&regions=${REGIONS}&markets=${MARKETS.join(",")}&oddsFormat=american&dateFormat=iso`);
  if (!res.ok) { console.error(`odds fetch failed: ${res.error}`); process.exit(1); }
  const gpByPair = new Map(sched.map((g) => [`${g.away}|${g.home}`, g.gamePk]));
  const records = [];
  for (const ev of res.body ?? []) {
    if (Date.parse(ev.commence_time) <= Date.parse(capturedAt)) { summary.skippedStarted++; continue; } // started
    const gamePk = gpByPair.get(`${ev.away_team}|${ev.home_team}`) ?? null;
    records.push(...normalizeEvent(ev, gamePk, capturedAt));
  }
  const dir = path.join(ARCHIVE, DATE, captureId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "raw.json"), JSON.stringify({ public: false, capturedAt, rawHash: hash(res.body), body: res.body }, null, 2));
  fs.writeFileSync(path.join(dir, "normalized.json"), JSON.stringify({ public: false, capturedAt, normalizedHash: hash(records), records }, null, 2));
  summary.wrote = records.length; summary.eligible = records.filter((r) => r.researchEligible).length; summary.creditsUsedApprox = res.used ?? null; summary.rawHash = hash(res.body); summary.normalizedHash = hash(records);
  // SPRINT 036: stamp the COMMITTED manifest with the capture time.
  // raw.json and normalized.json both carry `capturedAt`, but both are gitignored (.gitignore:87-88) —
  // 102 of 104 capture directories are already payload-less, and market-capture-reliability.json flags
  // four dates as LOST_RESEARCH_DATE. The manifest is the only artifact that survives, and without a
  // timestamp the surviving record cannot even be ordered in time except by filesystem mtime, which
  // does not survive a clone. One field turns a pile of unordered manifests into a usable capture
  // timeline, at zero storage cost and with no odds data committed.
  summary.capturedAt = capturedAt;
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(summary, null, 2));
  console.log(`\n=== MLB pregame MARKET capture (WROTE) ${DATE} ===`);
  console.log(`records ${records.length} (eligible ${summary.eligible}) · credits remaining ${res.remaining} · dir ${path.relative(REPO, dir)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
