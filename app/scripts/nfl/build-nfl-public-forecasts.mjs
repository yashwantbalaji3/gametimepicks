/**
 * NFL public-beta forecasts (Program 173 · Release A3). PUBLIC_EXPERIMENTAL.
 *
 * One deterministic pre-kickoff forecast per eligible game, published under
 * nfl-preseason-public-beta-v1 with its calibration applied. Everything a reader sees derives
 * from ONE joint score distribution, so win probability, projected score, margin and total can
 * never disagree with each other.
 *
 * FROZEN AT GENERATION. The seed is model version + event id + input hash, so identical inputs
 * reproduce identical bytes. Market prices are carried alongside for comparison and are NOT an
 * input to the simulation — changing odds moves the comparison column and never the forecast.
 *
 * REFUSALS (each typed, never a silent omission or a zero): post-start generation, missing
 * identity, evidence stamped at/after kickoff, and an already-published event whose artifact is
 * locked. After kickoff an artifact is immutable.
 *
 * Usage: node scripts/nfl/build-nfl-public-forecasts.mjs --now <iso> [--lookahead-hours 30]
 * Writes: app/public/data/nfl/forecasts/<date>.json  (PUBLIC — derived, no research payload)
 *         data/internal/nfl/forecast-receipts/<date>/<eventId>.json (immutable receipt)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { mulberry32, snapScore, simulateNflGame } from "../../src/lib/sports/nfl/game-sim.mjs";
import { totalsStateAt, NFL_TOTALS_HEAD_ID } from "../../src/lib/sports/nfl/totals-rating.mjs";
import {
  foldTotalsV3, totalsV3Gate, totalsV3Coverage, gamesFromTable, etDateOf, toNflverseAbbr, NFL_TOTALS_V3_HEAD_ID,
  TOTALS_REPLAY_RECEIPT, TOTALS_REPLAY_PREREG, GAMES_HISTORY, EFFICIENCY_HISTORY, CURRENT_SEASON,
} from "../../src/lib/sports/nfl/totals-play-efficiency.mjs";
import {
  winMarginGate, rowsFromTable, foldWinMarginHeads, winMarginCoverage, adoptedHeadsFor,
  NFL_WIN_HEAD_ID, NFL_MARGIN_HEAD_ID, WIN_MARGIN_RECEIPT, WIN_MARGIN_PREREG, GAMES_HISTORY_V2,
} from "../../src/lib/sports/nfl/win-margin-heads.mjs";
import { fnv1a } from "../../src/lib/sports/research/replay-runner.mjs";
import { strengthStateAt, ELO_PARAMS } from "../../src/lib/sports/nfl/strength-state.mjs";
import { coherentDirection } from "../../src/lib/sports/nfl/coherence.mjs";
import { rowCapturedAt } from "../../src/lib/sports/odds/capture-merge.mjs";
import { publishedMarginInterval } from "../../src/lib/sports/nfl/margin-interval-shadow.mjs";

/* A narrow root seam so tests can run THIS builder — not a copy of its rules — against a
 * disposable repo-shaped store. Production default is unchanged: the app directory above this
 * file. The seam cannot change what publishes: every model input is still read from the
 * (relocated) committed receipts, and the banned-string scan still runs on the payload. */
const APP = (() => {
  const i = process.argv.indexOf("--app-root");
  return i > -1 && process.argv[i + 1]
    ? path.resolve(process.argv[i + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
})();
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
/**
 * P246 · SCORE DISPLAY CONVENTION ("scores-derived-from-total-and-margin-v1")
 *
 * The projected team scores shown to a reader are DERIVED from the pair the model actually
 * publishes — the median total and the median margin — not the two marginal score medians.
 * Marginal medians need not be consistent with the joint medians: on the 2026 Week 1 slate,
 * five of sixteen games disagreed (GB @ MIN printed 25 + 21 = 46 beside a median total of 45).
 * home = round((total + margin) / 2), away = total − home, so the pieces ALWAYS add up to the
 * printed total and their difference is within 1 of the printed margin. The marginal per-team
 * ranges stay marginal in scoreRange — only the two headline integers use this convention.
 */
/*
 * P294 · THE ROUNDING ERASED THE SIGN OF A ONE-POINT MARGIN.
 *
 * `home = round((total + margin) / 2)` cannot represent an odd difference against an even total, and
 * it resolved the conflict by dropping the margin entirely. On the 2026 Week 1 slate that printed
 * three TIES out of fourteen:
 *
 *     MIA @ LV   total 44, margin −1  →  22 — 22
 *     DEN @ KC   total 44, margin −1  →  22 — 22
 *
 * A reader sees "DEN 22 — 22 KC" and reads a predicted tie. NFL games essentially never tie: the
 * committed corpus has ONE in 855 games (0.12%). Worse, the model did say something — the away side
 * is favoured by a point — and the display said dead level, which is the one thing the model did not
 * say.
 *
 * Both integers cannot honour an odd margin on an even total, so the convention now spends its one
 * point of slack on the SIGN rather than the magnitude: the printed difference always leans the way
 * the margin leans. "DEN 23 — 21 KC" overstates a one-point edge by a point; "22 — 22" inverts a
 * statement about who is favoured into a statement that nobody is.
 *
 * A margin of exactly 0 still prints a level score, because that is precisely what the model says.
 */
const SCORE_DISPLAY_CONVENTION = "scores-derived-from-total-and-margin-v1";
function derivedProjectedScore(totalMedian, marginMedian) {
  let home = Math.round((totalMedian + marginMedian) / 2);
  let away = totalMedian - home;
  if (marginMedian !== 0 && Math.sign(home - away) !== Math.sign(marginMedian)) {
    /* One point, moved across the pair so the total is preserved exactly. */
    home += Math.sign(marginMedian);
    away = totalMedian - home;
  }
  return { home, away, convention: SCORE_DISPLAY_CONVENTION };
}

const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "30"));
const RUNS = Number(arg("--runs", "10000"));
const DATE = NOW.slice(0, 10);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const cal = read(path.join(ROOT, "data/internal/research/nfl/reports/public-beta-v1-calibration.json"));
const card = read(path.join(ROOT, "data/internal/research/nfl/public-beta-model-card-v1.json"));
if (!cal || !card) { console.error("REFUSED: no committed public-beta calibration — a forecast may not publish without its card"); process.exit(2); }
const MODEL_ID = cal.modelId;
const base = read(path.join(ROOT, "data/internal/research/nfl/reports/preseason-model-v1-evaluation.json")).fit;
const sigmaMargin = cal.calibration.sigmaMarginCalibrated;
const sigmaTotal = cal.calibration.sigmaTotalCalibrated;
const LAMBDA = cal.calibration.signalShrinkLambda;

