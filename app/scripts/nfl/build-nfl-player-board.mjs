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

  for (const [market, promo] of Object.entries(promotion ?? {})) {
    if (promo.state === "PUBLIC_ELIGIBLE") {
      families[market] = { label: PROP_LABEL[market] ?? market, state: "PUBLISHED", basis: `props-v1 evaluation: n=${promo.evidence?.n}, all promotion bars pass` };
    } else {
      const bars = promo.evidence
        ? Object.entries(promo.evidence).filter(([k, v]) => v === false).map(([k]) => k).join(", ")
        : "no separate evaluation";
      families[market] = { label: PROP_LABEL[market] ?? market, state: "WITHHELD", reason: `${promo.state}${bars ? ` — failed bar(s): ${bars}` : ""}`.trim() };
    }
  }
  families.anytime_td = tdBeatsBaselines
    ? { label: "Anytime touchdown", state: "PUBLISHED", basis: `anytime-td-v1 calibration: held-out 2025 n=${tdReceipt.heldOut2025.n}, beats both baselines; DNP settles void, so probabilities condition on playing` }
    : { label: "Anytime touchdown", state: "WITHHELD", reason: "no calibration receipt beating its baselines" };
  families.ordered_td = { label: "First/last/2+ touchdown", state: "WITHHELD", reason: "DISABLED — no ordering model and no calibration receipt of their own; never derived from anytime probabilities" };

  const publishedMarkets = new Set(Object.entries(families).filter(([, f]) => f.state === "PUBLISHED").map(([m]) => m));

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
    players: players.sort((a, b) => (b.markets.anytime_td?.probability ?? 0) - (a.markets.anytime_td?.probability ?? 0) || (b.markets.player_rush_yds?.mean ?? 0) - (a.markets.player_rush_yds?.mean ?? 0)),
    disclaimer: "Experimental, educational, paper-only. Model projections under their own evaluation receipts — not picks, and not shown to beat any sportsbook market.",
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
