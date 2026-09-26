/**
 * THE MULTI-SPORT LIVE MATRIX — "which published prediction can we actually track live, and why not?"
 *
 * §8 and §9 both open with the same instruction — audit the registry BEFORE building — and the
 * reason became concrete on 2026-09-26. Today's MLB board carries 569 leans with 100% gamePk
 * coverage, 92% StatsAPI player-id coverage, a complete frozen market on every row and a model
 * probability on 523 of them. It looks like the best live-tracking substrate in the product. All
 * four of its markets are `DEMOTE_TO_MARKET_CONTEXT`: the model loses to the market on Brier AND
 * log loss across 18,659 settled leans. Building live PREDICTION tracking on that would take a
 * demoted model and present it as a validated forecast, which §3 forbids in as many words.
 *
 * ENGINEERING READINESS AND PRODUCT ELIGIBILITY ARE SEPARATE COLUMNS, because they fail
 * independently — MLB is ready and ineligible; NFL anytime touchdown and UFC method are eligible
 * and unmeasurable — and collapsing them is how a demoted market ships.
 *
 * ⚠ THE MLB VERDICTS ARE IMPORTED FROM THE TypeScript SINGLE SOURCE OF TRUTH, so this module must
 * be loaded under `tsx`. A regex over that file, or a table copied into this one, would be a second
 * source that drifts from the audit it claims to report.
 *
 * READ-ONLY by construction: it has no writer and calls no provider. The CLI at
 * `scripts/ops/multisport-live-matrix.mjs` does the printing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MLB_MARKET_CALIBRATION } from "../mlb/model-calibration-status.ts";
import {
  LIVE_MEASURABLE_NFL_MARKETS,
  PUBLISHED_NOT_LIVE_MEASURABLE as NFL_NOT_LIVE,
} from "./adapters/nfl-tracked.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..");


const readJson = (p, f = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return f; } };
const newestIn = (dir, suffix = ".json") => {
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(suffix)).sort();
    return files.length ? path.join(dir, files[files.length - 1]) : null;
  } catch { return null; }
};

/**
 * One row of the matrix.
 *
 * `eligible` answers "may this be shown as a GameTimePicks forecast at all?" and `trackable`
 * answers "can a free authoritative feed state its value by identity?". A family can be
 * engineering-ready and product-ineligible (MLB, all four) or product-eligible and
 * engineering-blocked (NFL anytime touchdown, UFC method) — the two questions are independent.
 */
const row = (o) => ({
  sport: o.sport, family: o.family, label: o.label ?? o.family,
  modelState: o.modelState ?? null,
  eligible: o.eligible, eligibleReason: o.eligibleReason ?? null,
  identity: o.identity ?? null,
  frozenMarket: o.frozenMarket ?? null,
  liveField: o.liveField ?? null,
  finalField: o.finalField ?? null,
  settlementOwner: o.settlementOwner ?? null,
  trackable: o.trackable, trackableReason: o.trackableReason ?? null,
});

/* ── NFL ──────────────────────────────────────────────────────────────────────────────────────── */
/**
 * Every board belonging to ONE slate, aggregated.
 *
 * ⚠ THE FIRST CUT TOOK WHATEVER `readdirSync` HANDED BACK FIRST and presented it as "the NFL
 * state". It picked a board from an older week and reported `player_rush_yds` as ESTIMATE and
 * "no frozen market published" — while every one of the fourteen boards for tomorrow's slate
 * publishes it and carries a real DraftKings line. An audit that silently samples one artifact out
 * of forty-nine is not an audit; it is a coin toss with a table around it.
 */
function nflSlateBoards(DATE) {
  const dir = path.join(APP, "public/data/nfl/player-board");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return { boards: [], slate: null }; }

  const bySlate = new Map();
  for (const f of files) {
    const b = readJson(path.join(dir, f));
    if (!b?.families || !Array.isArray(b?.players)) continue;
    const kick = b.kickoffUtc ?? b.generatedAt;
    if (!kick || !Number.isFinite(Date.parse(kick))) continue;
    const slate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(kick));
    if (!bySlate.has(slate)) bySlate.set(slate, []);
    bySlate.get(slate).push(b);
  }
  if (!bySlate.size) return { boards: [], slate: null };

  /* The slate this run is about: the earliest one at or after --date, else the most recent. */
  const slates = [...bySlate.keys()].sort();
  const slate = slates.find((d) => d >= DATE) ?? slates[slates.length - 1];
  return { boards: bySlate.get(slate), slate };
}

