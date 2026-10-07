/**
 * E-2 · NFL WINNER vs THE CUTOFF-ELO BASELINE, FORWARD, ON IDENTICAL GAMES (architecture audit II.D #4). Pure.
 *
 * The regular-season evaluation contract's win bar is "mean log loss at least 0.005 BELOW the committed cutoff-Elo
 * baseline's, evaluated on the identical games" (regular-season-evaluation-contract.json /bars/winHead). Model health
 * has carried that bar as NOT_COMPUTABLE because no forward ledger scored the baseline. This module pairs, per
 * settled game, the forecast of record's win head with the cutoff-Elo baseline reproduced at that forecast's own
 * strength cutoff:
 *
 *   model     P(home | decided) of the head the forecast published = homeUnrounded / (1 − tieMass)
 *             (the head as the contract evaluated it, before the producer scales it by the simulated tie share)
 *   baseline  logistic(d / 400), d = Elo(home) + home edge − Elo(away), from strengthStateAt over every final played
 *             before the receipt's evidence.strengthCutoff (the caller's baselineFor; a team without rating history
 *             is VOID, never given the league mean silently)
 *
 * A tied final is VOID (not a loss). Preseason is out of the contract's scope. The published number (head × (1 − tie))
 * is carried as context only.
 */
export const NFL_WIN_BASELINE_FORWARD = "nfl-win-head-vs-cutoff-elo-forward-v1";
const EPS = 1e-4;
const clamp = (p) => Math.min(1 - EPS, Math.max(EPS, p));
const ll = (p, hit) => -Math.log(hit ? clamp(p) : 1 - clamp(p));
const r6 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(6)));

/**
 * @param receiptsOfRecord Map eventId → { file, receipt } (forecast of record, pre-kickoff)
 * @param finalsById       Map eventId → { ftHome, ftAway, statusRaw }
 * @param baselineFor      (receipt) → { state: "READY", pHome, d, gamesFolded } | { state: "REFUSED", reason }
 */
export function pairWinBaseline({ receiptsOfRecord, finalsById, baselineFor }) {
  const games = [];
  for (const [eventId, { file, receipt: r }] of [...receiptsOfRecord.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (r.seasonType === 1) continue; // preseason: outside the regular-season contract
    const f = finalsById.get(String(eventId));
    if (!f || !Number.isInteger(f.ftHome) || !Number.isInteger(f.ftAway)) continue; // not settled: nothing to pair
    const row = { eventId: String(eventId), kickoffUtc: r.kickoffUtc, week: r.week ?? null, matchup: r.matchup ?? null, receipt: file, winHead: r.model?.winHead?.id ?? null, final: { home: f.ftHome, away: f.ftAway } };
    if (f.ftHome === f.ftAway) { games.push({ ...row, state: "VOID", reason: "tied final — VOID, not a loss" }); continue; }
    const w = r.forecastSummary?.winProbability;
    if (!Number.isFinite(w?.homeUnrounded) || !Number.isFinite(w?.tieMass) || !(w.tieMass < 1)) { games.push({ ...row, state: "VOID", reason: "forecast has no unrounded win probability" }); continue; }
    const b = baselineFor(r);
    if (b.state !== "READY") { games.push({ ...row, state: "VOID", reason: `baseline not reproducible: ${b.reason}` }); continue; }
    const pModel = w.homeUnrounded / (1 - w.tieMass);
    const homeWon = f.ftHome > f.ftAway;
    const llModel = ll(pModel, homeWon);
    const llBase = ll(b.pHome, homeWon);
    games.push({ ...row, state: "PAIRED", actual: homeWon ? "HOME" : "AWAY", model: r6(pModel), published: w.home ?? null, baseline: r6(b.pHome), baselineEloDiff: r6(b.d), baselineGamesFolded: b.gamesFolded, producerFoldGap: b.producerFoldGap ?? null, logLossModel: r6(llModel), logLossBaseline: r6(llBase), difference: r6(llModel - llBase) });
  }
  // Also per published head: Week 1–2 forecasts predate the Elo-MOV adoption (P298), and fallback games used the incumbent.
  const heads = [...new Set(games.map((g) => g.winHead ?? "none recorded"))].sort();
  const byWinHead = Object.fromEntries(heads.map((h) => [h, summarise(games.filter((g) => (g.winHead ?? "none recorded") === h))]));
  return { games, summary: { ...summarise(games), byWinHead } };
}

/** Mean paired difference with a naive 95% interval; reported, not judged (the contract's minimum sample governs). */
export function summarise(games, { minimumSample = 64, minimumWeeks = 4 } = {}) {
  const p = games.filter((g) => g.state === "PAIRED");
  const n = p.length;
  const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
  const d = p.map((g) => g.difference);
  const md = mean(d);
  const sd = n > 1 ? Math.sqrt(d.reduce((a, x) => a + (x - md) ** 2, 0) / (n - 1)) : null;
  const weeks = new Set(p.map((g) => g.week).filter((x) => x != null)).size;
  return {
    paired: n,
    void: games.length - n,
    weeks,
    meanLogLossModel: r6(mean(p.map((g) => g.logLossModel))),
    meanLogLossBaseline: r6(mean(p.map((g) => g.logLossBaseline))),
    logLossVsBaseline: r6(md),
    ci95: sd != null ? [r6(md - (1.96 * sd) / Math.sqrt(n)), r6(md + (1.96 * sd) / Math.sqrt(n))] : null,
    state: n >= minimumSample && weeks >= minimumWeeks ? "AT_MINIMUM_SAMPLE" : "BELOW_MINIMUM_SAMPLE",
    note: `logLossVsBaseline = mean(model) − mean(baseline) on identical decided games; the contract bar is ≤ −0.005. Below ${minimumSample} games / ${minimumWeeks} weeks the figure is reported and supports no promotion in either direction.`,
  };
}
