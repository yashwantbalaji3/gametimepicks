/**
 * NFL LIFECYCLE TRACE — "did the real game move cleanly all the way through?"
 *
 * One question, asked of committed artifacts only:
 *
 *   PREGAME BOARD → LIVE ARTIFACT → LIVE OBSERVATION → PROVISIONAL FINAL → CANONICAL FINAL → RESULTS
 *
 * WHY THIS EXISTS. Every stage above already has its own producer, its own guard and its own tests,
 * and each one passes in isolation. What nobody could answer without shell archaeology was whether a
 * PARTICULAR game made it through all six — and the two worst incidents of this program were exactly
 * that shape: an artifact that existed but predated the fix by 75 minutes, and a publish gate that ran
 * in the generator so a 62-hour outage looked green. A stage passing is not a game arriving.
 *
 * ⚠ THE VOCABULARY IS LOAD-BEARING. A stage that is legitimately empty is NOT_YET, never MISSING.
 * Before kickoff there is no live observation, and that is the correct state of a healthy Sunday
 * morning — reporting it as a failure trains an operator to ignore the output, which is how a real
 * MISSING gets skipped. Only MISSING and INCONSISTENT are actionable.
 *
 * ⚠ READ-ONLY, AND DELIBERATELY SO. This never calls a provider and never writes an artifact. An
 * acceptance harness that refetches can make a recorded result agree with the present, which destroys
 * the only thing it was measuring. `now` is a parameter for the same reason: the trace of a past
 * Sunday must not change because it is read on a Tuesday.
 */

import { RECONCILIATION_WINDOW_MS } from "./live-prop-state.mjs";

/** A stage is one of these four. Nothing else is a state. */
export const STAGE_STATES = Object.freeze(["OK", "NOT_YET", "MISSING", "INCONSISTENT"]);

/** Only these two mean an operator has something to do. */
export const ACTIONABLE = Object.freeze(["MISSING", "INCONSISTENT"]);

export const STAGES = Object.freeze([
  "BOARD",
  "LIVE_ARTIFACT",
  "LIVE_OBSERVATION",
  "FINAL_PROVISIONAL",
  "FINAL_CANONICAL",
  "RESULTS",
]);

/** `2026-09-27T17:00Z` and the long form are one instant. */
function ms(iso) {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
}

function stage(name, state, note) {
  return { stage: name, state, note };
}

/**
 * A board family's publication state.
 *
 * ⚠ THE SHAPE IS NOT UNIFORM. Boards write `families[key] = { state, ... }`, and the first draft of
 * this file compared that OBJECT to the string "PUBLISHED" — so every family looked unpublished and
 * the trace cheerfully reported "no family cleared its bar" on all sixteen games of a healthy slate.
 * A guard that reads the wrong shape does not fail; it passes vacuously and answers the wrong
 * question. Both forms are accepted here so neither shape can make that mistake again.
 */
export function familyStateOf(entry) {
  if (entry == null) return null;
  if (typeof entry === "string") return entry;
  return entry.state ?? null;
}

/**
 * How long after kickoff we stop calling a still-PRE live artifact "early" and start calling it
 * MISSING. The live producer runs on a cadence, so a few minutes of lag is the system working.
 */
export const LIVE_GRACE_MS = 20 * 60_000;

/** A game is expected to be over by this long after kickoff. */
export const GAME_DURATION_MS = 4 * 3600_000;

/**
 * Trace one game.
 *
 * Everything is passed in — no filesystem, no clock, no network. The CLI does the reading.
 *
 * @param {object} g
 * @param {string} g.providerEventId
 * @param {string|null} g.kickoffUtc     from the schedule/board, not from a clock
 * @param {object|null} g.board          committed player-board, or null if none exists
 * @param {object|null} g.live           committed live-props artifact, or null
 * @param {boolean|null} g.liveCommitted  is `live` in the COMMITTED tree? null = the caller did not ask
 * @param {object[]} g.settlementRows    prop-settlement rows for THIS event (may be empty)
 * @param {boolean} g.inResults          does the public results surface carry this event
 * @param {string} g.now                 the instant the trace is taken AS
 */
