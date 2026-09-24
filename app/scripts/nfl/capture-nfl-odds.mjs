/**
 * Authorized NFL odds capture (Program 171 · Release D). NFL ONLY.
 *
 * DRY-RUN IS THE DEFAULT: without --authorized this script makes ZERO network calls — it prints
 * the request plan (events in window, markets, regions, worst-case credits, cumulative budget
 * position) and exits. The paid path exists only under the committed founder receipt
 * (--receipt), parsed fail-closed by p171-authorization.mjs: NFL-only, cumulative 3,000-credit
 * ceiling, no remaining-balance floor. Every response's usage headers land in the private
 * ledger; a failed-but-charged call still counts; nothing retries blindly.
 *
 * CALL PLAN (dependency order, each gated by assertCallAllowed):
 *   0. FREE /v4/sports/{key}/events — key validity + provider-verified opening usage headers
 *      + provider event ids. Zero credits (recorded anyway, from the headers).
 *   1. ONE bulk /v4/sports/{key}/odds regions=us markets=h2h,spreads,totals — the whole slate's
 *      team markets for markets×regions = 3 worst-case credits, regardless of event count.
 *   2. OPTIONAL --probe-props: ONE event's /events/{id}/odds with the five NFL prop keys —
 *      worst-case 5. A 422/absent market is NO_MARKET evidence, never a retry target.
 *
 * OUTPUTS
 *   private  data/internal/research/odds/nfl/capture-<stamp>.json  (validateOddsSnapshot-clean)
 *   private  data/internal/research/odds/nfl/p171-ledger.json      (cumulative credit ledger)
 *   public   app/public/data/nfl/markets/latest.json + capture-<stamp>.json — DERIVED display
 *            rows (prices are facts with provenance; the raw snapshot never ships).
 *   Every write passes the secret leak-guard first.
 *
 * Usage: node scripts/nfl/capture-nfl-odds.mjs --now <iso> [--authorized --receipt <path>]
 *        [--probe-props auto|<oddsEventId>] [--lookahead-hours 40]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ODDS_SPORT_KEYS, classifyOddsSecret, validateOddsSnapshot } from "../../src/lib/sports/odds/snapshot-contract.mjs";
import { MARKET_SCOPE, normalizeScopedOddsEvent } from "../../src/lib/sports/odds/market-scope.mjs";
import { joinOddsBatch } from "../../src/lib/sports/odds/event-join.mjs";
import { parseAuthorizationReceipt, emptyLedger, assertCallAllowed, recordRequest, assertNoSecretLeak, classifyProviderResult, isDuplicateRequest, P171_LEDGER_RELPATH } from "../../src/lib/sports/odds/p171-authorization.mjs";
import { buildPlayerRegistry, resolvePlayerRef } from "../../src/lib/sports/nfl/player-identity.mjs";
import { twoWayConsensus, medianOf } from "../../src/lib/sports/odds/consensus.mjs";
import { mergeCaptureRows } from "../../src/lib/sports/odds/capture-merge.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);

const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const AUTHORIZED = has("--authorized");
const RECEIPT_PATH = arg("--receipt");
const PROBE = arg("--probe-props");
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "40"));
const MAX_PROP_EVENTS = Number(arg("--max-prop-events", "20"));
// price-refresh policy: an identical request inside this window is refused as a duplicate, so a
// re-run of the event-window chain re-uses the capture it already holds instead of re-buying it.
const REFRESH_MINUTES = Number(arg("--refresh-minutes", "45"));
const SPORT = "nfl";
const SPORT_KEY = ODDS_SPORT_KEYS[SPORT];
// The provider splits the league across two keys: americanfootball_nfl (regular/post) and
// americanfootball_nfl_preseason (preseason). BOTH are NFL keys — the receipt's exclusion list
// names non-NFL leagues ("MLB, UFC, EPL, NBA, NHL, and all non-NFL keys"), and the authorized
// purpose is the CURRENT not-yet-started NFL window, which in August is preseason. The first
// authorized run proved the regular key holds zero current-window events (3 credits, recorded).
const PRESEASON_KEY = "americanfootball_nfl_preseason";
const TEAM_MARKETS = MARKET_SCOPE[SPORT]; // h2h, spreads, totals — the frozen team scope
/*
 * THE REFERENCE SPORTSBOOK for displayed prop prices (founder decision, 2026-09-24). One named
 * book, attributed by name. Not a "best odds" rule and not a consensus — both would be policies
 * this repo has never agreed, and a blended number has no book to attribute it to.
 */
const REFERENCE_BOOK = "draftkings";
/*
 * THE FALLBACK LADDER (founder decision, 2026-09-24). Coverage beats an empty row, but never at the
 * cost of attribution: whichever book is chosen is the book NAMED on screen.
 *
 *   1. DraftKings — if it has a complete valid market for that player/event/family
 *   2. FanDuel    — if DraftKings does not
 *   3. deterministic — among the books that actually returned a complete market for that
 *      event+family, the one with the most complete markets; ties broken by provider key, ascending
 *
 * ⚠ NOT LINE SHOPPING. The ordering never looks at the PRICE, so it cannot drift into "best odds"
 * — a policy nobody has agreed and which would make the displayed number a recommendation. It looks
 * only at coverage and, failing that, at a stable alphabetical key.
 *
 * ⚠ NEVER CROSS-BOOK. A two-sided market is taken whole from ONE book: an Over from DraftKings and
 * an Under from FanDuel is not a market, it is two halves of different markets wearing one label.
 * `lineProps` rows are already complete pairs from a single book, so choosing a row IS choosing a
 * book — the pair can never be split by construction.
 */
