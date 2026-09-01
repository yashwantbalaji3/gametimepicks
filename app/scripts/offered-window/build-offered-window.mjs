#!/usr/bin/env node
/**
 * OFFERED-WINDOW MATRIX — the runner.
 *
 *   node app/scripts/offered-window/build-offered-window.mjs --now <ISO> [--fail-on-findings]
 *
 * Judgement lives in `src/lib/offered-window/offered-window.mjs`. This only locates each sport's
 * committed evidence and names its identity, horizon and freshness bound. It fetches nothing, spends
 * no credits, and writes two artifacts:
 *
 *   data/internal/offered-window/<date>.json   the full matrix — identities, routes, receipts
 *   app/public/data/ops/offered-window.json    compact counts only, customer-safe
 *
 * HORIZONS ARE PER SPORT, because their offer cycles are. NFL, EPL and UFC are inspected across the
 * whole provider-offered horizon — a card or matchweek is offered days ahead and asking "what is on
 * today" throws that away. MLB looks at the current and next actionable slate, because pitchers and
 * lineups move fast enough that a week-out row is not actionable. NBA stays typed OFF_SEASON; there
 * is no activation work to invent to fill a four-sport table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSportWindow, worstWindowState, publicSummary } from "../../src/lib/offered-window/offered-window.mjs";
import { assignPublicGameSlugs } from "../../src/lib/mlb/public-game-slug.ts";
import { loadEplForecasts } from "../../src/lib/sports/epl/forecast-view.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(APP, "public", "data");
const ROOT = path.join(APP, "..");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const nowMs = Date.parse(NOW);

const read = (...seg) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, ...seg), "utf8")); } catch { return null; } };
const etDate = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const DATE = arg("--date", etDate(nowMs));
const ageHours = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? (nowMs - t) / 3_600_000 : null; };
const withinHours = (iso, h) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) && t - nowMs <= h * 3_600_000; };

/* ── MLB — the current and next actionable slate ───────────────────────────────────────────────── */

const MLB_HORIZON_H = 48;