// ── P178-C · THE SIGNIFICANCE GATE ────────────────────────────────────────────────────────────
// The team-strength term drives a published forecast only when its coefficient is distinguishable
// from zero. It is not: t = -0.575, 95% CI [-0.078, +0.043]. Applying it anyway produced a -0.97
// correlation between a home side's strength and its published win probability — the model leaned
// AGAINST the better team, consistently, on evidence that does not exist.
//
// Zeroing the term is not a claim that the teams are equal. It is the honest statement that this
// model cannot tell them apart, which is a different and much more publishable thing than a
// confident-looking number pointing the wrong way.
const sig = read(path.join(ROOT, "data/internal/research/nfl/reports/signal-significance.json"));
if (!sig) { console.error("REFUSED: no signal-significance receipt — a forecast may not publish a team term that has never been tested"); process.exit(2); }
const TEAM_SIGNAL_APPLIED = sig.significant === true;
const EFFECTIVE_SLOPE = TEAM_SIGNAL_APPLIED ? base.marginSlope : 0;
const TEAM_SIGNAL = TEAM_SIGNAL_APPLIED
  ? { state: "APPLIED", tStatistic: sig.fitted.tStatistic, note: "the team-strength coefficient clears the |t| >= 2 bar, so team evidence moves this forecast" }
  : {
      state: "NOT_SIGNIFICANT",
      tStatistic: sig.fitted.tStatistic,
      ci95: sig.fitted.ci95,
      note: "This model has no measurable read on which of these two teams is better in preseason: the coefficient linking team strength to margin is indistinguishable from zero (t = " + sig.fitted.tStatistic + ", 95% interval " + JSON.stringify(sig.fitted.ci95) + "). Rather than publish a direction it cannot support, the team term is set to zero, so this forecast reflects preseason scoring and home context only.",
    };
console.log(`team signal: ${TEAM_SIGNAL.state} (t=${sig.fitted.tStatistic}) → effective slope ${TEAM_SIGNAL_APPLIED ? base.marginSlope : 0}`);

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;
const markets = read(path.join(APP, "public/data/nfl/markets/latest.json"));
const marketByEvent = new Map((markets?.rows ?? []).map((r) => [r.providerEventId, r]));

const nowMs = Date.parse(NOW);
/*
 * P244 · Release A: THE POPULATION IS THE CURRENT WEEK, NOT A CLOCK WINDOW.
 *
 * NFL's natural period is season/phase/week (the same rule that moved EPL to its official
 * matchweek in P243). The old hour lookahead delivered a week in slices: at T-18h the workflow
 * saw only the opener, published one forecast, and fifteen games of the same official week sat
 * schedule-only for days. Eligibility is now every pre-start scheduled event of the CURRENT
 * week — the earliest (seasonType, week) pair with an unplayed game — and the hour lookahead
 * survives only as a backstop for rows carrying no week at all.
 *
 * Model semantics are unchanged: strength is fit strictly to finals before --now, each event's
 * receipt is immutable with pre-kickoff revisions on later refreshes, and settlement grades the
 * latest pre-kickoff revision. Generating earlier is an earlier honest snapshot, refreshed by
 * every later run until kickoff.
 */
const preStart = (schedule?.rows ?? []).filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs);
const currentPeriod = (() => {
  const withWeek = preStart.filter((r) => r.seasonType != null && r.week != null);
  if (!withWeek.length) return null;
  return withWeek.reduce((best, r) =>
    !best || r.seasonType < best.seasonType || (r.seasonType === best.seasonType && r.week < best.week) ? r : best,
  null);
})();
const events = preStart
  .filter((r) =>
    currentPeriod
      ? (r.seasonType === currentPeriod.seasonType && r.week === currentPeriod.week)
        || Date.parse(r.dateUtc) <= nowMs + LOOKAHEAD_H * 3.6e6
      : Date.parse(r.dateUtc) <= nowMs + LOOKAHEAD_H * 3.6e6)
  .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
console.log(
  currentPeriod
    ? `population: ${events.length} pre-start event(s) of seasonType ${currentPeriod.seasonType} week ${currentPeriod.week} (+${LOOKAHEAD_H}h backstop) at ${NOW}`
    : `window: ${events.length} pre-start events within ${LOOKAHEAD_H}h of ${NOW} (no week metadata on the schedule)`,
);

/*
 * ── P240 · THE REGULAR SEASON PUBLISHES UNDER ITS OWN, ALREADY-EVALUATED IDENTITY ──────────────
 *
 * This builder was preseason-hardwired: no seasonType branch existed, so the first Week 1 window
 * would have published regular-season games under the preseason card — coin-flip win head,
 * preseason-fitted sigmas, and copy citing a held-out preseason those games were never part of.
 * The status artifact's own REGULAR_SEASON_ELIGIBLE branch had promised the opposite: "the
 * evaluated regular-season model applies to this window."
 *
 * The regular path below reuses, without refitting, the two engines whose receipts are committed:
 * nfl-model-v1-elo-analytic (train 2023–24, held-out 2025: log loss 0.6478 vs coin 0.6931) through
 * nfl-gamesim-v1-joint-normal (sim == analytic within 1e-4; 80% intervals covered 80.15%). Frozen
 * params from the evaluation receipt; Elo state folded chronologically over the committed corpus
 * plus any joined current-season finals, with the protocol's one-third season-boundary regression
 * applied explicitly for a target season no final has reached yet. No preseason significance gate
 * here — that receipt measured a preseason fit, and the frozen regular-season contract's cohort
 * rule keeps the phases' evidence apart in BOTH directions. Promotion beyond PUBLIC_EXPERIMENTAL
 * belongs to that contract alone; nothing in this file can satisfy it.
 */
const rsEval = read(path.join(ROOT, "data/internal/research/nfl/reports/model-v1-evaluation.json"));
/* The preregistered margin-interval challenger, graded in shadow on every settled regular-season game
 * (scripts/nfl/evaluate-margin-interval-shadow.mjs). Its band is published ONLY when the frozen
 * regular-season contract has promoted it; a missing or unreadable report keeps the incumbent. */