const FALLBACK_ORDER = [REFERENCE_BOOK, "fanduel"];

/** Books that returned a complete market for this event+family, ranked by coverage then key. */
function rankBooks(rows) {
  const byBook = new Map();
  for (const r of rows) byBook.set(r.bookmaker, (byBook.get(r.bookmaker) ?? 0) + 1);
  return [...byBook.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([b]) => b);
}

/**
 * Pick ONE book per (event, player, family) and emit the display row. Returns [] rather than
 * guessing when nothing complete exists — an absent price is a state, never a gap to be filled.
 */
function selectPropPrices(probe) {
  const out = [];
  const pick = (candidates) => {
    if (!candidates.length) return null;
    const ranked = rankBooks(candidates);
    const book = FALLBACK_ORDER.find((b) => candidates.some((c) => c.bookmaker === b)) ?? ranked[0];
    return candidates.find((c) => c.bookmaker === book) ?? null;
  };
  /* Group by the triple the UI keys on, so a choice is made per row and not per event. */
  const group = (rows, family) => {
    const g = new Map();
    for (const r of rows) {
      const k = `${r.canonicalEventId}|${r.playerId}|${family ?? r.market}`;
      (g.get(k) ?? g.set(k, []).get(k)).push(r);
    }
    return g;
  };
  for (const [, cands] of group(probe.anytimeTd?.rows ?? [], "anytime_td")) {
    const c = pick(cands);
    if (c) out.push({ canonicalEventId: c.canonicalEventId, playerId: c.playerId, family: "anytime_td", shape: "YES_ONLY", yesOdds: c.price, sportsbook: c.bookmaker, capturedAt: c.capturedAt, booksAvailable: rankBooks(cands).length });
  }
  for (const [, cands] of group(probe.lineProps?.rows ?? [], null)) {
    const c = pick(cands);
    if (c) out.push({ canonicalEventId: c.canonicalEventId, playerId: c.playerId, family: c.market, shape: "OVER_UNDER", line: c.line, overOdds: c.overPrice, underOdds: c.underPrice, sportsbook: c.bookmaker, capturedAt: c.capturedAt, booksAvailable: rankBooks(cands).length });
  }
  return out;
}

const PROP_PROBE_MARKETS = ["player_anytime_td", "player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"];
const REGIONS = ["us"];
const BASE = "https://api.the-odds-api.com/v4";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ---------------------------------------------------------------- window + canonical schedule
const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const nowMs = Date.parse(NOW);
/*
 * THE WINDOW IS THE NFL WEEK, NOT A CLOCK (P0 · 2026-09-24).
 *
 * ⚠ A 40-HOUR HORIZON CANNOT COVER AN NFL WEEK. On Thursday evening 16 of the 17 pre-start events
 * were week 3, and exactly ONE of them — the Thursday-night game — sat inside 40 hours. The other
 * fifteen were 66–98 hours out with their markets already posted, so every Sunday and Monday row on
 * the site read "Not checked" for reasons that had nothing to do with the books.
 *
 * `--week-window` follows the canonical schedule owner's own (seasonType, week) of the NEXT
 * pre-start event, which is what "the active week" means everywhere else in this repo. The hour
 * horizon stays available and stays the DEFAULT, because the scheduled team-market captures are
 * built around it and a bulk call costs the same 3 credits whatever the window holds.
 */
const WEEK_WINDOW = has("--week-window");
const scheduledAhead = schedule.rows
  .filter((r) => Date.parse(r.dateUtc) > Date.parse(NOW) && r.statusRaw === "STATUS_SCHEDULED")
  .sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : 1));
const activePeriod = scheduledAhead[0] ? { seasonType: scheduledAhead[0].seasonType, week: scheduledAhead[0].week } : null;
const windowRows = WEEK_WINDOW
  ? scheduledAhead.filter((r) => activePeriod && r.seasonType === activePeriod.seasonType && r.week === activePeriod.week)
  : schedule.rows.filter((r) => {
  const t = Date.parse(r.dateUtc);
  return t > nowMs && t <= nowMs + LOOKAHEAD_H * 3.6e6 && r.statusRaw === "STATUS_SCHEDULED";
  });
const canonicalRows = windowRows.map((r) => ({ canonicalEventId: `nfl-${r.providerEventId}`, home: r.home.name, away: r.away.name, startTimeUtc: r.dateUtc, scheduleRow: r }));

const seasonTypes = new Set(windowRows.map((r) => r.seasonType));
const keyPlan = [];
if (seasonTypes.has(1)) keyPlan.push({ key: PRESEASON_KEY, label: "preseason" });
if (seasonTypes.has(2) || seasonTypes.has(3)) keyPlan.push({ key: SPORT_KEY, label: "regular/post" });
const worstCaseBulk = keyPlan.length * TEAM_MARKETS.length * REGIONS.length;
const probeEventCount = !PROBE ? 0 : PROBE === "all" ? Math.min(windowRows.length, MAX_PROP_EVENTS) : 1;
const worstCaseProbe = probeEventCount * PROP_PROBE_MARKETS.length * REGIONS.length;

