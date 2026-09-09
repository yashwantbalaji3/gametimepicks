#!/usr/bin/env node
/**
 * NFL PUBLIC PLAYER BOARD (P245 · Release C/D). PUBLIC_DERIVED.
 *
 * Extracts, per current-week event, the PROMOTION-ELIGIBLE slices of the private current-event
 * research artifacts into one public board artifact per game:
 *
 *   player_rush_yds   — PUBLIC_ELIGIBLE (props-v1 evaluation: n=3273, beats both baselines,
 *                       interval coverage + calibration bars pass) → rows PUBLISH
 *   anytime TD        — calibrated engine (anytime-td-v1: held-out 2025 logLoss 0.5492 beats
 *                       both baselines, n=3570) → per-player probabilities PUBLISH
 *   player_pass_yds   — RESEARCH_ONLY (interval coverage bar failed) → WITHHELD, bar named
 *   player_reception_yds / player_receptions — SHADOW_ELIGIBLE (calibration bar failed) →
 *                       WITHHELD, bar named
 *   pass TDs / INT / first / last / 2+ TD — never separately evaluated or explicitly DISABLED →
 *                       WITHHELD, no receipt
 *
 * P250-GD2 (owner display decision): families the engine COMPUTES but whose models failed a
 * promotion bar publish as state "ESTIMATE" — the numbers display with the failed bar(s) and a
 * plain-English caveat carried ON the family, never as bare picks. Families with no computed
 * per-player distribution stay WITHHELD. Product eligibility is untouched: an ESTIMATE can never
 * become a card leg, and the graded record's population is unchanged.
 *
 * The gates are READ from the artifact's own promotion block and receipts — never hardcoded to
 * a family list, so a future re-evaluation flips publication by changing the receipt, not this
 * file. Every published row carries its participation state (AVAILABLE_ROLE_UNCERTAIN /
 * QUESTIONABLE / INACTIVE from the injuries-fed role evidence) because a projection without its
 * availability caveat is a different, stronger claim than the model makes.
 *
 * Usage: node scripts/nfl/build-nfl-player-board.mjs --now <iso>
 * Writes: app/public/data/nfl/player-board/<eventId>.json + latest.json (index)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveNewArrivals } from "../../src/lib/sports/nfl/new-arrivals.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const nowMs = Date.parse(NOW);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/* Newest current-event artifact per event, scanning the recent date dirs (a week's artifacts can
 * span several run dates; the newest stamp per event is the current view). */
const CUR = path.join(ROOT, "data/internal/nfl/current");
const byEvent = new Map();
for (const day of (fs.existsSync(CUR) ? fs.readdirSync(CUR) : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-10)) {
  for (const f of fs.readdirSync(path.join(CUR, day)).filter((x) => x.endsWith(".json")).sort()) {
    const doc = read(path.join(CUR, day, f));
    if (!doc?.providerEventId) continue;
    const prev = byEvent.get(doc.providerEventId);
    if (!prev || String(doc.generatedAt) > String(prev.generatedAt)) byEvent.set(doc.providerEventId, doc);
  }
}

/* Only the events still upcoming: the board is a pre-event surface; a started game's board is its
 * frozen last pre-kickoff revision, which the dated per-event file preserves. */
const events = [...byEvent.values()].filter((d) => Date.parse(d.kickoffUtc) > nowMs);
if (!events.length) { console.log("NO_EVENTS: no upcoming current-event artifacts — nothing publishes and nothing is faked"); process.exit(0); }

const PROP_LABEL = {
  player_rush_yds: "Rushing yards",
  player_pass_yds: "Passing yards",
  player_reception_yds: "Receiving yards",
  player_receptions: "Receptions",
};

/* P250-GD3 — NEW ARRIVALS: roster-present skill players with notable prior-club usage who the
 * evaluated stint rule keeps out of the share pool (their new-club role is unobserved). Derived
 * once for the week from the committed corpus + role evidence + share snapshot; attached per
 * event so no star is ever silently absent. Factual per-game history, never a projection. */