const marginShadow = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/reports/margin-interval-shadow-latest.json"), "utf8")); } catch { return null; }
})();
/*
 * P246 §4B-NFL: the matchup totals head — adopted ONLY on an ELIGIBLE receipt (preregistered
 * bars, held-out 2025: NLL 4.029 < prior 4.049, cov80 0.786, MAE under cap). An absent or
 * rejected receipt leaves the declared shared prior in place, byte-identically. The margin
 * head is untouched either way. NOTE: the per-game PLAYER simulation chain still runs on the
 * evaluated constant-total head its own receipt measured (re-evaluation under this head is a
 * named follow-up) — a typed divergence, recorded here rather than hidden.
 */
const totalsReceipt = (() => {
  const p0 = path.join(ROOT, "data/internal/research/nfl/reports/matchup-totals-evaluation.json");
  return fs.existsSync(p0) ? read(p0) : null;
})();
/*
 * P295 · THE TOTALS HEAD IS v3 PLAY-EFFICIENCY — WHEN ITS EVIDENCE IS COMPLETE.
 *
 * v1 carried a +1.8-point bias on every game (a centring constant frozen at its 2023-24 fit). The
 * historical replay scored v3 once, on 5,878 held-out games (2000–2021), under a registration committed
 * before scoring: ELIGIBLE — centred within a point in every era, lower error than the league-level
 * baseline in every era and than v2 overall. totals-play-efficiency.test.mjs proves the fold used here
 * reproduces that receipt season by season, so what publishes is what was scored.
 *
 * v3 folds this season's nflverse finals and play-by-play. Per game: if any official final before that
 * game's date is missing from the fold (nflverse not yet updated, a failed capture), or either team has
 * no rating, the forecast falls back to v1 and the artifact names why. v2 was REJECTED by the same
 * receipt and is never used.
 *
 * STILL A TYPED DIVERGENCE: the player-props chain (run-nfl-event-window.mjs) draws game totals from v1,
 * the head its ACCEPTED integration verdict measured. Moving it to v3 needs its own evaluation.
 */
const totalsV3 = (() => {
  const gate = totalsV3Gate(read(path.join(ROOT, TOTALS_REPLAY_RECEIPT)), read(path.join(ROOT, TOTALS_REPLAY_PREREG)));
  if (gate.state !== "READY") return gate;
  const history = read(path.join(ROOT, GAMES_HISTORY));
  const effHistory = read(path.join(ROOT, EFFICIENCY_HISTORY));
  if (!history?.games?.length || !effHistory?.rows?.length) return { state: "REFUSED", reason: "the committed game or play-efficiency history is unreadable" };
  const current = read(path.join(ROOT, CURRENT_SEASON));
  const captured = current?.state === "CAPTURED";
  const lastHistorySeason = history.seasons[1];
  return {
    ...gate,
    games: [...gamesFromTable(history), ...(captured ? gamesFromTable(current).filter((g) => g.season > lastHistorySeason) : [])],
    efficiencyRows: [...effHistory.rows, ...(captured ? current.efficiencyRows.filter((r) => r.season > lastHistorySeason) : [])],
  };
})();
console.log(`totals head: ${totalsV3.state === "READY" ? `v3 ready (${totalsV3.games.length} finals on file)` : `v3 refused — ${totalsV3.reason}`}`);

/*
 * P298 · THE WIN AND MARGIN HEADS ADOPTED FROM THE P297 REPLAY.
 *
 * The published win head (cutoff Elo, K20, +48 home) scored 0.6420 on held-out 2006–2021 — 0.032 worse
 * than the no-vig market, past the frozen contract's own 0.02 stop line. P297 scored three candidates once
 * under a registration committed first: the margin-of-victory Elo WIN head was ELIGIBLE (0.6291, better in
 * every era, calibration 0.018 vs 0.035) and the refit-home-advantage MARGIN head was ELIGIBLE (MAE 10.79,
 * 80% coverage in band in every era). win-margin-heads.test.mjs proves the fold below reproduces both.
 *
 * Per game the pair publishes only when: both receipts' verdicts stand, every official final of this season
 * before the game's day is folded, both teams are rated, the venue is known, and the two heads favour the
 * same side. Otherwise the incumbent single-rating pair publishes and the artifact names why. The rejected
 * halves (eloMov's margin, eloHfaRefit's win) are never used. Labelling stays PUBLIC_EXPERIMENTAL: the frozen
 * regular-season contract owns every stronger label.
 */