function mlbEvents() {
  const dates = (() => {
    try {
      return fs.readdirSync(path.join(DATA, "mlb", "boards")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
    } catch { return []; }
  })();
  /*
   * WHICH DAY IS THIS WINDOW ABOUT? The newest committed board may be YESTERDAY'S — today's is not
   * built until ~90 minutes before first pitch. Reporting yesterday's twelve started games without
   * saying so reads as "today is over", which is a different and false claim. The window carries its
   * own date, and the caller renders it.
   */
  const date = dates.includes(DATE) ? DATE : dates.at(-1);
  const board = date ? read("mlb", "boards", `${date}.json`) : null;
  if (!board) return null;
  const games = board.games ?? [];
  const { slugs } = assignPublicGameSlugs(games.map((g) => ({ away: g.awayTeamAbbr, home: g.homeTeamAbbr, date, key: g.gamePk })));

  const leanPks = new Set((board.leans ?? []).map((l) => String(l.gamePk)).filter(Boolean));
  const sims = new Set(((read("mlb", "full-game-simulations", `${date}.json`)?.games) ?? []).map((g) => String(g.gamePk)));
  const preds = new Set(((read("mlb", "predictions", `${date}.json`)?.predictions) ?? []).map((g) => String(g.gamePk)));
  const settled = new Set(Object.keys(read("mlb", "linescores", `${date}.json`) ?? {}));

  return games
    .filter((g) => withinHours(g.gameDate, MLB_HORIZON_H))
    .map((g, i) => {
      const pk = String(g.gamePk);
      return {
        providerEventId: pk,
        canonicalId: `mlb-${pk}`,
        startUtc: g.gameDate,
        marketFamilies: leanPks.has(pk) ? ["team", "player"] : [],
        acquisitionAt: board.generatedAt ?? null,
        sourceAgeHours: ageHours(board.generatedAt),
        maxSourceAgeHours: 30,
        joined: g.gamePk != null,
        offered: leanPks.has(pk),
        priced: leanPks.has(pk),
        forecast: sims.has(pk),
        published: preds.has(pk),
        publicRoute: `/games/mlb/${slugs[i]}/`,
        settlementId: pk,
        settled: settled.has(pk),
        refusalReason: g.startedBeforeGeneration ? "generated after first pitch — refused by the pre-event boundary" : null,
      };
    });
}

/* ── NFL — the whole offered horizon, not a calendar day ───────────────────────────────────────── */

const NFL_HORIZON_H = 24 * 14;

function nflEvents() {
  const schedule = read("nfl", "schedule", "latest.json");
  const index = read("nfl", "index.json");
  if (!schedule || !index) return null;

  const markets = read("nfl", "markets", "latest.json");
  const pricedIds = new Set((markets?.rows ?? []).map((r) => String(r.providerEventId)).filter(Boolean));
  const byForecast = new Map((index.events ?? []).map((e) => [String(e.providerEventId), e]));

  return (schedule.rows ?? [])
    .filter((r) => withinHours(r.dateUtc, NFL_HORIZON_H))
    .map((r) => {
      const id = String(r.providerEventId ?? "");
      const f = byForecast.get(id) ?? null;
      return {
        providerEventId: id || null,
        canonicalId: id ? `nfl-${id}` : null,
        startUtc: r.dateUtc,
        marketFamilies: pricedIds.has(id) ? ["h2h"] : [],
        acquisitionAt: markets?.capturedAt ?? schedule.generatedAt ?? null,
        sourceAgeHours: ageHours(schedule.generatedAt),
        maxSourceAgeHours: 30,
        joined: Boolean(id),
        offered: pricedIds.has(id),
        priced: pricedIds.has(id),
        forecast: Boolean(f) && f.lifecycle === "UPCOMING",
        published: Boolean(f) && f.lifecycle !== "UPCOMING" ? false : Boolean(f),
        publicRoute: id ? `/nfl/game/${id}/` : null,
        forecastRevision: f?.receipt?.inputHash ?? null,
        settlementId: id || null,
        settled: f?.lifecycle === "SETTLED",
        refusalReason: null,
      };
    });
}

/* ── UFC — the full offered card ───────────────────────────────────────────────────────────────── */

function ufcEvents() {
  const card = read("ufc", "card-latest.json");
  if (!card) return null;
  const odds = read("ufc", "odds-latest.json");

  const priced = new Set((odds?.bouts ?? []).map((b) => String(b.boutId)).filter(Boolean));
  const unpricedReason = new Map((odds?.unpricedBouts ?? []).map((b) => [String(b.boutId), b.reason ?? b.state ?? null]));

  /*
   * The odds capture carries its OWN age. On 2026-09-01 `odds-latest` was generated 08-29 and every
   * bout it names starts 08-29 — it describes a card that has already been fought, while
   * `card-latest` holds the 09-05 card. Reporting that as an ordinary unpriced window would hide a
   * stale source behind a legitimate-looking state, so the bound is applied per bout.
   */
  const oddsAge = ageHours(odds?.generatedAt);
  /*
   * THE CAPTURE COVERS A DIFFERENT CARD. On 2026-09-01 `odds-latest` was generated 08-29 and every
   * bout it names starts 08-29 — a card already fought — while `card-latest` holds 09-05. My first
   * draft applied the age bound only to bouts the capture priced, of which there were none, so the
   * staleness was invisible: a green window built on a source describing last week. The bound
   * belongs to the CARD, so it fires whether or not any bout came back priced.
   */
  const capturedIds = new Set([
    ...(odds?.bouts ?? []).map((b) => String(b.boutId)),
    ...(odds?.unpricedBouts ?? []).map((b) => String(b.boutId)),
  ].filter(Boolean));
  const cardIds = new Set((card.bouts ?? []).map((b) => String(b.boutId)).filter(Boolean));
  const capturesThisCard = [...capturedIds].some((id) => cardIds.has(id));
  const staleCapture = odds != null && capturedIds.size > 0 && !capturesThisCard;

  return (card.bouts ?? []).map((b) => {
    const id = String(b.boutId ?? "");
    const isPriced = priced.has(id);
    return {
      providerEventId: id || null,
      canonicalId: id ? `ufc-${id}` : null,
      startUtc: b.startUtc ?? null,
      marketFamilies: isPriced ? ["h2h"] : [],
      acquisitionAt: odds?.generatedAt ?? null,
      // Only a bout the capture actually covers is judged against the capture's age.
      sourceAgeHours: staleCapture ? oddsAge : (isPriced ? oddsAge : null),
      maxSourceAgeHours: 72,
      joined: Boolean(id),
      offered: isPriced || unpricedReason.has(id),
      priced: isPriced,
      /*
       * A per-bout model read is the forecast; a card-level `model` block is not. My first draft used
       * the block, so all fourteen bouts read PUBLISHED and the more informative unpriced/refused
       * state was masked by a coarser one that was true of the CARD rather than of the bout.
       */
      forecast: Boolean(b.prediction),
      published: Boolean(b.prediction) && isPriced,
      publicRoute: "/ufc/",
      settlementId: id || null,
      settled: false,
      refusalReason: staleCapture
        ? null // SOURCE_STALE outranks a refusal; do not dress a rotten source as a decision
        : isPriced ? null : (unpricedReason.get(id) ?? "no posted market for this bout at capture time"),
    };
  });
}

/* ── EPL — the current provider horizon ────────────────────────────────────────────────────────── */

function eplEvents() {
  /*
   * Read through the forecast VIEW, not a guessed path. My first draft looked for
   * `epl/forecasts/latest.json`, fell back to `graded-picks.json`, and mapped `fixtureId` — none of
   * which exist. It found zero rows and reported EPL as NO_EVENTS while a fixture sat in the set:
   * a sport erased from the matrix by a wrong path, which is precisely the omission this release is
   * built to detect.
   */
  const set = loadEplForecasts();
  if (!set) return null;
  return (set.rows ?? []).map((r) => ({
    providerEventId: r.eventId ?? null,
    canonicalId: r.eventId ?? null,
    startUtc: r.kickoffUtc ?? null,
    marketFamilies: r.probs ? ["1x2", "totals"] : [],
    acquisitionAt: set.oddsCapturedAt ?? set.generatedAt ?? null,
    sourceAgeHours: ageHours(set.oddsCapturedAt ?? set.generatedAt),
    maxSourceAgeHours: 120,
    joined: Boolean(r.eventId),
    offered: Boolean(r.probs),
    priced: r.state === "READY",
    forecast: Boolean(r.state) && r.state !== "UNAVAILABLE",
    published: Boolean(set.public),
    publicRoute: r.slug ? `/epl/#${r.slug}` : "/epl/",
    settlementId: r.eventId ?? null,
    settled: false,
    refusalReason: r.state === "READY_EXCEPT_ODDS" ? (r.unavailableReason ?? "no eligible price for this fixture yet") : null,
  }));
}

/* ── MAIN ─────────────────────────────────────────────────────────────────────────────────────── */

const mlbWindowDate = (() => {
  try {
    const ds = fs.readdirSync(path.join(DATA, "mlb", "boards")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
    return ds.includes(DATE) ? DATE : (ds.at(-1) ?? null);
  } catch { return null; }
})();

const built = [
  ["mlb", mlbEvents(), MLB_HORIZON_H],
  ["nfl", nflEvents(), NFL_HORIZON_H],
  ["ufc", ufcEvents(), 24 * 14],
  ["epl", eplEvents(), 24 * 14],
].map(([sport, events, horizonHours]) => ({
  ...buildSportWindow({ sport, events: events ?? [], horizonHours, nowMs, readable: events !== null }),
  /* The day this window DESCRIBES. MLB's newest committed board may be yesterday's; saying so is the
     difference between "today is over" and "today is not built yet". */
  windowDate: sport === "mlb" ? mlbWindowDate : DATE,
}));

/* NBA stays typed rather than absent — a sport missing from the table reads as an oversight. */
built.push({
  sport: "nba", state: "NO_EVENTS", horizonHours: 0, population: 0, counts: {}, owed: [], findings: [], rows: [],
  conserved: true, note: "OFF_SEASON by the sport registry — no activation work is invented to fill a four-sport table",
});

const state = worstWindowState(built.map((s) => s.state));

const internal = {
  schemaVersion: 1,
  artifact: "offered-window-matrix",
  dataClass: "INTERNAL_DERIVED",
  generatedAt: NOW,
  date: DATE,
  state,
  sports: built,
  totals: {
    events: built.reduce((n, s) => n + s.population, 0),
    owed: built.reduce((n, s) => n + s.owed.length, 0),
    findings: built.reduce((n, s) => n + s.findings.length, 0),
  },
};

const INTERNAL_OUT = path.join(ROOT, "data", "internal", "offered-window", `${DATE}.json`);
fs.mkdirSync(path.dirname(INTERNAL_OUT), { recursive: true });
fs.writeFileSync(INTERNAL_OUT, `${JSON.stringify(internal, null, 2)}\n`);

const PUBLIC_OUT = path.join(DATA, "ops", "offered-window.json");
fs.mkdirSync(path.dirname(PUBLIC_OUT), { recursive: true });
fs.writeFileSync(
  PUBLIC_OUT,
  `${JSON.stringify({
    schemaVersion: 1,
    artifact: "offered-window-summary",
    dataClass: "PUBLIC_DERIVED",
    generatedAt: NOW,
    date: DATE,
    note: "Counts only. Provider payloads, prices, acquisition receipts and internal routes stay in the private matrix.",
    ...publicSummary(built),
  }, null, 2)}\n`,
);

for (const s of built) {
  const line = `[offered] ${s.sport.padEnd(4)} ${s.state.padEnd(12)} ${String(s.population).padStart(3)} events · owed ${s.owed.length} · findings ${s.findings.length}`;
  if (["FINDINGS", "INCONSISTENT", "UNKNOWN"].includes(s.state)) console.error(line); else console.log(line);
  const active = Object.entries(s.counts).filter(([, n]) => n > 0);
  if (active.length) console.log(`             ${active.map(([k, n]) => `${k}:${n}`).join(" · ")}`);
  for (const f of s.findings.slice(0, 4)) console.error(`             ⚠ ${f.canonicalId ?? "?"} ${f.state} — ${f.reason}`);
}
console.log(`[offered] ${state} · ${internal.totals.events} events · ${internal.totals.owed} owed · ${internal.totals.findings} findings`);
console.log(`[offered] wrote ${path.relative(process.cwd(), INTERNAL_OUT)} and ${path.relative(process.cwd(), PUBLIC_OUT)}`);

process.exit(process.argv.includes("--fail-on-findings") && ["FINDINGS", "INCONSISTENT", "UNKNOWN"].includes(state) ? 1 : 0);