export function traceGame({ providerEventId, matchup = null, kickoffUtc = null, board = null, live = null, liveCommitted = null, settlementRows = [], inResults = false, now }) {
  const nowMs = ms(now);
  const kickMs = ms(kickoffUtc ?? board?.kickoffUtc ?? live?.kickoffUtc);
  const started = kickMs != null && nowMs != null && nowMs >= kickMs;
  const pastGrace = kickMs != null && nowMs != null && nowMs >= kickMs + LIVE_GRACE_MS;
  const shouldBeOver = kickMs != null && nowMs != null && nowMs >= kickMs + GAME_DURATION_MS;

  const stages = [];

  // ── 1 · BOARD ────────────────────────────────────────────────────────────────────────────────
  // The pregame record. Its families' publication states are the authority every later stage
  // inherits: a live value may only attach where the board said PUBLISHED.
  const familyStates = Object.fromEntries(Object.entries(board?.families ?? {}).map(([k, v]) => [k, familyStateOf(v)]));
  const published = Object.entries(familyStates).filter(([, s]) => s === "PUBLISHED").map(([k]) => k);
  if (!board) {
    stages.push(stage("BOARD", started ? "MISSING" : "NOT_YET",
      started ? "no committed player-board — this game has no pregame record at all" : "board not generated yet"));
  } else if (kickMs != null && ms(board.generatedAt) != null && ms(board.generatedAt) >= kickMs) {
    stages.push(stage("BOARD", "INCONSISTENT",
      `board generatedAt ${board.generatedAt} is at or after kickoff ${kickoffUtc ?? board.kickoffUtc} — it is not a pregame record`));
  } else if (kickoffUtc != null && board.kickoffUtc != null && ms(board.kickoffUtc) != null && kickMs != null && ms(board.kickoffUtc) !== ms(kickoffUtc)) {
    /*
     * ⚠ THIS FINDING USED TO BE A WHOLE-SLATE OUTAGE. The live producer excludes a game whose board
     * and schedule disagree on kickoff — correctly, per game — but its caller escalated that to
     * `exit 2`, so one moved fixture anywhere in the forty-nine-board archive stopped live tracking
     * for every other game. The exclusion stayed; the escalation went, and the finding lives here
     * instead, where an operator reads it against the ONE game it concerns.
     */
    stages.push(stage("BOARD", "INCONSISTENT",
      `board says kickoff ${board.kickoffUtc} but the schedule says ${kickoffUtc} — this fixture is EXCLUDED from live tracking until they agree`));
  } else if (published.length === 0) {
    // Honest, and common: every family can fail its bar. There is nothing to track live.
    stages.push(stage("BOARD", "OK", "board present; no family cleared its publication bar (nothing is trackable live)"));
  } else {
    stages.push(stage("BOARD", "OK", `board present; ${published.length} published family(ies): ${published.join(", ")}`));
  }

  // ── 2 · LIVE ARTIFACT ────────────────────────────────────────────────────────────────────────
  if (!live) {
    stages.push(stage("LIVE_ARTIFACT", pastGrace ? "MISSING" : "NOT_YET",
      pastGrace ? "kicked off but no live-props artifact — the live producer never ran for this game" : "not kicked off yet"));
  } else if (liveCommitted === false) {
    /*
     * ⚠ A LOCAL SHADOW IS NOT EVIDENCE. This file's first line promises "committed artifacts only",
     * but the CLI reads a filesystem, and a live artifact left behind by a local producer run is
     * indistinguishable on disk from one the bot published. On 2026-09-26 that gap reported
     * `✓ LIVE_ARTIFACT ... frozen 2026-09-25T18:25:54Z` for all fourteen Sunday games from sixteen
     * untracked files that NO commit in the repository's history had ever touched — the handoff
     * recorded it as slate health, and a clean checkout showed `not kicked off yet` instead.
     *
     * It is INCONSISTENT rather than MISSING because the product is fine; the EVIDENCE is not. The
     * operator's action is to remove the shadow, not to chase the producer — and removing it is
     * load-bearing for a second reason: the bot commits these exact `<eventId>.json` names, and an
     * untracked file of the same name makes `git pull` abort with "untracked working tree files
     * would be overwritten", on Sunday morning, at the one moment the artifacts are wanted.
     */
    stages.push(stage("LIVE_ARTIFACT", "INCONSISTENT",
      "live artifact exists in the working tree but is NOT COMMITTED — this trace reads committed evidence only, so it is a local shadow, and its filename will block the next `git pull` of the bot's real artifact"));
  } else if (!live.frozenFrom) {
    stages.push(stage("LIVE_ARTIFACT", "INCONSISTENT", "live artifact carries no frozenFrom — the pregame provenance is unstamped"));
  } else if (pastGrace && live.phase === "PRE") {
    stages.push(stage("LIVE_ARTIFACT", "MISSING",
      `artifact exists but still says PRE ${Math.round((nowMs - kickMs) / 60000)} min after kickoff — it was not refreshed`));
  } else {
    /*
     * ⚠ THE CHECK THAT BELONGS HERE, AND THE ONE THAT DOES NOT.
     *
     * The first draft flagged any row carrying a live VALUE on a non-published family, and reported two
     * on the completed game. That was wrong, and checking rather than reporting it is the only reason
     * it is not in this file: the public player-board ALREADY carries every family's projection and
     * labels each one's state, so the live artifact repeats nothing new. Family state gates what the
     * page may CLAIM, which is a presentation rule and is held by a presentation test.
     *
     * What the artifact genuinely cannot defend is a GRADED FORECAST on a family that never cleared its
     * bar — "the side our projection implied landed" for a model we decided not to publish. `lineResult`
     * stays: the final stat against the frozen line is a fact whatever we think of our model.
     */
    const graded = (live.rows ?? []).filter((r) => {
      const fr = r?.settlement?.forecastResult ?? null;
      if (fr == null || fr === "NOT_APPLICABLE" || fr === "NOT_PUBLISHED") return false;
      const fam = r.family ?? r.familyKey;
      return (familyStateOf(r.familyState) ?? familyStates[fam] ?? null) !== "PUBLISHED";
    });
    if (graded.length > 0) {
      stages.push(stage("LIVE_ARTIFACT", "INCONSISTENT",
        `${graded.length} row(s) grade a forecast on a family the board did not publish (e.g. ${graded[0].family ?? graded[0].familyKey})`));
    } else {
      stages.push(stage("LIVE_ARTIFACT", "OK", `phase ${live.phase}, frozen from ${live.frozenFrom}, ${(live.rows ?? []).length} rows`));
    }
  }

  // ── 3 · LIVE OBSERVATION ─────────────────────────────────────────────────────────────────────
  // Did a factual live value ever actually land? An artifact that exists but never observed
  // anything is the failure mode that looks healthiest.
  const withLive = live?.counts?.withLiveStat ?? 0;
  const observedMs = ms(live?.observedAt);
  if (!started) {
    stages.push(stage("LIVE_OBSERVATION", "NOT_YET", "before kickoff — no live state exists to observe"));
  } else if (!live) {
    stages.push(stage("LIVE_OBSERVATION", pastGrace ? "MISSING" : "NOT_YET", "no live artifact to observe from"));
  } else if (published.length === 0) {
    stages.push(stage("LIVE_OBSERVATION", "OK", "no published family — zero live values is correct, not a gap"));
  } else if (observedMs != null && kickMs != null && observedMs < kickMs) {
    stages.push(stage("LIVE_OBSERVATION", "INCONSISTENT",
      `observedAt ${live.observedAt} precedes kickoff — this is a pregame read presented as live`));
  } else if (withLive === 0 && pastGrace && live.phase === "PRE") {
    /*
     * ⚠ TWO STAGES MUST NOT CONTRADICT EACH OTHER. This branch used to read "kicked off, artifact
     * refreshed, but not one live value landed" on a stale-PRE artifact — directly beside
     * LIVE_ARTIFACT saying it had NOT been refreshed. One cause, one finding: the stale artifact is
     * already reported above, so here it is only echoed as a consequence.
     */
    stages.push(stage("LIVE_OBSERVATION", "MISSING", "no live value, because the artifact above was never refreshed past PRE"));
  } else if (withLive === 0 && pastGrace) {
    stages.push(stage("LIVE_OBSERVATION", "MISSING", "kicked off, artifact refreshed, but not one live value landed"));
  } else if (withLive === 0) {
    stages.push(stage("LIVE_OBSERVATION", "NOT_YET", "just kicked off — no measurement yet"));
  } else {
    stages.push(stage("LIVE_OBSERVATION", "OK", `${withLive} live value(s) observed at ${live.observedAt}`));
  }

  // ── 4 · PROVISIONAL FINAL ────────────────────────────────────────────────────────────────────
  const rows = settlementRows ?? [];
  const provisional = rows.filter((r) => r.finality === "PROVISIONAL");
  const canonical = rows.filter((r) => r.finality === "CANONICAL");
  const isFinal = live?.phase === "FINAL";
  if (rows.length === 0) {
    stages.push(stage("FINAL_PROVISIONAL", shouldBeOver ? "MISSING" : "NOT_YET",
      shouldBeOver ? "the game should be over and no settlement row exists for it" : "game not final yet"));
  } else if (!isFinal && rows.length > 0 && live) {
    stages.push(stage("FINAL_PROVISIONAL", "INCONSISTENT",
      `${rows.length} settlement row(s) exist while the live artifact still says ${live.phase}`));
  } else {
    const unstamped = rows.filter((r) => !r.frozenIdentity);
    if (unstamped.length > 0) {
      stages.push(stage("FINAL_PROVISIONAL", "INCONSISTENT", `${unstamped.length} settlement row(s) carry no frozenIdentity`));
    } else {
      stages.push(stage("FINAL_PROVISIONAL", "OK", `${rows.length} row(s) settled (${provisional.length} provisional, ${canonical.length} canonical)`));
    }
  }

  // ── 5 · CANONICAL FINAL ──────────────────────────────────────────────────────────────────────
  // The window closes on the clock, so "still provisional" is only a defect once it has closed.
  const firstFinal = ms(live?.finalFirstObservedAt);
  const windowClosed = firstFinal != null && nowMs != null && nowMs - firstFinal >= RECONCILIATION_WINDOW_MS;
  if (rows.length === 0) {
    stages.push(stage("FINAL_CANONICAL", "NOT_YET", "nothing settled yet"));
  } else if (canonical.length === rows.length) {
    stages.push(stage("FINAL_CANONICAL", "OK", `all ${rows.length} row(s) canonical`));
  } else if (windowClosed) {
    stages.push(stage("FINAL_CANONICAL", "MISSING",
      `reconciliation window closed at ${new Date(firstFinal + RECONCILIATION_WINDOW_MS).toISOString()} but ${provisional.length} row(s) are still provisional`));
  } else {
    stages.push(stage("FINAL_CANONICAL", "NOT_YET",
      firstFinal != null ? "reconciliation window still open — a late stat or correction can still arrive" : "no first-final instant recorded yet"));
  }

  // ── 6 · RESULTS ──────────────────────────────────────────────────────────────────────────────
  if (inResults) {
    stages.push(stage("RESULTS", "OK", "carried on the public results surface"));
  } else {
    stages.push(stage("RESULTS", shouldBeOver ? "MISSING" : "NOT_YET",
      shouldBeOver ? "the game should be over and it does not appear in public results" : "game not complete"));
  }

  const actionable = stages.filter((s) => ACTIONABLE.includes(s.state));
  return {
    providerEventId,
    matchup: matchup ?? board?.matchup ?? live?.matchup ?? null,
    kickoffUtc: kickoffUtc ?? board?.kickoffUtc ?? live?.kickoffUtc ?? null,
    started,
    stages,
    verdict: actionable.length === 0
      ? (stages.every((s) => s.state === "OK") ? "CLEAN" : "IN_FLIGHT")
      : "ATTENTION",
  };
}

/**
 * Fold a slate of traces into one answer.
 *
 * ⚠ NO_GAMES IS A RESULT. A Tuesday in the NFL season has no games, and a trace that reports that as
 * a failure is a trace nobody reads by week four.
 */
export function foldTraces(traces) {
  if (traces.length === 0) return { state: "NO_GAMES", games: 0, clean: 0, inFlight: 0, attention: 0, traces };
  const clean = traces.filter((t) => t.verdict === "CLEAN").length;
  const inFlight = traces.filter((t) => t.verdict === "IN_FLIGHT").length;
  const attention = traces.filter((t) => t.verdict === "ATTENTION").length;
  return {
    state: attention > 0 ? "ATTENTION" : inFlight > 0 ? "IN_FLIGHT" : "CLEAN",
    games: traces.length,
    clean,
    inFlight,
    attention,
    traces,
  };
}
