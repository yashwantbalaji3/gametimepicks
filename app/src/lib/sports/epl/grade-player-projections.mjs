/**
 * EPL PLAYER PROJECTION GRADING — the pure join from a published projection to what actually happened.
 *
 * The team forecasts have been graded since they existed. Player projections were published without
 * any of this, which is the shape this repo keeps finding and which I introduced myself: a surface
 * that predicts and never learns. This closes it.
 *
 * THE RULE THAT MAKES THIS DIFFERENT FROM TEAM GRADING, and it is the whole design:
 *
 *   A CONDITIONAL PREDICTION CANNOT BE GRADED WHEN ITS CONDITION DID NOT HOLD.
 *
 * Before lineups are posted every row says "if he starts". If that player then came off the bench, or
 * never left it, the model did not predict anything about what he did — scoring that row as a MISS
 * would be measuring a claim it never made, and it would punish the model for a participation call it
 * deliberately refuses to make. Those rows are VOIDED with a reason, never graded, and never quietly
 * dropped either: a void is recorded so the population always reconciles.
 *
 * The same applies after lineups: a projection made for a named starter who is a late scratch is void,
 * not wrong.
 *
 * No fs, no clock, no network. The caller supplies the artifacts.
 */

export const EPL_PLAYER_GRADING_VERSION = 2;

/**
 * The markets graded, and the actual field each is scored against.
 *
 * Driven by a table rather than hardcoded, because a second market arrived (shots on goal) and a
 * third may not — plain shots was REJECTED on calibration and must never appear here. A market that
 * has not cleared its preregistered bars has no entry, which makes "is this gradeable" the same
 * question as "was this ever publishable".
 */
export const GRADED_MARKETS = Object.freeze([
  { id: "anytime_goalscorer", projectionField: "probability", actualField: "goals", line: 0.5 },
  { id: "shots_on_goal_over_0_5", projectionField: "shotsOnGoalOver05", actualField: "shotsOnGoal", line: 0.5 },
]);

/** Why a projected row could not be scored. Every one of these is recorded, never silently dropped. */
export const VOID_REASONS = Object.freeze({
  CONDITION_UNMET: "the participation state the projection assumed did not occur",
  DID_NOT_APPEAR: "the player did not appear in the match",
  NOT_IN_MATCHDAY_SQUAD: "the player was not in the matchday squad",
});

/** The actual participation state from a result row, or null when the player did not appear. */
export function actualState(actual) {
  if (!actual) return null;
  if (actual.started) return "START";
  if (actual.subbedIn) return "SUB";
  return null;
}

/**
 * Index projection snapshots by fixture, keeping the LATEST that still PRE-DATES kickoff.
 *
 * Snapshots are immutable and timestamped, so a matchday holds several: the conditional set from the
 * morning and the lineup-resolved set from an hour before kickoff. The later one is strictly better —
 * it knows who is playing — and it is still pre-kickoff, so it is the projection of record. Anything
 * generated at or after kickoff is REFUSED outright rather than discounted.
 *
 * @param {Array<{file: string, generatedAt: string, fixtures: Array<object>}>} snapshots
 */
export function indexProjections(snapshots) {
  const byFixture = new Map();
  const refused = [];
  for (const snap of snapshots ?? []) {
    const gen = Date.parse(snap.generatedAt ?? "");
    if (!Number.isFinite(gen)) { refused.push({ file: snap.file, reason: "unparseable generatedAt" }); continue; }
    for (const fx of snap.fixtures ?? []) {
      const kickoff = Date.parse(fx.kickoffUtc ?? "");
      if (!Number.isFinite(kickoff)) { refused.push({ slug: fx.slug, reason: "unparseable kickoff" }); continue; }
      if (gen >= kickoff) {
        refused.push({ slug: fx.slug, file: snap.file, reason: "projection generated at/after kickoff" });
        continue;
      }
      const prev = byFixture.get(fx.slug);
      if (!prev || gen > prev.generatedAt) byFixture.set(fx.slug, { fixture: fx, generatedAt: gen, sourceFile: snap.file });
    }
  }
  return { byFixture, refused };
}

const clip = (p) => Math.min(1 - 1e-15, Math.max(1e-15, p));
const r6 = (v) => Number(v.toFixed(6));

/**
 * Grade every player row of every finished fixture whose condition actually held.
 *
 * @param {{ projections: Map, actuals: Map, alreadyGraded: Set<string> }} input
 *   actuals: slug → { status, players: Array<{playerId, started, subbedIn, goals, name}> }
 */
