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
import { parseAuthorizationReceipt, emptyLedger, assertCallAllowed, recordRequest, assertNoSecretLeak, P171_LEDGER_RELPATH } from "../../src/lib/sports/odds/p171-authorization.mjs";
import { buildPlayerRegistry, resolvePlayerRef } from "../../src/lib/sports/nfl/player-identity.mjs";

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
const SPORT = "nfl";
const SPORT_KEY = ODDS_SPORT_KEYS[SPORT];
// The provider splits the league across two keys: americanfootball_nfl (regular/post) and
// americanfootball_nfl_preseason (preseason). BOTH are NFL keys — the receipt's exclusion list
// names non-NFL leagues ("MLB, UFC, EPL, NBA, NHL, and all non-NFL keys"), and the authorized
// purpose is the CURRENT not-yet-started NFL window, which in August is preseason. The first
// authorized run proved the regular key holds zero current-window events (3 credits, recorded).
const PRESEASON_KEY = "americanfootball_nfl_preseason";
const TEAM_MARKETS = MARKET_SCOPE[SPORT]; // h2h, spreads, totals — the frozen team scope
const PROP_PROBE_MARKETS = ["player_anytime_td", "player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"];
const REGIONS = ["us"];
const BASE = "https://api.the-odds-api.com/v4";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ---------------------------------------------------------------- window + canonical schedule
const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const nowMs = Date.parse(NOW);
const windowRows = schedule.rows.filter((r) => {
  const t = Date.parse(r.dateUtc);
  return t > nowMs && t <= nowMs + LOOKAHEAD_H * 3.6e6 && r.statusRaw === "STATUS_SCHEDULED";
});
const canonicalRows = windowRows.map((r) => ({ canonicalEventId: `nfl-${r.providerEventId}`, home: r.home.name, away: r.away.name, startTimeUtc: r.dateUtc, scheduleRow: r }));

const seasonTypes = new Set(windowRows.map((r) => r.seasonType));
const keyPlan = [];
if (seasonTypes.has(1)) keyPlan.push({ key: PRESEASON_KEY, label: "preseason" });
if (seasonTypes.has(2) || seasonTypes.has(3)) keyPlan.push({ key: SPORT_KEY, label: "regular/post" });
const worstCaseBulk = keyPlan.length * TEAM_MARKETS.length * REGIONS.length;
const worstCaseProbe = PROBE ? PROP_PROBE_MARKETS.length * REGIONS.length : 0;

// ---------------------------------------------------------------- ledger + authorization
const ledgerPath = path.join(ROOT, P171_LEDGER_RELPATH);
let ledger = fs.existsSync(ledgerPath) ? read(ledgerPath) : emptyLedger(RECEIPT_PATH ?? "docs/receipts/ODDS_AUTHORIZATION_P171.md");
const authorization = RECEIPT_PATH ? parseAuthorizationReceipt(fs.readFileSync(path.isAbsolute(RECEIPT_PATH) ? RECEIPT_PATH : path.join(ROOT, RECEIPT_PATH), "utf8")) : { ok: false, errors: ["no --receipt supplied"] };

console.log(`window: ${windowRows.length} pre-start events within ${LOOKAHEAD_H}h of ${NOW} (keys: ${keyPlan.map((k) => k.label).join("+") || "none"})`);
console.log(`plan: [free] /sports + /events per key → [${worstCaseBulk} worst-case] bulk ${TEAM_MARKETS.join(",")} regions=${REGIONS.join(",")} × ${keyPlan.length} key(s)${PROBE ? ` → [${worstCaseProbe} worst-case] prop probe ${PROP_PROBE_MARKETS.join(",")}` : ""}`);
console.log(`budget: cumulative ${ledger.cumulativeCredits} of ${authorization.ok ? authorization.ceiling : "?"} — worst case this run ${worstCaseBulk + worstCaseProbe}`);

