/**
 * MLB GAME-LEVEL PREDICTION GRADING — the pure join from a pre-first-pitch prediction revision to
 * an official final (Program 196 · Release B1).
 *
 * The sport publishes game predictions daily (moneyline / total / run line, from the full-game
 * simulation) and, until this file, graded only its PLAYER PROPS in the public record — 32,227
 * graded projections beside zero graded game calls. This closes that gap without ever blending the
 * two: game rows live in their own ledger with their own denominators.
 *
 * THE FORECAST-OF-RECORD PROBLEM IS REAL HERE. The dated predictions artifact is a MOVING POINTER:
 * it regenerates through the day as lineups post, and its final committed state can postdate some
 * or all of the slate (2026-08-22's file was last written at 02:08 the NEXT day). Grading from the
 * file on disk would score a forecast that saw the results. So a graded row exists ONLY when a
 * revision of the artifact that PRE-DATES the game's first pitch can be produced — recovered from
 * git history for the backfill, and from immutable per-run snapshots going forward. A game with no
 * such revision is MISSING_PRE_EVENT_ARTIFACT: named, counted, never reconstructed.
 *
 * Grading rules, each from a defect already paid for elsewhere in this repo:
 *   - FULL_TIME only: a final must carry both scores (the StatsAPI "Final without scores" lesson —
 *     postponed games lie). The linescore parser is fail-closed; this file re-checks anyway.
 *   - The ledger is APPEND-ONLY and a graded row is immutable; (gamePk, market) never regrades.
 *   - A family is graded only when the chosen revision actually carried a pick for it. "The model
 *     said nothing" and "the model was wrong" are different facts.
 *   - Pushes are voids, not losses; hit rate is wins / (wins + losses).
 *
 * No fs, no clock, no git — the caller supplies revisions, finals and the current ledger.
 */

export const GAME_GRADING_VERSION = 1;

/** Markets graded from a prediction row. Team totals are deliberately absent: no public surface
 *  publishes them as calls, and grading what was never published would inflate the denominator. */
export const GAME_MARKETS = Object.freeze(["moneyline", "total", "run_line"]);

/**
 * The forecast of record: the NEWEST revision that still pre-dates first pitch. Revisions at or
 * after first pitch are ignored here (not errors — the day's later regenerations legitimately
 * exist; they just cannot be graded against this game).
 *
 * @param {Array<{generatedAt: string, source: string, byGamePk: Map<string|number, object>}>} revisions
 * @param {string} firstPitchUtc
 */
export function selectForecastOfRecord(revisions, firstPitchUtc) {
  const pitch = Date.parse(firstPitchUtc ?? "");
  if (!Number.isFinite(pitch)) return null;
  let best = null;
  for (const rev of revisions ?? []) {
    const gen = Date.parse(rev.generatedAt ?? "");
    if (!Number.isFinite(gen) || gen >= pitch) continue;
    if (!best || gen > Date.parse(best.generatedAt)) best = rev;
  }
  return best;
}

const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));

/**
 * Grade every family the revision's row carried, against an official final.
 * @returns {Array<object>} zero to three graded rows (never a fabricated one)
 */
export function gradeGameFamilies({ row, final: fin, revision, firstPitchUtc }) {
  if (!row || !fin) return [];
  if (fin.isFinal !== true || !Number.isInteger(fin.homeRuns) || !Number.isInteger(fin.awayRuns)) return [];

  const out = [];
  const margin = fin.homeRuns - fin.awayRuns; // positive = home won by that many
  const total = fin.homeRuns + fin.awayRuns;
  const base = {
    schemaVersion: 1,
    gradingVersion: GAME_GRADING_VERSION,
    gamePk: row.gamePk,
    date: row.slateDate ?? null,
    matchup: `${row.awayTeam} @ ${row.homeTeam}`,
    firstPitchUtc: firstPitchUtc ?? null,
    forecastGeneratedAt: revision.generatedAt,
    forecastSource: revision.source,
    actual: { homeRuns: fin.homeRuns, awayRuns: fin.awayRuns, winner: margin > 0 ? "home" : "away" },
  };

  // ── Moneyline ─────────────────────────────────────────────────────────────────────────────────
  const ml = row.moneyline;
  if (ml?.side === "home" || ml?.side === "away") {
    const hit = (margin > 0 ? "home" : "away") === ml.side;
    out.push({
      ...base,
      market: "moneyline",
      pick: `${ml.team} (${ml.side})`,
      line: null,
      modelProbability: r4(ml.simulationProbability),
      marketImpliedProbability: r4(ml.marketImpliedProbability),
      outcome: hit ? "WIN" : "LOSS",
    });
  }

  // ── Total ─────────────────────────────────────────────────────────────────────────────────────
  const t = row.total;
  if ((t?.pick === "OVER" || t?.pick === "UNDER") && Number.isFinite(t?.line)) {
    const outcome = total === t.line ? "PUSH" : (total > t.line) === (t.pick === "OVER") ? "WIN" : "LOSS";
    out.push({
      ...base,
      market: "total",
      pick: `${t.pick} ${t.line}`,
      line: t.line,
      modelProbability: r4(t.pick === "OVER" ? t.overProbability : t.underProbability),
      marketImpliedProbability: r4(t.pick === "OVER" ? t.marketImpliedOver : t.marketImpliedOver == null ? null : 1 - t.marketImpliedOver),
      outcome,
    });
  }

  // ── Run line ──────────────────────────────────────────────────────────────────────────────────
  const rl = row.runLine;
  if ((rl?.pickSide === "home" || rl?.pickSide === "away") && Number.isFinite(rl?.pickLine)) {
    // pickLine is from the picked side's perspective: -1.5 must win by 2+; +1.5 may lose by 1.
    const pickMargin = rl.pickSide === "home" ? margin : -margin;
    const adjusted = pickMargin + rl.pickLine;
    const outcome = adjusted === 0 ? "PUSH" : adjusted > 0 ? "WIN" : "LOSS";
    out.push({
      ...base,
      market: "run_line",
      pick: rl.pick ?? `${rl.pickSide} ${rl.pickLine}`,
      line: rl.pickLine,
      modelProbability: r4(rl.coverProbability),
      marketImpliedProbability: null, // the revision does not carry a run-line market probability; absent, never faked
      outcome,
    });
  }

  return out;
}