// ---------------------------------------------------------------- ledger + authorization
const ledgerPath = path.join(ROOT, P171_LEDGER_RELPATH);
let ledger = fs.existsSync(ledgerPath) ? read(ledgerPath) : emptyLedger(RECEIPT_PATH ?? "docs/receipts/ODDS_AUTHORIZATION_P171.md");
const authorization = RECEIPT_PATH ? parseAuthorizationReceipt(fs.readFileSync(path.isAbsolute(RECEIPT_PATH) ? RECEIPT_PATH : path.join(ROOT, RECEIPT_PATH), "utf8")) : { ok: false, errors: ["no --receipt supplied"] };

console.log(`window: ${windowRows.length} pre-start events ${WEEK_WINDOW ? `in the active NFL week (seasonType ${activePeriod?.seasonType}, week ${activePeriod?.week})` : `within ${LOOKAHEAD_H}h`} of ${NOW} (keys: ${keyPlan.map((k) => k.label).join("+") || "none"})`);
console.log(`plan: [free] /sports + /events per key → [${worstCaseBulk} worst-case] bulk ${TEAM_MARKETS.join(",")} regions=${REGIONS.join(",")} × ${keyPlan.length} key(s)${PROBE ? ` → [${worstCaseProbe} worst-case] prop probe on ${probeEventCount} event(s) × ${PROP_PROBE_MARKETS.join(",")}` : ""}`);
console.log(`budget: cumulative ${ledger.cumulativeCredits} of ${authorization.ok ? authorization.ceiling : "?"} — worst case this run ${worstCaseBulk + worstCaseProbe}`);

if (!AUTHORIZED) {
  console.log("DRY-RUN (default): no network call was made, nothing was spent. Pass --authorized with --receipt to execute.");
  process.exit(0);
}
if (!authorization.ok) {
  /*
   * AN EXPIRED ALLOWANCE IS A DECISION OWED, NOT A BROKEN JOB.
   *
   * A malformed receipt means somebody damaged the file, and that should fail loudly. An expiry that
   * has passed means the founder's own end condition was reached and a renewal is owed — the chain
   * around this step runs perfectly well on the last committed capture, exactly as `skip_odds` does.
   * Failing here would turn a scheduled workflow red three times a week for a state nobody can fix
   * by rerunning it, and a permanently red job is as unreadable as a permanently green one.
   *
   * Either way NOTHING IS SPENT. The difference is only whether the pipeline treats it as a fault.
   */
  const expiryOnly = authorization.errors.length > 0 && authorization.errors.every((e) => e.startsWith("expiry:"));
  if (expiryOnly) {
    console.log(`AUTHORIZATION_EXPIRED: ${authorization.errors.join("; ")}`);
    console.log("no paid call was made. The chain continues against the last committed capture; a renewed receipt re-enables acquisition.");
    process.exit(0);
  }
  console.error(`REFUSED: authorization did not parse: ${authorization.errors.join("; ")}`);
  process.exit(2);
}
/*
 * THE RECEIPT'S MARKET ROW IS NOW A CONTROL, NOT A CAPTION (P3 · 2026-09-24).
 *
 * ⚠ Until today nothing compared the markets this run intends to request against the markets the
 * committed receipt authorizes. The parser checked scope, ceiling, floor, retries and expiry, and
 * its returned `terms` string claimed "supported props, anytime TD" regardless of what the document
 * said — so on 2026-09-24 the code would have bought player props under a receipt whose own table
 * read "props and every other market OUT OF SCOPE".
 *
 * This refuses BEFORE the free preflight, so an unauthorized market cannot reach the provider even
 * as a question. Fail-closed: a receipt naming no prop keys yields an empty allowance and refuses
 * the probe entirely, because "authorizes nothing" must never be read as "authorizes anything".
 */
if (PROBE) {
  const allowed = new Set(authorization.propMarkets ?? []);
  const unauthorized = PROP_PROBE_MARKETS.filter((k) => !allowed.has(k));
  if (unauthorized.length) {
    console.error(`REFUSED: the committed receipt does not authorize ${unauthorized.join(", ")} — it names ${allowed.size ? [...allowed].join(", ") : "no prop market at all"}. Nothing was spent.`);
    process.exit(2);
  }
  console.log(`prop scope: ${PROP_PROBE_MARKETS.length} requested, all authorized by the receipt`);
}
if (!windowRows.length) { console.log("NO_EVENTS: no pre-start events in the window — an empty slate is an answer, not a call"); process.exit(0); }

const secretState = classifyOddsSecret(process.env);
// the contract's healthy state is PRESENT (key-shaped, value never echoed) — refuse the other two
if (secretState.state !== "PRESENT") { console.error(`${secretState.state}: ${secretState.reason} — no key, no call`); process.exit(3); }
const KEY = process.env.ODDS_API_KEY.trim();

const get = async (pathAndQuery) => {
  const res = await fetch(`${BASE}${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}apiKey=${KEY}`, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
  const headers = { "x-requests-last": res.headers.get("x-requests-last"), "x-requests-used": res.headers.get("x-requests-used"), "x-requests-remaining": res.headers.get("x-requests-remaining") };
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, headers, body };
};