export function gradePlayerProjections({ projections, actuals, alreadyGraded = new Set() }) {
  const graded = [];
  const voided = [];
  const skipped = { alreadyGraded: 0, noProjection: 0, notFinal: 0 };

  for (const [slug, actual] of actuals ?? new Map()) {
    if (actual?.status !== "FULL_TIME") { skipped.notFinal += 1; continue; }
    const rec = projections.get(slug);
    if (!rec) { skipped.noProjection += 1; continue; }

    const actualById = new Map((actual.players ?? []).map((p) => [String(p.playerId), p]));

    for (const row of rec.fixture.players ?? []) {
     for (const market of GRADED_MARKETS) {
      const projected = row[market.projectionField];
      /* A market absent from the row was never published for this player — nothing to grade. */
      if (projected == null) continue;

      /* The key carries the MARKET, or a second market would collide with the first and be skipped
         forever as "already graded" — silently halving the record the day it was added. */
      const key = `${slug}:${row.playerId}:${market.id}`;
      if (alreadyGraded.has(key)) { skipped.alreadyGraded += 1; continue; }

      const a = actualById.get(String(row.playerId));
      const state = actualState(a);
      const base = {
        market: market.id,
        schemaVersion: 1,
        gradingVersion: EPL_PLAYER_GRADING_VERSION,
        key,
        slug,
        matchup: rec.fixture.matchup,
        kickoffUtc: rec.fixture.kickoffUtc,
        projectionGeneratedAt: new Date(rec.generatedAt).toISOString(),
        projectionSource: rec.sourceFile,
        lineupState: rec.fixture.lineupState,
        playerId: row.playerId,
        playerName: row.name,
        teamName: row.teamName,
        projectedState: row.state,
        conditional: row.conditional === true,
        probability: projected,
      };

      if (!a) { voided.push({ ...base, outcome: "VOID", reason: VOID_REASONS.NOT_IN_MATCHDAY_SQUAD }); continue; }
      if (!state) { voided.push({ ...base, outcome: "VOID", reason: VOID_REASONS.DID_NOT_APPEAR }); continue; }
      if (state !== row.state) {
        /*
         * The condition failed. "If he starts" against a substitute is not a miss — it is a
         * prediction about a situation that did not arise, and grading it would measure a claim the
         * model never made.
         */
        voided.push({ ...base, outcome: "VOID", reason: `${VOID_REASONS.CONDITION_UNMET} (projected ${row.state}, actual ${state})`, actualState: state });
        continue;
      }

      const observed = Number(a[market.actualField] ?? 0);
      const y = observed > market.line ? 1 : 0;
      graded.push({
        ...base,
        outcome: y ? "HIT" : "MISS",
        actualState: state,
        observed,
        scores: {
          y,
          logLoss: r6(-(y * Math.log(clip(projected)) + (1 - y) * Math.log(1 - clip(projected)))),
          brier: r6((projected - y) ** 2),
        },
      });
     }
    }
  }
  return { graded, voided, skipped };
}

/**
 * Classify an empty grading run. Four causes, and only three of them are healthy — collapsing them
 * into one reassuring sentence is how a dead loop keeps reporting that everything is fine.
 *
 * @returns {"NO_FINISHED_FIXTURES"|"NOTHING_NEW"|"ALL_VOID"|"BROKEN_JOIN"}
 */
export function classifyEmptyRun({ finishedFixtures, gradedCount, voidedCount, alreadyGradedCount = 0 }) {
  if (gradedCount > 0) return "NOTHING_NEW";
  if (finishedFixtures === 0) return "NO_FINISHED_FIXTURES";
  if (alreadyGradedCount > 0) return "NOTHING_NEW";
  /*
   * Everything voided is a REAL state, not a defect: before lineups exist a whole squad is projected
   * conditionally and only the eleven who start can be graded. But zero graded AND zero voided means
   * nothing joined at all, which is a broken join wearing the same silence.
   */
  if (voidedCount > 0) return "ALL_VOID";
  return "BROKEN_JOIN";
}

/**
 * Running performance over graded player rows. `n` travels with every figure because a hit rate over
 * eleven predictions is not a track record, and the number that says so must be impossible to drop.
 */
export function summarisePlayerGrades(rows) {
  const n = rows.length;
  if (n === 0) return { n: 0, hits: 0, hitRate: null, logLoss: null, brier: null, predictedScorers: null, observedScorers: 0 };
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const predicted = sum((r) => r.probability);
  const observed = sum((r) => r.scores.y);
  return {
    n,
    hits: observed,
    hitRate: r6(observed / n),
    logLoss: r6(sum((r) => r.scores.logLoss) / n),
    brier: r6(sum((r) => r.scores.brier) / n),
    predictedScorers: Number(predicted.toFixed(2)),
    observedScorers: observed,
    /* The calibration question a reader actually asks: did roughly the predicted number score? */
    countError: observed > 0 ? r6(Math.abs(predicted - observed) / observed) : null,
  };
}