const winMargin = (() => {
  const gate = winMarginGate(read(path.join(ROOT, WIN_MARGIN_RECEIPT)), read(path.join(ROOT, WIN_MARGIN_PREREG)));
  if (gate.win.state !== "READY" || gate.margin.state !== "READY") {
    return { state: "REFUSED", reason: gate.win.state !== "READY" ? gate.win.reason : gate.margin.reason };
  }
  const history = read(path.join(ROOT, GAMES_HISTORY_V2));
  if (!history?.games?.length) return { state: "REFUSED", reason: "the committed game history is unreadable" };
  const current = read(path.join(ROOT, CURRENT_SEASON));
  const captured = current?.state === "CAPTURED" && (current.columns ?? []).includes("homeScore");
  const lastHistorySeason = history.seasons[1];
  const currentRows = captured ? rowsFromTable(current).filter((g) => g.season > lastHistorySeason) : [];
  return {
    state: "READY",
    gate,
    games: [...rowsFromTable(history), ...currentRows],
    /* ESPN's schedule carries no neutral flag; the season capture lists every neutral-site game by ESPN id.
       Without a capture the venue is unknown, and an unknown venue is never guessed. */
    neutralEspnIds: captured ? new Set((current.neutralEspnIds ?? []).map(String)) : null,
  };
})();
console.log(`win/margin heads: ${winMargin.state === "READY" ? `ready (${winMargin.games.length} finals on file)` : `refused — ${winMargin.reason}`}`);
const rsCard = read(path.join(ROOT, "data/internal/research/nfl/regular-season-public-card-v1.json"));
// Only RESOLVED phases join the window question: a row with no seasonType is refused per-event
// below (PHASE_UNRESOLVED), and letting its absence into this set would turn one broken row into
// a whole-run refusal.
const windowSeasonTypes = new Set(events.map((e) => e.seasonType).filter((t) => t != null));
// The card also labels an EMPTY window's artifact, so the phase question includes the schedule
// ahead of the window, not only the events inside it.
const scheduleHasRegularAhead = (schedule?.rows ?? []).some((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs && r.seasonType != null && r.seasonType !== 1);
const windowHasRegular = events.some((e) => e.seasonType != null && e.seasonType !== 1) || (events.length === 0 && scheduleHasRegularAhead);
if (windowHasRegular && (!rsEval?.fitParams || !rsCard)) {
  console.error("REFUSED: regular-season events are in the window but the evaluated fit or public card is unreadable — a forecast may not publish without its receipts");
  process.exit(2);
}
if (windowSeasonTypes.size > 1) {
  // Never happens on the real calendar (phases do not interleave inside one lookahead window);
  // if it ever does, publishing both under one top-level card would mislabel one of them.
  console.error(`REFUSED: window straddles season phases (${[...windowSeasonTypes].join(",")}) — one artifact publishes under one card`);
  process.exit(4);
}
const windowIsPreseason = windowSeasonTypes.size === 1 && windowSeasonTypes.has(1);

/** NFL season of a kickoff: August onward belongs to that calendar year's season; January–July
 * games (playoffs, Super Bowl) belong to the season that started the PRIOR August. */
const nflSeasonOf = (iso) => {
  const d = new Date(Date.parse(iso));
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};

/** Corpus finals plus joined current-season finals, one name-keyed row space, deduplicated by
 * provider event id (the corpus ends at the 2026-02-08 Super Bowl; results captures carry the
 * season as it happens). Preseason rows are carried through — the fold itself refuses them. */
const mergedFinals = (() => {
  const byId = new Map();
  for (const r of finals) byId.set(String(r.providerEventId ?? `${r.dateUtc}:${r.home}`), r);
  const resultsArtifact = read(path.join(APP, "public/data/nfl/results/latest.json"));
  for (const r of resultsArtifact?.rows ?? []) {
    if (!/^STATUS_FINAL/.test(r.statusRaw ?? "")) continue;
    if (!Number.isInteger(r.ftHome) || !Number.isInteger(r.ftAway)) continue;
    const id = String(r.providerEventId ?? "");
    if (!id || byId.has(id)) continue;
    const homeName = typeof r.home === "string" ? r.home : r.home?.name;
    const awayName = typeof r.away === "string" ? r.away : r.away?.name;
    if (!homeName || !awayName || !r.dateUtc) continue;
    byId.set(id, {
      providerEventId: id,
      season: nflSeasonOf(r.dateUtc),
      seasonType: r.seasonType ?? null,
      dateUtc: r.dateUtc,
      home: homeName,
      away: awayName,
      ftHome: r.ftHome,
      ftAway: r.ftAway,
      statusRaw: r.statusRaw,
    });
  }
  return [...byId.values()];
})();

const normalPair = (rng) => {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
};
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const sortNum = (xs) => [...xs].sort((x, y) => x - y);

const published = [];
const refused = [];
for (const ev of events) {
  const kickoff = Date.parse(ev.dateUtc);
  if (!ev.home?.abbr || !ev.away?.abbr) { refused.push({ providerEventId: ev.providerEventId, state: "IDENTITY_MISSING", reason: "participants unresolved — identity is never guessed" }); continue; }
  if (ev.seasonType == null) { refused.push({ providerEventId: ev.providerEventId, state: "PHASE_UNRESOLVED", reason: "no seasonType on the schedule row — the phase decides which evaluated model applies, and it is never guessed" }); continue; }

  const market = marketByEvent.get(ev.providerEventId) ?? null;
  /* The ROW's own stamp, not the document's: rows outlive a single capture now (a game priced
     before kickoff is carried forward when a later run no longer covers it), so the document's
     stamp would be a claim about prices it did not take. */
  const marketCapturedAt = rowCapturedAt(market, markets);
  const marketFresh = market && marketCapturedAt && marketCapturedAt < ev.dateUtc;
  const marketComparison = marketFresh
    ? {
      state: "MARKET_VIEW",
      capturedAt: marketCapturedAt,
      books: market.books.length,
      marketHomeWinPct: market.consensus.homeWinProbNoVig,
      marketSpreadHome: market.consensus.spreadHome,
      marketTotal: market.consensus.total,
      note: "The sportsbook numbers are the books' own, shown for context. A difference is a difference — this model has not been shown to beat the market.",
    }
    : { state: "NO_MARKET", note: "No current sportsbook capture covers this game." };

  let forecast;
  if (ev.seasonType !== 1) {
    // ── the regular-season path: the evaluated engines, frozen params, explicit boundary ───────
    const nameOf = new Map([[ev.home.abbr, ev.home.name], [ev.away.abbr, ev.away.name]]);
    const targetSeason = nflSeasonOf(ev.dateUtc);
    const strength = strengthStateAt({
      rows: mergedFinals.filter((r) => r.dateUtc < ev.dateUtc),
      cutoffIso: NOW,
      regressToSeason: targetSeason,
    });
    // The ratings map is keyed by full team name (the corpus rows); the schedule row speaks abbr.
    const wrapped = { ...strength, ratingFor: (t) => strength.ratingFor(nameOf.get(t) ?? t) };
    /*
     * Matchup totals, walk-forward. P295: v3 play-efficiency when its gate is READY, every official final
     * of this season before this game's Eastern date is folded with its play data, and both teams are
     * rated; otherwise v1, with the reason carried into the artifact. v1 folds finals strictly before THIS
     * kickoff; v3 folds whole game days strictly before this game's day, exactly as it was scored.
     */
    /* Fold whole days strictly before BOTH the game's day and the run's own day: a regeneration pinned to
       an earlier --now must never fold a final that had not been played yet at that instant, even when a
       later capture carries it. Live, the capture holds only what exists, so this changes nothing. */
    const foldBefore = [etDateOf(ev.dateUtc), etDateOf(NOW)].sort()[0];
    const homeV3 = toNflverseAbbr(ev.home.abbr);
    const awayV3 = toNflverseAbbr(ev.away.abbr);
    let v3State = null;
    let v3FallbackReason = null;
    if (totalsV3.state !== "READY") {
      v3FallbackReason = totalsV3.reason;
    } else {
      const seasonFinals = mergedFinals.filter((r) => r.season === targetSeason && r.seasonType != null && r.seasonType !== 1 && /^STATUS_FINAL/.test(r.statusRaw ?? ""));
      const coverage = totalsV3Coverage({ games: totalsV3.games, efficiencyRows: totalsV3.efficiencyRows, officialFinals: seasonFinals, beforeDate: foldBefore, frozen: totalsV3.frozen });
      if (!coverage.complete) {
        v3FallbackReason = `this season's play-by-play is incomplete before ${foldBefore}: ${coverage.missingGames.length} official final(s) not yet published by nflverse, ${coverage.missingEfficiency.length} without play data`;
      } else {
        const folded = foldTotalsV3({ games: totalsV3.games, efficiencyRows: totalsV3.efficiencyRows, frozen: totalsV3.frozen, fit: totalsV3.fit, beforeDate: foldBefore });
        const unrated = [homeV3, awayV3].filter((t) => !folded.hasTeam(t));
        if (unrated.length) v3FallbackReason = `no play-efficiency rating history for ${unrated.join(" and ")}`;
        else v3State = folded;
      }
    }
    const totalsState = v3State
      ? null
      : totalsReceipt
        ? totalsStateAt({ rows: mergedFinals, cutoffIso: ev.dateUtc, receipt: totalsReceipt })
        : { state: "REFUSED", reason: "no totals receipt on file" };
    const matchupTotals = v3State
      ? { muTotal: v3State.muFor(homeV3, awayV3), sigmaTotal: v3State.sigma }
      : totalsState.state === "READY"
        ? { muTotal: totalsState.muFor(ev.home.name, ev.away.name), sigmaTotal: totalsState.sigma }
        : null;
    const totalsHeadId = v3State ? NFL_TOTALS_V3_HEAD_ID : matchupTotals ? NFL_TOTALS_HEAD_ID : "shared-prior";
    const rsFit = { params: matchupTotals ? { ...rsEval.fitParams, ...matchupTotals } : rsEval.fitParams };

    /* P298: the adopted win + margin pair for THIS game, or the incumbent single-rating pair and the reason.
       Same fold bound as the totals head (strictly before both the game's day and the run's day). */
    let heads = null;
    let headsFallbackReason = null;
    let headsFold = null;
    if (winMargin.state !== "READY") {
      headsFallbackReason = winMargin.reason;
    } else if (!winMargin.neutralEspnIds) {
      headsFallbackReason = "this season's venue list is unavailable, so whether the game is at a neutral site is unknown";
    } else {
      const seasonFinalsWM = mergedFinals.filter((r) => r.season === targetSeason && r.seasonType != null && r.seasonType !== 1 && /^STATUS_FINAL/.test(r.statusRaw ?? ""));
      const cov = winMarginCoverage({ games: winMargin.games, officialFinals: seasonFinalsWM, beforeDate: foldBefore });
      if (!cov.complete) {
        headsFallbackReason = `this season's results are incomplete before ${foldBefore}: ${cov.missingGames.length} official final(s) not yet published by nflverse`;
      } else {
        headsFold = foldWinMarginHeads({ games: winMargin.games, gate: winMargin.gate, beforeDate: foldBefore, targetSeason });
        const pick = adoptedHeadsFor({ fold: headsFold, home: ev.home.abbr, away: ev.away.abbr, neutral: winMargin.neutralEspnIds.has(String(ev.providerEventId)) });
        if (pick.state === "READY") heads = pick;
        else headsFallbackReason = pick.reason;
      }
    }

    const sim = simulateNflGame({ fit: rsFit, strengthState: wrapped, event: ev, artifactDate: DATE, runs: RUNS, heads });
    if (sim.state !== "SIMULATED") {
      refused.push({ providerEventId: ev.providerEventId, state: "SIM_ABSTAINED", reason: sim.reason ?? "the simulation abstained" });
      continue;
    }
    const dExact = wrapped.ratingFor(ev.home.abbr) + ELO_PARAMS.HOME_ADVANTAGE - wrapped.ratingFor(ev.away.abbr);
    const inputHash = crypto.createHash("md5").update(JSON.stringify({
      modelId: rsCard.modelId, version: rsCard.version, eventId: ev.providerEventId, kickoff: ev.dateUtc,
      d: Number(dExact.toFixed(6)),
      marginSlope: rsEval.fitParams.marginSlope, sigmaMargin: rsEval.fitParams.sigmaMargin,
      muTotal: rsEval.fitParams.muTotal, sigmaTotal: rsEval.fitParams.sigmaTotal,
      strengthCutoff: strength.cutoffIso, gamesFolded: strength.gamesFolded,
      regressedToSeason: strength.regressedToSeason, scheduleAsOf: schedule.generatedAt,
      /* P295: a v3 total is an input like any other. When a new final moves it, the forecast is a
         pre-kickoff REVISION with lineage, never a silent rewrite under an unchanged hash. (Absent for
         v1 so its existing receipts stay byte-identical.) */
      ...(v3State ? { totalsHead: totalsHeadId, muTotalHead: Number(matchupTotals.muTotal.toFixed(6)) } : {}),
      /* P298: the adopted win + margin numbers are inputs too — a head switch or a new final is a revision. */
      ...(heads ? { winHead: NFL_WIN_HEAD_ID, marginHead: NFL_MARGIN_HEAD_ID, pHomeHead: Number(heads.pHome.toFixed(6)), marginMeanHead: Number(heads.marginMean.toFixed(6)) } : {}),
    })).digest("hex").slice(0, 16);

    /*
     * P245 · COHERENCE, DERIVED CORRECTLY (superseding P244's 3σ patch).
     *
     * The published win probability is ANALYTIC — logistic(d)·(1−tieMass) — while the margin
     * median is SAMPLED, so "Monte Carlo noise on the probability" was the wrong justification.
     * The actual arithmetic: BOTH heads are monotone in the same Elo difference d and cross at
     * d = 0 (marginMean = slope·d; logistic(d) = ½ at d = 0). What made BAL @ IND look
     * incoherent was the THRESHOLD: pHome is P(home WIN) excluding ties, so with ~3% tie mass a
     * clear home favourite (d ≈ +11 Elo → logistic 0.516) prints pHome 0.4997 — under 0.5 while
     * pAway is 0.468. The favourite test is pHome vs pAway, never pHome vs 0.5.
     *
     * With that fixed, a genuine DIRECTION conflict between the heads is only reachable inside
     * the sampled median's own width around the shared crossover: median error ≈ 1.253·σ/√n ≈
     * 0.17 pts plus ±0.5 integer snap → |median| ≤ 1 can straddle zero honestly; |median| ≥ 2
     * with the favourite on the other side is a real contradiction and refuses.
     */
    const medMargin = sim.marginQuantiles.p50;
    const pHome = sim.winProbability.home;
    const pAway = sim.winProbability.away;
    if (!coherentDirection({ medMargin, pHome, pAway })) {
      refused.push({ providerEventId: ev.providerEventId, state: "INCOHERENT", reason: `median margin ${medMargin} disagrees with win probability ${pHome.toFixed(3)} — refusing rather than publishing two contradictory numbers` });
      continue;
    }

    forecast = {
      providerEventId: ev.providerEventId,
      canonicalEventId: `nfl-${ev.providerEventId}`,
      matchup: `${ev.away.abbr} @ ${ev.home.abbr}`,
      home: { abbr: ev.home.abbr, name: ev.home.name },
      away: { abbr: ev.away.abbr, name: ev.away.name },
      kickoffUtc: ev.dateUtc,
      seasonType: ev.seasonType,
      week: ev.week,
      venue: ev.venue ?? null,
      state: "PUBLIC_EXPERIMENTAL",
      model: {
        id: rsCard.modelId, version: rsCard.version, launchState: rsCard.launchState, inputHash, simulations: RUNS,
        derivedFrom: rsCard.derivedFrom.map((d0) => `${d0.modelId}@v${d0.version}`),
        /* Provenance by receipt NAME + stamp — a public artifact never carries an internal
           path (the boundary scan below refuses "data/internal", and it caught exactly that). */
        /* P295: which totals head moved this forecast, and — whenever v3 did NOT — why, in words. */
        totalsHead: v3State
          ? { id: NFL_TOTALS_V3_HEAD_ID, receipt: totalsV3.receiptStamp, gamesFolded: v3State.gamesFolded, foldedThrough: v3State.lastDateFolded, sigma: v3State.sigma }
          : {
            ...(matchupTotals
              ? { id: NFL_TOTALS_HEAD_ID, receipt: `${totalsReceipt.artifact}@${totalsReceipt.generatedAt}`, gamesFolded: totalsState.gamesFolded, sigma: totalsState.sigma }
              : { id: "shared-prior", reason: totalsState.reason }),
            fallbackFrom: NFL_TOTALS_V3_HEAD_ID,
            fallbackReason: v3FallbackReason,
          },
        /* P298: which win and margin heads moved this forecast — and, whenever the adopted pair did NOT, why. */
        winHead: heads
          ? { id: NFL_WIN_HEAD_ID, receipt: winMargin.gate.win.receiptStamp, gamesFolded: headsFold.win.gamesFolded, foldedThrough: headsFold.lastDateFolded }
          : { id: "nfl-model-v1-elo-analytic", fallbackFrom: NFL_WIN_HEAD_ID, fallbackReason: headsFallbackReason },
        marginHead: heads
          ? { id: NFL_MARGIN_HEAD_ID, receipt: winMargin.gate.margin.receiptStamp, gamesFolded: headsFold.margin.gamesFolded, sigma: heads.sigmaMargin }
          : { id: "nfl-model-v1-elo-analytic", fallbackFrom: NFL_MARGIN_HEAD_ID, fallbackReason: headsFallbackReason },
      },
      teamSignal: {
        state: "APPLIED",
        note: (() => {
          const wm = heads ? read(path.join(ROOT, WIN_MARGIN_RECEIPT)) : null;
          if (!wm?.results?.eloMov) {
            return `Team strength moves this forecast: the Elo-logistic win head over a ${strength.gamesFolded}-game rating history is the head the committed evaluation measured on a held-out 2025 season (log loss 0.6478 against a coin's 0.6931, about 64% of winners). It has not been shown to beat the sportsbook market.`;
          }
          const r3 = (x) => Number(x).toFixed(3);
          return `Team strength moves this forecast: the win chance comes from a team rating that weights margin of victory, tested on ${Number(wm.population.heldOutDecisive).toLocaleString("en-US")} past games it had never seen (2006–2021) — log loss ${r3(wm.results.eloMov.win.overall.logLoss)} against ${r3(wm.results.incumbent.win.overall.logLoss)} for our previous rating and ${r3(wm.results.market.win.overall.logLoss)} for the sportsbooks' own odds. It has not been shown to beat the sportsbook market.`;
        })(),
      },
      generatedAt: NOW,
      evidence: {
        schedule: schedule.generatedAt,
        strengthCutoff: strength.cutoffIso,
        strengthGamesFolded: strength.gamesFolded,
        regressedToSeason: strength.regressedToSeason,
      },
      forecastSummary: {
        projectedScore: derivedProjectedScore(sim.totalQuantiles.p50, sim.marginQuantiles.p50),
        winProbability: {
          home: sim.winProbability.home,
          away: sim.winProbability.away,
          tieMass: sim.winProbability.tie,
          homeUnrounded: sim.winProbability.homeUnrounded,
          calibration: heads
            ? "From the margin-of-victory Elo win head, published exactly as evaluated on held-out 2006–2021 — no shrink toward 50% is applied, and no claim to beat the market is made."
            : "From the replay-validated Elo-logistic head, published exactly as evaluated on a held-out 2025 season — no shrink toward 50% is applied, and no claim to beat the market is made.",
        },
        margin: (() => {
          const iv = publishedMarginInterval({ median: sim.marginQuantiles.p50, incumbentP10: sim.marginQuantiles.p10, incumbentP90: sim.marginQuantiles.p90, report: marginShadow });
          // The source is named only when it is NOT the incumbent, so an unpromoted run publishes the same bytes.
          return { median: sim.marginQuantiles.p50, p10: iv.p10, p90: iv.p90, ...(iv.source !== "incumbent" ? { intervalSource: iv.source } : {}) };
        })(),
        total: { median: sim.totalQuantiles.p50, p10: sim.totalQuantiles.p10, p90: sim.totalQuantiles.p90, head: totalsHeadId },
        scoreRange: { homeP10: sim.scores.home.quantiles.p10, homeP90: sim.scores.home.quantiles.p90, awayP10: sim.scores.away.quantiles.p10, awayP90: sim.scores.away.quantiles.p90 },
      },
      marketComparison: marketFresh
        ? { ...marketComparison, modelVsMarketTotal: Number((sim.totalQuantiles.p50 - (market.consensus.total ?? 0)).toFixed(1)) }
        : marketComparison,
      settlementKey: { canonicalEventId: `nfl-${ev.providerEventId}`, settlesAgainst: "official final score", ledger: "experimental-forecast" },
      /* P250-W2: the market non-claim is rendered directly above this line from the model's own
         recorded honestLimit, so repeating it here made a reader meet it twice in two sentences. */
      disclaimer: "Educational and paper-only — not betting advice.",
    };
  } else {
  const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < ev.dateUtc), cutoffIso: NOW });
  const nameOf = new Map([[ev.home.abbr, ev.home.name], [ev.away.abbr, ev.away.name]]);
  const d = strength.ratingFor(nameOf.get(ev.home.abbr)) - strength.ratingFor(nameOf.get(ev.away.abbr));
  // CALIBRATED margin mean: λ shrinks the team-differentiating term. Everything below — win
  // probability included — is measured off the resulting simulation, so the published win % and
  // the published scoreline are the same distribution by construction and cannot disagree.
  const marginMean = base.homeAdvantage + LAMBDA * (EFFECTIVE_SLOPE * d);

  // input hash: everything the forecast depends on. Market is NOT included — it is not an input.
  const inputHash = crypto.createHash("md5").update(JSON.stringify({
    modelId: MODEL_ID, version: card.version, eventId: ev.providerEventId, kickoff: ev.dateUtc,
    d: Number(d.toFixed(6)), marginMean: Number(marginMean.toFixed(6)),
    sigmaMargin, sigmaTotal, muTotal: base.muTotal, lambda: LAMBDA,
    effectiveSlope: EFFECTIVE_SLOPE, teamSignal: TEAM_SIGNAL.state,
    strengthCutoff: strength.cutoffIso, scheduleAsOf: schedule.generatedAt,
  })).digest("hex").slice(0, 16);

  const rng = mulberry32(fnv1a(`${MODEL_ID}::${ev.providerEventId}::${inputHash}`));
  const homeScores = []; const awayScores = []; const margins = []; const totals = [];
  let homeWins = 0; let ties = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const [z1, z2] = normalPair(rng);
    const margin = marginMean + sigmaMargin * z1;
    const total = Math.max(2, base.muTotal + sigmaTotal * z2);
    const h = snapScore((total + margin) / 2);
    const a = snapScore((total - margin) / 2);
    homeScores.push(h); awayScores.push(a); margins.push(h - a); totals.push(h + a);
    if (h > a) homeWins += 1; else if (h === a) ties += 1;
  }
  const hS = sortNum(homeScores), aS = sortNum(awayScores), mS = sortNum(margins), tS = sortNum(totals);
  // the win probability IS the simulation's own home-win rate over the calibrated distribution —
  // not a second formula that could drift from the scoreline shown beside it
  const pHomeCalibrated = homeWins / RUNS;
  // coherence check (P245): the favourite is pHome vs pAway (tie mass excluded from neither),
  // and only a |median| ≥ 2 direction conflict is a contradiction — see the derivation in the
  // regular-season block above. This preseason path's probability IS the sampled rate and its
  // away share is (1 − pHome), so the favourite test reduces to the 0.5 comparison here.
  const medMargin = q(sortNum(margins), 0.5);
  if (!coherentDirection({ medMargin, pHome: pHomeCalibrated, pAway: 1 - pHomeCalibrated })) {
    refused.push({ providerEventId: ev.providerEventId, state: "INCOHERENT", reason: `median margin ${medMargin} disagrees with win probability ${pHomeCalibrated.toFixed(3)} — refusing rather than publishing two contradictory numbers` });
    continue;
  }

  forecast = {
    providerEventId: ev.providerEventId,
    canonicalEventId: `nfl-${ev.providerEventId}`,
    matchup: `${ev.away.abbr} @ ${ev.home.abbr}`,
    home: { abbr: ev.home.abbr, name: ev.home.name },
    away: { abbr: ev.away.abbr, name: ev.away.name },
    kickoffUtc: ev.dateUtc,
    seasonType: ev.seasonType,
    week: ev.week,
    venue: ev.venue ?? null,
    state: "PUBLIC_EXPERIMENTAL",
    model: { id: MODEL_ID, version: card.version, launchState: card.launchState, inputHash, simulations: RUNS },
    teamSignal: TEAM_SIGNAL,
    generatedAt: NOW,
    evidence: { schedule: schedule.generatedAt, strengthCutoff: strength.cutoffIso },
    forecastSummary: {
      projectedScore: derivedProjectedScore(q(tS, 0.5), q(mS, 0.5)),
      winProbability: {
        home: Number(pHomeCalibrated.toFixed(4)),
        away: Number((1 - pHomeCalibrated).toFixed(4)),
        tieMass: Number((ties / RUNS).toFixed(4)),
        /*
         * FULL PRECISION, FOR THE DIFFERENTIATION AUDIT ONLY — never for display.
         *
         * audit-nfl-differentiation exists to tell "the same rounded scoreline over genuinely
         * different distributions" (legitimate — integer football scores are a coarse view of a
         * continuous margin) from "two events that produced the SAME distribution" (a P0: the model
         * stopped reading the event). Its comment said it worked at "higher precision than the
         * published integers"; it did not. `winProbability.home` was already rounded to four places,
         * so the audit's tiebreaker had no more resolution than the thing it was adjudicating.
         *
         * On 2026-08-28 that raised a P0 on ATL @ MIA and ARI @ GB for both landing on 0.4585. The
         * published band across the slate spans about 0.012, which four places divide into roughly a
         * hundred buckets — two of twelve draws colliding there is close to a coin flip, and the
         * audit had no way to distinguish that from the defect it was named for.
         */
        homeUnrounded: pHomeCalibrated,
        calibration: LAMBDA === 0
          ? "Held at 50% by design: on a full held-out preseason this model picked winners no better than a coin flip, so it does not claim a side."
          : `Shrunk toward 50% by a factor fit before testing (λ=${LAMBDA}).`,
      },
      margin: { median: q(mS, 0.5), p10: q(mS, 0.1), p90: q(mS, 0.9) },
      total: { median: q(tS, 0.5), p10: q(tS, 0.1), p90: q(tS, 0.9) },
      scoreRange: { homeP10: q(hS, 0.1), homeP90: q(hS, 0.9), awayP10: q(aS, 0.1), awayP90: q(aS, 0.9) },
    },
    marketComparison: marketFresh
      ? {
        state: "MARKET_VIEW",
        capturedAt: marketCapturedAt,
        books: market.books.length,
        marketHomeWinPct: market.consensus.homeWinProbNoVig,
        marketSpreadHome: market.consensus.spreadHome,
        marketTotal: market.consensus.total,
        modelVsMarketTotal: Number((q(tS, 0.5) - (market.consensus.total ?? 0)).toFixed(1)),
        note: "The sportsbook numbers are the books' own, shown for context. A difference is a difference — this model has not been shown to beat the market.",
      }
      : { state: "NO_MARKET", note: "No current sportsbook capture covers this game." },
    settlementKey: { canonicalEventId: `nfl-${ev.providerEventId}`, settlesAgainst: "official final score", ledger: "experimental-forecast" },
    disclaimer: "Educational and paper-only — not betting advice.",
  };
  }

  // immutable receipt: refuse to rewrite one that already exists for this event+date
  const receiptPath = path.join(ROOT, "data/internal/nfl/forecast-receipts", DATE, `${ev.providerEventId}.json`);
  if (fs.existsSync(receiptPath)) {
    const existing = read(receiptPath);
    if (existing?.model?.inputHash === forecast.model.inputHash) {
      published.push(forecast);
      continue; // identical inputs → identical forecast; nothing to rewrite
    }
    if (Date.parse(existing?.generatedAt ?? 0) && nowMs >= kickoff) {
      refused.push({ providerEventId: ev.providerEventId, state: "LOCKED_AT_KICKOFF", reason: "an artifact is immutable once its game has started" });
      continue;
    }
    // pre-kickoff revision: new file with lineage, original preserved
    const revPath = path.join(ROOT, "data/internal/nfl/forecast-receipts", DATE, `${ev.providerEventId}-rev-${NOW.slice(11, 16).replace(":", "")}Z.json`);
    fs.writeFileSync(revPath, JSON.stringify({ ...forecast, revisionOf: path.basename(receiptPath), priorInputHash: existing?.model?.inputHash ?? null }, null, 1));
    published.push(forecast);
    continue;
  }
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(forecast, null, 1));
  published.push(forecast);
}

