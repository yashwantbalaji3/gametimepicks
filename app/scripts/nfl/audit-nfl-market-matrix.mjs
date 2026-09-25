/**
 * THE CANONICAL NFL MARKET MATRIX (P0 · §9). PRIVATE_RESEARCH.
 *
 * ONE ROW PER (EVENT, PLAYER, FAMILY) THAT A PUBLIC SURFACE RENDERS, answering — from the canonical
 * artifacts, never from a page — whether a model projection exists, whether a provider market
 * exists, which sportsbook was displayed, the line and prices, when it was captured, how the
 * identity joined, what the reader is shown, and on which surfaces.
 *
 * ⚠ WHY A MATRIX AND NOT A COUNT. "39 rows priced" is compatible with every one of them being the
 * wrong player, and with an entire game being invisible. The failure this P0 opened with was not a
 * missing number, it was two surfaces disagreeing about a number that existed — a thing only a
 * per-row, per-surface table can show. `NOT_PROBED = 0 for eligible current-week events` is the
 * acceptance gate, and it is a claim about the WHOLE population, so the population is enumerated.
 *
 * ⚠ IT AUDITS; IT NEVER PRODUCES. Nothing here fetches, prices, joins an identity or decides a
 * book. Every value is read from the artifact whose owner already decided it, which is the only way
 * an audit can disagree with the thing it audits.
 *
 * ⚠ AND IT DISTINGUISHES "WE DID NOT ASK" FROM "WE ASKED AND THERE IS NOTHING". The display states
 * are the ones the product publishes, not a grade:
 *
 *   PRICED               a real captured market is displayed, attributed to a named book
 *   NOT_OFFERED          this event was queried and no approved book returned this market
 *   NOT_PROBED           this event was never queried — evidence about us, and about nothing else
 *   IDENTITY_UNRESOLVED  a real market exists that could not be safely mapped to this player
 *   STALE                a captured price older than the freshness bound
 *
 * Usage: node scripts/nfl/audit-nfl-market-matrix.mjs --now <iso> [--json] [--write]
 * Writes (with --write): data/internal/research/nfl/reports/market-matrix-<date>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPropPriceIndex } from "../../src/lib/sports/nfl/prop-price-lookup.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required (an audit is always pinned)"); process.exit(1); }

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** A captured price older than this is STALE rather than current. Pre-kickoff captures only. */
const FRESHNESS_HOURS = 24;

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const markets = read(path.join(APP, "public/data/nfl/markets/latest.json"));
const weekly = read(path.join(APP, "public/data/nfl/weekly-boards/latest.json"));
const vault = read(path.join(APP, "public/data/nfl/end-zone-vault/latest.json"));
const propPrices = buildPropPriceIndex(markets);

if (!schedule?.rows?.length) { console.error("REFUSED: no canonical schedule — the population cannot be enumerated, and a matrix over an unknown population proves nothing"); process.exit(2); }

/*
 * THE POPULATION IS THE ACTIVE WEEK, from the canonical schedule owner — the same rule the capture
 * uses. Taking it from the boards instead would make the matrix agree with the boards by
 * construction, which is exactly the question it is here to answer.
 */
const scheduledAhead = schedule.rows
  .filter((r) => Date.parse(r.dateUtc) > Date.parse(NOW) && r.statusRaw === "STATUS_SCHEDULED")
  .sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : 1));
const period = scheduledAhead[0] ? { seasonType: scheduledAhead[0].seasonType, week: scheduledAhead[0].week } : null;
if (!period) { console.error("no pre-start NFL event — nothing to audit (a clean answer, not an outage)"); process.exit(0); }
const eligible = scheduledAhead.filter((r) => r.seasonType === period.seasonType && r.week === period.week);