const newArrivalsByEvent = (() => {
  try {
    return deriveNewArrivals({
      corpusSeasons: [
        read(path.join(ROOT, "data/internal/research/nfl/player-events-v1/2025.json")),
        read(path.join(ROOT, "data/internal/research/nfl/player-events-v1/2024.json")),
      ].filter(Boolean),
      roleEvidence: read(path.join(ROOT, "data/internal/nfl/role-evidence/latest.json")),
      shares: read(path.join(ROOT, "data/internal/research/nfl/role-shares-v1/current.json")),
    });
  } catch (e) { console.error(`new-arrivals derivation failed (boards publish without the strip): ${e.message}`); return new Map(); }
})();

/*
 * P250-GD3 — ONE DESIGNATION VOCABULARY, JOINED AT THE ROW.
 *
 * Found on game day: Tyrell Shavers was designated Out in the injuries feed and role evidence, and
 * still carried receiving projections, because a props row's participation came from the event
 * artifact's pool and was only ever UPGRADED by the anytime-TD board — a player absent from the TD
 * top rows never met his own designation. The two artifacts also speak different words for the same
 * state (role evidence OUT / board INACTIVE), so a naive comparison silently missed every out
 * player. Every row now joins the role-evidence designation directly, translated once here.
 */
const ROLE_TO_BOARD = { OUT: "INACTIVE", INACTIVE: "INACTIVE", QUESTIONABLE: "QUESTIONABLE", ACTIVE_PROJECTED: "ACTIVE_PROJECTED", ACTIVE_UNCERTAIN: "AVAILABLE_ROLE_UNCERTAIN", SOURCE_STALE: "AVAILABLE_ROLE_UNCERTAIN" };
const designationByPlayer = (() => {
  const m = new Map();
  const doc = read(path.join(ROOT, "data/internal/nfl/role-evidence/latest.json"));
  for (const ev of doc?.events ?? []) {
    for (const [abbr, tv] of Object.entries(ev.teams ?? {})) {
      for (const p of tv.players ?? []) {
        const mapped = ROLE_TO_BOARD[p.state];
        if (mapped) m.set(`${abbr}:${p.playerId}`, mapped);
      }
    }
  }
  return m;
})();

const outDir = path.join(APP, "public/data/nfl/player-board");
fs.mkdirSync(outDir, { recursive: true });
const index = [];
let publishedBoards = 0;