const stamp = NOW.replace(/[-:]/g, "").slice(0, 13);
const requestId = `p171-${stamp}`;

// ---------------------------------------------------------------- 0. FREE sports index — both
// NFL keys must be confirmed to EXIST before any paid call names them (0 credits).
const idxRes = await get(`/sports/`);
ledger = recordRequest(ledger, { at: NOW, purpose: "free sports index (key existence + opening usage)", endpoint: "/sports/", status: idxRes.status, headers: idxRes.headers, charged: false });
if (ledger.openingBalance == null && idxRes.headers["x-requests-remaining"] != null) {
  ledger.openingBalance = {
    capturedAt: NOW,
    providerRequestsUsed: Number(idxRes.headers["x-requests-used"]),
    providerRequestsRemaining: Number(idxRes.headers["x-requests-remaining"]),
    note: "provider-verified via response headers on the free index call — the screenshot claim is context, this is machine truth",
  };
}
if (idxRes.status !== 200 || !Array.isArray(idxRes.body)) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
  console.error(`REFUSED: /sports index returned ${idxRes.status} — no paid call follows a failed preflight (no blind retries)`);
  process.exit(4);
}
const knownKeys = new Set(idxRes.body.map((s) => s.key));
const livePlan = keyPlan.filter((p) => knownKeys.has(p.key));
for (const p of keyPlan) if (!knownKeys.has(p.key)) console.log(`key ${p.key} absent from the provider index — that window slice is NO_MARKET, not a paid attempt`);
console.log(`preflight: opening remaining=${idxRes.headers["x-requests-remaining"]}; live keys: ${livePlan.map((p) => p.key).join(", ") || "none"}`);

// ---------------------------------------------------------------- 1. per-key: free /events, then ONE gated bulk call
const rows = [];
const quarantined = [];
const oddsEventsMap = new Map(); // odds event id → {providerEventId, home, away, scheduledStartUtc, sportKey}
for (const plan of livePlan) {
  const evRes = await get(`/sports/${plan.key}/events`);
  ledger = recordRequest(ledger, { at: NOW, purpose: `free events index (${plan.label})`, endpoint: `/sports/${plan.key}/events`, events: Array.isArray(evRes.body) ? evRes.body.length : null, status: evRes.status, headers: evRes.headers, charged: false });
  if (evRes.status !== 200 || !Array.isArray(evRes.body) || evRes.body.length === 0) {
    console.log(`${plan.label}: /events returned ${evRes.status} with ${Array.isArray(evRes.body) ? evRes.body.length : "no"} events — skipping its bulk call (an empty key is an answer)`);
    continue;
  }
  // duplicate circuit breaker: the same key+markets+regions inside its freshness window is not re-bought
  const fingerprint = `bulk:${plan.key}:${TEAM_MARKETS.join(",")}:${REGIONS.join(",")}`;
  const dup = isDuplicateRequest(ledger, { fingerprint, nowIso: NOW, freshnessMinutes: REFRESH_MINUTES });
  if (dup.duplicate) { console.log(`${plan.label}: ${dup.reason} — keeping the existing capture`); continue; }
  const gateBulk = assertCallAllowed({ authorization, ledger, worstCaseCredits: TEAM_MARKETS.length * REGIONS.length, purpose: `bulk team markets (${plan.label})` });
  if (!gateBulk.ok) { console.error(gateBulk.errors.join("; ")); fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1)); process.exit(5); }
  const bulkRes = await get(`/sports/${plan.key}/odds?regions=${REGIONS.join(",")}&markets=${TEAM_MARKETS.join(",")}&oddsFormat=american`);
  const cls = classifyProviderResult(bulkRes);
  ledger = recordRequest(ledger, { at: NOW, purpose: `bulk team ML/spread/total (${plan.label})`, endpoint: `/sports/${plan.key}/odds`, events: Array.isArray(bulkRes.body) ? bulkRes.body.length : null, markets: TEAM_MARKETS, regions: REGIONS, status: bulkRes.status, headers: bulkRes.headers, charged: true, fingerprint, resultClass: cls.class });
  if (cls.class !== "OK") {
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
    // last-known-good is preserved by construction: a failed run writes NO public artifact, so
    // the previous capture stands as STALE rather than being overwritten with an empty slate.
    console.error(`${cls.class} (${plan.label}, status ${bulkRes.status}): ${cls.action}. Charged cost recorded (${ledger.requests[ledger.requests.length - 1].creditsUsed}); the prior capture stands.`);
    process.exit(6);
  }
  for (const raw of bulkRes.body) {
    const out = normalizeScopedOddsEvent(raw, { sport: SPORT, capturedAt: NOW, requestId });
    rows.push(...out.rows);
    quarantined.push(...out.quarantined);
    if (raw?.id && !oddsEventsMap.has(String(raw.id))) {
      oddsEventsMap.set(String(raw.id), { providerEventId: String(raw.id), home: raw.home_team, away: raw.away_team, scheduledStartUtc: raw.commence_time, sportKey: plan.key });
    }
  }
}
// ---------------------------------------------------------------- last-known-good invariant
// P173 DEFECT FIX. The duplicate breaker (P172-D) correctly skips a re-purchase inside the
// freshness window — but the run then fell through to the artifact writer with zero rows and
// OVERWROTE a good public capture with an empty slate, which is exactly the outcome the
// "preserve last-known-good" rule exists to prevent. It happened live at 16:03Z and the price
// table disappeared from /nfl. Two defences now, because either alone leaves a hole:
//   1. a run that fetched NOTHING (every key skipped) writes nothing at all;
//   2. a run that would REPLACE a non-empty public artifact with an empty one refuses.
// Both exit 0: skipping is a correct, successful outcome — the prior capture simply stands.
if (!rows.length) {
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
  console.log("PRESERVED_LAST_KNOWN_GOOD: no rows fetched this run (all keys duplicate-skipped or empty) — the prior capture stands untouched");
  process.exit(0);
}