/* Every surface that renders a prediction row, and what each one carries for a given row. */
const boardsDir = path.join(APP, "public/data/nfl/player-board");
const playerBoards = new Map();
if (fs.existsSync(boardsDir)) {
  for (const f of fs.readdirSync(boardsDir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = read(path.join(boardsDir, f));
    if (b?.providerEventId) playerBoards.set(String(b.providerEventId), b);
  }
}
const weeklyRows = new Map();
for (const b of weekly?.boards ?? []) {
  for (const r of b.rows ?? []) weeklyRows.set(`${r.providerEventId}|${r.playerId}|${b.family}`, { board: b, row: r });
}
const vaultRows = new Map();
for (const c of [...(vault?.selections ?? []), ...(vault?.watchlist ?? [])]) {
  if (c.providerEventId) vaultRows.set(`${c.providerEventId}|${c.playerId}|anytime_td`, c);
}

const isStale = (capturedAt) => {
  const t = Date.parse(capturedAt);
  return Number.isFinite(t) ? Date.parse(NOW) - t > FRESHNESS_HOURS * 3.6e6 : false;
};

const rows = [];
const eventSummary = [];

for (const ev of eligible) {
  const eventId = String(ev.providerEventId);
  const board = playerBoards.get(eventId);
  const probed = propPrices.wasProbed(eventId);
  let evRows = 0; let evPriced = 0;

  for (const p of board?.players ?? []) {
    for (const [family, m] of Object.entries(p.markets ?? {})) {
      const market = m.market ?? null;
      const stale = market ? isStale(market.capturedAt) : false;
      /*
       * DISPLAY STATUS IS READ, NOT GRADED. The producer already stamped either a market or a typed
       * absence; the audit's only addition is STALE, which is a property of the clock rather than
       * of the artifact and so cannot have been stamped when it was written.
       */
      const displayStatus = market ? (stale ? "STALE" : "PRICED") : (m.pricingState ?? (probed ? "NOT_OFFERED" : "NOT_PROBED"));
      const key = `${eventId}|${p.playerId}|${family}`;
      const surfaces = [`nfl/game/${eventId}`];
      if (weeklyRows.has(key)) surfaces.push(`nfl/ + nfl/week/${weekly?.period?.seasonType}-${String(weekly?.period?.week).padStart(2, "0")}`);
      if (vaultRows.has(key)) surfaces.push("nfl/ (Endzone Vault)");

      rows.push({
        event: `${ev.away.abbr} @ ${ev.home.abbr}`,
        providerEventId: eventId,
        kickoffUtc: ev.dateUtc,
        playerId: p.playerId,
        player: p.name,
        team: p.team,
        family,
        modelProjectionExists: m.probability != null || m.median != null || m.mean != null,
        providerMarketExists: market != null,
        selectedBook: market?.sportsbook ?? null,
        line: market?.line ?? null,
        over: market?.overOdds ?? null,
        under: market?.underOdds ?? null,
        atdPrice: market?.yesOdds ?? null,
        capturedAt: market?.capturedAt ?? null,
        /* The join succeeded iff a durable id carries a price; a quarantine never reaches a row. */
        joinStatus: market ? "JOINED" : probed ? "NO_ROW_RETURNED" : "NOT_QUERIED",
        displayStatus,
        publicSurfaces: surfaces,
      });
      evRows += 1;
      if (market) evPriced += 1;
    }
  }

  eventSummary.push({
    event: `${ev.away.abbr} @ ${ev.home.abbr}`,
    providerEventId: eventId,
    kickoffUtc: ev.dateUtc,
    probed,
    boardPublished: Boolean(board),
    rows: evRows,
    priced: evPriced,
    /* The acceptance gate's unit. An eligible pre-start event that was never queried is the one
       state this lane may not end in. */
    state: !board ? "NO_PLAYER_BOARD" : probed ? "PROBED" : "NOT_PROBED",
  });
}

const byDisplay = {};
for (const r of rows) byDisplay[r.displayStatus] = (byDisplay[r.displayStatus] ?? 0) + 1;
const byFamily = {};
for (const r of rows) {
  byFamily[r.family] ??= { rows: 0, priced: 0, books: {} };
  byFamily[r.family].rows += 1;
  if (r.selectedBook) {
    byFamily[r.family].priced += 1;
    byFamily[r.family].books[r.selectedBook] = (byFamily[r.family].books[r.selectedBook] ?? 0) + 1;
  }
}
const notProbed = eventSummary.filter((e) => e.state === "NOT_PROBED");

const report = {
  schemaVersion: 1,
  artifact: "nfl-market-matrix",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  period,
  capture: {
    capturedAt: markets?.capturedAt ?? null,
    propState: markets?.propMarkets?.state ?? "NOT_PROBED",
    eventsProbed: markets?.propMarkets?.eventsProbed ?? (markets?.propMarkets?.probedEventIds ?? []).length,
    offeredMarkets: markets?.propMarkets?.offeredMarkets ?? [],
    referenceBook: propPrices.meta?.referenceBook ?? null,
    fallbackOrder: propPrices.meta?.fallbackOrder ?? null,
    policy: propPrices.meta?.policy ?? null,
    freshnessHours: FRESHNESS_HOURS,
  },
  coverage: {
    eligibleEvents: eligible.length,
    eventsWithPlayerBoard: eventSummary.filter((e) => e.boardPublished).length,
    eventsProbed: eventSummary.filter((e) => e.probed).length,
    /* THE ACCEPTANCE GATE, as a number rather than a claim. */
    eventsNotProbed: notProbed.length,
    notProbedEvents: notProbed.map((e) => `${e.event} (${e.providerEventId})`),
  },
  rowsByDisplayStatus: byDisplay,
  byFamily,
  events: eventSummary,
  rows,
};

if (has("--write")) {
  const out = path.join(ROOT, "data/internal/research/nfl/reports", `market-matrix-${NOW.slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`wrote ${path.relative(ROOT, out)}`);
}
/*
 * ⚠ `process.exit(0)` RIGHT AFTER A LARGE WRITE TRUNCATES IT. stdout to a PIPE is asynchronous, so
 * exiting immediately discards whatever has not drained — this printed exactly 8,192 bytes of a
 * 900-row report and the consumer got "Unterminated string in JSON". It is the quietest possible
 * failure: a correct report, a plausible-looking prefix, and a parse error blamed on the reader.
 * Falling off the end of the script lets Node flush; nothing else is needed.
 */
if (has("--json")) {
  console.log(JSON.stringify(report, null, 1));
} else {
  console.log(`NFL MARKET MATRIX · ${period.seasonType}-${String(period.week).padStart(2, "0")} · ${NOW}`);
  console.log(`population: ${eligible.length} eligible pre-start event(s) from the canonical schedule`);
  console.log(`  player boards published : ${report.coverage.eventsWithPlayerBoard}`);
  console.log(`  events probed           : ${report.coverage.eventsProbed}`);
  console.log(`  events NOT_PROBED       : ${report.coverage.eventsNotProbed}${notProbed.length ? ` — ${report.coverage.notProbedEvents.join(", ")}` : " ✓"}`);
  console.log(`rows: ${rows.length}`);
  for (const [k, v] of Object.entries(byDisplay).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${v}`);
  console.log("by family:");
  for (const [fam, v] of Object.entries(byFamily)) {
    const books = Object.entries(v.books).map(([b, n]) => `${b} ${n}`).join(", ") || "—";
    console.log(`  ${fam.padEnd(22)} ${String(v.priced).padStart(4)}/${String(v.rows).padEnd(5)} priced · ${books}`);
  }
}