if (!AUTHORIZED) {
  console.log("DRY-RUN (default): no network call was made, nothing was spent. Pass --authorized with --receipt to execute.");
  process.exit(0);
}
if (!authorization.ok) { console.error(`REFUSED: authorization did not parse: ${authorization.errors.join("; ")}`); process.exit(2); }
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
  const gateBulk = assertCallAllowed({ authorization, ledger, worstCaseCredits: TEAM_MARKETS.length * REGIONS.length, purpose: `bulk team markets (${plan.label})` });
  if (!gateBulk.ok) { console.error(gateBulk.errors.join("; ")); fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1)); process.exit(5); }
  const bulkRes = await get(`/sports/${plan.key}/odds?regions=${REGIONS.join(",")}&markets=${TEAM_MARKETS.join(",")}&oddsFormat=american`);
  ledger = recordRequest(ledger, { at: NOW, purpose: `bulk team ML/spread/total (${plan.label})`, endpoint: `/sports/${plan.key}/odds`, events: Array.isArray(bulkRes.body) ? bulkRes.body.length : null, markets: TEAM_MARKETS, regions: REGIONS, status: bulkRes.status, headers: bulkRes.headers, charged: true });
  if (bulkRes.status !== 200 || !Array.isArray(bulkRes.body)) {
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
    console.error(`FAILED: bulk odds (${plan.label}) returned ${bulkRes.status} — charged cost recorded (${ledger.requests[ledger.requests.length - 1].creditsUsed}); not retried`);
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
const oddsEvents = [...oddsEventsMap.values()];
const join = joinOddsBatch(oddsEvents, canonicalRows);
const joinedByOddsId = new Map(join.joined.map((j) => [j.providerEventId, j]));
const rowsJoined = rows.filter((r) => joinedByOddsId.has(r.providerEventId));
const rowsUnjoined = rows.length - rowsJoined.length;

// ---------------------------------------------------------------- 2. optional prop probe
let propProbe = null;
if (PROBE) {
  const target = PROBE === "auto"
    ? oddsEvents.filter((e) => joinedByOddsId.has(e.providerEventId)).sort((a, b) => (a.scheduledStartUtc < b.scheduledStartUtc ? -1 : 1))[0]
    : oddsEvents.find((e) => e.providerEventId === PROBE);
  if (!target) {
    propProbe = { state: "NO_TARGET", reason: "no joined pre-start event to probe" };
  } else {
    const gateProbe = assertCallAllowed({ authorization, ledger, worstCaseCredits: worstCaseProbe, purpose: "player-prop probe" });
    if (!gateProbe.ok) {
      propProbe = { state: "REFUSED_BUDGET", reason: gateProbe.errors.join("; ") };
    } else {
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
        const atdRows = [];
        const atdQuarantined = [];
        for (const bk of probeRes.body?.bookmakers ?? []) {
          for (const mkt of bk.markets ?? []) {
            if (mkt.key !== "player_anytime_td") continue;
            for (const o of mkt.outcomes ?? []) {
              const playerName = o.description ?? o.name;
              const hits = teamAbbrs.map((abbr) => resolvePlayerRef(registry, { name: playerName, teamAbbr: abbr })).filter((r) => r.state === "RESOLVED");
              if (hits.length === 1) atdRows.push({ playerId: hits[0].playerId, name: playerName, bookmaker: bk.key, price: o.price, capturedAt: NOW, sourceAsOf: bk.last_update ?? NOW });
              else atdQuarantined.push({ name: playerName, bookmaker: bk.key, reason: hits.length === 0 ? "unresolved against either roster — identity never minted from a prop label" : "ambiguous across both rosters — quarantined, never picked" });
            }
          }
        }
        propProbe = {
          state: "PROBED",
          oddsEventId: target.providerEventId,
          canonicalEventId: joinRow.canonicalEventId,
          marketsSeen: Object.fromEntries([...marketsSeen.entries()].map(([k, v]) => [k, { bookmakers: v }])),
          absentMarkets: PROP_PROBE_MARKETS.filter((k) => !marketsSeen.has(k)),
          anytimeTd: { rows: atdRows, quarantined: atdQuarantined, note: "yardage props are recorded as availability evidence only — price normalization needs its own scoped contract before any model may read it" },
        };
      }
    }
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
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const publicRows = [...byEvent.values()].map((ev) => {
  const books = [...ev.books.values()].sort((a, b) => (a.book < b.book ? -1 : 1));
  return {
    ...ev,
    books,
    consensus: {
      homeWinProbNoVig: median(books.map((b) => b.noVigWinProb?.home)),
      awayWinProbNoVig: median(books.map((b) => b.noVigWinProb?.away)),
      spreadHome: median(books.map((b) => b.spread?.line)),
      total: median(books.map((b) => b.total?.line)),
      basis: "median across captured books; de-vig is proportional two-way per book",
    },
  };
}).sort((a, b) => (a.kickoffUtc < b.kickoffUtc ? -1 : 1));

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
