/**
 * capture-mlb-pregame-player-props.mjs — INTERNAL, forward-only, credit-guarded MLB pregame PLAYER-PROP snapshot
 * capture (paid the-odds-api, per-event endpoint). Extends the pregame market archive from team markets to player
 * props. Immutable, timestamp-safe, leakage-safe. Never public, never a product, never money, never modeled.
 *
 * Per-event props cost credits per market (≈ events × markets). DRY-RUN is the DEFAULT (uses the FREE /events
 * endpoint to count games + estimate; fetches NO odds). --write is credit-guarded (floor + max-events + max-credits)
 * and skips started games, no loops. Over-only props are recorded but NOT de-vigged; the missing side is never
 * inferred. Unavailable markets are recorded as provider_unavailable.
 *
 * Controls (env or CLI): PREGAME_ARCHIVE_PLAYER_PROP_MARKETS / --markets, PREGAME_ARCHIVE_PLAYER_PROP_MAX_EVENTS
 * / --max-events, --max-credits, ODDS_API_MIN_CREDITS_REMAINING (floor), --date, --write.
 *
 * Writes (internal, public:false): data/internal/mlb/pregame-archive/market-snapshots/<date>/props-<captureId>/
 *   { raw.json, normalized.json, manifest.json } — new capture = new immutable directory.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive/market-snapshots");
const BOARD_DIR = path.join(APP, "public/data/mlb/boards");
const API = "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const nowIso = () => new Date().toISOString();
const hash = (o) => crypto.createHash("sha256").update(typeof o === "string" ? o : JSON.stringify(o)).digest("hex").slice(0, 32);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

function envVal(name) {
  if (process.env[name]) return process.env[name];
  try { return (fs.readFileSync(path.join(REPO, ".env"), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] || "").trim().replace(/^['"]|['"]$/g, ""); } catch { return ""; }
}
const KEY = envVal("ODDS_API_KEY");
const CREDIT_FLOOR = Number(envVal("ODDS_API_MIN_CREDITS_REMAINING")) || 100;
const DEFAULT_PROP_MARKETS = ["pitcher_strikeouts", "pitcher_outs", "pitcher_earned_runs", "batter_hits", "batter_total_bases", "batter_home_runs", "batter_rbis", "batter_runs_scored", "batter_hits_runs_rbis"];

const DATE = getArg("--date", new Date().toISOString().slice(0, 10));
const MARKETS = (getArg("--markets", envVal("PREGAME_ARCHIVE_PLAYER_PROP_MARKETS")) || DEFAULT_PROP_MARKETS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const REGIONS = getArg("--regions", "us");
const WRITE = has("--write");
const MAX_EVENTS = Number(getArg("--max-events", envVal("PREGAME_ARCHIVE_PLAYER_PROP_MAX_EVENTS"))) || 25;
const MAX_CREDITS = Number(getArg("--max-credits", "0")) || 0;

const americanToProb = (a) => (a == null || !Number.isFinite(a) ? null : a < 0 ? -a / (-a + 100) : 100 / (a + 100));
const americanToDecimal = (a) => (a == null || !Number.isFinite(a) ? null : a > 0 ? a / 100 + 1 : 100 / -a + 1);

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  return { ok: r.ok, status: r.status, remaining: Number(r.headers.get("x-requests-remaining")), lastCost: Number(r.headers.get("x-requests-last")), body: r.ok ? await r.json() : null, error: r.ok ? null : `HTTP ${r.status}` };
}

/** Map provider event id → gamePk and player name → playerId, from the board archives (gameId == provider event id). */
function boardMaps() {
  const evToGame = new Map(), nameId = new Map();
  for (const f of fs.existsSync(BOARD_DIR) ? fs.readdirSync(BOARD_DIR) : []) {
    if (!f.endsWith(".json")) continue;
    try {
      const b = JSON.parse(fs.readFileSync(path.join(BOARD_DIR, f), "utf8"));
      for (const g of b.games ?? []) if (g.gameId && g.gamePk) evToGame.set(g.gameId, g.gamePk);
      for (const l of b.leans ?? []) { if (l.gameId && l.gamePk) evToGame.set(l.gameId, l.gamePk); if (l.playerName && l.playerId) nameId.set(norm(l.playerName), l.playerId); }
    } catch {}
  }
  return { evToGame, nameId };
}