// One window, one phase (refused above otherwise), one card. An EMPTY window keeps the phase of
// the upcoming schedule so the artifact's self-description matches what the reader is waiting for.
const publishPreseason = windowSeasonTypes.size > 0 ? windowIsPreseason : !scheduleHasRegularAhead;

/*
 * P295 · A PUBLISHED FORECAST DOES NOT DISAPPEAR AT KICKOFF.
 *
 * Each run publishes only games that have not started, and the index, /nfl, the week page and the game
 * pages all read that one file. So on 2026-09-13 the 17:35Z run cut Week 1 from 14 forecasts to 6 and
 * the 22:54Z run to 2: twelve games that HAD published pre-kickoff forecasts (13:48Z, receipts on disk)
 * lost their game pages (404), and /nfl told readers they "kicked off before a forecast was published —
 * missed coverage, never backfilled". A false statement about our own record.
 *
 * The started games of the current week are rebuilt here from their immutable receipts — the latest
 * revision generated BEFORE its own kickoff — into forecasts/frozen-latest.json. Nothing is generated
 * and nothing is backfilled: a receipt stamped at or after kickoff is never carried. It is a SEPARATE
 * artifact on purpose: every producer downstream of this builder has only ever seen pre-kickoff
 * forecasts in latest.json, so only the readers union the two (lib/sports/nfl/public-forecast-union.mjs).
 */