for (const doc of events.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))) {
  const promotion = doc.families?.playerProps?.promotion ?? null;
  const tdReceipt = read(path.join(ROOT, "data/internal/research/nfl/reports/anytime-td-v1-calibration.json"));
  const tdBeatsBaselines = (() => {
    const h = tdReceipt?.heldOut2025;
    if (!h?.model?.logLoss) return false;
    return Object.values(h.baselines ?? {}).every((b) => h.model.logLoss < b.logLoss);
  })();

  const families = {};
  const players = [];

  /* Which markets the engine actually computed rows for in THIS event — an ESTIMATE family must
     have real distributions behind it; a family with no rows stays WITHHELD whatever its state. */
  const computedMarkets = new Set();
  for (const tv of Object.values(doc.research?.perTeam ?? {})) {
    for (const pl of tv.props?.players ?? []) for (const m of Object.keys(pl.markets ?? {})) computedMarkets.add(m);
  }
  const ESTIMATE_CAVEAT = {
    player_pass_yds: "on held-out 2025 a simple rolling recent-form baseline predicted passing yards better than this model — read the line as a rough indication, not a validated forecast.",
    player_rush_yds: "its uncertainty calibration failed the preregistered bar — the range shown may be mis-sized even where the middle is reasonable.",
  };
  for (const [market, promo] of Object.entries(promotion ?? {})) {
    const bars = promo.evidence
      ? Object.entries(promo.evidence).filter(([k, v]) => v === false).map(([k]) => k).join(", ")
      : "no separate evaluation";
    if (promo.state === "PUBLIC_ELIGIBLE") {
      families[market] = { label: PROP_LABEL[market] ?? market, state: "PUBLISHED", basis: `props-v1 evaluation: n=${promo.evidence?.n}, all promotion bars pass` };
    } else if (computedMarkets.has(market)) {
      families[market] = {
        label: PROP_LABEL[market] ?? market,
        state: "ESTIMATE",
        reason: `${promo.state}${bars ? ` — failed bar(s): ${bars}` : ""}`.trim(),
        caveat: `Unvalidated estimate, displayed for completeness: ${ESTIMATE_CAVEAT[market] ?? "this family failed the named evaluation bar(s)."} Never a pick and never product-eligible.`,
      };
    } else {
      families[market] = { label: PROP_LABEL[market] ?? market, state: "WITHHELD", reason: `${promo.state}${bars ? ` — failed bar(s): ${bars}` : ""}`.trim() };
    }
  }
  families.anytime_td = tdBeatsBaselines
    ? { label: "Anytime touchdown", state: "PUBLISHED", basis: `anytime-td-v1 calibration: held-out 2025 n=${tdReceipt.heldOut2025.n}, beats both baselines; DNP settles void, so probabilities condition on playing` }
    : { label: "Anytime touchdown", state: "WITHHELD", reason: "no calibration receipt beating its baselines" };
  families.ordered_td = { label: "First/last/2+ touchdown", state: "WITHHELD", reason: "DISABLED — no ordering model and no calibration receipt of their own; never derived from anytime probabilities" };

  const publishedMarkets = new Set(Object.entries(families).filter(([, f]) => f.state === "PUBLISHED" || f.state === "ESTIMATE").map(([m]) => m));

  for (const [abbr, tv] of Object.entries(doc.research?.perTeam ?? {})) {
    const props = tv.props;
    if (props?.state === "SIMULATED") {
      for (const pl of props.players ?? []) {
        const markets = {};
        for (const [m, dist] of Object.entries(pl.markets ?? {})) {
          if (!publishedMarkets.has(m)) continue;
          markets[m] = { mean: dist.mean, p10: dist.p10, p25: dist.p25, median: dist.median, p75: dist.p75, p90: dist.p90 };
        }
        if (Object.keys(markets).length === 0) continue;
        players.push({ playerId: pl.playerId, name: pl.name, team: abbr, participation: pl.participation ?? "AVAILABLE_ROLE_UNCERTAIN", markets });
      }
    }
    const atd = tv.anytimeTdBoard;
    if (publishedMarkets.has("anytime_td") && atd?.topRows?.length) {
      for (const row of atd.topRows) {
        const existing = players.find((p) => p.playerId === row.playerId && p.team === abbr);
        /* The board's field is modelProbability (calibrated anytime-TD probability, conditioned on
           playing — DNP voids). An INACTIVE row is still published WITH that state: the reader
           sees why the number may go void rather than the row silently vanishing. */
        const tdBlock = { probability: row.modelProbability ?? null, participation: row.participation ?? "AVAILABLE_ROLE_UNCERTAIN" };
        if (tdBlock.probability == null) continue;
        if (existing) {
          existing.markets.anytime_td = tdBlock;
          /* One player, one availability state: the TD board consumes the injuries-fed role
             evidence and can know INACTIVE/QUESTIONABLE where the props row defaulted — the
             strongest evidence wins on the row. */
          const RANK = { INACTIVE: 3, QUESTIONABLE: 2, ACTIVE_PROJECTED: 1, AVAILABLE_ROLE_UNCERTAIN: 0 };
          if ((RANK[tdBlock.participation] ?? 0) > (RANK[existing.participation] ?? 0)) existing.participation = tdBlock.participation;
        }
        else players.push({ playerId: row.playerId, name: row.name, team: abbr, participation: row.participation ?? "AVAILABLE_ROLE_UNCERTAIN", markets: { anytime_td: tdBlock } });
      }
    }
  }

  /* The designation join: the strongest evidence wins on every row, not only on rows the TD board
     happened to rank. Runs BEFORE the withholding pass below, which is what acts on it. */
  const RANK = { INACTIVE: 3, QUESTIONABLE: 2, ACTIVE_PROJECTED: 1, AVAILABLE_ROLE_UNCERTAIN: 0 };
  for (const pl of players) {
    const designated = designationByPlayer.get(`${pl.team}:${pl.playerId}`);
    if (designated && (RANK[designated] ?? 0) > (RANK[pl.participation] ?? 0)) pl.participation = designated;
  }

  /*
   * CONFIRMED ABSENCE CONDITIONS THE OUTPUT (the charter's direction test, applied at publication):
   * a volume distribution for an injury-listed INACTIVE player is a projection of a game he is
   * not expected to play — misleading however labelled. Volume markets are withheld for INACTIVE
   * players (the family note explains); the anytime-TD probability stays, because that market
   * settles VOID on DNP and the number is explicitly conditioned on playing.
   */
  for (const pl of players) {
    if (pl.participation === "INACTIVE") {
      for (const m of Object.keys(pl.markets)) {
        if (m !== "anytime_td") delete pl.markets[m];
      }
      pl.volumeNote = "listed inactive/out — volume projections withheld; the touchdown probability conditions on playing and settles void otherwise";
    }
  }
  const cleaned = players.filter((p) => Object.keys(p.markets).length > 0);
  players.length = 0; players.push(...cleaned);

  const artifact = {
    schemaVersion: 1,
    artifact: "nfl-player-board",
    dataClass: "PUBLIC_DERIVED",
    generatedAt: NOW,
    sourceGeneratedAt: doc.generatedAt,
    providerEventId: doc.providerEventId,
    matchup: doc.matchup,
    kickoffUtc: doc.kickoffUtc,
    seasonType: doc.seasonType,
    week: doc.week,
    participationBasis: "No authorized actives feed publishes this far out: every projection conditions on the role evidence's availability state (injury-listed players are marked; everyone else is AVAILABLE_ROLE_UNCERTAIN) and refreshes until kickoff.",
    families,
    /* New arrivals per team: factual prior-club per-game usage for notable movers the stint rule
       cannot yet place. NOT part of the simulated numbers, and each row says so. */
    newArrivals: newArrivalsByEvent.get(doc.providerEventId) ?? {},
    players: players.sort((a, b) => (b.markets.anytime_td?.probability ?? 0) - (a.markets.anytime_td?.probability ?? 0) || (b.markets.player_rush_yds?.mean ?? 0) - (a.markets.player_rush_yds?.mean ?? 0)),
    disclaimer: "Experimental, educational, paper-only. Validated families carry plain numbers under their evaluation receipts; families marked ESTIMATE failed a bar and say which — not picks, and not shown to out-predict any sportsbook.",
  };
  const payload = JSON.stringify(artifact, null, 1);
  for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "p171-ledger"]) {
    if (payload.includes(banned)) { console.error(`REFUSED: player board would carry "${banned}"`); process.exit(3); }
  }
  fs.writeFileSync(path.join(outDir, `${doc.providerEventId}.json`), payload);
  publishedBoards += 1;
  index.push({ providerEventId: doc.providerEventId, matchup: doc.matchup, kickoffUtc: doc.kickoffUtc, players: artifact.players.length });
}

fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify({
  schemaVersion: 1, artifact: "nfl-player-board-index", dataClass: "PUBLIC_DERIVED", generatedAt: NOW, boards: index,
}, null, 1));
console.log(`nfl player board: ${publishedBoards} event board(s) published · families gated by their own receipts`);