const oddsEvents = [...oddsEventsMap.values()];
const join = joinOddsBatch(oddsEvents, canonicalRows);
const joinedByOddsId = new Map(join.joined.map((j) => [j.providerEventId, j]));
const rowsJoined = rows.filter((r) => joinedByOddsId.has(r.providerEventId));
const rowsUnjoined = rows.length - rowsJoined.length;

// ---------------------------------------------------------------- 2. optional prop probe
let propProbe = null;
if (PROBE) {
  /*
   * ONE EVENT WAS THE PROOF; THE WEEK IS THE PRODUCT (P0 · 2026-09-24).
   *
   * `auto` probed the single earliest joined event — right for a capability probe, and not
   * something a populated site can live on: every Sunday and Monday row read "Not checked" while
   * the books had posted those markets days earlier. `all` probes every joined pre-start event.
   *
   * COST IS LINEAR AND STATED UP FRONT: one per-event call each, markets × regions, so sixteen
   * week-3 events cost 16 × 5 = 80 credits. `--max-prop-events` caps it, every call passes the SAME
   * assertCallAllowed gate the single probe did, and the sweep STOPS at the first refusal rather
   * than walking the rest of the slate into a ceiling.
   */
  const joinedPre = oddsEvents
    .filter((e) => joinedByOddsId.has(e.providerEventId))
    .sort((a, b) => (a.scheduledStartUtc < b.scheduledStartUtc ? -1 : 1));
  const targets = PROBE === "all" ? joinedPre.slice(0, MAX_PROP_EVENTS)
    : PROBE === "auto" ? joinedPre.slice(0, 1)
      : joinedPre.filter((e) => e.providerEventId === PROBE);
  const perEvent = [];
  const atdAll = { rows: [], quarantined: [] };
  const lineAll = { rows: [], quarantined: [] };
  const seenUnion = new Map();
  let refusal = null;
  if (!targets.length) {
    propProbe = { state: "NO_TARGET", reason: "no joined pre-start event to probe" };
  } else {
   for (const target of targets) {
    const gateProbe = assertCallAllowed({ authorization, ledger, worstCaseCredits: PROP_PROBE_MARKETS.length * REGIONS.length, purpose: "player-prop probe" });
    if (!gateProbe.ok) {
      /* Stop the WHOLE sweep at the first refusal — continuing would spend the rest of the slate
         against a ceiling the gate has already declined. */
      refusal = gateProbe.errors.join("; ");
      break;
    }
    {
      const probeRes = await get(`/sports/${target.sportKey}/events/${target.providerEventId}/odds?regions=${REGIONS.join(",")}&markets=${PROP_PROBE_MARKETS.join(",")}&oddsFormat=american`);
      ledger = recordRequest(ledger, { at: NOW, purpose: `player-prop probe on ${target.away} @ ${target.home}`, endpoint: `/sports/${target.sportKey}/events/${target.providerEventId}/odds`, events: 1, markets: PROP_PROBE_MARKETS, regions: REGIONS, status: probeRes.status, headers: probeRes.headers, charged: probeRes.status === 200 });
      if (probeRes.status !== 200) {
        propProbe = { state: "NO_MARKET", oddsEventId: target.providerEventId, status: probeRes.status, reason: "provider does not offer these prop markets for this event (422/absent) — typed evidence, never retried" };
      } else {
        const marketsSeen = new Map();
        for (const bk of probeRes.body?.bookmakers ?? []) for (const mkt of bk.markets ?? []) {
          marketsSeen.set(mkt.key, (marketsSeen.get(mkt.key) ?? 0) + 1);
        }
        // anytime-TD outcomes resolve to durable player ids or quarantine — names never mint identity
        const rosters = read(path.join(APP, "public/data/nfl/rosters/latest.json"));
        const registry = buildPlayerRegistry([rosters]); // the whole artifact is ONE capture (participation.test's shape)
        const joinRow = joinedByOddsId.get(target.providerEventId);
        const schedRow = canonicalRows.find((c) => c.canonicalEventId === joinRow.canonicalEventId)?.scheduleRow;
        const teamAbbrs = schedRow ? [schedRow.home.abbr, schedRow.away.abbr] : [];
        /*
         * ALL FIVE FAMILIES, NOT JUST ANYTIME TD (P3 · 2026-09-24).
         *
         * The first probe normalized only `player_anytime_td` and recorded the other four as
         * availability evidence — "price normalization needs its own scoped contract before any
         * model may read it". That contract is `lib/prediction-presentation/contract.ts`'s
         * FrozenMarket, which already takes a `line`, an over/under PAIR, or a single yes price,
         * and REFUSES to exist without a named book and a capture instant. So the shape was
         * waiting; nothing had filled it.
         *
         * TWO SHAPES, KEPT APART. A yardage or receptions market is two-sided and carries a point:
         * both sides must come from the SAME book at the SAME point, or the pair is not a pair. An
         * anytime-TD market is one-sided and has no point — the opposite side is never inferred.
         *
         * IDENTITY IS UNCHANGED AND STILL FAIL-CLOSED: every outcome resolves through the durable
         * registry against BOTH rosters, and anything unresolved or ambiguous quarantines rather
         * than minting a player from a prop label.
         */
        const TWO_SIDED = new Set(["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"]);
        const propRows = [];
        const propQuarantined = [];
        const atdRows = [];
        const atdQuarantined = [];
        for (const bk of probeRes.body?.bookmakers ?? []) {
          for (const mkt of bk.markets ?? []) {
            if (!PROP_PROBE_MARKETS.includes(mkt.key)) continue;
            /* Group a two-sided market by player AND point: one book can post several alternate
               lines for the same player, and an Over at 71.5 does not pair with an Under at 74.5. */
            const bySide = new Map();
            for (const o of mkt.outcomes ?? []) {
              const playerName = o.description ?? o.name;
              const hits = teamAbbrs.map((abbr) => resolvePlayerRef(registry, { name: playerName, teamAbbr: abbr })).filter((r) => r.state === "RESOLVED");
              if (hits.length !== 1) {
                const q = { name: playerName, market: mkt.key, bookmaker: bk.key, reason: hits.length === 0 ? "unresolved against either roster — identity never minted from a prop label" : "ambiguous across both rosters — quarantined, never picked" };
                if (mkt.key === "player_anytime_td") atdQuarantined.push({ name: playerName, bookmaker: bk.key, reason: q.reason });
                else propQuarantined.push(q);
                continue;
              }
              const playerId = hits[0].playerId;
              if (mkt.key === "player_anytime_td") {
                atdRows.push({ playerId, name: playerName, bookmaker: bk.key, price: o.price, capturedAt: NOW, sourceAsOf: bk.last_update ?? NOW });
                continue;
              }
              if (!TWO_SIDED.has(mkt.key)) continue;
              const key = `${playerId}|${o.point}`;
              const slot = bySide.get(key) ?? { playerId, name: playerName, market: mkt.key, bookmaker: bk.key, line: o.point, capturedAt: NOW, sourceAsOf: bk.last_update ?? NOW };
              if (String(o.name).toLowerCase() === "over") slot.overPrice = o.price;
              else if (String(o.name).toLowerCase() === "under") slot.underPrice = o.price;
              bySide.set(key, slot);
            }
            for (const slot of bySide.values()) {
              /* A one-sided half of a two-sided market is NOT a market. The missing side is never
                 inferred and never defaulted to -110 — it is recorded as incomplete and dropped. */
              if (slot.overPrice == null || slot.underPrice == null || slot.line == null) {
                propQuarantined.push({ name: slot.name, market: slot.market, bookmaker: slot.bookmaker, line: slot.line ?? null, reason: "incomplete two-sided market — one side or the point was missing, and the other side is never inferred" });
                continue;
              }
              propRows.push(slot);
            }
          }
        }
        /* Every row carries its OWN canonical event — a sweep must never let one event's id stand
           in for another's, which the single-event shape could not have revealed. */
        const stamp = (r) => ({ ...r, canonicalEventId: joinRow.canonicalEventId });
        atdAll.rows.push(...atdRows.map(stamp));
        atdAll.quarantined.push(...atdQuarantined.map(stamp));
        lineAll.rows.push(...propRows.map(stamp));
        lineAll.quarantined.push(...propQuarantined.map(stamp));
        for (const [k, v] of marketsSeen) seenUnion.set(k, (seenUnion.get(k) ?? 0) + v);
        perEvent.push({
          oddsEventId: target.providerEventId,
          canonicalEventId: joinRow.canonicalEventId,
          matchup: `${target.away} @ ${target.home}`,
          marketsSeen: Object.fromEntries([...marketsSeen.entries()].map(([k, v]) => [k, { bookmakers: v }])),
          absentMarkets: PROP_PROBE_MARKETS.filter((k) => !marketsSeen.has(k)),
          atdRows: atdRows.length,
          lineRows: propRows.length,
        });
      }
    }
   }
   propProbe = perEvent.length
     ? {
       state: "PROBED",
       events: perEvent,
       eventsProbed: perEvent.length,
       eventsRequested: targets.length,
       ...(refusal ? { stoppedEarly: refusal } : {}),
       marketsSeen: Object.fromEntries([...seenUnion.entries()].map(([k, v]) => [k, { bookmakers: v }])),
       absentMarkets: PROP_PROBE_MARKETS.filter((k) => !seenUnion.has(k)),
       anytimeTd: atdAll,
       lineProps: lineAll,
     }
     : { state: refusal ? "REFUSED_BUDGET" : "NO_MARKET", reason: refusal ?? "no event returned a prop market" };
  }
}