function nflRows(DATE) {
  const { boards, slate } = nflSlateBoards(DATE);
  if (!boards.length) return [row({ sport: "NFL", family: "(no committed player board)", eligible: false, trackable: false,
    trackableReason: "no board artifact to read families from" })];

  /* A family's state is PUBLISHED only if it is published on EVERY board of the slate — a family
     published on nine of fourteen games is not a slate-wide published family, and reporting it as
     one hides five games in which a reader sees nothing. */
  const stateCounts = new Map();
  const marketCounts = new Map();
  const labels = new Map();
  let rowsTotal = new Map();
  for (const b of boards) {
    for (const [family, entry] of Object.entries(b.families ?? {})) {
      const st = typeof entry === "string" ? entry : entry?.state ?? null;
      if (!stateCounts.has(family)) stateCounts.set(family, new Map());
      const m = stateCounts.get(family);
      m.set(st, (m.get(st) ?? 0) + 1);
      if (entry?.label) labels.set(family, entry.label);
      let withMarket = 0; let total = 0;
      for (const p of b.players ?? []) {
        const proj = p?.markets?.[family];
        if (!proj) continue;
        total++;
        if (proj.market?.line != null || proj.market?.yesOdds != null) withMarket++;
      }
      marketCounts.set(family, (marketCounts.get(family) ?? 0) + withMarket);
      rowsTotal.set(family, (rowsTotal.get(family) ?? 0) + total);
    }
  }

  const out = [];
  for (const [family, counts] of stateCounts) {
    const publishedOn = counts.get("PUBLISHED") ?? 0;
    const published = publishedOn === boards.length;
    const spread = [...counts.entries()].map(([k, v]) => `${k}×${v}`).join(" ");
    const measurable = LIVE_MEASURABLE_NFL_MARKETS.includes(family);
    const withMarket = marketCounts.get(family) ?? 0;
    const total = rowsTotal.get(family) ?? 0;
    out.push(row({
      sport: "NFL", family, label: labels.get(family) ?? family,
      modelState: published ? "PUBLISHED" : spread,
      eligible: published,
      eligibleReason: published ? null : `published on ${publishedOn} of ${boards.length} boards (${spread})`,
      identity: `nfl-athlete-<espnId> · ${boards.length} boards on slate ${slate}`,
      frozenMarket: total ? `line or price on ${withMarket}/${total} projected rows` : "no projected rows",
      liveField: measurable ? "ESPN box score, joined by athlete id" : null,
      finalField: measurable ? "ESPN box score (final)" : null,
      settlementOwner: measurable ? "nfl prop-settlement ledger" : null,
      trackable: published && measurable,
      trackableReason: !published ? `not published on every board (${spread})`
        : measurable ? null : (NFL_NOT_LIVE[family] ?? "no live field is mapped for this family"),
    }));
  }
  return out;
}

/* ── MLB ──────────────────────────────────────────────────────────────────────────────────────── */
function mlbRows(DATE) {
  const boardPath = path.join(APP, `public/data/mlb/boards/${DATE}.json`) ;
  const board = readJson(boardPath) ?? readJson(newestIn(path.join(APP, "public/data/mlb/boards")));
  const leans = board?.leans ?? [];
  const families = new Map();
  for (const l of leans) {
    const k = l?.marketKey;
    if (!k) continue;
    const f = families.get(k) ?? { n: 0, withPlayerId: 0, withGamePk: 0, withLine: 0, withProb: 0 };
    f.n++;
    if (l.playerId != null) f.withPlayerId++;
    if (l.gamePk != null) f.withGamePk++;
    if (typeof l.line === "number") f.withLine++;
    if (typeof l.modelProbOver === "number") f.withProb++;
    families.set(k, f);
  }

  const out = [];
  for (const [family, f] of families) {
    const cal = MLB_MARKET_CALIBRATION[family] ?? null;
    const verdict = cal?.verdict ?? "UNREGISTERED";
    const eligible = verdict === "PUBLIC_MODEL_OK";
    out.push(row({
      sport: "MLB", family, label: cal?.label ?? family, modelState: verdict,
      eligible,
      /* ⚠ The numbers are quoted so the refusal cannot be dismissed as a stale flag. */
      eligibleReason: eligible ? null
        : cal ? `${verdict} — model Brier ${cal.brierModel} vs market ${cal.brierMarket}, log loss ${cal.loglossModel} vs ${cal.loglossMarket}, n=${cal.sampleSize}`
              : "not in the calibration registry at all",
      identity: `gamePk ${f.withGamePk}/${f.n} · StatsAPI playerId ${f.withPlayerId}/${f.n}`,
      frozenMarket: `line ${f.withLine}/${f.n} · model probability ${f.withProb}/${f.n}`,
      /* Engineering readiness is stated even where the product is ineligible, because it is the
         thing that would be TRUE if a market were ever recalibrated. */
      liveField: "StatsAPI /game/{gamePk}/boxscore — NOT wired: the gateway fetches schedule only",
      finalField: "StatsAPI boxscore (final)",
      settlementOwner: "mlb lean settlement",
      trackable: false,
      trackableReason: eligible
        ? "gateway fetches schedule only (hydrate=linescore,team); no boxscore call exists"
        : `market is ${verdict} — a demoted model may not be presented as a validated forecast (§3)`,
    }));
  }
  if (!out.length) out.push(row({ sport: "MLB", family: "(no leans on the board)", eligible: false, trackable: false }));
  return out;
}