/** StatsAPI schedule fallback: (awayTeamName|homeTeamName) → gamePk, so gamePk maps even before the board exists. */
async function scheduleGamePkByTeams(date) {
  try {
    const r = await getJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team`);
    const m = new Map();
    for (const g of r.body?.dates?.[0]?.games ?? []) m.set(`${norm(g.teams?.away?.team?.name)}|${norm(g.teams?.home?.team?.name)}`, g.gamePk);
    return m;
  } catch { return new Map(); }
}

/** Normalize one event's player-prop odds → records with de-vig (paired over/under at same player+market+line). */
function normalizeProps(ev, gamePk, capturedAt, nameId) {
  const eventStartTime = ev.commence_time;
  const capturedPregame = eventStartTime ? Date.parse(capturedAt) < Date.parse(eventStartTime) : false;
  const records = [];
  for (const bk of ev.bookmakers ?? []) {
    const lastUpdate = bk.last_update ?? null;
    const availableAt = lastUpdate && Date.parse(lastUpdate) < Date.parse(capturedAt) ? lastUpdate : capturedAt;
    const availPregame = eventStartTime ? Date.parse(availableAt) < Date.parse(eventStartTime) : false;
    for (const mk of bk.markets ?? []) {
      // group outcomes by player (description) + line for over/under pairing
      const grp = new Map();
      for (const o of mk.outcomes ?? []) { const k = `${o.description ?? o.name}|${o.point ?? ""}`; if (!grp.has(k)) grp.set(k, []); grp.get(k).push(o); }
      for (const o of mk.outcomes ?? []) {
        const player = o.description ?? null; // provider puts the player in `description`, side in `name`
        const key = `${player}|${o.point ?? ""}`;
        const pair = grp.get(key) || [];
        const other = pair.find((x) => x !== o);
        const impliedProbability = americanToProb(o.price);
        const paired = pair.length >= 2 && !!other && Number.isFinite(americanToProb(other.price));
        const noVigProbability = paired ? +(impliedProbability / (impliedProbability + americanToProb(other.price))).toFixed(4) : null;
        records.push({
          schemaVersion: "mlb-player-prop-snapshot-1", public: false, sport: "mlb", date: DATE,
          gamePk: gamePk ?? null, providerEventId: ev.id, homeTeam: ev.home_team, awayTeam: ev.away_team,
          player, playerId: player ? (nameId.get(norm(player)) ?? null) : null,
          market: mk.key, selection: o.name, line: o.point ?? null, oddsAmerican: o.price,
          oddsDecimal: +Number(americanToDecimal(o.price)).toFixed(4), impliedProbability: +Number(impliedProbability).toFixed(4),
          noVigProbability, paired, deVigStatus: paired ? "paired" : "over_only_or_unpaired",
          bookmaker: bk.key, capturedAt, availableAt, eventStartTime, sourceLastUpdate: lastUpdate,
          researchEligible: capturedPregame && availPregame,
          eligibilityReason: !capturedPregame ? "captured at/after first pitch" : !availPregame ? "provider last_update at/after first pitch" : "captured + available pregame",
          provenance: { source: "the-odds-api", endpoint: `${API}/sports/${SPORT}/events/${ev.id}/odds`, sportKey: SPORT, marketKey: mk.key, bookmaker: bk.key, regions: REGIONS, sourceLastUpdate: lastUpdate, requestedAt: capturedAt },
        });
      }
    }
  }
  return records;
}

async function main() {
  const events = await getJson(`${API}/sports/${SPORT}/events/?apiKey=${KEY}`); // FREE — 0 credits
  const now = Date.now();
  const all = (events.ok ? events.body : []) || [];
  const dayNotStarted = all.filter((e) => (e.commence_time || "").slice(0, 10) === DATE && Date.parse(e.commence_time) > now);
  const targetEvents = dayNotStarted.slice(0, MAX_EVENTS);
  const estCredits = targetEvents.length * MARKETS.length * REGIONS.split(",").length;
  const captureId = `props-${hash(nowIso())}`;

  const summary = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-pregame-player-prop-capture",
    date: DATE, captureId, mode: WRITE ? "write" : "dry-run", keyPresent: !!KEY, creditsRemaining: events.remaining ?? null,
    creditFloor: CREDIT_FLOOR, playerPropMarkets: MARKETS, regions: REGIONS, maxEvents: MAX_EVENTS,
    eventsOnDate: dayNotStarted.length, eventsTargeted: targetEvents.length, creditEstimate: estCredits, creditsSpent: 0,
    playerPropRecords: 0, playerPropRecordsEligible: 0, overOnlyCount: 0, pairedCount: 0, providerUnavailable: [],
  };

  if (!WRITE) {
    summary.decision = "DRY_RUN — /events is free; no per-event odds fetched, 0 credits spent";
    console.log(`\n=== MLB pregame PLAYER-PROP capture (DRY-RUN) ${DATE} ===`);
    console.log(`key present: ${!!KEY} · credits remaining: ${events.remaining ?? "unknown"} (floor ${CREDIT_FLOOR})`);
    console.log(`events on date (not started): ${dayNotStarted.length} · targeted (max ${MAX_EVENTS}): ${targetEvents.length} · markets ${MARKETS.length} · regions ${REGIONS}`);
    console.log(`estimated credits for a --write: ~${estCredits} (events × markets × regions)`);
    console.log(`decision: ${summary.decision}. Re-run with --write (credit-guarded) to persist.`);
    fs.mkdirSync(path.join(ARCHIVE, DATE), { recursive: true });
    return;
  }

  // ── WRITE ──
  if (!KEY) { console.error("ODDS_API_KEY not set — cannot --write."); process.exit(1); }
  if (Number.isFinite(events.remaining) && events.remaining < CREDIT_FLOOR + estCredits) { console.error(`credit guard: remaining ${events.remaining} < floor ${CREDIT_FLOOR} + est ${estCredits}. Aborting.`); process.exit(1); }
  if (MAX_CREDITS && estCredits > MAX_CREDITS) { console.error(`--max-credits ${MAX_CREDITS} < est ${estCredits}. Aborting.`); process.exit(1); }
  const { evToGame, nameId } = boardMaps();
  const schedByTeams = await scheduleGamePkByTeams(DATE); // free StatsAPI fallback so gamePk maps pre-board
  const records = []; const rawByEvent = {}; let lastRemaining = events.remaining;
  for (const ev of targetEvents) {
    if (Date.parse(ev.commence_time) <= Date.now()) { continue; } // started since /events — skip
    const capturedAt = nowIso();
    const res = await getJson(`${API}/sports/${SPORT}/events/${ev.id}/odds/?apiKey=${KEY}&regions=${REGIONS}&markets=${MARKETS.join(",")}&oddsFormat=american&dateFormat=iso`);
    if (!res.ok) { summary.providerUnavailable.push({ event: ev.id, error: res.error }); continue; } // provider_unavailable — no retry loop
    lastRemaining = Number.isFinite(res.remaining) ? res.remaining : lastRemaining;
    const gamePk = evToGame.get(ev.id) ?? schedByTeams.get(`${norm(ev.away_team)}|${norm(ev.home_team)}`) ?? null;
    const recs = normalizeProps(res.body, gamePk, capturedAt, nameId);
    if (recs.length === 0) summary.providerUnavailable.push({ event: ev.id, reason: "no player-prop markets returned" });
    records.push(...recs); rawByEvent[ev.id] = res.body;
    if (Number.isFinite(lastRemaining) && lastRemaining < CREDIT_FLOOR) { summary.stoppedEarly = `credits fell below floor ${CREDIT_FLOOR}`; break; } // stop cleanly
  }
  summary.playerPropRecords = records.length;
  summary.playerPropRecordsEligible = records.filter((r) => r.researchEligible).length;
  summary.pairedCount = records.filter((r) => r.paired).length;
  summary.overOnlyCount = records.filter((r) => !r.paired).length;
  summary.deVigCoveragePct = records.length ? +(100 * summary.pairedCount / records.length).toFixed(1) : 0;
  summary.playerPropCoverageByMarket = {}; for (const r of records) summary.playerPropCoverageByMarket[r.market] = (summary.playerPropCoverageByMarket[r.market] || 0) + 1;
  summary.playerPropCoverageByGame = [...new Set(records.filter((r) => r.gamePk).map((r) => r.gamePk))].length;
  summary.creditsSpent = Number.isFinite(events.remaining) && Number.isFinite(lastRemaining) ? events.remaining - lastRemaining : null;
  summary.creditsRemaining = lastRemaining;
  summary.rawHash = hash(rawByEvent); summary.normalizedHash = hash(records);
  const dir = path.join(ARCHIVE, DATE, captureId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "raw.json"), JSON.stringify({ public: false, capturedAt: nowIso(), rawHash: summary.rawHash, byEvent: rawByEvent }, null, 2));
  fs.writeFileSync(path.join(dir, "normalized.json"), JSON.stringify({ public: false, kind: "player-props", normalizedHash: summary.normalizedHash, records }, null, 2));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(summary, null, 2));
  console.log(`\n=== MLB pregame PLAYER-PROP capture (WROTE) ${DATE} ===`);
  console.log(`events ${summary.eventsTargeted} · records ${records.length} (eligible ${summary.playerPropRecordsEligible}) · paired ${summary.pairedCount} · over-only ${summary.overOnlyCount} · credits spent ${summary.creditsSpent} · remaining ${lastRemaining}`);
  console.log(`markets seen: ${JSON.stringify([...new Set(records.map((r) => r.market))])}`);
  console.log(`dir ${path.relative(REPO, dir)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