// ---------------------------------------------------------------- artifacts
const allQuarantined = [
  ...quarantined,
  ...join.quarantined.map((q) => ({ providerEventId: q.providerEventId, reason: `join: ${q.reason}` })),
  ...(rowsUnjoined ? [{ reason: `${rowsUnjoined} normalized rows dropped with their unjoined events (counted here so population stays exact)` }] : []),
];
const remainingHeader = ledger.requests[ledger.requests.length - 1]?.providerRequestsRemaining;
const snapshot = {
  schemaVersion: 1,
  artifact: "nfl-odds-capture",
  dataClass: "PRIVATE_RESEARCH",
  sport: SPORT,
  capturedAt: NOW,
  requestId,
  keyFingerprint: `len${KEY.length}…${KEY.slice(-4)}`,
  creditsUsed: ledger.requests.filter((r) => r.at === NOW).reduce((s, r) => s + r.creditsUsed, 0),
  creditsRemaining: Number.isFinite(remainingHeader) ? remainingHeader : null,
  sourceRows: rowsJoined.length + allQuarantined.length,
  rows: rowsJoined,
  quarantined: allQuarantined,
  join: { accounting: join.accounting, lineage: join.lineage },
  reconciliation: { returned: rows.length + quarantined.length, joined: rowsJoined.length, quarantined: allQuarantined.length, note: "returned = normalization output; artifact population = joined rows + quarantined (normalization + join + dropped-rows sentinel)" },
  propProbe,
};
const snapCheck = validateOddsSnapshot(snapshot);
if (!snapCheck.valid) { console.error(`REFUSED: snapshot contract: ${snapCheck.errors.join("; ")}`); fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1)); process.exit(7); }