/* ── UFC ──────────────────────────────────────────────────────────────────────────────────────── */
function ufcRows(DATE) {
  const card = readJson(path.join(APP, "public/data/ufc/card-latest.json"));
  const publishes = card?.model?.publishes ?? [];
  const verdicts = card?.model?.verdicts ?? {};

  /*
   * What the REGISTERED source states, verified against real completed events on 2026-08-29 and
   * 2026-09-19 (ESPN MMA scoreboard, free and keyless, the same endpoint and id space the forward
   * capture uses):
   *   competitor.id      ESPN athlete id — present in PRE as well as POST  (⚠ it is `competitor.id`,
   *                      NOT `competitor.athlete.id`, which is null)
   *   competitor.winner  the winner, by that id
   *   status.period      the round the bout ended in
   *   status.displayClock the time at the end
   * and what it does NOT state: the METHOD. There is no KO/SUB/DEC field, the summary endpoint
   * answers a code/message error for these ids, and `capture-ufc-results.mjs` records that grading
   * runs through a WINNER-ONLY settlement contract which quarantines draw/no-contest rather than
   * guessing. So `method` is forecast-and-display only, and says so.
   */
  const FINALS = {
    winner: { live: "bout state · round · clock (unresolved until the end)", final: "competitor.winner by ESPN athlete id", settle: "winner-only settlement contract", ok: true },
    rounds: { live: "status.period — the round in progress", final: "status.period + displayClock at the end", settle: "not settled — the contract grades winner only", ok: false,
              why: "the end round is observable, but settlement is winner-only and a rounds result is not graded" },
    method: { live: null, final: null, settle: null, ok: false,
              why: "the registered source states no KO/SUB/DEC; inferring one from prose is the name-matching this product refuses" },
  };

  const out = [];
  for (const family of publishes) {
    const v = verdicts[family === "rounds" ? "round" : family] ?? verdicts[family] ?? null;
    const eligible = v === "PASS";
    const f = FINALS[family] ?? {};
    out.push(row({
      sport: "UFC", family, label: family, modelState: v,
      eligible, eligibleReason: eligible ? null : `model verdict is ${v}`,
      identity: "ESPN athlete id · card athleteId ↔ scoreboard competitor.id",
      frozenMarket: "card prediction probabilities (model-owned)",
      liveField: f.live, finalField: f.final, settlementOwner: f.settle,
      trackable: eligible && f.ok === true,
      trackableReason: eligible ? (f.ok ? null : f.why) : `model verdict is ${v}`,
    }));
  }
  if (!out.length) out.push(row({ sport: "UFC", family: "(no card published)", eligible: false, trackable: false }));
  return out;
}

/* ── EPL ──────────────────────────────────────────────────────────────────────────────────────── */
function eplRows(DATE) {
  return [row({
    sport: "EPL", family: "(all)", eligible: false, trackable: false,
    identity: "ESPN ↔ FPL crosswalk — candidates only, ambiguous identities deliberately unresolved",
    trackableReason: "§10: architecture only until the identity join is reviewed; no fabricated parity",
  })];
}


/** Build the whole matrix for one ET date. Pure over committed artifacts; no clock, no network. */
export function buildMultisportMatrix({ date }) {
  const rows = [...nflRows(date), ...mlbRows(date), ...ufcRows(date), ...eplRows(date)];
  return {
    artifact: "multisport-live-matrix",
    date,
    rows,
    summary: {
      published: rows.length,
      eligible: rows.filter((r) => r.eligible).length,
      trackable: rows.filter((r) => r.trackable).length,
    },
  };
}