const frozenForecasts = (() => {
  if (!currentPeriod) return [];
  const receiptsRoot = path.join(ROOT, "data/internal/nfl/forecast-receipts");
  if (!fs.existsSync(receiptsRoot)) return [];
  const liveIds = new Set(published.map((f) => String(f.providerEventId)));
  const horizon = new Date(nowMs - 14 * 864e5).toISOString().slice(0, 10);
  const best = new Map();
  for (const day of fs.readdirSync(receiptsRoot).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= horizon && d <= DATE).sort()) {
    for (const file of fs.readdirSync(path.join(receiptsRoot, day)).filter((x) => x.endsWith(".json"))) {
      const rec = read(path.join(receiptsRoot, day, file));
      if (!rec?.providerEventId || !rec.kickoffUtc || !rec.generatedAt || !rec.forecastSummary) continue;
      if (rec.seasonType !== currentPeriod.seasonType || rec.week !== currentPeriod.week) continue;
      if (Date.parse(rec.kickoffUtc) > nowMs || liveIds.has(String(rec.providerEventId))) continue;
      if (!(Date.parse(rec.generatedAt) < Date.parse(rec.kickoffUtc))) continue;
      const id = String(rec.providerEventId);
      if (!best.has(id) || rec.generatedAt > best.get(id).generatedAt) best.set(id, rec);
    }
  }
  return [...best.values()]
    .map((rec) => { const f = { ...rec }; delete f.revisionOf; delete f.priorInputHash; return f; })
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
})();
const frozenPayload = JSON.stringify({
  schemaVersion: 1,
  artifact: "nfl-public-forecasts-frozen",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  period: currentPeriod ? { seasonType: currentPeriod.seasonType, week: currentPeriod.week } : null,
  note: "This week's games that have kicked off, each shown exactly as its last pre-kickoff forecast was published. Frozen at kickoff and never regenerated.",
  eventCount: frozenForecasts.length,
  forecasts: frozenForecasts,
}, null, 1);
for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "p171-ledger"]) {
  if (frozenPayload.includes(banned)) { console.error(`REFUSED: frozen forecasts would carry "${banned}"`); process.exit(3); }
}
fs.mkdirSync(path.join(APP, "public/data/nfl/forecasts"), { recursive: true });
fs.writeFileSync(path.join(APP, "public/data/nfl/forecasts", "frozen-latest.json"), frozenPayload);
console.log(`frozen at kickoff: ${frozenForecasts.length} started game(s) of the current week carried from pre-kickoff receipts`);
const publicArtifact = {
  schemaVersion: 1,
  artifact: "nfl-public-forecasts",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  date: DATE,
  model: publishPreseason
    ? { id: MODEL_ID, version: card.version, launchState: "PUBLIC_EXPERIMENTAL" }
    : { id: rsCard.modelId, version: rsCard.version, launchState: rsCard.launchState },
  modelCard: publishPreseason ? card.plainEnglish : rsCard.plainEnglish,
  eventCount: published.length,
  forecasts: published,
  refused,
  disclaimer: publishPreseason
    ? "Experimental preseason forecasts. Educational and paper-only. This model has not been shown to beat the sportsbook market."
    : "Experimental regular-season forecasts. Educational and paper-only. This model has not been shown to beat the sportsbook market.",
};
const payload = JSON.stringify(publicArtifact, null, 1);
for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "p171-ledger"]) {
  if (payload.includes(banned)) { console.error(`REFUSED: public forecasts would carry "${banned}"`); process.exit(3); }
}
const outPath = path.join(APP, "public/data/nfl/forecasts", `${DATE}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, payload);
fs.writeFileSync(path.join(APP, "public/data/nfl/forecasts", "latest.json"), payload);

console.log(`forecasts: ${published.length} published · ${refused.length} refused`);
for (const f of published.slice(0, 3)) {
  console.log(`  ${f.matchup}: ${f.forecastSummary.projectedScore.away}-${f.forecastSummary.projectedScore.home} · win ${(f.forecastSummary.winProbability.home * 100).toFixed(1)}% · total ${f.forecastSummary.total.median} (${f.forecastSummary.total.p10}-${f.forecastSummary.total.p90}) · ${f.marketComparison.state}`);
}