// public DERIVED display artifact — one row per joined event, per-book prices + no-vig
const byEvent = new Map();
for (const r of rowsJoined) {
  const j = joinedByOddsId.get(r.providerEventId);
  const sched = canonicalRows.find((c) => c.canonicalEventId === j.canonicalEventId)?.scheduleRow;
  if (!sched) continue;
  if (!byEvent.has(j.canonicalEventId)) {
    byEvent.set(j.canonicalEventId, {
      canonicalEventId: j.canonicalEventId,
      providerEventId: sched.providerEventId,
      kickoffUtc: sched.dateUtc,
      seasonType: sched.seasonType,
      week: sched.week,
      home: { abbr: sched.home.abbr, name: sched.home.name },
      away: { abbr: sched.away.abbr, name: sched.away.name },
      books: new Map(),
      sourceAsOf: r.sourceAsOf,
    });
  }
  const ev = byEvent.get(j.canonicalEventId);
  if (r.sourceAsOf > ev.sourceAsOf) ev.sourceAsOf = r.sourceAsOf;
  if (!ev.books.has(r.bookmaker)) ev.books.set(r.bookmaker, { book: r.bookmaker });
  const book = ev.books.get(r.bookmaker);
  const orient = j.orientation; // ALIGNED: odds home == schedule home
  const sideName = (name) => (name === r.home ? (orient === "ALIGNED" ? "home" : "away") : name === r.away ? (orient === "ALIGNED" ? "away" : "home") : null);
  if (r.marketType === "h2h") {
    book.moneyline = {};
    for (const o of r.outcomes) { const s = sideName(o.name); if (s) book.moneyline[s] = o.price; }
    book.noVigWinProb = {};
    for (const o of r.noVig) { const s = sideName(o.name); if (s) book.noVigWinProb[s] = o.prob; }
  } else if (r.marketType === "spreads") {
    book.spread = { line: null, prices: {} };
    for (const o of r.outcomes) { const s = sideName(o.name); if (s) { book.spread.prices[s] = o.price; if (s === "home") book.spread.line = o.point; } }
  } else if (r.marketType === "totals") {
    book.total = { line: r.point ?? r.outcomes.find((o) => o.point != null)?.point ?? null, prices: {} };
    for (const o of r.outcomes) { const nm = String(o.name).toLowerCase(); if (nm === "over" || nm === "under") book.total.prices[nm] = o.price; }
  }
}
const median = medianOf;
const publicRows = [...byEvent.values()].map((ev) => {
  const books = [...ev.books.values()].sort((a, b) => (a.book < b.book ? -1 : 1));
  return {
    ...ev,
    /* Each row carries the capture that produced IT, because rows outlive a single capture: a game
       priced before kickoff keeps that price when a later run no longer sees it. */
    capturedAt: NOW,
    books,
    /* P276: the two-way pair comes from ONE owner and is normalised there. Two independent medians
       are not a distribution — on 2026-09-12 ten of thirteen events summed outside the settlement
       contract's tolerance and were refused a settlement target. Spread and total are unconstrained
       medians and stay as they were. */
    consensus: (() => {
      const two = twoWayConsensus(books);
      return {
        homeWinProbNoVig: two.homeWinProbNoVig,
        awayWinProbNoVig: two.awayWinProbNoVig,
        spreadHome: median(books.map((b) => b.spread?.line)),
        total: median(books.map((b) => b.total?.line)),
        basis: two.basis,
        preNormalisedSum: two.preNormalisedSum,
      };
    })(),
  };
}).sort((a, b) => (a.kickoffUtc < b.kickoffUtc ? -1 : 1));

// defence 2: never replace a non-empty public capture with an empty one, whatever the cause
const publicPath = path.join(APP, "public/data/nfl/markets", "latest.json");
const priorPublic = read(publicPath);
if (!publicRows.length && (priorPublic?.eventCount ?? 0) > 0) {
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
  console.error(`REFUSED: this run joined 0 events but the committed capture holds ${priorPublic.eventCount} — refusing to overwrite a good artifact with an empty slate; the prior capture stands as the last known good`);
  process.exit(9);
}