/**
 * One date's grading pass: pick each final game's forecast of record, grade its families, and
 * account for every game — graded, already in the ledger, not final, or missing its pre-event
 * artifact. The accounting object is the anti-silent-gap contract: counts must add up, and the
 * caller prints them rather than a reassuring sentence.
 *
 * @param {object} args
 * @param {Array<{generatedAt: string, source: string, byGamePk: Map}>} args.revisions  parsed revisions of this date's predictions artifact
 * @param {Array<object>} args.finals            LinescoreResult rows for the date
 * @param {Map<string|number, string>} args.firstPitchByGamePk
 * @param {Set<string>} args.alreadyGraded       keys `${gamePk}:${market}`
 */
export function gradeDate({ revisions, finals, firstPitchByGamePk, alreadyGraded = new Set() }) {
  const graded = [];
  const skipped = { notFinal: 0, alreadyGraded: 0, missingPreEvent: [], noPick: 0 };

  for (const fin of finals ?? []) {
    if (fin.isFinal !== true || !Number.isInteger(fin.homeRuns) || !Number.isInteger(fin.awayRuns)) {
      skipped.notFinal += 1;
      continue;
    }
    /*
     * A game with ANY family already in the ledger is ALREADY GRADED, full stop — checked before
     * the revision lookup. Without this, a later pass in snapshot mode over a date the git-history
     * backfill graded (where the only revision on disk post-dates the slate) recounted every
     * settled game as MISSING_PRE_EVENT_ARTIFACT: a graded game re-reported as a gap, inflating
     * the miss count each night forever.
     */
    if (GAME_MARKETS.some((m) => alreadyGraded.has(`${fin.gamePk}:${m}`))) {
      skipped.alreadyGraded += 1;
      continue;
    }
    const firstPitch = firstPitchByGamePk.get(fin.gamePk) ?? firstPitchByGamePk.get(String(fin.gamePk)) ?? null;
    const rev = selectForecastOfRecord(revisions, firstPitch);
    const row = rev?.byGamePk.get(fin.gamePk) ?? rev?.byGamePk.get(String(fin.gamePk)) ?? null;
    if (!rev || !row) {
      skipped.missingPreEvent.push({ gamePk: fin.gamePk, reason: !firstPitch ? "no first-pitch time" : !rev ? "no committed revision pre-dates first pitch" : "game absent from the forecast-of-record revision" });
      continue;
    }
    const rows = gradeGameFamilies({ row, final: fin, revision: rev, firstPitchUtc: firstPitch });
    if (rows.length === 0) { skipped.noPick += 1; continue; }
    for (const g of rows) {
      const key = `${g.gamePk}:${g.market}`;
      if (alreadyGraded.has(key)) { skipped.alreadyGraded += 1; continue; }
      graded.push(g);
    }
  }
  return { graded, skipped };
}

/** Running record over the ledger, per market family — never blended into one number. */
export function summariseGameLedger(rows) {
  const families = {};
  for (const m of GAME_MARKETS) families[m] = { n: 0, wins: 0, losses: 0, pushes: 0, hitRate: null };
  for (const r of rows ?? []) {
    const f = families[r.market];
    if (!f) continue;
    f.n += 1;
    if (r.outcome === "WIN") f.wins += 1;
    else if (r.outcome === "LOSS") f.losses += 1;
    else if (r.outcome === "PUSH") f.pushes += 1;
    if (r.market === "run_line" && Number.isFinite(r.line)) {
      f.styleBreakdown ??= { minusLines: 0, plusLines: 0 };
      if (r.line < 0) f.styleBreakdown.minusLines += 1;
      else f.styleBreakdown.plusLines += 1;
    }
  }
  for (const f of Object.values(families)) {
    const decisive = f.wins + f.losses;
    f.hitRate = decisive > 0 ? Number((f.wins / decisive).toFixed(4)) : null;
  }
  /*
   * THE RUN-LINE NUMBER NEEDS ITS BASE RATE STATED OR IT FLATTERS. The engine takes the +1.5 side
   * on almost every slate (verified over the backfill: ~93% of picks), and a +1.5 side covers
   * whenever the team wins OR loses by one — a style whose base rate sits near the very hit rate
   * this ledger shows. With no market price recorded for this family, the raw percentage supports
   * no claim against anything; the note is derived here so every consumer carries it.
   */
  const rl = families.run_line;
  if (rl?.styleBreakdown && rl.n > 0) {
    const plusShare = rl.styleBreakdown.plusLines / (rl.styleBreakdown.plusLines + rl.styleBreakdown.minusLines);
    rl.note = plusShare >= 0.6
      ? `${Math.round(plusShare * 100)}% of graded run-line picks took the +1.5 side, whose base cover rate is close to this hit rate — and no market price is recorded for this family, so the percentage supports no claim against the market.`
      : null;
  }
  return families;
}