/*
 * DEFENCE 3: a price captured before kickoff is not undone by a later run. The window is pre-start
 * events only, so a Sunday capture after the early games start holds only the late ones — and
 * writing that wholesale would delete prices those games were legitimately given the day before.
 * The rule lives in lib/sports/odds/capture-merge.mjs, where it is tested against that exact case.
 */
{
  const merged = mergeCaptureRows(priorPublic?.rows ?? [], publicRows, { priorCapturedAt: priorPublic?.capturedAt ?? null });
  if (merged.carried) console.log(`carried forward ${merged.carried} pre-kickoff row(s) this window no longer covers`);
  publicRows.length = 0;
  publicRows.push(...merged.rows);
}

const publicArtifact = {
  schemaVersion: 1,
  artifact: "nfl-market-capture",
  dataClass: "MARKET_CAPTURE_PUBLIC",
  sport: SPORT,
  generatedAt: NOW,
  capturedAt: NOW,
  source: { id: "odds_api", name: "The Odds API", license: "paid plan; prices are market facts displayed with attribution" },
  disclaimer: "Sportsbook prices captured pre-kickoff for comparison. Prices are market facts, not GameTimePicks predictions; no wager is suggested.",
  eventCount: publicRows.length,
  rows: publicRows,
  // player-market availability, from the authorized probe — absence is EVIDENCE, so the public
  // surface can say NO_MARKET instead of the stale AUTH_REQUIRED language. Prices are never
  // published here; only which market families the provider offers for this window.
  propMarkets: propProbe?.state === "PROBED"
    ? {
      state: "PROBED",
      /* EVERY event probed, not the first. A single id here is what let a downstream consumer call
         fifteen un-probed events "NOT_OFFERED" — a negative nobody had measured. */
      probedEventIds: (propProbe.events ?? []).map((e) => e.canonicalEventId),
      eventsProbed: propProbe.eventsProbed ?? 0,
      offeredMarkets: Object.keys(propProbe.marketsSeen ?? {}),
      absentMarkets: propProbe.absentMarkets ?? [],
      perEvent: (propProbe.events ?? []).map((e) => ({ canonicalEventId: e.canonicalEventId, matchup: e.matchup, offeredMarkets: Object.keys(e.marketsSeen ?? {}), absentMarkets: e.absentMarkets })),
    }
    : { state: propProbe?.state ?? "NOT_PROBED", probedEventIds: [], offeredMarkets: [], absentMarkets: [] },
  /*
   * THE DISPLAYED PRICES — one named book, never a blend (founder decision, 2026-09-24).
   *
   * DraftKings is the reference sportsbook for displayed NFL prop prices. The price a reader sees
   * is DraftKings' own number, attributed to DraftKings. Nothing is averaged, no consensus is
   * synthesised, and when DraftKings has not posted a player/market the row falls to a typed
   * unavailable state — ANOTHER BOOK IS NEVER SILENTLY SUBSTITUTED, because the attribution on
   * screen would then be a lie about where the number came from.
   *
   * ⚠ The private capture keeps EVERY book (see the snapshot's propProbe), so a comparison or
   * best-line view can be built later from evidence already on disk without re-spending a credit.
   * This block is display, not a model input: nothing here reaches a forecast.
   */
  propPrices: propProbe?.state === "PROBED"
    ? {
      referenceBook: REFERENCE_BOOK,
      fallbackOrder: FALLBACK_ORDER,
      policy: "DraftKings first, FanDuel second, then the returned book with the most complete markets (ties by provider key). One book per row, always named. No averaging, no consensus, no cross-book pair, never chosen by price.",
      probedEventIds: (propProbe.events ?? []).map((e) => e.canonicalEventId),
      capturedAt: NOW,
      /* Each row keeps the canonical event IT came from — never the sweep's first. */
      rows: selectPropPrices(propProbe),
    }
    : null,
};

// leak-guard every artifact, then write
const outputs = [
  [path.join(ROOT, "data/internal/research/odds/nfl", `capture-${stamp}.json`), snapshot],
  [ledgerPath, ledger],
  [path.join(APP, "public/data/nfl/markets", "latest.json"), publicArtifact],
  [path.join(APP, "public/data/nfl/markets", `capture-${stamp}.json`), publicArtifact],
];
for (const [p, obj] of outputs) {
  const payload = JSON.stringify(obj, null, 1);
  const leak = assertNoSecretLeak(payload, [KEY]);
  if (!leak.ok) { console.error(`REFUSED: ${leak.reason} (${p})`); process.exit(8); }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, payload);
}

console.log(`captured: ${publicRows.length} events, ${rowsJoined.length} book-market rows joined, ${snapshot.quarantined.length} quarantined`);
console.log(`props: ${propProbe ? propProbe.state : "not probed"}${propProbe?.absentMarkets ? ` — absent: ${propProbe.absentMarkets.join(",") || "none"}` : ""}`);
console.log(`credits: this run ${snapshot.creditsUsed}, cumulative ${ledger.cumulativeCredits} of ${authorization.ceiling}, provider remaining ${snapshot.creditsRemaining}`);
